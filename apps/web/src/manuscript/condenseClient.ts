/**
 * Client for POST /api/narrative/condense — the pipeline's single LLM
 * call. Auth rides the anonymous-first Supabase session; failures map
 * to a small closed set so the chat shell can respond generically
 * without ever surfacing raw error text.
 */
import type {
  CondenseEmphasis,
  CondensedNarrative,
  MappedPinnedSection,
  MappedRole,
} from '@postr/shared';
import { ApiError, postJson } from '../lib/apiClient';
import { supabase } from '../lib/supabase';
import { ensureSession } from '../lib/auth';

export type CondenseFailure = 'rate_limited' | 'failed';

export class CondenseError extends Error {
  constructor(
    public readonly kind: CondenseFailure,
    public readonly retryAfterSec?: number,
  ) {
    super(kind);
    this.name = 'CondenseError';
  }
}

export async function requestCondense(
  roles: MappedRole[],
  pinned: MappedPinnedSection[],
  emphasis: CondenseEmphasis,
): Promise<CondensedNarrative> {
  try {
    // Anonymous-first: make sure a Supabase session exists before the
    // authed call (idempotent — resolves instantly when one exists).
    await ensureSession(supabase);

    return await postJson<CondensedNarrative>(
      '/api/narrative/condense',
      {
        roles: roles
          .filter((r) => r.sourceText.trim())
          .map((r) => ({
            role: r.role,
            budgetWords: r.budgetWords,
            sourceText: r.sourceText,
          })),
        pinned: pinned.map((p) => ({
          id: p.id,
          heading: p.heading,
          budgetWords: p.budgetWords,
          sourceText: p.sourceText,
        })),
        emphasis,
      },
      { auth: true },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      throw new CondenseError('rate_limited', error.retryAfterSec);
    }
    console.error('condense request failed:', error);
    throw new CondenseError('failed');
  }
}
