/**
 * The input modality behind the house focus ring (plan item 20, record
 * docs/fixes/20-focus-ring.md): pointer after a press, keyboard after Tab,
 * and nothing else changes it, not even a key that moves the focus (review
 * round 1, R20-2).
 *
 * Entered the way a browser delivers a user's input: a click is the events a
 * browser fires for one, in order (pointerdown, mousedown, the focus moving
 * to the button, pointerup, mouseup, click); a key is keydown, then, for
 * Tab, the focus moving to the next button, then keyup. The ring itself is
 * CSS that jsdom does not draw: scripts/fit-check.mjs reads it in Chromium,
 * Firefox and WebKit (claims Hm and Hk).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { INPUT_MODALITY_ATTR, installInputModality } from '../inputModality';

const modality = () => document.documentElement.getAttribute(INPUT_MODALITY_ATTR);

/** A pointer event (jsdom 25 has no PointerEvent: a MouseEvent of that type, its pointerType set). */
function pointer(type: string, pointerType = 'mouse'): Event {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, composed: true });
  Object.defineProperty(e, 'pointerType', { value: pointerType });
  return e;
}

function click(el: HTMLElement) {
  el.dispatchEvent(pointer('pointerdown'));
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 1 }));
  el.focus();
  el.dispatchEvent(pointer('pointerup'));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, detail: 1 }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
}

type Mods = { shiftKey?: boolean; altKey?: boolean; metaKey?: boolean; ctrlKey?: boolean };
/** A key pressed on the focused element; Tab moves the focus to `tabTo`. */
function press(key: string, mods: Mods = {}, tabTo?: HTMLElement) {
  const target = (document.activeElement as HTMLElement | null) ?? document.body;
  const down = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods });
  const go = target.dispatchEvent(down);
  if (key === 'Tab' && go && tabTo) tabTo.focus();
  (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, ...mods }));
}

let uninstall: () => void;
let a: HTMLButtonElement;
let b: HTMLButtonElement;

beforeEach(() => {
  document.documentElement.removeAttribute(INPUT_MODALITY_ATTR);
  document.body.innerHTML = '<button id="a">Zoom in</button><button id="b">FIT</button>';
  a = document.getElementById('a') as HTMLButtonElement;
  b = document.getElementById('b') as HTMLButtonElement;
  uninstall = installInputModality(window);
});

afterEach(() => {
  uninstall();
  document.body.innerHTML = '';
  document.documentElement.removeAttribute(INPUT_MODALITY_ATTR);
});

describe('the input modality (plan item 20)', () => {
  it('is unset before any input, so the ring follows the browser', () => {
    expect(modality()).toBeNull();
    a.focus();
    expect(modality()).toBeNull();
  });

  it('is pointer after a click on a button', () => {
    click(a);
    expect(document.activeElement).toBe(a);
    expect(modality()).toBe('pointer');
  });

  it.each([
    ['ArrowDown', {}],
    ['ArrowLeft', {}],
    ['Shift', { shiftKey: true }],
    ['Enter', {}],
    [' ', {}],
    ['a', {}],
    ['z', { metaKey: true }],
    ['z', { ctrlKey: true }],
    ['Escape', {}],
  ] as Array<[string, Mods]>)('stays pointer when %s is pressed after a click (%o)', (key, mods) => {
    click(a);
    press(key, mods);
    expect(document.activeElement).toBe(a);
    expect(modality()).toBe('pointer');
  });

  it.each([
    ['Tab', {}],
    ['Shift+Tab', { shiftKey: true }],
    ['Option+Tab (Safari reaches buttons with it)', { altKey: true }],
  ] as Array<[string, Mods]>)('is keyboard after %s, after a click', (_name, mods) => {
    click(a);
    press('Tab', mods, b);
    expect(document.activeElement).toBe(b);
    expect(modality()).toBe('keyboard');
  });

  it.each([
    ['Tab', {}],
    ['Shift+Tab', { shiftKey: true }],
    ['Option+Tab', { altKey: true }],
  ] as Array<[string, Mods]>)('is keyboard after %s even when nothing takes the focus (the code box indents with Tab)', (_name, mods) => {
    click(a);
    a.addEventListener('keydown', (e) => e.preventDefault());
    press('Tab', mods);
    expect(document.activeElement).toBe(a);
    expect(modality()).toBe('keyboard');
  });

  it('stays keyboard while keys are pressed after Tab (Enter and Space on the button keep the ring)', () => {
    click(b);
    press('Tab', {}, a);
    for (const key of ['Enter', ' ', 'ArrowDown', 'Shift', 'Escape']) press(key);
    expect(document.activeElement).toBe(a);
    expect(modality()).toBe('keyboard');
  });

  // Review round 1 of record 20 (R20-2): the plan's rule lists Enter and Esc
  // among the keys that, pressed after a click, do not switch the ring on,
  // whatever the app then does with the focus.
  it('stays pointer when Esc after a click gives the focus back to a dialog opener', () => {
    click(a);
    a.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') b.focus();
    });
    press('Escape');
    expect(document.activeElement).toBe(b);
    expect(modality()).toBe('pointer');
  });

  it('stays pointer when Enter after a click opens a dialog that focuses its button after it shows', async () => {
    click(a);
    a.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') setTimeout(() => b.focus(), 10);
    });
    press('Enter');
    await new Promise((r) => setTimeout(r, 30));
    expect(document.activeElement).toBe(b);
    expect(modality()).toBe('pointer');
  });

  it('stays pointer when the focus comes back later, after a click and an arrow (the window regaining it)', () => {
    click(a);
    press('ArrowDown');
    b.focus();
    a.focus();
    expect(modality()).toBe('pointer');
  });

  it('stays keyboard when a key moves the focus after Tab (Enter opening a dialog, Esc closing it)', () => {
    click(b);
    press('Tab', {}, a);
    a.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') b.focus();
    });
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') a.focus();
    });
    press('Enter');
    expect(document.activeElement).toBe(b);
    expect(modality()).toBe('keyboard');
    press('Escape');
    expect(document.activeElement).toBe(a);
    expect(modality()).toBe('keyboard');
  });

  it('stays pointer when a click moves the focus (a dialog opened with the mouse)', () => {
    a.addEventListener('click', () => b.focus());
    click(a);
    expect(document.activeElement).toBe(b);
    expect(modality()).toBe('pointer');
  });

  it('is pointer again after a press that follows keyboard navigation', () => {
    click(b);
    press('Tab', {}, a);
    expect(modality()).toBe('keyboard');
    click(b);
    expect(modality()).toBe('pointer');
    press('ArrowDown');
    expect(modality()).toBe('pointer');
  });

  it('sees a press whose propagation a block control stops', () => {
    press('Tab', {}, a);
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    click(b);
    expect(modality()).toBe('pointer');
  });

  it('sees Tab while a dialog stops every key in the window capture phase (ConfirmModal)', () => {
    click(a);
    const swallow = (e: KeyboardEvent) => e.stopImmediatePropagation();
    window.addEventListener('keydown', swallow, true);
    try {
      press('Tab', {}, b);
      expect(modality()).toBe('keyboard');
    } finally {
      window.removeEventListener('keydown', swallow, true);
    }
  });

  it('a touch press is a pointer press', () => {
    press('Tab', {}, a);
    b.dispatchEvent(pointer('pointerdown', 'touch'));
    expect(modality()).toBe('pointer');
  });
});
