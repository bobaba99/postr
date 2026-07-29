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
  EXTRACTION_MODEL,
  STYLE_MODEL,
} from './narrative/config.js';
import {
  CondenseUpstreamError,
  createOpenAiProvider,
  type CondenseProvider,
} from './narrative/condense.js';
import {
  ExtractUpstreamError,
  createOpenAiExtractionProvider,
  rankAndGate,
  type ExtractionProvider,
  type RawFinding,
} from './narrative/extractFindings.js';
import {
  StyleUpstreamError,
  createOpenAiStyleProvider,
  coerceDevices,
  type StyleProvider,
  type RawStyledSlide,
} from './narrative/styleDeck.js';
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
// Findings-extraction request schema (talk path)
// ─────────────────────────────────────────────────────────────────────

/** Results-text cap. The talk path sends the paper's results/findings
 *  passage, not the whole manuscript — 200k chars (~35k words) covers
 *  even a long multi-section results block and bounds the token bill. */
const MAX_RESULTS_CHARS = 200_000;

/** The response finding shape — matches buildDeck.ts's RankedFinding
 *  (plus `rank`), so the client can hand it straight to the deck
 *  builder. Declared here as the route's public contract. */
export interface RankedFinding {
  text: string;
  sourceQuote: string;
  sourceSection: string;
  rank: number;
}

const ExtractRequest = z.object({
  // Trimmed to reject whitespace-only input; the cap bounds the upstream
  // token bill. The text is quoted as DATA in the prompt, never as
  // instructions.
  resultsText: z
    .string()
    .trim()
    .min(1)
    .max(MAX_RESULTS_CHARS),
  context: z.string().max(2000).optional(),
});

// ─────────────────────────────────────────────────────────────────────
// Deck-styling request schema (Arm P — structured editable layout)
// ─────────────────────────────────────────────────────────────────────

/** Per-slide text field cap. A slide's assertion/evidence/quote is a
 *  short talk-slide excerpt, not the whole manuscript — 5k chars is far
 *  beyond any sane slide field and bounds the upstream token bill. */
const MAX_SLIDE_FIELD_CHARS = 5_000;

const StyleSpeakerNoteInput = z.object({
  text: z.string().max(MAX_SLIDE_FIELD_CHARS),
  provenance: z.string().max(200),
});

const StyleSlideInput = z.object({
  // Free-form string, not the SlideRole enum: the API cannot import the
  // web package's role type, and the styling prompt only needs role as
  // a hint, not a validated domain value.
  role: z.string().min(1).max(50),
  assertion: z.string().min(1).max(MAX_SLIDE_FIELD_CHARS),
  evidence: z.string().max(MAX_SLIDE_FIELD_CHARS).nullable(),
  sourceQuote: z.string().max(MAX_SLIDE_FIELD_CHARS),
  speakerNotes: z.array(StyleSpeakerNoteInput).max(10),
  references: z.array(z.string().max(500)).max(50),
  wordCapCut: z.boolean(),
});

const StyleDeckRequest = z.object({
  deck: z.object({
    slides: z.array(StyleSlideInput).min(1).max(30),
    durationMinutes: z.number().int().min(1).max(180),
  }),
});

// ─────────────────────────────────────────────────────────────────────
// Router factory
// ─────────────────────────────────────────────────────────────────────

export interface NarrativeRouterDeps {
  getSupabaseAdmin?: () => SupabaseClient | null;
  /** Condense provider registry — inject for tests or to add vendors.
   *  Defaults to the OpenAI adapter built from OPENAI_API_KEY. */
  getProviders?: () => Record<string, CondenseProvider>;
  /** Extraction provider registry (talk path) — same shape and default
   *  as the condense registry, a separate map so the two LLM steps can
   *  register different vendors independently. */
  getExtractionProviders?: () => Record<string, ExtractionProvider>;
  /** Style provider registry (Arm P) — same shape and default as the
   *  condense/extraction registries, a separate map so all three LLM
   *  steps can register different vendors independently. */
  getStyleProviders?: () => Record<string, StyleProvider>;
  /** Inject a fetch impl for tests. Defaults to global fetch. */
  fetchFn?: typeof fetch;
}

