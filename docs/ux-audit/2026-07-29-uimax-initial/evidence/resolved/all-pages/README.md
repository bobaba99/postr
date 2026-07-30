# Full UIMax all-page resolution pass

Audit date: 2026-07-29 (America/Toronto)

Target: local production build at `http://127.0.0.1:4174`

Viewport: 1440×900

Method: UIMax `review_ui` per route/state

## Result

- 25 distinct public, localized legal, auth, billing, error, guest, editor, share, admin, dashboard, and profile states reviewed.
- 0 runtime accessibility violations across the final reports.
- 0 route-level High or Medium SEO findings across the final reports.
- All seven primary public/product pages score 100/100 for SEO.
- Legal pages score 98/100 because UIMax treats their intentionally concise titles as Low severity.
- Auth scores 98/100; its only remaining flag is the intentional Low-severity `noindex`.
- Private, billing, and error states score 95/100. Their remaining findings are Low-severity `noindex` and concise private-page title/description warnings.

The full UIMax report also repeats the same repository-wide heuristic code scan for every route. Those static findings are not route observations; this summary reports the runtime accessibility and SEO sections of each page review.

## Reports

| Route or state | Axe violations | SEO | High/Medium |
| --- | ---: | ---: | ---: |
| [Public home](home.md) | 0 | 100 | 0 |
| [About](about.md) | 0 | 100 | 0 |
| [Why posters](why-posters.md) | 0 | 100 | 0 |
| [Pricing](pricing.md) | 0 | 100 | 0 |
| [Chart chooser](chart-chooser.md) | 0 | 100 | 0 |
| [Paper to poster](paper-to-poster.md) | 0 | 100 | 0 |
| [Paper to slides](paper-to-slides.md) | 0 | 100 | 0 |
| [Privacy](privacy.md) | 0 | 98 | 0 |
| [Cookies](cookies.md) | 0 | 98 | 0 |
| [Terms](terms.md) | 0 | 98 | 0 |
| [Privacy — French](privacy-fr.md) | 0 | 98 | 0 |
| [Cookies — French](cookies-fr.md) | 0 | 98 | 0 |
| [Terms — French](terms-fr.md) | 0 | 98 | 0 |
| [Authentication](auth.md) | 0 | 98 | 0 |
| [Authentication — term plan](auth-term.md) | 0 | 98 | 0 |
| [Authentication — export pack](auth-pack.md) | 0 | 98 | 0 |
| [Billing success](billing-success.md) | 0 | 95 | 0 |
| [Billing cancel](billing-cancel.md) | 0 | 95 | 0 |
| [Not found](not-found.md) | 0 | 95 | 0 |
| [Guest entry](guest-entry.md) | 0 | 95 | 0 |
| [Authenticated dashboard](dashboard.md) | 0 | 95 | 0 |
| [Profile](profile.md) | 0 | 95 | 0 |
| [New poster editor](editor-new.md) | 0 | 95 | 0 |
| [Share link — not found](share-not-found.md) | 0 | 100 | 0 |
| [Admin route — guest redirect](admin-guest.md) | 0 | 95 | 0 |
