/**
 * Fix 03 (plan item 3), cause C — the guidelines panel starts closed on a
 * small screen. Engineering record: docs/fixes/03-fit-whole-sheet.md.
 *
 *   H4  The guidelines panel opens at every width; the owner decided it
 *       starts closed below 1600 px, where it leaves too little canvas.
 *
 * Re-run: npx vitest run src/poster/__tests__/guidelinesDefault.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { PosterEditor } from '../PosterEditor';

const authSpies = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: authSpies,
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) },
  },
}));
vi.mock('@/data/posters', async (orig) => ({
  ...(await orig<typeof import('@/data/posters')>()),
  upsertPoster: vi.fn(async () => ({})),
}));
vi.mock('@/data/thumbnails', () => ({ captureThumbnail: vi.fn(async () => null) }));

import { NoopResizeObserver, click, load, makeDoc, nextTask, q, renderEditor } from './editorKit';
import { stubScreen } from './workspaceKit';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('H4 — the guidelines panel starts closed on a small screen', () => {
  it.each([
    [1280, 'closed'],
    [1440, 'closed'],
    [1599, 'closed'],
    [1600, 'open'],
    [1920, 'open'],
  ])('a window %s px wide opens the editor with the panel %s', (width, want) => {
    stubScreen({ width: 900, height: 700 }, width);
    load(makeDoc(48, 36));
    renderEditor();
    const closed = document.querySelector('[title="Show poster guidelines"]') !== null;
    expect(closed ? 'closed' : 'open').toBe(want);
  });

  it('the panel can still be opened on a small screen, and it stays open', async () => {
    stubScreen({ width: 900, height: 700 }, 1280);
    load(makeDoc(48, 36));
    renderEditor();
    await click(q('[title="Show poster guidelines"]'), 'Show poster guidelines');
    expect(document.querySelector('[title="Hide guidelines"]')).not.toBeNull();
    expect(document.querySelector('[title="Show poster guidelines"]')).toBeNull();
  });
});

describe('the phone share view has no guidelines panel, so no control for it', () => {
  // Found by the code review of cause C: below 1600 px the panel now starts
  // closed, which rendered its "Show" toggle on the phone share view too,
  // where the rail is never drawn and the share bar covers the toggle.
  const renderShare = () =>
    render(
      <MemoryRouter initialEntries={['/s/fixture']}>
        <PosterEditor readOnly />
      </MemoryRouter>,
    );

  it('on a phone, neither the panel nor its toggle is there', () => {
    stubScreen({ width: 375, height: 600 }, 375);
    load(makeDoc(48, 36));
    renderShare();
    expect(document.querySelector('[title="Show poster guidelines"]')).toBeNull();
    // The panel itself stays in the tree, but inside a wrapper that is not
    // displayed, so nothing in it can be seen or focused.
    const hide = document.querySelector<HTMLElement>('[title="Hide guidelines"]');
    const hidden = (el: HTMLElement | null): boolean =>
      el !== null && (el.style.display === 'none' || hidden(el.parentElement));
    expect(hide === null || hidden(hide)).toBe(true);
  });

  it('control: the desktop share page below 1600 px offers the toggle', () => {
    stubScreen({ width: 900, height: 700 }, 1280);
    load(makeDoc(48, 36));
    renderShare();
    expect(document.querySelector('[title="Show poster guidelines"]')).not.toBeNull();
  });
});

describe('the closed guidelines panel is out of the keyboard\'s reach', () => {
  // Found while measuring cause C (record section 8): a closed panel is
  // clipped to zero width, not removed, so Shift+Tab from its own "Show"
  // toggle landed on 40 controls nobody could see. Cause C makes the closed
  // panel the default below 1600 px. jsdom has no focus order; the browser
  // harness measures the keyboard itself (fit-check.mjs, claim H4k). Here:
  // the panel is inert while closed.
  const inert = (sel: string) => q(sel)?.closest('[inert]') !== null;

  it('inert while closed, not once opened', async () => {
    stubScreen({ width: 900, height: 700 }, 1280);
    load(makeDoc(48, 36));
    renderEditor();
    expect(inert('[title="Hide guidelines"]'), 'closed').toBe(true);
    await click(q('[title="Show poster guidelines"]'), 'Show poster guidelines');
    expect(inert('[title="Hide guidelines"]'), 'open').toBe(false);
  });
});

/** A DOMRect for a stubbed element. */
const rectOf = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect;

/**
 * The window `innerWidth` wide, the canvas `box`, and fixed rects for the
 * elements the onboarding tour may point at (jsdom has no layout).
 */
