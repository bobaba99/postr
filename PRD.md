# PosterForge — Product Requirements Document

## Overview

**PosterForge** is a free, opinionated academic poster design web application for students and researchers. It enables fast creation of conference-quality research posters with built-in academic design constraints, structured author/affiliation management, reference management with citation style support, and smart text entry with Greek symbol shortcuts.

**Core philosophy:** Constraint as feature. Students don't need 400 fonts — they need 6 good ones. They don't need freeform color pickers — they need discipline-appropriate palettes. Every default should produce a good poster without design expertise.

**Target users:** Undergraduate and graduate students, postdocs, and researchers preparing posters for academic conferences.

**Design principle:** Minimal user friction. Zero signup to start. Autosave from the first keystroke. Every "save" is implicit. Conversion to a permanent account never loses work.

**Tech stack (production):**

| Layer | Choice |
|-------|--------|
| Frontend | Vite + React 18 + TypeScript (SPA) |
| Styling | Tailwind CSS + CSS variables for poster palette |
| Motion | GSAP 3 (premium micro-interactions, sidebar transitions, selection feedback) |
| State | Zustand (client store) + React Query (server cache) |
| Routing | React Router v6 (`/`, `/p/:id`, `/s/:slug`) |
| Fonts | Google Fonts via CDN (10 curated families) |
| Auth | Supabase Auth — anonymous-first, convertible to Google / email |
| Database | Supabase Postgres with RLS on every table |
| Storage | Supabase Storage (poster assets, thumbnails) |
| Backend API | Express + TypeScript on Render (only for LLM proxying / scan feature) |
| LLM (scan) | Anthropic Claude Sonnet 4.6 with vision (via backend, never exposed to browser) |
| Export | Browser `window.print()` (v1) → html2canvas + jsPDF (v2) |
| Hosting | Vercel (frontend), Render (API), Supabase (data) |
| Analytics | PostHog (product) + GA4 (acquisition) — gated by consent |

**Reference prototype:** `prototype.js` (~610-line single-file React component) — sample only. The production build ports its logic into a modular component tree with persistence layered on top.

---

## System Architecture

### Service Topology

```
┌──────────────────┐      ┌────────────────────┐
│   Vercel (SPA)   │◄────►│     Supabase       │
│  Vite + React    │      │  Auth, Postgres,   │
│                  │      │  Storage, RLS      │
└────────┬─────────┘      └────────────────────┘
         │
         │ LLM scan only
         ▼
┌──────────────────┐      ┌────────────────────┐
│ Render (Express) │◄────►│  Anthropic Claude  │
│ /api/scan        │      │   Sonnet 4.6 +     │
│                  │      │       vision       │
└──────────────────┘      └────────────────────┘
```

**Split:** 80% of traffic (auth, poster CRUD, asset upload, reference reads) goes directly from the browser to Supabase via `@supabase/supabase-js`. The Express API is used **only** where the browser cannot safely hold a secret (OpenAI key for the scan feature). If the scan feature is disabled, the Render service can be removed entirely.

### Auth Flow (Anonymous-First)

1. On first visit, the client calls `supabase.auth.signInAnonymously()` before rendering the editor.
2. A `handle_new_user()` Postgres trigger on `auth.users` creates a matching `public.users` row and an empty **Untitled Poster** in `public.posters`.
3. The editor opens straight into that poster. **Zero signup. Zero dialogs.**
4. Autosave fires on every mutation (debounced 800ms) to the same poster row.
5. Conversion to permanent account uses `supabase.auth.updateUser({ email, password })` or OAuth link — all posters, presets, and assets carry over (same `user_id`).
6. A weekly cron deletes anonymous users inactive > 30 days via `auth.admin.deleteUser()` (cascades through FKs).

### Database Schema

All tables have RLS. Default policy: `auth.uid() = user_id`.

