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

    const menu = await screen.findByRole('menu', { name: 'Tools' });
    expect(hrefsOf(menu)).toContain(path);
  });

  it('reports expanded state to assistive tech', async () => {
    renderIn(<PublicHeader />);
    const trigger = screen.getByRole('button', { name: /tools/i });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    renderIn(<PublicHeader />);
    const trigger = screen.getByRole('button', { name: /tools/i });
    fireEvent.click(trigger);
    await screen.findByRole('menu', { name: 'Tools' });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menu', { name: 'Tools' })).toBeNull();
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
    await screen.findByRole('menu', { name: 'Tools' });

    fireEvent.pointerDown(screen.getByRole('button', { name: 'elsewhere' }));

    expect(screen.queryByRole('menu', { name: 'Tools' })).toBeNull();
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
