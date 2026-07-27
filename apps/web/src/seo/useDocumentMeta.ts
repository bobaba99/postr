/**
 * Applies a route's metadata to <head> on mount and on change.
 *
 * Hand-rolled rather than pulling in a head library. `@unhead/react` v3
 * requires React >= 19.2.4 (this app is on 18.3.1) and `react-helmet-async`
 * is unmaintained; more to the point, for a client-rendered SPA any head
 * library only changes what Googlebot sees after it renders, which the
 * build-time prerender step already handles for the crawlers that never
 * run scripts. So the job here is small and does not justify a dependency.
 *
 * Upsert, never append-and-sweep. After prerendering, the served HTML
 * already contains a description, canonical and OG tags for the route.
 * This hook finds those, updates them in place, and marks them — so
 * hydration cannot produce a second <meta name="description">. Tags are
 * removed only when a route genuinely has no value for them (a noindex
 * route must drop the canonical, not keep a stale one).
 */
import { useEffect } from 'react';
import { SITE_LOCALE, SITE_NAME, type PageMeta } from './siteMeta';

/** Marks the nodes this hook manages, so tests and future passes can find them. */
const OWNED = 'data-pm';

type TagSpec =
  | { kind: 'meta'; key: 'name' | 'property'; id: string; value: string | null }
  | { kind: 'link'; rel: string; value: string | null };

function upsertMeta(
  key: 'name' | 'property',
  id: string,
  value: string | null,
): void {
  const selector = `meta[${key}="${CSS.escape(id)}"]`;
  const existing = document.head.querySelector<HTMLMetaElement>(selector);

  if (value === null) {
    // Unconditional. Every tag in tagSpecsFor is one this module owns by
    // definition, so there is nothing to protect — and gating removal on
    // the OWNED marker would let a prerendered tag survive onto a route
    // that must not have it. That is not hypothetical: it would leave a
    // rel=canonical on a noindex page, which is the one combination
    // PageMeta.canonical exists to prevent.
    existing?.remove();
    return;
  }
  if (existing) {
    existing.setAttribute('content', value);
    existing.setAttribute(OWNED, '');
    return;
  }
  const created = document.createElement('meta');
  created.setAttribute(key, id);
  created.setAttribute('content', value);
  created.setAttribute(OWNED, '');
  document.head.appendChild(created);
}

function upsertLink(rel: string, value: string | null): void {
  const selector = `link[rel="${CSS.escape(rel)}"]`;
  const existing = document.head.querySelector<HTMLLinkElement>(selector);

  if (value === null) {
    existing?.remove();
    return;
  }
  if (existing) {
    existing.setAttribute('href', value);
    existing.setAttribute(OWNED, '');
    return;
  }
  const created = document.createElement('link');
  created.setAttribute('rel', rel);
  created.setAttribute('href', value);
  created.setAttribute(OWNED, '');
  document.head.appendChild(created);
}

function applyJsonLd(data: object | null): void {
  const selector = `script[type="application/ld+json"][${OWNED}]`;
  const existing = document.head.querySelector<HTMLScriptElement>(selector);

  if (data === null) {
    existing?.remove();
    return;
  }
  const serialized = JSON.stringify(data);
  if (existing) {
    existing.textContent = serialized;
    return;
  }
  const created = document.createElement('script');
  created.setAttribute('type', 'application/ld+json');
  created.setAttribute(OWNED, '');
  created.textContent = serialized;
  document.head.appendChild(created);
}

export function tagSpecsFor(meta: PageMeta): TagSpec[] {
  // No fallback. An og:image pointing at a file that does not exist is
  // worse than none: the catch-all rewrite returns the HTML shell with a
  // 200, so unfurlers fetch a document where they expected an image and
  // drop the card entirely.
  const image = meta.ogImage;
  return [
    { kind: 'meta', key: 'name', id: 'description', value: meta.description },
    { kind: 'meta', key: 'name', id: 'robots', value: meta.robots },
    { kind: 'link', rel: 'canonical', value: meta.canonical },

    { kind: 'meta', key: 'property', id: 'og:title', value: meta.title },
    { kind: 'meta', key: 'property', id: 'og:description', value: meta.description },
    { kind: 'meta', key: 'property', id: 'og:type', value: meta.ogType },
    { kind: 'meta', key: 'property', id: 'og:site_name', value: SITE_NAME },
    { kind: 'meta', key: 'property', id: 'og:locale', value: SITE_LOCALE },
    { kind: 'meta', key: 'property', id: 'og:url', value: meta.canonical },
    { kind: 'meta', key: 'property', id: 'og:image', value: image },
    { kind: 'meta', key: 'property', id: 'og:image:alt', value: image ? meta.ogImageAlt : null },
    // No og:image:width/height. A gallery poster is whatever aspect the
    // author printed, and declaring dimensions we have not measured makes
    // unfurlers crop it badly.

    // summary_large_image only makes sense with an image; without one,
    // the plain summary card is what Twitter/X will render anyway.
    { kind: 'meta', key: 'name', id: 'twitter:card', value: image ? 'summary_large_image' : 'summary' },
    { kind: 'meta', key: 'name', id: 'twitter:title', value: meta.title },
    { kind: 'meta', key: 'name', id: 'twitter:description', value: meta.description },
    { kind: 'meta', key: 'name', id: 'twitter:image', value: image },
    // twitter:site is deliberately omitted until a real handle exists —
    // a dangling @handle suppresses the card entirely.
  ];
}

/**
 * @param meta  Pass null while a dynamic route is still loading, so the
 *              previous title holds instead of flashing a wrong one.
 * @param jsonLd Optional per-page structured data. The site-wide
 *              Organization/WebSite graph lives in index.html instead.
 */
export function useDocumentMeta(
  meta: PageMeta | null,
  jsonLd: object | null = null,
): void {
  const serializedMeta = meta ? JSON.stringify(meta) : null;
  const serializedJsonLd = jsonLd ? JSON.stringify(jsonLd) : null;

  useEffect(() => {
    // Above the meta guard, so passing (null, jsonLd) still emits the
    // block rather than silently dropping it.
    applyJsonLd(serializedJsonLd ? (JSON.parse(serializedJsonLd) as object) : null);

    if (!serializedMeta) return;
    const resolved = JSON.parse(serializedMeta) as PageMeta;

    document.title = resolved.title;
    for (const spec of tagSpecsFor(resolved)) {
      if (spec.kind === 'meta') upsertMeta(spec.key, spec.id, spec.value);
      else upsertLink(spec.rel, spec.value);
    }
  }, [serializedMeta, serializedJsonLd]);
}
