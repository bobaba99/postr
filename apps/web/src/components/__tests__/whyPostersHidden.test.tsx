/**
 * The "Why posters" links are hidden (the owner, 2026-10-29: "hide the
 * 'why poster' menu for now"; config/features.ts WHY_POSTERS_NAV_ENABLED).
 *
 * With the switch off, as shipped, no navigation leads to the page, in
 * English or in French: not the public header's flat row, not its phone
 * menu, not the footer, and not the NAV_LINKS list the dashboard and admin
 * headers render (the list is checked here, not those two headers). The
 * prerendered pages' fallback links leave it out too (prerenderFrench.test.ts,
 * P5). The page itself stays: /why-posters and /why-posters/fr still render
 * (frenchPages.test.tsx enters both). With the switch on, the links come back
 * where they were: whyPostersShown.test.tsx.
 *
 * Re-run: npx vitest run src/components/__tests__/whyPostersHidden.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const authSpies = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  })),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: authSpies },
}));

import { WHY_POSTERS_NAV_ENABLED } from '@/config/features';
import { NAV_LINKS, PublicHeader, navLinksFor } from '../PublicHeader';
import { PublicFooter } from '../PublicFooter';

/**
 * The page in each language, entered from that language's landing page, and
 * that language's About page: a link that must be there, so an empty render
 * cannot pass for a hidden link.
 */
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

describe('the Why posters links while WHY_POSTERS_NAV_ENABLED is off', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ships with the switch off', () => {
    expect(WHY_POSTERS_NAV_ENABLED).toBe(false);
  });

  it('leaves the page out of the nav lists, the signed-in headers’ included', () => {
    expect(navLinksFor('en').map((link) => link.to)).not.toContain('/why-posters');
    expect(navLinksFor('fr').map((link) => link.to)).not.toContain('/why-posters/fr');
    expect(NAV_LINKS.map((link) => link.to)).not.toContain('/why-posters');
  });

  it.each(PAGES)(
    'has no link to it in the %s header, its flat row or its phone menu',
    (_language, landing, page, about) => {
      const { container } = renderAt(landing, <PublicHeader />);
      fireEvent.click(screen.getByRole('button', { name: /menu/i }));
      const hrefs = hrefsOf(container);
      expect(hrefs).toContain(about);
      expect(hrefs).not.toContain(page);
    },
  );

  it.each(PAGES)('has no link to it in the %s footer', (_language, landing, page, about) => {
    const hrefs = hrefsOf(renderAt(landing, <PublicFooter />).container);
    expect(hrefs).toContain(about);
    expect(hrefs).not.toContain(page);
  });
});
