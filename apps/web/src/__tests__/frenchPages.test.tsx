/**
 * Fix 26 — every public page in French as well as English (owner decision
 * 2026-10-06: Resila Technologies Inc. is a Quebec company; the Charter of
 * the French Language as amended by Bill 96).
 *
 * Entered where a visitor enters: the app's router at a URL, then a click
 * on the language link. Claims:
 *
 *   F1  each French page renders at its URL with <html lang="fr-CA">, the
 *       title and description routes.json gives it, and (for the
 *       prerendered pages) the h1 the crawler copy promises;
 *   F2  each page, English and French, shows a link to its counterpart in
 *       the other language (« Français » / "English"), and clicking it
 *       keeps the visitor on the same page, query string included;
 *   F3  nothing the English page shows (text, aria-label, placeholder,
 *       title, alt) is shown unchanged on the French page, the open
 *       mobile menu included, beyond the names in SAME_IN_BOTH;
 *   F4  the head carries hreflang alternates between each prerendered
 *       pair, and x-default to English; the billing pages carry none;
 *   F5  a not-found address under /fr is answered in French;
 *   F6  on a French page, every link to a page that has a French twin
 *       leads to the twin (the language link and the Terms line's
 *       English links, marked lang="en", aside); the footer shows the
 *       language link on a bilingual page and none on an English-only one.
 *
 * Re-run: npx vitest run src/__tests__/frenchPages.test.tsx
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import routes from '@/seo/routes.json';

const authSpies = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: null } })),
  getUser: vi.fn(async () => ({ data: { user: null } })),
  refreshSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  signInAnonymously: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: authSpies } }));

vi.mock('@/hooks/usePlan', () => ({
  usePlan: () => ({
    loading: false,
    hasActiveTerm: false,
    isGuest: false,
    credits: 0,
    refresh: vi.fn(),
    applyCredits: vi.fn(),
  }),
}));

import { AppRoutes } from '../routes';
import { PublicFooter } from '@/components/PublicFooter';

const ORIGIN = routes.siteOrigin;

/**
 * The English paths that have a French twin, written out here rather than
 * read from i18n/lang.ts: the instrument must not be derived from the fix.
 */
const WITH_A_TWIN = new Set([
  '/',
  '/about',
  '/why-posters',
  '/pricing',
  '/tools/figure-readability',
  '/auth',
  '/billing/success',
  '/billing/cancel',
  '/privacy',
  '/cookies',
  '/terms',
]);

/** [English path, French path]: every public page and its counterpart. */
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['/', '/fr'],
  ['/about', '/about/fr'],
  ['/why-posters', '/why-posters/fr'],
  ['/pricing', '/pricing/fr'],
  ['/tools/figure-readability', '/tools/figure-readability/fr'],
  ['/auth', '/auth/fr'],
  ['/billing/success', '/billing/success/fr'],
  ['/billing/cancel', '/billing/cancel/fr'],
];

/**
 * Shown the same in both languages, each for a reason: product, company
 * and file-format names; the e-mail address; words French and English
 * share ("Menu", "Auto", "Google"); the Terms line's links to the other
 * language, which name the other language's pages on purpose.
 */
const SAME_IN_BOTH = new Set([
  'Postr',
  'PowerPoint',
  'Python',
  'ggplot2',
  'matplotlib',
  'BibTeX',
  'Google',
  'Stripe',
  'Menu',
  'Auto',
  'Resila Technologies Inc.',
  'support@resila.ai',
  'Conditions d’utilisation',
  'Politique de confidentialité',
  'Terms of Service',
  'Privacy Policy',
]);

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
      <LocationProbe />
    </MemoryRouter>,
  );
}

type RouteRecord = { title: string; description: string; h1?: string; language?: string };

function recordFor(path: string): RouteRecord {
  const record =
    (routes.static as Record<string, RouteRecord>)[path] ?? (routes.app as Record<string, RouteRecord>)[path];
  if (!record) throw new Error(`routes.json has no record for ${path}`);
  return record;
}

const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, '');