```sql
-- Profile (1:1 with auth.users)
users (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  email text,
  is_anonymous boolean default true,
  cookie_consent_at timestamptz,
  created_at timestamptz default now()
)

-- Posters (main document)
posters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  title text default 'Untitled Poster',
  width_in numeric not null default 48,
  height_in numeric not null default 36,
  data jsonb not null,            -- blocks[], style, palette, font, institutions, authors, references (self-contained snapshot)
  thumbnail_path text,             -- Supabase Storage path
  share_slug text unique,          -- null = not shared; set = public read via /s/:slug
  is_public boolean default false,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
)
create index on posters (user_id, updated_at desc);

-- Reusable custom style presets
presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  name text not null,
  source text not null check (source in ('manual','scanned')),
  data jsonb not null,             -- { fontFamily, palette, styles{title,heading,authors,body}, headingStyle }
  thumbnail_path text,             -- optional, for scanned presets (original image)
  created_at timestamptz default now()
)

-- Reusable library: institutions, authors, references (imported into posters on demand)
institutions_lib (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  name text not null, dept text, location text,
  created_at timestamptz default now()
)
authors_lib (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  name text not null,
  affiliation_lib_ids uuid[] default '{}',
  is_corresponding boolean default false,
  equal_contrib boolean default false,
  created_at timestamptz default now()
)
references_lib (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  authors text[] not null,
  year text, title text, journal text, doi text,
  created_at timestamptz default now()
)

-- Asset metadata (binaries live in Supabase Storage bucket "poster-assets")
assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  poster_id uuid references posters(id) on delete cascade,
  storage_path text not null,
  mime_type text, size_bytes int,
  width int, height int,
  created_at timestamptz default now()
)
```

**Public share policy:** `posters` has a second RLS policy `using (is_public = true)` for `select` — enables `/s/:slug` read-only anonymous viewing.

**Storage bucket:** `poster-assets` — path pattern `{user_id}/{poster_id}/{asset_id}.{ext}`. RLS on `storage.objects` scopes access to owning user; public posters expose asset paths via signed URLs.

### Application Structure

```
┌─────────────────┬──────────────────────────────────────┐
│     Sidebar      │            Poster Canvas             │
│   (280px fixed)  │     (flex, scrollable, zoomable)     │
│                  │                                      │
│  ┌─ Tabs ──────┐ │   ┌──────────────────────────────┐   │
│  │ layout      │ │   │  Scaled poster surface       │   │
│  │ authors     │ │   │  (absolute-positioned blocks) │   │
│  │ refs        │ │   │                              │   │
│  │ style       │ │   │  [Title]                     │   │
│  │ edit        │ │   │  [Authors]                   │   │
│  └─────────────┘ │   │  [Heading] [Heading] [Head]  │   │
│                  │   │  [Text]    [Image]   [Table]  │   │
│  Tab content     │   │  [Text]    [Image]   [Text]   │   │
│  scrolls here    │   │  [...]     [...]     [Refs]   │   │
│                  │   └──────────────────────────────┘   │
│                  │                                      │
│                  │   [──── Zoom Bar (bottom center) ──] │
└─────────────────┴──────────────────────────────────────┘
```

### Data Model

All state lives in the root `PosterForge` component and flows down via props.

#### Block Model

Every content element on the poster is a **block** with this shape:

```typescript
interface Block {
  id: string;              // Unique ID, e.g. "b101"
  type: "title" | "authors" | "heading" | "text" | "image" | "logo" | "table" | "references";
  x: number;               // Left position in poster coordinate units
  y: number;               // Top position in poster coordinate units
  w: number;               // Width in poster coordinate units
  h: number;               // Height (ignored for headings — auto-sized)
  content: string;          // Text content (for title, heading, text blocks)
  imageSrc: string | null;  // Base64 data URL for image/logo blocks
  imageFit: "contain" | "cover" | "fill";  // Image display mode
  tableData: TableData | null;  // For table blocks
}

interface TableData {
  rows: number;
  cols: number;
  cells: string[];          // Flat array, row-major: cells[row * cols + col]
  colWidths: number[] | null;  // Percentage widths per column, null = equal
  borderPreset: string;     // Key into TB_PRESETS
}
```

#### Coordinate System

- **PX_PER_INCH = 10** — internal coordinate scale (1 unit = 1/10 inch conceptually)
- Poster canvas dimensions: `posterWidth * PX` × `posterHeight * PX`
- All block positions (x, y, w, h) are in these units
- Canvas is rendered at actual size then CSS-scaled via `transform: scale(zoom)`
- Zoom is auto-fit to viewport by default, manually adjustable ±

#### Grid & Snapping

