/**
 * The print shortcut's key rule (record 30; usePrintShortcut.ts): ⌘P on a
 * Mac, Ctrl+P elsewhere, no Shift, no Alt; the letter without case, and the
 * physical P key only where the layout types a letter that is not Latin.
 * The editor's handling of the key (the window, the document, the browser's
 * own print kept away) is tested from the user's key press in
 * onePrintPath.test.tsx.
 *
 * Re-run: npx vitest run src/poster/__tests__/printShortcut.test.ts
 */
import { describe, expect, it } from 'vitest';
import { isPrintShortcut } from '../usePrintShortcut';

const key = (k: string, mods: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean } = {}, code = 'KeyP') => ({
  key: k,
  code,
  metaKey: !!mods.meta,
  ctrlKey: !!mods.ctrl,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
});

describe('isPrintShortcut', () => {
  it.each([
    // [what, event, on a Mac, elsewhere]
    ['⌘P', key('p', { meta: true }), true, false],
    ['Ctrl+P', key('p', { ctrl: true }), false, true],
    ['⌘P with Caps Lock', key('P', { meta: true }), true, false],
    ['Ctrl+P with Caps Lock', key('P', { ctrl: true }), false, true],
    ['⇧⌘P / Ctrl+Shift+P (the browser’s)', key('P', { meta: true, ctrl: true, shift: true }), false, false],
    ['⇧⌘P', key('P', { meta: true, shift: true }), false, false],
    ['Ctrl+Shift+P', key('P', { ctrl: true, shift: true }), false, false],
    ['⌥⌘P (the browser’s system dialog)', key('π', { meta: true, alt: true }), false, false],
    ['Ctrl+Alt+P (AltGr)', key('p', { ctrl: true, alt: true }), false, false],
    ['⌘ and Ctrl with P', key('p', { meta: true, ctrl: true }), false, false],
    ['P alone', key('p'), false, false],
    ['⌘O', key('o', { meta: true }, 'KeyO'), false, false],
    ['⌘ on the P key of a Cyrillic layout (з)', key('з', { meta: true }), true, false],
    ['Ctrl on the P key of a Greek layout (π)', key('π', { ctrl: true }), false, true],
    ['⌘ on the P key of a Dvorak layout (l)', key('l', { meta: true }), false, false],
    ['⌘P on Dvorak (the R key types p)', key('p', { meta: true }, 'KeyR'), true, false],
  ] as const)('%s', (_what, e, mac, other) => {
    expect(isPrintShortcut(e, true)).toBe(mac);
    expect(isPrintShortcut(e, false)).toBe(other);
  });
});