/** Every string a visitor can be shown, as the page renders it. */
function shownStrings(root: HTMLElement): Set<string> {
  const out = new Set<string>();
  const add = (raw: string | null) => {
    const text = (raw ?? '').replace(/\s+/g, ' ').trim();
    if (/[A-Za-zÀ-ÿ]{2,}/.test(text)) out.add(text);
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest('[data-testid="location-probe"]')) continue;
    add(node.nodeValue);
  }
  for (const el of root.querySelectorAll('[aria-label],[placeholder],[title],[alt]')) {
    for (const attr of ['aria-label', 'placeholder', 'title', 'alt']) add(el.getAttribute(attr));
  }
  return out;
}

/** The page settled: its h1 rendered (the checker page is a lazy chunk). */
async function settled() {
  await screen.findAllByRole('heading', { level: 1 });
  await act(async () => {});
}

/** Open the phone menu, so its rows are read too. */
function openMenu(container: HTMLElement) {
  const trigger = container.querySelector<HTMLButtonElement>('header button[aria-haspopup="true"]');
  if (trigger) fireEvent.click(trigger);
}

function languageLink(name: 'English' | 'Français', href: string) {
  const links = screen.getAllByRole('link', { name });
  const match = links.find((a) => a.getAttribute('href') === href);
  expect(match, `a « ${name} » link to ${href}; found ${links.map((a) => a.getAttribute('href')).join(', ')}`).toBeDefined();
  return match!;
}

beforeEach(() => {
  sessionStorage.clear();
  document.documentElement.lang = 'en';
});
afterEach(() => {
  cleanup();
});

/** The head's hreflang alternates, by language. */
const alternates = () =>
  Object.fromEntries(
    [...document.head.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => [
      l.getAttribute('hreflang'),
      l.getAttribute('href'),
    ]),
  );

/**
 * One pass per pair, two renders (the suite runs heavy pages; a render per
 * claim made it slow enough to push other files past their timeouts): the
 * English page, then the French one, then the language link both ways.
 */
