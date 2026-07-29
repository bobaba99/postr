/**
 * Tests for the style-deck client adapter. Mirrors how extractFindings
 * is tested: postJson (the API layer) and ensureSession are mocked, so
 * no real network or Supabase call fires. Asserts the request shape,
 * the anonymous-first session guard, the mapping onto the web
 * StyledSlide type, and the closed failure mapping (429 → rate_limited,
 * everything else → failed).
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
import { styleDeck, StyleDeckError } from '../styleClient';
import type { SlideDeck } from '../types';

const PLAIN_DECK: SlideDeck = {
  slides: [
    {
      role: 'title',
      assertion: 'Spacing improves recall.',
      evidence: null,
      sourceQuote: 'Spacing raised delayed recall by 34%',
      speakerNotes: [],
      references: [],
      wordCapCut: false,
    },
  ],
  durationMinutes: 8,
};

const RAW_SLIDES = [
  {
    role: 'title',
    device: 'plain',
    elements: [{ kind: 'title', text: 'Spacing improves recall.', x: 0.7, y: 0.5 }],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  ensureSession.mockResolvedValue(null);
});

describe('styleDeck', () => {
  it('ensures a session, POSTs the plain deck, and returns styled slides', async () => {
    postJson.mockResolvedValue({ slides: RAW_SLIDES });

    const out = await styleDeck(PLAIN_DECK);

    expect(ensureSession).toHaveBeenCalledTimes(1);
    expect(out).toEqual(RAW_SLIDES);
    expect(postJson).toHaveBeenCalledTimes(1);
    const [path, body, options] = postJson.mock.calls[0]!;
    expect(path).toBe('/api/narrative/style-deck');
    expect(body).toEqual({ deck: PLAIN_DECK });
    expect(options).toMatchObject({ auth: true });
  });

  it('forwards an abort signal', async () => {
    postJson.mockResolvedValue({ slides: [] });
    const signal = new AbortController().signal;

    await styleDeck(PLAIN_DECK, { signal });

    const [, , options] = postJson.mock.calls[0]!;
    expect(options).toMatchObject({ auth: true, signal });
  });

  it('maps a 429 to StyleDeckError(rate_limited) with retryAfter', async () => {
    postJson.mockRejectedValue(new ApiError('rate_limited', 429, null, 17));

    await expect(styleDeck(PLAIN_DECK)).rejects.toMatchObject({
      kind: 'rate_limited',
      retryAfterSec: 17,
    });
  });

  it('maps any other failure to StyleDeckError(failed)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    postJson.mockRejectedValue(new ApiError('style_failed', 502, null));

    const err = await styleDeck(PLAIN_DECK).catch((e) => e);
    expect(err).toBeInstanceOf(StyleDeckError);
    expect(err.kind).toBe('failed');
  });

  it('maps a thrown non-ApiError to failed and never leaks raw error text', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    postJson.mockRejectedValue(new Error('network down'));

    const err = await styleDeck(PLAIN_DECK).catch((e) => e);
    expect(err).toBeInstanceOf(StyleDeckError);
    expect(err.kind).toBe('failed');
    expect(err.message).not.toContain('network down');
  });
});
