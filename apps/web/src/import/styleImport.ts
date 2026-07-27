/**
 * styleImport — the copy-a-design client pipeline (Phase 1: colours
 * and fonts; docs/plans/2026-07-27-design-style-extraction.md §3).
 *
 * drop poster (img / PDF)
 *   ├─► client: pixel clustering        (free, instant, no API call)
 *   └─► rasterise → upload temp → POST /api/import/extract
 *       mode 'extract-style'            (roles + font, forced tool-use)
 *             │
 *             ▼
 *       palette reconciliation (roles from the model, values from
 *       the clustering — styleExtraction.reconcilePalette)
 *
 * Failure shape follows plan §5: when the vision call fails, the
 * client-side palette has already been extracted, so the caller gets
 * a colours-only result rather than nothing. Rate limits surface a
 * user-actionable message that says when the cap resets.
 */
import { nanoid } from 'nanoid';
import type { ExtractedStyle, Palette } from '@postr/shared';
import { supabase } from '@/lib/supabase';
import { postJson, ApiError, formatRetryAfter } from '@/lib/apiClient';
import {
  extractDistinctColorsFromCanvas,
  hexListToPalette,
} from '@/poster/paletteTools';
import { clampPrintSafe, reconcilePalette } from '@/poster/styleExtraction';
import {
  canvasToBlob,
  downscaleForVision,
  rasterizeImage,
  rasterizePdfFirstPage,
  releaseCanvas,
} from './imageImport';

export type StyleImportStage = 'reading' | 'colours' | 'matching';

/** User-actionable failure — `userMessage` is safe to render verbatim
 *  (plan §5 rows: unreadable input, rate limit, expired session). */
export class StyleImportError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
    this.name = 'StyleImportError';
  }
}

export interface StyleImportResult {
  /** Server extraction, or null when the vision call failed and only
   *  the client-side colours are available. */
  extracted: ExtractedStyle | null;
  /** The palette to offer: reconciled (model roles + clustered
   *  values) when extraction succeeded, cluster-only otherwise.
   *  Always print-safe-clamped. */
  palette: Palette;
  /** True when `palette` came from client-side clustering only. */
  coloursOnly: boolean;
  /** The underlying vision failure when `coloursOnly` — kept for the
   *  Send Feedback report, never shown to the user directly. */
  visionError: unknown;
}

const UNREADABLE_MESSAGE =
  "That doesn't look like a poster — try a photo or PDF of the whole thing.";

/**
 * Extract a poster's style from a dropped file. Throws
 * `StyleImportError` for user-actionable cases; anything else
 * degrades to a colours-only result (see StyleImportResult).
 */
export async function extractStyleFromFile(
  file: File,
  posterId: string,
  onStage?: (stage: StyleImportStage) => void,
): Promise<StyleImportResult> {
  onStage?.('reading');

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    throw new StyleImportError(
      'no_user',
      'Sign-in expired. Please refresh and try again.',
    );
  }

  const lower = file.name.toLowerCase();
  const isPdf = lower.endsWith('.pdf') || file.type === 'application/pdf';
  let raster: {
    canvas: HTMLCanvasElement;
    pageWidthPt: number;
    pageHeightPt: number;
  };
  try {
    raster = isPdf
      ? await rasterizePdfFirstPage(file)
      : await rasterizeImage(file);
  } catch (err) {
    // Undecodable input is "not a poster", not a bug (plan §5 row 1).
    throw new StyleImportError(
      err instanceof Error ? err.message : 'rasterize_failed',
      UNREADABLE_MESSAGE,
    );
  }

  const pageCanvas = raster.canvas;
  try {
    onStage?.('colours');
    const clusteredColors = extractDistinctColorsFromCanvas(pageCanvas);
    const clusterPalette = clampPrintSafe(hexListToPalette(clusteredColors));

    onStage?.('matching');
    let extracted: ExtractedStyle | null = null;
    let visionError: unknown = null;
    try {
      extracted = await callExtractStyle(
        pageCanvas,
        raster.pageWidthPt,
        raster.pageHeightPt,
        posterId,
        userId,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        // Rate limit is user-actionable: say when it resets (§5).
        const wait = err.retryAfterSec
          ? ` Try again in ${formatRetryAfter(err.retryAfterSec)}.`
          : '';
        const isDaily =
          typeof err.body === 'object' &&
          err.body !== null &&
          (err.body as { error?: string }).error === 'daily_limit_exceeded';
        const lead = isDaily
          ? 'Daily design-copy limit reached.'
          : 'Too many requests right now.';
        throw new StyleImportError('rate_limited', `${lead}${wait}`);
      }
      // Everything else degrades to colours-only — the client-side
      // extraction already ran, so offer colours rather than nothing.
      visionError = err;
    }

    if (extracted) {
      return {
        extracted,
        palette: reconcilePalette(extracted.palette, clusteredColors),
        coloursOnly: false,
        visionError: null,
      };
    }
    return {
      extracted: null,
      palette: clusterPalette,
      coloursOnly: true,
      visionError,
    };
  } finally {
    releaseCanvas(pageCanvas);
  }
}

/** Upload a downscaled JPEG to the user's temp storage path, call the
 *  extract-style mode, then best-effort delete the temp upload. */
async function callExtractStyle(
  pageCanvas: HTMLCanvasElement,
  pageWidthPt: number,
  pageHeightPt: number,
  posterId: string,
  userId: string,
): Promise<ExtractedStyle> {
  const uploadCanvas = downscaleForVision(pageCanvas);
  const uploadBlob = await canvasToBlob(uploadCanvas, 'image/jpeg', 0.85);
  if (uploadCanvas !== pageCanvas) releaseCanvas(uploadCanvas);
  if (!uploadBlob) throw new Error('Could not encode upload image.');

  // Same temp prefix as the import pipeline so the same RLS policies
  // and (eventual) cleanup sweep apply.
  const tempPath = `${userId}/temp/${posterId}/style-${nanoid(8)}.jpg`;
  const { error: uploadErr } = await supabase.storage
    .from('poster-assets')
    .upload(tempPath, uploadBlob, {
      contentType: 'image/jpeg',
      upsert: true,
    });
  if (uploadErr) {
    throw new Error(`Could not upload style source: ${uploadErr.message}`);
  }

  try {
    const { data: signed, error: signErr } = await supabase.storage
      .from('poster-assets')
      .createSignedUrl(tempPath, 600);
    if (signErr || !signed?.signedUrl) {
      throw new Error('Could not sign upload URL for the style call.');
    }

    return await postJson<ExtractedStyle>(
      '/api/import/extract',
      {
        imageUrl: signed.signedUrl,
        pageWidthPt,
        pageHeightPt,
        mode: 'extract-style',
        model: 'claude',
      },
      { auth: true },
    );
  } finally {
    // Best-effort cleanup — matches the existing import flow.
    void supabase.storage.from('poster-assets').remove([tempPath]);
  }
}