describe('F1–F4, per page: the English page, its French twin, the link between them', () => {
  it.each(PAIRS)('%s and %s', async (en, fr) => {
    // The English page: lang en, its own title, a « Français » link.
    const english = renderAt(en);
    await settled();
    await waitFor(() => expect(document.title).toBe(recordFor(en).title));
    expect(document.documentElement.lang).toBe('en');
    languageLink('Français', fr);
    openMenu(english.container);
    const enStrings = shownStrings(english.container);
    const enAlternates = alternates();
    cleanup();

    // F1: the French page at its URL, in French.
    const french = renderAt(fr);
    await settled();
    const record = recordFor(fr);
    await waitFor(() => expect(document.documentElement.lang).toBe('fr-CA'));
    expect(document.title).toBe(record.title);
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(record.description);
    expect(record.language).toBe('fr-CA');
    if (fr in routes.static) {
      const h1 = screen.getAllByRole('heading', { level: 1 })[0];
      expect(squash(h1?.textContent)).toBe(squash(record.h1));
    }

    // F4: hreflang alternates name both pages, x-default English; none
    // on the billing pages (not prerendered).
    const expected = en.startsWith('/billing')
      ? {}
      : { en: `${ORIGIN}${en}`, 'fr-CA': `${ORIGIN}${fr}`, 'x-default': `${ORIGIN}${en}` };
    expect(enAlternates).toEqual(expected);
    expect(alternates()).toEqual(expected);

    // F3: nothing the English page showed is shown unchanged here.
    openMenu(french.container);
    const frStrings = shownStrings(french.container);
    expect([...frStrings].filter((s) => enStrings.has(s) && !SAME_IN_BOTH.has(s))).toEqual([]);
    expect(frStrings.size).toBeGreaterThan(3);

    // F6: every link to a page with a French twin leads to the twin.
    const toEnglish = [...french.container.querySelectorAll('a[href]')]
      .filter((a) => !a.closest('[lang="en"]') && !a.hasAttribute('hreflang'))
      .map((a) => a.getAttribute('href') ?? '')
      .filter((href) => WITH_A_TWIN.has(href.split(/[?#]/)[0] ?? ''));
    expect(toEnglish).toEqual([]);
    if (french.container.querySelector('header button[aria-expanded="true"]')) openMenu(french.container);

    // F2: the link back, and forth, keeps the visitor on the same page.
    fireEvent.click(languageLink('English', en));
    await waitFor(() => expect(screen.getByTestId('location-probe').textContent).toBe(en));
    await waitFor(() => expect(document.title).toBe(recordFor(en).title));
    expect(document.documentElement.lang).toBe('en');
    fireEvent.click(languageLink('Français', fr));
    await waitFor(() => expect(screen.getByTestId('location-probe').textContent).toBe(fr));
    await waitFor(() => expect(document.title).toBe(recordFor(fr).title));
    expect(document.documentElement.lang).toBe('fr-CA');
  });
});

describe('F2 — the language link, and where it leads', () => {
  it('keeps the plan a pricing card chose: /auth?plan=term ↔ /auth/fr?plan=term', async () => {
    renderAt('/auth?plan=term');
    await settled();
    fireEvent.click(languageLink('Français', '/auth/fr?plan=term'));
    await waitFor(() => expect(screen.getByTestId('location-probe').textContent).toBe('/auth/fr?plan=term'));
    expect(await screen.findByText(/Forfait à terme · 18,99\s\$\sCA tous les 4\smois \+ taxes applicables/)).toBeInTheDocument();
    fireEvent.click(languageLink('English', '/auth?plan=term'));
    await waitFor(() => expect(screen.getByTestId('location-probe').textContent).toBe('/auth?plan=term'));
    expect(await screen.findByText('Term · CA$18.99 every 4 months + applicable taxes')).toBeInTheDocument();
  });

  it('the French pricing cards send a buyer to the French sign-up, plan kept', async () => {
    renderAt('/pricing/fr');
    await settled();
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/auth/fr?plan=term');
    expect(hrefs).toContain('/auth/fr?plan=pack');
    expect(hrefs).not.toContain('/auth?plan=term');
  });
});

describe('F3 — no English left, the sign-up form too', () => {
  it('/auth?plan=pack and /auth/fr?plan=pack share none either, in sign-up mode with a password typed', async () => {
    const typePassword = () =>
      fireEvent.change(document.querySelector('input[type="password"]')!, { target: { value: 'abc' } });
    const english = renderAt('/auth?plan=pack');
    await settled();
    typePassword();
    const enStrings = shownStrings(english.container);
    expect(enStrings).toContain('At least 8 characters');
    cleanup();
    const french = renderAt('/auth/fr?plan=pack');
    await settled();
    typePassword();
    const frStrings = shownStrings(french.container);
    // shownStrings reads every space, a no-break one too, as a space.
    expect(frStrings).toContain('Au moins 8 caractères');
    expect([...frStrings].filter((s) => enStrings.has(s) && !SAME_IN_BOTH.has(s))).toEqual([]);
  });
});

describe('F4 — leaving a page with alternates', () => {
  it('the billing pages carry none, even after a page that had them', async () => {
    renderAt('/pricing/fr');
    await settled();
    await waitFor(() => expect(Object.keys(alternates())).toHaveLength(3));
    cleanup();
    renderAt('/billing/cancel/fr');
    await settled();
    await waitFor(() => expect(document.title).toBe(recordFor('/billing/cancel/fr').title));
    expect(alternates()).toEqual({});
  });
});

describe('F6 — the footer’s language link', () => {
  const footerAt = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <PublicFooter />
      </MemoryRouter>,
    );

  it('is in the footer of a bilingual page, both ways, query kept', () => {
    footerAt('/pricing?from=card');
    expect(within(screen.getByRole('navigation', { name: 'Language' })).getByRole('link', { name: 'Français' })).toHaveAttribute(
      'href',
      '/pricing/fr?from=card',
    );
    cleanup();
    footerAt('/pricing/fr');
    expect(within(screen.getByRole('navigation', { name: 'Langue' })).getByRole('link', { name: 'English' })).toHaveAttribute(
      'href',
      '/pricing',
    );
  });

  it('is not on an English-only page (the profile)', () => {
    footerAt('/profile');
    expect(screen.queryByRole('navigation', { name: 'Language' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Français' })).toBeNull();
  });
});

describe('F5 — a not-found address', () => {
  it('under /fr is answered in French, with a link to the English one', async () => {
    renderAt('/pas-une-page/fr');
    await settled();
    await waitFor(() => expect(document.documentElement.lang).toBe('fr-CA'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('404');
    expect(screen.getByText('Page introuvable.')).toBeInTheDocument();
    languageLink('English', '/pas-une-page');
  });

  it('elsewhere is answered in English, with a link to the French one', async () => {
    renderAt('/not-a-page');
    await settled();
    expect(screen.getByText('Page not found.')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    languageLink('Français', '/not-a-page/fr');
  });
});
