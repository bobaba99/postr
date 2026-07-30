/**
 * Tests for the extract-findings client adapter. Mirrors how
 * condenseClient is meant to be tested: postJson (the API layer) and
 * ensureSession are mocked, so no real network or Supabase call fires.
 * Asserts the request shape, the anonymous-first session guard, the
 * pass-through of results, and the closed failure mapping (429 →
 * rate_limited, everything else → failed).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const postJson = vi.fn();
const ensureSession = vi.fn();

vi.mock('../../../lib/apiClient', async () => {
  // Keep the real ApiError so `instanceof` in the adapter works.
  const actual = await vi.importActual<typeof import('../../../lib/apiClient')>(
    '../../../lib/apiClient',
  );
  return { ...actual, postJson: (...args: unknown[]) => postJson(...args) };
});

vi.mock('../../../lib/supabase', () => ({ supabase: {} }));

vi.mock('../../../lib/auth', () => ({
  ensureSession: (...args: unknown[]) => ensureSession(...args),
}));

import { ApiError } from '../../../lib/apiClient';
import { extractRankedFindings, ExtractFindingsError } from '../extractFindings';

const FINDINGS = [
  {
    text: 'Spacing raised recall by 34%.',
    sourceQuote: 'Spacing raised delayed recall by 34%',
    sourceSection: 'Results',
    rank: 1,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  ensureSession.mockResolvedValue(null);
});

describe('extractRankedFindings', () => {
  it('ensures a session, POSTs the results text, and returns the findings', async () => {
    postJson.mockResolvedValue({ findings: FINDINGS });

    const out = await extractRankedFindings('Spacing raised delayed recall by 34%.');

    expect(ensureSession).toHaveBeenCalledTimes(1);
    expect(out).toEqual(FINDINGS);
    expect(postJson).toHaveBeenCalledTimes(1);
    const [path, body, options] = postJson.mock.calls[0]!;
    expect(path).toBe('/api/narrative/extract-findings');
    expect(body).toEqual({ resultsText: 'Spacing raised delayed recall by 34%.' });
    expect(options).toMatchObject({ auth: true });
  });

  it('forwards an optional context and abort signal', async () => {
    postJson.mockResolvedValue({ findings: [] });
    const signal = new AbortController().signal;

    await extractRankedFindings('results', { context: 'A memory study.', signal });

    const [, body, options] = postJson.mock.calls[0]!;
    expect(body).toEqual({ resultsText: 'results', context: 'A memory study.' });
    expect(options).toMatchObject({ auth: true, signal });
  });

  it('omits context from the body when not provided', async () => {
    postJson.mockResolvedValue({ findings: [] });
    await extractRankedFindings('results');
    const [, body] = postJson.mock.calls[0]!;
    expect(body).not.toHaveProperty('context');
  });

  it('returns an empty array without error when nothing survives the gate', async () => {
    postJson.mockResolvedValue({ findings: [] });
    await expect(extractRankedFindings('results')).resolves.toEqual([]);
  });

  it('maps a 429 to ExtractFindingsError(rate_limited) with retryAfter', async () => {
    postJson.mockRejectedValue(new ApiError('rate_limited', 429, null, 42));

    await expect(extractRankedFindings('results')).rejects.toMatchObject({
      kind: 'rate_limited',
      retryAfterSec: 42,
    });
  });

  it('maps any other failure to ExtractFindingsError(failed)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    postJson.mockRejectedValue(new ApiError('extract_failed', 502, null));

    const err = await extractRankedFindings('results').catch((e) => e);
    expect(err).toBeInstanceOf(ExtractFindingsError);
    expect(err.kind).toBe('failed');
  });

  it('maps a thrown non-ApiError to failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    postJson.mockRejectedValue(new Error('network down'));

    await expect(extractRankedFindings('results')).rejects.toMatchObject({
      kind: 'failed',
    });
  });
});
