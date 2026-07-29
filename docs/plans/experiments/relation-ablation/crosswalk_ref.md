# Design-terms crosswalk — v1 (Phase-3 slide-viewer seed)

**Status:** RESULT of the `design-terms-crosswalk.md` experiment, run 2026-07-29.
**Purpose:** map a user's casual edit request → concrete design operations,
parameterized against the theme model Arm T produces (palette, type scale,
margins, density, accent). Seeds the Phase-3 standalone slide viewer's
edit-interpretation layer.

> **Sample & provenance (honest limits).** Built from curated, reachable
> sources — not a crawl of Postr's future users. Sources: a graphic-design
> vocabulary-for-AI-prompting guide, design-feedback "what it really means"
> articles ("make it pop", "too busy", "make it breathe"), Beautiful.ai's
> clean-design guidance, and AI-presentation-tool docs (Gamma/Beautiful.ai
> theme/layout editors). This skews slightly "designed" (docs > novice speech).
> **Validate against real Postr slide-viewer edit requests once Phase 3 ships
> and collects them.** See the source list at the bottom.

---

## How to read this

Each row: **what the user types** → **the intent** → **operations on the theme
model** (the parameters Arm T already exposes: `palette[]`, `typeScale{heading,
body,label}`, margins/whitespace, density, accent). The Phase-3 viewer applies
these deterministically where possible; ambiguous ones trigger a clarifying
question (§ "Ambiguous — ask first").

---

## The crosswalk

### Whitespace / density cluster (the most common family)

| User says | Intent | Operations |
|---|---|---|
| "more whitespace", "make it breathe", "give it room", "less cramped" | more macro spacing | increase slide margins; increase line-height (`typeScale` leading); reduce elements per slide; expand section spacing |
| "too busy", "too cluttered", "too much going on", "simplify" | reduce density | remove/merge elements; cut to one idea per slide; drop decorative shapes; increase negative space |
| "too empty", "too sparse", "fill the space" | increase density (rare, opposite) | enlarge type scale; add a supporting element; widen the content container |

### Cleanliness / restraint cluster

| User says | Intent | Operations |
|---|---|---|
| "cleaner", "tidy it up", "more polished" | alignment + discipline | snap to a consistent grid/left edge; equalize margins; remove decorative elements; strengthen hierarchy |
| "more professional", "more serious", "less casual" | restraint | lower palette saturation; remove loud colors; enforce the type hierarchy; drop any playful device |
| "calmer", "softer", "more subtle", "tone it down" | reduce visual intensity | lower saturation; shift palette cooler; reduce contrast intensity; increase whitespace; soften accent |

### Emphasis / impact cluster

| User says | Intent | Operations |
|---|---|---|
| "make it pop", "more impactful", "make it stand out", "not boring" | increase focal contrast | raise scale contrast (bigger headline vs body); strengthen accent on the focal element; increase visual weight of the primary point — NOT more color everywhere |
| "bigger headline", "emphasize the finding", "lead with X" | hierarchy | increase `typeScale.heading`; promote the target element's position/weight |
| "the number should stand out", "highlight the stat" | stat emphasis | apply the stat-emphasis device (Arm P); accent-color the number; enlarge it |

### Color cluster

| User says | Intent | Operations |
|---|---|---|
| "warmer", "cooler" | palette temperature | shift `palette` hue temperature warm/cool (Arm T regenerates or adjusts) |
| "different color", "not blue", "match my lab's colors" | palette swap | regenerate/replace `palette` (constrained to field-appropriate, legible) |
| "too colorful", "too much color" | reduce saturation | desaturate `palette`; reduce number of accent colors to one |
| "more color", "add some color" | add restrained accent | introduce one supporting color from the field-appropriate set — never rainbow |

### Typography cluster

| User says | Intent | Operations |
|---|---|---|
| "bigger text", "hard to read", "too small" | legibility | increase `typeScale.body`/`label`; check contrast against bg |
| "different font", "more modern font" | font pairing | swap to another curated pairing (constrained set) |
| "too much text", "wordy", "cut it down" | conciseness | this is a CONTENT edit, not design — route to the ≤30-word gate / re-condense, not the theme |

### Layout / structure cluster

| User says | Intent | Operations |
|---|---|---|
| "reorganize", "the flow is off", "reorder" | structure | this is a NARRATIVE edit — route to the narrative step, not the design pass |
| "put the chart on the right", "move X" | position | precise positioning — steer to a device/layout choice, not pixel-drag (Postr has no free positioning; §5 "direction not pixels") |
| "more consistent" | consistency | enforce one grid/spacing/type system across all slides |

---

## Ambiguous — ask a clarifying question first (don't guess)

Per spec §5 ("steer to design decisions, not pixel-perfect edits"), these are
under-specified; the viewer should ask before acting:

- **"modern"** — cleaner grid? bolder hierarchy? a specific palette? (article
  flags this as needing clarification)
- **"make it better" / "I don't like it"** — no operation; ask what specifically
  (the whitespace? the color? the emphasis?)
- **"make it look like [brand/deck]"** — needs a reference; ask for it
- **pixel-level requests** ("move it 8px", "make it exactly this shade") — steer
  to the design-decision level; Postr applies theme-level changes, not pixel nudges

---

## What this tells the Phase-3 viewer design

1. **Most edit requests map to ~5 intent clusters** (whitespace/density,
   cleanliness/restraint, emphasis, color, typography) — each is a small set of
   operations on the Arm-T theme model. A lookup + few-shot over these clusters
   is a viable v1, not a free-form design LLM.
2. **Some "design" requests are actually content or narrative edits** (too wordy
   → re-condense; reorder → narrative step). The viewer must **route**, not treat
   everything as a theme change.
3. **A clarifying-question flow is required** for the ambiguous cluster — this is
   the "direction not pixels" rule made concrete.
4. The operations are **parameterizable against Arm T's theme** (palette
   saturation/temperature, type scale, margins, density, accent) — confirming
   T-as-parameter-layer is the right architecture for edits too.

---

## Sources (provenance)

- [Graphic Design Vocabulary for AI Prompting — Sussex SEO](https://www.sussexseo.net/insights/graphic-design-vocabulary-for-ai-prompting/) (primary — the casual→operational table)
- ["Make it pop" meaning — Deer Designer](https://deerdesigner.com/blog/make-it-pop-what-does-it-exactly-mean-in-design/)
- ["Just make it pop" — Sookio](https://www.sookio.com/blog/just-make-it-pop-how-to-give-a-designer-useful-feedback)
- [10 Steps to Cleaner Presentation Design — Beautiful.ai](https://www.beautiful.ai/blog/10-steps-to-cleaner-presentation-design)
- [Prompt to Design Interfaces: Why Vague Prompts Fail — NN/g](https://www.nngroup.com/articles/vague-prototyping/)
- [Gamma layout customization guide](https://gamma.app/explore/content/guides/gamma-ai-presentation-tool-flexible-layout-customization-guide) + [Beautiful.ai vs Gamma](https://plusai.com/blog/beautiful-ai-vs-gamma/) (theme/layout edit vocabulary)

**Sampling bias to remember:** these sources describe how *designers and tool
docs* frame edits. Real Postr users (researchers, often design-naive) will phrase
things more loosely. This v1 is the hypothesis; the real corpus comes from
Phase-3 usage.
