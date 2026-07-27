/**
 * Discoverability of the standalone tools.
 *
 * /chart-chooser and /paper-to-poster both shipped with NOTHING linking
 * to them — not the header, not the footer, not the landing page. They
 * were reachable only by typing the URL, and the owner could not find
 * them. These tests exist so that regression is caught here rather than
 * by someone failing to find a page again.
 *
 * They assert reachability (a real anchor with the right href) rather
 * than copy, so wording can be revised freely; only removing the path
 * to a tool fails the suite.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const authSpies = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: null } })),
  signInAnonymously: vi.fn(),
  onAuthStateChange: vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  })),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: authSpies },
}));

import { PublicHeader } from '../PublicHeader';
import { PublicFooter } from '../PublicFooter';
import Landing from '../../pages/Landing';

/** Canonical tool URLs — never the alias spellings, which 308. */
const TOOL_PATHS = ['/paper-to-poster', '/chart-chooser'];

function renderIn(ui: React.ReactNode) {
  return render(<MemoryRouter initialEntries={['/']}>{ui}</MemoryRouter>);
}

function hrefsOf(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('a[href]')).map(
    (anchor) => anchor.getAttribute('href') ?? '',
  );
}

describe('PublicHeader Tools menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the tool links out of the DOM until the menu is opened', () => {
    const { container } = renderIn(<PublicHeader />);
    expect(hrefsOf(container)).not.toContain('/chart-chooser');
  });

  it.each(TOOL_PATHS)('links to %s once the menu is opened', async (path) => {
    renderIn(<PublicHeader />);
    fireEvent.click(screen.getByRole('button', { name: /tools/i }));

    const panel = await screen.findByRole('list', { name: /tools/i });
    expect(hrefsOf(panel)).toContain(path);
  });

  it('reports expanded state to assistive tech', async () => {
    renderIn(<PublicHeader />);
    const trigger = screen.getByRole('button', { name: /tools/i });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  /**
   * The panel used to declare role="menu" with role="menuitem" children
   * while implementing none of the WAI-ARIA menu keyboard model — no
   * roving tabindex, no arrow keys, no Home/End. That announced an
   * affordance to screen-reader users that did not exist. The roles must
   * stay honest: plain links in a labelled list, navigated by Tab.
   */
  it('does not claim the menu pattern it does not implement', async () => {
    renderIn(<PublicHeader />);
    fireEvent.click(screen.getByRole('button', { name: /tools/i }));
    await screen.findByRole('list', { name: /tools/i });

    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
    expect(screen.getByRole('button', { name: /tools/i })).toHaveAttribute(
      'aria-haspopup',
      'true',
    );
  });

  it('points the trigger at the panel it controls', async () => {
    renderIn(<PublicHeader />);
    const trigger = screen.getByRole('button', { name: /tools/i });
    fireEvent.click(trigger);

    const panel = await screen.findByRole('list', { name: /tools/i });
    expect(trigger.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.id).toBeTruthy();
  });

  it('leaves every tool link reachable by Tab', async () => {
    renderIn(<PublicHeader />);
    fireEvent.click(screen.getByRole('button', { name: /tools/i }));
    const panel = await screen.findByRole('list', { name: /tools/i });

    // A roving tabindex would park all but one item at -1. These are
    // ordinary links, so none of them may be taken out of the tab order.
    const links = Array.from(panel.querySelectorAll('a[href]'));
    expect(links).toHaveLength(TOOL_PATHS.length);
    for (const link of links) {
      expect(link.getAttribute('tabindex')).toBeNull();
    }
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    renderIn(<PublicHeader />);
    const trigger = screen.getByRole('button', { name: /tools/i });
    fireEvent.click(trigger);
    await screen.findByRole('list', { name: /tools/i });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('list', { name: /tools/i })).toBeNull();
    // Without this the keyboard user is dumped on <body>.
    expect(document.activeElement).toBe(trigger);
  });

  it('closes when a pointer goes down outside the menu', async () => {
    renderIn(
      <>
        <PublicHeader />
        <button type="button">elsewhere</button>
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: /tools/i }));
    await screen.findByRole('list', { name: /tools/i });

    fireEvent.pointerDown(screen.getByRole('button', { name: 'elsewhere' }));

    expect(screen.queryByRole('list', { name: /tools/i })).toBeNull();
  });

  it('closes when keyboard focus leaves the menu entirely', async () => {
    renderIn(
      <>
        <PublicHeader />
        <button type="button">elsewhere</button>
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: /tools/i }));
    await screen.findByRole('list', { name: /tools/i });

    // Tabbing past the last link used to strand an open panel over the
    // nav — the keyboard had no equivalent of clicking outside.
    const outside = screen.getByRole('button', { name: 'elsewhere' });
    outside.focus();
    fireEvent.blur(screen.getByRole('button', { name: /tools/i }), {
      relatedTarget: outside,
    });

    expect(screen.queryByRole('list', { name: /tools/i })).toBeNull();
  });

  it('stays open when focus leaves the window rather than the menu', async () => {
    renderIn(<PublicHeader />);
    const trigger = screen.getByRole('button', { name: /tools/i });
    fireEvent.click(trigger);
    await screen.findByRole('list', { name: /tools/i });

    // relatedTarget null = window blur, not a move to another control.
    // Collapsing here would yank the panel from a returning user.
    fireEvent.blur(trigger, { relatedTarget: null });

    expect(screen.getByRole('list', { name: /tools/i })).toBeTruthy();
  });

  it('keeps focus moves inside the menu from closing it', async () => {
    renderIn(<PublicHeader />);
    const trigger = screen.getByRole('button', { name: /tools/i });
    fireEvent.click(trigger);
    const panel = await screen.findByRole('list', { name: /tools/i });

    const firstLink = panel.querySelector('a[href]') as HTMLElement;
    fireEvent.blur(trigger, { relatedTarget: firstLink });

    expect(screen.getByRole('list', { name: /tools/i })).toBeTruthy();
  });
});

