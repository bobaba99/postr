/**
 * Presentation Checker critique router (spec §4.5, §5.2, §5.3).
 *
 * POST /api/review/critique — INITIAL critique flow:
 *   body: { sourceKind, pages, posterDoc?, posterId?, filename? }
 *   out:  200 { reviewId, stage: 'initial', critique: CritiqueResult }
 *
 * Pipeline: zod validation → 24-page hard cap (§1: typed error, never
 * silent truncation) → server-side entitlement resolution (D4:
 * term-active add-on → weekly window → pack credits → 402) →
 * SSRF-guarded page fetch → two-stage rubric critique → deterministic
 * enforce → transactional credit spend + poster_reviews insert AFTER
 * success (D6/D16). A browser request key claims provider work and
 * replays the stored initial result on an ambiguous retry.
 *
 * POST /api/review/critique — FOLLOW-UP flow (body.reviewId set):
 * a diff critique against the stored initial findings, then the review
 * closes (stage 'closed' is terminal, enforced HERE, not just hidden
 * in UI). Included in the initial credit: no entitlement check, no
 * second consume, no second weekly slot (§5.2/§5.3, D6). Ownership is
 * checked MANUALLY — the service_role client bypasses the table's
 * owner-SELECT RLS (D3).
 *
 * Stack mirrors the import/narrative routers: requireAuth (anonymous
 * sessions accepted) → rate limit → zod → provider call → generic
 * client-facing errors. API keys never leave the server. All
 * poster_reviews writes use the service_role client — the table's RLS
 * is owner SELECT-only (D3).
 *
 * Cost instrumentation (§6.2.4): every completed critique logs its
 * token usage with the [review.critique] tag so the pack price and the
 * weekly quota are set from real numbers.
 */
import { randomUUID } from 'node:crypto';
import express, {
  type Request,
  type Response,
  type Router,
} from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { z } from 'zod';
import type { CritiqueResult, ReviewPageRef } from '@postr/shared';
import { requireAuth, type AuthLocals } from './auth.js';
import { checkImageUrl } from './imageUrlGuard.js';
import { createRateLimiter } from './rateLimit.js';
import {
  REVIEW_ADDON_WEEKLY_QUOTA,
  REVIEW_IMAGE_MAX_BYTES,
  REVIEW_MAX_PAGES,
  REVIEW_MODEL,
  REVIEW_PPTX_MAX_CONCURRENT_RENDERS,
  REVIEW_PPTX_MAX_BYTES,
  REVIEW_SIGNED_URL_TTL_SEC,
} from './review/config.js';
import {
  createLibreOfficeRenderer,
  inspectPptxArchive,
  PptxArchiveError,
  PptxTooLargeError,
  readPptxResponse,
  type PptxRenderer,
  type RenderedPage,
} from './review/pptx.js';
import { CURRENT_RUBRIC_VERSION } from './review/rubric/index.js';
import { computeReviewSignals } from './review/signals.js';
import {
  buildFollowupUserMessage,
  buildInitialUserMessage,
  composeReviewSystemPrompt,
} from './review/prompt.js';
import { fetchReviewPages, PageFetchError, type FetchedPage } from './review/fetchPages.js';
import {
  callAnthropicCritique,
  CritiqueUpstreamError,
  type CritiqueCallResult,
} from './review/critique.js';
import { enforceFindings } from './review/enforce.js';
import { validateCritique } from './review/schema.js';

// ─────────────────────────────────────────────────────────────────────
// Request schema
// ─────────────────────────────────────────────────────────────────────

const PageRefInput = z.object({
  pageNumber: z.number().int().min(1),
  url: z.string().url(),
  widthPx: z.number().int().min(1),
  heightPx: z.number().int().min(1),
  storagePath: z.string().min(1).max(1024).optional(),
});

