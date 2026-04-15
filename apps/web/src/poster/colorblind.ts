/**
 * colorblind — simulate color-vision deficiency and audit whether
 * a palette's semantically-distinct colors stay distinguishable
 * under the most common forms.
 *
 * Math: Brettel / Viénot / Mollon linear LMS projection. It's the
 * standard closed-form model used by Coblis, sim-daltonism, and the
 * matplotlib colorblind kit. No external deps.
 *
 * Distance: CIE76 ΔE in Lab (Euclidean). Not CIEDE2000, but accurate
 * enough to answer "are these distinguishable?" which is all we need.
 */
import type { Palette } from '@postr/shared';
import { hexToRgb, rgbToHex } from './paletteTools';

export type CBType = 'deuteranopia' | 'protanopia' | 'tritanopia';

// ── sRGB ↔ linear RGB ↔ LMS ──────────────────────────────────────

function srgbToLinear(c: number): number {
  const n = c / 255;
  return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

// Hunt-Pointer-Estevez transform (sRGB linear → LMS).
function rgbLinearToLms(r: number, g: number, b: number): [number, number, number] {
  return [
    0.31399022 * r + 0.63951294 * g + 0.04649755 * b,
    0.15537241 * r + 0.75789446 * g + 0.08670142 * b,
    0.01775239 * r + 0.10944209 * g + 0.87256922 * b,
  ];
}

function lmsToRgbLinear(l: number, m: number, s: number): [number, number, number] {
  return [
    5.47221206 * l - 4.6419601 * m + 0.16963708 * s,
    -1.1252419 * l + 2.29317094 * m - 0.1678952 * s,
    0.02980165 * l - 0.19318073 * m + 1.16364789 * s,
  ];
}

// Brettel projection matrices (LMS → simulated LMS) for each deficiency.
// Coefficients from Viénot, Brettel & Mollon (1999) "Digital video
// colourmaps for checking the legibility of displays by dichromats".
const CB_MATRIX: Record<CBType, [number, number, number, number, number, number, number, number, number]> = {
  protanopia:   [0, 1.05118294, -0.05116099, 0, 1, 0, 0, 0, 1],
  deuteranopia: [1, 0, 0, 0.9513092, 0, 0.04866992, 0, 0, 1],
  tritanopia:   [1, 0, 0, 0, 1, 0, -0.86744736, 1.86727089, 0],
};

/** Simulate how `hex` looks under the given color-vision deficiency. */
export function simulateCB(hex: string, type: CBType): string {
  const [r8, g8, b8] = hexToRgb(hex);
  const [lr, lg, lb] = [srgbToLinear(r8), srgbToLinear(g8), srgbToLinear(b8)];
  const [l, m, s] = rgbLinearToLms(lr, lg, lb);
  const M = CB_MATRIX[type];
  const l2 = M[0] * l + M[1] * m + M[2] * s;
  const m2 = M[3] * l + M[4] * m + M[5] * s;
  const s2 = M[6] * l + M[7] * m + M[8] * s;
  const [nr, ng, nb] = lmsToRgbLinear(l2, m2, s2);
  return rgbToHex(linearToSrgb(nr), linearToSrgb(ng), linearToSrgb(nb));
}

// ── Lab distance (CIE76) ────────────────────────────────────────

function rgbToXyz(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  return [
    (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) * 100,
    (0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb) * 100,
    (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) * 100,
  ];
}

function xyzToLab(x: number, y: number, z: number): [number, number, number] {
  // D65 reference white.
  const xn = 95.047, yn = 100.0, zn = 108.883;
  const f = (t: number) => (t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116);
  const fx = f(x / xn), fy = f(y / yn), fz = f(z / zn);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function hexToLab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  const [x, y, z] = rgbToXyz(r, g, b);
  return xyzToLab(x, y, z);
}

/**
 * Perceptual distance between two colors in Lab (CIE76 ΔE).
 * 0 = identical, ≥20 is comfortably distinguishable for most viewers.
 */
export function perceptualDistance(a: string, b: string): number {
  const [la, aa, ba] = hexToLab(a);
  const [lb, ab, bb] = hexToLab(b);
  return Math.sqrt((la - lb) ** 2 + (aa - ab) ** 2 + (ba - bb) ** 2);
}

// ── Palette audit ───────────────────────────────────────────────

// Role pairs that must stay visually distinct. We skip pairs that
// are by design visually similar (e.g. muted vs bg) and focus on
// pairs that carry semantic meaning across the poster.
const ROLE_PAIRS: Array<[keyof Palette, keyof Palette]> = [
  ['accent', 'accent2'],
  ['accent', 'primary'],
  ['accent2', 'primary'],
  ['accent', 'bg'],
  ['accent2', 'bg'],
  ['primary', 'bg'],
  ['headerBg', 'bg'],
];

const CB_TYPES: CBType[] = ['deuteranopia', 'protanopia', 'tritanopia'];

// ΔE threshold. Empirically tuned against the 8 curated palettes +
// a known-bad red/green fixture: at 15, red-vs-green collapses to
// ~14.5 (fail) while the legit academic palettes all stay ≥ 16.
// Earth Sciences (gold accents) fails under tritanopia at 14.6 —
// that's a real CB limitation of gold-on-gold, not a false positive.
const CB_THRESHOLD = 15;

export interface CBReport {
  safe: boolean;
  minDistance: number;
  worstPair: { a: keyof Palette; b: keyof Palette; type: CBType };
}

/**
 * Audit a palette for color-blind distinguishability. Simulates each
 * of the three dichromatic deficiencies, measures perceptual distance
 * between every semantically-meaningful role pair, and returns the
 * worst case. `safe === true` when the worst pair is still above the
 * ΔE threshold.
 */
export function auditPaletteCB(p: Palette): CBReport {
  let min = Infinity;
  let worst: CBReport['worstPair'] = {
    a: 'accent',
    b: 'accent2',
    type: 'deuteranopia',
  };
  for (const type of CB_TYPES) {
    for (const [a, b] of ROLE_PAIRS) {
      const d = perceptualDistance(simulateCB(p[a], type), simulateCB(p[b], type));
      if (d < min) {
        min = d;
        worst = { a, b, type };
      }
    }
  }
  return {
    safe: min >= CB_THRESHOLD,
    minDistance: min,
    worstPair: worst,
  };
}

export const CB_MIN_DISTANCE = CB_THRESHOLD;
