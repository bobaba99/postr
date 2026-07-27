/**
 * Hierarchical selection, end to end through `mapNarrative`.
 *
 * The fixture is built so that PROMINENCE AND RELEVANCE DISAGREE: the
 * "grip strength" finding is the loudest effect in the manuscript (large
 * percentage, p < .001) but has nothing to do with the paper's claim,
 * while the recall finding carries the argument on a weaker effect. Any
 * ranking that puts grip strength first is ranking the wrong thing —
 * which is precisely the behaviour this work replaced.
 */
import { describe, it, expect } from 'vitest';
import { parseManuscriptText } from '../parseManuscriptText';
import { mapNarrative } from '../mapper';
import {
  MIN_BUDGET_SCALE,
  POSTER_ROLE_SPECS,
  REQUIRED_ROLE_MIN_WORDS,
  REQUIREMENT_REFERENCE_SLIDES,
  tieredBudget,
} from '../rubric';

/**
 * `grip strength` is deliberately the MORE prominent effect (44% vs an
 * unquantified fall, both p < .001) while being irrelevant to a paper
 * about sleep and recall.
 */
const MANUSCRIPT = `Sleep Restriction and Recall Accuracy in Undergraduate Students

John Smith1, Jane Doe2
(1) Acme State University, (2) Sample Research Institute

Abstract

Sleep loss impairs memory, but the dose-response shape is unclear.

1. Introduction

Memory consolidation depends on sleep, and students are chronically restricted.

We asked whether moderate sleep restriction produces measurable recall deficits.

2. Literature Review

Dozens of unrelated studies have examined stairwell ergonomics and cafeteria lighting in exhaustive detail.

3. Methods

Participants were 120 undergraduates randomized to 5, 6.5, or 8 hours in bed. Recall was measured with a 40-item word-list task.

4. Results

Grip strength increased 44% among stairwell users relative to elevator users (p < .001). Recall accuracy fell 21% under moderate sleep restriction relative to controls (p < .001).

5. Discussion

Moderate sleep restriction measurably impairs recall accuracy.

Limitations

Recall accuracy under sleep restriction may vary with the word-list task used.

Acknowledgements

We thank the stairwell maintenance staff and the cafeteria lighting committee.`;

const doc = parseManuscriptText(MANUSCRIPT);
const TAKEAWAY = 'Moderate sleep restriction impairs recall accuracy';

const findSection = (kind: string) => doc.sections.find((s) => s.kind === kind)!;

describe('core establishment', () => {
  it('uses the Q1 takeaway when the author gave one', () => {
    const map = mapNarrative(doc, { takeaway: TAKEAWAY });
    expect(map.core.source).toBe('takeaway');
    expect(map.core.text).toBe(TAKEAWAY);
  });

  it('falls back deterministically and REPORTS the source when Q1 is absent', () => {
    const map = mapNarrative(doc);
    expect(map.core.source).toBe('derived');
    // The fallback is title + abstract + top finding, so title terms
    // must be present — this is what the UI will say it used.
    expect(map.core.text).toMatch(/Sleep Restriction and Recall Accuracy/);
  });

  it('warns the user that a derived core is provisional', () => {
    const map = mapNarrative(doc);
    expect(map.warnings.some((w) => /title and abstract/i.test(w))).toBe(true);
  });

  it('the derived core is identical across calls', () => {
    const a = mapNarrative(doc);
    const b = mapNarrative(doc);
    expect(a.core.text).toBe(b.core.text);
    expect(a.core.source).toBe(b.core.source);
  });
});

