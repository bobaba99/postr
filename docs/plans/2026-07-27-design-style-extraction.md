# Copy a Poster's Design

> **For Claude:** design doc. Supersedes **PRD §16 "Poster Scan (AI Style Import)"**, which
> was specified but **never implemented** — see §0. Do not build `/api/scan`; extend the
> existing import router instead.

**Goal (Gavin, 2026-07-27):** upload a poster you admire, lift its *design* — palette, type,
heading treatment, layout structure — and apply it to **your** poster. Their content never
comes across.

---

## 0. Ground truth: what actually exists

PRD §16 describes a `/api/scan` endpoint returning a `ScannedPreset`. **None of it exists.**
Verified 2026-07-27:

- `apps/api/src/app.ts` mounts exactly two routers: `createCronRouter()` and `createImportRouter()`. There is no scan route.
- No `ScannedPreset` type, no "Scan poster" string, anywhere in `apps/web/src`.
- The API's extract response contains no `palette` field.

**Also: `README.md` lists "AI-powered poster scan — upload a draft and get structured
feedback (server-proxied)" under Features.** That claim is false today and should be pulled
from the README independently of this plan — `feedback_marketing_no_ai_framing` requires
verifying every printed claim against the code, and this one fails.

### What *does* exist and is reusable

| Asset | What it gives us |
|---|---|
| `poster/paletteTools.ts` → `extractPaletteFromImage(file)` | **Client-side** palette extraction from an image. Already written, already used by the PDF import path. Free, instant, no API call |
| `apps/api/src/import.ts` → `createImportRouter` | Hardened vision endpoint: `requireAuth`, rate limit, SSRF guard, 5 MB cap, Anthropic forced tool-use. Five modes today |
| `poster/customPalettes.ts` | Named-palette persistence (localStorage) |
| `poster/colorblind.ts` | CVD safety checks |
| `poster/templates.ts` | The five layout presets a `layoutHint` must map onto |
| `import/imageImport.ts`, `pdfImport.ts` | Rasterisation + upload of an arbitrary poster file |

So this feature is **mostly assembly**, not new infrastructure. The one genuinely new piece
is a vision mode that returns *style* rather than *content*.

---

## 1. The content/style boundary — the design's spine

This is the feature's defining constraint and it needs to be enforced by the **schema**, not
by a prompt asking nicely.

> **The extractor's output schema contains no free-text field capable of carrying the
> source poster's content.**

Every field is either an enum, a number, or a hex colour:

```ts
interface ExtractedStyle {
  version: 1;
  fontFamily: CuratedFamily;              // enum: the 10 curated families ONLY
  palette: {                              // hex, clamped print-safe
    bg: string; primary: string; accent: string; accent2: string;
    muted: string; headerBg: string; headerFg: string;
  };
  typeScale: {                            // ratios, not absolute pt — see §2
    titleToBody: number; headingToBody: number; authorsToBody: number;
  };
  headingTreatment: {
    border: 'none' | 'bottom' | 'left' | 'box' | 'thick';
    fill: boolean;
    align: 'left' | 'center';
    allCaps: boolean;
  };
  layout: {
    hint: '3-col' | '2-col' | 'billboard' | 'sidebar' | 'blank';
    columnCount: number;                  // 1–4
    hasHeaderBand: boolean;
    figureDensity: 'text-heavy' | 'balanced' | 'figure-led';
  };
  confidence: number;                     // 0–1, surfaced to the user
}
```

No `title`, no `sections[]`, no `text`. **A schema that cannot express their words cannot
leak their words** — which is a stronger guarantee than any instruction, and it is trivially
testable (assert the closed schema in a unit test).

That boundary is also the right one legally and ethically, and it lands there without
needing a policy debate: a colour palette, a column count and a font choice are design
*ideas*; the abstract and the figures are the author's expression. We take the former and
have no mechanism for the latter.

One product consequence worth stating plainly in the UI: **"Copies the look, not the
content."** That is the honest description and it is also the reassuring one.

---

## 2. Why `typeScale` is ratios, not points

The tempting design returns `title: 96pt`. It is wrong.

The source poster is some unknown physical size. A 96 pt title on a 36-inch-wide poster and
a 96 pt title on a 72-inch-wide poster are completely different design decisions. Absolute
points extracted from an image we cannot measure are meaningless.

**Ratios transfer; absolutes do not.** `titleToBody: 4.0` means "the title is four times the
body" — true regardless of physical size, and directly applicable to the user's own poster
at their own dimensions. The applied absolute sizes then come from *their* poster's size and
the existing readability minimums, so an applied style **can never produce illegible type**.

This also means the extractor never has to guess the source poster's dimensions, which it
cannot reliably do.

---

## 3. Pipeline

