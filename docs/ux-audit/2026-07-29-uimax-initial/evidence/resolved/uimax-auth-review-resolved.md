# UIMax Data Collection Complete

**URL:** http://127.0.0.1:5173/auth?plan=term
**Code Directory:** /Users/zihaogeng/development/postr-ux-audit-flow-map/apps/web/src
**Timestamp:** 2026-07-30T03:12:09.212Z
**Accessibility violations:** 0
**Accessibility passes:** 32
**Load time:** 133ms
**DOM nodes:** 83
**Code files analyzed:** 200
**Code findings:** 1546
**Framework detected:** react

## Report Card
| Section | Grade |
|---------|-------|
| Accessibility | **A+** (100) |
| Performance | **F** (55) |
| Best Practices | **A+** (100) |
| SEO | **D** (84) |
| Code Quality | **F** (0) |

**Lighthouse Performance:** 55
**Lighthouse Accessibility:** 100
**Lighthouse Best Practices:** 100
**Lighthouse SEO:** 63
**SEO Score:** 84/100 (13 passed, 5 failed)

---

## Screenshot of the live UI — study this carefully:

---

# UIMax Review Report

**URL:** http://127.0.0.1:5173/auth?plan=term
**Code Directory:** /Users/zihaogeng/development/postr-ux-audit-flow-map/apps/web/src
**Generated:** 2026-07-30T03:12:09.212Z

## Report Card

| Section | Grade | Score | Rating |
|---------|-------|-------|--------|
| Accessibility | **A+** | 100/100 | Exceptional |
| Performance | **F** | 55/100 | Failing |
| Best Practices | **A+** | 100/100 | Exceptional |
| SEO | **D** | 84/100 | Weak |
| Code Quality | **F** | 0/100 | Failing |


---

## Accessibility Audit Results

**URL:** http://127.0.0.1:5173/auth?plan=term
**Scanned:** 2026-07-30T03:11:59.215Z
**Violations:** 0
**Passes:** 32
**Incomplete:** 0

No accessibility violations found.

---

## Performance Metrics
**URL:** http://127.0.0.1:5173/auth?plan=term
**Measured:** 2026-07-30T03:12:01.576Z
### Core Web Vitals
| Metric | Value | Rating |
|--------|-------|--------|
| First Contentful Paint (FCP) | 660ms (Good) |
| Largest Contentful Paint (LCP) | 660ms (Good) |
| Cumulative Layout Shift (CLS) | 0.000 (Good) |
| Total Blocking Time (TBT) | 0ms (Good) |
### Page Metrics
- **Load Time:** 133ms
- **DOM Content Loaded:** 133ms
- **DOM Nodes:** 83
- **Resources:** 128
- **Total Transfer Size:** 32.2 KB
- **JS Heap Size:** 28.8 MB

---

## Lighthouse Audit

**URL:** http://127.0.0.1:5173/auth?plan=term
**Lighthouse Version:** 13.4.1
**Measured:** 2026-07-30T03:11:59.413Z

### Scores
| Category | Score |
|----------|-------|
| Performance | 55 (Needs Improvement) |
| Accessibility | 100 (Good) |
| Best Practices | 100 (Good) |
| SEO | 63 (Needs Improvement) |

### Key Findings (Needs Attention)
| Status | Audit |
|--------|-------|
| FAIL | First Contentful Paint — 39.7 s |
| FAIL | Largest Contentful Paint — 77.4 s |
| FAIL | Speed Index — 39.7 s |
| FAIL | Time to Interactive — 77.4 s |
| FAIL | Minify JavaScript — Est savings of 10,430 KiB |
| FAIL | Minify CSS — Est savings of 6 KiB |
| FAIL | Reduce unused JavaScript — Est savings of 2,153 KiB |
| FAIL | Reduce unused CSS — Est savings of 13 KiB |

### Passing Audits
| Status | Audit |
|--------|-------|
| PASS | Total Blocking Time — 0 ms |
| PASS | Cumulative Layout Shift — 0 |
| PASS | JavaScript execution time — 0.2 s |
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

**URL:** http://127.0.0.1:5173/auth?plan=term
**Score:** 84/100
**Passed:** 13 | **Failed:** 5

