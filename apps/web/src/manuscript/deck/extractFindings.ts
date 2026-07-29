/**
 * Client for POST /api/narrative/extract-findings — the talk path's
 * LLM extraction step. Mirrors condenseClient.ts: auth rides the
 * anonymous-first Supabase session, and failures collapse to a small
 * closed set so the chat shell can respond generically without ever
 * surfacing raw error text.
 *
 * The server has already run the verbatim fidelity gate, so every
 * RankedFinding returned here carries a sourceQuote that appears in the
 * results text — safe to hand straight to buildDeck().
 */
import { ApiError, postJson } from '../../lib/apiClient';
import { supabase } from '../../lib/supabase';
import { ensureSession } from '../../lib/auth';

/** Matches buildDeck.ts's RankedFinding (plus `rank`), so the result
 *  feeds the deck builder directly. Kept structurally identical to the
 *  server's response contract in apps/api/src/narrative.ts. */
export interface RankedFinding {
  text: string;
  sourceQuote: string;
  sourceSection: string;
  rank: number;
}

interface ExtractResponse {
  findings: RankedFinding[];
}

export type ExtractFailure = 'rate_limited' | 'failed';

export class ExtractFindingsError extends Error {
  constructor(
    public readonly kind: ExtractFailure,
    public readonly retryAfterSec?: number,
  ) {
    super(kind);
    this.name = 'ExtractFindingsError';
  }
}

export interface ExtractOptions {
  /** Optional short framing (title, one-line summary) to orient ranking. */
  context?: string;
  signal?: AbortSignal;
}

/**
 * Extract ranked findings from a paper's results text. Returns the
 * gated, contiguously-ranked findings; an empty array is a legitimate
 * outcome (no finding survived the fidelity gate), not an error.
 */
export async function extractRankedFindings(
  resultsText: string,
  opts: ExtractOptions = {},
): Promise<RankedFinding[]> {
  try {
    // Anonymous-first: ensure a Supabase session exists before the authed
    // call (idempotent — resolves instantly when one already exists).
    await ensureSession(supabase);

    const { findings } = await postJson<ExtractResponse>(
      '/api/narrative/extract-findings',
      {
        resultsText,
        ...(opts.context ? { context: opts.context } : {}),
      },
      { auth: true, signal: opts.signal },
    );
    return findings;
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      throw new ExtractFindingsError('rate_limited', error.retryAfterSec);
    }
    console.error('extract-findings request failed:', error);
    throw new ExtractFindingsError('failed');
  }
}