// Light envelope only — the client is first-party, so full PosterDoc
// validation is deferred. enforce.ts drops block anchors that don't
// resolve against these ids, so a malformed doc degrades to
// region/slide anchors, never to a crash.
const PosterDocEnvelope = z
  .object({
    version: z.literal(1),
    blocks: z.array(
      z
        .object({
          id: z.string(),
          type: z.string(),
          content: z.string().nullish(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const CritiqueRequest = z.object({
  sourceKind: z.enum(['postr', 'pdf', 'pptx', 'image']),
  // No .max() here — over the cap must be the typed `too_many_pages`
  // error (§1), not a generic bad_request.
  pages: z.array(PageRefInput).min(1),
  posterDoc: PosterDocEnvelope.optional(),
  posterId: z.string().uuid().optional(),
  reviewId: z.string().uuid().optional(),
  /** Browser-generated idempotency key for one logical initial review. */
  requestKey: z.string().uuid().optional(),
  filename: z.string().max(255).optional(),
});

type CritiqueBody = z.infer<typeof CritiqueRequest>;

type ReviewAuthLocals = AuthLocals & {
  /** Another request still owns these temp pages; polling must not delete them. */
  deferReviewTempCleanup?: boolean;
};

const RenderPptxRequest = z.object({
  fileUrl: z.string().url(),
});

// ─────────────────────────────────────────────────────────────────────
// Router factory
// ─────────────────────────────────────────────────────────────────────

export interface ReviewRouterDeps {
  getSupabaseAdmin?: () => SupabaseClient | null;
  getAnthropic?: () => Anthropic | null;
  fetchFn?: typeof fetch;
  now?: () => number;
  /** PPTX render seam (Task 18). Default: LibreOffice headless via review/pptx.ts. */
  getPptxRenderer?: () => PptxRenderer;
}

/** Built per call — createLibreOfficeRenderer() is a cheap closure. */
function defaultGetPptxRenderer(): PptxRenderer {
  return createLibreOfficeRenderer();
}

let activePptxRenders = 0;

function tryAcquirePptxRenderLease(): (() => void) | null {
  if (activePptxRenders >= REVIEW_PPTX_MAX_CONCURRENT_RENDERS) {
    return null;
  }

  activePptxRenders++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activePptxRenders--;
  };
}

export function createReviewRouter(deps: ReviewRouterDeps = {}): Router {
  const router = express.Router();
  const getSupabase = deps.getSupabaseAdmin ?? defaultGetSupabaseAdmin;
  const getAnthropic = deps.getAnthropic ?? defaultGetAnthropic;
  const getPptxRenderer = deps.getPptxRenderer ?? defaultGetPptxRenderer;
  const fetchFn = deps.fetchFn ?? fetch;
  const now = deps.now ?? Date.now;

  router.post(
    '/api/review/critique',
    requireAuth(getSupabase),
    // 8/min leaves room for the included follow-up plus the full four-review
    // add-on sequence; 20/day still bounds the per-user LLM bill.
    createRateLimiter({ maxPerWindow: 8, maxPerDay: 20 }),
    async (req: Request, res: Response) => {
      const parsed = CritiqueRequest.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'bad_request', details: parsed.error.flatten() });
      }
      const body = parsed.data;

      const supabase = getSupabase();
      if (!supabase) {
        return res.status(500).json({
          error: 'supabase_not_configured',
          message: 'SUPABASE_URL and SUPABASE_SECRET_KEY must both be set for review.',
        });
      }
      const locals = res.locals as ReviewAuthLocals;
      const user = locals.user;

      // Every valid request owns the lifecycle of its rendered temp pages.
      // Keep cleanup outside the entitlement/fetch/model branches so 402s,
      // closed follow-ups, fetch failures, and provider failures cannot leak
      // user-owned review-temp objects. Cleanup is path-scoped and best-effort.
      try {
        // Hard page cap (§1): a typed error, never a silent truncation.
        if (body.pages.length > REVIEW_MAX_PAGES) {
          return res
            .status(400)
            .json({ error: 'too_many_pages', maxPages: REVIEW_MAX_PAGES });
        }

        const anthropic = getAnthropic();

        return await (body.reviewId
          ? anthropic
            ? runFollowup({ res, supabase, anthropic, fetchFn, now, user, body })
            : res.status(500).json({
                error: 'provider_not_configured',
                message: 'ANTHROPIC_API_KEY is missing on the server.',
              })
          : runInitial({
              res,
              supabase,
              anthropic,
              fetchFn,
              now,
              user,
              body,
            }));
      } finally {
        if (!locals.deferReviewTempCleanup) {
          await cleanupFetchedReviewTempPages(supabase, user.id, body.pages);
        }
      }
    },
  );

  // ── Render an uploaded .pptx to page JPEGs (D10). No credit is consumed
  //    here — this is an ingest utility; the critique route charges. The
  //    .pptx is re-fetched through the same SSRF guard as import images.
  router.post(
    '/api/review/render-pptx',
    requireAuth(getSupabase, { requirePermanent: true }),
    // Conversion is CPU-heavy (LibreOffice) — a tight burst + daily cap.
    createRateLimiter({ maxPerWindow: 2, maxPerDay: 10 }),
    async (req: Request, res: Response) => {
      const parsed = RenderPptxRequest.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: 'bad_request', details: parsed.error.flatten() });
      }
      const { fileUrl } = parsed.data;

      const supabase = getSupabase();
      if (!supabase) {
        return res.status(500).json({
          error: 'supabase_not_configured',
          message: 'SUPABASE_URL and SUPABASE_SECRET_KEY must both be set.',
        });
      }

      // SSRF guard: only ever fetch our own Supabase Storage host.
      const urlCheck = checkImageUrl(fileUrl, process.env.SUPABASE_URL);
      if (!urlCheck.ok) {
        if (urlCheck.reason === 'allowlist_not_configured') {
          return res.status(500).json({
            error: 'supabase_not_configured',
            message: 'SUPABASE_URL must be set to validate file sources.',
          });
        }
        return res.status(400).json({
          error: 'url_not_allowed',
          message: 'fileUrl must be an https URL on the project storage host.',
        });
      }

      // Re-fetch the .pptx server-side. Redirects are refused outright —
      // the host allowlist is worthless if the allowed host can 302 to an
      // internal address.
      let pptx: Buffer;
      try {
        const r = await fetchFn(fileUrl, {
          signal: AbortSignal.timeout(30_000),
          redirect: 'error',
        });
        if (!r.ok) {
          return res
            .status(502)
            .json({ error: 'file_fetch_failed', status: r.status });
        }
        pptx = await readPptxResponse(r, REVIEW_PPTX_MAX_BYTES);
      } catch (err) {
        if (err instanceof PptxTooLargeError) {
          return res.status(413).json({ error: 'pptx_too_large' });
        }
        const message = err instanceof Error ? err.message : 'unknown';
        return res.status(502).json({ error: 'file_fetch_failed', message });
      }

      try {
        inspectPptxArchive(pptx, REVIEW_MAX_PAGES);
      } catch (err) {
        if (err instanceof PptxArchiveError) {
          return res.status(400).json({ error: err.code });
        }
        throw err;
      }

      const releasePptxRenderLease = tryAcquirePptxRenderLease();
      if (!releasePptxRenderLease) {
        res.setHeader('Retry-After', '5');
        return res.status(503).json({
          error: 'pptx_render_busy',
          message: 'Presentation conversion is busy. Try again shortly.',
        });
      }

      let rendered: RenderedPage[];
      try {
        rendered = await getPptxRenderer().render(pptx);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown';
        // eslint-disable-next-line no-console
        console.error('[review.render-pptx] render failed:', message);
        return res.status(502).json({ error: 'pptx_render_failed' });
      } finally {
        releasePptxRenderLease();
      }

      if (rendered.length === 0) {
        return res.status(502).json({
          error: 'pptx_render_failed',
          message: 'The deck produced no pages.',
        });
      }
      // Hard page cap (spec §1) — never silently truncate.
      if (rendered.length > REVIEW_MAX_PAGES) {
        return res.status(400).json({
          error: 'too_many_pages',
          message: `Presentation Checker accepts at most ${REVIEW_MAX_PAGES} pages — trim the deck and try again.`,
        });
      }

      // Persist each page JPEG to the user's review-temp batch and mint
      // short-lived signed URLs for the client + the critique page fetcher.
      const user = (res.locals as AuthLocals).user;
      const batchId = randomUUID();
      const pages: ReviewPageRef[] = [];
      const uploadedPaths: string[] = [];
      for (const page of rendered) {
        const path = `${user.id}/review-temp/${batchId}/page-${page.pageNumber}.jpg`;
        const { error: uploadErr } = await supabase.storage
          .from('poster-assets')
          .upload(path, page.jpeg, { contentType: 'image/jpeg' });
        if (uploadErr) {
          // eslint-disable-next-line no-console
          console.error('[review.render-pptx] page upload failed:', uploadErr.message);
          await bestEffortRemoveStoragePaths(
            supabase,
            uploadedPaths,
            'review.render-pptx rollback',
          );
          return res.status(502).json({ error: 'page_upload_failed' });
        }
        uploadedPaths.push(path);
        const { data: signed, error: signErr } = await supabase.storage
          .from('poster-assets')
          .createSignedUrl(path, REVIEW_SIGNED_URL_TTL_SEC);
        if (signErr || !signed?.signedUrl) {
          // eslint-disable-next-line no-console
          console.error('[review.render-pptx] sign failed:', signErr?.message);
          await bestEffortRemoveStoragePaths(
            supabase,
            uploadedPaths,
            'review.render-pptx rollback',
          );
          return res.status(502).json({ error: 'page_upload_failed' });
        }
        pages.push({
          pageNumber: page.pageNumber,
          url: signed.signedUrl,
          widthPx: page.widthPx,
          heightPx: page.heightPx,
          storagePath: path,
        });
      }

      return res.json({ pages });
    },
  );

  return router;
}