- **Grid**: 10-unit spacing, rendered as SVG lines at 3% opacity, toggleable
- **Snap**: 5-unit grid (half-inch), threshold of 3 units. Applied to both position (move) and dimensions (resize) via `snap()` function

#### Style Levels

Typography is controlled at four levels, each with these properties:

```typescript
interface TypeStyle {
  size: number;        // Font size in poster coordinate units
  weight: 300 | 400 | 500 | 600 | 700 | 800;
  italic: boolean;
  lineHeight: number;  // CSS line-height multiplier (1.0–3.0)
  color: string | null;     // Hex color override, null = use palette
  highlight: string | null; // Background highlight color, null = none
}
```

Levels: `title`, `heading`, `authors`, `body` — each block type maps to its level.

---

## Feature Specifications

### 1. Poster Sizing

**Sizes supported:**
| Key | Dimensions | Label |
|-----|-----------|-------|
| 48×36 | 48" × 36" | Landscape (default) |
| 36×48 | 36" × 48" | Portrait |
| 42×36 | 42" × 36" | Landscape |
| 36×42 | 36" × 42" | Portrait |
| 42×42 | 42" × 42" | Square |
| 24×36 | 24" × 36" | Small |
| A0L | 46.8" × 33.1" | A0 Landscape |
| A0P | 33.1" × 46.8" | A0 Portrait |

Changing size regenerates the default 3-column layout scaled to the new dimensions.

### 2. Layout Templates

Five predefined layouts, each generating a complete set of blocks:

1. **3-Column Classic** — Title, authors, then 3 equal columns: Intro+Hypotheses | Methods+Figure | Results+Conclusions+References. Most common conference format.
2. **2-Column Wide Figure** — Two text columns above, full-width figure in middle, discussion+refs below.
3. **Billboard / Assertion-Evidence** — Large claim text at top, full-width figure, then 3-column bottom for Background/Methods/Implications. Based on Mike Morrison's #BetterPoster format.
4. **Sidebar + Focus** — 30% sidebar (text) + 70% main area (two stacked figures). Good for visually-driven posters.
5. **Blank Canvas** — Title + authors only.

**Layout generation logic:** Each template is a function that takes `(posterWidth, posterHeight)` and returns an array of block definitions with computed positions based on the canvas dimensions, using margins (M=10), gaps (g=6), and proportional height allocation.

### 3. Block Types

| Type | Behavior | Resize | Notes |
|------|----------|--------|-------|
| `title` | Inline editable text, centered | Width + height | Full poster width by default |
| `authors` | Auto-rendered from author/institution data | Width + height | Not directly editable on canvas |
| `heading` | Inline editable, styled with heading options | **Width only** (height auto-fits font) | Auto-numbered if enabled |
| `text` | Inline editable, multiline, slash commands | Width + height | Main content blocks |
| `image` | Click to upload, fit toggle (contain/cover/fill) | Width + height | Supports replace and remove |
| `logo` | Click to upload | Width + height | Typically placed in title bar area |
| `table` | Editable cells, border presets, paste from Word | Width + height | Drag handle at top for moving |
| `references` | Auto-rendered from reference manager | Width + height | Formatted per citation style |

### 4. Block Interactions

- **Move**: Pointer down on block → drag. Snaps to grid. Table blocks have a dedicated drag handle (top bar).
- **Resize**: Corner handle (bottom-right) for most blocks. Headings get a right-edge width-only handle (`ew-resize` cursor).
- **Select**: Click to select. Shows type label (top-left), delete button (top-right, red circle), and resize handles.
- **Delete**: Click × button, or press Delete key (only when not focused in a text input/contentEditable).
- **Overflow**: Block uses `overflow: visible` so selection UI (label, delete button) renders outside bounds. Inner content wrapper clips overflow for text blocks.

### 5. Smart Text (SlashCommands)

Text and heading blocks use the `SmartText` component — a `contentEditable` div with an autocomplete overlay.

**How it works:**
1. On every input event, compute absolute cursor position using `Range.selectNodeContents()` + `range.toString().length`
2. Extract text before cursor, match against `/[a-zA-Z0-9]+$` regex
3. If match length ≥ 2, show dropdown anchored to cursor position
4. Dropdown shows up to 8 matching symbols, filtered by prefix
5. Insert via: click (using `onMouseDown` + `preventDefault` to maintain focus), Tab, or Enter
6. Insertion: find last `/` before cursor in full text, replace `/command` with symbol character, restore cursor after symbol

