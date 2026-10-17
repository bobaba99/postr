/**
 * Pure tests for the shared slash-command matcher + insertion logic.
 * Both SmartText and SmartTextarea route through these helpers, so
 * pinning the contract here prevents the two surfaces from drifting
 * apart on edge cases (empty prefix, mid-string insertion, etc).
 */
import { describe, it, expect } from 'vitest';
import { applySymbolInsertion, matchSlashAtCaret, textBeforeCaretByLine } from '../slashCommand';

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

describe('matchSlashAtCaret: "/" only at the start of a word (record 39, rule T4)', () => {
  it.each(['n/a', 'mg/kg', 'w/', 'μg/d', 'see Fig. 2/', 'and/or', '24/7', 'km/h', 'x/'])('"%s": a slash inside a word, no match', (t) => {
    expect(matchSlashAtCaret(t)).toBeNull();
  });

  it.each([
    ['after a space', 'p = /al', 'al'],
    ['after a no-break space', 'p\u00a0/al', 'al'],
    ['after a line break', 'line one\n/al', 'al'],
    ['after a tab', 'x\t/', ''],
    ['at the start', '/al', 'al'],
  ])('%s: a match', (_what, t, prefix) => {
    expect(matchSlashAtCaret(t)?.prefix).toBe(prefix);
    expect(matchSlashAtCaret(t)?.literal).toBe(`/${prefix}`);
  });
});

describe('textBeforeCaretByLine', () => {
  const caretIn = (html: string) => {
    const root = document.createElement('div');
    root.innerHTML = html;
    document.body.replaceChildren(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let last: Text | null = null;
    for (let n = w.nextNode() as Text | null; n; n = w.nextNode() as Text | null) last = n;
    const r = document.createRange();
    if (last) r.setStart(last, last.data.length);
    else r.selectNodeContents(root);
    r.collapse(true);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
    return root;
  };

  it('a <br> is a line break', () => {
    expect(textBeforeCaretByLine(caretIn('one<br>/al'))).toBe('one\n/al');
  });

  it('a line the browser put in a <div> (Chromium\'s and WebKit\'s Enter) starts with a line break', () => {
    expect(textBeforeCaretByLine(caretIn('one<div>/al</div>'))).toBe('one\n/al');
    expect(textBeforeCaretByLine(caretIn('<div>one</div><div>/al</div>'))).toBe('one\n/al');
  });

  it('a list item starts a line', () => {
    expect(textBeforeCaretByLine(caretIn('<ul><li>one</li><li>/al</li></ul>'))).toBe('one\n/al');
  });

  it('inline markup is text: "x<b>/al</b>" is inside a word', () => {
    const t = textBeforeCaretByLine(caretIn('x<b>/al</b>'))!;
    expect(t).toBe('x/al');
    expect(matchSlashAtCaret(t)).toBeNull();
  });

  it('no selection in the root: null', () => {
    const root = caretIn('one');
    const other = document.createElement('div');
    expect(textBeforeCaretByLine(other)).toBeNull();
    void root;
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
