/**
 * Presentation Checker critique router.
 *
 * The initial flow validates the request, resolves server-side
 * entitlement, fetches guarded page images, validates and enforces the
 * critique, consumes pack credit after success, then persists the review.
 *
 * POST /api/review/critique — FOLLOW-UP flow (body.reviewId set):
 * a diff critique against the stored initial findings, then the review
 * closes (stage 'closed' is terminal, enforced HERE, not just hidden
 * in UI). Included in the initial credit: no entitlement check, no
 * second consume, no second weekly slot (§5.2/§5.3, D6). Ownership is
 * checked MANUALLY — the service_role client bypasses the table's
 * owner-SELECT RLS (D3).
 */
import { randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import express, {
  type Request,
  type RequestHandler,
  type Response,
  type Router,
} from 'express';
import type { CritiqueResult, ReviewPageRef } from '@postr/shared';
import { z } from 'zod';
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
import {
  callAnthropicCritique,
  CritiqueUpstreamError,
  type CritiqueCallResult,
} from './review/critique.js';
import { enforceFindings } from './review/enforce.js';
import {
  fetchReviewPages,
  PageFetchError,
  type FetchedPage,
} from './review/fetchPages.js';
import {
  buildFollowupUserMessage,
  buildInitialUserMessage,
  composeReviewSystemPrompt,
} from './review/prompt.js';
import { CURRENT_RUBRIC_VERSION } from './review/rubric/index.js';
import { computeReviewSignals } from './review/signals.js';

const PageRefInput = z.object({
  pageNumber: z.number().int().min(1),
  url: z.string().url(),
  widthPx: z.number().int().min(1),
  heightPx: z.number().int().min(1),
});

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
  pages: z.array(PageRefInput).min(1),
  posterDoc: PosterDocEnvelope.optional(),
  posterId: z.string().uuid().optional(),
  reviewId: z.string().uuid().optional(),
  filename: z.string().max(255).optional(),
});

type CritiqueBody = z.infer<typeof CritiqueRequest>;

export interface ReviewRouterDeps {
  getSupabaseAdmin?: () => SupabaseClient | null;
  getAnthropic?: () => Anthropic | null;
  fetchFn?: typeof fetch;
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
  const getPptxRenderer = deps.getPptxRenderer ?? defaultGetPptxRenderer;
  const now = deps.now ?? Date.now;
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
    createRateLimiter({ maxPerWindow: 4, maxPerDay: 20 }),
    async (req: Request, res: Response) => {
      const parsed = CritiqueRequest.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: 'bad_request', details: parsed.error.flatten() });
      }
      const body = parsed.data;
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
        : runInitial({
            req,
            res,
            supabase,
            anthropic,
            fetchFn,
            now,
            weeklyLimiter,
            user,
            body,
          });
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

      // Audit floor: every page must render at least 1024×1024 px so the
      // critique model has enough pixels to read slide content (Task 18).
      const pageTooSmall = rendered.some(
        (page) => Math.min(page.widthPx, page.heightPx) < 1024,
      );
      if (pageTooSmall) {
        return res.status(400).json({
          error: 'page_too_small',
          message:
            'Each slide must render at least 1024×1024 pixels for Presentation Checker. Use a larger slide size or export as PDF and upload that instead.',
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
        });
      }

      return res.json({ pages });
    },
  );

  return router;
}

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
  const entitlement = await resolveEntitlement(ctx.supabase, ctx.user.id);
  if (!entitlement.ok) {
    console.error('[review.critique] entitlement lookup failed', {
      userId: ctx.user.id,
      message: entitlement.message,
    });
    return ctx.res.status(500).json({ error: 'review_internal' });
  }

  // Decide the credit source WITHOUT consuming anything — weekly-slot
  // consumption waits until after the deterministic page guards pass
  // so a 400/413 never burns an add-on slot. D17 still holds: a later
  // model-call failure does consume the slot (soft cap).
  const entitlementDecision = resolveCreditSource(
    entitlement.row,
    ctx.now(),
    ctx.res,
  );
  if (!entitlementDecision.ok) {
    return entitlementDecision.response;
  }
  const { creditSource } = entitlementDecision;

  let fetchedPages: FetchedPage[];
  try {
    fetchedPages = await fetchReviewPages(ctx.body.pages, {
      supabaseUrl: process.env.SUPABASE_URL,
      fetchFn: ctx.fetchFn,
      maxBytes: REVIEW_IMAGE_MAX_BYTES,
    });
  } catch (error) {
    return replyPageFetchError(ctx.res, error);
  }

  if (creditSource === 'subscription_addon') {
    const slot = weeklySlotAllowed(ctx.weeklyLimiter, ctx.req, ctx.res);
    if (!slot.allowed) {
      return ctx.res.status(402).json({
        error: 'review_payment_required',
        reason: 'weekly_quota_exceeded',
        ...(slot.retryAfterSec !== undefined
          ? { retryAfterSec: slot.retryAfterSec }
          : {}),
      });
    }
  }

  const signals = ctx.body.posterDoc
    ? computeReviewSignals(ctx.body.posterDoc.blocks)
    : undefined;

  let callResult: CritiqueCallResult;
  try {
    callResult = await callAnthropicCritique(ctx.anthropic, {
      systemPrompt: composeReviewSystemPrompt(),
      userMessage: buildInitialUserMessage({
        pageCount: ctx.body.pages.length,
        sourceKind: ctx.body.sourceKind,
        signals,
        posterDocPresent: ctx.body.posterDoc !== undefined,
      }),
      pages: fetchedPages,
    });
  } catch (error) {
    return replyCritiqueError(ctx.res, error, {
      userId: ctx.user.id,
      stage: 'initial',
    });
  }

  const enforcedCritique: CritiqueResult = {
    ...callResult.critique,
    findings: enforceFindings(callResult.critique.findings, {
      blockIds: ctx.body.posterDoc
        ? new Set(ctx.body.posterDoc.blocks.map((block) => block.id))
        : undefined,
      pageCount: ctx.body.pages.length,
    }),
  };

  logCompletedCritique(ctx.user.id, creditSource, callResult, enforcedCritique);

  // Pack path: consume AFTER success (D6). Persistence failure below
  // compensates via grant_review_credits so a retry cannot double-charge.
  const consumeFailure = await consumePackCredit(ctx, creditSource);
  if (consumeFailure) {
    return consumeFailure;
  }

  return persistInitialReview(
    ctx,
    creditSource,
    callResult,
    enforcedCritique,
  );
}

