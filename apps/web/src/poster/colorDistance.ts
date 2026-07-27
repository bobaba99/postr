/**
 * colorDistance — CIEDE2000 (ΔE00) perceptual colour difference.
 *
 * Used by the copy-a-design palette reconciliation (styleExtraction)
 * to snap the vision model's imprecise role colours to the exact
 * colours found by pixel clustering — the plan (§3.1) specifies
 * CIEDE2000 in Lab, not RGB distance, because RGB distance badly
 * misjudges dark and saturated regions.
 *
 * Note this is deliberately separate from colorblind.ts's CIE76 ΔE:
 * the CB audit only needs "are these distinguishable?" where CIE76 is
 * plenty; snapping needs "is this the SAME colour, imprecisely
 * reported?", which is exactly the near-threshold regime CIEDE2000
 * was designed to fix.
 *
 * Implementation follows Sharma, Wu & Dalal (2005), "The CIEDE2000
 * Color-Difference Formula: Implementation Notes" — validated against
 * their published test pairs in __tests__/styleExtraction.test.ts.
 */
import { hexToLab } from './colorblind';

const rad2deg = (r: number): number => (r * 180) / Math.PI;
const deg2rad = (d: number): number => (d * Math.PI) / 180;

/** CIEDE2000 ΔE between two Lab colours (kL = kC = kH = 1). */
export function ciede2000Lab(
  lab1: [number, number, number],
  lab2: [number, number, number],
): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;

  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cbar = (C1 + C2) / 2;

  const Cbar7 = Cbar ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 25 ** 7)));

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);

  const h1p = hueAngle(b1, a1p);
  const h2p = hueAngle(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp: number;
  if (C1p * C2p === 0) {
    dhp = 0;
  } else if (Math.abs(h2p - h1p) <= 180) {
    dhp = h2p - h1p;
  } else if (h2p - h1p > 180) {
    dhp = h2p - h1p - 360;
  } else {
    dhp = h2p - h1p + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(deg2rad(dhp) / 2);

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;

  let hbarp: number;
  if (C1p * C2p === 0) {
    hbarp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hbarp = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hbarp = (h1p + h2p + 360) / 2;
  } else {
    hbarp = (h1p + h2p - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos(deg2rad(hbarp - 30)) +
    0.24 * Math.cos(deg2rad(2 * hbarp)) +
    0.32 * Math.cos(deg2rad(3 * hbarp + 6)) -
    0.2 * Math.cos(deg2rad(4 * hbarp - 63));

  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Cbarp7 = Cbarp ** 7;
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + 25 ** 7));
  const Lminus50sq = (Lbarp - 50) ** 2;
  const SL = 1 + (0.015 * Lminus50sq) / Math.sqrt(20 + Lminus50sq);
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const RT = -Math.sin(deg2rad(2 * dTheta)) * RC;

  const dL = dLp / SL;
  const dC = dCp / SC;
  const dH = dHp / SH;

  return Math.sqrt(dL * dL + dC * dC + dH * dH + RT * dC * dH);
}

/** Hue angle in degrees, in [0, 360). Zero when both components are 0. */
function hueAngle(b: number, ap: number): number {
  if (b === 0 && ap === 0) return 0;
  const h = rad2deg(Math.atan2(b, ap));
  return h >= 0 ? h : h + 360;
}

/** CIEDE2000 ΔE between two hex colours. */
export function ciede2000(hexA: string, hexB: string): number {
  return ciede2000Lab(hexToLab(hexA), hexToLab(hexB));
}
