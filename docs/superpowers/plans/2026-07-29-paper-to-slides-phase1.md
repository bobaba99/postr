# Paper-to-Slides — Phase 1 Implementation Plan (Wizard shell + text deck + export)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `/paper-to-slides` wizard — a polished, GSAP-animated ≤6-step chat surface that turns a manuscript into a correct, complete, **black-and-white editable multi-slide `.pptx`** (plus a free PDF), reusing the shipped manuscript pipeline.

**Architecture:** A new code-split route renders a wizard shell (left foldable step-bar + main column: progress bar → slide viewer → upward-expanding export drawer). The wizard drives the *existing* manuscript pipeline (`buildDocumentModel` → LLM extraction → interviewer → condenser) but emits a new `SlideDeck` via a new deterministic `buildDeck.ts`, written to `.pptx` by extending the existing single-slide `export/pptx` writer to multi-slide. Motion is layered last, per-component, using `@gsap/react`'s `useGSAP`, and only on occasional/first-time surfaces (never on high-frequency actions).

**Tech Stack:** React 18 + Vite (SPA), TypeScript, Vitest, `pptxgenjs` (lazy-loaded, already a dep), `gsap@^3.14.2` (already installed) + `@gsap/react` (to add), Supabase (client), `@postr/shared` types.

## Global Constraints

- **This is Phase 1 only.** No design model, no theme, no colour, no icons/palettes. Black text on white, one clean typeface, generous margins. **Correct and complete before pretty.** (spec §Phase 1)
- **≤30 words per content slide** — hard ceiling, enforced deterministically *after* condense (cut, never shrink). Title + reference slides are exempt and excluded from the speaking-time budget. (spec §1)
- **Slide count is computed** from talk duration at **1 minute per content slide**; title + references are extra. (spec §1)
- **Reuse, do not fork.** Reuse `manuscript/*` and `export/*`; the only genuinely new modules are `buildDeck.ts` and multi-slide PPTX emission. Document every reuse coupling in a reuse-ledger comment. (spec §3)
- **No invented content.** Every slide carries a verbatim `sourceQuote` traceable to the manuscript; extraction/condense already enforce this — the deck builder must preserve and surface it. (spec §0, §2)
- **Privacy line, verified true:** *"Your manuscript is never stored on our servers, and is never used to train AI."* Do not add any DB/storage write of manuscript content. (spec §1)
- **Copy rule:** no AI framing — name the workflow, never the capability. Every printed claim verified against code. (spec §9)
- **Motion rule (Emil / project motion system):** animate only occasional/first-time surfaces; never keyboard-repeated actions. Custom easing only — use the repo tokens `--ease-out: cubic-bezier(0.22,1,0.36,1)`, `--ease-drawer: cubic-bezier(0.32,0.72,0,1)`, `--ease-back: cubic-bezier(0.34,1.3,0.64,1)` and `--dur-*` from `index.css`. UI motion <300ms. Never `scale(0)` (start ≥0.9 + opacity). Only animate `transform`/`opacity`. Respect `prefers-reduced-motion`. Stagger 30–80ms. (spec §Phase 2 motion; user request)
- **Pricing (display only in Phase 1):** $18.99 CAD / 4-month term OR $9.99 CAD / 3-export pack. Paywall is *display-only* here — the `.pptx` button shows the offer; real Stripe plumbing is Plan 3. (spec §6)
- **Money fires at `.pptx` export only.** PDF is free (with the PNG "Made by Postr.sh" ack mark). The polished design is free to both formats — but Phase 1 has no design pass, so both formats are the black-and-white deck; the free/paid split UI copy must still be present and honest. (spec §6)

---

## Scope note (why this is Plan 1 of 3)

The full spec spans several independent subsystems. This plan delivers the first
shippable unit end-to-end. Explicitly **out of scope** here, each its own future plan:

- **Plan 2 — Design pass:** research-theme-aware theme + icon slide + 4-palette
  slide + vibe prompt + GPT-image experiment. (spec §Phase 2)
- **Plan 3 — Slide viewer + paywall:** the standalone markup/comment viewer, the
  design-terms crosswalk, and the real Stripe `plan`/credits plumbing. (spec §5, §6)
- **Pre-work (recommended before this plan):** the poster-path LLM-extraction
  refactor (spec §3.1 / §8 Q1). This plan assumes extraction returns ranked
  findings with `sourceQuote`; if that refactor has not landed, Task 3 includes a
  thin talk-only extraction adapter so Phase 1 is not blocked.

---

## File Structure

