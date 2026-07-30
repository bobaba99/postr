/**
 * Presentation Checker critique router (spec §4.5, §5.2, §5.3).
 *
 * POST /api/review/critique — INITIAL critique flow:
 *   body: { sourceKind, pages, posterDoc?, posterId?, filename? }
 *   out:  200 { reviewId, stage: 'initial', critique: CritiqueResult }
 *
 * Pipeline: zod validation → 24-page hard cap (§1: typed error, never
 * silent truncation) → server-side entitlement resolution (D4:
 * term-active add-on / pack credits / 402) → SSRF-guarded page fetch →
 * add-on weekly window (deferred past ingest so a page failure burns no
 * slot) → two-stage rubric critique → deterministic enforce → credit
 * consume AFTER success (D6) → single poster_reviews write
 * (success-only, D16; a persistence failure after a pack consume
 * compensates the credit back).
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
import express, {
  type Request,
  type RequestHandler,
  type Response,
  type Router,
} from 'express';
import { randomUUID } from 'node:crypto';
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
  REVIEW_PPTX_MAX_BYTES,
  REVIEW_SIGNED_URL_TTL_SEC,
} from './review/config.js';
import {
  createLibreOfficeRenderer,
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

// ─────────────────────────────────────────────────────────────────────
// Request schema
// ─────────────────────────────────────────────────────────────────────

const PageRefInput = z.object({
  pageNumber: z.number().int().min(1),
  url: z.string().url(),
  widthPx: z.number().int().min(1),
  heightPx: z.number().int().min(1),
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
  // uuid-gated: a malformed id 400s HERE rather than 500ing on the
  // Postgres uuid cast in the follow-up's poster_reviews lookup.
  reviewId: z.string().uuid().optional(),
  filename: z.string().max(255).optional(),
});

type CritiqueBody = z.infer<typeof CritiqueRequest>;

// ─────────────────────────────────────────────────────────────────────
// Router factory
// ─────────────────────────────────────────────────────────────────────

export interface ReviewRouterDeps {
  getSupabaseAdmin?: () => SupabaseClient | null;
  getAnthropic?: () => Anthropic | null;
  fetchFn?: typeof fetch;
  /** Add-on weekly window; default built per D5. */
  weeklyLimiter?: RequestHandler;
  now?: () => number;
  /** PPTX render seam (Task 18). Default: LibreOffice headless via review/pptx.ts. */
  getPptxRenderer?: () => PptxRenderer;
}

/** Built per call — createLibreOfficeRenderer() is a cheap closure. */
function defaultGetPptxRenderer(): PptxRenderer {
  return createLibreOfficeRenderer();
}

const RenderPptxRequest = z.object({
  fileUrl: z.string().url(),
});

