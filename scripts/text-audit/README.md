# Text-audit tool

Scrapes every user-facing string on every page of the app and renders an
editable audit page: numbered screenshots side-by-side with the text table.

## Run

```bash
npm run build --workspace=apps/web
npx tsx scripts/text-audit/scrape.mts
```

Output: `docs/text-audit/index.html` + `docs/text-audit/shots/*.png`
(gitignored — regenerate anytime; don't commit).

Open `docs/text-audit/index.html` in a browser (**Chrome or Edge** for
auto-save to disk — see below):

- Each route has a screenshot with numbered markers matching the table rows.
- Every text item is editable in place (the "your edit" column). Edits
  mirror to `localStorage` and survive reloads.

### Recommended: audit one page at a time, auto-saved to disk

So an interruption or a `localStorage` wipe never costs more than the page
you're on:

1. Click **Choose audit folder…** once and pick a folder (e.g.
   `~/postr-audit`). This uses the browser's File System Access API
   (Chrome/Edge).
2. Edit a page. Each page's edits are written **live to its own file** in
   that folder — `home.json`, `pricing.json`, `billing-success.json`, … The
   per-page status shows `saved to <file> ✓`.
3. Finish a page, move to the next. Every finished page is an isolated file
   on disk; a bad write to one can't corrupt the others.
4. Reopen the audit later, click **Choose audit folder…** and pick the same
   folder — your edits reload from those files and you resume where you left
   off.
5. **Copy this page for LLM** (per page) copies a paste-ready refactor prompt
   for just that page — do a page, copy it, hand it off, repeat.

### Whole-audit controls (and non-Chromium fallback)

- **Copy all for LLM** copies a markdown prompt of every edited row
  (`original → edit`, with locations) across all pages.
- **Download JSON** saves the full table (originals + edits) as one file.
  This is the fallback on **Firefox/Safari**, which don't support the File
  System Access API — the folder button is disabled there and the header
  says so.
- **Clear edits** wipes the stored edits (and, if a folder is chosen, the
  per-page files in it — you're warned first).

Notes:

- The scrape serves the production build via `vite preview` against the
  local Supabase stack (anonymous session for `/p/new`). Start the stack
  first (`npm run db:start`) if editor/auth pages should render fully.
- Routes covered: the 13 static/prerendered pages + `/auth`, `/dashboard`,
  `/profile`, `/billing/success`, `/billing/cancel`,
  `/presentation-checker`, `/p/new`, `/404` (desktop 1440×900).
  Mobile widths, signed-in account states, and editor-with-real-poster
  states are future passes.
