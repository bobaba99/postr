# OpenSEO site-wide SEO pass

Audit date: 2026-07-30 (America/Toronto)

Production target: `https://www.postr.sh/`

OpenSEO audit: [`58497995-0948-43cd-add6-f81ff34919ae`](https://app.openseo.so/p/74046c26-82e1-455e-bc51-d87e7b6abf93/audit?auditId=58497995-0948-43cd-add6-f81ff34919ae)

## Production baseline

OpenSEO completed a 10-page crawl with 18/18 Lighthouse checks. Every indexable page returned its correct title and description, but the raw document exposed no readable body content or links.

| Finding | Count |
| --- | ---: |
| Missing H1 | 10 |
| No outgoing links | 10 |
| Thin content (`wordCount: 0`) | 10 |
| Orphan page | 9 |

Affected pages: `/`, `/about`, `/chart-chooser`, `/cookies`, `/paper-to-poster`, `/paper-to-slides`, `/pricing`, `/privacy`, `/terms`, and `/why-posters`.

## Root cause

The build prerender placed each route's heading and summary inside `<noscript>`. OpenSEO reads the raw HTML but does not treat that fallback as the page's normal document content, so every JavaScript route appeared empty and disconnected.

## Resolution

- Emit honest, visible progressive-enhancement content beside the empty React root.
- Include the route H1, primary summary, and internal navigation in raw HTML.
- Remove the fallback immediately before React mounts.
- Generate dedicated raw HTML for `/auth`.
- Add self-canonicals and the existing social card to app states while retaining `noindex,nofollow`.
- Add route-specific metadata to both billing return pages.
- Keep every public fallback above OpenSEO's 150-word thin-content threshold.
- Give all fixed routes 30–60 character titles and 120–160 character descriptions.
- Prerender the three French legal routes with self-canonicals, `fr-CA` language, and `fr_CA` Open Graph locale.
- Give shared posters a self-canonical and the real Postr social card while retaining `noindex,nofollow`.
- Keep the generated sitemap limited to the 13 indexable public pages.

The production build now writes 15 HTML documents: 13 indexable routes, `/auth`, and `404.html`. Local raw-HTML verification confirms one H1, at least 150 crawler-visible words, and links to every public route on each generated public page. The sitemap contains exactly the 13 indexable URLs.

A fresh UIMax MCP SEO regression covered 25 routes and states. All 13 indexable routes scored 100/100; all private/error states scored 98/100 with intentional Low-severity `noindex` as their only finding. See [the all-page SEO regression](all-pages/SEO-REGRESSION-2026-07-30.md).

OpenSEO cannot re-crawl unpushed local files. A new production audit is required after deployment to confirm the 39 production warnings are cleared.
