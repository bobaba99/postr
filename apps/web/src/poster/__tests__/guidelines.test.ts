/**
 * Invariants for the conference poster specifications.
 *
 * These are not style checks. A wrong board dimension here gets a
 * researcher's poster rejected at the conference, which is the one
 * failure in this app the user cannot recover from — they have already
 * paid for the print by the time they find out.
 *
 * The suite exists because two rows shipped wrong for months:
 *   - SfN's `size` said 72"x48" while its `sizeNote` said the board was
 *     8'x4'. The row contradicted itself in plain sight.
 *   - APS claimed a 48"x96" board when APS actually specifies A0
 *     (33.1"x46.8") — less than half the width.
 *
 * The self-contradiction test below is the direct guard against the
 * first class of bug. The second class can only be caught by checking
 * primary sources, which is what `verifiedOn` records.
 */
import { describe, expect, it } from 'vitest';
import { GUIDELINES, type Guideline } from '../GuidelinesPanel';

/**
 * Pull every foot-denominated measurement out of prose.
 *
 * Matches `4'`, `6ft`, `4 feet` — deliberately NOT `48"`, because the
 * inch form uses a double quote and would otherwise be read as feet.
 */
function feetMentionedIn(text: string): number[] {
  const out: number[] = [];
  const re = /(\d+(?:\.\d+)?)\s*(?:'|ft\b|feet\b)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(Number(m[1]));
  return out;
}

const named = (g: Guideline) => g.conference;

describe('conference guidelines data', () => {
  it('has at least one row', () => {
    expect(GUIDELINES.length).toBeGreaterThan(0);
  });

  describe.each(GUIDELINES.map((g) => [named(g), g] as const))('%s', (_name, g) => {
    it('states plausible board dimensions', () => {
      expect(g.boardWidthIn).toBeGreaterThan(10);
      expect(g.boardHeightIn).toBeGreaterThan(10);
      // 100in is comfortably above every real poster board and well
      // below the kind of number a unit-conversion bug produces.
      expect(g.boardWidthIn).toBeLessThan(100);
      expect(g.boardHeightIn).toBeLessThan(100);
    });

    it('declares an orientation consistent with its dimensions', () => {
      const { boardWidthIn: w, boardHeightIn: h, orientation } = g;
      if (orientation === 'landscape') expect(w).toBeGreaterThan(h);
      if (orientation === 'portrait') expect(h).toBeGreaterThan(w);
      if (orientation === 'square') expect(w).toBeCloseTo(h, 5);
      // 'either' intentionally asserts nothing — APS permits both.
    });

    it('does not contradict itself about feet', () => {
      // The SfN regression: `size` said 72"x48" (6ft x 4ft) while
      // `sizeNote` said the board was 8'x4'. Any foot figure appearing
      // in the human-readable copy must correspond to one of the two
      // real dimensions.
      const prose = `${g.size} ${g.sizeNote ?? ''}`;
      const allowed = [g.boardWidthIn / 12, g.boardHeightIn / 12];
      for (const ft of feetMentionedIn(prose)) {
        expect(
          allowed.some((a) => Math.abs(a - ft) < 0.05),
          `${g.conference}: copy mentions ${ft}ft but the board is ` +
            `${allowed[0]}ft x ${allowed[1]}ft — the row contradicts itself`,
        ).toBe(true);
      }
    });

    it('carries usable provenance', () => {
      expect(g.url.startsWith('https://')).toBe(true);
      expect(g.urlLabel.trim().length).toBeGreaterThan(0);
      expect(g.meetingYear).toBeGreaterThanOrEqual(2015);
      expect(g.meetingYear).toBeLessThanOrEqual(2035);
    });

    it('was verified on a real, non-future date', () => {
      expect(g.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const when = new Date(`${g.verifiedOn}T00:00:00Z`);
      expect(Number.isNaN(when.getTime())).toBe(false);
      expect(when.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('warns in its copy when the cited source predates the verification', () => {
      // A row sourced from an old meeting is allowed — SOBP's most
      // recent published guidance is from 2018 — but it must say so,
      // otherwise the staleness is invisible to the presenter.
      const verifiedYear = Number(g.verifiedOn.slice(0, 4));
      if (verifiedYear - g.meetingYear >= 2) {
        const prose = `${g.size} ${g.sizeNote ?? ''}`.toLowerCase();
        expect(
          prose.includes(String(g.meetingYear)) || prose.includes('confirm'),
          `${g.conference}: cites ${g.meetingYear} guidance but the copy ` +
            `does not flag it as potentially stale`,
        ).toBe(true);
      }
    });
  });

  it('has no duplicate conference entries', () => {
    const names = GUIDELINES.map(named);
    expect(new Set(names).size).toBe(names.length);
  });
});