describe('relevance beats prominence', () => {
  const map = mapNarrative(doc, { takeaway: TAKEAWAY });

  it('a finding sharing terms and numbers with the takeaway leads', () => {
    expect(map.findings[0]!.text).toMatch(/Recall accuracy fell/);
  });

  it('the more prominent but unrelated finding is demoted', () => {
    const gripIndex = map.findings.findIndex((f) => /Grip strength/.test(f.text));
    const recallIndex = map.findings.findIndex((f) => /Recall accuracy/.test(f.text));
    expect(recallIndex).toBeLessThan(gripIndex === -1 ? Infinity : gripIndex);
  });

  it('the winning finding scores higher on core relevance', () => {
    const byId = new Map(map.findingScores.map((s) => [s.id, s]));
    const recall = map.findings.find((f) => /Recall accuracy/.test(f.text))!;
    const grip = map.findings.find((f) => /Grip strength/.test(f.text));
    if (grip) {
      expect(byId.get(recall.id)!.score).toBeGreaterThan(byId.get(grip.id)!.score);
    }
  });

  it('every finding score names the signals that fired', () => {
    for (const score of map.findingScores) {
      expect(score.signals.length).toBeGreaterThan(0);
      expect(score.signals.some((s) => s.signal === 'overlap')).toBe(true);
    }
  });
});

describe("the author's Q2 ranking overrides the score", () => {
  const scored = mapNarrative(doc, { takeaway: TAKEAWAY });
  const grip = scored.findings.find((f) => /Grip strength/.test(f.text))!;

  it('leads with the finding the author chose, even though it scores lower', () => {
    const map = mapNarrative(doc, {
      takeaway: TAKEAWAY,
      rankedFindingIds: [grip.id],
    });
    expect(map.findings[0]!.id).toBe(grip.id);
    expect(map.findings[0]!.text).toMatch(/Grip strength/);
  });

  it('marks the override in the trace so the UI can explain it', () => {
    const map = mapNarrative(doc, {
      takeaway: TAKEAWAY,
      rankedFindingIds: [grip.id],
    });
    const lead = map.findingScores.find((s) => s.id === grip.id)!;
    expect(lead.override).toBe('user-ranking');
    expect(lead.reason).toMatch(/you chose/i);
  });

  /**
   * The converse invariant, and the one the shipped flow actually
   * depends on: no ranking means no attribution. A default must never
   * masquerade as a choice — the outline renders `override:
   * 'user-ranking'` as "You chose this to lead", so claiming it for a
   * user who declined to reorder both fabricates their decision and
   * promotes an unearned finding to tier 2.
   */
  it('claims no user override when the author named no findings', () => {
    for (const context of [
      { takeaway: TAKEAWAY },
      { takeaway: TAKEAWAY, rankedFindingIds: [] },
    ]) {
      const map = mapNarrative(doc, context);
      expect(map.findingScores.length).toBeGreaterThan(0);
      for (const score of map.findingScores) {
        expect(score.override).toBeNull();
        expect(score.reason).not.toMatch(/you chose/i);
      }
      // And with nothing to override, relevance decides.
      expect(map.findings[0]!.text).toMatch(/Recall accuracy fell/);
    }
  });

  it('ignores a stale id that no longer matches any finding', () => {
    const map = mapNarrative(doc, {
      takeaway: TAKEAWAY,
      rankedFindingIds: ['does-not-exist'],
    });
    // Falls back to score order rather than emitting a phantom finding.
    expect(map.findings[0]!.text).toMatch(/Recall accuracy/);
    expect(map.findings.every((f) => f.id !== 'does-not-exist')).toBe(true);
  });

  it('finding ids are stable across calls, so a stored ranking still binds', () => {
    const a = mapNarrative(doc, { takeaway: TAKEAWAY });
    const b = mapNarrative(doc, { takeaway: TAKEAWAY });
    expect(a.findings.map((f) => f.id)).toEqual(b.findings.map((f) => f.id));
  });
});

