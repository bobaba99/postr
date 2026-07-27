/**
 * styleExtraction — palette reconciliation + print-safe clamping for
 * the copy-a-design flow (Phase 1 of the 2026-07-27 plan).
 *
 * §3.1 of the plan: we get colours twice. Pixel clustering is accurate
 * about WHAT colours are on the page but blind to roles; the vision
 * model understands ROLES but reports colour imprecisely. So: take
 * roles from the model, take values from the clustering — for each
 * role, snap the model's hex to the nearest clustered colour by
 * CIEDE2000 (in Lab), and keep the model's hex when no cluster is
 * close enough.
 *
 * The result is then clamped print-safe (no pure black background, no
 * neon) per PRD §16. Colour-vision-deficiency checking is NOT done
 * here — the UI runs `auditPaletteCB` and surfaces the existing
 * inline warning, applying anyway (plan §5).
 */
import type { Palette } from '@postr/shared';
import { ciede2000 } from './colorDistance';
import { hexToHsl, hslToHex, normalizeHex } from './paletteTools';

/**
 * Snap threshold in ΔE00. Within ~10 the two hexes read as "the same
 * colour, imprecisely reported" (the vision-model regime we are
 * correcting); beyond it the model likely means a colour the
 * clustering missed (e.g. a thin rule too small to survive
 * downsampling), so we keep the model's value.
 */
export const SNAP_THRESHOLD_DE2000 = 10;

/** Background lightness floor (HSL %) — "no pure black bg" (PRD §16).
 *  Full-bleed toner-black cracks and banding-prints; a near-black
 *  keeps the look without the print hazard. */
const BG_MIN_LIGHTNESS = 10;

/** Saturation ceiling (HSL %) — "no neon" (PRD §16). Above this the
 *  colour is out of most CMYK gamuts and prints as a muddy surprise. */
const MAX_SATURATION = 92;

/**
 * Merge model-assigned roles with clustered pixel values (plan §3.1),
 * then clamp the result print-safe.
 *
 * @param modelPalette role assignment from the extract-style call
 * @param clusteredColors distinct hex colours from client-side pixel
 *   clustering of the same image (order irrelevant)
 */
export function reconcilePalette(
  modelPalette: Palette,
  clusteredColors: string[],
): Palette {
  const snap = (modelHex: string): string =>
    snapToCluster(modelHex, clusteredColors);
  return clampPrintSafe({
    bg: snap(modelPalette.bg),
    primary: snap(modelPalette.primary),
    accent: snap(modelPalette.accent),
    accent2: snap(modelPalette.accent2),
    muted: snap(modelPalette.muted),
    headerBg: snap(modelPalette.headerBg),
    headerFg: snap(modelPalette.headerFg),
  });
}

/** Nearest clustered colour by ΔE00, or the (normalised) model hex
 *  when nothing is within the snap threshold. */
function snapToCluster(modelHex: string, clusteredColors: string[]): string {
  const fallback = normalizeHex(modelHex) ?? modelHex.toUpperCase();
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const candidate of clusteredColors) {
    const normalized = normalizeHex(candidate);
    if (!normalized) continue;
    const d = ciede2000(fallback, normalized);
    if (d < bestDistance) {
      bestDistance = d;
      best = normalized;
    }
  }
  return best !== null && bestDistance <= SNAP_THRESHOLD_DE2000
    ? best
    : fallback;
}

/**
 * Print-safety clamp (PRD §16): lift a pure-black background to
 * near-black, and pull any over-saturated ("neon") role back inside
 * a printable saturation. Values already safe pass through unchanged.
 */
export function clampPrintSafe(palette: Palette): Palette {
  return {
    bg: liftPureBlack(desaturateNeon(palette.bg)),
    primary: desaturateNeon(palette.primary),
    accent: desaturateNeon(palette.accent),
    accent2: desaturateNeon(palette.accent2),
    muted: desaturateNeon(palette.muted),
    headerBg: desaturateNeon(palette.headerBg),
    headerFg: desaturateNeon(palette.headerFg),
  };
}

function liftPureBlack(hex: string): string {
  const [h, s, l] = hexToHsl(hex);
  if (l >= BG_MIN_LIGHTNESS) return hex;
  return hslToHex(h, s, BG_MIN_LIGHTNESS + 2);
}

function desaturateNeon(hex: string): string {
  const [h, s, l] = hexToHsl(hex);
  if (s <= MAX_SATURATION) return hex;
  return hslToHex(h, MAX_SATURATION, l);
}