**Symbol library (~70 entries):**
- Greek lowercase: α β γ δ ε ζ η θ κ λ μ ν ξ π ρ σ τ φ χ ψ ω
- Greek uppercase: Α Γ Δ Θ Λ Σ Φ Ψ Ω
- Math operators: ± × ÷ · ≤ ≥ ≠ ≈ ∞ ° √ ∑ ∫ ∂ ∇
- Arrows: → ← ↓ ↑ ⇔
- Stats shortcuts: η² χ² R² 𝑝 𝐹 𝑡 𝑑 𝑟 𝑁 𝑀 SD SE CI 𝑑𝑓 n.s. (stats symbols use italic Unicode math characters)

### 6. Author & Institution System

**Architecture:** Institution-first model. Define institutions once, authors reference them by ID.

```typescript
interface Institution {
  id: string;
  name: string;        // "McGill University"
  dept: string;        // "Dept. of Psychology" (optional)
  location: string;    // "Montreal" (optional)
}

interface Author {
  id: string;
  name: string;
  affiliationIds: string[];   // References to institution IDs (multi-affiliation)
  isCorresponding: boolean;   // Adds † marker
  equalContrib: boolean;      // Adds * marker
}
```

**Sidebar UI:**
1. **① Institutions section**: Add/remove institutions. Each gets a numbered badge (1, 2, 3...). Fields: name (required), department (optional), city (optional).
2. **② Authors section**: Add/remove/reorder (▲▼ buttons) authors. Each author row shows: name input, clickable institution badges to toggle affiliations, checkboxes for corresponding/equal-contribution.
3. **Preview**: Live-rendered author line below the editor.

**Poster rendering:**
```
First Author¹†, Second Author², Third Author¹
¹University A, Dept. of Psychology · ²University B, School of Engineering
*Equal contribution · †Corresponding author
```

Superscript numbers auto-deduplicated. Only referenced institutions shown. Footnotes only shown if at least one author has the flag.

### 7. Reference Manager

**Data model:**
```typescript
interface Reference {
  authors: string[];    // ["Smith, J.", "Doe, A."]
  year: string;
  title: string;
  journal: string;
  doi: string;
}
```

**Import:** File input accepting `.bib` (BibTeX/Zotero), `.ris` (EndNote/RefMan), `.enw` (EndNote). Parsers:
- **BibTeX parser**: Splits on `@type{`, extracts fields via regex `fieldname\s*=\s*[{"]...[}"]`
- **RIS parser**: Line-by-line tag matching (`TY`, `AU`, `TI`, `PY`, `JO`, `ER`)
- Both produce the same `Reference` object array

**Citation styles (4 formatters):**
| Style | Format |
|-------|--------|
| APA 7 | `Smith, J., & Doe, A. (2024). Title. _Journal_.` |
| Vancouver | `1. Smith, Doe. Title. Journal. 2024.` |
| IEEE | `[1] J. Smith, A. Doe, "Title," _Journal_, 2024.` |
| Harvard | `Smith, J. & Doe, A. (2024) 'Title', _Journal_.` |

**Sorting modes:**
- Manual (drag order)
- Alphabetical (first author last name)
- Year descending (newest first)
- Year ascending (oldest first)

Sorting is applied via `useMemo` — the raw reference array is stored in state, sorted copy is computed and passed to render.

**Manual entry:** Form with fields for authors (comma-separated), year, title, journal. Appends to reference list.

### 8. Table System

**Features:**
- Add/remove rows and columns
- Editable cells (input per cell)
- **Paste from Word/Excel**: Handles both HTML table paste (`<tr><td>`) and tab-delimited text
- **5 border presets**: None, APA 3-Line, All Lines, Horizontal Only, Header Box
- **Column width**: Equal by default, stored as percentage array
- Header row auto-styled: bolder weight, accent background tint

**Border preset logic:** Each preset is a flags object controlling: horizontal lines, vertical lines, outer border, header separator line, top line, bottom line, header box. The `cellBorder(row, col)` function computes per-cell CSS borders based on the active preset.

### 9. Typography & Styling

