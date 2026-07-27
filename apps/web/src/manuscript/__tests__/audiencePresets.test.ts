/**
 * The audience preset search is the deterministic alternative to
 * asking a model "who is this audience?". These tests are the contract
 * that keeps it that way: every preset reachable by realistic phrasing,
 * a genuine miss falling through to custom, and no substring hijacking.
 */
import { describe, it, expect } from 'vitest';
import {
  AUDIENCE_PRESETS,
  matchAudience,
  normaliseAudienceText,
} from '../audiencePresets';

describe('normaliseAudienceText', () => {
  it('lowercases, strips punctuation, and pads for boundary matching', () => {
    expect(normaliseAudienceText('  Policy-Makers!  ')).toBe(' policy makers ');
  });

  it('collapses runs of whitespace', () => {
    expect(normaliseAudienceText('school    nurses')).toBe(' school nurses ');
  });

  it('handles an empty string without crashing', () => {
    expect(normaliseAudienceText('   ').trim()).toBe('');
  });
});

describe('matchAudience — the prepared presets', () => {
  it.each([
    ['clinicians', 'clinicians'],
    ['hospital doctors', 'clinicians'],
    ['psychiatrists and nurses', 'clinicians'],
    ['the general public', 'public'],
    ['a lay audience', 'public'],
    ['patients and their families', 'public'],
    ['adolescents', 'adolescents'],
    ['high school students', 'adolescents'],
    ['teenagers', 'adolescents'],
    ['children', 'children'],
    ['primary school kids', 'children'],
    ['undergraduates', 'undergraduates'],
    ['undergrad psychology students', 'undergraduates'],
    ['policymakers', 'policymakers'],
    ['civil servants and regulators', 'policymakers'],
    ['industry', 'industry'],
    ['pharma companies', 'industry'],
    ['specialists in my subfield', 'specialists'],
    ['domain experts', 'specialists'],
    ['researchers at a conference', 'general'],
    ['my department', 'general'],
  ])('resolves %j to %s', (typed, expected) => {
    expect(matchAudience(typed).option).toBe(expected);
  });

  it('every preset is reachable by its own first keyword', () => {
    for (const preset of AUDIENCE_PRESETS) {
      const keyword = preset.keywords[0]!;
      expect(matchAudience(keyword).option).toBe(preset.id);
    }
  });

  it('is case- and punctuation-insensitive', () => {
    expect(matchAudience('CLINICIANS!').option).toBe('clinicians');
    expect(matchAudience('Policy-makers.').option).toBe('policymakers');
  });

  it('returns the preset label, not the raw text, on a hit', () => {
    const match = matchAudience('hospital doctors');
    expect(match.label).toBe('Clinicians');
    expect(match.custom).toBe('');
  });
});

describe('matchAudience — falling through to custom', () => {
  it('passes genuinely unmatched text through verbatim', () => {
    const match = matchAudience('competitive ballroom dancers');
    expect(match.option).toBe('custom');
    expect(match.custom).toBe('competitive ballroom dancers');
    expect(match.label).toBe('competitive ballroom dancers');
  });

  it('trims the custom text', () => {
    expect(matchAudience('  museum curators  ').custom).toBe('museum curators');
  });

  it('treats an empty answer as custom-empty rather than guessing', () => {
    const match = matchAudience('   ');
    expect(match.option).toBe('custom');
    expect(match.custom).toBe('');
  });
});

describe('matchAudience — word boundaries', () => {
  it('does not match "public" inside "publication"', () => {
    // Would be a false 'public' hit under naive substring matching.
    expect(matchAudience('publication reviewers').option).not.toBe('public');
  });

  it('does not match "kid" inside "kidney"', () => {
    expect(matchAudience('kidney specialists').option).not.toBe('children');
  });

  it('does not match "policy" inside "policyholders" alone', () => {
    // 'policyholders' is one token — no ' policy ' boundary hit.
    expect(matchAudience('policyholders').option).toBe('custom');
  });
});

describe('matchAudience — specificity ordering', () => {
  it('prefers children over the public for school children', () => {
    expect(matchAudience('school children at an open day').option).toBe('children');
  });

  it('prefers adolescents over undergraduates for high schoolers', () => {
    expect(matchAudience('high school students').option).toBe('adolescents');
  });

  /**
   * Specificity has to beat declaration order. `undergraduates` owns the
   * bare keyword 'students' and is declared before `general`, which owns
   * 'phd students' — so under a per-preset sort the more specific phrase
   * could never win, and a poster for postgraduate peers got condensed
   * as if it were for first years.
   */
  it.each([
    ['PhD students', 'general'],
    ['phd students', 'general'],
    ['graduate students', 'general'],
    ['doctoral students', 'general'],
    ['medical students', 'undergraduates'],
    ['university students', 'undergraduates'],
    ['clinical staff and students', 'clinicians'],
  ])('lets the longest keyword win: %j resolves to %s', (typed, expected) => {
    expect(matchAudience(typed).option).toBe(expected);
  });

  it('breaks exact-length ties by declaration order', () => {
    // 'student' (undergraduates, 3rd) and 'faculty' (general, 9th) are
    // both 7 characters, so the earlier preset takes it.
    expect(matchAudience('a student and faculty mix').option).toBe(
      'undergraduates',
    );
  });
});
