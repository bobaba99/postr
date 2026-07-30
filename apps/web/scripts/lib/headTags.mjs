/**
 * Head-tag construction for build-time prerendering and the edge shells.
 *
 * Plain ESM on purpose: `scripts/prerender.mjs` runs in bare Node during
 * `npm run build`, which cannot import TypeScript. The React runtime has
 * its own copy of this logic in `src/seo/useDocumentMeta.ts`; the two are
 * held in lockstep by a parity test
 * (`src/seo/__tests__/headTagParity.test.ts`) that fails the build if they
 * ever produce different tags for the same input. Do not edit one without
 * the other.
 */

/** Escape for use inside a double-quoted HTML attribute. */
export function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escape for use in HTML text content. */
export function escapeText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export const INDEXABLE = 'index,follow';
export const PREVIEW_DIRECTIVES =
  'max-image-preview:large,max-snippet:-1,max-video-preview:-1';

/** Mirrors canonicalFor() in src/seo/siteMeta.ts. */
export function canonicalFor(path, siteOrigin) {
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
  const withoutQuery = withLeadingSlash.split(/[?#]/)[0] ?? '/';
  const lowered = withoutQuery.toLowerCase();
  const trimmed =
    lowered.length > 1 && lowered.endsWith('/') ? lowered.slice(0, -1) : lowered;
  return `${siteOrigin}${trimmed}`;
}

/** Mirrors toPageMeta() in src/seo/siteMeta.ts. */
export function buildPageMeta(path, record, site) {
  const indexable = record.robots === INDEXABLE;
  const hasDefaultImage = Boolean(site.defaultOgImage);
  const hasShareImage =
    record.shareImage !== false && hasDefaultImage;
  return {
    title: record.title,
    description: record.description,
    robots: indexable
      ? `${INDEXABLE},${PREVIEW_DIRECTIVES}`
      : record.robots,
    canonical: canonicalFor(path, site.siteOrigin),
    language: record.language ?? site.language,
    locale: record.locale ?? site.locale,
    ogType: path === '/' ? 'website' : 'article',
    ogImage: hasShareImage
      ? `${site.siteOrigin}${site.defaultOgImage}`
      : null,
    ogImageAlt:
      hasShareImage ? `${site.siteName}: free conference poster maker` : null,
  };
}

/**
 * The tag set for a page, as {kind, key, id, value} records.
 * A null value means "this page must not have this tag".
 *
 * Mirrors tagSpecsFor() in src/seo/useDocumentMeta.ts.
 */
export function tagSpecsFor(meta, site) {
  const image = meta.ogImage ?? null;
  return [
    { kind: 'meta', key: 'name', id: 'description', value: meta.description },
    { kind: 'meta', key: 'name', id: 'robots', value: meta.robots },
    { kind: 'link', rel: 'canonical', value: meta.canonical },

    { kind: 'meta', key: 'property', id: 'og:title', value: meta.title },
    { kind: 'meta', key: 'property', id: 'og:description', value: meta.description },
    { kind: 'meta', key: 'property', id: 'og:type', value: meta.ogType },
    { kind: 'meta', key: 'property', id: 'og:site_name', value: site.siteName },
    { kind: 'meta', key: 'property', id: 'og:locale', value: meta.locale },
    { kind: 'meta', key: 'property', id: 'og:url', value: meta.canonical },
    { kind: 'meta', key: 'property', id: 'og:image', value: image },
    { kind: 'meta', key: 'property', id: 'og:image:alt', value: image ? meta.ogImageAlt : null },

    {
      kind: 'meta',
      key: 'name',
      id: 'twitter:card',
      value: image ? 'summary_large_image' : 'summary',
    },
    { kind: 'meta', key: 'name', id: 'twitter:title', value: meta.title },
    { kind: 'meta', key: 'name', id: 'twitter:description', value: meta.description },
    { kind: 'meta', key: 'name', id: 'twitter:image', value: image },
  ];
}

function renderTag(spec) {
  if (spec.value === null) return null;
  if (spec.kind === 'link') {
    return `<link rel="${escapeAttr(spec.rel)}" href="${escapeAttr(spec.value)}" />`;
  }
  return `<meta ${spec.key}="${escapeAttr(spec.id)}" content="${escapeAttr(spec.value)}" />`;
}

/**
 * Strip the tags we are about to replace, so injecting into an already
 * populated shell cannot produce duplicates. Only removes the exact
 * tags this module owns; the sitewide JSON-LD graph and the viewport,
 * charset and icon tags are left alone.
 */
function stripOwnedTags(html, specs) {
  let out = html;
  for (const spec of specs) {
    const pattern =
      spec.kind === 'link'
        ? new RegExp(`\\s*<link[^>]*rel=["']${spec.rel}["'][^>]*>`, 'gi')
        : new RegExp(
            `\\s*<meta[^>]*${spec.key}=["']${spec.id.replace(/:/g, '\\:')}["'][^>]*>`,
            'gi',
          );
    out = out.replace(pattern, '');
  }
  return out;
}

/**
 * Rewrite a built index.html shell for one route.
 *
 * @param shell    contents of the Vite-built dist/index.html
 * @param meta     PageMeta-shaped object
 * @param site     { siteName, locale }
 * @param bodyCopy optional { h1, copy[], links[] } rendered as a temporary
 *                 progressive-enhancement fallback next to #root
 */
export function injectHead(shell, meta, site, bodyCopy = null) {
  const specs = tagSpecsFor(meta, site);
  let html = stripOwnedTags(shell, specs);

  if (/<html\b[^>]*\blang=["'][^"']*["']/i.test(html)) {
    html = html.replace(
      /(<html\b[^>]*\blang=)["'][^"']*["']/i,
      `$1"${escapeAttr(meta.language)}"`,
    );
  } else {
    html = html.replace(
      /<html\b([^>]*)>/i,
      `<html$1 lang="${escapeAttr(meta.language)}">`,
    );
  }

  html = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeText(meta.title)}</title>`,
  );

  const tags = specs.map(renderTag).filter(Boolean).join('\n    ');
  html = html.replace('</head>', `  ${tags}\n  </head>`);

  if (bodyCopy) {
    // Keep the fallback outside #root so React can mount normally. It is
    // honest, visible progressive enhancement: no-script clients and raw
    // crawlers receive the same primary copy and navigation as the app,
    // while main.tsx removes this sibling immediately before React mounts.
    const paragraphs = bodyCopy.copy
      .map((p) => `<p>${escapeText(p)}</p>`)
      .join('\n      ');
    const links = (bodyCopy.links ?? [])
      .map(
        ({ href, label }) =>
          `<a href="${escapeAttr(href)}">${escapeText(label)}</a>`,
      )
      .join('\n        ');
    const navigation = links
      ? `\n      <nav aria-label="Postr pages">\n        ${links}\n      </nav>`
      : '';
    html = html.replace(
      '<div id="root"></div>',
      `<div id="root"></div>\n    <main id="prerendered-content" style="min-height:100vh;background:#0a0a12;color:#c8cad0;font-family:system-ui,sans-serif;padding:48px;box-sizing:border-box">\n      <article style="max-width:760px;margin:0 auto">\n        <h1>${escapeText(bodyCopy.h1)}</h1>\n        ${paragraphs}${navigation}\n      </article>\n    </main>`,
    );
  }

  return html;
}
