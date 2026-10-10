# Owner follow-ups — read after the UX fixes

Started 2026-10-06. You asked for everything that is not blocking to be saved here
instead of interrupting you, to read as one report once the UX bugs are fixed. Each
item says where the detail lives. Nothing here blocks the launch.

## 1. Legal points for a lawyer (not blocking)

Detail: `docs/legal/quebec-law-25.md` (internal, not legal advice) and record 24
(`docs/fixes/24-legal-canada-law25.md`, section 10).

- **Page counting is on by default.** Vercel Web Analytics loads for every visitor
  whose browser does not send Global Privacy Control, and Vercel's documentation says
  it may record an approximate location (down to the city), device type, OS and
  browser with each page view. The privacy page says exactly this. Whether Quebec's
  Law 25 (s. 8.1, a function that locates, off by default; s. 9.1, privacy by
  default) requires counting to be off until the visitor agrees is a question for
  counsel. If yes, the change is a consent choice before analytics loads.
- **Quebec consumer statements in the Terms.** Terms §5.5, §10, §11 and §13's
  "continued use means you accept" are each preceded by a bold statement that they do
  not apply to Quebec consumers to the extent the Consumer Protection Act prohibits
  them (s. 19.1). Counsel to confirm the wording and the list (§4 "sole discretion"
  suspension and §9 "change at any time" may need it too) and Terms §12's citation of
  the right to sue at home.
- **Privacy §15's transfer sentence** (Canada's EU/UK adequacy for organizations
  under PIPEDA; US adequacy only for Data Privacy Framework companies) and whether
  Vercel's approximate location counts as "locating" under s. 8.1.

- **The legal pages still describe hidden features (record 29, not blocking).** The
  privacy policy says what import, Copy a design, Scan image and the Staples print
  helper send "if you use" them. All four are hidden since 2026-10-07
  (`config/features.ts`), so nothing there is untrue, only about features a visitor
  cannot reach. The Terms §5.2 (EN and FR) also gives "reading the PDFs and images you
  import" as an example of what the licence covers (record 29's review round 1).
  Counsel or you: leave it while they may return, or trim it.

## 2. Things only you can do

- **Stripe Dashboard text.** Product names and descriptions shown on Stripe Checkout
  and on receipts come from your Stripe Dashboard, not the code. Check none of them
  mentions LaTeX (hidden since fix 25) and that prices read as before tax.
- **Law 25 paperwork** (drafted for you in `docs/legal/quebec-law-25.md`):
  - who holds the Privacy Officer role inside Resila. By default it is whoever has
    the highest authority in the company unless delegated in writing; the published
    pages name only the role, never a person;
  - read and sign off the impact assessment for data stored outside Quebec (filled
    from the code);
  - keep the confidentiality-incident register (template in the file) and notify the
    CAI and the people affected if an incident could seriously harm someone;
  - commitments the pages now make that are not code: page counting is used only for
    page totals, never to locate a person; an EU or UK user who asks is told which
    adequacy decision or safeguard covers a provider.
- **Supabase redirect for French sign-ups.** In Supabase › Authentication › URL
  Configuration, the Redirect URLs must allow `https://www.postr.sh/auth/fr` (a
  wildcard such as `https://www.postr.sh/**` covers it). If not, a French sign-up's
  confirmation link or Google sign-in lands on the English site instead (it still
  works, in English). Not checked from here.
- **One French test purchase in Stripe's sandbox.** A purchase started on a French
  page opens Stripe Checkout with locale `fr-CA`; whether Managed Payments shows it in
  French was not tried (no sandbox run from here).
- **After each deploy that touches analytics:** from `apps/web`,
  `node scripts/analytics-privacy-check.mjs --live https://www.postr.sh` must exit 0
  (it did on 2026-10-06: with GPC on, 0 analytics scripts and 0 page views on 4
  pages in Chromium and Firefox; with it off, the page view carries only the origin;
  0 cookies and 0 browser storage).

## 3. Decisions I made for you (overrule any of them)

Under your rule that only unclear or blocking legal issues come back to you:

- **Legal pages:** the person in charge is published as "Privacy Officer, Resila
  Technologies Inc." (FR « Responsable de la protection des renseignements
  personnels »), reached at support@resila.ai. `vercel.json` now sends
  `Referrer-Policy: strict-origin` site-wide so analytics never sees a page path.
- **Refund button:** a refused refund now ends "This answer was given automatically.
  To have a person review it, email support@resila.ai." (Law 25 s. 12.1, because the
  privacy page names the button as an automated decision).
- **Copy choices from the claims audit:** kept the landing headline and the og image,
  kept the footer line, the landing "Editable exports" card now says exports are
  paid, kept the guidelines' "suggestions" labels, kept "Parse with AI" and the image
  scan disclosure.
- **Item 19 (controls one size at every zoom):** 24 px grab areas with smaller visible
  marks; fewer handles on blocks that are small on screen; the rotate button moves
  into the handle row when there is no room below; when the handle row would be wider
  than the block on screen, it shows only the move button (being built on 2026-10-06;
  Delete stays available from the keyboard), because otherwise, zoomed far out, a click
  meant for a neighbouring block could delete the selected one.
- **French public pages (fix 26):** each French page sits at its English address plus
  `/fr` (`/fr` for the landing), with a « Français » / "English" link on every public
  page and no automatic redirect by browser language; Stripe Checkout opens in
  `fr-CA` from a French page; the editor, the feedback form and emails stay English
  for now. Below about 389 px the English landing's two buttons keep main's layout
  (side by side, each label on two lines); stacking them would be a design change.
