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

/**
 * The tools were previously folded into a "Tools" dropdown. They are
 * now listed flat in the header, because a menu hides the very thing
 * that was undiscoverable in the first place — the owner's own
 * complaint, twice. These tests assert the flat listing so nobody
 * re-folds them.
 */
describe('PublicHeader tool links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(TOOL_PATHS)('links to %s directly, with no menu to open', (path) => {
    const { container } = renderIn(<PublicHeader />);
    expect(hrefsOf(container)).toContain(path);
  });

  it('does not hide the tools behind a disclosure', () => {
    renderIn(<PublicHeader />);
    // No "Tools" trigger, and nothing claiming a popup, at desktop
    // width. If one comes back, the links must still be flat too.
    expect(screen.queryByRole('button', { name: /^tools$/i })).toBeNull();
  });

  it('reaches every tool in one click', () => {
    const { container } = renderIn(<PublicHeader />);
    const links = Array.from(container.querySelectorAll('a[href]'));
    for (const path of TOOL_PATHS) {
      const link = links.find((a) => a.getAttribute('href') === path);
      expect(link, `${path} should be a plain anchor`).toBeTruthy();
      // A roving tabindex or -1 would take it out of the tab order.
      expect(link?.getAttribute('tabindex')).toBeNull();
    }
  });

  /**
   * The two sibling manuscript flows must BOTH be listed. Paper-to-Poster
   * is live; Paper-to-Slides is a not-yet-open flow whose nav link is
   * placed now so the entry exists the moment the route lands (spec §7).
   * Asserted by href — the flat listing serves both from the same source.
   */
  it('lists both Paper-to-Poster and Paper-to-Slides', () => {
    const { container } = renderIn(<PublicHeader />);
    const hrefs = hrefsOf(container);
    expect(hrefs).toContain('/paper-to-poster');
    expect(hrefs).toContain('/paper-to-slides');
  });
});

/**
 * The phone header used to render NOTHING but the wordmark and a
 * sign-in button: every nav item carried an `sm:` prefix, so the
 * footer was the only route to any of it. That is the bug these cover.
 */
describe('PublicHeader mobile menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function openMobileMenu() {
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
  }

  it('offers a menu control on small screens', () => {
    renderIn(<PublicHeader />);
    expect(screen.getByRole('button', { name: /menu/i })).toBeTruthy();
  });

  it.each(TOOL_PATHS)('reaches %s from the mobile menu', async (path) => {
    renderIn(<PublicHeader />);
    openMobileMenu();

    const panel = await screen.findByRole('list');
    expect(hrefsOf(panel)).toContain(path);
  });

  it('reports expanded state to assistive tech', () => {
    renderIn(<PublicHeader />);
    const trigger = screen.getByRole('button', { name: /menu/i });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  /**
   * role="menu" promises a roving tabindex, arrow keys, and Home/End.
   * None of that is implemented, so the honest markup for a list of
   * navigation links is a labelled list navigated by Tab. The old
   * dropdown got this wrong once already.
   */
  it('does not claim the menu pattern it does not implement', async () => {
    renderIn(<PublicHeader />);
    openMobileMenu();
    await screen.findByRole('list');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
  });

  it('points the trigger at the panel it controls', async () => {
    renderIn(<PublicHeader />);
    const trigger = screen.getByRole('button', { name: /menu/i });
    fireEvent.click(trigger);

    const panel = await screen.findByRole('list');
    expect(trigger.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.id).toBeTruthy();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    renderIn(<PublicHeader />);
    const trigger = screen.getByRole('button', { name: /menu/i });
    fireEvent.click(trigger);
    await screen.findByRole('list');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('list')).toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    await screen.findByRole('list');

    fireEvent.pointerDown(screen.getByRole('button', { name: 'elsewhere' }));

    expect(screen.queryByRole('list')).toBeNull();
  });

  it('closes after following a link, so it never covers the new page', async () => {
    renderIn(<PublicHeader />);
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    const panel = await screen.findByRole('list');

    fireEvent.click(panel.querySelector('a[href]') as HTMLElement);

    expect(screen.queryByRole('list')).toBeNull();
  });
});

describe('PublicFooter', () => {
  it.each(TOOL_PATHS)('lists %s under Product', (path) => {
    const { container } = renderIn(<PublicFooter />);
    expect(hrefsOf(container)).toContain(path);
  });

  it('keeps both tools in the footer as a second route', () => {
    // The header's flat links are sm:-gated (the mobile menu covers
    // phones), so the footer is the redundant path if that menu ever
    // regresses.
    const { container } = renderIn(<PublicFooter />);
    const productHeading = screen.getByRole('heading', { name: /product/i });
    const column = productHeading.parentElement;

    expect(column).not.toBeNull();
    expect(hrefsOf(column as HTMLElement)).toEqual(
      expect.arrayContaining(TOOL_PATHS),
    );
    expect(hrefsOf(container)).toEqual(expect.arrayContaining(TOOL_PATHS));
  });

  it('lists Paper-to-Slides under Product alongside Paper-to-Poster', () => {
    const { container } = renderIn(<PublicFooter />);
    const productHeading = screen.getByRole('heading', { name: /product/i });
    const column = productHeading.parentElement;

    expect(column).not.toBeNull();
    expect(hrefsOf(column as HTMLElement)).toEqual(
      expect.arrayContaining(['/paper-to-poster', '/paper-to-slides']),
    );
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
    // Open the mobile menu too, so its copies of the links are covered.
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));

    // Linking an alias internally would send every visitor through a
    // needless 308 and dilute the canonical's internal link signal.
    expect(hrefsOf(container)).not.toContain(alias);
  });
});