async function bestEffortRemoveStoragePaths(
  supabase: SupabaseClient,
  paths: string[],
  logTag: string,
): Promise<void> {
  if (paths.length === 0) return;
  try {
    const { error } = await supabase.storage
      .from('poster-assets')
      .remove(paths);
    if (error) {
      // eslint-disable-next-line no-console
      console.error(`[${logTag}] temp cleanup failed:`, error.message);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[${logTag}] temp cleanup crashed:`,
      err instanceof Error ? err.message : 'unknown',
    );
  }
}

async function cleanupFetchedReviewTempPages(
  supabase: SupabaseClient,
  userId: string,
  pages: CritiqueBody['pages'],
): Promise<void> {
  const paths = [
    ...new Set(
      pages
        .map((page) => page.storagePath)
        .filter(
          (path): path is string =>
            typeof path === 'string' && isOwnedReviewTempPath(path, userId),
        ),
    ),
  ];
  await bestEffortRemoveStoragePaths(
    supabase,
    paths,
    'review.critique cleanup',
  );
}

function isOwnedReviewTempPath(path: string, userId: string): boolean {
  const segments = path.split('/');
  return (
    segments.length >= 4 &&
    segments[0] === userId &&
    segments[1] === 'review-temp' &&
    segments.every(
      (segment) => segment.length > 0 && segment !== '.' && segment !== '..',
    )
  );
}

// ─────────────────────────────────────────────────────────────────────
// Initial critique
// ─────────────────────────────────────────────────────────────────────

interface InitialCtx {
  res: Response;
  supabase: SupabaseClient;
  anthropic: Anthropic | null;
  fetchFn: typeof fetch;
  now: () => number;
  user: User;
  body: CritiqueBody;
}

type InitialReviewRpcResult =
  | { outcome: 'claimed'; claimToken: string; expiresAt: string }
  | {
      outcome:
        | 'in_progress'
        | 'no_credit'
        | 'claim_missing'
        | 'poster_not_owned';
    }
  | {
      outcome: 'complete' | 'replay';
      reviewId: string;
      stage: 'initial' | 'closed';
      critique: CritiqueResult;
    };

type ReviewAddonSlotRpcResult =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number };

function parseReviewAddonSlotRpcResult(
  raw: unknown,
): ReviewAddonSlotRpcResult | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (value.allowed === true) return { allowed: true };
  if (
    value.allowed === false &&
    Number.isSafeInteger(value.retryAfterSec) &&
    (value.retryAfterSec as number) >= 1
  ) {
    return {
      allowed: false,
      retryAfterSec: value.retryAfterSec as number,
    };
  }
  return null;
}

function parseInitialReviewRpcResult(raw: unknown): InitialReviewRpcResult | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (value.outcome === 'claimed') {
    if (
      typeof value.claimToken !== 'string' ||
      typeof value.expiresAt !== 'string'
    ) {
      return null;
    }
    return {
      outcome: 'claimed',
      claimToken: value.claimToken,
      expiresAt: value.expiresAt,
    };
  }
  if (
    value.outcome === 'in_progress' ||
    value.outcome === 'no_credit' ||
    value.outcome === 'claim_missing' ||
    value.outcome === 'poster_not_owned'
  ) {
    return { outcome: value.outcome };
  }
  if (value.outcome !== 'complete' && value.outcome !== 'replay') return null;
  if (typeof value.reviewId !== 'string') return null;
  if (value.stage !== 'initial' && value.stage !== 'closed') return null;
  const critique = validateCritique(value.critique);
  if (!critique) return null;
  return {
    outcome: value.outcome,
    reviewId: value.reviewId,
    stage: value.stage,
    critique,
  };
}

async function releaseInitialReviewClaim(
  supabase: SupabaseClient,
  userId: string,
  requestKey: string,
  claimToken: string,
): Promise<void> {
  try {
    const { error } = await supabase.rpc(
      'release_initial_review' as never,
      {
        p_user_id: userId,
        p_request_key: requestKey,
        p_claim_token: claimToken,
      } as never,
    );
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[review.critique] release_initial_review rpc failed', {
        userId,
        requestKey,
        message: error.message,
      });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[review.critique] release_initial_review rpc crashed', {
      userId,
      requestKey,
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
}

async function runInitial(ctx: InitialCtx): Promise<Response> {
  const { res, supabase, anthropic, fetchFn, now, user, body } = ctx;
  // Legacy first-party callers that predate requestKey remain functional,
  // while the web client always supplies and reuses its own key on retry.
  const requestKey = body.requestKey ?? randomUUID();

  const { data: claimRaw, error: claimErr } = await supabase.rpc(
    'claim_initial_review' as never,
    { p_user_id: user.id, p_request_key: requestKey } as never,
  );
  const claim = parseInitialReviewRpcResult(claimRaw);
  if (claimErr || !claim) {
    // eslint-disable-next-line no-console
    console.error('[review.critique] claim_initial_review rpc failed', {
      userId: user.id,
      requestKey,
      message: claimErr?.message ?? 'invalid rpc response',
    });
    return res.status(500).json({ error: 'review_internal' });
  }
  if (claim.outcome === 'replay') {
    return res.status(200).json({
      reviewId: claim.reviewId,
      stage: claim.stage,
      critique: claim.critique,
    });
  }
  if (claim.outcome === 'in_progress') {
    (res.locals as ReviewAuthLocals).deferReviewTempCleanup = true;
    return res.status(409).json({ error: 'review_in_progress' });
  }
  if (claim.outcome !== 'claimed') {
    return res.status(500).json({ error: 'review_internal' });
  }
  const { claimToken } = claim;

  let claimSettled = false;
  try {
    if (!anthropic) {
      return res.status(500).json({
        error: 'provider_not_configured',
        message: 'ANTHROPIC_API_KEY is missing on the server.',
      });
    }

    // ── Entitlement (D4): resolved server-side, never client-chosen.
    const entitlement = await resolveEntitlement(supabase, user.id);
    if (!entitlement.ok) {
      // eslint-disable-next-line no-console
      console.error('[review.critique] entitlement lookup failed', {
        userId: user.id,
        message: entitlement.message,
      });
      return res.status(500).json({ error: 'review_internal' });
    }
    const { row } = entitlement;

    let creditSource: 'pack' | 'subscription_addon';
    if (row.review_addon === true && isTermActive(row, now())) {
      // The claim above makes same-key replays free. A fresh active add-on
      // request then consumes one persistent slot before page/provider work;
      // later provider failure intentionally does not refund it (D17).
      let slotRaw: unknown;
      let slotError: { message?: string } | null = null;
      try {
        const response = await supabase.rpc(
          'consume_review_addon_slot' as never,
          {
            p_user_id: user.id,
            p_quota: REVIEW_ADDON_WEEKLY_QUOTA,
          } as never,
        );
        slotRaw = response.data;
        slotError = response.error;
      } catch (err) {
        slotError = {
          message: err instanceof Error ? err.message : 'quota rpc crashed',
        };
      }
      const slot = parseReviewAddonSlotRpcResult(slotRaw);
      if (slotError || !slot) {
        // eslint-disable-next-line no-console
        console.error('[review.critique] consume_review_addon_slot rpc failed', {
          userId: user.id,
          message: slotError?.message ?? 'invalid rpc response',
        });
        return res.status(500).json({ error: 'review_internal' });
      }
      if (!slot.allowed) {
        res.setHeader('Retry-After', String(slot.retryAfterSec));
        return res.status(402).json({
          error: 'review_payment_required',
          reason: 'weekly_quota_exceeded',
          retryAfterSec: slot.retryAfterSec,
        });
      }
      creditSource = 'subscription_addon';
    } else if ((row.review_credits ?? 0) > 0) {
      creditSource = 'pack';
    } else {
      return res.status(402).json({
        error: 'review_payment_required',
        reason: 'no_credit',
      });
    }

    // ── Fetch the page bytes (SSRF-guarded inside fetchReviewPages).
    let fetched: FetchedPage[];
    try {
      fetched = await fetchReviewPages(body.pages, {
        supabaseUrl: process.env.SUPABASE_URL,
        fetchFn,
        maxBytes: REVIEW_IMAGE_MAX_BYTES,
      });
    } catch (err) {
      return replyPageFetchError(res, err);
    }

    const signals = body.posterDoc
      ? computeReviewSignals(body.posterDoc.blocks)
      : undefined;

    let callResult: CritiqueCallResult;
    try {
      callResult = await callAnthropicCritique(anthropic, {
        systemPrompt: composeReviewSystemPrompt(),
        userMessage: buildInitialUserMessage({
          pageCount: body.pages.length,
          sourceKind: body.sourceKind,
          signals,
          posterDocPresent: body.posterDoc !== undefined,
        }),
        pages: fetched,
      });
    } catch (err) {
      return replyCritiqueError(res, err, {
        userId: user.id,
        stage: 'initial',
      });
    }
    const { critique, usage } = callResult;

    // Deterministic grounding (§4.5): the prompt asks, this guarantees.
    const enforced: CritiqueResult = {
      ...critique,
      findings: enforceFindings(critique.findings, {
        blockIds: body.posterDoc
          ? new Set(body.posterDoc.blocks.map((b) => b.id))
          : undefined,
        pageCount: body.pages.length,
      }),
    };

    // §6.2.4 cost instrumentation — real numbers set the pack price.
    // eslint-disable-next-line no-console
    console.log('[review.critique] critique done', {
      userId: user.id,
      stage: 'initial',
      creditSource,
      model: REVIEW_MODEL,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      findings: enforced.findings.length,
    });

    // The decrement and insert happen in one database transaction. If the
    // insert (including its poster FK) fails, Postgres rolls the spend back.
    const { data: finalRaw, error: finalErr } = await supabase.rpc(
      'finalize_initial_review' as never,
      {
        p_user_id: user.id,
        p_request_key: requestKey,
        p_claim_token: claimToken,
        p_poster_id: body.posterId ?? null,
        p_source_kind: body.sourceKind,
        p_source_meta: {
          pageCount: body.pages.length,
          rubric_version: CURRENT_RUBRIC_VERSION,
          model: REVIEW_MODEL,
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          ...(body.filename ? { filename: body.filename } : {}),
        },
        p_initial_findings: enforced,
        p_credit_source: creditSource,
      } as never,
    );
    const finalized = parseInitialReviewRpcResult(finalRaw);
    if (finalErr || !finalized) {
      // eslint-disable-next-line no-console
      console.error('[review.critique] finalize_initial_review rpc failed', {
        userId: user.id,
        requestKey,
        message: finalErr?.message ?? 'invalid rpc response',
      });
      return res.status(500).json({ error: 'review_internal' });
    }
    if (finalized.outcome === 'no_credit') {
      claimSettled = true;
      return res.status(402).json({
        error: 'review_payment_required',
        reason: 'no_credit',
      });
    }
    if (finalized.outcome === 'poster_not_owned') {
      claimSettled = true;
      return res.status(403).json({ error: 'not_poster_owner' });
    }
    if (
      finalized.outcome !== 'complete' &&
      finalized.outcome !== 'replay'
    ) {
      return res.status(500).json({ error: 'review_internal' });
    }

    claimSettled = true;
    return res.status(200).json({
      reviewId: finalized.reviewId,
      stage: finalized.stage,
      critique: finalized.critique,
    });
  } finally {
    if (!claimSettled) {
      await releaseInitialReviewClaim(
        supabase,
        user.id,
        requestKey,
        claimToken,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// Follow-up critique (§5.2)
// ─────────────────────────────────────────────────────────────────────

interface ReviewRow {
  id: string;
  user_id: string;
  status: 'pending' | 'complete' | 'failed';
  stage: 'initial' | 'followup' | 'closed';
  initial_findings: CritiqueResult | null;
}

interface FollowupCtx {
  res: Response;
  supabase: SupabaseClient;
  anthropic: Anthropic;
  fetchFn: typeof fetch;
  now: () => number;
  user: User;
  body: CritiqueBody;
}

/**
 * One follow-up per review: judge the revised artifact AGAINST the
 * stored initial findings ("did they address these? what's still
 * open?"), then close the review. Included in the initial credit —
 * no entitlement check, no consume, no weekly slot (D6).
 */
async function runFollowup(ctx: FollowupCtx): Promise<Response> {
  const { res, supabase, anthropic, fetchFn, now, user, body } = ctx;
  const reviewId = body.reviewId!;

  // The API reads/writes poster_reviews through the service_role
  // client, which BYPASSES the table's owner-SELECT RLS (D3).
  // Ownership is therefore enforced HERE, manually — without this
  // check any authenticated user could drive another user's review
  // by id.
  const { data: reviewRaw, error: loadErr } = await supabase
    .from('poster_reviews')
    .select('id, user_id, status, stage, initial_findings')
    .eq('id', reviewId)
    .maybeSingle();
  if (loadErr) {
    // eslint-disable-next-line no-console
    console.error('[review.critique] review load failed', {
      reviewId,
      message: loadErr.message,
    });
    return res.status(500).json({ error: 'review_internal' });
  }
  const review = reviewRaw as unknown as ReviewRow | null;
  if (!review) {
    return res.status(404).json({ error: 'review_not_found' });
  }
  if (review.user_id !== user.id) {
    return res.status(403).json({ error: 'not_review_owner' });
  }
  // `closed` is terminal (§5.2): a further critique needs a new credit.
  if (review.stage !== 'initial') {
    return res.status(409).json({ error: 'review_closed' });
  }
  if (review.status !== 'complete' || !review.initial_findings) {
    return res.status(409).json({ error: 'review_not_complete' });
  }

  // Claim the one included follow-up BEFORE fetching pages or calling the
  // model. The stage predicate makes this a compare-and-set: even when two
  // requests both loaded `initial` above, only one can transition it to
  // `followup`; the loser never reaches billable work.
  const { data: claimedRaw, error: claimErr } = await supabase
    .from('poster_reviews')
    .update({
      stage: 'followup',
      updated_at: new Date(now()).toISOString(),
    })
    .eq('id', reviewId)
    .eq('user_id', user.id)
    .eq('status', 'complete')
    .eq('stage', 'initial')
    .select('id')
    .maybeSingle();
  if (claimErr) {
    // eslint-disable-next-line no-console
    console.error('[review.critique] follow-up claim failed', {
      reviewId,
      message: claimErr.message,
    });
    return res.status(500).json({ error: 'review_internal' });
  }
  if (!claimedRaw) {
    return res.status(409).json({ error: 'review_closed' });
  }

  let closed = false;
  try {
    // Fetch the REVISED pages (SSRF-guarded inside fetchReviewPages).
    let fetched: FetchedPage[];
    try {
      fetched = await fetchReviewPages(body.pages, {
        supabaseUrl: process.env.SUPABASE_URL,
        fetchFn,
        maxBytes: REVIEW_IMAGE_MAX_BYTES,
      });
    } catch (err) {
      return replyPageFetchError(res, err);
    }

    const signals = body.posterDoc ? computeReviewSignals(body.posterDoc.blocks) : undefined;

    let callResult: CritiqueCallResult;
    try {
      callResult = await callAnthropicCritique(anthropic, {
        systemPrompt: composeReviewSystemPrompt(),
        userMessage: buildFollowupUserMessage({
          initialFindings: review.initial_findings,
          pageCount: body.pages.length,
          sourceKind: body.sourceKind,
          signals,
        }),
        pages: fetched,
      });
    } catch (err) {
      return replyCritiqueError(res, err, {
        userId: user.id,
        reviewId,
        stage: 'followup',
      });
    }
    const { critique, usage } = callResult;

    const enforced: CritiqueResult = {
      ...critique,
      findings: enforceFindings(critique.findings, {
        blockIds: body.posterDoc ? new Set(body.posterDoc.blocks.map((b) => b.id)) : undefined,
        pageCount: body.pages.length,
      }),
    };

    // §6.2.4 cost instrumentation — follow-ups are part of the true
    // cost per review credit.
    // eslint-disable-next-line no-console
    console.log('[review.critique] critique done', {
      userId: user.id,
      reviewId,
      stage: 'followup',
      model: REVIEW_MODEL,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      findings: enforced.findings.length,
    });

    // Store findings only while this request still owns the `followup`
    // claim. Returning the row proves the conditional close happened.
    const { data: closedRaw, error: updateErr } = await supabase
      .from('poster_reviews')
      .update({
        followup_findings: enforced,
        stage: 'closed',
        updated_at: new Date(now()).toISOString(),
      })
      .eq('id', reviewId)
      .eq('user_id', user.id)
      .eq('status', 'complete')
      .eq('stage', 'followup')
      .select('id')
      .maybeSingle();
    if (updateErr || !closedRaw) {
      // eslint-disable-next-line no-console
      console.error('[review.critique] follow-up update failed', {
        reviewId,
        message: updateErr?.message ?? 'claim no longer owned',
      });
      return res.status(500).json({ error: 'review_internal' });
    }

    closed = true;
    return res.status(200).json({ reviewId, stage: 'closed', critique: enforced });
  } finally {
    if (!closed) {
      await rollbackFollowupClaim(supabase, reviewId, user.id, now);
    }
  }
}

async function rollbackFollowupClaim(
  supabase: SupabaseClient,
  reviewId: string,
  userId: string,
  now: () => number,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('poster_reviews')
      .update({
        stage: 'initial',
        updated_at: new Date(now()).toISOString(),
      })
      .eq('id', reviewId)
      .eq('user_id', userId)
      .eq('status', 'complete')
      .eq('stage', 'followup');
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[review.critique] follow-up claim rollback failed', {
        reviewId,
        message: error.message,
      });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[review.critique] follow-up claim rollback crashed', {
      reviewId,
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
}

// ─────────────────────────────────────────────────────────────────────
// Entitlement helpers (D4)
// ─────────────────────────────────────────────────────────────────────

interface EntitlementRow {
  review_credits: number | null;
  review_addon: boolean | null;
  plan: string | null;
  plan_expires_at: string | null;
  subscription_status: string | null;
}

async function resolveEntitlement(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ ok: true; row: EntitlementRow } | { ok: false; message: string }> {
  const { data, error } = await supabase
    .from('users')
    .select('review_credits, review_addon, plan, plan_expires_at, subscription_status')
    .eq('id', userId)
    .single();
  if (error || !data) return { ok: false, message: error?.message ?? 'users row missing' };
  return { ok: true, row: data as unknown as EntitlementRow };
}

/** D4: term-active = plan 'term' + expiry in the future + status non-terminal. */
function isTermActive(row: EntitlementRow, nowMs: number): boolean {
  if (row.plan !== 'term') return false;
  if (!row.plan_expires_at) return false;
  const expiresMs = new Date(row.plan_expires_at).getTime();
  if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) return false;
  return !['canceled', 'unpaid', 'incomplete_expired'].includes(row.subscription_status ?? '');
}

// ─────────────────────────────────────────────────────────────────────
// Error mapping
// ─────────────────────────────────────────────────────────────────────

function replyPageFetchError(res: Response, err: unknown): Response {
  if (err instanceof PageFetchError) {
    if (err.code === 'too_large') {
      return res.status(413).json({ error: 'image_too_large' });
    }
    // url_not_allowed | fetch_failed | unsupported_media — the typed
    // code IS the client-facing error string.
    return res.status(400).json({ error: err.code });
  }
  // eslint-disable-next-line no-console
  console.error('[review.critique] page fetch crashed', {
    message: err instanceof Error ? err.message : 'unknown',
  });
  return res.status(500).json({ error: 'review_internal' });
}

function replyCritiqueError(
  res: Response,
  err: unknown,
  logCtx: Record<string, unknown>,
): Response {
  const upstream = err instanceof CritiqueUpstreamError ? err : null;
  // eslint-disable-next-line no-console
  console.error('[review.critique] critique failed', {
    ...logCtx,
    code: upstream?.code,
    status: upstream?.status,
    message: err instanceof Error ? err.message : 'unknown',
  });
  // No/invalid structured output is distinct from a transport failure
  // so the client can message it honestly.
  if (upstream && (upstream.code === 'no_tool_call' || upstream.code === 'bad_tool_json')) {
    return res.status(502).json({ error: 'bad_model_output', message: upstream.code });
  }
  // 401/429/529 pass through so the client can react (back off on
  // 429); everything else is a generic 502. Raw upstream text stays in
  // the server log.
  const status = upstream?.code === 'http_error' ? upstream.status : undefined;
  const passthrough = status === 401 || status === 429 || status === 529 ? status : 502;
  return res.status(passthrough).json({ error: 'review_upstream' });
}

// ─────────────────────────────────────────────────────────────────────
// Default factories
// ─────────────────────────────────────────────────────────────────────

function defaultGetSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function defaultGetAnthropic(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}
