/**
 * Record 39 — scriptFormat.ts read directly (unit tests, not entry tests;
 * the entry tests are textEditing.test.tsx): PowerPoint's keys on a Mac and
 * elsewhere, the button titles, and the markup x² and x₂ leave in cases the
 * entry tests do not reach (bold inside, a line break, a selection across
 * superscript and plain text, a list).
 *
 * Re-run: npx vitest run src/poster/__tests__/scriptFormat.test.ts
 */
import { describe, expect, it } from 'vitest';
import { listState, scriptKeyAction, scriptState, scriptTitle, toggleScriptIn } from '../scriptFormat';

const k = (o: Partial<KeyboardEvent>) => ({ key: '=', code: 'Equal', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...o });

describe('the keys (Microsoft\'s PowerPoint pages, record 39 §2)', () => {
  it('a Mac: Control + Shift + = and Control + =, with or without ⌘; ⌘ + = alone is the browser\'s zoom', () => {
    expect(scriptKeyAction(k({ ctrlKey: true, shiftKey: true, key: '+' }), true)).toBe('sup');
    expect(scriptKeyAction(k({ ctrlKey: true }), true)).toBe('sub');
    expect(scriptKeyAction(k({ ctrlKey: true, metaKey: true, shiftKey: true, key: '+' }), true)).toBe('sup');
    expect(scriptKeyAction(k({ ctrlKey: true, metaKey: true }), true)).toBe('sub');
    expect(scriptKeyAction(k({ metaKey: true }), true)).toBeNull();
    expect(scriptKeyAction(k({ metaKey: true, shiftKey: true, key: '+' }), true)).toBeNull();
  });

  it('elsewhere: Ctrl + Shift + = and Ctrl + =; not with the Windows key, Alt or another key', () => {
    expect(scriptKeyAction(k({ ctrlKey: true, shiftKey: true, key: '+' }), false)).toBe('sup');
    expect(scriptKeyAction(k({ ctrlKey: true }), false)).toBe('sub');
    expect(scriptKeyAction(k({ ctrlKey: true, metaKey: true }), false)).toBeNull();
    expect(scriptKeyAction(k({ ctrlKey: true, altKey: true }), false)).toBeNull();
    expect(scriptKeyAction(k({ ctrlKey: true, key: '-', code: 'Minus' }), false)).toBeNull();
    expect(scriptKeyAction(k({}), false)).toBeNull();
  });

  it('not the numeric keypad\'s + or = (Ctrl + keypad + zooms Windows browsers; review R1-F3)', () => {
    for (const mac of [true, false]) {
      expect(scriptKeyAction(k({ ctrlKey: true, key: '+', code: 'NumpadAdd' }), mac)).toBeNull();
      expect(scriptKeyAction(k({ ctrlKey: true, shiftKey: true, key: '+', code: 'NumpadAdd' }), mac)).toBeNull();
      expect(scriptKeyAction(k({ ctrlKey: true, key: '=', code: 'NumpadEqual' }), mac)).toBeNull();
    }
  });

  it('the = key by its character when its physical key is reported differently', () => {
    expect(scriptKeyAction(k({ ctrlKey: true, code: 'Digit0' }), false)).toBe('sub');
    expect(scriptKeyAction(k({ ctrlKey: true, shiftKey: true, key: '+', code: 'BracketRight' }), false)).toBe('sup');
  });

  it('the titles name the key on each platform', () => {
    expect(scriptTitle('sup', true)).toBe('Superscript (⌃⇧=)');
    expect(scriptTitle('sub', true)).toBe('Subscript (⌃=)');
    expect(scriptTitle('sup', false)).toBe('Superscript (Ctrl+Shift+=)');
    expect(scriptTitle('sub', false)).toBe('Subscript (Ctrl+=)');
  });
});

/** A host with `html`, and a range over characters [start, end) of its text. */
function hostWith(html: string, start: number, end: number) {
  const host = document.createElement('div');
  host.setAttribute('contenteditable', 'true');
  host.innerHTML = html;
  document.body.replaceChildren(host);
  const at = (offset: number, side: 'start' | 'end'): [Node, number] => {
    const w = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let left = offset;
    for (let n = w.nextNode() as Text | null; n; n = w.nextNode() as Text | null) {
      if (side === 'start' ? left < n.data.length : left <= n.data.length) return [n, left];
      left -= n.data.length;
    }
    return [host, host.childNodes.length];
  };
  const r = document.createRange();
  r.setStart(...at(start, 'start'));
  r.setEnd(...at(end, 'end'));
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(r);
  return { host, range: r };
}

describe('the markup x² and x₂ leave', () => {
  it('bold kept around the superscript', () => {
    const { host, range } = hostWith('<b>H2O</b>', 1, 2);
    expect(toggleScriptIn(host, range, 'sup')).toBe(true);
    expect(host.innerHTML).toBe('<b>H<sup>2</sup>O</b>');
    expect(window.getSelection()!.toString()).toBe('2');
  });

  it('removing a superscript from part of it splits it, and keeps the rest', () => {
    const { host, range } = hostWith('x<sup>123</sup>', 2, 3);
    toggleScriptIn(host, range, 'sup');
    expect(host.innerHTML).toBe('x<sup>1</sup>2<sup>3</sup>');
  });

  it('a superscript next to another joins it', () => {
    const { host, range } = hostWith('x<sup>1</sup>2', 2, 3);
    toggleScriptIn(host, range, 'sup');
    expect(host.innerHTML).toBe('x<sup>12</sup>');
  });

  it('a line break inside a superscript is kept when it is split', () => {
    const { host, range } = hostWith('<sup>a<br>b</sup>', 1, 2);
    toggleScriptIn(host, range, 'sup');
    expect(host.innerHTML).toBe('<sup>a<br></sup>b');
    const again = hostWith('<sup><br>b</sup>', 0, 1);
    toggleScriptIn(again.host, again.range, 'sup');
    expect(again.host.innerHTML).toBe('<br>b');
  });

  it('subscript over superscript replaces it, across two list items too', () => {
    const { host, range } = hostWith('<ul><li>a<sup>1</sup></li><li>b2</li></ul>', 1, 3);
    expect(scriptState(host, range, 'sub')).toBe(false);
    toggleScriptIn(host, range, 'sub');
    expect(host.innerHTML).toBe('<ul><li>a<sub>1</sub></li><li><sub>b</sub>2</li></ul>');
    expect(listState(host, window.getSelection()!.getRangeAt(0), 'UL')).toBe(true);
    expect(listState(host, window.getSelection()!.getRangeAt(0), 'OL')).toBe(false);
  });

  it('the state: all superscript, part of it, a caret inside; nothing done for a caret', () => {
    const all = hostWith('H<sup>2</sup>O', 1, 2);
    expect(scriptState(all.host, all.range, 'sup')).toBe(true);
    const part = hostWith('H<sup>2</sup>O', 1, 3);
    expect(scriptState(part.host, part.range, 'sup')).toBe(false);
    const caret = hostWith('H<sup>23</sup>O', 2, 2);
    expect(scriptState(caret.host, caret.range, 'sup')).toBe(true);
    expect(toggleScriptIn(caret.host, caret.range, 'sup')).toBe(false);
    expect(caret.host.innerHTML).toBe('H<sup>23</sup>O');
  });
});
