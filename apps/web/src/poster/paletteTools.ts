/**
 * Palette tools — color math, parsing, random generation, image extraction.
 *
 * Used by PaletteDesigner to let users build custom academic palettes
 * without leaving the editor. The 7-role palette shape (bg / primary /
 * accent / accent2 / muted / headerBg / headerFg) is fixed by the
 * Palette type in @postr/shared — these tools all produce values that
 * satisfy that shape, so the rest of the poster renderer doesn't have
 * to care whether a palette came from the curated catalog, user input,
 * a pasted Coolors URL, or an image.
 */
import type { Palette } from '@postr/shared';

// ── RGB/HSL/Hex helpers ───────────────────────────────────────────

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    // #abc → #aabbcc
    const a = clean.charAt(0);
    const b = clean.charAt(1);
    const c = clean.charAt(2);
    return [
      parseInt(a + a, 16),
      parseInt(b + b, 16),
      parseInt(c + c, 16),
    ];
  }
  const n = parseInt(clean, 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (c: number) =>
    Math.round(Math.max(0, Math.min(255, c)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function rgbToHsl(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  return [h, s * 100, l * 100];
}

export function hslToRgb(
  h: number,
  s: number,
  l: number,
): [number, number, number] {
  const hn = (((h % 360) + 360) % 360) / 360;
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;
  if (sn === 0) {
    const v = ln * 255;
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
  };
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  return [
    hue2rgb(p, q, hn + 1 / 3) * 255,
    hue2rgb(p, q, hn) * 255,
    hue2rgb(p, q, hn - 1 / 3) * 255,
  ];
}

export function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

export function hslToHex(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

/** Relative luminance per WCAG (0 = black, 1 = white). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const toLin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

/** Best contrast foreground (white or near-black) for a background. */
export function contrastForeground(bgHex: string): string {
  return luminance(bgHex) < 0.5 ? '#FFFFFF' : '#111111';
}

// ── Text → hex list ───────────────────────────────────────────────

/**
 * Extract hex codes from arbitrary text. Handles Coolors URLs, Adobe
 * exports, JSON arrays, comma lists, or anything containing `#rrggbb`
 * or bare `rrggbb` tokens. Short `#abc` codes also work.
 */
export function parsePaletteText(text: string): string[] {
  // Step 1: normalize Coolors URL format to bare hex tokens.
  // Coolors URLs look like `.../palette/264653-2a9d8f-e9c46a-...`
  const urlMatch = text.match(/coolors\.co\/(?:palette\/)?([0-9a-f-]+)/i);
  const source = urlMatch
    ? urlMatch[1]!.split('-').join(' ')
    : text;

  // Step 2: match #rrggbb, bare rrggbb (6 hex), and #rgb (3 hex).
  const hexes: string[] = [];
  const seen = new Set<string>();
  // Only match hex sequences that are NOT part of a longer alphanumeric
  // run (so "abc123456" doesn't match). Use word boundaries.
  const pattern = /#?\b(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi;
  const matches = source.match(pattern) || [];
  for (const raw of matches) {
    let clean = raw.replace('#', '').toLowerCase();
    if (clean.length === 3) {
      clean = clean[0]! + clean[0]! + clean[1]! + clean[1]! + clean[2]! + clean[2]!;
    }
    const hex = '#' + clean.toUpperCase();
    if (!seen.has(hex)) {
      seen.add(hex);
      hexes.push(hex);
    }
  }
  return hexes;
}

// ── Hex list → Palette ────────────────────────────────────────────

/**
 * Map an arbitrary list of hex colors to the 7-role palette shape.
 *
 * Strategy: sort by luminance, take lightest as background (boosted
 * if not light enough), darkest as primary, middle for accent roles.
 * Generates a sensible palette even from 2 input colors.
 */
export function hexListToPalette(hexes: string[]): Palette {
  if (hexes.length === 0) return fallbackPalette();
  if (hexes.length === 1) {
    // Single color: build a monochromatic palette around it.
    const [h, s] = hexToHsl(hexes[0]!);
    return generateRandomPalette('monochromatic', h, s);
  }

  const sorted = [...hexes].sort((a, b) => luminance(b) - luminance(a));
  const lightest = sorted[0]!;
  const darkest = sorted[sorted.length - 1]!;
  const middle = sorted.slice(1, -1);

  const bg =
    luminance(lightest) > 0.85 ? lightest : lightenTo(lightest, 96);
  const primary =
    luminance(darkest) < 0.15 ? darkest : darkenTo(darkest, 14);

  const accent = middle[0] ?? darkest;
  const accent2 = middle[1] ?? accent;
  const muted = desaturate(middle[2] ?? mix(lightest, darkest), 35);
  const headerBg =
    luminance(accent) < 0.3 ? accent : darkenTo(accent, 25);
  const headerFg = contrastForeground(headerBg);

  return { bg, primary, accent, accent2, muted, headerBg, headerFg };
}

function lightenTo(hex: string, targetL: number): string {
  const [h, s] = hexToHsl(hex);
  return hslToHex(h, Math.min(25, s * 0.4), targetL);
}

function darkenTo(hex: string, targetL: number): string {
  const [h, s] = hexToHsl(hex);
  return hslToHex(h, Math.min(90, s + 5), targetL);
}

function desaturate(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, Math.max(0, s - amount), l);
}

function mix(a: string, b: string): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex((ar + br) / 2, (ag + bg) / 2, (ab + bb) / 2);
}

function fallbackPalette(): Palette {
  return {
    bg: '#FFFFFF',
    primary: '#111111',
    accent: '#333333',
    accent2: '#666666',
    muted: '#999999',
    headerBg: '#111111',
    headerFg: '#FFFFFF',
  };
}

// ── Random palette generation (color theory) ──────────────────────

export type ColorStrategy =
  | 'monochromatic'
  | 'analogous'
  | 'complementary'
  | 'triadic'
  | 'split-complementary';

export const STRATEGY_LABELS: Record<ColorStrategy, string> = {
  monochromatic: 'Monochromatic',
  analogous: 'Analogous',
  complementary: 'Complementary',
  triadic: 'Triadic',
  'split-complementary': 'Split complementary',
};

/**
 * Generate a fresh academic palette using classical color theory.
 * Always produces a near-white background + dark primary so body
 * text stays readable — only the accent roles vary with strategy.
 */
export function generateRandomPalette(
  strategy: ColorStrategy,
  baseHue?: number,
  baseSat?: number,
): Palette {
  const h = baseHue ?? Math.floor(Math.random() * 360);
  const s = baseSat ?? 55 + Math.random() * 20; // 55-75%
  const accentL = 38 + Math.random() * 12; // 38-50% for punch + print safety

  // Shared roles: bright bg + very dark primary for readability.
  const bg = hslToHex(h, Math.min(20, s * 0.2), 97);
  const primary = hslToHex(h, Math.min(40, s * 0.6), 13);
  const accent = hslToHex(h, s, accentL);
  const headerBg = hslToHex(h, s + 5, Math.max(22, accentL - 14));
  const headerFg = contrastForeground(headerBg);

  let accent2Hue: number;
  let accent2SatDelta = 0;
  let accent2LDelta = 0;
  switch (strategy) {
    case 'monochromatic':
      return {
        bg,
        primary,
        accent,
        accent2: hslToHex(h, Math.max(15, s - 25), Math.min(72, accentL + 22)),
        muted: hslToHex(h, 18, 55),
        headerBg,
        headerFg,
      };
    case 'analogous':
      accent2Hue = h + 30;
      break;
    case 'complementary':
      accent2Hue = h + 180;
      accent2LDelta = 4;
      break;
    case 'triadic':
      accent2Hue = h + 120;
      accent2SatDelta = -5;
      break;
    case 'split-complementary':
      accent2Hue = h + 150;
      accent2LDelta = 6;
      break;
  }

  return {
    bg,
    primary,
    accent,
    accent2: hslToHex(
      accent2Hue,
      Math.max(30, s + accent2SatDelta),
      accentL + accent2LDelta,
    ),
    muted: hslToHex(h, 20, 52),
    headerBg,
    headerFg,
  };
}

// ── Image → Palette (canvas quantization) ─────────────────────────

/**
 * Extract a palette from an uploaded image. Downsamples to a small
 * canvas, buckets pixels by reducing to 5 bits/channel, picks the
 * most frequent distinct-enough colors, and feeds them through
 * `hexListToPalette`. Works on PNG/JPEG/WebP — anything HTMLImageElement
 * can decode.
 */
export async function extractPaletteFromImage(file: File): Promise<Palette> {
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  const MAX = 120;
  const scale = Math.min(MAX / img.width, MAX / img.height, 1);
  canvas.width = Math.max(1, Math.floor(img.width * scale));
  canvas.height = Math.max(1, Math.floor(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return fallbackPalette();
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  // Bucket by reducing precision to 5 bits per channel.
  const buckets = new Map<
    number,
    { r: number; g: number; b: number; count: number }
  >();
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]!;
    if (a < 128) continue; // skip transparent
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const existing = buckets.get(key);
    if (existing) {
      existing.r += r;
      existing.g += g;
      existing.b += b;
      existing.count++;
    } else {
      buckets.set(key, { r, g, b, count: 1 });
    }
  }

  // Compute bucket averages, sort by frequency.
  const sorted = [...buckets.values()]
    .map((bk) => ({
      hex: rgbToHex(bk.r / bk.count, bk.g / bk.count, bk.b / bk.count),
      count: bk.count,
    }))
    .sort((a, b) => b.count - a.count);

  // Pick top distinct-enough colors (at least ~60 Euclidean apart).
  const picked: string[] = [];
  for (const { hex } of sorted) {
    if (picked.length === 0 || picked.every((p) => hexDistance(p, hex) > 55)) {
      picked.push(hex);
      if (picked.length >= 6) break;
    }
  }

  return hexListToPalette(picked);
}

function hexDistance(a: string, b: string): number {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

// ── Validation ────────────────────────────────────────────────────

/** Normalize a raw hex input (`abc`, `#abc`, `AABBCC`) → `#AABBCC`. */
export function normalizeHex(input: string): string | null {
  const trimmed = input.trim().replace('#', '');
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(trimmed)) return null;
  if (trimmed.length === 3) {
    const a = trimmed.charAt(0);
    const b = trimmed.charAt(1);
    const c = trimmed.charAt(2);
    return ('#' + a + a + b + b + c + c).toUpperCase();
  }
  return '#' + trimmed.toUpperCase();
}