**Font families (10 curated):**
- Sans-serif: Source Sans 3, DM Sans, IBM Plex Sans, Fira Sans, Libre Franklin, Outfit
- Serif: Charter, Literata, Source Serif 4, Lora

All loaded via Google Fonts. No system fonts, no decorative fonts. Every option produces a readable academic poster.

**Style levels:** Title, Heading, Authors, Body — each independently controllable:
- Font size (5–60)
- Font weight (300–800)
- Italic toggle
- Line height (1.0–3.0, slider in edit panel)
- Text color (color picker, with reset to palette default)
- Highlight (5 preset semi-transparent colors + none)

**Heading-specific options:**
- Border style: None, Bottom line, Left bar, Box, Thick underline
- Auto-numbering (sections numbered 1., 2., 3. by Y-position order)
- Background fill toggle
- Text alignment (left, center)

**Color palettes (8, all print-safe — no dark backgrounds):**
Classic Academic, Nature/Biology, Medical/Clinical, Engineering, Psychology/Neuro, Humanities/Arts, Earth Sciences, Clean Minimal.

Each palette defines: `bg`, `primary`, `accent`, `accent2`, `muted`, `headerBg`, `headerFg`.

### 10. Style Presets

Save/load named presets storing: font family, palette, all 4 type style levels, heading style. Stored in React state (not persisted — would need localStorage or backend for production).

### 11. Sidebar Edit Tab

When a text/heading/title block is selected, the **Edit** tab shows:
- **Textarea**: Edit content in the sidebar (syncs bidirectionally with poster canvas)
- **Font size, weight, italic** controls for that block's style level
- **Line spacing slider** (1.0–2.5 range)
- **Text color picker** with reset
- **Highlight color swatches** (5 presets + clear)
- **Add Block** buttons below the editor

When no block is selected: shows "Click a block to edit" message + Add Block buttons + symbol reference card.

### 12. Zoom & Viewport

- **Auto-fit**: On load and window resize, zoom is calculated to fit poster in viewport with padding
- **Manual zoom**: +/− buttons in bottom-center bar, ±0.15 per click, range 0.3×–3.0×
- **FIT button**: Resets to auto-fit
- **Percentage display**: Shows current zoom level, clickable to reset

### 13. Auto-Layout

One-click button in Layout tab. Algorithm:
1. Separate header blocks (title, authors) from body blocks
2. Pin headers to top of poster
3. Detect column structure by clustering body block X-positions (threshold: 30 units)
4. Assign each body block to nearest cluster
5. Within each column, sort blocks by Y-position
6. Re-lay out: equal column widths, uniform gap (6 units), blocks stacked top-to-bottom
7. Heading heights computed from font size, other blocks preserve their original heights
8. All values snapped to grid

### 14. Grid

- 40-unit grid lines rendered as SVG overlay at 3% opacity
- Toggle via checkbox in Layout tab
- Grid is cosmetic + aids manual alignment; snapping operates on 5-unit grid independently
- Grid hidden in print output via `@media print` CSS

### 15. Print / Export

- Browser-native `window.print()` triggered by button
- `@media print` CSS: hides everything except `#poster-canvas`, positions it fixed at full viewport, removes transform/shadow
- User sets browser print to: Save as PDF, Margins: None, Scale: Fit to page

### 16. Poster Scan (AI Style Import)

Upload a photo or PDF of an existing poster — the system extracts its layout structure and style, saves the result as a custom preset, and optionally applies it to the current poster.

**User flow (friction-minimised):**

1. User clicks **Scan poster** in the Style tab.
2. Drop one or more images / PDFs.
3. Upload → Supabase Storage (temp path).
4. Backend `/api/scan` receives `{ imageUrl }`, calls Claude Sonnet 4.6 with vision and tool-use-based structured output, returns a preset JSON.
5. Frontend saves result as a new preset in `presets` (source = `"scanned"`) and shows "Apply to current poster?" one-click option.

**Extracted preset shape (matches manual preset):**

```ts
interface ScannedPreset {
  name: string;          // auto-generated, e.g. "Scanned — Blue Academic"
  fontFamily: string;    // closest match from the 10 curated families
  palette: {
    bg: string; primary: string; accent: string; accent2: string;
    muted: string; headerBg: string; headerFg: string;
  };
  styles: {
    title:   TypeStyle;
    heading: TypeStyle;
    authors: TypeStyle;
    body:    TypeStyle;
  };
  headingStyle: {
    border: "none" | "bottom" | "left" | "box" | "thick";
    fill: boolean;
    align: "left" | "center";
  };
  layoutHint?: "3-col" | "2-col" | "billboard" | "sidebar" | "blank";
}
```

