/**
 * Pure tests for the shared slash-command matcher + insertion logic.
 * Both SmartText and SmartTextarea route through these helpers, so
 * pinning the contract here prevents the two surfaces from drifting
 * apart on edge cases (empty prefix, mid-string insertion, etc).
 */
import { describe, it, expect } from 'vitest';
import { applySymbolInsertion, matchSlashAtCaret } from '../slashCommand';

describe('matchSlashAtCaret', () => {
  it('matches /alpha at end of text', () => {
    const m = matchSlashAtCaret('hello /alpha');
    expect(m).not.toBeNull();
    expect(m!.literal).toBe('/alpha');
    expect(m!.prefix).toBe('alpha');
    expect(m!.before).toBe('hello ');
  });

  it('matches a bare slash', () => {
    const m = matchSlashAtCaret('/');
    expect(m).not.toBeNull();
    expect(m!.prefix).toBe('');
    expect(m!.literal).toBe('/');
  });

  it('returns null when there is no slash', () => {
    expect(matchSlashAtCaret('hello world')).toBeNull();
  });

  it('returns null when a space follows the slash token', () => {
    // The slash token is closed once the user hits space or punctuation.
    expect(matchSlashAtCaret('hello /alpha ')).toBeNull();
  });

  it('anchors to the LAST slash in the string', () => {
    const m = matchSlashAtCaret('foo /bar baz /qux');
    expect(m!.prefix).toBe('qux');
    expect(m!.before).toBe('foo /bar baz ');
  });

  it('ignores characters outside [a-zA-Z0-9] inside the token', () => {
    // `/al-` has a hyphen which breaks the token, so only `` matches
    // after the hyphen → no match.
    expect(matchSlashAtCaret('/al-')).toBeNull();
  });
});

describe('applySymbolInsertion', () => {
  it('replaces /alpha with the alpha symbol', () => {
    const result = applySymbolInsertion('p = /al', 7, 'alpha');
    expect(result).toEqual({ text: 'p = α', caret: 5 });
  });

  it('preserves text after the caret', () => {
    const result = applySymbolInsertion('/al_suffix', 3, 'alpha');
    expect(result).toEqual({ text: 'α_suffix', caret: 1 });
  });

  it('returns null if the symbol key is unknown', () => {
    expect(applySymbolInsertion('/al', 3, 'not-a-symbol')).toBeNull();
  });

  it('returns null when there is no active slash at the caret', () => {
    expect(applySymbolInsertion('hello', 5, 'alpha')).toBeNull();
  });

  it('handles slash at the very start', () => {
    const result = applySymbolInsertion('/beta', 5, 'beta');
    expect(result).toEqual({ text: 'β', caret: 1 });
  });
});