### Issues Found

#### HIGH
- **Canonical URL**: Add <link rel="canonical" href="..."> to prevent duplicate content issues and consolidate link equity.

#### MEDIUM
- **Open Graph Image**: Add <meta property="og:image" content="...">. Pages shared without an image get significantly fewer clicks.

#### LOW
- **Meta Robots**: Page has "noindex" in meta robots — search engines will NOT index this page. Remove if this is unintentional.
  Current: noindex,nofollow
- **Title Length**: Title is too short (15 chars). Aim for 30-60 characters for optimal search display.
  Current: 15 characters
- **Description Length**: Description is too short (63 chars). Aim for 120-160 characters for optimal search display.
  Current: 63 characters

### Passing Checks

- Page Title (Sign in | Postr)
- Meta Description (Sign in to Postr, or start a poster as a guest with no account.)
- Single H1 Tag (1 H1 tag(s))
- Heading Hierarchy (1 headings (proper hierarchy))
- HTML Lang Attribute (en)
- Viewport Meta Tag (width=device-width, initial-scale=1.0)
- Image Alt Text (No images found)
- Open Graph Title (Sign in | Postr)
- Open Graph Description (Sign in to Postr, or start a poster as a guest with no account.)
- Twitter Card Meta (summary)
- Structured Data (JSON-LD) (1 block(s) found)
- Character Encoding (UTF-8)
- Link Accessibility (0/5 links missing descriptive text)


---

## Code Analysis Results

**Directory:** /Users/zihaogeng/development/postr-ux-audit-flow-map/apps/web/src
**Framework:** react
**Files Analyzed:** 200
**Total Lines:** 61,685
**Avg File Size:** 308 lines
**Components:** 98
**Stylesheets:** 0

### Largest Files
- poster/Sidebar.tsx (4271 lines)
- poster/PosterEditor.tsx (3873 lines)
- poster/blocks.tsx (2633 lines)
- import/pdfImport.ts (2243 lines)
- pages/Profile.tsx (1345 lines)

### Findings (1546 total)

#### Code Quality (757)

- **[HIGH]** pages/WhyPosters.tsx:117
  Deep nesting detected (9 levels)
  → Extract nested logic into helper functions or use early returns

- **[HIGH]** pages/Profile.tsx:94
  Empty catch block swallows errors silently
  → Handle or log the error inside the catch block — silent failures make debugging extremely difficult

- **[HIGH]** pages/Profile.tsx:110
  Empty catch block swallows errors silently
  → Handle or log the error inside the catch block — silent failures make debugging extremely difficult

- **[HIGH]** pages/Profile.tsx:128
  Empty catch block swallows errors silently
  → Handle or log the error inside the catch block — silent failures make debugging extremely difficult

- **[HIGH]** pages/Profile.tsx
  File has 1345 lines (recommended max: 400)
  → Split into smaller, focused modules with single responsibilities

- **[HIGH]** pages/Profile.tsx:545
  Deep nesting detected (14 levels)
  → Extract nested logic into helper functions or use early returns

- **[HIGH]** pages/PrivacyFr.tsx:426
  Deep nesting detected (9 levels)
  → Extract nested logic into helper functions or use early returns

- **[HIGH]** pages/Privacy.tsx:406
  Deep nesting detected (9 levels)
  → Extract nested logic into helper functions or use early returns

- **[HIGH]** pages/PaperToPoster.tsx:372
  Deep nesting detected (11 levels)
  → Extract nested logic into helper functions or use early returns

- **[HIGH]** pages/CookiesFr.tsx:292
  Deep nesting detected (9 levels)
  → Extract nested logic into helper functions or use early returns

- **[HIGH]** pages/Cookies.tsx:286
  Deep nesting detected (9 levels)
  → Extract nested logic into helper functions or use early returns

- **[HIGH]** pages/ChartChooser.tsx:150
  Deep nesting detected (11 levels)
  → Extract nested logic into helper functions or use early returns

- **[HIGH]** pages/Auth.tsx:497
  Deep nesting detected (11 levels)
  → Extract nested logic into helper functions or use early returns