describe('PublicFooter', () => {
  it.each(TOOL_PATHS)('lists %s under Product', (path) => {
    const { container } = renderIn(<PublicFooter />);
    expect(hrefsOf(container)).toContain(path);
  });

  it('keeps both tools in the footer, which is the only path on phones', () => {
    // The header menu is sm:-gated, so if these ever move behind a
    // breakpoint too, small screens lose the tools entirely.
    const { container } = renderIn(<PublicFooter />);
    const productHeading = screen.getByRole('heading', { name: /product/i });
    const column = productHeading.parentElement;

    expect(column).not.toBeNull();
    expect(hrefsOf(column as HTMLElement)).toEqual(
      expect.arrayContaining(TOOL_PATHS),
    );
    expect(hrefsOf(container)).toEqual(expect.arrayContaining(TOOL_PATHS));
  });
});

describe('Landing page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(TOOL_PATHS)('surfaces %s in the page body', async (path) => {
    const { container } = renderIn(<Landing />);

    // Scoped past the footer: the landing page must carry the tools in
    // its own content, not lean on the shared footer to do it.
    const main = container.querySelector('main');
    const footer = container.querySelector('footer');
    expect(main).not.toBeNull();

    const bodyHrefs = Array.from(main!.querySelectorAll('a[href]'))
      .filter((anchor) => !footer?.contains(anchor))
      .map((anchor) => anchor.getAttribute('href') ?? '');

    expect(bodyHrefs).toContain(path);
  });

  it('describes the paper flow without promising slides', () => {
    const { container } = renderIn(<Landing />);
    const card = container
      .querySelector('a[href="/paper-to-poster"]')
      ?.textContent;

    expect(card).toBeTruthy();
    // The deck conversion is not built. /paper-to-present redirects to
    // this flow, so the copy must not imply one is coming.
    expect(card).not.toMatch(/\b(slide|slides|powerpoint|deck|pptx)\b/i);
  });

  it('never mentions AI in the tools section', () => {
    const { container } = renderIn(<Landing />);
    const main = container.querySelector('main');
    expect(main?.textContent ?? '').not.toMatch(/\bAI\b/);
  });
});

describe('internal links point at canonical URLs', () => {
  it.each([
    '/plot-picker',
    '/manuscript-to-poster',
    '/paper-to-present',
  ])('never links to the alias %s', (alias) => {
    const { container } = renderIn(
      <>
        <PublicHeader />
        <PublicFooter />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: /tools/i }));

    // Linking an alias internally would send every visitor through a
    // needless 308 and dilute the canonical's internal link signal.
    expect(hrefsOf(container)).not.toContain(alias);
  });
});