**New — deck domain (`apps/web/src/manuscript/deck/`)**
- `buildDeck.ts` — deterministic `SlideDeck` builder (arc + budgets + title/refs).
- `slideBudget.ts` — duration→slide-count and the ≤30-word gate.
- `types.ts` — `SlideDeck`, `Slide`, `SlideRole` (or extend `@postr/shared` if that's where poster types live).
- `__tests__/buildDeck.test.ts`, `__tests__/slideBudget.test.ts`.

**New — wizard UI (`apps/web/src/manuscript/slides/`)**
- `SlidesWizard.tsx` — the route shell (left bar + main column orchestration + step state).
- `StepBar.tsx` — the foldable step cards documenting user input.
- `ProgressBar.tsx` — the top progress indicator.
- `SlideViewer.tsx` — the read-only deck preview (thumbnails + stage + notes). (Markup/comments = Plan 3.)
- `ExportDrawer.tsx` — the upward-expanding export drawer (free PDF / paid .pptx cards).
- `stepConfig.ts` — the ordered step list + labels.
- `useWizardMotion.ts` — all GSAP via `useGSAP`, one hook, scoped, reduced-motion aware.
- `__tests__/*` for the logic-bearing pieces (step state, budget display, gate enforcement).

**New — page + route**
- `apps/web/src/pages/PaperToSlides.tsx` — lazy page wrapper (mirrors `PaperToPoster`).
- Modify `apps/web/src/routes.tsx` — add `/paper-to-slides`; repoint `/paper-to-present` here; add `/paper-to-presentation` alias (all 308/replace).

**Modify — export (multi-slide)**
- `apps/web/src/export/pptx/writer.ts` — accept a `SlideDeck` and emit N content slides + title + refs (today: single poster slide).
- `apps/web/src/export/pptx/deckWriter.ts` (new) — the deck-specific composition, keeping `writer.ts` poster-focused if cleaner. Decide in Task 6.
- `apps/web/src/export/ackMark.ts` + new `apps/web/src/export/ackMarkPng.ts` — unify the ack mark to a pre-rasterized PNG (icon + "Made by Postr.sh") for PDF/print. (spec §6)
- Poster PPTX: remove the 5 empty template slides from the *poster* path (`export/pptx/templateSlides.ts` wiring) — they belong to the talk only. (spec §3.1)

**Modify — reuse (documented couplings)**
- `apps/web/src/manuscript/rubric.ts` — add slide budgets + `budgetScaleForSlides` consumer (may already exist per pipeline doc; verify).
- `apps/web/src/manuscript/interviewer.ts` — add an output-type branch (poster vs slides) to the shared question set.

**Modify — discoverability**
- `apps/web/src/components/PublicHeader.tsx`, `PublicFooter.tsx` — add both tools to nav.
- `apps/web/src/seo/routes.json` — add `/paper-to-slides` (+ sitemap regen via existing build script).
- `apps/web/src/components/NewPosterButton.tsx` / `ImportPosterModal.tsx` — add the "Import manuscript" entry with the privacy notice (links to `/paper-to-poster`). (spec §7)

---

## Task 0: Add `@gsap/react` and the motion scaffold

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/manuscript/slides/useWizardMotion.ts`
- Test: `apps/web/src/manuscript/slides/__tests__/useWizardMotion.test.ts`

**Interfaces:**
- Produces: `useWizardMotion(scopeRef: RefObject<HTMLElement>, opts: { reducedMotion: boolean }): { animateStepIn: (el: HTMLElement) => void; playExportDrawer: (el: HTMLElement, open: boolean) => void }`

- [ ] **Step 1: Add the dependency**

Run: `cd apps/web && npm install @gsap/react@^2.1.2`
Expected: `@gsap/react` added to `apps/web/package.json` dependencies; `gsap` already present at `^3.14.2`.

- [ ] **Step 2: Write the failing test (reduced-motion no-ops)**

```ts
// useWizardMotion.test.ts
import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import gsap from 'gsap';
import { useWizardMotion } from '../useWizardMotion';

describe('useWizardMotion', () => {
  it('does not call gsap when reducedMotion is true', () => {
    const spy = vi.spyOn(gsap, 'fromTo');
    const { result } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(document.createElement('div'));
      return useWizardMotion(ref, { reducedMotion: true });
    });
    result.current.animateStepIn(document.createElement('div'));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/manuscript/slides/__tests__/useWizardMotion.test.ts`
Expected: FAIL — module `../useWizardMotion` not found.

- [ ] **Step 4: Implement the hook**

```ts
// useWizardMotion.ts
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import type { RefObject } from 'react';

gsap.registerPlugin(useGSAP);

const EASE_OUT = 'cubic-bezier(0.22,1,0.36,1)';
const EASE_DRAWER = 'cubic-bezier(0.32,0.72,0,1)';

export function useWizardMotion(
  scopeRef: RefObject<HTMLElement>,
  opts: { reducedMotion: boolean },
) {
  const { reducedMotion } = opts;

  // Step entry: fade + subtle rise. Never scale(0). <300ms. transform+opacity only.
  const animateStepIn = (el: HTMLElement) => {
    if (reducedMotion) return;
    gsap.fromTo(
      el,
      { autoAlpha: 0, y: 8 },
      { autoAlpha: 1, y: 0, duration: 0.22, ease: EASE_OUT },
    );
  };

  // Export drawer: height-safe reveal via scaleY from origin top + opacity.
  const playExportDrawer = (el: HTMLElement, open: boolean) => {
    if (reducedMotion) {
      el.style.opacity = open ? '1' : '0';
      return;
    }
    gsap.to(el, {
      autoAlpha: open ? 1 : 0,
      duration: open ? 0.28 : 0.18, // exit faster than enter
      ease: EASE_DRAWER,
    });
  };

  return { animateStepIn, playExportDrawer };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/manuscript/slides/__tests__/useWizardMotion.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/src/manuscript/slides/useWizardMotion.ts apps/web/src/manuscript/slides/__tests__/useWizardMotion.test.ts
git commit -m "feat(slides): add @gsap/react and reduced-motion-aware wizard motion hook"
```

---

## Task 1: `slideBudget.ts` — duration→slide-count and the ≤30-word gate

**Files:**
- Create: `apps/web/src/manuscript/deck/slideBudget.ts`
- Test: `apps/web/src/manuscript/deck/__tests__/slideBudget.test.ts`

**Interfaces:**
- Produces:
  - `contentSlideCount(durationMinutes: number): number` — 1/min, min 3, floors fractions.
  - `SLIDE_WORD_CAP = 30`
  - `enforceSlideWordCap(text: string): { text: string; cut: boolean }` — trims to ≤30 words at a word boundary, never mid-word; sets `cut: true` if it trimmed.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { contentSlideCount, enforceSlideWordCap, SLIDE_WORD_CAP } from '../slideBudget';

describe('contentSlideCount', () => {
  it('is one slide per minute', () => {
    expect(contentSlideCount(10)).toBe(10);
  });
  it('floors fractional minutes', () => {
    expect(contentSlideCount(7.8)).toBe(7);
  });
  it('never returns fewer than 3', () => {
    expect(contentSlideCount(1)).toBe(3);
  });
});

describe('enforceSlideWordCap', () => {
  it('leaves short text untouched', () => {
    const r = enforceSlideWordCap('Spacing lifted recall by 34%.');
    expect(r.cut).toBe(false);
    expect(r.text).toBe('Spacing lifted recall by 34%.');
  });
  it('trims over-cap text at a word boundary and flags cut', () => {
    const words = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ');
    const r = enforceSlideWordCap(words);
    expect(r.cut).toBe(true);
    expect(r.text.split(/\s+/).length).toBeLessThanOrEqual(SLIDE_WORD_CAP);
    expect(r.text).not.toMatch(/w\d+\S/); // no mid-word cut
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run src/manuscript/deck/__tests__/slideBudget.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// slideBudget.ts
export const SLIDE_WORD_CAP = 30;

/** One content slide per spoken minute; title + refs are counted separately. */
export function contentSlideCount(durationMinutes: number): number {
  return Math.max(3, Math.floor(durationMinutes));
}

/** Hard word gate — cut at a word boundary, never shrink type, never mid-word. */
export function enforceSlideWordCap(text: string): { text: string; cut: boolean } {
  const words = text.trim().split(/\s+/);
  if (words.length <= SLIDE_WORD_CAP) return { text: text.trim(), cut: false };
  return { text: words.slice(0, SLIDE_WORD_CAP).join(' '), cut: true };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && npx vitest run src/manuscript/deck/__tests__/slideBudget.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/manuscript/deck/slideBudget.ts apps/web/src/manuscript/deck/__tests__/slideBudget.test.ts
git commit -m "feat(slides): slide-count derivation and the 30-word slide gate"
```

---

## Task 2: `SlideDeck` types + `buildDeck.ts` (deterministic arc)

**Files:**
- Create: `apps/web/src/manuscript/deck/types.ts`
- Create: `apps/web/src/manuscript/deck/buildDeck.ts`
- Test: `apps/web/src/manuscript/deck/__tests__/buildDeck.test.ts`

**Interfaces:**
- Consumes: `DocumentModel` (from `manuscript/buildDocumentModel.ts`), a ranked-findings array `{ text: string; sourceQuote: string; sourceSection: string }[]` (from extraction), condensed role text (from `api/narrative`), and `contentSlideCount` / `enforceSlideWordCap` (Task 1).
- Produces:
  - `interface Slide { role: SlideRole; assertion: string; evidence: string | null; sourceQuote: string; speakerNotes: SpeakerNote[]; wordCapCut: boolean }`
  - `type SlideRole = 'title' | 'hook' | 'question' | 'methods' | 'result' | 'takeaway' | 'references'`
  - `interface SpeakerNote { text: string; provenance: string }`
  - `interface SlideDeck { slides: Slide[]; durationMinutes: number }`
  - `buildDeck(input: BuildDeckInput): SlideDeck` — assembles the fixed arc, one result slide per ranked finding, title first, references last, every slide gated.

- [ ] **Step 1: Write the failing tests (arc shape + one-finding-per-slide + gate)**

```ts
import { describe, it, expect } from 'vitest';
import { buildDeck } from '../buildDeck';

const base = {
  title: 'Spaced practice in the classroom',
  authors: [{ name: 'J. Doe' }],
  durationMinutes: 10,
  rankedFindings: [
    { text: 'Spacing raised 6-week recall by 34%.', sourceQuote: 'a 34% improvement in delayed recall', sourceSection: 'Results' },
    { text: 'The effect held across all age bands.', sourceQuote: 'held across every age band', sourceSection: 'Results' },
  ],
  gap: 'Classroom evidence over weeks is thin.',
  resolution: 'This 6-week study shows the gain holds.',
  methodsSummary: 'Two conditions, 120 students, 6 weeks.',
  references: ['Doe J. 2026. Journal of Learning.'],
};

describe('buildDeck', () => {
  it('puts title first and references last', () => {
    const d = buildDeck(base);
    expect(d.slides[0].role).toBe('title');
    expect(d.slides[d.slides.length - 1].role).toBe('references');
  });

  it('emits one result slide per ranked finding (genre: expand, not compress)', () => {
    const d = buildDeck(base);
    expect(d.slides.filter((s) => s.role === 'result')).toHaveLength(2);
  });

  it('enforces the 30-word cap on every content slide', () => {
    const d = buildDeck({
      ...base,
      rankedFindings: [{ text: Array.from({ length: 50 }, (_, i) => `w${i}`).join(' '), sourceQuote: 'x', sourceSection: 'Results' }],
    });
    const result = d.slides.find((s) => s.role === 'result')!;
    expect(result.assertion.split(/\s+/).length).toBeLessThanOrEqual(30);
    expect(result.wordCapCut).toBe(true);
  });

  it('carries a sourceQuote on every non-title/ref slide (no invention)', () => {
    const d = buildDeck(base);
    for (const s of d.slides) {
      if (s.role === 'title' || s.role === 'references') continue;
      expect(s.sourceQuote.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run src/manuscript/deck/__tests__/buildDeck.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `types.ts` then `buildDeck.ts`**

```ts
// types.ts
export type SlideRole = 'title' | 'hook' | 'question' | 'methods' | 'result' | 'takeaway' | 'references';
export interface SpeakerNote { text: string; provenance: string }
export interface Slide {
  role: SlideRole;
  assertion: string;
  evidence: string | null;
  sourceQuote: string;
  speakerNotes: SpeakerNote[];
  wordCapCut: boolean;
}
export interface SlideDeck { slides: Slide[]; durationMinutes: number }
```

```ts
// buildDeck.ts
// REUSE LEDGER: consumes DocumentModel + ranked findings + condensed roles from
// the SHARED manuscript pipeline. Poster path is deterministic-first; the talk
// path takes LLM-ranked findings (spec §3.1). Changing shared extraction affects
// BOTH — see docs/plans/2026-07-29-paper-to-slides.md §3.1.
import { contentSlideCount, enforceSlideWordCap } from './slideBudget';
import type { Slide, SlideDeck, SpeakerNote } from './types';

export interface RankedFinding { text: string; sourceQuote: string; sourceSection: string }
export interface BuildDeckInput {
  title: string;
  authors: { name: string }[];
  durationMinutes: number;
  rankedFindings: RankedFinding[];
  gap: string;
  resolution: string;
  methodsSummary: string;
  references: string[];
  notes?: Record<string, SpeakerNote[]>; // keyed by role, optional in Phase 1
}

function gated(text: string): { assertion: string; wordCapCut: boolean } {
  const r = enforceSlideWordCap(text);
  return { assertion: r.text, wordCapCut: r.cut };
}

export function buildDeck(input: BuildDeckInput): SlideDeck {
  const slides: Slide[] = [];

  slides.push({ role: 'title', assertion: input.title, evidence: null, sourceQuote: '', speakerNotes: [], wordCapCut: false });

  const hook = gated(input.gap);
  slides.push({ role: 'hook', ...hook, evidence: null, sourceQuote: input.gap, speakerNotes: input.notes?.hook ?? [] });

  const question = gated(input.resolution);
  slides.push({ role: 'question', ...question, evidence: null, sourceQuote: input.resolution, speakerNotes: input.notes?.question ?? [] });

  const methods = gated(input.methodsSummary);
  slides.push({ role: 'methods', ...methods, evidence: null, sourceQuote: input.methodsSummary, speakerNotes: input.notes?.methods ?? [] });

  // One slide per ranked finding — expand, do not compress (genre-collapse guard).
  const budget = contentSlideCount(input.durationMinutes);
  for (const f of input.rankedFindings.slice(0, budget)) {
    const g = gated(f.text);
    slides.push({ role: 'result', assertion: g.assertion, evidence: null, sourceQuote: f.sourceQuote, speakerNotes: [], wordCapCut: g.wordCapCut });
  }

  slides.push({ role: 'references', assertion: 'References', evidence: input.references.join('\n'), sourceQuote: '', speakerNotes: [], wordCapCut: false });

  return { slides, durationMinutes: input.durationMinutes };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && npx vitest run src/manuscript/deck/__tests__/buildDeck.test.ts`
Expected: PASS (all 4).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/manuscript/deck/types.ts apps/web/src/manuscript/deck/buildDeck.ts apps/web/src/manuscript/deck/__tests__/buildDeck.test.ts
git commit -m "feat(slides): deterministic SlideDeck builder (fixed arc, one finding per slide)"
```

---

## Task 3: Talk extraction adapter (ranked findings from the pipeline)

**Files:**
- Create: `apps/web/src/manuscript/deck/extractFindings.ts`
- Test: `apps/web/src/manuscript/deck/__tests__/extractFindings.test.ts`

**Interfaces:**
- Consumes: the condense/extraction client (`manuscript/condenseClient.ts`) + `DocumentModel`.
- Produces: `extractRankedFindings(model: DocumentModel, opts): Promise<RankedFinding[]>` returning findings ordered by importance, each with a verbatim `sourceQuote` and `sourceSection`.

> Rationale: if the poster-path LLM-extraction refactor (spec §3.1) has landed, this
> thin adapter just maps its output into `RankedFinding`. If not, it wraps the
> condense client with a talk-specific extraction prompt so Phase 1 is unblocked.
> Either way, `sourceQuote` is mandatory (anti-hallucination gate).

- [ ] **Step 1: Write the failing test (mapping + sourceQuote required)**

```ts
import { describe, it, expect, vi } from 'vitest';
import { extractRankedFindings } from '../extractFindings';

describe('extractRankedFindings', () => {
  it('returns findings ordered by importance, each with a sourceQuote', async () => {
    const fakeClient = vi.fn().mockResolvedValue({
      findings: [
        { text: 'B', sourceQuote: 'quote-b', sourceSection: 'Results', rank: 2 },
        { text: 'A', sourceQuote: 'quote-a', sourceSection: 'Results', rank: 1 },
      ],
    });
    const out = await extractRankedFindings({ sections: [] } as never, { client: fakeClient });
    expect(out.map((f) => f.text)).toEqual(['A', 'B']); // sorted by rank
    expect(out.every((f) => f.sourceQuote.length > 0)).toBe(true);
  });

  it('drops any finding missing a sourceQuote (fidelity gate)', async () => {
    const fakeClient = vi.fn().mockResolvedValue({
      findings: [{ text: 'X', sourceQuote: '', sourceSection: 'Results', rank: 1 }],
    });
    const out = await extractRankedFindings({ sections: [] } as never, { client: fakeClient });
    expect(out).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run src/manuscript/deck/__tests__/extractFindings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// extractFindings.ts
import type { DocumentModel } from '../buildDocumentModel';
import type { RankedFinding } from './buildDeck';

interface RawFinding { text: string; sourceQuote: string; sourceSection: string; rank: number }
type Client = (model: DocumentModel) => Promise<{ findings: RawFinding[] }>;

export async function extractRankedFindings(
  model: DocumentModel,
  opts: { client: Client },
): Promise<RankedFinding[]> {
  const { findings } = await opts.client(model);
  return findings
    .filter((f) => f.sourceQuote.trim().length > 0) // fidelity gate — no quote, no slide
    .sort((a, b) => a.rank - b.rank)
    .map(({ text, sourceQuote, sourceSection }) => ({ text, sourceQuote, sourceSection }));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && npx vitest run src/manuscript/deck/__tests__/extractFindings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/manuscript/deck/extractFindings.ts apps/web/src/manuscript/deck/__tests__/extractFindings.test.ts
git commit -m "feat(slides): talk extraction adapter with mandatory sourceQuote fidelity gate"
```

---

## Task 4: Multi-slide PPTX writer (`deckWriter.ts`)

**Files:**
- Create: `apps/web/src/export/pptx/deckWriter.ts`
- Test: `apps/web/src/export/pptx/__tests__/deckWriter.test.ts`

**Interfaces:**
- Consumes: `SlideDeck` (Task 2), the existing `pptxgenjs` lazy-import pattern in `writer.ts`, `unitsToPoints` from `export/units.ts`.
- Produces: `exportDeckPptx(deck: SlideDeck, opts?: { pptxgen?: unknown }): Promise<Uint8Array>` — one `.pptx` slide per `Slide`, black text on white, no theme.

- [ ] **Step 1: Write the failing test (slide count + no invented media)**

```ts
import { describe, it, expect } from 'vitest';
import { exportDeckPptx } from '../deckWriter';
import type { SlideDeck } from '../../manuscript/deck/types';

const deck: SlideDeck = {
  durationMinutes: 10,
  slides: [
    { role: 'title', assertion: 'T', evidence: null, sourceQuote: '', speakerNotes: [], wordCapCut: false },
    { role: 'result', assertion: 'R', evidence: null, sourceQuote: 'q', speakerNotes: [], wordCapCut: false },
    { role: 'references', assertion: 'References', evidence: 'ref', sourceQuote: '', speakerNotes: [], wordCapCut: false },
  ],
};

describe('exportDeckPptx', () => {
  it('emits one pptx slide per deck slide', async () => {
    const bytes = await exportDeckPptx(deck);
    expect(bytes.byteLength).toBeGreaterThan(0);
    // JSZip-open the buffer and count ppt/slides/slideN.xml
    const { unzipSync } = await import('fflate');
    const files = unzipSync(bytes);
    const slideXmls = Object.keys(files).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k));
    expect(slideXmls).toHaveLength(3);
  });

  it('embeds no SVG media (raster-only guarantee)', async () => {
    const bytes = await exportDeckPptx(deck);
    const { unzipSync } = await import('fflate');
    const files = unzipSync(bytes);
    expect(Object.keys(files).some((k) => k.endsWith('.svg'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run src/export/pptx/__tests__/deckWriter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement (mirror `writer.ts`'s lazy pptxgenjs import; text boxes only)**

```ts
// deckWriter.ts
import type { SlideDeck } from '../../manuscript/deck/types';

/** Multi-slide, text-only (Phase 1) deck writer. Editable text boxes, no theme,
 *  no images → no rasterization path is reachable, so no SVG can leak in. */
export async function exportDeckPptx(
  deck: SlideDeck,
  opts?: { pptxgen?: unknown },
): Promise<Uint8Array> {
  const PptxGenJS = (opts?.pptxgen as typeof import('pptxgenjs').default) ??
    (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE';

  for (const s of deck.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    const isTitle = s.role === 'title';
    slide.addText(s.assertion, {
      x: 0.7, y: isTitle ? 3.0 : 0.6, w: 11.9, h: isTitle ? 1.5 : 1.4,
      fontFace: 'Arial', fontSize: isTitle ? 40 : 26, bold: true, color: '111111',
      align: 'left', valign: isTitle ? 'middle' : 'top',
    });
    if (s.evidence) {
      slide.addText(s.evidence, {
        x: 0.7, y: 2.2, w: 11.9, h: 4.6, fontFace: 'Arial', fontSize: 16, color: '333333', align: 'left', valign: 'top',
      });
    }
    if (s.speakerNotes.length) {
      slide.addNotes(s.speakerNotes.map((n) => `${n.text}  [${n.provenance}]`).join('\n'));
    }
  }

  const buf = (await pptx.write({ outputType: 'uint8array' })) as Uint8Array;
  return buf;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && npx vitest run src/export/pptx/__tests__/deckWriter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/export/pptx/deckWriter.ts apps/web/src/export/pptx/__tests__/deckWriter.test.ts
git commit -m "feat(export): multi-slide text-only PPTX deck writer"
```

---

## Task 5: Unify the ack mark to PNG (icon + "Made by Postr.sh")

**Files:**
- Create: `apps/web/src/export/ackMarkPng.ts`
- Modify: `apps/web/src/export/printDocument.ts` (PDF/print ack path)
- Test: `apps/web/src/export/__tests__/ackMarkPng.test.ts`

**Interfaces:**
- Produces: `ackMarkPngDataUri(): string` — a static, pre-rasterized PNG data URI of the muted icon + "Made by Postr.sh" wordmark. No SVG anywhere in the export path. (spec §6)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { ackMarkPngDataUri } from '../ackMarkPng';

describe('ackMarkPngDataUri', () => {
  it('is a PNG data URI, never SVG', () => {
    const uri = ackMarkPngDataUri();
    expect(uri.startsWith('data:image/png;base64,')).toBe(true);
    expect(uri).not.toContain('svg');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run src/export/__tests__/ackMarkPng.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Generate the PNG once (icon + wordmark, muted grey `#6b7280`) and inline it as a base64 constant. Produce the asset with the existing browser rasterizer (`export/pptx/rasterizeSvg.ts`) at build/author time, then paste the resulting base64 here as a frozen constant so the module is DOM-free.

```ts
// ackMarkPng.ts
// Frozen, pre-rasterized PNG of the acknowledgement mark (icon + "Made by
// Postr.sh"). PNG ONLY — pptxgenjs and the PDF path are raster-only; SVG throws
// (see docs/bugs/2026-07-28-pptx-export-svg-ack-mark.md). One unified mark for
// poster + slides, PDF + pptx. (spec §6)
const ACK_MARK_PNG_BASE64 = '<PASTE_BASE64_HERE>'; // generated from brand/icon-square.svg + wordmark
export function ackMarkPngDataUri(): string {
  return `data:image/png;base64,${ACK_MARK_PNG_BASE64}`;
}
```

- [ ] **Step 4: Wire the PDF/print ack path to use it**

In `printDocument.ts`, replace the SVG ack insertion with an `<img src={ackMarkPngDataUri()}>` on the acknowledgement slide/region only — never over content. Confirm no code path still references the SVG string for PDF.

- [ ] **Step 5: Run to verify it passes**

Run: `cd apps/web && npx vitest run src/export/__tests__/ackMarkPng.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/export/ackMarkPng.ts apps/web/src/export/printDocument.ts apps/web/src/export/__tests__/ackMarkPng.test.ts
git commit -m "feat(export): unified PNG acknowledgement mark for PDF/print (no SVG)"
```

---

## Task 6: Strip the 5 layout slides from the poster PPTX path

**Files:**
- Modify: `apps/web/src/export/pptx/writer.ts` (or wherever `addTemplateSlides` is called for the poster)
- Modify/keep: `apps/web/src/export/pptx/templateSlides.ts` (keep the module — the *talk* deck may reuse it later; only remove the *poster* call site)
- Test: `apps/web/src/export/__tests__/pptxTemplateSlides.test.ts` (update)

**Interfaces:**
- Produces: poster `.pptx` = poster canvas only (slide 1), no appended empty layouts, no explainer.

- [ ] **Step 1: Update the failing test to assert poster export has ONE slide**

```ts
// in pptxTemplateSlides.test.ts — adjust the poster-export assertion
it('poster export is a single slide (no appended talk-layout templates)', async () => {
  const bytes = await exportPosterPptx(makePosterFixture());
  const { unzipSync } = await import('fflate');
  const files = unzipSync(bytes);
  const slideXmls = Object.keys(files).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k));
  expect(slideXmls).toHaveLength(1);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run src/export/__tests__/pptxTemplateSlides.test.ts`
Expected: FAIL — currently emits 1 poster + explainer + 5 layouts.

- [ ] **Step 3: Remove the `addTemplateSlides(...)` call from the poster export path**

Delete the poster-side invocation only. Leave `templateSlides.ts` intact for the talk deck. Update the importer-contract comment if it references the poster path.

- [ ] **Step 4: Run to verify it passes; run the full export suite for regressions**

Run: `cd apps/web && npx vitest run src/export`
Expected: PASS — including `pptxWriter.test.ts`, `pptxMasters.test.ts`, `pptxSvgRaster.test.ts` unaffected.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/export/pptx/writer.ts apps/web/src/export/__tests__/pptxTemplateSlides.test.ts
git commit -m "refactor(export): poster PPTX no longer ships talk-layout slides"
```

---

## Task 7: Wizard step config + StepBar (foldable cards)

**Files:**
- Create: `apps/web/src/manuscript/slides/stepConfig.ts`
- Create: `apps/web/src/manuscript/slides/StepBar.tsx`
- Test: `apps/web/src/manuscript/slides/__tests__/StepBar.test.tsx`

**Interfaces:**
- Produces:
  - `export const WIZARD_STEPS = ['constraints','starFinding','figures','narrative','visualsNotes','tweaks'] as const`
  - `type StepId = typeof WIZARD_STEPS[number]`
  - `<StepBar steps activeStep onToggle inputSummary />` — foldable cards; each card shows `inputSummary[stepId]` when open; active card highlighted.

- [ ] **Step 1: Write the failing test (renders all steps, fold toggles body)**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { StepBar } from '../StepBar';
import { WIZARD_STEPS } from '../stepConfig';

describe('StepBar', () => {
  it('renders every wizard step', () => {
    render(<StepBar activeStep="narrative" onToggle={() => {}} openSteps={[]} inputSummary={{}} />);
    expect(screen.getAllByRole('button')).toHaveLength(WIZARD_STEPS.length);
  });
  it('calls onToggle with the step id when a card header is clicked', () => {
    const onToggle = vi.fn();
    render(<StepBar activeStep="constraints" onToggle={onToggle} openSteps={[]} inputSummary={{}} />);
    fireEvent.click(screen.getByText(/constraints/i));
    expect(onToggle).toHaveBeenCalledWith('constraints');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run src/manuscript/slides/__tests__/StepBar.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `stepConfig.ts` then `StepBar.tsx`**

```ts
// stepConfig.ts
export const WIZARD_STEPS = ['constraints','starFinding','figures','narrative','visualsNotes','tweaks'] as const;
export type StepId = typeof WIZARD_STEPS[number];
export const STEP_LABELS: Record<StepId, string> = {
  constraints: 'Constraints',
  starFinding: 'Star finding',
  figures: 'Figures & tables',
  narrative: 'Narrative',
  visualsNotes: 'Visuals & notes',
  tweaks: 'Tweaks',
};
```

```tsx
// StepBar.tsx — foldable cards; motion added in Task 10. transform/opacity only.
import { WIZARD_STEPS, STEP_LABELS, type StepId } from './stepConfig';

interface Props {
  activeStep: StepId;
  openSteps: StepId[];
  onToggle: (id: StepId) => void;
  inputSummary: Partial<Record<StepId, { k: string; v: string }[]>>;
}
export function StepBar({ activeStep, openSteps, onToggle, inputSummary }: Props) {
  return (
    <aside className="p2s-stepbar">
      {WIZARD_STEPS.map((id, i) => {
        const open = openSteps.includes(id);
        const active = id === activeStep;
        return (
          <div key={id} className={`p2s-step${active ? ' active' : ''}${open ? ' open' : ''}`}>
            <button type="button" className="p2s-step-h" onClick={() => onToggle(id)}>
              <span className="p2s-step-n">{i + 1}</span>
              <span className="p2s-step-t">{STEP_LABELS[id]}</span>
              <span className="p2s-step-chev" aria-hidden>▸</span>
            </button>
            {open && (
              <div className="p2s-step-b">
                {(inputSummary[id] ?? []).map((row) => (
                  <span key={row.k} className="p2s-val"><span className="p2s-k">{row.k}</span> <span className="p2s-v">{row.v}</span></span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && npx vitest run src/manuscript/slides/__tests__/StepBar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/manuscript/slides/stepConfig.ts apps/web/src/manuscript/slides/StepBar.tsx apps/web/src/manuscript/slides/__tests__/StepBar.test.tsx
git commit -m "feat(slides): foldable step-bar and wizard step config"
```

---

## Task 8: SlideViewer (read-only preview) + ExportDrawer (free/paid cards)

**Files:**
- Create: `apps/web/src/manuscript/slides/SlideViewer.tsx`
- Create: `apps/web/src/manuscript/slides/ExportDrawer.tsx`
- Test: `apps/web/src/manuscript/slides/__tests__/ExportDrawer.test.tsx`

**Interfaces:**
- Consumes: `SlideDeck` (Task 2), `exportDeckPptx` (Task 4).
- Produces:
  - `<SlideViewer deck activeIndex onSelect />` — thumbnail rail + active slide + speaker-notes strip with provenance.
  - `<ExportDrawer open onToggle deck onExportPdf onExportPptx />` — two cards; PDF free, .pptx paid (display-only offer in Phase 1); copy states polish-is-free and lists exactly what .pptx includes.

- [ ] **Step 1: Write the failing test (drawer shows both formats + honest copy)**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ExportDrawer } from '../ExportDrawer';

const deck = { durationMinutes: 10, slides: [] };
describe('ExportDrawer', () => {
  it('presents a free PDF and a paid PPTX, and states polish is free', () => {
    render(<ExportDrawer open deck={deck as never} onToggle={() => {}} onExportPdf={() => {}} onExportPptx={() => {}} />);
    expect(screen.getByText(/free/i)).toBeInTheDocument();
    expect(screen.getByText(/\.pptx/i)).toBeInTheDocument();
    expect(screen.getByText(/made by postr\.sh/i)).toBeInTheDocument();
    expect(screen.getByText(/\$18\.99|3 exports/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run src/manuscript/slides/__tests__/ExportDrawer.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement both components** (copy verbatim from the approved mockup's export drawer + viewer; motion wired in Task 10). Keep the free/paid table copy exactly as the spec §6 table.

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && npx vitest run src/manuscript/slides/__tests__/ExportDrawer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/manuscript/slides/SlideViewer.tsx apps/web/src/manuscript/slides/ExportDrawer.tsx apps/web/src/manuscript/slides/__tests__/ExportDrawer.test.tsx
git commit -m "feat(slides): slide viewer preview and free/paid export drawer"
```

---

## Task 9: SlidesWizard shell + page + route

**Files:**
- Create: `apps/web/src/manuscript/slides/SlidesWizard.tsx`
- Create: `apps/web/src/manuscript/slides/ProgressBar.tsx`
- Create: `apps/web/src/pages/PaperToSlides.tsx`
- Modify: `apps/web/src/routes.tsx`
- Test: `apps/web/src/manuscript/slides/__tests__/SlidesWizard.test.tsx`

**Interfaces:**
- Consumes: `StepBar`, `SlideViewer`, `ExportDrawer`, `ProgressBar`, `buildDeck`, `extractRankedFindings`.
- Produces: `<SlidesWizard />` orchestrating step state + deck state; `PaperToSlides` lazy page.

- [ ] **Step 1: Write the failing test (renders shell, starts on constraints)**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SlidesWizard } from '../SlidesWizard';

describe('SlidesWizard', () => {
  it('renders the step bar, progress bar, and starts on Constraints', () => {
    render(<SlidesWizard />);
    expect(screen.getByText(/constraints/i)).toBeInTheDocument();
    expect(screen.getByText(/PDF export is free/i)).toBeInTheDocument(); // the tip callout
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run src/manuscript/slides/__tests__/SlidesWizard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ProgressBar.tsx`, `SlidesWizard.tsx`, `PaperToSlides.tsx`**

Wire step state (`useState<StepId>`), open-cards state, and the deck. Include the Turn-1 tip callout ("PDF export is free. PowerPoint (.pptx) export is paid.") and the privacy line. Lazy-load the page in `routes.tsx`.

- [ ] **Step 4: Add the route + aliases in `routes.tsx`**

```tsx
const PaperToSlides = lazy(() => import('./pages/PaperToSlides'));
// ...
<Route path="/paper-to-slides" element={<PaperToSlides />} />
<Route path="/paper-to-present" element={<Navigate to="/paper-to-slides" replace />} />
<Route path="/paper-to-presentation" element={<Navigate to="/paper-to-slides" replace />} />
```

Remove the old `/paper-to-present → /paper-to-poster` redirect.

- [ ] **Step 5: Run to verify it passes; run the routing test**

Run: `cd apps/web && npx vitest run src/manuscript/slides/__tests__/SlidesWizard.test.tsx src/seo/__tests__/vercelRouting.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/manuscript/slides/SlidesWizard.tsx apps/web/src/manuscript/slides/ProgressBar.tsx apps/web/src/pages/PaperToSlides.tsx apps/web/src/routes.tsx apps/web/src/manuscript/slides/__tests__/SlidesWizard.test.tsx
git commit -m "feat(slides): wizard shell, page, and /paper-to-slides route"
```

---

## Task 10: Layer in the GSAP motion (the polish)

**Files:**
- Modify: `SlidesWizard.tsx`, `StepBar.tsx`, `ExportDrawer.tsx`, `SlideViewer.tsx`
- Use: `useWizardMotion.ts` (Task 0)
- Test: `apps/web/src/manuscript/slides/__tests__/motion.test.tsx`

**Interfaces:**
- Consumes: `useWizardMotion` (Task 0), `window.matchMedia('(prefers-reduced-motion: reduce)')`.

**Motion budget (per Emil's decision framework — animate occasional/first-time surfaces only):**
- **Step-bar card entry (first mount):** staggered fade+rise, 30–50ms stagger, `--ease-out`, 220ms. Occasional → animate.
- **Active-step change:** the newly-active card's body fades/rises in (`animateStepIn`). Occasional → animate.
- **Finding cards (star-finding step, first reveal):** stagger in, 40ms. First-time → can delight.
- **Export drawer open/close:** `playExportDrawer`, `--ease-drawer`, enter 280ms / exit 180ms (exit faster). Occasional → animate.
- **Buttons (`:active`):** `transform: scale(0.97)` via CSS, 120ms — CSS not GSAP. Feedback → animate.
- **DO NOT animate:** thumbnail selection clicks (high-frequency), text input, progress-bar fill on every keystroke (use a single transition, not per-frame JS).
- **Reduced motion:** all GSAP no-ops (Task 0 already gates); keep opacity-only fades where they aid comprehension.

- [ ] **Step 1: Write the failing test (reduced-motion path renders without gsap calls)**

```tsx
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import gsap from 'gsap';
import { SlidesWizard } from '../SlidesWizard';

describe('wizard motion', () => {
  it('skips gsap entirely under prefers-reduced-motion', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} }));
    const spy = vi.spyOn(gsap, 'fromTo');
    render(<SlidesWizard />);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run src/manuscript/slides/__tests__/motion.test.tsx`
Expected: FAIL — motion not yet wired / reduced-motion not honored.

- [ ] **Step 3: Wire `useWizardMotion` into the components**

Read `prefers-reduced-motion` once at the shell, pass into `useWizardMotion({ reducedMotion })`, scope the hook to the wizard root ref, and call `animateStepIn` on active-step change and `playExportDrawer` on drawer toggle. Stagger the step cards and finding cards on first mount. Use only `transform`/`opacity`. Button press feedback stays in CSS.

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && npx vitest run src/manuscript/slides/__tests__/motion.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify in the browser (real motion review)**

Run the dev server, open `/paper-to-slides`. Confirm: cards stagger in (no `scale(0)`), drawer opens smooth and closes faster than it opens, reduced-motion (OS setting) removes movement but keeps fades. Review the next day with fresh eyes per Emil.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/manuscript/slides/
git commit -m "feat(slides): GSAP motion — staggered cards, step transitions, export drawer"
```

---

## Task 11: Discoverability — nav, sitemap, import-manuscript entry

**Files:**
- Modify: `apps/web/src/components/PublicHeader.tsx`, `apps/web/src/components/PublicFooter.tsx`
- Modify: `apps/web/src/seo/routes.json`
- Modify: `apps/web/src/components/NewPosterButton.tsx` and/or `ImportPosterModal.tsx`
- Test: `apps/web/src/components/__tests__/toolDiscoverability.test.tsx` (extend)

**Interfaces:**
- Produces: both tools in nav/footer; `/paper-to-slides` in `routes.json`; an "Import manuscript" affordance (with the privacy notice) linking to `/paper-to-poster`.

- [ ] **Step 1: Extend the failing test (nav lists both tools)**

```tsx
it('nav lists both Paper-to-Poster and Paper-to-Slides', () => {
  render(<PublicHeader />);
  expect(screen.getByRole('link', { name: /paper.?to.?poster/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /paper.?to.?slides/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run src/components/__tests__/toolDiscoverability.test.tsx`
Expected: FAIL — Paper-to-Slides link absent.

- [ ] **Step 3: Add the nav links, the `routes.json` entry, and the import-manuscript button**

Add `/paper-to-slides` to `PublicHeader`/`PublicFooter`, to `seo/routes.json` (title/description honest — "Upcoming"/functional as appropriate, no AI framing). Add the "Import manuscript" button near new-poster creation with the privacy line: *"Your manuscript is never stored on our servers, and is never used to train AI."* linking to `/paper-to-poster`.

- [ ] **Step 4: Run to verify it passes; regenerate sitemap via build**

Run: `cd apps/web && npx vitest run src/components/__tests__/toolDiscoverability.test.tsx && npm run build`
Expected: PASS; `sitemap.xml` includes `/paper-to-slides`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ apps/web/src/seo/routes.json
git commit -m "feat(slides): nav, sitemap, and import-manuscript entry point"
```

---

## Task 12: End-to-end wiring + full-suite gate

**Files:**
- Modify: `SlidesWizard.tsx` (connect extract→build→viewer→export)
- Test: `apps/web/src/manuscript/slides/__tests__/e2e.test.tsx`

- [ ] **Step 1: Write the failing integration test (paper text → deck → export bytes)**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SlidesWizard } from '../SlidesWizard';

describe('paper-to-slides end to end', () => {
  it('builds a deck from findings and enables export', async () => {
    // stub the extraction client to return two ranked findings
    // drive: paste text → duration 10 → auto narrative confirm → deck renders → export drawer shows
    render(<SlidesWizard testHooks={{ extractClient: async () => ({ findings: [
      { text: 'Spacing +34% recall', sourceQuote: 'q1', sourceSection: 'Results', rank: 1 },
      { text: 'Held across ages', sourceQuote: 'q2', sourceSection: 'Results', rank: 2 },
    ] }) }} />);
    // ...drive the steps...
    await waitFor(() => expect(screen.getByText(/download pdf/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run src/manuscript/slides/__tests__/e2e.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Wire the pipeline** — connect `extractRankedFindings` → `buildDeck` → `SlideViewer` → `ExportDrawer` (`onExportPdf` via print flow, `onExportPptx` via `exportDeckPptx`). Add the `testHooks` prop for injectable clients.

- [ ] **Step 4: Run the FULL suite**

Run: `cd apps/web && npm test`
Expected: PASS — all new + existing tests green.

- [ ] **Step 5: Typecheck + build**

Run: `cd apps/web && npx tsc -b && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/manuscript/slides/
git commit -m "feat(slides): end-to-end paper-to-slides Phase 1 wiring"
```

---

## Self-Review

**Spec coverage (Phase 1 scope):**
- Wizard ≤6 steps, one surface → Tasks 7, 8, 9, 12 ✅
- LLM extraction + ranked findings + sourceQuote gate → Task 3 ✅
- Fixed arc, one finding per slide, ≤30-word gate → Tasks 1, 2 ✅
- Multi-slide editable PPTX, black-and-white → Task 4 ✅
- Free PDF + PNG ack mark (no SVG) → Task 5 ✅
- Poster loses layout slides; talk keeps them → Task 6 ✅
- Free/paid split honest copy (polish free; pay for .pptx) → Task 8 ✅
- GSAP motion, reduced-motion, occasional-surfaces-only → Tasks 0, 10 ✅
- Nav + sitemap + import-manuscript + privacy line → Task 11 ✅
- Reuse ledger documented in code → Task 2 comment ✅
- **Deferred (correctly, to Plans 2/3):** design pass, theme/icons/palettes, vibe prompt, slide-viewer markup/comments, design-terms crosswalk, real Stripe plumbing, GPT-image experiment. Noted in Scope section. ✅

**Placeholder scan:** `ackMarkPng.ts` has one intentional `<PASTE_BASE64_HERE>` — Task 5 Step 3 explains exactly how to generate it (existing rasterizer). Acceptable because the *procedure* is fully specified, not hand-waved.

**Type consistency:** `RankedFinding` defined in Task 2 (`buildDeck.ts`), consumed by Task 3 (`extractFindings.ts`) — same shape `{ text; sourceQuote; sourceSection }`. `SlideDeck`/`Slide` defined in Task 2 `types.ts`, consumed by Tasks 4, 8, 9. `StepId`/`WIZARD_STEPS` defined in Task 7, consumed by 8, 9, 10. Consistent.

---

## Follow-up plans (not in this plan)

- **Plan 2 — `2026-XX-paper-to-slides-design-pass.md`:** theme generation, icon slide, 4-palette slide, vibe prompt (optional + 2 recommended), GPT-image experiment (Consensus MCP inputs), applied deterministically, free to both formats.
- **Plan 3 — `2026-XX-paper-to-slides-viewer-paywall.md`:** standalone slide viewer with markup/comments, design-terms crosswalk experiment, and the real Stripe `plan`/`plan_expires_at` + credits + webhook gating the `.pptx` export.