describe('a Q5 pin is never cut, whatever the score', () => {
  const ack = findSection('acknowledgements');

  it('acknowledgements scores into tier 4 when unpinned', () => {
    const map = mapNarrative(doc, { takeaway: TAKEAWAY });
    expect(map.cutSections.some((s) => s.id === ack.id)).toBe(true);
  });

  it('the same section survives when pinned', () => {
    const map = mapNarrative(doc, {
      takeaway: TAKEAWAY,
      pinnedSectionIds: [ack.id],
    });
    expect(map.cutSections.some((s) => s.id === ack.id)).toBe(false);
    expect(map.pinned.some((p) => p.id === ack.id)).toBe(true);
  });

  it('a pin is protected even at the tightest budget', () => {
    const map = mapNarrative(doc, {
      takeaway: TAKEAWAY,
      pinnedSectionIds: [ack.id],
      slideCount: 1,
    });
    expect(map.pinned.some((p) => p.id === ack.id)).toBe(true);
    expect(map.pinned[0]!.budgetWords).toBeGreaterThan(0);
  });

  it('records the pin as the reason, not a score', () => {
    const map = mapNarrative(doc, {
      takeaway: TAKEAWAY,
      pinnedSectionIds: [ack.id],
    });
    const score = map.sectionScores.find((s) => s.id === ack.id)!;
    expect(score.override).toBe('pinned');
    expect(score.tier).toBe(2);
  });
});

describe('the blocklist is a prior, not a verdict', () => {
  const map = mapNarrative(doc, { takeaway: TAKEAWAY });

  it('still cuts the genuinely irrelevant blocklisted sections', () => {
    const cutKinds = map.cutSections.map((s) => s.kind);
    expect(cutKinds).toContain('acknowledgements');
    expect(cutKinds).toContain('literature-review');
  });

  it('scores a limitations section that echoes the core above one that does not', () => {
    const onTopic = map.sectionScores.find(
      (s) => s.id === findSection('limitations').id,
    )!;
    const offTopic = map.sectionScores.find(
      (s) => s.id === findSection('acknowledgements').id,
    )!;
    // Both are blocklisted; the one discussing the main claim scores higher.
    expect(onTopic.score).toBeGreaterThan(offTopic.score);
  });
});

