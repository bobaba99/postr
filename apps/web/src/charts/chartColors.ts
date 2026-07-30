/**
 * Palette-slot resolution and color helpers for chart rendering.
 *
 * Charts never store hex — they store slot names ('accent',
 * 'primary', …) resolved against the poster palette at render time,
 * so restyling the poster restyles every chart. Slot order is fixed
 * per chart; repeats cycle with a white-mix so a 6-series chart on a
 * 4-slot palette still gets distinguishable hues.
 */
import type { Palette } from '@postr/shared';
import { findSeriesPalette } from './seriesPalettes';

const HEX = /^#?([0-9a-f]{6})$/i;

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseHex(hex: string): [number, number, number] | null {
  const match = HEX.exec(hex.trim());
  if (!match || !match[1]) return null;
  const v = parseInt(match[1], 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

/** Mix `hex` toward `toward` by t ∈ [0, 1]. Returns hex. */
export function mixHex(hex: string, toward: string, t: number): string {
  const a = parseHex(hex);
  const b = parseHex(toward);
  if (!a || !b) return hex;
  const mixed = a.map((ch, i) => clamp255(ch + ((b[i] ?? ch) - ch) * t));
  return `#${mixed.map((ch) => ch.toString(16).padStart(2, '0')).join('')}`;
}

/** Resolve one palette slot to a concrete color. */
export function resolveSlot(slot: string, palette: Palette): string {
  const table: Record<string, string> = {
    bg: palette.bg,
    primary: palette.primary,
    accent: palette.accent,
    accent2: palette.accent2,
    muted: palette.muted,
    headerBg: palette.headerBg,
    headerFg: palette.headerFg,
  };
  return table[slot] ?? palette.accent;
}

/**
 * Concrete colors for `count` series. Cycles the stored slots;
 * second lap is mixed 40% toward white so repeats stay separable.
 */
export function seriesColors(count: number, slots: string[], palette: Palette): string[] {
  const base = (slots.length > 0 ? slots : ['accent']).map((s) => resolveSlot(s, palette));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const color = base[i % base.length] ?? palette.accent;
    const lap = Math.floor(i / base.length);
    out.push(lap === 0 ? color : mixHex(color, '#ffffff', Math.min(0.7, lap * 0.4)));
  }
  return out;
}

/**
 * Categorical series colours for a chart, honouring an optional fixed
 * science palette. With `seriesPaletteId` set and resolvable, the
 * palette's colours are used (truncated to `count`, or cycled with the
 * same white-mix `seriesColors` uses once the set is exhausted). With
 * it unset or stale (`findSeriesPalette` → null), falls back to
 * slot-based colouring so a removed palette degrades to the poster
 * theme rather than a crash. Always returns exactly `count` colours.
 */
export function resolveSeriesColors(
  seriesPaletteId: string | undefined,
  count: number,
  slots: string[],
  palette: Palette,
): string[] {
  const fixed = seriesPaletteId ? findSeriesPalette(seriesPaletteId) : null;
  if (!fixed) return seriesColors(count, slots, palette);
  const base = fixed.colors;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const color = base[i % base.length] ?? palette.accent;
    const lap = Math.floor(i / base.length);
    out.push(lap === 0 ? color : mixHex(color, '#ffffff', Math.min(0.7, lap * 0.4)));
  }
  return out;
}

/** Two-stop sequential ramp for heatmaps: near-paper → accent. */
export function sequentialRamp(slots: string[], palette: Palette): [string, string] {
  const accent = resolveSlot(slots[0] ?? 'accent', palette);
  return [mixHex(accent, '#ffffff', 0.92), accent];
}

/**
 * Diverging ramp for Likert scales: disagreement in accent2,
 * agreement in accent, neutral in warm gray. `negatives`/`positives`
 * are the level counts on each side of the neutral point.
 */
export function divergingRamp(
  negatives: number,
  hasNeutral: boolean,
  positives: number,
  palette: Palette,
): string[] {
  const out: string[] = [];
  // Outermost (strongest) level on each side gets the full color;
  // levels fade toward white as they approach the neutral point.
  for (let i = 0; i < negatives; i++) {
    out.push(mixHex(palette.accent2, '#ffffff', (0.55 * i) / Math.max(1, negatives - 1)));
  }
  if (hasNeutral) out.push('#c9c6c0');
  for (let i = 0; i < positives; i++) {
    out.push(mixHex(palette.accent, '#ffffff', (0.55 * (positives - 1 - i)) / Math.max(1, positives - 1)));
  }
  return out;
}
