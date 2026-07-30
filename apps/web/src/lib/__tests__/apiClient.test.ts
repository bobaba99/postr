import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  },
}));

import {
  ApiResponseDecodeError,
  formatRetryAfter,
  postJson,
} from '../apiClient';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('formatRetryAfter', () => {
  it('falls back to "a moment" for zero / negative / non-finite', () => {
    expect(formatRetryAfter(0)).toBe('a moment');
    expect(formatRetryAfter(-5)).toBe('a moment');
    expect(formatRetryAfter(NaN)).toBe('a moment');
    expect(formatRetryAfter(Infinity)).toBe('a moment');
  });

  it('reports seconds under a minute', () => {
    expect(formatRetryAfter(1)).toBe('1 second');
    expect(formatRetryAfter(37)).toBe('37 seconds');
    // 59.4 ceils to 60 → rolls over to "1 minute" (not "60 seconds")
    expect(formatRetryAfter(59.4)).toBe('1 minute');
  });

  it('reports minutes under an hour, rounding up', () => {
    expect(formatRetryAfter(60)).toBe('1 minute');
    expect(formatRetryAfter(61)).toBe('2 minutes');
    expect(formatRetryAfter(120)).toBe('2 minutes');
    // 3599s ceils to 60min → rolls over to "1 hour" (not "60 minutes")
    expect(formatRetryAfter(3599)).toBe('1 hour');
  });

  it('reports hours under a day, rounding up', () => {
    expect(formatRetryAfter(3600)).toBe('1 hour');
    expect(formatRetryAfter(3601)).toBe('2 hours');
    expect(formatRetryAfter(7200)).toBe('2 hours');
  });

  it('reports "tomorrow" for ≥24h', () => {
    expect(formatRetryAfter(24 * 3600)).toBe('tomorrow');
    expect(formatRetryAfter(48 * 3600)).toBe('tomorrow');
  });
});

describe('postJson', () => {
  it('treats a successful response with an unreadable JSON body as ambiguous', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: vi.fn().mockRejectedValue(new SyntaxError('truncated JSON')),
    } as unknown as Response);

    await expect(postJson('/api/review/critique', {})).rejects.toBeInstanceOf(
      ApiResponseDecodeError,
    );
  });

  it('still maps a non-JSON error response to ApiError instead of a decode error', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 502,
      headers: new Headers(),
      json: vi.fn().mockRejectedValue(new SyntaxError('html response')),
    } as unknown as Response);

    await expect(postJson('/api/review/critique', {})).rejects.toMatchObject({
      name: 'ApiError',
      status: 502,
      message: 'Request failed (502)',
    });
  });
});
