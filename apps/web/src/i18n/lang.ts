/**
 * The public pages' two languages (fix 26; owner decision 2026-10-06:
 * Resila Technologies Inc. is a Quebec company, so the public pages exist
 * in English and in French, the Charter of the French Language as amended
 * by Bill 96). The editor, the dashboard and the profile stay English.
 *
 * A page's language is its URL, and nothing else: the French page is the
 * English path plus `/fr` (`/about/fr`, `/auth/fr?plan=term`), and `/fr`
 * for the landing page, the legal pages' precedent (`/privacy/fr`). No
 * redirect by browser language and no stored preference: a link to a
 * page in one language always opens it in that language.
 *
 * Each page and feature keeps its copy in a dictionary beside this file
 * (`landing.ts`, `pricing.ts`, …): the English object gives the shape,
 * and the French one is typed with it, so a missing or extra French key
 * fails `tsc`; `__tests__/dictionaries.test.ts` checks the same both ways
 * at run time, and that no French string is left in English.
 */
import { useLocation } from 'react-router';

export type Lang = 'en' | 'fr';

/** Both languages of a dictionary: the English copy defines the shape. */
export interface Bilingual<T> {
  readonly en: T;
  readonly fr: T;
}

/** The BCP 47 tag of each language's pages (<html lang>, hreflang). */
export const HTML_LANG: Readonly<Record<Lang, string>> = { en: 'en', fr: 'fr-CA' };

const FR = '/fr';

/**
 * The English paths that have a French page. The legal pages keep their
 * own French components (pages/*Fr.tsx); the others render one component
 * in either language.
 */
export const BILINGUAL_PATHS: ReadonlySet<string> = new Set([
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

/** The path without trailing slashes (but the root). */
function trimmed(pathname: string): string {
  return (pathname || '/').replace(/(.)\/+$/, '$1');
}

/** French when the path is `/fr` or ends in `/fr` (any case, as the router matches). */
export function langFromPath(pathname: string): Lang {
  const key = trimmed(pathname).toLowerCase();
  return key === FR || key.endsWith(FR) ? 'fr' : 'en';
}

/**
 * The English path of a page: `/about/fr` → `/about`, `/fr` → `/`. The
 * rest keeps its case (an id in a path is case-sensitive).
 */
export function englishPath(pathname: string): string {
  const path = trimmed(pathname);
  if (langFromPath(path) === 'en') return path;
  return path.length === FR.length ? '/' : path.slice(0, -FR.length);
}

/** Whether the English path has a French page (compared as the router compares). */
function isBilingual(english: string): boolean {
  return BILINGUAL_PATHS.has(english.toLowerCase());
}

/**
 * The page at `path` (which may carry `?query` and `#hash`) in `lang`:
 * `('/auth?plan=term', 'fr')` → `/auth/fr?plan=term`, `('/', 'fr')` →
 * `/fr`. An English-only path (the editor, the dashboard) is returned as
 * it is, so a French page can link to it.
 */
export function localizedPath(path: string, lang: Lang): string {
  const cut = path.search(/[?#]/);
  const pathname = cut === -1 ? path : path.slice(0, cut);
  const rest = cut === -1 ? '' : path.slice(cut);
  const english = englishPath(pathname);
  if (lang === 'en' || !isBilingual(english)) return `${english}${rest}`;
  return `${english === '/' ? '' : english}${FR}${rest}`;
}

/**
 * The same page in the other language, query and hash kept, or null when
 * the page has no counterpart (an English-only page).
 */
export function counterpartPath(pathname: string, search = '', hash = ''): string | null {
  const english = englishPath(pathname);
  if (!isBilingual(english)) return null;
  const other: Lang = langFromPath(pathname) === 'fr' ? 'en' : 'fr';
  return localizedPath(`${english}${search}${hash}`, other);
}

/** The language of the page being shown (its URL). */
export function useLang(): Lang {
  return langFromPath(useLocation().pathname);
}

/**
 * A number in the page's language: `6.4` in English, `6,4` in French.
 * `digits` fixes the decimals (`toFixed`); omitted, the number is shown
 * as it is.
 */
export function formatNumber(n: number, lang: Lang, digits?: number): string {
  const text = digits === undefined ? String(n) : n.toFixed(digits);
  return lang === 'fr' ? text.replace('.', ',') : text;
}