function stubTourScreen(innerWidth: number, rects: Array<[string, DOMRect | ((el: Element) => DOMRect)]>) {
  const real = Element.prototype.getBoundingClientRect;
  stubScreen({ width: 900, height: 700 }, innerWidth);
  vi.stubGlobal('innerHeight', 900);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.hasAttribute('data-postr-canvas-outer')) return rectOf(0, 0, 900, 700);
    for (const [sel, r] of rects) if (this.matches(sel)) return typeof r === 'function' ? r(this) : r;
    return real.call(this);
  });
}
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** The tour's pulsing highlight: where it is drawn. */
const highlight = () => {
  const pulse = [...document.querySelectorAll('div')].find((d) => d.style.animation.includes('postr-tour-pulse'));
  return pulse ? { left: parseFloat(pulse.style.left), top: parseFloat(pulse.style.top) } : null;
};
/** The four dimming strips, by the side of the highlight they cover. */
const strips = () => {
  const all = [...document.querySelectorAll<HTMLElement>('div')].filter((d) => d.style.zIndex === '10000');
  const [top, bottom, left, right] = all; // rendered in this order
  return { top: top?.style, bottom: bottom?.style, left: left?.style, right: right?.style };
};
const nextButton = () => screen.queryByRole('button', { name: 'Next →' });
/** Wait for the tour (it starts 800 ms after the editor opens). */
const tourStarted = () => screen.findByRole('button', { name: 'Next →' }, { timeout: 3000 });
async function tourToLastStep() {
  await tourStarted();
  for (let i = 0; i < 20 && nextButton(); i += 1) {
    const current = screen.getByText(/^\d+\/\d+$/).textContent;
    fireEvent.click(nextButton()!);
    await waitFor(() => expect(screen.getByText(/^\d+\/\d+$/).textContent).not.toBe(current));
  }
  expect(screen.getByRole('button', { name: 'Done' }), 'precondition: the last step').toBeTruthy();
}

describe('the onboarding tour points at what the user can see', () => {
  // Found by the second code review of cause C and measured in Chromium
  // (record section 8): below 1600 px the panel now starts closed, and the
  // tour's last step measured the clipped panel, off the right edge of the
  // window, so it darkened the whole editor and highlighted nothing.
  const TOGGLE = rectOf(1224, 844, 40, 40);
  const PANEL_OFFSCREEN = rectOf(1280, 0, 320, 900);
  const PANEL_OPEN = rectOf(1600, 0, 320, 900);
  /** The panel is off-screen while it is closed (inert), at PANEL_OPEN once open. */
  const panelRect = (closed: DOMRect, open: DOMRect): [string, DOMRect | ((el: Element) => DOMRect)] =>
    ['[data-postr-guidelines]', (el: Element) => (el.closest('[inert]') ? closed : open)];
  beforeEach(() => localStorage.removeItem('postr.onboarding-done'));
  afterEach(() => localStorage.setItem('postr.onboarding-done', 'true'));

  it('with the panel closed, the last step highlights its "Show" toggle, and says to open it', async () => {
    stubTourScreen(1280, [['[title="Show poster guidelines"]', TOGGLE], panelRect(PANEL_OFFSCREEN, PANEL_OFFSCREEN)]);
    load(makeDoc(48, 36));
    renderEditor();
    await tourToLastStep();
    await waitFor(() => expect(highlight()).toEqual({ left: TOGGLE.left - 6, top: TOGGLE.top - 6 }));
    expect(screen.getByText(/Open it with this button/)).toBeTruthy();
  });

  it('when the user opens the panel from that step, the highlight moves to the panel', async () => {
    // Found by the third review (UX): the tour measured only on step
    // changes, so the highlight stayed where the toggle had been.
    stubTourScreen(1280, [['[title="Show poster guidelines"]', TOGGLE], panelRect(PANEL_OFFSCREEN, rectOf(960, 0, 320, 900))]);
    load(makeDoc(48, 36));
    renderEditor();
    await tourToLastStep();
    await waitFor(() => expect(highlight()).toEqual({ left: TOGGLE.left - 6, top: TOGGLE.top - 6 }));
    fireEvent.click(q('[title="Show poster guidelines"]'));
    await waitFor(() => expect(highlight()).toEqual({ left: 960 - 6, top: -6 }));
    expect(screen.getByText(/Close it to give the canvas more room/)).toBeTruthy();
  });

  it('control: with the panel open, the last step highlights the panel', async () => {
    stubTourScreen(1920, [panelRect(PANEL_OPEN, PANEL_OPEN)]);
    load(makeDoc(48, 36));
    renderEditor();
    await tourToLastStep();
    await waitFor(() => expect(highlight()).toEqual({ left: PANEL_OPEN.left - 6, top: PANEL_OPEN.top - 6 }));
  });

  it('a highlight at the window\'s edges leaves no dimming strip over it', async () => {
    // Found by the independent reproducer T (record section 8): a strip's
    // size went negative at an edge; the browser drops a negative size, so
    // the previous step's strip stayed and half-dimmed the highlight.
    // The open panel touches the top, bottom and right edges.
    stubTourScreen(1920, [panelRect(PANEL_OPEN, PANEL_OPEN)]);
    load(makeDoc(48, 36));
    renderEditor();
    await tourToLastStep();
    await waitFor(() => expect(highlight()).not.toBeNull());
    const st = strips();
    expect([st.top?.height, st.bottom?.height, st.right?.width], 'top, bottom, right').toEqual(['0px', '0px', '0px']);
  });

  it('a sidebar step, touching the left edge, leaves no dimming strip over it', async () => {
    stubTourScreen(1920, [['[data-postr-sidebar]', rectOf(0, 0, 484, 900)]]);
    load(makeDoc(48, 36));
    renderEditor();
    await tourStarted();
    for (let i = 0; i < 2; i += 1) {
      fireEvent.click(nextButton()!); // to step 3, Authors: the whole sidebar
      await waitFor(() => expect(screen.getByText(`${i + 2}/8`)).toBeTruthy());
    }
    await waitFor(() => expect(highlight()).toEqual({ left: -6, top: -6 }));
    const st = strips();
    expect([st.left?.width, st.top?.height, st.bottom?.height], 'left, top, bottom').toEqual(['0px', '0px', '0px']);
  });

  it('a sidebar step after the user collapsed the sidebar opens it again', async () => {
    stubTourScreen(1920, []);
    load(makeDoc(48, 36));
    renderEditor();
    await tourStarted();
    fireEvent.click(nextButton()!); // step 2, in the sidebar
    await waitFor(() => expect(screen.getByText('2/8')).toBeTruthy());
    fireEvent.keyDown(window, { key: '/', metaKey: true });
    await nextTask();
    expect(q('[title="Show sidebar (⌘/)"]'), 'precondition: the sidebar collapsed').not.toBeNull();
    fireEvent.click(nextButton()!); // step 3, Authors
    await waitFor(() => expect(q('[title="Show sidebar (⌘/)"]'), 'the sidebar is open again').toBeNull());
  });

  it('control: collapsing the sidebar during a step does not reopen it', async () => {
    // Found by the third review (UX): a re-measure on resize reopened a
    // sidebar the user had just collapsed. Only a step change opens it.
    stubTourScreen(1920, []);
    load(makeDoc(48, 36));
    renderEditor();
    await tourStarted();
    fireEvent.click(nextButton()!); // step 2, in the sidebar
    await waitFor(() => expect(screen.getByText('2/8')).toBeTruthy());
    fireEvent.keyDown(window, { key: '/', metaKey: true });
    fireEvent(window, new Event('resize'));
    await wait(100);
    expect(q('[title="Show sidebar (⌘/)"]'), 'still collapsed').not.toBeNull();
  });
});