export function createReviewRouter(deps: ReviewRouterDeps = {}): Router {
  const router = express.Router();
  const getSupabase = deps.getSupabaseAdmin ?? defaultGetSupabaseAdmin;
  const getAnthropic = deps.getAnthropic ?? defaultGetAnthropic;
  const fetchFn = deps.fetchFn ?? fetch;
  const now = deps.now ?? Date.now;
  const getPptxRenderer = deps.getPptxRenderer ?? defaultGetPptxRenderer;
  // D5: the add-on weekly quota is a plain createRateLimiter instance
  // (7-day window, daily layer inert), created ONCE here so its buckets
  // persist across requests. It is invoked manually inside the handler
  // (the import.ts:484 pattern) because a rejection must not consume a
  // slot and must surface as 402, not the limiter's own 429.
  const weeklyLimiter =
    deps.weeklyLimiter ??
    createRateLimiter({
      windowMs: 7 * 24 * 60 * 60 * 1000,
      maxPerWindow: REVIEW_ADDON_WEEKLY_QUOTA,
      dailyMs: Number.MAX_SAFE_INTEGER,
      maxPerDay: Number.MAX_SAFE_INTEGER,
    });

  router.post(
    '/api/review/critique',
    requireAuth(getSupabase),
    // Burst limit must fit one full §5.2 cycle: a weekly add-on quota of
    // initials plus their included follow-ups (2× quota) is legitimate
    // rapid traffic and must never see a generic 429. 20/day bounds the
    // per-user LLM bill on top of the credit/quota checks below.
    createRateLimiter({ maxPerWindow: REVIEW_ADDON_WEEKLY_QUOTA * 2, maxPerDay: 20 }),
    async (req: Request, res: Response) => {
      const parsed = CritiqueRequest.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'bad_request', details: parsed.error.flatten() });
      }
      const body = parsed.data;
      // Hard page cap (§1): a typed error, never a silent truncation.
      if (body.pages.length > REVIEW_MAX_PAGES) {
        return res
          .status(400)
          .json({ error: 'too_many_pages', maxPages: REVIEW_MAX_PAGES });
      }

      const supabase = getSupabase();
      if (!supabase) {
        return res.status(500).json({
          error: 'supabase_not_configured',
          message: 'SUPABASE_URL and SUPABASE_SECRET_KEY must both be set for review.',
        });
      }
      const anthropic = getAnthropic();
      if (!anthropic) {
        return res.status(500).json({
          error: 'provider_not_configured',
          message: 'ANTHROPIC_API_KEY is missing on the server.',
        });
      }
      const user = (res.locals as AuthLocals).user;

      return body.reviewId
        ? runFollowup({ res, supabase, anthropic, fetchFn, now, user, body })
        : runInitial({ req, res, supabase, anthropic, fetchFn, now, weeklyLimiter, user, body });
    },
  );

  // ── Render an uploaded .pptx to page JPEGs (D10). No credit is consumed
  //    here — this is an ingest utility; the critique route charges. The
  //    .pptx is re-fetched through the same SSRF guard as import images.
  router.post(
    '/api/review/render-pptx',
    requireAuth(getSupabase),
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
        pptx = Buffer.from(await r.arrayBuffer());
        // Raw-byte cap BEFORE any conversion — a huge deck gets a clean
        // 413 instead of a LibreOffice timeout.
        if (pptx.byteLength > REVIEW_PPTX_MAX_BYTES) {
          return res.status(413).json({ error: 'pptx_too_large' });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown';
        return res.status(502).json({ error: 'file_fetch_failed', message });
      }

      let rendered: RenderedPage[];
      try {
        rendered = await getPptxRenderer().render(pptx);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown';
        // eslint-disable-next-line no-console
        console.error('[review.render-pptx] render failed:', message);
        return res.status(502).json({ error: 'pptx_render_failed' });
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
      for (const page of rendered) {
        const path = `${user.id}/review-temp/${batchId}/page-${page.pageNumber}.jpg`;
        const { error: uploadErr } = await supabase.storage
          .from('poster-assets')
          .upload(path, page.jpeg, { contentType: 'image/jpeg' });
        if (uploadErr) {
          // eslint-disable-next-line no-console
          console.error('[review.render-pptx] page upload failed:', uploadErr.message);
          return res.status(502).json({ error: 'page_upload_failed' });
        }
        const { data: signed, error: signErr } = await supabase.storage
          .from('poster-assets')
          .createSignedUrl(path, REVIEW_SIGNED_URL_TTL_SEC);
        if (signErr || !signed?.signedUrl) {
          // eslint-disable-next-line no-console
          console.error('[review.render-pptx] sign failed:', signErr?.message);
          return res.status(502).json({ error: 'page_upload_failed' });
        }
        pages.push({
          pageNumber: page.pageNumber,
          url: signed.signedUrl,
          widthPx: page.widthPx,
          heightPx: page.heightPx,
          // The client deletes its review-temp pages when the review is
          // done — the path rides along for that cleanup.
          storagePath: path,
        });
      }

      return res.json({ pages });
    },
  );

  return router;
}

// ─────────────────────────────────────────────────────────────────────
// Initial critique
// ─────────────────────────────────────────────────────────────────────

interface InitialCtx {
  req: Request;
  res: Response;
  supabase: SupabaseClient;
  anthropic: Anthropic;
  fetchFn: typeof fetch;
  now: () => number;
  weeklyLimiter: RequestHandler;
  user: User;
  body: CritiqueBody;
}

