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

Open `docs/text-audit/index.html` in a browser:

- Each route has a screenshot with numbered markers matching the table rows.
- Every text item is editable in place (the "your edit" column). Edits
  autosave to `localStorage` and survive reloads.
- **Copy audit for LLM** copies a markdown prompt of only the edited rows
  (`original → edit`, with locations) — paste it as the refactoring prompt.
- **Download JSON** saves the full table (originals + edits) locally.
- **Clear edits** wipes the stored edits.

Notes:

- The scrape serves the production build via `vite preview` against the
  local Supabase stack (anonymous session for `/p/new`). Start the stack
  first (`npm run db:start`) if editor/auth pages should render fully.
- Routes covered: the 13 static/prerendered pages + `/auth`, `/dashboard`,
  `/profile`, `/billing/success`, `/billing/cancel`,
  `/presentation-checker`, `/p/new`, `/404` (desktop 1440×900).
  Mobile widths, signed-in account states, and editor-with-real-poster
  states are future passes.
