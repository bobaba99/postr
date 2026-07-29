// Tests for the Arm A deterministic extraction spike.
//
// MEASUREMENT SPIKE — throwaway. These tests pin the spike's contract
// (common finding shape, verbatim-quote invariant, sensible ranking on
// the EXAMPLE paper) so the harness is trustworthy enough to score. They
// are NOT the production test suite; if Arm A wins, the signals get
// productionized into coreRelevance.ts with the full app suite.
//
// Run: cd docs/plans/experiments/extraction && npx vitest run runArmA.test.mjs
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { runArmA, extractFindingsFromText } from './runArmA.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE = path.join(HERE, 'papers', 'EXAMPLE', 'text.md');

describe('runArmA — common finding shape', () => {
  it('emits { text, sourceQuote, sourceSection, rank } for each finding', async () => {
    const findings = await runArmA(EXAMPLE, { top: 5 });
    expect(Array.isArray(findings)).toBe(true);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(typeof f.text).toBe('string');
      expect(typeof f.sourceQuote).toBe('string');
      expect(typeof f.sourceSection).toBe('string');
      expect(typeof f.rank).toBe('number');
    }
  });

  it('ranks are 1..N, contiguous and ascending', async () => {
    const findings = await runArmA(EXAMPLE, { top: 5 });
    const ranks = findings.map((f) => f.rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(ranks[0]).toBe(1);
    expect(ranks[ranks.length - 1]).toBe(findings.length);
  });
});

describe('runArmA — fidelity is automatic (quote IS the scored sentence)', () => {
  it('every sourceQuote appears verbatim in the paper text', async () => {
    const findings = await runArmA(EXAMPLE, { top: 8 });
    const fs = await import('node:fs/promises');
    const text = await fs.readFile(EXAMPLE, 'utf8');
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    const haystack = norm(text);
    for (const f of findings) {
      expect(haystack.includes(norm(f.sourceQuote))).toBe(true);
    }
  });

  it('the finding text equals its own source quote (Arm A fidelity)', async () => {
    const findings = await runArmA(EXAMPLE, { top: 5 });
    for (const f of findings) {
      expect(f.text).toBe(f.sourceQuote);
    }
  });
});

describe('runArmA — ranking quality on EXAMPLE', () => {
  it('surfaces the star finding (the memory-recall deficit) in the top 3', async () => {
    const findings = await runArmA(EXAMPLE, { top: 3 });
    const joined = findings.map((f) => f.text.toLowerCase()).join(' \n ');
    // The star result of this paper is the recall deficit under restriction.
    expect(joined).toContain('recalled fewer word pairs');
  });

  it('a Results sentence outranks a References/Methods sentence', async () => {
    const findings = await runArmA(EXAMPLE, { top: 12 });
    const top = findings[0];
    expect(top.sourceSection.toLowerCase()).toContain('results');
  });

  it('does not surface a References line as a finding', async () => {
    const findings = await runArmA(EXAMPLE, { top: 12 });
    for (const f of findings) {
      expect(f.sourceSection.toLowerCase()).not.toContain('references');
    }
  });
});

describe('extractFindingsFromText — dedupes near-duplicate sentences', () => {
  it('collapses two nearly-identical candidate sentences into one', () => {
    const text = [
      '## Results',
      '',
      'Treated patients improved by 21% compared with controls (d = 0.9, p < .001).',
      'Treated patients improved by 21% compared to controls (d = 0.9, p < .001).',
      'A separate marker rose by 40% in the treated arm (p = .01).',
    ].join('\n');
    const findings = extractFindingsFromText(text, { top: 10 });
    const twentyOne = findings.filter((f) => f.text.includes('21%'));
    expect(twentyOne.length).toBe(1);
  });
});

describe('runArmA — missing file is handled gracefully', () => {
  it('returns [] for a missing paper rather than throwing', async () => {
    const missing = path.join(HERE, 'papers', 'DOES_NOT_EXIST', 'text.md');
    const findings = await runArmA(missing, { top: 5 });
    expect(findings).toEqual([]);
  });
});
