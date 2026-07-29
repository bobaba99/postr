/**
 * Tests for the theme-generation client adapter. Mirrors how
 * extractFindings/styleClient are tested: postJson (the API layer) and
 * ensureSession are mocked, so no real network or Supabase call fires.
 * Asserts the request shape, the anonymous-first session guard, the
 * mapping onto the web Theme type (dropping the api's `rationale`
 * field, which the web Theme type does not have), and the closed
 * failure mapping (429 → rate_limited, everything else → failed).
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
import { generateTheme, ThemeGenError } from '../themeClient';

const RAW_THEME_RESPONSE = {
  theme: {
    palette: ['#F5F5F0', '#1F2933', '#2E7D6B'],
    typeScale: { heading: 44, body: 20, label: 14 },
    accentTreatment: 'Use the accent sparingly for headings and key stats.',
    rationale: 'Calm clinical tones suit a medicine paper and stay legible from a distance.',
  },
  palettes: [
    ['#F5F5F0', '#1F2933', '#2E7D6B'],
    ['#FBF9F6', '#22223B', '#9A8C98'],
    ['#F0F4F8', '#102A43', '#486581'],
    ['#FFF8F0', '#3D2C29', '#C08552'],
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  ensureSession.mockResolvedValue(null);
});

describe('generateTheme', () => {
  it('ensures a session, POSTs the topic, and returns theme + palettes without rationale', async () => {
    postJson.mockResolvedValue(RAW_THEME_RESPONSE);

    const out = await generateTheme('memory and learning', undefined);

    expect(ensureSession).toHaveBeenCalledTimes(1);
    expect(out.theme).toEqual({
      palette: RAW_THEME_RESPONSE.theme.palette,
      typeScale: RAW_THEME_RESPONSE.theme.typeScale,
      accentTreatment: RAW_THEME_RESPONSE.theme.accentTreatment,
    });
    expect(out.theme).not.toHaveProperty('rationale');
    expect(out.palettes).toEqual(RAW_THEME_RESPONSE.palettes);

    expect(postJson).toHaveBeenCalledTimes(1);
    const [path, body, options] = postJson.mock.calls[0]!;
    expect(path).toBe('/api/narrative/theme');
    expect(body).toEqual({ topic: 'memory and learning' });
    expect(options).toMatchObject({ auth: true });
  });

  it('forwards an optional vibe and abort signal', async () => {
    postJson.mockResolvedValue(RAW_THEME_RESPONSE);
    const signal = new AbortController().signal;

    await generateTheme('memory and learning', 'warmer, bolder', { signal });

    const [, body, options] = postJson.mock.calls[0]!;
    expect(body).toEqual({ topic: 'memory and learning', vibe: 'warmer, bolder' });
    expect(options).toMatchObject({ auth: true, signal });
  });

  it('omits vibe from the body when not provided', async () => {
    postJson.mockResolvedValue(RAW_THEME_RESPONSE);
    await generateTheme('memory and learning', undefined);
    const [, body] = postJson.mock.calls[0]!;
    expect(body).not.toHaveProperty('vibe');
  });

  it('maps a 429 to ThemeGenError(rate_limited) with retryAfter', async () => {
    postJson.mockRejectedValue(new ApiError('rate_limited', 429, null, 9));

    await expect(generateTheme('topic', undefined)).rejects.toMatchObject({
      kind: 'rate_limited',
      retryAfterSec: 9,
    });
  });

  it('maps any other failure to ThemeGenError(failed)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    postJson.mockRejectedValue(new ApiError('theme_failed', 502, null));

    const err = await generateTheme('topic', undefined).catch((e) => e);
    expect(err).toBeInstanceOf(ThemeGenError);
    expect(err.kind).toBe('failed');
  });

  it('maps a thrown non-ApiError to failed and never leaks raw error text', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    postJson.mockRejectedValue(new Error('network down'));

    const err = await generateTheme('topic', undefined).catch((e) => e);
    expect(err).toBeInstanceOf(ThemeGenError);
    expect(err.kind).toBe('failed');
    expect(err.message).not.toContain('network down');
  });
});
