/**
 * The switch hides the "Why posters" links; it does not remove them
 * (config/features.ts WHY_POSTERS_NAV_ENABLED). Turned on, they come back
 * where they were before 2026-10-29: in the nav lists between Pricing and
 * About (the public header's flat row, its phone menu and NAV_LINKS), and
 * in the footer's Learn column after About, in English and in French. The
 * shipped configuration is whyPostersHidden.test.tsx.
 *
 * Re-run: npx vitest run src/components/__tests__/whyPostersShown.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/config/features', async (orig) => ({
  ...(await orig<typeof import('@/config/features')>()),
  WHY_POSTERS_NAV_ENABLED: true,
}));

const authSpies = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  })),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: authSpies },
}));

import { NAV_LINKS, PublicHeader, navLinksFor } from '../PublicHeader';
import { PublicFooter } from '../PublicFooter';

const PAGES = [
  ['English', '/', '/why-posters', '/about'],
  ['French', '/fr', '/why-posters/fr', '/about/fr'],
] as const;

function renderAt(path: string, ui: React.ReactNode) {
  return render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
}

function hrefsOf(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('a[href]')).map(
    (anchor) => anchor.getAttribute('href') ?? '',
  );
}

describe('the Why posters links while WHY_POSTERS_NAV_ENABLED is on', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('puts the page back between Pricing and About in the nav lists', () => {
    expect(navLinksFor('en').map((link) => link.to)).toEqual([
      '/tools/figure-readability',
      '/pricing',
      '/why-posters',
      '/about',
    ]);
    expect(navLinksFor('fr').map((link) => link.to)).toEqual([
      '/tools/figure-readability/fr',
      '/pricing/fr',
      '/why-posters/fr',
      '/about/fr',
    ]);
    expect(NAV_LINKS).toEqual(navLinksFor('en'));
  });

  it.each(PAGES)(
    'links to it from the %s header, its flat row and its phone menu',
    (_language, landing, page) => {
      const { container } = renderAt(landing, <PublicHeader />);
      const flatRow = hrefsOf(container);
      fireEvent.click(screen.getByRole('button', { name: /menu/i }));
      const menu = hrefsOf(screen.getByRole('list'));
      expect(flatRow).toContain(page);
      expect(menu).toContain(page);
    },
  );

  it.each(PAGES)(
    'links to it from the %s footer, right after About',
    (_language, landing, page, about) => {
      const hrefs = hrefsOf(renderAt(landing, <PublicFooter />).container);
      expect(hrefs.indexOf(page)).toBe(hrefs.indexOf(about) + 1);
    },
  );
});
