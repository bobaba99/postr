/**
 * Narrative condense endpoint — the single LLM step in the manuscript
 * → poster pipeline.
 *
 * POST /api/narrative/condense
 *   body: CondenseRequestBody (roles + pinned sections + emphasis)
 *   out:  CondensedNarrative  (per-panel text, budget-enforced)
 *
 * Follows the import router's stack exactly: requireAuth (anonymous
 * sessions accepted) → rate limit → zod validation → provider call →
 * generic client-facing errors. API keys never leave the server.
 *
 * Budgets are enforced HERE, deterministically, after the model
 * replies — the prompt asks, this route guarantees. See
 * narrative/enforceBudgets.ts.
 */
import express, { type Request, type Router, type Response } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { CondensedNarrative } from '@postr/shared';
import { requireAuth } from './auth.js';
import { createRateLimiter } from './rateLimit.js';
import {
  CONDENSER_MODEL,
  CONDENSER_PROVIDER,
} from './narrative/config.js';
import {
  CondenseUpstreamError,
  createOpenAiProvider,
  type CondenseProvider,
} from './narrative/condense.js';
import { enforceBudget } from './narrative/enforceBudgets.js';

// ─────────────────────────────────────────────────────────────────────
// Request schema
// ─────────────────────────────────────────────────────────────────────

/** Per-panel source cap. The mapper sends role excerpts, not the whole
 *  manuscript — 20k chars (~3.5k words) is far beyond any sane panel
 *  source and bounds the upstream token bill. */
const MAX_SOURCE_CHARS = 20_000;

const RoleInput = z.object({
  role: z.enum(['hook', 'question', 'methods', 'keyResult', 'takeaway']),
  budgetWords: z.number().int().min(10).max(200),
  sourceText: z.string().min(1).max(MAX_SOURCE_CHARS),
});

const PinnedInput = z.object({
  id: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,32}$/, 'id must be a short opaque token'),
  heading: z.string().min(1).max(200),
  budgetWords: z.number().int().min(10).max(200),
  sourceText: z.string().min(1).max(MAX_SOURCE_CHARS),
});

const CondenseRequest = z
  .object({
    roles: z.array(RoleInput).min(1).max(5),
    pinned: z.array(PinnedInput).max(2).default([]),
    emphasis: z.object({
      takeaway: z.string().max(500),
      // These two enums MUST stay in lockstep with AudienceOption and
      // PurposeOption in packages/shared, and with the DESCRIPTIONS
      // maps in narrative/prompt.ts. A value the client can produce but
      // this schema rejects is a 400 on a legitimate answer.
      audience: z.enum([
        'specialists',
        'general',
        'clinicians',
        'public',
        'adolescents',
        'children',
        'undergraduates',
        'policymakers',
        'industry',
        'custom',
      ]),
      // Free text only reaches the prompt when the deterministic preset
      // search found no match. Bounded so a paste cannot inflate the
      // prompt, and it is quoted as data, never as instructions.
      audienceCustom: z.string().max(200).optional(),
      purpose: z.enum([
        'requirement',
        'one-time',
        'committee',
        'lab-meeting',
        'feedback',
        'collaborators',
        'job-market',
      ]),
      rankedFindings: z.array(z.string().min(1).max(1000)).max(5),
    }),
  })
  .refine(
    (body) => new Set(body.roles.map((r) => r.role)).size === body.roles.length,
    { message: 'duplicate role' },
  )
  .refine(
    (body) => new Set(body.pinned.map((p) => p.id)).size === body.pinned.length,
    { message: 'duplicate pinned id' },
  );

// ─────────────────────────────────────────────────────────────────────
// Router factory
// ─────────────────────────────────────────────────────────────────────

export interface NarrativeRouterDeps {
  getSupabaseAdmin?: () => SupabaseClient | null;
  /** Provider registry — inject for tests or to add vendors. Defaults
   *  to the OpenAI adapter built from OPENAI_API_KEY. */
  getProviders?: () => Record<string, CondenseProvider>;
  /** Inject a fetch impl for tests. Defaults to global fetch. */
  fetchFn?: typeof fetch;
}

