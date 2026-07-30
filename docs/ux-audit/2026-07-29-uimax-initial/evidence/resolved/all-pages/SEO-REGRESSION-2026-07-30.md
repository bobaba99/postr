# UIMax all-page SEO regression

Audit date: 2026-07-30 (America/Toronto)

Target: local production build at `http://127.0.0.1:4174`

Method: UIMax MCP `seo_audit` across the same 25 public, localized, auth, billing, error, guest, editor, share, admin, dashboard, and profile routes or states used by the full resolution pass.

## Result

- 25/25 route and state checks completed.
- 13/13 indexable public routes scored 100/100 with all 18 UIMax SEO checks passing.
- 12/12 private, auth, billing, error, editor, share, or redirect states scored 98/100.
- 0 High or Medium findings remain.
- The only remaining finding is the intentional Low-severity `noindex,nofollow` signal on the 12 non-public states.
- The shared-poster regression initially exposed a missing self-canonical (High) and fallback social image (Medium). After the fix, that state scored 98/100 with only intentional `noindex`.

## Route results

| Route or state | UIMax SEO | High/Medium | Remaining |
| --- | ---: | ---: | --- |
| `/` | 100 | 0 | None |
| `/about` | 100 | 0 | None |
| `/why-posters` | 100 | 0 | None |
| `/pricing` | 100 | 0 | None |
| `/chart-chooser` | 100 | 0 | None |
| `/paper-to-poster` | 100 | 0 | None |
| `/paper-to-slides` | 100 | 0 | None |
| `/privacy` | 100 | 0 | None |
| `/cookies` | 100 | 0 | None |
| `/terms` | 100 | 0 | None |
| `/privacy/fr` | 100 | 0 | None |
| `/cookies/fr` | 100 | 0 | None |
| `/terms/fr` | 100 | 0 | None |
| `/auth` | 98 | 0 | Intentional Low `noindex` |
| `/auth?plan=term` | 98 | 0 | Intentional Low `noindex` |
| `/auth?plan=pack` | 98 | 0 | Intentional Low `noindex` |
| `/billing/success` | 98 | 0 | Intentional Low `noindex` |
| `/billing/cancel` | 98 | 0 | Intentional Low `noindex` |
| unknown route / 404 | 98 | 0 | Intentional Low `noindex` |
| `/auth?guest=1` | 98 | 0 | Intentional Low `noindex` |
| `/dashboard` guest/session state | 98 | 0 | Intentional Low `noindex` |
| `/profile` guest/session state | 98 | 0 | Intentional Low `noindex` |
| `/p/new` | 98 | 0 | Intentional Low `noindex` |
| `/s/uimax-missing-poster` | 98 | 0 | Intentional Low `noindex` |
| `/admin/gallery` guest redirect | 98 | 0 | Intentional Low `noindex` |

## Local crawler contract

- All fixed-route titles are 30–60 characters.
- All fixed-route descriptions are 120–160 characters.
- Every public prerender exposes one H1, at least 150 crawler-visible words, and links to every public route.
- French legal pages expose a self-canonical, `lang="fr-CA"`, and `og:locale="fr_CA"`.
- Shared posters expose a self-canonical and the real Postr social card while retaining `noindex,nofollow`.
