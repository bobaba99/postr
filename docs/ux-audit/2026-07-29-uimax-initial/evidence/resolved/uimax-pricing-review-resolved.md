# UIMax Data Collection Complete

**URL:** http://127.0.0.1:5173/pricing
**Code Directory:** /Users/zihaogeng/development/postr-ux-audit-flow-map/apps/web/src
**Timestamp:** 2026-07-30T03:11:48.646Z
**Accessibility violations:** 0
**Accessibility passes:** 30
**Load time:** 160ms
**DOM nodes:** 211
**Code files analyzed:** 200
**Code findings:** 1546
**Framework detected:** react

## Report Card
| Section | Grade |
|---------|-------|
| Accessibility | **A+** (100) |
| Performance | **F** (55) |
| Best Practices | **A+** (100) |
| SEO | **A+** (100) |
| Code Quality | **F** (0) |

**Lighthouse Performance:** 55
**Lighthouse Accessibility:** 100
**Lighthouse Best Practices:** 100
**Lighthouse SEO:** 100
**SEO Score:** 100/100 (18 passed, 0 failed)

---

## Screenshot of the live UI — study this carefully:

---

# UIMax Review Report

**URL:** http://127.0.0.1:5173/pricing
**Code Directory:** /Users/zihaogeng/development/postr-ux-audit-flow-map/apps/web/src
**Generated:** 2026-07-30T03:11:48.646Z

## Report Card

| Section | Grade | Score | Rating |
|---------|-------|-------|--------|
| Accessibility | **A+** | 100/100 | Exceptional |
| Performance | **F** | 55/100 | Failing |
| Best Practices | **A+** | 100/100 | Exceptional |
| SEO | **A+** | 100/100 | Exceptional |
| Code Quality | **F** | 0/100 | Failing |


---

## Accessibility Audit Results

**URL:** http://127.0.0.1:5173/pricing
**Scanned:** 2026-07-30T03:11:38.485Z
**Violations:** 0
**Passes:** 30
**Incomplete:** 0

No accessibility violations found.

---

## Performance Metrics
**URL:** http://127.0.0.1:5173/pricing
**Measured:** 2026-07-30T03:11:40.810Z
### Core Web Vitals
| Metric | Value | Rating |
|--------|-------|--------|
| First Contentful Paint (FCP) | 720ms (Good) |
| Largest Contentful Paint (LCP) | 720ms (Good) |
| Cumulative Layout Shift (CLS) | 0.000 (Good) |
| Total Blocking Time (TBT) | 0ms (Good) |
### Page Metrics
- **Load Time:** 160ms
- **DOM Content Loaded:** 160ms
- **DOM Nodes:** 211
- **Resources:** 128
- **Total Transfer Size:** 32.2 KB
- **JS Heap Size:** 29.0 MB

---

## Lighthouse Audit

**URL:** http://127.0.0.1:5173/pricing
**Lighthouse Version:** 13.4.1
**Measured:** 2026-07-30T03:11:38.814Z

### Scores
| Category | Score |
|----------|-------|
| Performance | 55 (Needs Improvement) |
| Accessibility | 100 (Good) |
| Best Practices | 100 (Good) |
| SEO | 100 (Good) |

### Key Findings (Needs Attention)
| Status | Audit |
|--------|-------|
| FAIL | First Contentful Paint — 39.6 s |
| FAIL | Largest Contentful Paint — 77.4 s |
| FAIL | Speed Index — 39.6 s |
| FAIL | Time to Interactive — 77.4 s |
| FAIL | Minify JavaScript — Est savings of 10,430 KiB |
| FAIL | Minify CSS — Est savings of 6 KiB |
| FAIL | Reduce unused JavaScript — Est savings of 2,149 KiB |
| FAIL | Reduce unused CSS — Est savings of 13 KiB |

