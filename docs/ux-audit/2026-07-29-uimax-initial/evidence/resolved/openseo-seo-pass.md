# OpenSEO site-wide SEO pass

Audit date: 2026-07-29 (America/Toronto)

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
- Keep the generated sitemap limited to the 10 indexable public pages.

The production build now writes 12 HTML documents: 10 indexable routes, `/auth`, and `404.html`. Local raw-HTML verification confirms an H1 and internal links on every generated route, plus complete canonical/share metadata where expected.

OpenSEO cannot re-crawl unpushed local files. A new production audit is required after deployment to confirm the 39 production warnings are cleared.
