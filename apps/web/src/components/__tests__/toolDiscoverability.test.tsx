/**
 * Discoverability of the standalone tools.
 *
 * /chart-chooser once shipped with NOTHING linking to it — not the
 * header, not the footer, not the landing page. It was reachable only
 * by typing the URL, and the owner could not find it. This suite was
 * written so that regression would be caught here rather than by
 * someone failing to find a page again.
 *
 * As of 2026-09-10 the manuscript flows, the presentation checker and
 * the plot picker (being revamped in another worktree) are deactivated
 * (routes.tsx header). The figure-readability check is the ONE
 * standalone tool that is live, so the suite asserts both directions:
 * the checker must be reachable from header, footer and landing, and
 * nothing may link to a route that only redirects home. The
 * mobile-menu and workspace-link contracts are kept as they were.
 *
 * TOOL_PATHS lists the live tools' canonical paths; restoring another
 * is a one-line flip. The assertions check reachability (a real anchor
 * with the right href) rather than copy, so wording can be revised.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const authSpies = vi.hoisted(() => ({
  // `session` is typed loosely so tests can hand back a signed-in
  // session (a partial user) without fighting the real Supabase types.
  getSession: vi.fn(async (): Promise<{ data: { session: unknown } }> => ({
    data: { session: null },
  })),
  signInAnonymously: vi.fn(),
  onAuthStateChange: vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  })),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: authSpies },
}));

import { NAV_LINKS, PublicHeader } from '../PublicHeader';
import { PublicFooter } from '../PublicFooter';
import Landing from '../../pages/Landing';

/**
 * Canonical tool URLs — never the alias spellings, which 308.
 *
 * Only the figure-readability check while the plot picker is
 * deactivated; re-add '/chart-chooser' in FRONT of it when the picker
 * returns (it goes first everywhere it is listed).
 */
const TOOL_PATHS: readonly string[] = ['/tools/figure-readability'];

/**
 * Routes that now only redirect to the landing page. Linking one would
 * send a visitor on a pointless hop and advertise a flow that is off.
 * /plot-picker is the picker's alias spelling — it redirects too.
 */
const DEACTIVATED_PATHS = [
  '/chart-chooser',
  '/plot-picker',
  '/paper-to-poster',
  '/paper-to-slides',
  '/presentation-checker',
];

/** The Learn pages — the nav after the tools. */
const LEARN_PATHS = ['/pricing', '/why-posters', '/about'];

/** The full public nav, in order: tools first, then the Learn pages. */
const PUBLIC_NAV_PATHS = [...TOOL_PATHS, ...LEARN_PATHS];

function renderIn(ui: React.ReactNode) {
  return render(<MemoryRouter initialEntries={['/']}>{ui}</MemoryRouter>);
}

function hrefsOf(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('a[href]')).map(
    (anchor) => anchor.getAttribute('href') ?? '',
  );
}

/**
 * The tools were previously folded into a "Tools" dropdown, then
 * listed flat. The header renders the live tools flat, in front of
 * the Learn pages — no stray separator, no "Tools" group, no
 * disclosure that opens onto anything.
 */
