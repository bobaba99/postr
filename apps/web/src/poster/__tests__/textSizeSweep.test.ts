/**
 * Record 33 — the exact round trip of A− / A+ measured over every start
 * size and every sequence of presses up to the bounds, on the rule module
 * itself (poster/textSize.ts). The top bar's buttons run exactly this
 * function (textSize.test.tsx enters through them, on 13 starts); here the
 * arithmetic is swept where a click per case would take hours.
 *
 * Starts: a body on each of the six sizes, between them (30, 34, 36.5,
 * 47.99 pt) and outside them (24, 52 pt), times every other level from 12
 * to 200 pt in half points (the Style tab's field stores what is typed ÷
 * 7.2), plus the template sizes (14, 8, 5 units) and the welcome poster's
 * 146 pt title. Sequences: A+ to the top, A− to the bottom, A+ back to the
 * first size reached (every size visited from both sides), and 200 seeded
 * random sequences of 24 presses per start body.
 *
 * The naive formula the anchor replaces (each level times new ÷ old body,
 * from the sizes in front of it) is measured on the same walks, as the
 * control that shows why the anchor is there.
 *
 * Re-run: npx vitest run src/poster/__tests__/textSizeSweep.test.ts
 */
import { describe, expect, it } from 'vitest';
import type { Styles, TypeStyle } from '@postr/shared';
import { DEFAULT_STYLES } from '../constants';
import { nextBodyPt, stepTextSize, type TextSizeStep } from '../textSize';

const PT = 7.2;
const level = (size: number): TypeStyle => ({ ...DEFAULT_STYLES.body, size });
const stylesOf = (t: number, h: number, a: number, b: number): Styles => ({
  title: { ...DEFAULT_STYLES.title, size: t },
  heading: { ...DEFAULT_STYLES.heading, size: h },
  authors: { ...DEFAULT_STYLES.authors, size: a },
  body: level(b),
});
const key = (s: Styles) => [s.title.size, s.heading.size, s.authors.size, s.body.size];
const rung = (s: Styles) => Math.round(s.body.size * PT);

/** The naive press: every level times new ÷ old body, from the sizes in front of it. */
function naive(s: Styles, step: TextSizeStep): Styles | null {
  const to = nextBodyPt(s.body.size * PT, step);
  if (to === null) return null;
  const k = to / PT / s.body.size;
  return stylesOf(s.title.size * k, s.heading.size * k, s.authors.size * k, to / PT);
}

/** A+ to the top, A− to the bottom, A+ back: the sizes found at a size already visited that differ. */
function walk(start: Styles, press: (s: Styles, step: TextSizeStep) => Styles | null) {
  const seen = new Map<number, number[]>();
  let misses = 0;
  let visits = 0;
  let worst = 0;
  const visit = (s: Styles) => {
    visits += 1;
    const k = rung(s);
    const got = key(s);
    const was = seen.get(k);
    if (was && was.some((v, i) => v !== got[i])) {
      misses += 1;
      worst = Math.max(worst, ...got.map((v, i) => Math.abs(v - was[i]!) / was[i]!));
    }
    if (!was) seen.set(k, got);
  };
  const onTable = [28, 32, 36, 40, 44, 48].some((p) => Math.abs(p - start.body.size * PT) < 1e-6);
  if (onTable) visit(start);
  let s = start;
  let first: number | null = null;
  // Bounded (six sizes): a press that moves nowhere or past a bound counts
  // as a miss instead of looping.
  let n: Styles | null;
  let i = 0;
  for (n = press(s, 'up'); n && i < 8; n = press(s, 'up'), i += 1) { s = n; first ??= rung(s); visit(s); }
  if (n) misses += 1;
  i = 0;
  for (n = press(s, 'down'); n && i < 8; n = press(s, 'down'), i += 1) { s = n; first ??= rung(s); visit(s); }
  if (n) misses += 1;
  const home = onTable ? rung(start) : first!;
  for (i = 0; i < 8 && rung(s) < home; i += 1) { const m = press(s, 'up'); if (!m) break; s = m; visit(s); }
  if (rung(s) !== home) misses += 1;
  return { misses, visits, worst };
}

const BODIES = [28, 32, 36, 40, 44, 48, 30, 34, 36.5, 47.99, 24, 52];
const LEVEL_PTS = Array.from({ length: (200 - 12) * 2 + 1 }, (_, i) => 12 + i / 2);

function starts(): Styles[] {
  const out: Styles[] = [];
  for (const b of BODIES) {
    for (const l of LEVEL_PTS) out.push(stylesOf(l / PT, l / PT, l / PT, b / PT));
    out.push(stylesOf(14, 8, 5, b / PT));
    out.push(stylesOf(146 / PT, 8, 5, b / PT));
  }
  out.push(stylesOf(14, 8, 5, 5));
  return out;
}

/** A small seeded generator, so the random sequences are the same on every run. */
function seeded(seed: number) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

describe('record 33 — exact round trips over every start and sequence', () => {
  it('the walk from every start: every size reached again holds exactly what it held', () => {
    let misses = 0;
    let visits = 0;
    let naiveMisses = 0;
    let naiveWalksWithAMiss = 0;
    let naiveWorst = 0;
    const all = starts();
    for (const s of all) {
      const r = walk(s, stepTextSize);
      misses += r.misses;
      visits += r.visits;
      const n = walk(s, naive);
      naiveMisses += n.misses;
      naiveWorst = Math.max(naiveWorst, n.worst);
      if (n.misses) naiveWalksWithAMiss += 1;
    }
    expect({ starts: all.length, visits, misses }).toEqual({ starts: 4549, visits: 50039, misses: 0 });
    // The control: the naive formula misses on a share of the same walks.
    expect({ naiveMisses, naiveWalksWithAMiss }).toEqual({ naiveMisses: 14720, naiveWalksWithAMiss: 4526 });
    // Its misses are in the last digits (at most 6.1e-16 of a size, a few
    // units in the last place): invisible, but not ===.
    expect(naiveWorst).toBeGreaterThan(0);
    expect(naiveWorst).toBeLessThan(1e-15);
  });

  it('200 random sequences of 24 presses per start body: every size reached again holds exactly what it held', () => {
    const rand = seeded(33);
    let misses = 0;
    let visits = 0;
    for (const b of BODIES) {
      for (let i = 0; i < 200; i += 1) {
        const l = LEVEL_PTS[Math.floor(rand() * LEVEL_PTS.length)]! / PT;
        let s = stylesOf(l * 2.8, l * 1.6, l, b / PT);
        // A start off the six sizes is never returned to (A+ and A− go to the
        // sizes), so only a start on one of them is a size to come back to.
        const onTable = [28, 32, 36, 40, 44, 48].includes(b);
        const seen = new Map<number, number[]>(onTable ? [[rung(s), key(s)]] : []);
        for (let p = 0; p < 24; p += 1) {
          const n = stepTextSize(s, rand() < 0.5 ? 'up' : 'down');
          if (!n) continue;
          s = n;
          visits += 1;
          const was = seen.get(rung(s));
          if (was && was.some((v, j) => v !== key(s)[j])) misses += 1;
          if (!was) seen.set(rung(s), key(s));
        }
      }
    }
    expect({ misses, visits }).toEqual({ misses: 0, visits: 47686 });
  });
});
