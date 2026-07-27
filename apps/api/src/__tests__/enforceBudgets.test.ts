/**
 * Budget enforcement — the rubric's "no overflow, ever" rule. The
 * prompt asks the model to stay in budget; this pass guarantees it,
 * and every truncation must be reported, never silent.
 */
import { describe, it, expect } from 'vitest';
import { enforceBudget } from '../narrative/enforceBudgets.js';

const words = (n: number, w = 'word') => Array(n).fill(w).join(' ');

describe('enforceBudget', () => {
  it('passes text under budget through untouched', () => {
    const result = enforceBudget('Short and sweet.', 40);
    expect(result).toEqual({ text: 'Short and sweet.', truncated: false });
  });

  it('accepts text at exactly the budget', () => {
    const text = words(40);
    expect(enforceBudget(text, 40)).toEqual({ text, truncated: false });
  });

  it('truncates at a sentence boundary when over budget', () => {
    // Sentences start uppercase — the splitter keys on that, matching
    // real prose (and the mapper's own splitter).
    const text = `${words(20, 'Alpha')}. ${words(15, 'Beta')}. ${words(20, 'Gamma')}.`;
    const result = enforceBudget(text, 40);
    expect(result.truncated).toBe(true);
    expect(result.text).toContain('Alpha');
    expect(result.text).toContain('Beta');
    expect(result.text).not.toContain('Gamma');
  });

  it('hard-cuts with an ellipsis when the first sentence alone overflows', () => {
    const result = enforceBudget(`${words(60)} end.`, 30);
    expect(result.truncated).toBe(true);
    expect(result.text.endsWith('…')).toBe(true);
    expect(result.text.split(/\s+/)).toHaveLength(30);
  });

  it('handles empty input', () => {
    expect(enforceBudget('', 40)).toEqual({ text: '', truncated: false });
  });

  it('trims surrounding whitespace', () => {
    expect(enforceBudget('  padded text  ', 40).text).toBe('padded text');
  });
});
