# UI Audit High/Medium Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Resolve every High and Medium issue in the initial UIMax audit with tested navigation, accessibility, responsive, and content-hierarchy changes.

**Architecture:** A small router-level component owns document scrolling. Shared public-shell components own breakpoint, contrast, and heading behavior. Pricing and auth encode the approved content hierarchy in renderable data so message-count and word-count constraints can be tested directly.

**Tech Stack:** React 19, React Router 8, TypeScript, Tailwind CSS, Vitest, Testing Library, UIMax MCP, in-app browser

---

### Task 1: Route scroll policy

**Files:**
- Create: `apps/web/src/components/RouteScrollManager.tsx`
- Create: `apps/web/src/components/__tests__/RouteScrollManager.test.tsx`
- Modify: `apps/web/src/App.tsx`

**Step 1: Write the failing tests**

Cover:

- `PUSH` navigation calls `window.scrollTo({ top: 0, left: 0, behavior: 'auto' })`.
- `REPLACE` navigation also starts at the top.
- `POP` navigation does not call `scrollTo`.
- Hash navigation is not overridden.

**Step 2: Run the focused test and verify RED**

Run:

```bash
npm test --workspace=apps/web -- src/components/__tests__/RouteScrollManager.test.tsx
```

Expected: FAIL because `RouteScrollManager` does not exist.

**Step 3: Implement the minimal policy**

Use `useLocation()` and `useNavigationType()`. Run an effect on `location.key`; return early for `POP` or a non-empty hash, otherwise scroll to the top.

Mount the component directly inside `BrowserRouter`, before `AppRoutes`.

**Step 4: Run the focused test and verify GREEN**

Run the same command. Expected: PASS.

### Task 2: Shared shell semantics, contrast, and responsive header

**Files:**
- Modify: `apps/web/src/components/PublicHeader.tsx`
- Modify: `apps/web/src/components/PublicFooter.tsx`
- Modify: `apps/web/src/components/__tests__/toolDiscoverability.test.tsx`

**Step 1: Write failing regressions**

Assert:

- Flat public links use `xl:inline`.
- The overflow menu uses `xl:hidden`.
- Supporting navigation text uses `#8b8f99` or lighter.
- Footer column headings are level two.

**Step 2: Run the focused test and verify RED**

```bash
npm test --workspace=apps/web -- src/components/__tests__/toolDiscoverability.test.tsx
```

Expected: FAIL on current `sm:` breakpoint, `#6b7280`, and footer `h3`.

**Step 3: Implement the shared-shell changes**

- Move flat-nav visibility from `sm` to `xl`.
- Keep the overflow menu visible below `xl`.
- Move signed-in desktop-only controls to `xl`.
- Replace failing shared muted text with `#8b8f99`.
- Render footer column titles as visually identical `h2` elements.

**Step 4: Run the focused test and verify GREEN**

Run the same command. Expected: PASS.

### Task 3: Pricing hierarchy and tablet layout

**Files:**
- Modify: `apps/web/src/components/PricingSection.tsx`
- Create: `apps/web/src/components/__tests__/PricingSection.test.tsx`
- Modify: `apps/web/src/pages/Pricing.tsx`

**Step 1: Write failing regressions**

Assert:

- Every tier has exactly four supporting messages.
- Every supporting message contains at most 15 words.
- Every tier exposes exactly two core feature messages.
- Mobile renders a **What’s included** disclosure.
- Desktop feature content remains available without the disclosure.
- The grid uses two columns at `md` and three at `lg`.
- The repeated chooser paragraph is absent.

**Step 2: Run the focused test and verify RED**

```bash
npm test --workspace=apps/web -- src/components/__tests__/PricingSection.test.tsx
```

Expected: FAIL on the current five-feature tiers, long descriptions, and `md:grid-cols-3`.

**Step 3: Implement the approved hierarchy**

- Export immutable tier content for direct tests.
- Keep price, cadence, use case, condition, and CTA visible.
- Put two core features in a native mobile `details` element.
- Show the same two features directly from `sm` upward.
- Use `md:grid-cols-2 lg:grid-cols-3`.
- Allow the price row to wrap.
- Start the featured-card offset at `lg`.
- Remove duplicate explanatory paragraphs.
- Compact the waitlist into a tertiary callout.

**Step 4: Run the focused test and verify GREEN**

Run the same command. Expected: PASS.

### Task 4: Auth hierarchy, recovery, and contrast

**Files:**
- Modify: `apps/web/src/pages/Auth.tsx`
- Create: `apps/web/src/pages/__tests__/Auth.audit.test.tsx`