**Guardrails:**

- Claude must pick `fontFamily` from the 10 curated families (enum constraint in the tool-use input schema).
- Palette values clamped to print-safe (no pure black bg, no neon).
- Rate-limited per user (in-memory sliding window on Render) — free users capped at 10 scans / day.
- Image auto-deleted from storage after 24 h if not saved.
- Anthropic API key lives **only** in Render env; never shipped to browser.

**Backend endpoint:**

```
POST /api/scan
Headers: Authorization: Bearer <supabase-jwt>
Body:    { imageUrl: string }
Response: { preset: ScannedPreset } | { error: string }
```

Middleware stack: `requireAuth → rateLimit → dailyLimit → scanHandler → errorHandler`.

### 17. Profiles & Persistence

**Anonymous-first.** No signup wall. On first visit, the client creates an anonymous Supabase session, the `handle_new_user` trigger creates a profile + Untitled Poster, and the editor opens straight into it.

- **Autosave:** Every poster mutation is debounced (800 ms) and upserted into `posters.data`. Saves a thumbnail every 30 s via canvas screenshot.
- **My Posters** page (`/`): grid of the user's posters with thumbnails, last-edited timestamps, duplicate/delete actions.
- **New Poster:** one click, opens immediately — no template dialog (defaults to 3-Column Classic; templates are swappable from the Layout tab).
- **Convert to permanent account:** "Sign in to save forever" in the top bar. Google OAuth or email link. `supabase.auth.updateUser()` keeps all existing data because `user_id` stays constant.
- **Stale-anonymous cleanup:** Weekly Supabase cron deletes anonymous users idle > 30 days.

### 18. Shareable Links

- **Publish poster:** flip `is_public = true`, auto-generate `share_slug` (nanoid 10 chars).
- **Public URL:** `https://postr.app/s/:slug` — read-only poster viewer, no sidebar, no auth required.
- **Copy link** button in top bar. **Stop sharing** reverts `is_public` and clears the slug.
- RLS on `posters`: additional policy `using (is_public = true)` for anonymous SELECT.
- Asset URLs for public posters served as signed URLs with 7-day expiry, regenerated on access.

### 19. Asset Storage

Images and logos are uploaded to Supabase Storage rather than embedded as base64 in the poster JSON.

- Bucket: `poster-assets`, path: `{user_id}/{poster_id}/{asset_id}.{ext}`.
- Block model change: `Block.imageSrc` holds a storage path (not base64), resolved to a signed URL at render time and cached in memory.
- On upload: client calls `supabase.storage.from('poster-assets').upload(...)`, inserts an `assets` row, then patches the block.
- On delete: cascade via `assets.poster_id` FK; a garbage-collection Edge Function sweeps orphaned storage objects nightly.

### 20. Custom Preset Library

- Presets (manual + scanned) listed in the Style tab with thumbnails.
- Apply / Rename / Delete / Duplicate.
- Scanned presets show the source image as the thumbnail.
- `presets.data` is the single source of truth — same shape as the in-memory preset used by the prototype.

### 21. Motion & Animation (GSAP)

Postr uses **GSAP 3** for premium micro-interactions throughout the editor and landing surfaces. Animation is the cheapest "premium feel" lever — done well it makes the same feature set feel more polished without changing functionality.

**Principles:**

- **Friction principle still wins.** Animations are short (150–350 ms), interruptible, and never block input. If a user clicks a second thing while the first is animating, the new action wins.
- **Respect `prefers-reduced-motion`.** All non-essential animations are gated by `gsap.matchMedia()` so users with the OS-level reduced-motion setting see instant transitions.
- **No animation on data correctness.** Autosave indicators, RLS errors, and form validation show state immediately — no fade-in delay before the user sees a problem.
- **One reusable module.** All timelines/eases live in `apps/web/src/motion/` so the surface area is auditable and styles stay consistent.

**Library scope:**

