/**
 * Single source of truth for per-route metadata.
 *
 * The data itself lives in `routes.json`, not in this file, for one
 * reason: the build-time prerender script (`scripts/prerender.mjs`)
 * runs in plain Node, which cannot import TypeScript. JSON is the only
 * artifact both this module and that script can read without a
 * compile step or an extra dependency, so crawler-visible head tags
 * and the tags React sets at runtime cannot drift apart. If you move
 * this data into TS, you reintroduce that drift — and a prerendered
 * copy that has silently diverged from the live app is how honest
 * prerendering turns into an accidental cloaking violation.
 *
 * This module adds types, canonical-URL rules, and builders for the
 * dynamic routes (gallery entries, share links) that have no fixed
 * entry in the JSON.
 */
import routes from './routes.json';

export const SITE_ORIGIN = routes.siteOrigin;
export const SITE_NAME = routes.siteName;
export const SITE_LOCALE = routes.locale;
export const THEME_COLOR = routes.themeColor;
/**
 * Site-wide fallback social card, or null when none exists.
 *
 * Null today, deliberately. Because of the catch-all rewrite, a URL for
 * an image that does not exist returns 200 with the HTML shell rather
 * than a 404 — so pointing og:image at a missing file gives unfurlers
 * an HTML document and they drop the card. No card beats a broken one.
 * Set this once a real 1200x630 asset ships in public/og/.
 */
export const DEFAULT_OG_IMAGE: string | null = routes.defaultOgImage;

export const INDEXABLE = 'index,follow';
export const NOINDEX = 'noindex,nofollow';

/**
 * Appended to every indexable route. Without `max-snippet:-1` Google
 * truncates snippets on longer pages, and `max-image-preview:large`
 * is what makes a gallery poster show as a large thumbnail rather
 * than a favicon-sized one.
 */
export const PREVIEW_DIRECTIVES =
  'max-image-preview:large,max-snippet:-1,max-video-preview:-1';

export interface PageMeta {
  title: string;
  description: string;
  /** Full robots directive, already including preview hints when indexable. */
  robots: string;
  /**
   * Absolute canonical URL, or null to emit none.
   *
   * Null is meaningful, not a placeholder: a noindex page must never
   * carry rel=canonical. The two directives contradict each other, and
   * Google resolves the conflict unpredictably — sometimes by honouring
   * the canonical and indexing the page you meant to hide.
   */
  canonical: string | null;
  ogType: string;
  ogImage: string | null;
  ogImageAlt: string | null;
}

interface StaticRouteRecord {
  title: string;
  description: string;
  robots: string;
  h1: string;
  copy: string[];
}

interface AppRouteRecord {
  title: string;
  description: string;
  robots: string;
}

const STATIC_RECORDS = routes.static as Record<string, StaticRouteRecord>;
const APP_RECORDS = routes.app as Record<string, AppRouteRecord>;

/**
 * Canonical URL rule, applied uniformly: origin + lowercased path, no
 * trailing slash except root, no query string, no fragment.
 */