- **[HIGH]** pages/AdminGallery.tsx:184
  Deep nesting detected (9 levels)
  → Extract nested logic into helper functions or use early returns

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

#### Accessibility (248)

- **[HIGH]** pages/Profile.tsx:364
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** pages/Profile.tsx:415
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** pages/Profile.tsx:423
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** pages/Profile.tsx:442
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** pages/Profile.tsx:477
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** pages/Profile.tsx:1235
  Input element may be missing an associated label
  → Wrap input in a <label>, use htmlFor/for attribute, or add aria-label/aria-labelledby

- **[HIGH]** pages/Profile.tsx:1243
  Input element may be missing an associated label
  → Wrap input in a <label>, use htmlFor/for attribute, or add aria-label/aria-labelledby

- **[HIGH]** pages/Profile.tsx:1307
  Input element may be missing an associated label
  → Wrap input in a <label>, use htmlFor/for attribute, or add aria-label/aria-labelledby

- **[HIGH]** pages/PaperToPoster.tsx:326
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** pages/PaperToPoster.tsx:346
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** pages/PaperToPoster.tsx:353
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** pages/Home.tsx:179
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** pages/Editor.tsx:289
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** pages/Debug.tsx:125
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** pages/Debug.tsx:135
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** pages/ChartChooser.tsx:135
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** pages/ChartChooser.tsx:185
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** pages/BillingResult.tsx:88
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** pages/BillingResult.tsx:116
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

- **[HIGH]** pages/Auth.tsx:399
  onClick handler without keyboard event handler (onKeyDown/onKeyUp)
  → Add onKeyDown or onKeyUp handler alongside onClick, or use a <button> element instead

#### User Experience (112)

- **[MEDIUM]** routes.tsx:113
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** App.tsx:10
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** pages/WhyPosters.tsx:80
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** pages/TermsFr.tsx:22
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** pages/Terms.tsx:23
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** pages/Share.tsx:30
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** pages/Profile.tsx:48
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** pages/PrivacyFr.tsx:17
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** pages/Privacy.tsx:19
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** pages/Pricing.tsx:21
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** pages/PaperToSlides.tsx:24
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** pages/PaperToPoster.tsx:59
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** pages/NotFound.tsx:5
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** pages/Landing.tsx:71
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** pages/Home.tsx:38
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** pages/GalleryEntry.tsx:22
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** pages/Gallery.tsx:27
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** pages/Editor.tsx:129
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** pages/Debug.tsx:28
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

- **[MEDIUM]** pages/CookiesFr.tsx:18
  React component without error boundary in ancestry
  → Wrap major UI sections with an ErrorBoundary component

#### Performance (12)

- **[MEDIUM]** pages/Profile.tsx:799
  Image without loading="lazy" (may impact initial load)
  → Add loading="lazy" for below-the-fold images

- **[MEDIUM]** pages/GalleryEntry.tsx:142
  Image without loading="lazy" (may impact initial load)
  → Add loading="lazy" for below-the-fold images

- **[MEDIUM]** pages/AdminGallery.tsx:286
  Image without loading="lazy" (may impact initial load)
  → Add loading="lazy" for below-the-fold images

- **[MEDIUM]** poster/blocks.tsx:178
  Image without loading="lazy" (may impact initial load)
  → Add loading="lazy" for below-the-fold images

- **[MEDIUM]** poster/blocks.tsx:346
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

- **[LOW]** pages/WhyPosters.tsx:84
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** pages/WhyPosters.tsx:84
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** pages/WhyPosters.tsx:89
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** pages/WhyPosters.tsx:95
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** pages/WhyPosters.tsx:97
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** pages/TermsFr.tsx:26
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** pages/TermsFr.tsx:26
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** pages/TermsFr.tsx:31
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** pages/TermsFr.tsx:34
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** pages/TermsFr.tsx:39
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** pages/Terms.tsx:27
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** pages/Terms.tsx:27
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** pages/Terms.tsx:32
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** pages/Terms.tsx:35
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** pages/Terms.tsx:40
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** pages/Share.tsx:84
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** pages/Share.tsx:84
  Hardcoded hex color (not using design token/variable)
  → Use CSS custom properties or design tokens for consistent theming

- **[LOW]** pages/Share.tsx:91
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