- **GSAP core only** (free) — no paid plugins. Specifically uses `gsap`, `gsap/ScrollTrigger` is NOT used yet.
- Bundle impact target: < 60 kB gzipped over the React+Supabase baseline.

**Animated moments:**

| Moment | Animation | Trigger |
|---|---|---|
| Auth bootstrap → editor | Sidebar slides in from left, canvas fades + scales from 0.96 → 1 | When `<AuthBootstrap>` resolves and editor first paints |
| Sidebar tab switch | Tab content cross-fades (180ms) | Tab button click |
| Block selection | Selection ring scales from 1.04 → 1, soft glow pulse on the accent border | `setSelectedId` resolves to a new id |
| Block insert | New block scales from 0.85 → 1 with overshoot ease | `addBlock()` |
| Block delete | Old block fades + scales to 0.85 before removal | `deleteBlock()` (350ms before store mutation) |
| Template apply / auto-layout | Stagger reposition: each block tweens from old → new (x, y, w, h) over 400ms | `applyTemplate()`, `autoLayout()` |
| Zoom bar buttons | Subtle nudge on +/− press | Button click |
| Scan modal | Drop-zone pulse on dragover; success checkmark draw-on | File enters / scan completes |
| Save indicator pill | Crossfade between "Saving…" and "Saved · 2s ago" | Autosave tick |

**Module layout:**

```
apps/web/src/motion/
├── index.ts             // public exports
├── eases.ts             // shared ease curves (smooth, overshoot, snap)
├── presets.ts           // duration constants
├── useGsapContext.ts    // wraps gsap.context() for React 18 cleanup
└── timelines/
    ├── editorEntrance.ts
    ├── blockSelection.ts
    ├── blockInsert.ts
    ├── blockDelete.ts
    ├── layoutReflow.ts
    └── tabSwitch.ts
```

**`useGsapContext` hook:** wraps `gsap.context(scope)` to bind animations to a component subtree, then auto-reverts on unmount. This is the React 18 / Strict Mode-safe pattern for GSAP cleanup and is the **only** sanctioned way to fire GSAP timelines from a component.

**Reduced motion fallback:**

```ts
// motion/index.ts
import { gsap } from 'gsap';

export const mm = gsap.matchMedia();

mm.add(
  {
    isFull:   '(prefers-reduced-motion: no-preference)',
    isReduced: '(prefers-reduced-motion: reduce)',
  },
  (ctx) => {
    const { isReduced } = ctx.conditions ?? {};
    if (isReduced) {
      gsap.defaults({ duration: 0.001 }); // collapse to "instant"
    }
  },
);
```

**Testing:** GSAP timelines are not unit-tested directly (animation correctness is visual). Each timeline is wrapped in a tiny factory that returns the configured `gsap.timeline()`, and the factories are smoke-tested to assert they call `gsap` with the expected arguments using `vi.mock('gsap')`. Visual verification happens in Playwright via `prefers-reduced-motion` toggling.

### 22. Reusable Author / Institution / Reference Library

Stored separately from posters so a user can reuse them across projects.

- **Authors tab:** "Add from library" picker alongside the existing inline editor. Saving an author also pushes to `authors_lib` (upsert by name).
- **Refs tab:** "Import from library" bulk selector. Import still supports `.bib`/`.ris`/`.enw` file upload — imports now persist to `references_lib` and the current poster.
- Posters remain self-contained: the library items are copied into `posters.data` at import time, so editing a library entry does not retroactively mutate existing posters.

---

## Component Tree

```
PosterForge (root)
├── Sidebar
│   ├── Tab: Layout
│   │   ├── Poster size selector
│   │   ├── Grid toggle
│   │   ├── Auto-layout button
│   │   ├── Template buttons (5)
│   │   └── Print button
│   ├── Tab: Authors
│   │   ├── InstitutionManager
│   │   ├── AuthorManager
│   │   ├── AuthorLine (preview)
│   │   └── Add Logo button
│   ├── Tab: Refs
│   │   └── RefManager (import, style, sort, manual entry, list)
│   ├── Tab: Style
│   │   ├── Palette selector
│   │   ├── Font family selector
│   │   ├── StyleEditor (4-level typography)
│   │   ├── HeadingEditor
│   │   └── Preset save/load
│   └── Tab: Edit
│       ├── BlockEditor (textarea, formatting, color, highlight)
│       ├── Add block buttons
│       └── Symbol reference
├── Canvas Area
│   ├── Poster Surface (scaled div)
│   │   ├── Grid SVG overlay
│   │   └── Block[] (mapped)
│   │       ├── SmartText (for title, heading, text)
│   │       ├── AuthorLine (for authors)
│   │       ├── RefsBlock (for references)
│   │       ├── ImageBlock (for image)
│   │       ├── LogoBlock (for logo)
│   │       └── TableBlock (for table)
│   └── ZoomBar
```

