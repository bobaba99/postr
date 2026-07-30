# Full UIMax all-page reports

Run date: 2026-07-30 (America/Toronto)

Target: local production build at `http://127.0.0.1:4174`

Source commit: `d37fc5fd30ae`

Method: UIMax `export_report` for every route/state in the 25-page audit inventory.

## Route-level result

- 25/25 standalone reports exported successfully.
- 0 runtime accessibility violations.
- 0 Critical, High, or Medium SEO findings.
- 13 indexable routes score 100/100 for SEO.
- 12 private or error states score 98/100 for SEO.
- Their only SEO finding is the intentional Low-severity `noindex,nofollow`.

## Performance range

| Metric | Range |
| --- | ---: |
| Performance grade | 82–93 |
| Best Practices grade | 96 |
| Local load time | 71–106 ms |
| Largest Contentful Paint | 544–936 ms |
| Cumulative Layout Shift | 0–0.001 |
| Total Blocking Time | 0 ms |

These measurements describe a local production preview, not deployed network performance.

## Repository-wide code scan

Every HTML report repeats the same static repository scan:

- 1,577 heuristic findings across 200 files.
- 340 Critical or High findings.
- 769 Code Quality, 427 Design Consistency, 254 Accessibility, 115 User Experience, and 12 Performance findings.

These are not 25 independent sets of page defects. They are repository-wide heuristics repeated in each route export and require separate source-level triage.

## Reports

| Route or state | Accessibility | Performance | Best Practices | SEO | Remaining SEO |
| --- | ---: | ---: | ---: | ---: | --- |
| [Home](home.html) | 100 | 91 | 96 | 100 | None |
| [About](about.html) | 100 | 92 | 96 | 100 | None |
| [Why posters](why-posters.html) | 100 | 93 | 96 | 100 | None |
| [Pricing](pricing.html) | 100 | 91 | 96 | 100 | None |
| [Chart chooser](chart-chooser.html) | 100 | 87 | 96 | 100 | None |
| [Paper to poster](paper-to-poster.html) | 100 | 87 | 96 | 100 | None |
| [Paper to slides](paper-to-slides.html) | 100 | 82 | 96 | 100 | None |
| [Privacy](privacy.html) | 100 | 91 | 96 | 100 | None |
| [Cookies](cookies.html) | 100 | 91 | 96 | 100 | None |
| [Terms](terms.html) | 100 | 92 | 96 | 100 | None |
| [Privacy — French](privacy-fr.html) | 100 | 91 | 96 | 100 | None |
| [Cookies — French](cookies-fr.html) | 100 | 92 | 96 | 100 | None |
| [Terms — French](terms-fr.html) | 100 | 92 | 96 | 100 | None |
| [Authentication](auth.html) | 100 | 91 | 96 | 98 | Intentional Low `noindex` |
| [Authentication — term plan](auth-term.html) | 100 | 91 | 96 | 98 | Intentional Low `noindex` |
| [Authentication — export pack](auth-pack.html) | 100 | 91 | 96 | 98 | Intentional Low `noindex` |
| [Billing success](billing-success.html) | 100 | 91 | 96 | 98 | Intentional Low `noindex` |
| [Billing cancel](billing-cancel.html) | 100 | 91 | 96 | 98 | Intentional Low `noindex` |
| [Not found](not-found.html) | 100 | 92 | 96 | 98 | Intentional Low `noindex` |
| [Guest entry](guest-entry.html) | 100 | 91 | 96 | 98 | Intentional Low `noindex` |
| [Dashboard](dashboard.html) | 100 | 91 | 96 | 98 | Intentional Low `noindex` |
| [Profile](profile.html) | 100 | 91 | 96 | 98 | Intentional Low `noindex` |
| [New poster editor](editor-new.html) | 100 | 83 | 96 | 98 | Intentional Low `noindex` |
| [Share link — not found](share-not-found.html) | 100 | 84 | 96 | 98 | Intentional Low `noindex` |
| [Admin route — guest](admin-guest.html) | 100 | 91 | 96 | 98 | Intentional Low `noindex` |