describe('PublicHeader tool links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes exactly the live standalone tools in NAV_LINKS, ahead of the Learn pages', () => {
    expect(TOOL_PATHS).toEqual(['/tools/figure-readability']);
    expect(NAV_LINKS.map((link) => link.to)).toEqual(PUBLIC_NAV_PATHS);
  });

  it.each(TOOL_PATHS)('links to %s directly, with no menu to open', (path) => {
    const { container } = renderIn(<PublicHeader />);
    expect(hrefsOf(container)).toContain(path);
  });

  it('does not hide anything behind a Tools disclosure', () => {
    renderIn(<PublicHeader />);
    // No "Tools" trigger, and nothing claiming a popup, at desktop
    // width. If the tools come back, the links must be flat too.
    expect(screen.queryByRole('button', { name: /^tools$/i })).toBeNull();
  });

  /**
   * Every standalone tool is deactivated (routes.tsx header): their
   * routes redirect to /, so a nav entry would be a dead end that
   * still advertises the feature. Checked with the mobile menu open
   * too, so its rows are covered.
   */
  it.each(DEACTIVATED_PATHS)('does not link the deactivated %s', (path) => {
    const { container } = renderIn(<PublicHeader />);
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    expect(hrefsOf(container)).not.toContain(path);
  });

  it('renders the tools then the Learn pages flat, in order', () => {
    const { container } = renderIn(<PublicHeader />);
    const header = container.querySelector('header') as HTMLElement;
    const navHrefs = hrefsOf(header).filter(
      (href) => href !== '/' && href !== '/auth' && href !== '/profile',
    );
    expect(navHrefs).toEqual(PUBLIC_NAV_PATHS);
  });

  it('labels the checker "Figure readability" in the flat nav', () => {
    const { container } = renderIn(<PublicHeader />);
    const link = container.querySelector(
      'header a[href="/tools/figure-readability"]',
    );
    expect(link).toHaveTextContent('Figure readability');
  });

  it('waits until the wide breakpoint to show the flat navigation', () => {
    const { container } = renderIn(<PublicHeader />);
    const pricing = container.querySelector('header a[href="/pricing"]');

    expect(pricing).not.toBeNull();
    expect(pricing?.className).toContain('xl:inline');
    expect(pricing?.className).not.toContain('sm:inline');
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
    const { container } = renderIn(<PublicHeader />);
    const trigger = screen.getByRole('button', { name: /menu/i });

    expect(trigger).toBeTruthy();
    expect(container.querySelector('.xl\\:hidden')).toContainElement(trigger);
  });

  it.each(TOOL_PATHS)('reaches %s from the mobile menu', async (path) => {
    renderIn(<PublicHeader />);
    openMobileMenu();

    const panel = await screen.findByRole('list');
    expect(hrefsOf(panel)).toContain(path);
  });

  it('lists the workspace link, the live tools, then the Learn pages — nothing else', async () => {
    renderIn(<PublicHeader />);
    // Wait for the session to resolve so the workspace row has landed
    // and the menu content is final.
    await screen.findByRole('link', { name: /^editor$/i });
    openMobileMenu();

    const panel = await screen.findByRole('list');
    // Workspace row first, then the blurbed tool rows, then the Learn
    // pages — no empty group left behind by the deactivated tools.
    expect(hrefsOf(panel)).toEqual(['/p/new', ...PUBLIC_NAV_PATHS]);
    const rows = within(panel).getAllByRole('listitem');
    expect(rows).toHaveLength(1 + PUBLIC_NAV_PATHS.length);
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

  it('uses accessible supporting text for the checker, and none for deactivated tools', async () => {
    renderIn(<PublicHeader />);
    openMobileMenu();
    await screen.findByRole('list');

    expect(screen.getByText(/check figure text at poster print size/i)).toBeInTheDocument();
    // The deactivated tools' blurbs must not linger as orphaned lines
    // under a missing label.
    expect(screen.queryByText(/find the figure that fits your data/i)).toBeNull();
    expect(screen.queryByText(/turn a manuscript into/i)).toBeNull();
  });
});

/**
 * The auth-aware workspace link. One header link whose destination and
 * label flip with the session: signed out it drops a visitor straight
 * into the editor (/p/new — the no-auth editor), signed in it points at
 * their dashboard.
 * These assert the destination per state so a regression that sends a
 * logged-out visitor to a signup wall — or a signed-in user back to the
 * guest entry — is caught here.
 */
describe('PublicHeader workspace link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: signed out.
    authSpies.getSession.mockResolvedValue({ data: { session: null } });
  });

  it('sends a logged-out visitor straight into the editor', async () => {
    const { container } = renderIn(<PublicHeader />);
    const link = await screen.findByRole('link', { name: /^editor$/i });
    expect(link.getAttribute('href')).toBe('/p/new');
    expect(hrefsOf(container)).not.toContain('/dashboard');
  });

  it('sends a signed-in user to their dashboard', async () => {
    authSpies.getSession.mockResolvedValue({
      data: { session: { user: { id: 'u1' } } },
    });
    render(
      <MemoryRouter initialEntries={['/']}>
        <PublicHeader />
      </MemoryRouter>,
    );
    const link = await screen.findByRole('link', { name: /my posters/i });
    expect(link.getAttribute('href')).toBe('/dashboard');
    expect(screen.queryByRole('link', { name: /^editor$/i })).toBeNull();
  });

  it('reaches the editor from the mobile menu (signed out)', async () => {
    renderIn(<PublicHeader />);
    await screen.findByRole('link', { name: /^editor$/i });
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    const panel = await screen.findByRole('list');
    expect(hrefsOf(panel)).toContain('/p/new');
  });
});

