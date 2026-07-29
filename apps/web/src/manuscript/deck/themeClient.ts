/**
 * Client for POST /api/narrative/theme — Arm T of the Phase-2
 * paper-to-slides experiment: a cheap LLM call that produces a
 * field-appropriate `Theme` (palette + type scale) plus 4 palette
 * variations for the palette slide / re-vibe UI.
 *
 * Mirrors extractFindings.ts / styleClient.ts: auth rides the
 * anonymous-first Supabase session, and failures collapse to a small
 * closed set so the caller can respond generically without ever
 * surfacing raw error text.
 *
 * CROSS-PACKAGE NOTE (Theme shape): the api's response
 * (apps/api/src/narrative/themeGen.ts's `RawTheme`) carries an extra
 * `rationale: string` field that the web `Theme` type (styledTypes.ts)
 * does NOT have — nothing in the web deck/theme pipeline consumes a
 * rationale today. This adapter DELIBERATELY drops it by mapping only
 * the fields `Theme` declares (palette, typeScale, accentTreatment)
 * rather than spreading the raw response — so it's an explicit,
 * type-checked omission, not a silent one. If a future feature wants
 * to surface the rationale (e.g. an explanation tooltip), add it to
 * `Theme` in styledTypes.ts first and this mapping will start
 * type-erroring until it's included.
 */
import { ApiError, postJson } from '../../lib/apiClient';
import { supabase } from '../../lib/supabase';
import { ensureSession } from '../../lib/auth';
import type { Theme } from './styledTypes';

/** The api's raw theme shape — `Theme` plus `rationale`. Declared
 *  narrowly here (not imported from the api package) since the web
 *  package cannot depend on api code. */
interface RawTheme extends Theme {
  rationale: string;
}

interface ThemeGenResponse {
  theme: RawTheme;
  palettes: string[][];
}

export interface ThemeGenResult {
  theme: Theme;
  palettes: string[][];
}

export type ThemeGenFailure = 'rate_limited' | 'failed';

export class ThemeGenError extends Error {
  constructor(
    public readonly kind: ThemeGenFailure,
    public readonly retryAfterSec?: number,
  ) {
    super(kind);
    this.name = 'ThemeGenError';
  }
}

export interface ThemeGenOptions {
  signal?: AbortSignal;
}

/**
 * Generate a field-appropriate theme + 4 palette variations for a
 * topic, optionally steered by a short "vibe" note (a re-vibe re-run
 * passes only `vibe` differently). The api's `rationale` field is
 * intentionally dropped — see this module's header comment.
 */
export async function generateTheme(
  topic: string,
  vibe: string | undefined,
  opts: ThemeGenOptions = {},
): Promise<ThemeGenResult> {
  try {
    // Anonymous-first: ensure a Supabase session exists before the authed
    // call (idempotent — resolves instantly when one already exists).
    await ensureSession(supabase);

    const { theme, palettes } = await postJson<ThemeGenResponse>(
      '/api/narrative/theme',
      {
        topic,
        ...(vibe ? { vibe } : {}),
      },
      { auth: true, signal: opts.signal },
    );

    // Map onto the web Theme shape explicitly, dropping `rationale`.
    const mappedTheme: Theme = {
      palette: theme.palette,
      typeScale: theme.typeScale,
      accentTreatment: theme.accentTreatment,
    };
    return { theme: mappedTheme, palettes };
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      throw new ThemeGenError('rate_limited', error.retryAfterSec);
    }
    console.error('theme request failed:', error);
    throw new ThemeGenError('failed');
  }
}