export function createNarrativeRouter(deps: NarrativeRouterDeps = {}): Router {
  const router = express.Router();
  const getSupabase = deps.getSupabaseAdmin ?? defaultGetSupabaseAdmin;
  const getProviders =
    deps.getProviders ?? (() => defaultProviders(deps.fetchFn));
  const getExtractionProviders =
    deps.getExtractionProviders ??
    (() => defaultExtractionProviders(deps.fetchFn));
  const getStyleProviders =
    deps.getStyleProviders ?? (() => defaultStyleProviders(deps.fetchFn));

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

  // ───────────────────────────────────────────────────────────────────
  // POST /api/narrative/extract-findings — talk-path LLM extraction.
  //
  // Same middleware stack as /condense (requireAuth anonymous-ok → rate
  // limit → zod validation → provider call → generic errors). ADDITIVE:
  // it produces ranked star-finding cards for the talk deck and does not
  // touch the deterministic poster path. The verbatim fidelity gate runs
  // HERE, after the model replies — the prompt asks for a verbatim quote,
  // this route GUARANTEES it (rankAndGate drops any finding whose quote
  // is not in the results text).
  // ───────────────────────────────────────────────────────────────────
  router.post(
    '/api/narrative/extract-findings',
    requireAuth(getSupabase),
    // One extraction per paper; 6/min absorbs a retry after an edit,
    // 30/day bounds the per-user LLM bill — matched to /condense.
    createRateLimiter({ maxPerWindow: 6, maxPerDay: 30 }),
    async (req: Request, res: Response) => {
      const parsed = ExtractRequest.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: 'bad_request', details: parsed.error.flatten() });
      }

      const provider = getExtractionProviders()[CONDENSER_PROVIDER];
      if (!provider) {
        return res.status(500).json({
          error: 'provider_not_configured',
          message: 'The extraction provider API key is missing on the server.',
        });
      }

      const { resultsText, context } = parsed.data;
      try {
        const raw = await provider.extract({ resultsText, context });

        // THE FIDELITY GATE. Drop any finding whose sourceQuote is not a
        // verbatim substring of the results text, sort by rank, re-rank
        // contiguously. An empty result is legitimate — better no cards
        // than a fabricated one.
        const findings: RankedFinding[] = rankAndGate(
          raw.findings as RawFinding[],
          resultsText,
        );
        return res.json({ findings });
      } catch (err) {
        const upstream = err instanceof ExtractUpstreamError ? err : null;
        // eslint-disable-next-line no-console
        console.error('[narrative.extract-findings] provider call failed', {
          provider: provider.id,
          model: EXTRACTION_MODEL,
          code: upstream?.code,
          status: upstream?.status,
          message: err instanceof Error ? err.message : 'unknown',
        });
        // Same passthrough set as /condense: 401/429/529 reach the client
        // (retry-after on 429); everything else is a generic 502. The
        // machine-readable code is all the client sees.
        const status = upstream?.status;
        const passthroughStatus =
          status === 401 || status === 429 || status === 529 ? status : 502;
        return res.status(passthroughStatus).json({
          error: 'extract_failed',
          message: upstream?.code ?? 'upstream_error',
        });
      }
    },
  );

  // ───────────────────────────────────────────────────────────────────
  // POST /api/narrative/style-deck — Arm P, the deck-styling LLM step.
  //
  // Same middleware stack as /condense and /extract-findings
  // (requireAuth anonymous-ok → rate limit → zod validation → provider
  // call → generic errors). ADDITIVE: it turns a plain SlideDeck into a
  // structured, EDITABLE layout (device + positioned elements per
  // slide) and does not touch the deterministic poster path. THE DEVICE
  // VOCABULARY GATE runs HERE, after the model replies — the prompt
  // asks for a device from the fixed vocabulary, this route GUARANTEES
  // it (coerceDevices coerces any out-of-vocabulary device to 'plain').
  // ───────────────────────────────────────────────────────────────────
  router.post(
    '/api/narrative/style-deck',
    requireAuth(getSupabase),
    // One styling call per deck; 6/min absorbs a retry after an edit,
    // 30/day bounds the per-user LLM bill — matched to /condense and
    // /extract-findings.
    createRateLimiter({ maxPerWindow: 6, maxPerDay: 30 }),
    async (req: Request, res: Response) => {
      const parsed = StyleDeckRequest.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: 'bad_request', details: parsed.error.flatten() });
      }

      const provider = getStyleProviders()[CONDENSER_PROVIDER];
      if (!provider) {
        return res.status(500).json({
          error: 'provider_not_configured',
          message: 'The style provider API key is missing on the server.',
        });
      }

      try {
        const raw = await provider.style({ deck: parsed.data.deck });

        // THE DEVICE VOCABULARY GATE. Any slide whose device is not in
        // SUPPORTED_DEVICES becomes 'plain' — graceful degradation, never
        // a rejected response.
        const gated = coerceDevices(raw);
        const slides: RawStyledSlide[] = gated.slides;
        return res.json({ slides });
      } catch (err) {
        const upstream = err instanceof StyleUpstreamError ? err : null;
        // eslint-disable-next-line no-console
        console.error('[narrative.style-deck] provider call failed', {
          provider: provider.id,
          model: STYLE_MODEL,
          code: upstream?.code,
          status: upstream?.status,
          message: err instanceof Error ? err.message : 'unknown',
        });
        // Same passthrough set as /condense and /extract-findings:
        // 401/429/529 reach the client (retry-after on 429); everything
        // else is a generic 502. The machine-readable code is all the
        // client sees.
        const status = upstream?.status;
        const passthroughStatus =
          status === 401 || status === 429 || status === 529 ? status : 502;
        return res.status(passthroughStatus).json({
          error: 'style_failed',
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

function defaultExtractionProviders(
  fetchFn?: typeof fetch,
): Record<string, ExtractionProvider> {
  const providers: Record<string, ExtractionProvider> = {};
  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey) {
    providers.openai = createOpenAiExtractionProvider({
      apiKey: openAiKey,
      model: EXTRACTION_MODEL,
      fetchFn,
    });
  }
  // Phase 2: register the Anthropic adapter here for the bake-off.
  return providers;
}

function defaultStyleProviders(
  fetchFn?: typeof fetch,
): Record<string, StyleProvider> {
  const providers: Record<string, StyleProvider> = {};
  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey) {
    providers.openai = createOpenAiStyleProvider({
      apiKey: openAiKey,
      model: STYLE_MODEL,
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