export function createNarrativeRouter(deps: NarrativeRouterDeps = {}): Router {
  const router = express.Router();
  const getSupabase = deps.getSupabaseAdmin ?? defaultGetSupabaseAdmin;
  const getProviders =
    deps.getProviders ?? (() => defaultProviders(deps.fetchFn));

  router.post(
    '/api/narrative/condense',
    requireAuth(getSupabase),
    // One condense call per document. 6/min absorbs retries after an
    // outline edit; 30/day bounds the per-user LLM bill.
    createRateLimiter({ maxPerWindow: 6, maxPerDay: 30 }),
    async (req: Request, res: Response) => {
      const parsed = CondenseRequest.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: 'bad_request', details: parsed.error.flatten() });
      }

      const provider = getProviders()[CONDENSER_PROVIDER];
      if (!provider) {
        return res.status(500).json({
          error: 'provider_not_configured',
          message: 'The condense provider API key is missing on the server.',
        });
      }

      const { roles, pinned, emphasis } = parsed.data;
      try {
        const raw = await provider.condense({ roles, pinned, emphasis });

        // The reply must cover every requested panel — a partial
        // narrative is a provider failure, not something to paper over.
        const textByRole = new Map(raw.roles.map((r) => [r.role, r.text]));
        const textByPin = new Map(raw.pinned.map((p) => [p.id, p.text]));
        const missing =
          roles.some((r) => !textByRole.get(r.role)?.trim()) ||
          pinned.some((p) => !textByPin.get(p.id)?.trim());
        if (missing) {
          // eslint-disable-next-line no-console
          console.error('[narrative.condense] incomplete provider reply', {
            requested: roles.map((r) => r.role),
            received: raw.roles.map((r) => r.role),
          });
          return res
            .status(502)
            .json({ error: 'condense_failed', message: 'incomplete_reply' });
        }

        // Deterministic budget enforcement — "no overflow, ever".
        const body: CondensedNarrative = {
          roles: roles.map((r) => {
            const enforced = enforceBudget(textByRole.get(r.role)!, r.budgetWords);
            return { role: r.role, text: enforced.text, truncated: enforced.truncated };
          }),
          pinned: pinned.map((p) => {
            const enforced = enforceBudget(textByPin.get(p.id)!, p.budgetWords);
            return {
              id: p.id,
              heading: p.heading,
              text: enforced.text,
              truncated: enforced.truncated,
            };
          }),
        };
        return res.json(body);
      } catch (err) {
        const upstream = err instanceof CondenseUpstreamError ? err : null;
        // eslint-disable-next-line no-console
        console.error('[narrative.condense] provider call failed', {
          provider: provider.id,
          model: CONDENSER_MODEL,
          code: upstream?.code,
          status: upstream?.status,
          message: err instanceof Error ? err.message : 'unknown',
        });
        // Pass through 401/429/529 so the client can react (retry-after
        // on 429); everything else is a generic 502. The machine-
        // readable code is all the client sees — raw provider text
        // stays in the server log.
        const status = upstream?.status;
        const passthroughStatus =
          status === 401 || status === 429 || status === 529 ? status : 502;
        return res.status(passthroughStatus).json({
          error: 'condense_failed',
          message: upstream?.code ?? 'upstream_error',
        });
      }
    },
  );

  return router;
}

// ─────────────────────────────────────────────────────────────────────
// Default factories
// ─────────────────────────────────────────────────────────────────────

function defaultProviders(
  fetchFn?: typeof fetch,
): Record<string, CondenseProvider> {
  const providers: Record<string, CondenseProvider> = {};
  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey) {
    providers.openai = createOpenAiProvider({
      apiKey: openAiKey,
      model: CONDENSER_MODEL,
      fetchFn,
    });
  }
  // Phase 2: register the Anthropic adapter here for the bake-off.
  return providers;
}

function defaultGetSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