async function persistInitialReview(
  ctx: InitialCtx,
  creditSource: CreditSource,
  callResult: CritiqueCallResult,
  critique: CritiqueResult,
): Promise<Response> {
  const { data: inserted, error: insertError } = await ctx.supabase
    .from('poster_reviews')
    .insert({
      user_id: ctx.user.id,
      poster_id: ctx.body.posterId ?? null,
      source_kind: ctx.body.sourceKind,
      source_meta: {
        pageCount: ctx.body.pages.length,
        rubric_version: CURRENT_RUBRIC_VERSION,
        model: REVIEW_MODEL,
        input_tokens: callResult.usage.inputTokens,
        output_tokens: callResult.usage.outputTokens,
        ...(ctx.body.filename ? { filename: ctx.body.filename } : {}),
      },
      status: 'complete',
      stage: 'initial',
      initial_findings: critique,
      credit_source: creditSource,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    const persistenceMessage = insertError?.message ?? 'no row returned';
    console.error('[review.critique] poster_reviews insert failed', {
      userId: ctx.user.id,
      message: persistenceMessage,
    });
    if (creditSource === 'pack') {
      await compensatePackCredit(ctx, persistenceMessage);
    }
    // Weekly add-on slots are a soft cap (D17) — not compensated. The
    // slot was only recorded after guards passed, so a persistence
    // failure is rare and the retry burns at most one soft-cap unit.
    return ctx.res.status(500).json({ error: 'review_internal' });
  }

  return ctx.res.status(200).json({
    reviewId: inserted.id as string,
    stage: 'initial',
    critique,
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

async function compensatePackCredit(
  ctx: InitialCtx,
  persistenceMessage: string,
): Promise<void> {
  const { error } = await ctx.supabase.rpc('grant_review_credits' as never, {
    p_user_id: ctx.user.id,
    p_amount: 1,
  } as never);
  if (error) {
    console.error('[review.critique] credit compensation failed', {
      userId: ctx.user.id,
      stage: 'initial',
      creditSource: 'pack',
      persistenceMessage,
      compensationMessage: error.message,
    });
  }
}

interface EntitlementRow {
  review_credits: number | null;
  review_addon: boolean | null;
  plan: string | null;
  plan_expires_at: string | null;
  subscription_status: string | null;
}

type CreditSource = 'pack' | 'subscription_addon';

function resolveCreditSource(
  row: EntitlementRow,
  nowMs: number,
  res: Response,
):
  | { ok: true; creditSource: CreditSource }
  | { ok: false; response: Response } {
  // Eligibility only — weekly-slot consumption for add-ons happens after
  // the page-fetch guards succeed (see runInitial).
  if (row.review_addon === true && isTermActive(row, nowMs)) {
    return { ok: true, creditSource: 'subscription_addon' };
  }
  if ((row.review_credits ?? 0) > 0) {
    return { ok: true, creditSource: 'pack' };
  }
  return {
    ok: false,
    response: res
      .status(402)
      .json({ error: 'review_payment_required', reason: 'no_credit' }),
  };
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
  if (error || !data) {
    return { ok: false, message: error?.message ?? 'users row missing' };
  }
  return { ok: true, row: data as unknown as EntitlementRow };
}

function isTermActive(row: EntitlementRow, nowMs: number): boolean {
  if (row.plan !== 'term' || !row.plan_expires_at) {
    return false;
  }
  const expiresMs = new Date(row.plan_expires_at).getTime();
  if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) {
    return false;
  }
  return !['canceled', 'unpaid', 'incomplete_expired'].includes(
    row.subscription_status ?? '',
  );
}

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
        if (Number.isFinite(parsed)) {
          retryAfterSec = parsed;
        }
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

async function consumePackCredit(
  ctx: InitialCtx,
  creditSource: CreditSource,
): Promise<Response | null> {
  if (creditSource !== 'pack') {
    return null;
  }

  const { data: remaining, error } = await ctx.supabase.rpc(
    'consume_review_credit' as never,
    { p_user_id: ctx.user.id } as never,
  );
  if (error) {
    console.error('[review.critique] consume_review_credit rpc failed', {
      userId: ctx.user.id,
      message: error.message,
    });
    return ctx.res.status(500).json({ error: 'review_internal' });
  }
  if (remaining === null || remaining === undefined) {
    console.error('[review.critique] credit race lost after successful critique', {
      userId: ctx.user.id,
    });
    return ctx.res
      .status(402)
      .json({ error: 'review_payment_required', reason: 'no_credit' });
  }
  return null;
}

function logCompletedCritique(
  userId: string,
  creditSource: CreditSource,
  callResult: CritiqueCallResult,
  critique: CritiqueResult,
): void {
  console.log('[review.critique] critique done', {
    userId,
    stage: 'initial',
    creditSource,
    model: REVIEW_MODEL,
    inputTokens: callResult.usage.inputTokens,
    outputTokens: callResult.usage.outputTokens,
    findings: critique.findings.length,
  });
}

function replyPageFetchError(res: Response, error: unknown): Response {
  if (error instanceof PageFetchError) {
    if (error.code === 'too_large') {
      return res.status(413).json({ error: 'image_too_large' });
    }
    if (error.code === 'fetch_failed') {
      return res.status(502).json({ error: error.code });
    }
    return res.status(400).json({ error: error.code });
  }
  console.error('[review.critique] page fetch crashed', {
    message: error instanceof Error ? error.message : 'unknown',
  });
  return res.status(500).json({ error: 'review_internal' });
}

function replyCritiqueError(
  res: Response,
  error: unknown,
  logContext: Record<string, unknown>,
): Response {
  const upstream = error instanceof CritiqueUpstreamError ? error : null;
  console.error('[review.critique] critique failed', {
    ...logContext,
    code: upstream?.code,
    status: upstream?.status,
    message: error instanceof Error ? error.message : 'unknown',
  });

  if (
    upstream &&
    (upstream.code === 'no_tool_call' || upstream.code === 'bad_tool_json')
  ) {
    return res.status(502).json({ error: 'bad_model_output' });
  }

  // Provider statuses (401/429/529/…) stay in the log above — clients
  // always see a generic 502 so internal upstream detail never leaks.
  return res.status(502).json({ error: 'review_upstream' });
}

function defaultGetSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    return null;
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function defaultGetAnthropic(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? new Anthropic({ apiKey: key }) : null;
}