export function canonicalFor(path: string): string {
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
  const withoutQuery = withLeadingSlash.split(/[?#]/)[0] ?? '/';
  const lowered = withoutQuery.toLowerCase();
  const trimmed =
    lowered.length > 1 && lowered.endsWith('/') ? lowered.slice(0, -1) : lowered;
  return `${SITE_ORIGIN}${trimmed}`;
}

function withPreviewDirectives(robots: string): string {
  return robots === INDEXABLE ? `${INDEXABLE},${PREVIEW_DIRECTIVES}` : robots;
}

function toPageMeta(
  path: string,
  record: { title: string; description: string; robots: string },
): PageMeta {
  const indexable = record.robots === INDEXABLE;
  return {
    title: record.title,
    description: record.description,
    robots: withPreviewDirectives(record.robots),
    canonical: indexable ? canonicalFor(path) : null,
    ogType: path === '/' ? 'website' : 'article',
    ogImage:
      indexable && DEFAULT_OG_IMAGE ? `${SITE_ORIGIN}${DEFAULT_OG_IMAGE}` : null,
    ogImageAlt:
      indexable && DEFAULT_OG_IMAGE
        ? `${SITE_NAME}: free conference poster maker`
        : null,
  };
}

/** Prerenderable, indexable routes. Consumed by the app and the build script. */
export const STATIC_ROUTE_META: Record<string, PageMeta> = Object.fromEntries(
  Object.entries(STATIC_RECORDS).map(([path, record]) => [
    path,
    toPageMeta(path, record),
  ]),
);

/** Signed-in and utility routes. Titled for humans, hidden from crawlers. */
export const APP_ROUTE_META: Record<string, PageMeta> = Object.fromEntries(
  Object.entries(APP_RECORDS).map(([path, record]) => [
    path,
    toPageMeta(path, record),
  ]),
);

/** Crawler-visible body copy per static route, shared with the prerender script. */
export function staticCopyFor(path: string): { h1: string; copy: string[] } | null {
  const record = STATIC_RECORDS[path];
  return record ? { h1: record.h1, copy: record.copy } : null;
}

export function metaFor(path: string): PageMeta | null {
  return STATIC_ROUTE_META[path] ?? APP_ROUTE_META[path] ?? null;
}

export const NOT_FOUND_META: PageMeta =
  APP_ROUTE_META['/404'] ??
  toPageMeta('/404', {
    title: `Page not found | ${SITE_NAME}`,
    description: 'That page does not exist.',
    robots: NOINDEX,
  });

/** Truncate on a word boundary so descriptions never end mid-word. */
export function clampDescription(text: string, max = 155): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= max) return collapsed;
  const cut = collapsed.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Meta for a signed-in route whose title depends on loaded data.
 *
 * Every route must set meta, even the private ones. This hook has no
 * unmount cleanup by design (removing tags on unmount would blank the
 * head between route transitions), so a route that sets nothing simply
 * inherits whatever the previous route left behind — which after
 * visiting a gallery entry means `robots: index,follow` and a canonical
 * pointing at someone else's poster.
 */
export function noindexMeta(title: string, description: string): PageMeta {
  return {
    title,
    description,
    robots: NOINDEX,
    canonical: null,
    ogType: 'website',
    ogImage: null,
    ogImageAlt: null,
  };
}

export interface GalleryEntryMetaInput {
  id: string;
  title: string;
  fieldLabel: string;
  conference: string | null;
  year: number | null;
  notes: string | null;
  imageUrl: string | null;
}

/**
 * Gallery entries are indexable, so they get a real canonical and a
 * poster-image card. Used by the React page and by the edge shell
 * function that serves crawlers, which must agree.
 */
export function galleryEntryMeta(entry: GalleryEntryMetaInput): PageMeta {
  const venue = [entry.conference, entry.year ? String(entry.year) : null]
    .filter(Boolean)
    .join(' ');
  const descriptionParts = [
    venue ? `${entry.title} (${venue})` : entry.title,
    `a ${entry.fieldLabel.toLowerCase()} conference poster in the ${SITE_NAME} gallery.`,
  ];
  if (entry.notes) descriptionParts.push(entry.notes);

  return {
    title: `${clampDescription(entry.title, 45)} — ${entry.fieldLabel} Poster | ${SITE_NAME}`,
    description: clampDescription(descriptionParts.join(' ')),
    robots: withPreviewDirectives(INDEXABLE),
    canonical: canonicalFor(`/gallery/${entry.id}`),
    ogType: 'article',
    ogImage: entry.imageUrl,
    ogImageAlt: `Conference poster: ${entry.title}`,
  };
}

/**
 * Share links are users' in-progress research: never indexable, but
 * they should still unfurl richly, because pasting one into a lab Slack
 * is the core sharing loop. Holding those two together is the whole
 * point of this builder — it is easy to lump them and end up either
 * indexing private work or shipping blank cards.
 *
 * Caveat on what actually ships today: the only caller (Share.tsx)
 * passes imageUrl null, because that page renders a live canvas rather
 * than a stored image, so real cards await the Phase 1 edge shell.
 * This builder accepts an image so that shell can supply one without
 * renegotiating the noindex contract.
 */
export function shareMeta(input: {
  title: string | null;
  imageUrl: string | null;
}): PageMeta {
  const title = input.title?.trim() || 'Untitled poster';
  return {
    title: `${title} · Shared on ${SITE_NAME}`,
    description: `A research poster shared for review on ${SITE_NAME}. Comment on it, or make your own conference poster free.`,
    robots: NOINDEX,
    canonical: null,
    ogType: 'article',
    ogImage: input.imageUrl,
    ogImageAlt: `Research poster: ${title}`,
  };
}