describe('the outline can explain every decision in words', () => {
  const map = mapNarrative(doc, { takeaway: TAKEAWAY });

  it('gives each role a short human reason with no digits', () => {
    for (const role of map.roles) {
      expect(role.reason.length).toBeGreaterThan(0);
      expect(role.reason.length).toBeLessThan(60);
      expect(role.reason).not.toMatch(/\d/);
    }
  });

  it('gives each cut section a reason', () => {
    const reasonById = new Map(map.sectionScores.map((s) => [s.id, s.reason]));
    for (const cut of map.cutSections) {
      expect(reasonById.get(cut.id)).toBeTruthy();
      expect(reasonById.get(cut.id)).not.toMatch(/\d/);
    }
  });

  it('names the takeaway as the core message', () => {
    const takeaway = map.roles.find((r) => r.role === 'takeaway')!;
    expect(takeaway.tier).toBe(1);
    expect(takeaway.reason).toMatch(/main message/i);
  });

  /**
   * Regression: no cut section may carry a keep-phrase.
   *
   * The blocklist penalty is applied AFTER scoring and can move a
   * section down a tier (any raw score in 0.30–0.649 crosses a boundary
   * under the 0.15 penalty). If the pre-penalty reason stays attached,
   * the outline prints "direct evidence for your main message" beside
   * something it just cut. `reasonsAreConsistent` below pins the
   * score→phrase mapping itself, which is the general guarantee.
   */
  it('never labels a cut section with a keep-phrase', () => {
    const reasonById = new Map(map.sectionScores.map((s) => [s.id, s.reason]));
    for (const cut of map.cutSections) {
      expect(reasonById.get(cut.id)).not.toMatch(/direct evidence/i);
      expect(reasonById.get(cut.id)).not.toMatch(/you (chose|asked)/i);
    }
  });

  it('returns section scores in tier order after the blocklist penalty', () => {
    for (let i = 1; i < map.sectionScores.length; i++) {
      expect(map.sectionScores[i - 1]!.tier).toBeLessThanOrEqual(
        map.sectionScores[i]!.tier,
      );
    }
  });

  /**
   * The general guarantee behind the regression above, asserted over
   * every blocklisted kind rather than one fixture: whatever tier a
   * section ends in, its phrase must belong to that tier. Sweeping the
   * takeaway across wordings moves sections through the whole score
   * range, including the 0.30–0.649 band where the penalty crosses a
   * tier boundary.
   */
  it('reasonsAreConsistent — phrase always matches the final tier', () => {
    // Each limitations body sits at a different raw score; the short
    // ones land in the 0.30–0.649 band where the 0.15 penalty crosses a
    // tier boundary, which is the only way reason and tier can diverge.
    const bodies = [
      'Sleep restriction impairs recall accuracy.',
      'Recall accuracy.',
      'Sleep.',
      'Recall accuracy sleep restriction undergraduates word-list task controls.',
      'The cafeteria lighting committee met twice.',
    ];
    for (const body of bodies) {
      const d = parseManuscriptText(
        [
          'Sleep Restriction and Recall Accuracy',
          '',
          'Introduction',
          '',
          'We asked whether sleep restriction impairs recall accuracy.',
          '',
          'Results',
          '',
          'Recall accuracy fell 21% under sleep restriction (p < .001).',
          '',
          'Discussion',
          '',
          'Sleep restriction impairs recall accuracy.',
          '',
          'Limitations',
          '',
          body,
        ].join('\n'),
      );
      const m = mapNarrative(d, { takeaway: TAKEAWAY });
      for (const score of m.sectionScores) {
        if (score.override !== null) continue;
        // A cut section must never read as though it were kept.
        if (score.tier === 4) {
          expect(score.reason).toMatch(
            /little overlap|credits|supplementary|background reading|caveats/i,
          );
        } else {
          expect(score.reason).not.toMatch(/little overlap/i);
        }
      }
    }
  });
});

describe('tiering', () => {
  const map = mapNarrative(doc, { takeaway: TAKEAWAY });

  it('places the core message in tier 1, alone', () => {
    const tier1 = map.roles.filter((r) => r.tier === 1);
    expect(tier1.map((r) => r.role)).toEqual(['takeaway']);
  });

  it('never puts a required role in the cut-first band', () => {
    for (const role of map.roles.filter((r) => r.required)) {
      expect(role.tier).toBeLessThan(4);
    }
  });

  it('keeps methods as interpretable context rather than cutting it first', () => {
    const methods = map.roles.find((r) => r.role === 'methods');
    if (methods) expect(methods.tier).toBeLessThan(4);
  });
});

