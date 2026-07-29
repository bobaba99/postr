/**
 * The rubric is versioned CONFIG (spec §2.0): criteria as typed data with
 * research/expert provenance, a version stamp, and an issue taxonomy shared
 * with the §7 validation harness. These tests pin the v1 content's shape so
 * prompt composition (Task 11) and the harness can rely on it.
 */
import { describe, it, expect } from 'vitest';
import {
  RUBRIC_V1,
  ISSUE_CATEGORIES,
  PERCEPTION_RULES,
  ECONOMY_RULES,
  DIMENSIONS,
} from '../review/rubric/v1.js';
import { CURRENT_RUBRIC, CURRENT_RUBRIC_VERSION } from '../review/rubric/index.js';

describe('rubric v1', () => {
  it('is the current rubric and carries a version stamp', () => {
    expect(CURRENT_RUBRIC).toBe(RUBRIC_V1);
    expect(CURRENT_RUBRIC_VERSION).toBe('rubric.v1');
    expect(RUBRIC_V1.version).toBe('rubric.v1');
  });

  it('taxonomy covers the seven seeded failure modes of spec §7.2', () => {
    for (const seeded of [
      'buried-key-result',
      'over-emphasis',
      'redundant-text',
      'competing-elements',
      'wall-of-text',
      'decorative-hijack',
      'no-takeaway',
    ]) {
      expect(ISSUE_CATEGORIES).toContain(seeded);
    }
  });

  it('every rule has a unique id, text, and provenance', () => {
    const all = [...PERCEPTION_RULES, ...ECONOMY_RULES];
    const ids = all.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of all) {
      expect(rule.text.length).toBeGreaterThan(20);
      expect(rule.provenance.length).toBeGreaterThan(0);
      expect(rule.dimensions.length).toBeGreaterThan(0);
    }
  });

  it('perception rules encode the §4.1 pass and economy rules the §4.3 lens', () => {
    expect(PERCEPTION_RULES.map((r) => r.id)).toEqual(
      expect.arrayContaining([
        'perc-entry-salience',
        'perc-entry-competition',
        'perc-faces-override',
        'perc-emphasis-dose',
        'perc-reading-path',
        'perc-figure-text-link',
      ]),
    );
    expect(ECONOMY_RULES.map((r) => r.id)).toEqual(
      expect.arrayContaining([
        'econ-lens',
        'econ-plots-carry',
        'econ-visual-over-text',
        'econ-one-takeaway',
        'econ-forced-priority',
      ]),
    );
  });

  it('defines the three scoring dimensions with 1/3/5 anchors', () => {
    expect(DIMENSIONS.map((d) => d.dimension)).toEqual([
      'narrative',
      'design',
      'content',
    ]);
    for (const d of DIMENSIONS) {
      expect(d.anchors.low.length).toBeGreaterThan(10);
      expect(d.anchors.mid.length).toBeGreaterThan(10);
      expect(d.anchors.high.length).toBeGreaterThan(10);
    }
  });
});