```
 drop poster (img / PDF)
        │
        ├──► client: extractPaletteFromImage()  ──┐   free, instant, no API call
        │                                          │
        └──► rasterise + upload (temp storage)     │
                    │                              │
                    ▼                              │
        POST /api/import/extract                   │
        mode: 'extract-style'          ────────────┤
        (vision, forced tool-use)                  │
                    │                              │
                    ▼                              ▼
              ExtractedStyle  ◄── palette reconciliation (§3.1)
                    │
                    ▼
          preview: your poster, their style
                    │
             ┌──────┴──────┐
             ▼             ▼
        Apply         Save as preset
```

### 3.1 Palette reconciliation — use both sources

We get colours twice: from `extractPaletteFromImage` (deterministic pixel clustering) and
from the vision model. They disagree in useful ways.

- **Pixel clustering** is accurate about *what colours are present* but has no idea which is
  "the accent" versus a figure's incidental colour. A photo of a brain scan will dominate.
- **The model** understands *role* — which colour is the header band, which is the accent —
  but reports colour imprecisely.

**So: take roles from the model, take values from the clustering.** For each role the model
names, snap to the nearest clustered colour (CIEDE2000 in Lab, not RGB distance). Where no
cluster is within threshold, keep the model's hex. This is meaningfully better than either
alone and costs nothing extra.

Then run the result through `colorblind.ts` and clamp print-safe (no pure black background,
no neon) exactly as PRD §16 specified.

### 3.2 New API mode

Add `'extract-style'` to the existing `mode` enum in `import.ts:34`. **Do not create
`/api/scan`.** The import router already carries auth, rate limiting, the SSRF guard, the
size cap and the Anthropic tool-use plumbing; a second endpoint means a second copy of all of
it and a second thing to get wrong.

Rate limiting: same `dailyLimit` middleware. PRD's 10 scans/day for free users is a
reasonable starting cap.

Temp images: auto-delete after 24 h if not saved, per PRD §16. That cron already exists in
shape (`cron.ts` cleans anonymous users) and should gain this job.

---

## 4. UX

**Entry:** Style tab → **"Copy a design"**. (Not "Scan poster" — that name describes the
mechanism; this one describes the job.)

**The screen after extraction is a live before/after of *the user's own poster*.** Not a
report about the uploaded one. Left: their poster now. Right: their poster with the extracted
style applied. A row of toggles lets them take it piecemeal:

```
  ☑ Colours    ☑ Fonts    ☑ Heading style    ☐ Layout
```

Layout is **off by default** — it is the most disruptive (it moves their blocks) and the
least reliably extracted. Colours and fonts are the 80% case and are safely reversible.

**Apply is a single undoable store mutation** (`withUndo`), so the escape hatch is ⌘Z, and no
confirmation dialog is needed.

**Confidence is surfaced**, not hidden: below ~0.5, lead with "We weren't sure about this
one" and pre-select only Colours.

---

## 5. Error handling

Per `feedback_user_facing_errors` — never raw error text; generic message plus Send Feedback.

| Case | Behaviour |
|---|---|
| Unreadable / not a poster | "That doesn't look like a poster — try a photo or PDF of the whole thing." Not an error dialog |
| Vision call fails | Generic message + Send Feedback. **Palette still works** — the client-side extraction already ran, so offer colours-only rather than nothing |
| Palette fails CVD check | Apply anyway, but surface the existing colourblind warning inline |
| Rate limit hit | Say when it resets |
| Font not in the curated ten | Impossible by construction (enum), but assert it server-side and fall back to the current family |

---

## 6. Testing

- **Schema closure test** — assert `ExtractedStyle` rejects any additional properties, and that no field accepts free text. This is the §1 guarantee; it must be a test, not a convention.
- **Ratio maths** — `typeScale` → absolute pt at several poster sizes, asserting the result never lands under the readability minimums.
- **Palette reconciliation** — role/value merge with synthetic inputs; CIEDE2000 snapping thresholds.
- **API** — `extract-style` request validation, response schema, enum enforcement, with Anthropic mocked.
- **Component** — toggle matrix applies exactly the selected subsets; apply is a single undo step.

## 7. Phasing

| Phase | Ships |
|---|---|
| **1** | Colours + fonts only. Client-side palette extraction + `extract-style` vision mode for roles; before/after preview; apply/undo. **No layout.** |
| **2** | Heading treatment + type scale ratios |
| **3** | Layout hint → template application (opt-in, off by default) |
| **4** | Save as a named preset in the `presets` table (`source: 'scanned'`), reusable across posters |

Phase 1 is genuinely small — most of it exists — and it delivers most of the value, because
palette and font are what make a poster *look* like the one you admired.

## 8. Open questions

1. **Does this need the vision call at all in Phase 1?** `extractPaletteFromImage` is client-side and free. A colours-only v0 could ship with **zero API cost and no rate limit**, which is a genuinely attractive standalone tool page (same argument as the chart chooser). The model only earns its keep once we want *roles* and heading treatment.
2. **Preset sharing** — presets are per-user today. Worth making extracted styles shareable later, or does that recreate the gallery moderation problem you just froze?
3. **README fix** — the false "AI-powered poster scan" feature claim should come out now. Want that folded into the fixes batch rather than waiting for this feature to ship?
