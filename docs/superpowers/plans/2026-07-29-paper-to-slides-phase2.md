# Paper-to-Slides Phase 2 (Design Pass) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the plain Phase-1 deck into a beautiful, editable, free-to-everyone designed deck — Arm P styles each slide, Arm T normalizes color/type, one shared styled-layout model renders to a matching `.pptx` and `.pdf`.

**Architecture:** P leads (structure + devices), T normalizes (palette + type) as a recolor layer. A single `StyledSlideDeck` data model feeds two writers: the extended pptxgenjs `deckWriter` → `.pptx` (with icon + palette + empty-layout utility slides), and a new client-side PDF writer → `.pdf` (utility slides omitted). No image generation (Arm I deferred). Everything stays editable text/shapes.

**Tech Stack:** React + Vite + TS, Vitest, `pptxgenjs` (installed, lazy), a client PDF lib (`pdf-lib` or `jspdf` — chosen in Task 0), Express API (`apps/api`), `gpt-5.6-terra` (forced tool use, `reasoning_effort:'none'`).

## Global Constraints

- **Polish is FREE to everyone** — both the free PDF and paid PPTX get the full design. Polish is never the paywall (spec §6, §7). (Phase-2 spec §0.)
- **Everything stays editable** — Arm P emits structured layout DATA, never an image. Content slides render as real pptx text/shapes. No rasterized content. (Phase-2 spec §0.)
- **Conference-tolerable devices only** — creative list layouts, quotes, progress bars, text shading, abstract shapes. **No attention-grabbing animation, nothing slow to interpret, no meme imagery.** (Phase-2 spec §2.)
- **Arm I (imagery), per-component edits/crosswalk/relation-lookup, real Stripe paywall, and any slide-editor are OUT of Phase 2** (Phase-2 spec §6). Vibe field = whole-deck re-theming only.
- **PDF omits the icon/palette/empty-layout slides** — they are PowerPoint-editing utilities, meaningless in a PDF. PDF renders the SAME styled model, not the DOM (retires `window.print()`). (Phase-2 spec §3.)
- **A device Arm P emits that the writer can't render must degrade gracefully** — fall back to plain text placement, never break the export. The writer's supported-device set is a fixed vocabulary P is prompted against. (Phase-2 spec §5.3.)
- **Free/paid split unchanged** — PDF free (PNG "Made by Postr.sh" ack mark), PPTX paid, display-only paywall this phase. (Phase-2 spec §3.)
- **Copy rules:** no AI framing; generic user errors ("Something went wrong"); no `console.log`; immutability; TDD. (spec §9.)
- **LLM plumbing:** `gpt-5.6-terra`, `reasoning_effort:'none'` (required — forced tools 400 without it), forced tool use, zod-validated output, `fetchFn` injectable for tests — mirror `apps/api/src/narrative/extractFindings.ts` exactly.

---

## File Structure

**New — styled model + backend (`apps/api/src/narrative/`)**
- `styleDeck.ts` — Arm P provider: per-slide styled layout (structured, editable). Mirrors `extractFindings.ts`.
- `themeGen.ts` — Arm T provider: field theme + 4 palette variations.
- `__tests__/styleDeck.test.ts`, `__tests__/themeGen.test.ts`.
- Modify `narrative.ts` — add `POST /api/narrative/style-deck` and `POST /api/narrative/theme` (same middleware stack as `/extract-findings`).
- Modify `config.ts` — `STYLE_MODEL`, `THEME_MODEL` (= `gpt-5.6-terra`), token caps.

**New — shared styled-layout model (`apps/web/src/manuscript/deck/`)**
- `styledTypes.ts` — `StyledSlideDeck`, `StyledSlide`, `StyledElement` (kind, text, x, y, fontSize, color), `Theme` (palette, typeScale, accent), `DeviceKind` (the fixed device vocabulary).
- `applyTheme.ts` — the Arm-T normalize layer: recolor/re-type a styled deck against a `Theme` (pure, deterministic).
- `styleClient.ts`, `themeClient.ts` — web adapters calling the two endpoints (mirror `extractFindings.ts` web adapter).
- `__tests__/*`.

