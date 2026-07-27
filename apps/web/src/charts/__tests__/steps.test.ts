import { describe, expect, it } from 'vitest';
import { inferTable } from '../inferColumns';
import type { RawTable } from '../parseData';
import { planLadder, pickSample } from '../ladder/steps';
import { sampleDatasets } from '../sampleData';

function raw(header: string[], rows: RawTable['rows']): RawTable {
  return { header, rows };
}

function tableSource(table: RawTable) {
  return { kind: 'table' as const, table: inferTable(table) };
}

describe('planLadder — the self-destructing questionnaire', () => {
  it('renders zero questions on the fast path (simple two-column paste)', () => {
    const grouped = sampleDatasets().find((d) => d.key === 'grouped-means')!;
    const plan = planLadder(tableSource(grouped.table), {});
    expect(plan.steps).toEqual(['data', 'preview']);
    expect(plan.active).toBe('preview');
  });

  it('asks only the measure question when several numeric columns tie', () => {
    const source = tableSource(raw(['Group', 'Age', 'Score'], [
      ['A', '31', '55'],
      ['B', '29', '61'],
      ['C', '35', '48'],
    ]));
    const plan = planLadder(source, {});
    expect(plan.steps).toContain('measure');
    expect(plan.active).toBe('measure');
    // Answered → the ladder falls through to previews.
    const answered = planLadder(source, { measure: 'Score' });
    expect(answered.active).toBe('preview');
  });

  it('asks the grouping question when more than two grouping columns exist', () => {
    const source = tableSource(raw(['Site', 'Sex', 'Arm', 'Score'], [
      ['Acme State University', 'F', 'Control', '4'],
      ['Sample Research Institute', 'M', 'Drug', '6'],
      ['Acme State University', 'M', 'Control', '5'],
      ['Sample Research Institute', 'F', 'Drug', '7'],
    ]));
    const plan = planLadder(source, {});
    expect(plan.steps).toContain('grouping');
    expect(plan.active).toBe('grouping');
  });

  it('asks the emphasis question only when forms genuinely tie', () => {
    const rows: RawTable['rows'] = [];
    ['Control', 'Drug'].forEach((g, gi) => {
      for (let i = 0; i < 8; i++) rows.push([g, String(400 + gi * 40 + i * 7)]);
    });
    const plan = planLadder(tableSource(raw(['Condition', 'RT'], rows)), {});
    expect(plan.steps).toEqual(['data', 'emphasis', 'preview']);
    expect(plan.active).toBe('emphasis');
    const answered = planLadder(tableSource(raw(['Condition', 'RT'], rows)), { emphasis: 'spread' });
    expect(answered.active).toBe('preview');
  });

  it('never asks a question the data already answers', () => {
    const trend = sampleDatasets().find((d) => d.key === 'time-series')!;
    const plan = planLadder(tableSource(trend.table), {});
    expect(plan.steps).toEqual(['data', 'preview']);
  });

  it('asks the shape question first on the synthetic branch', () => {
    const plan = planLadder({ kind: 'synthetic' }, {});
    expect(plan.steps).toEqual(['data', 'measure', 'emphasis', 'preview']);
    expect(plan.active).toBe('measure');
  });

  it('adds the variable-count rung only for shapes whose sample it changes', () => {
    for (const shape of ['groups', 'time'] as const) {
      const plan = planLadder({ kind: 'synthetic' }, { shape });
      expect(plan.steps).toContain('grouping');
      expect(plan.active).toBe('grouping');
    }
  });

  it('never renders the variable-count rung when it cannot change the sample', () => {
    // pickSample ignores `vars` for these five, so the question would
    // be a dead rung — the §0 rule says it is never shown.
    for (const shape of ['relationship', 'whole', 'agreement', 'prepost', 'spread'] as const) {
      const plan = planLadder({ kind: 'synthetic' }, { shape });
      expect(plan.steps).not.toContain('grouping');
      expect(plan.active).toBe('emphasis');
      // And the sample is identical regardless of the vars answer.
      const keys = ([0, 1, 2] as const).map((v) => pickSample(shape, v).key);
      expect(new Set(keys).size).toBe(1);
    }
  });

  it('walks a vars-insensitive shape straight from shape to preview', () => {
    const plan = planLadder({ kind: 'synthetic' }, { shape: 'whole', emphasis: 'share' });
    expect(plan.active).toBe('preview');
    expect(plan.sample?.key).toBe('shares');
  });

  it('walks the synthetic branch to previews', () => {
    const plan = planLadder(
      { kind: 'synthetic' },
      { shape: 'groups', vars: 1, emphasis: 'difference' },
    );
    expect(plan.active).toBe('preview');
    expect(plan.sample?.key).toBe('grouped-means');
    expect(plan.table).not.toBeNull();
  });

  it('starts at the data step with no source', () => {
    const plan = planLadder(null, {});
    expect(plan.steps).toEqual(['data']);
    expect(plan.active).toBe('data');
  });
});

describe('pickSample', () => {
  it('maps shape and variable count onto the seeded datasets', () => {
    expect(pickSample('groups', 0).key).toBe('single-numeric');
    expect(pickSample('groups', 1).key).toBe('grouped-means');
    expect(pickSample('groups', 2).key).toBe('two-category');
    expect(pickSample('time', 0).key).toBe('time-series');
    expect(pickSample('time', 1).key).toBe('multi-series');
    expect(pickSample('relationship', 1).key).toBe('two-numeric');
    expect(pickSample('whole', 1).key).toBe('shares');
    expect(pickSample('agreement', 1).key).toBe('likert');
    expect(pickSample('prepost', 1).key).toBe('pre-post');
    expect(pickSample('spread', 0).key).toBe('single-numeric');
  });
});