describe('PublicFooter', () => {
  it.each(TOOL_PATHS)('lists %s under Product', (path) => {
    const { container } = renderIn(<PublicFooter />);
    expect(hrefsOf(container)).toContain(path);
  });

  it('keeps the Product column to Home, Pricing and the live tools', () => {
    // The footer is the redundant route to the tools when the header's
    // mobile menu regresses; it must carry every live tool and no link
    // that only redirects home.
    const { container } = renderIn(<PublicFooter />);
    const productHeading = screen.getByRole('heading', { name: /product/i });
    const column = productHeading.parentElement;

    expect(column).not.toBeNull();
    expect(hrefsOf(column as HTMLElement)).toEqual(['/', '/pricing', ...TOOL_PATHS]);
    expect(hrefsOf(container)).toEqual(expect.arrayContaining([...TOOL_PATHS]));
  });

  it.each(DEACTIVATED_PATHS)('does not list the deactivated %s under Product', (path) => {
    const { container } = renderIn(<PublicFooter />);
    expect(hrefsOf(container)).not.toContain(path);
  });

  it('keeps the header and footer logo links at a 44px target', () => {
    // The only two links below the 44px floor on a 375px phone were
    // the shared brand anchors — every control inside <main> already met it.
    renderIn(
      <>
        <PublicHeader />
        <PublicFooter />
      </>,
    );
    const logos = screen.getAllByRole('link', { name: /^postr$/i });
    expect(logos).toHaveLength(2);
    for (const logo of logos) expect(logo.className).toContain('min-h-11');
  });

  it('uses level-two headings for its landmark sections', () => {
    renderIn(<PublicFooter />);

    for (const name of ['Product', 'Learn', 'Account', 'Legal']) {
      expect(screen.getByRole('heading', { name })).toHaveProperty('tagName', 'H2');
    }
  });

  it('uses an accessible default text color', () => {
    const { container } = renderIn(<PublicFooter />);

    expect(container.querySelector('footer')?.className).toContain('text-[#8b8f99]');
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

  it.each(DEACTIVATED_PATHS)('does not link the deactivated %s anywhere on the page', (path) => {
    const { container } = renderIn(<Landing />);
    expect(hrefsOf(container)).not.toContain(path);
  });

  it('advertises the live tools in a standalone-tools section with a count-free intro', () => {
    renderIn(<Landing />);
    const heading = screen.getByRole('heading', {
      level: 2,
      name: /tools you can use on their own/i,
    });
    const section = heading.closest('section') as HTMLElement;
    // "Two parts of the poster workflow…" went stale the moment one
    // card left; the intro must not count the cards.
    const intro = within(section).getByText(/without opening the editor/i);
    expect(intro.textContent ?? '').not.toMatch(/\b(one|two|three|\d+) (parts?|tools?)\b/i);
    // One card per live tool, each a real link to the canonical path.
    const cards = within(section).getAllByRole('link');
    expect(cards.map((card) => card.getAttribute('href'))).toEqual([...TOOL_PATHS]);
    expect(within(section).getByText('Check your figure', { exact: false })).toBeInTheDocument();
  });

  it('links the Figure readability feature card to the standalone check', () => {
    renderIn(<Landing />);
    // Scoped to the feature grid: the tools section below carries a
    // card with the same h3.
    const features = screen
      .getByRole('heading', { level: 2, name: 'Core poster tools' })
      .closest('section') as HTMLElement;
    const heading = within(features).getByRole('heading', {
      level: 3,
      name: 'Figure readability',
    });
    const card = heading.parentElement as HTMLElement;
    const link = within(card).getByRole('link', { name: /try it standalone/i });
    expect(link).toHaveAttribute('href', '/tools/figure-readability');
  });

  it('does not promise a standalone picker or checker in the small-screen note', () => {
    renderIn(<Landing />);
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent(/best on a laptop/i);
    // The old note ended "The plot picker and figure checker work fine
    // on a phone" — a claim about tools that no longer have a page.
    expect(note.textContent ?? '').not.toMatch(/\b(plot picker|figure checker|chart chooser)\b/i);
  });

  it('never mentions AI on the page', () => {
    const { container } = renderIn(<Landing />);
    const main = container.querySelector('main');
    expect(main?.textContent ?? '').not.toMatch(/\bAI\b/);
  });

  it('limits the core feature section to four concise supporting messages', () => {
    renderIn(<Landing />);
    const sectionHeading = screen.getByRole('heading', {
      level: 2,
      name: 'Core poster tools',
    });
    const section = sectionHeading.closest('section');
    expect(section).not.toBeNull();

    const featureHeadings = within(section!).getAllByRole('heading', { level: 3 });
    expect(featureHeadings).toHaveLength(4);

    for (const heading of featureHeadings) {
      const description = heading.parentElement?.querySelector('p')?.textContent ?? '';
      expect(description.trim().split(/\s+/).length).toBeLessThanOrEqual(15);
    }
  });
});

describe('internal links point at canonical URLs', () => {
  it.each([
    '/figure-check',
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
