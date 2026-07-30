/**
 * Client for POST /api/narrative/style-deck — Arm P of the Phase-2
 * paper-to-slides experiment: an LLM that turns a plain `SlideDeck`
 * (Phase 1) into structured, EDITABLE `StyledSlide`s (a device chosen
 * from the fixed vocabulary plus positioned elements per slide).
 *
 * Mirrors extractFindings.ts: auth rides the anonymous-first Supabase
 * session, and failures collapse to a small closed set so the caller
 * can respond generically without ever surfacing raw error text.
 *
 * The response's `slides` are already structurally identical to the
 * web `StyledSlide` type (see styledTypes.ts's header comment — the
 * device vocabulary and shapes are kept identical by hand between this
 * client and apps/api/src/narrative/styleDeck.ts). This adapter's job
 * is the type-level bridge: it trusts the server's device vocabulary
 * gate (coerceDevices in styleDeck.ts) rather than re-validating it
 * here, and narrows the response onto `StyledSlide[]`.
 */
import { ApiError, postJson } from '../../lib/apiClient';
import { supabase } from '../../lib/supabase';
import { ensureSession } from '../../lib/auth';
import type { SlideDeck } from './types';
import type { StyledSlide } from './styledTypes';

interface StyleDeckResponse {
  slides: StyledSlide[];
}

export type StyleDeckFailure = 'rate_limited' | 'failed';

export class StyleDeckError extends Error {
  constructor(
    public readonly kind: StyleDeckFailure,
    public readonly retryAfterSec?: number,
  ) {
    super(kind);
    this.name = 'StyleDeckError';
  }
}

export interface StyleDeckOptions {
  signal?: AbortSignal;
}

/**
 * Style a plain deck into a `StyledSlide[]` — one device + positioned
 * elements per input slide, in the same order.
 */
export async function styleDeck(
  plainDeck: SlideDeck,
  opts: StyleDeckOptions = {},
): Promise<StyledSlide[]> {
  try {
    // Anonymous-first: ensure a Supabase session exists before the authed
    // call (idempotent — resolves instantly when one already exists).
    await ensureSession(supabase);

    const { slides } = await postJson<StyleDeckResponse>(
      '/api/narrative/style-deck',
      { deck: plainDeck },
      { auth: true, signal: opts.signal },
    );
    return slides;
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      throw new StyleDeckError('rate_limited', error.retryAfterSec);
    }
    console.error('style-deck request failed:', error);
    throw new StyleDeckError('failed');
  }
}
