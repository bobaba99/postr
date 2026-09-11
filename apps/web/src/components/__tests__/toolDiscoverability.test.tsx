/**
 * Discoverability of the standalone tools.
 *
 * /chart-chooser once shipped with NOTHING linking to it — not the
 * header, not the footer, not the landing page. It was reachable only
 * by typing the URL, and the owner could not find it. This suite was
 * written so that regression would be caught here rather than by
 * someone failing to find a page again.
 *
 * As of 2026-09-10 EVERY standalone tool is deactivated (routes.tsx
 * header): the manuscript flows, the presentation checker, and now the
 * plot picker too (it is being revamped in another worktree). The
 * product ships with no standalone tools in its nav, so the suite now
 * asserts the inverse — nothing may link to a route that only
 * redirects home — while keeping the mobile-menu and workspace-link
 * contracts that have nothing to do with tools.
 *
 * TOOL_PATHS is kept (empty) so restoring a tool is a one-line flip:
 * put its canonical path back and the reachability assertions return.
 * They assert reachability (a real anchor with the right href) rather
 * than copy, so wording can be revised freely.
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
 * EMPTY while the standalone tools are deactivated. Re-add
 * '/chart-chooser' (and, when it lands, the plot checker) to bring the
 * reachability assertions below back to life.
 */
const TOOL_PATHS: readonly string[] = [];

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

/** The Learn pages — the whole public nav while no tools are live. */
const LEARN_PATHS = ['/pricing', '/why-posters', '/about'];

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
 * listed flat, and are now absent. With TOOL_PATHS empty the header
 * must render the Learn pages alone — no stray separator, no empty
 * "Tools" group, no disclosure that opens onto nothing.
 */
describe('PublicHeader tool links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes no standalone tool in NAV_LINKS while they are deactivated', () => {
    expect(TOOL_PATHS).toHaveLength(0);
    expect(NAV_LINKS.map((link) => link.to)).toEqual(LEARN_PATHS);
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

  it('renders the Learn pages flat, in order, with no tool rows before them', () => {
    const { container } = renderIn(<PublicHeader />);
    const header = container.querySelector('header') as HTMLElement;
    const navHrefs = hrefsOf(header).filter(
      (href) => href !== '/' && href !== '/auth' && href !== '/profile',
    );
    expect(navHrefs).toEqual(LEARN_PATHS);
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

  it('lists the Learn pages and nothing else while no tool is live', async () => {
    renderIn(<PublicHeader />);
    // Wait for the session to resolve so the workspace row has landed
    // and the menu content is final.
    await screen.findByRole('link', { name: /^editor$/i });
    openMobileMenu();

    const panel = await screen.findByRole('list');
    // Workspace row first, then the Learn pages — no blurbed tool rows
    // in between and no empty group left behind by their removal.
    expect(hrefsOf(panel)).toEqual(['/p/new', ...LEARN_PATHS]);
    const rows = within(panel).getAllByRole('listitem');
    expect(rows).toHaveLength(1 + LEARN_PATHS.length);
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

  it('shows no tool blurb rows while the tools are deactivated', async () => {
    renderIn(<PublicHeader />);
    openMobileMenu();
    await screen.findByRole('list');

    // The picker's blurb was the only supporting text the menu had;
    // with the tool gone the row must go too, not linger as an
    // orphaned line under a missing label.
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

  it('keeps the Product column to Home and Pricing while no tool is live', () => {
    // The footer is the redundant route to the tools when the header's
    // mobile menu regresses; with none live it must not carry a link
    // that only redirects home, and the column must not be left empty.
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

  it('has no standalone-tools section while every tool is deactivated', () => {
    renderIn(<Landing />);
    // The "Tools you can use on their own" grid advertised the picker
    // alone once the manuscript card went; with the picker off too it
    // would be an empty heading over nothing. It comes back with the
    // first restored tool (routes.tsx header).
    expect(
      screen.queryByRole('heading', { level: 2, name: /tools you can use on their own/i }),
    ).toBeNull();
    expect(screen.queryByText(/without opening the editor/i)).toBeNull();
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