**New — writers**
- Modify `apps/web/src/export/pptx/deckWriter.ts` — accept a `StyledSlideDeck`; render each `StyledElement` + device to editable pptx shapes/text; append icon + palette + empty-layout utility slides.
- `apps/web/src/export/pdf/deckPdf.ts` (new) — client-side PDF writer from the SAME `StyledSlideDeck`, utility slides OMITTED.
- `apps/web/src/export/deck/iconLibrarySlide.ts`, `paletteSlide.ts` — the two utility-slide builders.
- `apps/web/src/export/deck/iconSet.ts` — the curated tagged icon set (Task 8; sourcing risk).
- `__tests__/*`.

**Modify — wizard/viewer**
- `apps/web/src/manuscript/slides/SlidesWizard.tsx` — auto-run the design pass on first deck assembly; hold the `StyledSlideDeck` + `Theme`; wire the vibe field.
- `apps/web/src/manuscript/slides/VibeField.tsx` (new) — the optional field + 2 recommended prompts; re-runs T only.
- `apps/web/src/manuscript/slides/SlideViewer.tsx` — render the styled deck (not the plain one).
- `apps/web/src/manuscript/slides/ExportDrawer.tsx` — `onExportPdf` → new PDF writer (not `window.print`).

---

## Task 0: PDF-fidelity validation spike (GATES EVERYTHING — do first)

**Files:**
- Modify: `apps/web/package.json` (install the chosen PDF lib)
- Create: `apps/web/src/export/pdf/__spikes__/pdfFidelity.spike.test.ts`

**Interfaces:**
- Produces: a go/no-go on client-side PDF, and the chosen lib (`pdf-lib` vs `jspdf`).

> The spec's load-bearing risk (§5.1): can a client PDF lib faithfully reproduce
> Arm P's layout + devices? If NO, the export architecture switches to the
> LibreOffice fallback and Tasks 6b/onward change. Resolve this BEFORE building.

- [ ] **Step 1: Install a client PDF lib**