describe('opening and closing the guidelines panel keeps keyboard focus visible', () => {
  // Found by the second code review of cause C and measured in Chromium
  // (record section 8). Closing the panel with focus on its "Hide" button
  // left focus on that button, invisible, on main, and on <body> once the
  // panel became inert. Opening it with its "Show" toggle dropped focus to
  // <body> on both, because the toggle leaves the page as the panel opens.
  // Closing the panel is now the common path below 1600 px.
  it('"Hide guidelines" from the keyboard moves focus to "Show poster guidelines"', async () => {
    stubScreen({ width: 900, height: 700 }, 1920);
    load(makeDoc(48, 36));
    renderEditor();
    const hide = q<HTMLButtonElement>('[title="Hide guidelines"]');
    hide.focus();
    await click(hide, 'Hide guidelines');
    expect(document.activeElement).toBe(q('[title="Show poster guidelines"]'));
  });

  it('"Show poster guidelines" from the keyboard moves focus into the panel', async () => {
    stubScreen({ width: 900, height: 700 }, 1280);
    load(makeDoc(48, 36));
    renderEditor();
    const show = q<HTMLButtonElement>('[title="Show poster guidelines"]');
    show.focus();
    await click(show, 'Show poster guidelines');
    expect(document.activeElement).toBe(q('[title="Hide guidelines"]'));
  });

  it('control: opening or closing while focus is elsewhere leaves focus alone', async () => {
    // A click that does not focus the button (Safari, Firefox on macOS).
    // Chromium focuses a clicked button, so there a click moves focus as
    // the keyboard does, without a ring.
    stubScreen({ width: 900, height: 700 }, 1920);
    load(makeDoc(48, 36));
    renderEditor();
    const zoomIn = q<HTMLButtonElement>('[aria-label="Zoom in"]');
    zoomIn.focus();
    await click(q('[title="Hide guidelines"]'), 'Hide guidelines');
    expect(document.activeElement, 'after closing').toBe(zoomIn);
    await click(q('[title="Show poster guidelines"]'), 'Show poster guidelines');
    expect(document.activeElement, 'after opening').toBe(zoomIn);
  });
});
