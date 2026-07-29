/**
 * Presentation Checker critique router.
 *
 * The initial flow validates the request, resolves server-side
 * entitlement, fetches guarded page images, validates and enforces the
 * critique, consumes pack credit after success, then persists the review.
 * Task 16 extends the reviewId branch with follow-up handling.
 */
import Anthropic from '@anthropic-ai/sdk';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import express, {
  type Request,
  type RequestHandler,
  type Response,
  type Router,
} from 'express';
import type { CritiqueResult } from '@postr/shared';
import { z } from 'zod';
import { requireAuth, type AuthLocals } from './auth.js';
import { createRateLimiter } from './rateLimit.js';
import {
  REVIEW_ADDON_WEEKLY_QUOTA,
  REVIEW_IMAGE_MAX_BYTES,
  REVIEW_MAX_PAGES,
  REVIEW_MODEL,
} from './review/config.js';
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
}

export function createReviewRouter(deps: ReviewRouterDeps = {}): Router {
  const router = express.Router();
  const getSupabase = deps.getSupabaseAdmin ?? defaultGetSupabaseAdmin;
  const getAnthropic = deps.getAnthropic ?? defaultGetAnthropic;
  const fetchFn = deps.fetchFn ?? fetch;
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

      if (body.reviewId) {
        return res
          .status(400)
          .json({ error: 'bad_request', message: 'followup_not_implemented' });
      }

      return runInitial({
        req,
        res,
        supabase,
        anthropic,
        fetchFn,
        now,
        weeklyLimiter,
        user: (res.locals as AuthLocals).user,
        body,
      });
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

  const entitlementDecision = resolveCreditSource(entitlement.row, ctx);
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

  const consumeFailure = await consumePackCredit(ctx, creditSource);
  if (consumeFailure) {
    return consumeFailure;
  }

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
      initial_findings: enforcedCritique,
      credit_source: creditSource,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    console.error('[review.critique] poster_reviews insert failed', {
      userId: ctx.user.id,
      message: insertError?.message ?? 'no row returned',
    });
    return ctx.res.status(500).json({ error: 'review_internal' });
  }

  return ctx.res.status(200).json({
    reviewId: inserted.id as string,
    stage: 'initial',
    critique: enforcedCritique,
  });
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
  ctx: InitialCtx,
):
  | { ok: true; creditSource: CreditSource }
  | { ok: false; response: Response } {
  if (row.review_addon === true && isTermActive(row, ctx.now())) {
    const slot = weeklySlotAllowed(ctx.weeklyLimiter, ctx.req, ctx.res);
    if (!slot.allowed) {
      return {
        ok: false,
        response: ctx.res.status(402).json({
          error: 'review_payment_required',
          reason: 'weekly_quota_exceeded',
          ...(slot.retryAfterSec !== undefined
            ? { retryAfterSec: slot.retryAfterSec }
            : {}),
        }),
      };
    }
    return { ok: true, creditSource: 'subscription_addon' };
  }

  if ((row.review_credits ?? 0) > 0) {
    return { ok: true, creditSource: 'pack' };
  }

  return {
    ok: false,
    response: ctx.res
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
    return res
      .status(502)
      .json({ error: 'bad_model_output', message: upstream.code });
  }

  const upstreamStatus =
    upstream?.code === 'http_error' ? upstream.status : undefined;
  const responseStatus =
    upstreamStatus === 401 || upstreamStatus === 429 || upstreamStatus === 529
      ? upstreamStatus
      : 502;
  return res.status(responseStatus).json({ error: 'review_upstream' });
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