- **Item 12 (undo):** built to your answers (one history, each word a step, A+/A− and
  alignment buttons removed, table typing folded in). Its open questions are in
  section 4 below.

- **Record 29 (the minimal editor), your decisions D3 and D4 as built:** a grey
  prompt goes while the caret is in its block (as PowerPoint's "Click to add text"),
  so it never sits beside the caret; a caption's "Show caption" brings it back on top
  (the stored left, right or bottom is kept until you untick it); the sample table
  keeps its header row (Measure, M (SD), 𝑝) and shows "Type or paste" in its first
  body cell (a longer prompt made the table run into the heading below it); the
  tour's export step says "Save as PDF or export an editable PowerPoint file (paid)."
  The landing page now names "the BibTeX reference formatting" and no longer "the
  conference size lookups"; the About page lost its import and "Borrow a look you
  like" cards and the custom-palette, guidelines and citation-style sentences (each
  comes back with its switch).

## 4. Later list items that will want your opinion

Questions the UX fixes raised. Each is built one way now (said first); answer only
where you want the other way.

- **Undo and Redo pressed from the keyboard** (item 12, record 12 §10): Tab to the
  Undo button and press Enter or Space: the focus stays on the button, so a second
  press undoes again instead of typing into the poster. A mouse click and ⌘Z put the
  caret back in the text. A redo selects the redone words, so the next key replaces
  them.
- **Ctrl+Y on a Mac** (item 12): it is redo, as on Windows. In a Mac text box Ctrl+K
  then Ctrl+Y normally cuts and pastes back a line ("yank"); in Postr's text blocks
  Ctrl+Y now redoes instead. ⌘⇧Z redoes either way. Keep Ctrl+Y as redo on a Mac?
- **The plot checker on a seaborn grid smaller than the print size** (13b, record 13b
  §10): the script it hands back sets the grid to the print size, so text the smaller
  grid printed larger now prints at the minimum (15.7 → 14 pt and 18 → 14 pt on the
  two test scripts; both pass before and after). The other way, resizing only a grid
  larger than the print size, is a branch the checker could not read back.
- **A legend wider than the figure** (13b): at 4 × 3 in with two panels, a 14 pt
  legend 2.9 in wide covers the plots; moving such a legend below them is not built.
- **Postr's charts grow their block when the text cannot fit at the minimums** (13c):
  in a small block (6 × 4.5 to 8 × 6 in) with a long legend or long labels, the chart
  grows taller instead of printing text below the minimums: 96 of 757 tested
  sizes, by 0.9 in typically and 5.35 in at most. A grown chart can cover the block
  under it (Issues counts it). The other way is to keep the block and shrink the text.
- **Two devices or two tabs on one poster** (record 27 §10): last save wins. If one
  device's saves failed and it comes back online, its retry writes over newer work
  saved on the other, with no warning (before the fix, the offline edit was lost
  instead). A warning or a comparison would be a new feature.
- **Auto-Arrange may leave a column empty** (record 28 §10): six figures on a 48 ×
  24 in sheet fit best in one narrow column, so the other is empty (the prototype you
  approved does the same). On the untouched 3-column template the figure gets the
  wide middle column (23.9 in), because the sample text is short and only the
  figure can grow.
- **An empty figure's "Figure N." and an empty heading's number** (record 31 §10): an
  empty figure prints "Figure 4." over blank space in the PDF, while the PowerPoint
  file leaves an empty figure out (so later figure numbers there skip one); an empty
  heading prints its number "1." in both. These are numbers, not hints: print them,
  or leave them out?
- From record 29: the closed poster's "Download a copy" still saves a `.postr` file,
  which the app cannot import while import is hidden; keep it as the way out, or
  offer the PDF instead.
- From record 29: a new poster's Issues tab now shows 8 where it showed 4, because
  each of the template's four empty text blocks adds "Empty block: type in it or
  delete it." (a suggestion, as bounded-designs §3.12 asks). If that number on a
  poster just made is unwelcome, the tab could count warnings and errors only.

Detail: `docs/stress-test/PLAN.md` (Later list).

- Item 19 leftovers: group handles hidden under the group frame; the crop bar over the
  rotate button; table edge strips shown only while selected; the group frame drawn
  95.6 units below its blocks (stored geometry); the text toolbar left behind after a
  pinch-zoom; the zoom bar's own buttons under 24 px; a 44 px size for touch and pen.
- No Terms line on the other ways to start: the guest "Start creating" button, the
  landing's way into the editor, the editor's "Create account" and Profile's guest
  conversion (only `/auth` shows one).
- Still English on French pages: the feedback form, the editor, and the emails
  Supabase and Stripe send.
- Found by the French pages' review, on main already: when an e-mail sign-up gets no
  session back (a pending confirmation), `/auth` may skip "Check your inbox" and try a
  checkout with no session (measured against a faked reply; the real reply is
  unverified). Queued.
- Queued from the claims audit as UX bugs (they will be fixed, listed for awareness;
  the paid PowerPoint export's missing charts were fixed by record 31): no screen to set a new
  password (HIGH); a replace-import re-arranges the poster; billing refund edge cases
  (renewal after re-export, pooled packs); the EU withdrawal waiver not asked on every
  path; retention clean-ups; a fuller "Download my data"; file properties naming Postr.