---

## Known Limitations & Future Work

### Remaining Limitations (not in v1 scope)

- **No multi-select** — can only select and operate on one block at a time
- **No rich text** — text blocks are plain text (no inline bold/italic/mixed formatting within a single block)
- **No PNG/PPTX export** — only browser print-to-PDF in v1 (html2canvas + jsPDF in v2)
- **No collaborative editing** — single-user only
- **No LaTeX math rendering** — symbols are Unicode only, no equation layout
- **Table column width drag** — was specified but the drag handles aren't wired in the current prototype

### Future Work (post-v1)

1. **Rich text editing**: Integrate TipTap or Slate.js for inline formatting within text blocks
2. **PDF export via html2canvas + jsPDF**: Client-side PDF generation without browser print dialog
3. **LaTeX math via KaTeX**: Inline math rendering for STEM posters
4. **Real-time collaboration**: WebSocket + CRDT (e.g., Yjs) for multi-user editing
5. **Template gallery**: User-submitted templates with thumbnails
6. **Poster score/lint**: Check design rules (font size minimums for readability at 3 feet, margin compliance, contrast ratios, text density warnings)
7. **Zotero API integration**: Direct library connection instead of file import only
8. **Accessibility**: Keyboard navigation for all block operations, screen reader labels
9. **Comment/annotation system**: Inline comments on blocks for advisor feedback. Threaded replies, resolve/unresolve states, comment indicators on the canvas. Enable a "share for review" mode where advisors can comment without editing. Store comments in a `poster_comments` table with `block_id`, `user_id`, `content`, `resolved_at`, `parent_comment_id`.
10. **Poster gallery / inspiration board**: Users can submit their past successful conference posters (with consent) as public examples. Gallery page with filtering by field (psychology, neuroscience, psychiatry), conference (APA, SfN), and layout type (3-column, billboard). Each submission includes: poster image, field, conference, year, and optional "what worked" notes. Helps beginners see real examples before starting. Moderation via admin review before publishing. Store in `poster_gallery` table with `submitted_by`, `field`, `conference`, `year`, `image_url`, `notes`, `approved`.
11. **OCR-based figure readability**: Upload-only path for users without plotting code. Local Ollama (llava/moondream) or Claude Vision to detect text regions in images, measure pixel heights, compute effective print size. Phase 2 PRD exists at `docs/plans/2026-04-10-figure-readability-ocr-phase2.md`.
12. **Telemetry & analytics**: Wire up PostHog (product analytics — funnels, session recordings, feature usage) and GA4 (acquisition — SEO, marketing attribution). Both gated behind cookie consent banner per GDPR/ePrivacy; Supabase auth tokens are essential and exempt. Key events to instrument: `poster_created`, `block_added` (with `block_type`), `export_pdf`, `signup_completed` (with `provider`), `anonymous_to_permanent_conversion`, `template_applied`. Error tracking via PostHog exceptions or Sentry. Add server-side telemetry on API for LLM cost/latency per endpoint. Environment vars: `VITE_POSTHOG_KEY`, `VITE_GA4_MEASUREMENT_ID`.

---

## Design Tokens

### UI Chrome (sidebar + controls, NOT the poster itself)
- **Background**: `#111118` (sidebar), `#0a0a12` (canvas area)
- **Surface**: `#1a1a26` (inputs, buttons)
- **Border**: `#2a2a3a`
- **Text primary**: `#c8cad0`
- **Text muted**: `#555`
- **Accent**: `#7c6aed` (purple — used for active tabs, toggles, highlights)
- **Danger**: `#d33` (delete buttons), `#c55` (remove links)
- **Font**: DM Sans (UI only — poster uses user-selected font)

### Poster Surface
All poster styling comes from the active palette + style levels. The UI chrome never bleeds into the poster canvas.