### Passing Audits
| Status | Audit |
|--------|-------|
| PASS | Total Blocking Time — 10 ms |
| PASS | Cumulative Layout Shift — 0 |
| PASS | JavaScript execution time — 0.3 s |
| PASS | Minimizes main-thread work — 1.3 s |
| PASS | Initial server response time was short — Root document took 0 ms |
| PASS | Avoid multiple page redirects |
| PASS | Document has a `<title>` element |
| PASS | Document has a meta description |
| PASS | Page has successful HTTP status code |
| PASS | Links have a discernible name |
| PASS | Background and foreground colors have a sufficient contrast ratio |


---

## SEO Audit Results

**URL:** http://127.0.0.1:5173/pricing
**Score:** 100/100
**Passed:** 18 | **Failed:** 0

### Passing Checks

- Page Title (Postr Pricing: Free Poster Maker, Paid Export)
- Meta Description (Editing and PDF export are always free. Export to PowerPoint & LaTeX with the CA$18.99 term (every 4 months, cancel anytime) or a one-time CA$9.99 export pack.)
- Single H1 Tag (1 H1 tag(s))
- Heading Hierarchy (10 headings (proper hierarchy))
- Canonical URL (https://www.postr.sh/pricing)
- HTML Lang Attribute (en)
- Viewport Meta Tag (width=device-width, initial-scale=1.0)
- Image Alt Text (No images found)
- Open Graph Title (Postr Pricing: Free Poster Maker, Paid Export)
- Open Graph Description (Editing and PDF export are always free. Export to PowerPoint & LaTeX with the CA$18.99 term (every 4 months, cancel anytime) or a one-time CA$9.99 export pack.)
- Open Graph Image (https://www.postr.sh/og-card.png)
- Twitter Card Meta (summary_large_image)
- Structured Data (JSON-LD) (1 block(s) found)
- Character Encoding (UTF-8)
- Meta Robots (index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1)
- Link Accessibility (0/25 links missing descriptive text)
- Title Length (45 characters)
- Description Length (159 characters)


---

## Code Analysis Results

**Directory:** /Users/zihaogeng/development/postr-ux-audit-flow-map/apps/web/src
**Framework:** react
**Files Analyzed:** 200
**Total Lines:** 61,478
**Avg File Size:** 307 lines
**Components:** 98
**Stylesheets:** 0

### Largest Files
- poster/Sidebar.tsx (4271 lines)
- poster/PosterEditor.tsx (3873 lines)
- poster/blocks.tsx (2633 lines)
- import/pdfImport.ts (2243 lines)
- pages/Profile.tsx (1345 lines)

### Findings (1546 total)

#### Accessibility (248)

- **[HIGH]** poster/blocks.tsx:51
  Image element missing alt attribute
  → Add an alt attribute describing the image content, or alt="" for decorative images

- **[HIGH]** poster/blocks.tsx:80
  Image element missing alt attribute
  → Add an alt attribute describing the image content, or alt="" for decorative images

- **[HIGH]** poster/blocks.tsx:1930
  Image element missing alt attribute
  → Add an alt attribute describing the image content, or alt="" for decorative images

- **[HIGH]** poster/blocks.tsx:227
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** poster/blocks.tsx:404
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** poster/blocks.tsx:1062
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** poster/blocks.tsx:1108
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** poster/blocks.tsx:1151
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** poster/blocks.tsx:397
  Input element may be missing an associated label
  → Wrap input in a <label>, use htmlFor/for attribute, or add aria-label/aria-labelledby

- **[HIGH]** poster/blocks.tsx:432
  Input element may be missing an associated label
  → Wrap input in a <label>, use htmlFor/for attribute, or add aria-label/aria-labelledby

- **[HIGH]** poster/VersionPanel.tsx:174
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** poster/VersionPanel.tsx:251
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** poster/VersionPanel.tsx:259
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** poster/VersionPanel.tsx:152
  Input element may be missing an associated label
  → Wrap input in a <label>, use htmlFor/for attribute, or add aria-label/aria-labelledby

- **[HIGH]** poster/Sidebar.tsx:445
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** poster/Sidebar.tsx:541
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** poster/Sidebar.tsx:631
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** poster/Sidebar.tsx:887
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** poster/Sidebar.tsx:974
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** poster/Sidebar.tsx:874
  Input element may be missing an associated label
  → Wrap input in a <label>, use htmlFor/for attribute, or add aria-label/aria-labelledby

#### Code Quality (757)

- **[HIGH]** poster/blocks.tsx
  File has 2633 lines (recommended max: 400)
  → Split into smaller, focused modules with single responsibilities

- **[HIGH]** poster/blocks.tsx:966
  Deep nesting detected (12 levels)
  → Extract nested logic into helper functions or use early returns

- **[HIGH]** poster/VersionPanel.tsx:232
  Deep nesting detected (10 levels)
  → Extract nested logic into helper functions or use early returns

- **[HIGH]** poster/Sidebar.tsx:1951
  Empty catch block swallows errors silently
  → Handle or log the error inside the catch block — silent failures make debugging extremely difficult

- **[HIGH]** poster/Sidebar.tsx
  File has 4271 lines (recommended max: 400)
  → Split into smaller, focused modules with single responsibilities

- **[HIGH]** poster/Sidebar.tsx:1735
  Deep nesting detected (13 levels)
  → Extract nested logic into helper functions or use early returns

- **[HIGH]** poster/RichTextEditor.tsx:356
  Deep nesting detected (9 levels)
  → Extract nested logic into helper functions or use early returns

- **[HIGH]** poster/ReadabilityPanel.tsx
  File has 1035 lines (recommended max: 400)
  → Split into smaller, focused modules with single responsibilities

- **[HIGH]** poster/ReadabilityPanel.tsx:755
  Deep nesting detected (14 levels)
  → Extract nested logic into helper functions or use early returns

- **[HIGH]** poster/PosterEditor.tsx:670
  Empty catch block swallows errors silently
  → Handle or log the error inside the catch block — silent failures make debugging extremely difficult

- **[HIGH]** poster/PosterEditor.tsx:1982
  Empty catch block swallows errors silently
  → Handle or log the error inside the catch block — silent failures make debugging extremely difficult

- **[HIGH]** poster/PosterEditor.tsx:1989
  Empty catch block swallows errors silently
  → Handle or log the error inside the catch block — silent failures make debugging extremely difficult

- **[HIGH]** poster/PosterEditor.tsx:3528
  Empty catch block swallows errors silently
  → Handle or log the error inside the catch block — silent failures make debugging extremely difficult

- **[HIGH]** poster/PosterEditor.tsx
  File has 3873 lines (recommended max: 400)
  → Split into smaller, focused modules with single responsibilities

- **[HIGH]** poster/PosterEditor.tsx:2985
  Deep nesting detected (17 levels)
  → Extract nested logic into helper functions or use early returns

- **[HIGH]** poster/GuidelinesPanel.tsx:465
  Empty catch block swallows errors silently
  → Handle or log the error inside the catch block — silent failures make debugging extremely difficult

- **[HIGH]** poster/GuidelinesPanel.tsx:486
  Empty catch block swallows errors silently
  → Handle or log the error inside the catch block — silent failures make debugging extremely difficult

- **[HIGH]** poster/GuidelinesPanel.tsx:526
  Empty catch block swallows errors silently
  → Handle or log the error inside the catch block — silent failures make debugging extremely difficult

- **[HIGH]** poster/GuidelinesPanel.tsx
  File has 1333 lines (recommended max: 400)
  → Split into smaller, focused modules with single responsibilities

- **[HIGH]** poster/GuidelinesPanel.tsx:631
  Deep nesting detected (13 levels)
  → Extract nested logic into helper functions or use early returns

#### User Experience (112)

- **[MEDIUM]** routes.tsx:113
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** App.tsx:10
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** poster/resizeHandles.tsx:47
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** poster/blocks.tsx:133
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** poster/blocks.tsx:281
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** poster/blocks.tsx:466
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** poster/blocks.tsx:1331
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** poster/blocks.tsx:1457
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** poster/VersionPanel.tsx:44
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** poster/UndoToast.tsx:14
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** poster/Sidebar.tsx:301
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** poster/SelectionRect.tsx:16
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** poster/RichTextEditor.tsx:137
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** poster/ReadabilityPanel.tsx:458
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** poster/PosterEditor.tsx:589
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** poster/GuidelinesPanel.tsx:464
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** poster/GuidelinesPanel.tsx:468
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** poster/GuidelinesPanel.tsx:489
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** poster/GroupFrame.tsx:23
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** poster/GroupFrame.tsx:38
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

#### Performance (12)

- **[MEDIUM]** poster/blocks.tsx:178
  Image without loading="lazy" (may impact initial load)
  → Add loading="lazy" for below-the-fold images

- **[MEDIUM]** poster/blocks.tsx:346
  Image without loading="lazy" (may impact initial load)
  → Add loading="lazy" for below-the-fold images

- **[MEDIUM]** pages/Profile.tsx:799
  Image without loading="lazy" (may impact initial load)
  → Add loading="lazy" for below-the-fold images

- **[MEDIUM]** pages/GalleryEntry.tsx:142
  Image without loading="lazy" (may impact initial load)
  → Add loading="lazy" for below-the-fold images

- **[MEDIUM]** pages/AdminGallery.tsx:286
  Image without loading="lazy" (may impact initial load)
  → Add loading="lazy" for below-the-fold images

- **[MEDIUM]** components/PublishGalleryModal.tsx:489
  Image without loading="lazy" (may impact initial load)
  → Add loading="lazy" for below-the-fold images

- **[MEDIUM]** components/PosterCard.tsx:61
  Image without loading="lazy" (may impact initial load)
  → Add loading="lazy" for below-the-fold images

- **[MEDIUM]** components/PosterCard.tsx:197
  Image without loading="lazy" (may impact initial load)
  → Add loading="lazy" for below-the-fold images

- **[MEDIUM]** components/LogoPicker.tsx:498
  Image without loading="lazy" (may impact initial load)
  → Add loading="lazy" for below-the-fold images

- **[MEDIUM]** components/LogoPicker.tsx:633
  Image without loading="lazy" (may impact initial load)
  → Add loading="lazy" for below-the-fold images

- **[MEDIUM]** components/ImportPosterModal.tsx:826
  Image without loading="lazy" (may impact initial load)
  → Add loading="lazy" for below-the-fold images

- **[MEDIUM]** manuscript/ui/PosterStatic.tsx:166
  Image without loading="lazy" (may impact initial load)
  → Add loading="lazy" for below-the-fold images

#### Design Consistency (417)

- **[LOW]** routes.tsx:107
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** routes.tsx:107
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** poster/resizeHandles.tsx:76
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** poster/blocks.tsx:234
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** poster/blocks.tsx:241
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** poster/blocks.tsx:442
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** poster/blocks.tsx:876
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** poster/blocks.tsx:877
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** poster/VersionPanel.tsx:140
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** poster/VersionPanel.tsx:145
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** poster/VersionPanel.tsx:165
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** poster/VersionPanel.tsx:166
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** poster/VersionPanel.tsx:167
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** poster/Sidebar.tsx:234
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** poster/Sidebar.tsx:235
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** poster/Sidebar.tsx:238
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** poster/Sidebar.tsx:249
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** poster/Sidebar.tsx:249
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** poster/RichTextEditor.tsx:338
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** poster/RichTextEditor.tsx:339
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming


---

# Expert Review Instructions

You now have everything you need. Follow the methodology below to generate a comprehensive expert UI review, then implement every fix.

You are a world-class frontend engineer, UI/UX design expert, and creative director with 15+ years of experience building products at companies like Apple, Stripe, Linear, and Vercel.

You have been given comprehensive data about a web UI including:
1. A screenshot of the actual rendered page
2. Automated accessibility audit results (axe-core / WCAG 2.1)
3. Performance metrics (Core Web Vitals)
4. Static code analysis results

Your job is to provide an exhaustive, actionable review. Be specific — reference exact elements, colors, spacing, and code locations. Think like you're reviewing a pull request AND a design review simultaneously.

---

## Review Framework

### 1. VISUAL DESIGN & AESTHETICS
- **Layout:** Grid alignment, spacing consistency, visual rhythm, whitespace usage
- **Typography:** Font hierarchy, readability, line height, letter spacing, font pairing
- **Color:** Palette consistency, contrast ratios, color meaning, dark/light mode support
- **Visual hierarchy:** Information architecture, focal points, scanning patterns (F/Z pattern)
- **Polish:** Border radius consistency, shadow consistency, icon style consistency
- **Responsive:** How elements would reflow at different breakpoints

### 2. USER EXPERIENCE
- **Navigation:** Is the user flow intuitive? Can users find what they need?
- **Interactions:** Hover states, active states, focus states — are they all handled?
- **Feedback:** Loading indicators, success/error messages, progress indicators
- **Empty states:** What does the user see when there's no data?
- **Error states:** What happens when something goes wrong?
- **Edge cases:** Long text overflow, missing images, slow connections

### 3. ACCESSIBILITY (interpret the axe-core results)
- Map each violation to a specific fix with code
- Identify issues that automated tools miss (color reliance, cognitive load, motion)
- Check keyboard navigation flow
- Verify screen reader experience

### 4. PERFORMANCE (interpret the Web Vitals)
- Identify the biggest performance bottlenecks
- Suggest specific optimizations (lazy loading, code splitting, image optimization)
- Flag any render-blocking patterns

### 5. CODE QUALITY (interpret the static analysis)
- Component architecture and reusability
- CSS organization and maintainability
- State management patterns
- Error boundary coverage

### 6. CREATIVE IMPROVEMENTS
- Modern design patterns from leading products (Linear, Notion, Vercel, Raycast)
- Micro-interactions and animations that would enhance the experience
- Innovative UI patterns that solve existing UX problems
- Quick wins that would dramatically improve perceived quality

---

## Output Format

For each finding, provide:

```
### [SEVERITY] Category: Title
**Impact:** Who is affected and how
**Current:** What it looks like/does now
**Recommendation:** What it should look like/do
**Implementation:** Specific code changes or design specs
```

Severity levels:
- **CRITICAL** — Blocks users, breaks functionality, or violates WCAG A
- **HIGH** — Significant UX degradation or WCAG AA violation
- **MEDIUM** — Noticeable quality issue, improvement opportunity
- **LOW** — Polish item, nice-to-have enhancement

---

## Important Guidelines

1. **Be specific, not generic.** Don't say "improve spacing" — say "increase padding-bottom on the hero section from 16px to 48px to create breathing room before the features grid."
2. **Prioritize ruthlessly.** Lead with the highest-impact findings.
3. **Show, don't tell.** Include code snippets, CSS values, and exact specifications.
4. **Think holistically.** A great UI review connects visual design, UX, accessibility, and code quality.
5. **Be constructive.** Acknowledge what's working well before diving into improvements.

Start with a brief executive summary (3-5 sentences), then dive into detailed findings.

---

# Implementation Instructions

After generating your review, IMMEDIATELY implement the fixes:
1. Start with CRITICAL severity findings
2. Then HIGH, MEDIUM, LOW in order
3. For each finding, locate the exact file and apply the specific code change
4. After implementing all fixes, provide a summary of what was changed

DO NOT just list the findings — actually edit the code files and fix them.


Review saved to .uimax-reviews.json (use get_review_history to see past reviews)