describe('budget is allocated by tier', () => {
  const roomy = mapNarrative(doc, { takeaway: TAKEAWAY });
  // The tightest slot the rubric permits.
  const tight = mapNarrative(doc, { takeaway: TAKEAWAY, slideCount: 1 });

  const budgetOf = (map: typeof roomy, role: string) =>
    map.roles.find((r) => r.role === role)?.budgetWords ?? 0;

  it('leaves the full rubric budget when no slot constraint is stated', () => {
    for (const role of roomy.roles) {
      expect(role.budgetWords).toBe(POSTER_ROLE_SPECS[role.role].budgetWords);
    }
  });

  it('never exceeds the rubric ceiling', () => {
    for (const map of [roomy, tight]) {
      for (const role of map.roles) {
        expect(role.budgetWords).toBeLessThanOrEqual(
          POSTER_ROLE_SPECS[role.role].budgetWords,
        );
      }
    }
  });

  it('squeezes lower tiers harder than the core when budget is scarce', () => {
    const coreLoss =
      1 - budgetOf(tight, 'takeaway') / budgetOf(roomy, 'takeaway');
    const contextLoss =
      1 - budgetOf(tight, 'methods') / budgetOf(roomy, 'methods');
    expect(contextLoss).toBeGreaterThan(coreLoss);
  });

  it('tier 4 loses proportionally more than tier 2 at the same scale', () => {
    // Compared as multipliers rather than on a specific role, so this
    // asserts the ALLOCATION RULE and not one fixture's tier assignment.
    const t2 = tieredBudget(100, MIN_BUDGET_SCALE, 2, false);
    const t4 = tieredBudget(100, MIN_BUDGET_SCALE, 4, false);
    expect(t4).toBeLessThan(t2);
  });

  it('never starves a required role to zero at the tightest budget', () => {
    for (const role of tight.roles.filter((r) => r.required)) {
      expect(role.budgetWords).toBeGreaterThanOrEqual(REQUIRED_ROLE_MIN_WORDS);
    }
  });

  it('keeps every required role present at the tightest budget', () => {
    const roles = tight.roles.map((r) => r.role);
    expect(roles).toContain('question');
    expect(roles).toContain('keyResult');
    expect(roles).toContain('takeaway');
  });

  it('an at-reference slot count leaves the rubric untouched', () => {
    const reference = mapNarrative(doc, {
      takeaway: TAKEAWAY,
      slideCount: REQUIREMENT_REFERENCE_SLIDES,
    });
    for (const role of reference.roles) {
      expect(role.budgetWords).toBe(POSTER_ROLE_SPECS[role.role].budgetWords);
    }
  });
});

describe('determinism', () => {
  it('the same input yields the same ranking, every time', () => {
    const runs = Array.from({ length: 5 }, () =>
      mapNarrative(doc, {
        takeaway: TAKEAWAY,
        pinnedSectionIds: [findSection('limitations').id],
        slideCount: 8,
      }),
    );
    const first = runs[0]!;
    for (const run of runs.slice(1)) {
      expect(run.findings.map((f) => f.id)).toEqual(first.findings.map((f) => f.id));
      expect(run.sectionScores.map((s) => [s.id, s.score, s.tier])).toEqual(
        first.sectionScores.map((s) => [s.id, s.score, s.tier]),
      );
      expect(run.roles.map((r) => [r.role, r.tier, r.budgetWords])).toEqual(
        first.roles.map((r) => [r.role, r.tier, r.budgetWords]),
      );
      expect(run.cutSections.map((s) => s.id)).toEqual(
        first.cutSections.map((s) => s.id),
      );
    }
  });

  /**
   * Proves determinism behaviourally rather than by grepping the source
   * for `Math.random`: both the clock and the RNG are stubbed to values
   * that would visibly perturb any ranking depending on them, and the
   * output must be byte-identical to an unstubbed run.
   */
  it('does not depend on the clock or the RNG', () => {
    const run = () =>
      JSON.stringify(
        mapNarrative(doc, { takeaway: TAKEAWAY, slideCount: 8 }).findingScores,
      );

    const baseline = run();

    const realRandom = Math.random;
    const realNow = Date.now;
    try {
      let tick = 0;
      Math.random = () => ((tick += 0.37), tick % 1);
      Date.now = () => 1_700_000_000_000 + (tick += 1000);
      expect(run()).toBe(baseline);
      expect(run()).toBe(baseline);
    } finally {
      Math.random = realRandom;
      Date.now = realNow;
    }
  });

  it('produces byte-identical scores for two independently parsed copies', () => {
    // A fresh parse mints fresh section ids; finding ids are derived
    // from text, so the finding ranking must still match exactly.
    const reparsed = parseManuscriptText(MANUSCRIPT);
    const a = mapNarrative(doc, { takeaway: TAKEAWAY });
    const b = mapNarrative(reparsed, { takeaway: TAKEAWAY });
    expect(b.findings.map((f) => f.id)).toEqual(a.findings.map((f) => f.id));
    expect(b.findingScores.map((s) => s.score)).toEqual(
      a.findingScores.map((s) => s.score),
    );
  });
});