async function runInitial(ctx: InitialCtx): Promise<Response> {
  const { req, res, supabase, anthropic, fetchFn, now, weeklyLimiter, user, body } = ctx;

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
    // Add-on path. The weekly slot is deliberately NOT consumed here —
    // it is checked after the page fetch succeeds (below) so an ingest
    // failure never burns a weekly slot.
    creditSource = 'subscription_addon';
  } else if ((row.review_credits ?? 0) > 0) {
    creditSource = 'pack';
  } else {
    return res.status(402).json({ error: 'review_payment_required', reason: 'no_credit' });
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

  if (creditSource === 'subscription_addon') {
    // Weekly window, invoked manually (D5) — deferred until AFTER the
    // ingest guards passed so a 4xx/5xx page failure costs no slot. The
    // limiter still records the slot BEFORE the model call: a failed
    // critique consumes it (D17 — accepted: slots are a soft cap).
    const slot = weeklySlotAllowed(weeklyLimiter, req, res);
    if (!slot.allowed) {
      return res.status(402).json({
        error: 'review_payment_required',
        reason: 'weekly_quota_exceeded',
        ...(slot.retryAfterSec !== undefined ? { retryAfterSec: slot.retryAfterSec } : {}),
      });
    }
  }

  const signals = body.posterDoc ? computeReviewSignals(body.posterDoc.blocks) : undefined;

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
    return replyCritiqueError(res, err, { userId: user.id, stage: 'initial' });
  }
  const { critique, usage } = callResult;

  // Deterministic grounding (§4.5): the prompt asks, this guarantees.
  const enforced: CritiqueResult = {
    ...critique,
    findings: enforceFindings(critique.findings, {
      blockIds: body.posterDoc ? new Set(body.posterDoc.blocks.map((b) => b.id)) : undefined,
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

  // Pack path: consume AFTER success (D6). The RPC is a single atomic
  // conditional UPDATE; a NULL return means a concurrent review won the
  // race for the last credit — the model call already happened, so log
  // loudly and refuse the row.
  if (creditSource === 'pack') {
    const { data: remaining, error: consumeErr } = await supabase.rpc(
      'consume_review_credit' as never,
      { p_user_id: user.id } as never,
    );
    if (consumeErr) {
      // eslint-disable-next-line no-console
      console.error('[review.critique] consume_review_credit rpc failed', {
        userId: user.id,
        message: consumeErr.message,
      });
      return res.status(500).json({ error: 'review_internal' });
    }
    if (remaining === null || remaining === undefined) {
      // eslint-disable-next-line no-console
      console.error('[review.critique] credit race lost after successful critique', {
        userId: user.id,
      });
      return res.status(402).json({ error: 'review_payment_required', reason: 'no_credit' });
    }
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('poster_reviews')
    .insert({
      user_id: user.id,
      poster_id: body.posterId ?? null,
      source_kind: body.sourceKind,
      source_meta: {
        pageCount: body.pages.length,
        rubric_version: CURRENT_RUBRIC_VERSION,
        model: REVIEW_MODEL,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        ...(body.filename ? { filename: body.filename } : {}),
      },
      status: 'complete',
      stage: 'initial',
      initial_findings: enforced,
      credit_source: creditSource,
    })
    .select('id')
    .single();
  if (insertErr || !inserted) {
    const persistenceMessage = insertErr?.message ?? 'no row returned';
    // eslint-disable-next-line no-console
    console.error('[review.critique] poster_reviews insert failed', {
      userId: user.id,
      message: persistenceMessage,
    });
    if (creditSource === 'pack') {
      // The credit was consumed but the review row is lost — compensate
      // with a grant of exactly one credit before the 500 so a
      // persistence hiccup never bills the user for nothing.
      const { error: grantErr } = await supabase.rpc(
        'grant_review_credits' as never,
        { p_user_id: user.id, p_amount: 1 } as never,
      );
      if (grantErr) {
        // Loud: the user is now down one credit with no review to show
        // for it — this needs manual reconciliation.
        // eslint-disable-next-line no-console
        console.error('[review.critique] credit compensation failed', {
          userId: user.id,
          stage: 'initial',
          creditSource: 'pack',
          persistenceMessage,
          compensationMessage: grantErr.message,
        });
      }
    }
    // Weekly add-on slots are a soft cap (D17) — not compensated.
    return res.status(500).json({ error: 'review_internal' });
  }

  return res.status(200).json({
    reviewId: inserted.id as string,
    stage: 'initial',
    critique: enforced,
  });
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
    return replyCritiqueError(res, err, { userId: user.id, reviewId, stage: 'followup' });
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

  // One write: follow-up findings + terminal close, a single UPDATE.
  const { error: updateErr } = await supabase
    .from('poster_reviews')
    .update({
      followup_findings: enforced,
      stage: 'closed',
      updated_at: new Date(now()).toISOString(),
    })
    .eq('id', reviewId);
  if (updateErr) {
    // eslint-disable-next-line no-console
    console.error('[review.critique] follow-up update failed', {
      reviewId,
      message: updateErr.message,
    });
    return res.status(500).json({ error: 'review_internal' });
  }

  return res.status(200).json({ reviewId, stage: 'closed', critique: enforced });
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

/**
 * Invoke the weekly add-on limiter manually (the import.ts:484
 * pattern), but capture its 429 instead of letting it own the response:
 * a quota rejection here is a BILLING state, so the client sees 402
 * review_payment_required with the limiter's Retry-After surfaced as
 * retryAfterSec — not a generic 429. The capture object must carry
 * `locals` because createRateLimiter reads res.locals.user.
 */
function weeklySlotAllowed(
  limiter: RequestHandler,
  req: Request,
  res: Response,
): { allowed: true } | { allowed: false; retryAfterSec?: number } {
  let allowed = false;
  let retryAfterSec: number | undefined;
  const capture = {
    locals: res.locals,
    setHeader(name: string, value: string) {
      if (name.toLowerCase() === 'retry-after') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) retryAfterSec = parsed;
      }
    },
    status(_code: number) {
      return { json: (_body: unknown) => undefined };
    },
  } as unknown as Response;
  limiter(req, capture, () => {
    allowed = true;
  });
  return allowed ? { allowed: true } : { allowed: false, retryAfterSec };
}

// ─────────────────────────────────────────────────────────────────────
// Error mapping
// ─────────────────────────────────────────────────────────────────────

function replyPageFetchError(res: Response, err: unknown): Response {
  if (err instanceof PageFetchError) {
    if (err.code === 'too_large') {
      return res.status(413).json({ error: 'image_too_large' });
    }
    if (err.code === 'fetch_failed') {
      // 502, not 400: a storage/upstream hiccup is not a client error.
      // url_not_allowed / unsupported_media stay 400 — those ARE the
      // client's fault.
      return res.status(502).json({ error: err.code });
    }
    // url_not_allowed | unsupported_media — the typed code IS the
    // client-facing error string.
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
