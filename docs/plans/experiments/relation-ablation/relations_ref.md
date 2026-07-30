# Arm P component-relations doc — v1

**Status:** Companion to `crosswalk.md`. Grounded in the real Arm P styled-deck
output (`design-pass/out/SS1_armP_styled.json`, run 2026-07-29).
**Purpose:** give the Phase-3 slide-viewer a spatial + relational model of a
slide's components, so a vague spatial edit ("[example redacted], into the
center", "[example redacted]") resolves to concrete component operations —
**looked up here, then combined with the crosswalk lookup + few-shot.**

> **The flow this enables:** user says *"[example redacted]"* →
> viewer identifies which component "the text" is (§ Component vocabulary + the
> "dominant text" rule) → reads its current anchor zone and its relationships
> (§ Relations) → applies the spatial op **while respecting the relationships**
> (if the title moves down, the quote-block anchored below it must move too, or
> they collide). No graph engine needed — this markdown + a lookup is enough.

---

## The coordinate model (how zones are named)

A slide is **13.33 × 7.5 inches** (PPTX widescreen). Zones for resolving vague
spatial language:

```
            left (x<4.4)    center (4.4–8.9)   right (x>8.9)
 top   (y<2.5)   top-left       top-center       top-right
 middle(2.5–5)   middle-left    middle-center    middle-right
 bottom(y>5)     bottom-left    bottom-center    bottom-right
```

"lower" = increase y toward bottom. "higher" = decrease y. "center it" =
move x toward the center band and/or set horizontal alignment center. "left/right"
= change x band. These are the atomic spatial ops.

---

## Component vocabulary (Arm P's real components + their roles)

| Component | Role | Typical anchor | Movable? |
|---|---|---|---|
| `background` | slide fill | full slide | no (it IS the slide) |
| `section-label` | eyebrow / context tag | top-left | rarely (structural) |
| `title` | the assertion headline | top-left, large type | **yes — the primary "the text"** |
| `body` | supporting sentence | middle-left | yes |
| `quote-block` | a pulled statement w/ rule | middle | yes |
| `quote-rule` / `accent-line` | a short accent stroke | beside its text | moves WITH its text |
| `callout-box` | a tinted evidence box | middle-lower | yes (carries its children) |
| `callout-label` / `callout-text` | text INSIDE the callout | inside callout-box | move WITH the box |
| `progress-track` / `progress-fill` | the talk-arc bar | bottom, full width | rarely (structural) |
| `progress-label` (×3) | stage labels under the bar | aligned under the track | move WITH the track |
| `footer` | small note | bottom-left | rarely |
| `slide-number` | page number | bottom-right | rarely (structural) |
| `accent-dot` | small mark | beside footer | moves WITH footer |

**"The text" disambiguation rule** (when the user doesn't name a component):
resolve to the **dominant text component** on the slide, in priority order —
`title` > `body`/`quote-block` > `callout-text`. Structural bits (section-label,
footer, slide-number, progress bar) are never "the text" unless named.

---

## Relations (what moves with what — the collision/spacing model)

These are the relationships that make a vague spatial edit safe:

### Bound pairs (child moves with parent — always)
- `callout-box` ⊃ `callout-label`, `callout-text` — moving the box moves its text.
- `progress-track` ⊃ `progress-fill`, `progress-label`×3 — one unit.
- `title`/`quote-block`/`body` → its adjacent `rule`/`accent-line` — the stroke
  hugs the text and follows it.
- `footer` → `accent-dot` — the dot marks the footer.

### Vertical stack order (top→bottom reading flow — spacing lives here)
```
section-label  →  title  →  (body | quote-block | callout-box)  →  progress-bar/footer
```
This ordered stack is where **"too close" / "too much space" / "move lower"**
operate. Rules:
- Moving a component down must not overlap the one below it — **push the stack**
  or **reduce the gap consumed**, don't collide.
- **"[example redacted]"** → identify the adjacent pair in the stack, then
  increase the vertical gap between them (this is the whitespace crosswalk op,
  applied to a *specific pair* rather than the whole slide).
- **"too much space between X and Y"** → decrease that specific gap.

### Alignment groups (share an edge — keep consistent)
- `section-label`, `title`, `body`, `footer` all share the **left margin
  (x≈0.72)**. Moving one horizontally without the others breaks the alignment
  group — so "move the title right" should either move the whole left-aligned
  group or be flagged as an alignment change (the crosswalk's "more consistent"
  intent).
- `progress-label`×3 are **evenly distributed** under the track — keep them
  distributed if the track moves.

---

## How the viewer uses this (the combined flow)

For a spatial/relational edit request:
1. **Component-relations lookup (this doc):** resolve "the text"/"these two" to
   real components; read their zones + relationships.
2. **Crosswalk lookup (`crosswalk.md`):** map the *quality* words ("too close",
   "cleaner", "more room") to the operation family (whitespace, alignment…).
3. **Few-shot:** the LLM composes the specific move from (1)+(2), constrained to
   the spatial ops + the relation rules (so it never collides bound pairs or
   breaks alignment groups).
4. **Ambiguity guard:** if the target component or the intended group can't be
   resolved safely (e.g. "the text" when two texts are equally dominant, or a
   move that would collide), **ask a clarifying question** — the "direction not
   pixels" rule.

This keeps the edit interpretation **deterministic where the geometry allows**
and only invokes the model to compose, not to invent positions.

---

## Caveats / to validate in Phase 3

- Grounded in **one deck's** Arm-P output (SS1). Other devices/decks will add
  components (charts, images, multi-column) — extend the vocabulary + relations
  as they appear.
- Assumes Arm P keeps emitting **named components with coordinates** (it does) —
  this doc is only usable because the design is *structured data, not an image*.
  (Another reason Arm P + Arm T beat an image-based design pass for editability.)
- Real spatial phrasing from users may be looser than these examples; refine
  against Phase-3 usage alongside the crosswalk.