**Step 1: Write failing regressions**

Render `/auth?plan=term` with mocked Supabase and assert:

- **Create your account** is the only `h1`.
- **Change plan** links to `/pricing`.
- Email preferences are in a closed native disclosure.
- Both optional checkboxes remain unchecked.
- Each preference description has at most 15 words.
- The full Product/Learn/Account sitemap is absent.
- Privacy, Terms, and Cookies remain linked.
- No white-text CTA uses the failing `#7c6aed` background.
- Auth supporting copy no longer uses `#6b7280` or `#555`.

**Step 2: Run the focused test and verify RED**

```bash
npm test --workspace=apps/web -- src/pages/__tests__/Auth.audit.test.tsx
```

Expected: FAIL on the missing `h1`, missing recovery link, expanded preference fieldset, and failing colors.

**Step 3: Implement the approved auth hierarchy**

- Change the task heading to `h1`.
- Add **Change plan** beside the selected-plan summary.
- Use `#5641b8` for white-text filled actions.
- Use `#8b8f99` for supporting copy and dividers.
- Replace the preference fieldset with a native disclosure while keeping labels and unchecked state.
- Replace `PublicFooter` with a compact legal footer on auth.

**Step 4: Run the focused test and verify GREEN**

Run the same command. Expected: PASS.

### Task 5: Remaining audited contrast and heading order

**Files:**
- Modify: `apps/web/src/routes.tsx`
- Modify: `apps/web/src/pages/About.tsx`
- Modify: `apps/web/src/pages/PaperToPoster.tsx`
- Modify: `apps/web/src/pages/PaperToSlides.tsx`
- Modify: `apps/web/src/pages/ChartChooser.tsx`
- Modify: `apps/web/src/pages/Profile.tsx`
- Create: `apps/web/src/pages/__tests__/PublicPageOutline.test.tsx`

**Step 1: Write failing regressions**

Assert:

- About's timeline has an `h2` before milestone `h3` elements.
- Audited static route supporting text does not use the failing `#6b7280`.
- Audited white-text filled actions use the darker violet surface.
- The lazy route fallback uses accessible supporting text.

**Step 2: Run the focused test and verify RED**

```bash
npm test --workspace=apps/web -- src/pages/__tests__/PublicPageOutline.test.tsx
```

Expected: FAIL on the missing timeline `h2` and remaining failing color pairs.

**Step 3: Implement minimal route-specific corrections**

Add a timeline heading and replace only the audited failing text/background pairs. Preserve unrelated editor colors and layout.

**Step 4: Run the focused test and verify GREEN**

Run the same command. Expected: PASS.

### Task 6: Automated verification

**Files:**
- Modify only if a verified regression requires it.

**Step 1: Run all focused audit tests**

```bash
npm test --workspace=apps/web -- \
  src/components/__tests__/RouteScrollManager.test.tsx \
  src/components/__tests__/toolDiscoverability.test.tsx \
  src/components/__tests__/PricingSection.test.tsx \
  src/pages/__tests__/Auth.audit.test.tsx \
  src/pages/__tests__/PublicPageOutline.test.tsx
```

Expected: all pass.

**Step 2: Run the complete web test suite**

```bash
npm test --workspace=apps/web
```

Expected: all tests pass.

**Step 3: Build the production web app**

```bash
npm run build --workspace=apps/web
```

Expected: TypeScript, Vite build, prerender, and sitemap generation all succeed.

### Task 7: Browser and UIMax regression pass

**Files:**
- Add new evidence under `docs/ux-audit/2026-07-29-uimax-initial/evidence/resolved/`
- Modify: `docs/ux-audit/2026-07-29-uimax-initial/REPORT.md`

**Step 1: Reproduce the original scroll path**

At 375×900, scroll pricing, click **Get the term**, and verify auth opens at `scrollY = 0`. Use Back and verify pricing position restores.

**Step 2: Verify responsive layouts**

Capture pricing at 375, 768, 1024, and 1440. Confirm:

- No wrapped flat navigation below 1280.
- Two pricing columns at 768.
- Three pricing columns at 1024 and 1440.
- No card-internal horizontal overflow.

**Step 3: Rerun UIMax**

Run responsive screenshots, accessibility, console/errors, and crawl for the original routes. Confirm the reported High and Medium issues no longer reproduce.

**Step 4: Update the audit report**

Mark each resolved finding with the exact automated and visual evidence. Preserve development-only performance caveats and pending authenticated/destructive flows.