Run: `cd apps/web && npm install pdf-lib`
(`pdf-lib` preferred — pure JS, precise text/shape placement, no canvas. If it can't place text where needed, the spike tries `jspdf` next.)

- [ ] **Step 2: Write a spike that renders the committed Arm P sample to PDF**

```ts
// pdfFidelity.spike.test.ts — a SPIKE (throwaway proof), not a product test.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

describe('PDF fidelity spike', () => {
  it('renders Arm P SS1 styled layout to a PDF with positioned text + shapes', async () => {
    const armP = JSON.parse(
      readFileSync(join(process.cwd(), '../../docs/plans/experiments/design-pass/out/SS1_armP_styled.json'), 'utf8'),
    );
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const IN = 72; // pdf points per inch; slide = 13.33x7.5in
    for (const s of armP.slides) {
      const page = doc.addPage([13.33 * IN, 7.5 * IN]);
      const H = 7.5 * IN;
      for (const e of s.elements) {
        if (e.text) {
          page.drawText(String(e.text).slice(0, 80), {
            x: (e.x ?? 0) * IN, y: H - (e.y ?? 0) * IN - 20,
            size: (e.fontSize ?? 14), font,
            color: hexToRgb(e.color ?? '#000000'),
          });
        } else if (e.kind?.includes('rule') || e.kind?.includes('track') || e.kind?.includes('box')) {
          page.drawRectangle({ x: (e.x ?? 0) * IN, y: H - (e.y ?? 0) * IN - 6, width: 2 * IN, height: 4, color: hexToRgb(e.color ?? '#888888') });
        }
      }
    }
    const bytes = await doc.save();
    expect(bytes.byteLength).toBeGreaterThan(1000);
    // Assert 3 pages (one per Arm P slide) and text is real (not rasterized)
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(armP.slides.length);
  });
});
function hexToRgb(h: string) { const n = h.replace('#',''); return rgb(parseInt(n.slice(0,2),16)/255, parseInt(n.slice(2,4),16)/255, parseInt(n.slice(4,6),16)/255); }
```

- [ ] **Step 3: Run the spike + inspect the output**

Run: `cd apps/web && npx vitest run src/export/pdf/__spikes__/pdfFidelity.spike.test.ts`
Expected: PASS — a multi-page PDF with positioned real text + shapes. If pdf-lib can't place the devices acceptably, repeat with `jspdf`. **Manually open the produced PDF (write it to /tmp in the spike) and eyeball it — does it look like the styled slide?**

- [ ] **Step 4: Record the verdict**

Write a 3-line note at the top of `deckPdf.ts` (created in Task 6b): which lib won, and whether client-side PDF is GO (proceed) or NO-GO (switch Task 6b to the LibreOffice `soffice` server path documented in Phase-2 spec §3). Commit the decision.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/src/export/pdf/__spikes__/
git commit -m "spike(pdf): validate client-side PDF fidelity for the styled deck (Task 0 gate)"
```

---

## Task 1: `styledTypes.ts` — the shared styled-layout model

**Files:**
- Create: `apps/web/src/manuscript/deck/styledTypes.ts`
- Test: `apps/web/src/manuscript/deck/__tests__/styledTypes.test.ts`

**Interfaces:**
- Produces:
  - `type DeviceKind = 'plain' | 'quote-block' | 'progress-bar' | 'stat-emphasis' | 'callout'` — the FIXED device vocabulary Arm P is prompted against and the writer supports.
  - `interface StyledElement { kind: string; text?: string; x: number; y: number; fontSize?: number; color?: string }`
  - `interface StyledSlide { role: SlideRole; device: DeviceKind; elements: StyledElement[] }`
  - `interface Theme { palette: string[]; typeScale: { heading: number; body: number; label: number }; accentTreatment: string }`
  - `interface StyledSlideDeck { slides: StyledSlide[]; theme: Theme; durationMinutes: number }`
  - `const SUPPORTED_DEVICES: readonly DeviceKind[]`

- [ ] **Step 1: Write the failing test (the vocabulary + shape are the contract)**

```ts
import { describe, it, expect } from 'vitest';
import { SUPPORTED_DEVICES, type StyledSlideDeck } from '../styledTypes';

describe('styled model', () => {
  it('fixes the supported device vocabulary', () => {
    expect(SUPPORTED_DEVICES).toContain('plain');
    expect(SUPPORTED_DEVICES).toContain('progress-bar');
    expect(SUPPORTED_DEVICES).toContain('callout');
  });
  it('a StyledSlideDeck carries slides + theme', () => {
    const d: StyledSlideDeck = { durationMinutes: 10, theme: { palette: ['#fff','#000','#7c6aed'], typeScale: { heading: 30, body: 18, label: 13 }, accentTreatment: 'slate' }, slides: [] };
    expect(d.theme.palette.length).toBeGreaterThan(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run src/manuscript/deck/__tests__/styledTypes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `styledTypes.ts`** (the interfaces above; import `SlideRole` from `./types`).

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && npx vitest run src/manuscript/deck/__tests__/styledTypes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/manuscript/deck/styledTypes.ts apps/web/src/manuscript/deck/__tests__/styledTypes.test.ts
git commit -m "feat(slides): shared styled-layout model (StyledSlideDeck + device vocabulary)"
```

---

## Task 2: `applyTheme.ts` — the Arm-T normalize layer

**Files:**
- Create: `apps/web/src/manuscript/deck/applyTheme.ts`
- Test: `apps/web/src/manuscript/deck/__tests__/applyTheme.test.ts`

**Interfaces:**
- Consumes: `StyledSlideDeck`, `Theme` (Task 1).
- Produces: `applyTheme(deck: StyledSlideDeck, theme: Theme): StyledSlideDeck` — pure, deterministic. Recolors every element to the theme palette (structural roles → palette slots) and re-sizes text to the theme's type scale. P's *structure* (positions, device, text) is untouched; only color + font size change. This is what makes "re-vibe = re-run T only" cheap.

- [ ] **Step 1: Write the failing tests (structure preserved, color/type normalized)**

```ts
import { describe, it, expect } from 'vitest';
import { applyTheme } from '../applyTheme';
import type { StyledSlideDeck, Theme } from '../styledTypes';

const base: StyledSlideDeck = {
  durationMinutes: 10,
  theme: { palette: ['#ffffff','#111111','#999999'], typeScale: { heading: 20, body: 14, label: 10 }, accentTreatment: 'x' },
  slides: [{ role: 'result', device: 'callout', elements: [
    { kind: 'title', text: 'A finding', x: 0.7, y: 1.4, fontSize: 99, color: '#ff0000' },
    { kind: 'callout-box', x: 0.7, y: 4, color: '#00ff00' },
  ] }],
};
const theme: Theme = { palette: ['#faf9fc','#1a1725','#7c6aed','#8b8798'], typeScale: { heading: 30, body: 18, label: 13 }, accentTreatment: 'slate' };

describe('applyTheme', () => {
  it('recolors elements to the theme palette (no red/green survives)', () => {
    const out = applyTheme(base, theme);
    const colors = out.slides[0].elements.map((e) => e.color);
    expect(colors).not.toContain('#ff0000');
    expect(colors).not.toContain('#00ff00');
    expect(colors.every((c) => !c || theme.palette.includes(c))).toBe(true);
  });
  it('re-sizes title text to the theme heading scale', () => {
    const out = applyTheme(base, theme);
    const title = out.slides[0].elements.find((e) => e.kind === 'title');
    expect(title?.fontSize).toBe(theme.typeScale.heading);
  });
  it('preserves structure — positions + text + device unchanged', () => {
    const out = applyTheme(base, theme);
    expect(out.slides[0].device).toBe('callout');
    expect(out.slides[0].elements[0].x).toBe(0.7);
    expect(out.slides[0].elements[0].text).toBe('A finding');
  });
  it('is pure — does not mutate the input', () => {
    const before = JSON.stringify(base);
    applyTheme(base, theme);
    expect(JSON.stringify(base)).toBe(before);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run src/manuscript/deck/__tests__/applyTheme.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `applyTheme.ts`** — a role→palette-slot map (title/heading → ink, accent-* → accent, muted/footer → muted, bg → palette[0]); a kind→typeScale map (title→heading, body/quote→body, label→label); return a new deck with new slide/element objects (immutable).

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && npx vitest run src/manuscript/deck/__tests__/applyTheme.test.ts`
Expected: PASS (all 4).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/manuscript/deck/applyTheme.ts apps/web/src/manuscript/deck/__tests__/applyTheme.test.ts
git commit -m "feat(slides): applyTheme — deterministic Arm-T recolor/normalize layer"
```

---

## Task 3: Arm P endpoint — `styleDeck.ts` + route

**Files:**
- Create: `apps/api/src/narrative/styleDeck.ts`
- Modify: `apps/api/src/narrative/config.ts`, `apps/api/src/narrative.ts`
- Test: `apps/api/src/narrative/__tests__/styleDeck.test.ts`, `apps/api/src/__tests__/narrativeStyleDeck.test.ts`

**Interfaces:**
- Consumes: the plain `SlideDeck` (Phase 1) as input.
- Produces: `POST /api/narrative/style-deck` → `{ slides: StyledSlide[] }` (per-slide device + positioned elements). Provider mirrors `extractFindings.ts` (forced tool use, `reasoning_effort:'none'`, zod-validated, `fetchFn` injectable). The tool schema constrains `device` to `SUPPORTED_DEVICES` and every element to `{kind,text?,x,y,fontSize?,color?}`. System prompt: clean academic styling, devices only from the vocabulary, no image, no distraction.

- [ ] **Step 1: Write the failing tests** (parse valid tool output; reject a device outside the vocabulary → coerce to `plain`; route: happy path + missing-key 503 + bad input 400 before upstream). Mirror `narrativeExtractFindings.test.ts` structure. Use `vi.fn()` for `fetchFn` — never hit the real API.

```ts
// styleDeck.test.ts (unit) — key assertions
import { describe, it, expect } from 'vitest';
import { parseStyleOutput, coerceDevices } from '../styleDeck.js';
describe('styleDeck', () => {
  it('parses a valid styled-slides payload', () => {
    const out = parseStyleOutput({ slides: [{ role: 'result', device: 'callout', elements: [{ kind: 'title', text: 'x', x: 0.7, y: 1 }] }] });
    expect(out.slides).toHaveLength(1);
  });
  it('coerces an unknown device to plain (graceful degradation)', () => {
    const out = coerceDevices({ slides: [{ role: 'result', device: 'holographic-3d', elements: [] }] });
    expect(out.slides[0].device).toBe('plain');
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `cd apps/api && npx vitest run src/narrative/__tests__/styleDeck.test.ts` → FAIL.

- [ ] **Step 3: Implement** `config.ts` constants (`STYLE_MODEL='gpt-5.6-terra'`, `STYLE_MAX_TOKENS=3000`), `styleDeck.ts` (provider + `parseStyleOutput` zod + `coerceDevices` gate + `EXTRACT`-style upstream error), and the route in `narrative.ts` (same middleware as `/extract-findings`).

- [ ] **Step 4: Run to verify it passes + full api suite.** Run: `cd apps/api && npx vitest run` → all green.

- [ ] **Step 5: Live smoke (REQUIRED — mocked tests can't catch a real 400).**

Write a temp test in `apps/api/src/narrative/__tests__/` that calls the real provider on the committed `SS1_armP_styled.json`'s source deck with `OPENAI_API_KEY` from `apps/api/.env`, asserts it returns styled slides with devices in the vocabulary, then DELETE the temp test. (Same pattern used for the extraction endpoint.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/narrative/styleDeck.ts apps/api/src/narrative/config.ts apps/api/src/narrative.ts apps/api/src/narrative/__tests__/styleDeck.test.ts apps/api/src/__tests__/narrativeStyleDeck.test.ts
git commit -m "feat(narrative): Arm P style-deck endpoint (structured editable layout, device vocabulary gate)"
```

---

## Task 4: Arm T endpoint — `themeGen.ts` + route

**Files:**
- Create: `apps/api/src/narrative/themeGen.ts`
- Modify: `apps/api/src/narrative/config.ts`, `apps/api/src/narrative.ts`
- Test: `apps/api/src/narrative/__tests__/themeGen.test.ts`, `apps/api/src/__tests__/narrativeTheme.test.ts`

**Interfaces:**
- Consumes: `{ topic: string; vibe?: string }`.
- Produces: `POST /api/narrative/theme` → `{ theme: Theme; palettes: string[][] }` — the applied theme + 4 field-appropriate palette variations (for the palette slide + re-vibe). `vibe` (when present) steers the palette/type. Provider mirrors `extractFindings.ts`.

- [ ] **Step 1: Write the failing tests** (parse a theme with a ≥3-color palette + typeScale; produce 4 palette variations; route happy/503/400). Reuse the committed `SS1_theme.json` shape as the fixture.

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** `config.ts` (`THEME_MODEL`, `THEME_MAX_TOKENS=1500`), `themeGen.ts` (provider + zod `parseThemeOutput`, `palettes` length-4 guard), route.

- [ ] **Step 4: Run to verify it passes + full api suite green.**

- [ ] **Step 5: Live smoke** on a real topic (theme + 4 palettes returned), then delete the temp test.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/narrative/themeGen.ts apps/api/src/narrative/config.ts apps/api/src/narrative.ts apps/api/src/narrative/__tests__/themeGen.test.ts apps/api/src/__tests__/narrativeTheme.test.ts
git commit -m "feat(narrative): Arm T theme endpoint (field theme + 4 palette variations)"
```

---

## Task 5: Web adapters — `styleClient.ts` + `themeClient.ts`

**Files:**
- Create: `apps/web/src/manuscript/deck/styleClient.ts`, `apps/web/src/manuscript/deck/themeClient.ts`
- Test: `__tests__/styleClient.test.ts`, `__tests__/themeClient.test.ts`

**Interfaces:**
- Produces:
  - `styleDeck(plainDeck: SlideDeck, opts): Promise<StyledSlide[]>` — POSTs to `/api/narrative/style-deck`.
  - `generateTheme(topic: string, vibe: string | undefined, opts): Promise<{ theme: Theme; palettes: string[][] }>` — POSTs to `/api/narrative/theme`.
  - Mirror `apps/web/src/manuscript/deck/extractFindings.ts`'s adapter (anonymous-first `ensureSession`, `postJson({auth:true})`, typed error, generic user message).

- [ ] **Step 1: Write the failing tests** (mock the POST; happy path returns typed data; a rate-limit / failure surfaces the typed error, not raw text). Mirror the extraction adapter test.

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** both adapters mirroring `extractFindings.ts`.

- [ ] **Step 4: Run to verify it passes + full web suite green.**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/manuscript/deck/styleClient.ts apps/web/src/manuscript/deck/themeClient.ts apps/web/src/manuscript/deck/__tests__/styleClient.test.ts apps/web/src/manuscript/deck/__tests__/themeClient.test.ts
git commit -m "feat(slides): web adapters for style-deck + theme endpoints"
```

---

## Task 6a: Extend `deckWriter.ts` to render the styled deck to PPTX

**Files:**
- Modify: `apps/web/src/export/pptx/deckWriter.ts`
- Test: `apps/web/src/export/pptx/__tests__/deckWriterStyled.test.ts`

**Interfaces:**
- Consumes: `StyledSlideDeck` (Task 1), `SUPPORTED_DEVICES`.
- Produces: `exportStyledDeckPptx(deck: StyledSlideDeck, opts?): Promise<Uint8Array>` — one pptx slide per styled slide; each `StyledElement` → a real editable text box or shape at its (x,y) in the theme color; each `device` → its shape set (progress-bar → track+fill rects + labels; quote-block → text + rule; callout → box + label + text; stat-emphasis → large title). **An element whose kind maps to no known shape falls back to a plain text box (graceful degradation).** No images. Keep the Phase-1 `exportDeckPptx` intact (plain path) — this is a new export function.

- [ ] **Step 1: Write the failing tests** (N pptx slides for N styled slides; content is real `<a:t>` text not images — unzip + assert; a rect exists for a progress-bar device; an unknown device still exports without throwing).

```ts
import { describe, it, expect } from 'vitest';
import { exportStyledDeckPptx } from '../deckWriter';
import type { StyledSlideDeck } from '../../../manuscript/deck/styledTypes';
// styled deck built from the committed SS1_armP_styled.json + a theme
it('renders styled slides to editable pptx (text, not images)', async () => {
  const bytes = await exportStyledDeckPptx(fixtureStyledDeck());
  const { unzipSync, strFromU8 } = await import('fflate');
  const files = unzipSync(bytes);
  const slideXmls = Object.keys(files).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k));
  expect(slideXmls.length).toBeGreaterThan(0);
  expect(Object.keys(files).some((k) => k.endsWith('.png') || k.endsWith('.svg'))).toBe(false); // no rasterized content
  expect(strFromU8(files[slideXmls[0]])).toContain('<a:t>'); // real text
});
```

- [ ] **Step 2–4:** run→fail, implement the device renderers + the fallback, run→pass, run the full `src/export` suite (Phase-1 `deckWriter` + poster tests must stay green).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/export/pptx/deckWriter.ts apps/web/src/export/pptx/__tests__/deckWriterStyled.test.ts
git commit -m "feat(export): render the styled deck to editable PPTX (devices → shapes, graceful fallback)"
```

---

## Task 6b: Client-side PDF writer — `deckPdf.ts`

**Files:**
- Create: `apps/web/src/export/pdf/deckPdf.ts`
- Test: `apps/web/src/export/pdf/__tests__/deckPdf.test.ts`

**Interfaces:**
- Consumes: `StyledSlideDeck`, the ack mark PNG (`ackMarkPngDataUri`).
- Produces: `exportStyledDeckPdf(deck: StyledSlideDeck): Promise<Uint8Array>` — the SAME styled model → PDF via the Task-0-chosen lib. **Renders content + references + ack slide ONLY; OMITS icon/palette/empty-layout slides.** Ack mark (PNG) on the acknowledgement page, never over content.

> If Task 0 returned NO-GO, this task instead calls the LibreOffice `soffice`
> server path (a new `apps/api` endpoint that takes the pptx bytes → pdf). The
> Task-0 note in this file records which path is live.

- [ ] **Step 1: Write the failing tests** (page count = content+refs+ack, NOT including utility slides; text is real/selectable; ack PNG present on the last page; no icon/palette content).

- [ ] **Step 2–4:** run→fail, implement, run→pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/export/pdf/deckPdf.ts apps/web/src/export/pdf/__tests__/deckPdf.test.ts
git commit -m "feat(export): client-side styled-deck PDF (same model, utility slides omitted)"
```

---

## Task 7: Palette slide + Task 8: Icon-library slide (PPTX-only)

**Files:**
- Create: `apps/web/src/export/deck/paletteSlide.ts`, `iconLibrarySlide.ts`, `iconSet.ts`
- Test: `__tests__/paletteSlide.test.ts`, `__tests__/iconLibrarySlide.test.ts`

**Interfaces:**
- `addPaletteSlide(pptx, palettes: string[][], style)` — appends one slide with 4 labeled swatch rows; named `TEMPLATE_SLIDE_PREFIX` so the importer ignores it.
- `pickIcons(topicKeywords: string[]): CuratedIcon[]` (from `iconSet.ts`) + `addIconLibrarySlide(pptx, icons, theme)` — ~8–12 theme-recolored SVG icons on an appended, `TEMPLATE_SLIDE_PREFIX`-named slide.
- **Both are appended ONLY in the pptx path (Task 6a), never the pdf path (Task 6b).**

- [ ] **Step 1 (palette):** test — the palette slide has 4 rows, carries `TEMPLATE_SLIDE_PREFIX`, swatches are real rects in the given hex. Implement. Commit.

- [ ] **Step 2 (icon sourcing — RISK):** source a curated, permissively-licensed (e.g. MIT / CC0), tagged academic/scientific icon set; add a small tagged subset to `iconSet.ts` as inline SVG strings with `{ tags: string[], svg: string }`. **If no suitable set is found, STOP and flag — icons become a fast-follow; palettes + theme still ship.** Document the source + license in `iconSet.ts`.

- [ ] **Step 3 (icon slide):** test — `pickIcons(['memory','sleep'])` returns tag-matched icons; the slide places them, recolored, `TEMPLATE_SLIDE_PREFIX`-named. Implement. Commit.

```bash
git add apps/web/src/export/deck/ apps/web/src/export/deck/__tests__/
git commit -m "feat(export): PPTX-only palette slide + curated-icon-library slide"
```

---

## Task 9: VibeField component

**Files:**
- Create: `apps/web/src/manuscript/slides/VibeField.tsx`
- Test: `__tests__/VibeField.test.tsx`

**Interfaces:**
- Produces: `<VibeField value onChange onSubmit suggestions />` — the optional text field + 2 recommended prompts (tappable → fill + submit). `onSubmit(vibe)` re-runs Arm T only (wired in Task 10). Honest copy, no AI framing.

- [ ] **Steps:** test (renders field + 2 suggestions; tapping a suggestion calls onSubmit with its text; typing + submit calls onSubmit) → implement → pass → commit.

```bash
git commit -m "feat(slides): VibeField — optional vibe input + 2 recommended prompts"
```

---

## Task 10: Wire the design pass into the wizard (the integration)

**Files:**
- Modify: `apps/web/src/manuscript/slides/SlidesWizard.tsx`, `SlideViewer.tsx`, `ExportDrawer.tsx`
- Test: `__tests__/designPassE2e.test.tsx`

**Interfaces:**
- Consumes: `styleDeck`/`generateTheme` (Task 5), `applyTheme` (Task 2), the writers (6a/6b).

**Behavior (Phase-2 spec §1):**
- On first deck assembly, AUTOMATICALLY: `styleDeck(plainDeck)` + `generateTheme(topic)` → `applyTheme` → hold the `StyledSlideDeck` + `Theme` + the 4 palettes in state. The viewer shows the STYLED deck (never a plain dead-end).
- `VibeField` visible in the viewer; `onSubmit(vibe)` → `generateTheme(topic, vibe)` → `applyTheme` (re-run T only, structure kept).
- `ExportDrawer.onExportPptx` → `exportStyledDeckPptx` (+ palette + icon slides). `onExportPdf` → `exportStyledDeckPdf` (utility slides omitted). Retire `window.print`.
- Loading + generic-error states for the style/theme calls (house rule).
- Inject `testHooks` for the style/theme clients (like Phase-1 extraction).

- [ ] **Step 1: Write the failing e2e test** (inject fake style + theme clients; assemble deck → styled deck renders in the viewer → vibe submit re-themes → export drawer calls the styled writers). 

- [ ] **Step 2–4:** run→fail, wire it, run→pass; run the FULL web suite + `tsc -b`.

- [ ] **Step 5: Live browser verification** — run the worktree dev server (NOT the main-checkout one — start `vite` from the worktree on a free port, per the Phase-1 lesson), open `/paper-to-slides`, drive a real manuscript through to a styled deck, submit a vibe, confirm re-theme, export a pdf + pptx and open both (pdf omits utility slides; both match).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/manuscript/slides/
git commit -m "feat(slides): wire the Phase-2 design pass — auto-style, vibe re-theme, styled exports"
```

---

## Self-Review

**Spec coverage (Phase-2 spec §):**
- §0 P-leads-T-normalizes + shared model → Tasks 1, 2, 3, 4 ✅
- §1 auto-style + vibe re-runs-T-only → Tasks 9, 10 ✅
- §2 themed slides + 4-palette slide + icon slide → Tasks 6a, 7, 8 ✅
- §3 one model → pptx + pdf, PDF omits utility slides, retires print → Tasks 6a, 6b, 10 ✅
- §5.1 client-PDF-fidelity validated FIRST → Task 0 (gate) ✅
- §5.2 icon sourcing risk → Task 8 (explicit stop-and-flag) ✅
- §5.3 device→pptx graceful degradation → Tasks 3 (coerce), 6a (fallback) ✅
- §6 OUT list (Arm I, per-component edits, paywall, editor) → not built; guarded ✅

**Placeholder scan:** Task 0's spike and Task 8's icon-set are the two "procedure, not code-yet" spots — both are fully specified (spike code given; icon-set has a concrete source/license/shape requirement + a stop-and-flag rule). No hand-waving.

**Type consistency:** `StyledSlideDeck`/`StyledSlide`/`StyledElement`/`Theme`/`DeviceKind` defined in Task 1, consumed identically by Tasks 2 (applyTheme), 3 (style endpoint output shape), 6a (pptx), 6b (pdf), 10 (wiring). `SUPPORTED_DEVICES` defined Task 1, gate in Task 3, renderers in Task 6a. Consistent.

---

## Notes for execution
- **Ordering is dependency-driven:** Task 0 gates everything (PDF architecture). Then 1→2 (model + theme layer), 3+4 (backend, parallelizable), 5 (adapters), 6a+6b (writers, parallelizable after 1), 7+8 (utility slides), 9 (vibe UI), 10 (integration, last).
- **Every endpoint gets a live smoke test** (delete-after) — mocked tests cannot catch a real API rejection (the condense `reasoning_effort` bug is the cautionary tale).
- **Run the dev server from the worktree, not the main checkout** (the Phase-1 404 lesson).
