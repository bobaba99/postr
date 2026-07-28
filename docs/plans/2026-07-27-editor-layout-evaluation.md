# Should Postr's editor mimic Canva/PowerPoint?

**Date:** 2026-07-27
**Question:** Restructure the 11-tab editor to lower the learning curve for new users?

---

## Verdict

**Partial — and the partial is small.** Do not restructure the editor. Do spend
**8–10 days** on three surgical changes: extend the floating toolbar that already exists to
fire on block selection, group the eleven tabs into four labelled clusters, and extract
`editorMode` out of `sidebarTab`. Reject the ribbon/Canva rewrite (4–8 weeks) outright.

The reason is not that mimicry is a bad idea. It is that the evidence says interface
unfamiliarity is **not** the thing standing between a psych grad student and a finished poster.
The measured deficit is design judgement and print correctness. A chrome rewrite transfers
neither. It costs weeks and its benefit is unmeasurable at zero traffic.

One caveat stated up front: with no analytics and no users, nothing below is a measurement of
Postr. It is a measurement of the codebase plus published research about poster-makers in
general. See [Honesty](#honesty-what-this-document-cannot-tell-you).

---

## Side-by-side: where Postr's tabs would live in Canva and PowerPoint

The count is not the problem. PowerPoint has ~11 persistent tabs too. The problem is that
Postr's rail mixes **three incompatible organizing axes** in one list.

| Postr tab | Axis | Canva equivalent | PowerPoint equivalent | Verdict |
|---|---|---|---|---|
| `layout` | document structure | Design / Templates rail item | Design tab | Natural fit. Keep persistent. |
| `insert` | content insertion | Elements / Text / Uploads rail | Insert tab | Natural fit. This is the *only* Postr tab that matches Canva's rail rule literally. |
| `style` | document properties | page-level strip (nothing selected) | Design tab + Format Background pane | Fits, but as the **empty-selection state** of a contextual surface, not a separate tab. |
| `edit` (edit block) | **object property** | floating toolbar above selected element | contextual ribbon tab (Shape/Picture Format) + Format Task Pane | **Misplaced.** No reference product requires navigating persistent chrome to reach the properties of a thing you just clicked. |
| `authors` | document data | — | — | **No equivalent.** Academic-specific. |
| `refs` (references) | document data | — | — | **No equivalent.** BibTeX is not a thing either competitor has. |
| `check` (figure) | document health | — | — | **No equivalent.** Print-legibility checking is Postr-only. |
| `issues` | document health | — | Review tab (spell-check) — loosely | **Weak equivalent.** Review is the closest analogue but does far less. |
| `comments` | collaboration | comment thread panel | Review tab | Fits. Keep persistent. |
| `versions` | document lifecycle | Version history (buried in File menu) | File → Version History | **Weak equivalent.** Both hide it; Postr promotes it. That is a defensible difference. |
| `export` | output | Share / Download button | File tab | Fits, though both competitors use a button, not a tab. |

**Read the table honestly.** Four of eleven tabs — `authors`, `refs`, `check`, `versions` —
have no home in Canva's or PowerPoint's conventions **because they are the differentiators**.
Neither competitor structures authors and affiliations, neither parses BibTeX, and neither
checks whether your figure will be readable at six feet. Any restructure that forces Postr's
rail into a Canva shape has to either delete these or bury them, and both are losses.

### The one structural rule all four references share

Figma (expert), PowerPoint (mass), Canva (novice), and Slides all partition the same way:

- **Persistent chrome** = insertion + document navigation + document health
- **Contextual surface** = object properties, auto-appearing on selection
- **Empty-selection fallback** = document-level properties, not blankness

Convergence across the whole skill spectrum is the strongest available signal, because it
means the pattern is not an artifact of one audience's expertise. Postr violates exactly one
part of it: `edit` and `style` are object-property surfaces living in persistent navigation.

Two secondary observations:

- **Slides is the failure mode to avoid.** Its Format-options panel requires an explicit open
  click, and the recurring complaint is users never discovering opacity or drop shadow. If
  Postr adds a contextual surface, it must **auto-appear on selection**, not require a click.
- **The 484px permanently-expanded panel is an outlier on its own.** Canva's rail is ~70px at
  rest with hover-preview and click-to-pin. Figma's sidebar is resizable and collapsible.
  PowerPoint's Format pane can be closed, moved, or detached to a second display. Nobody keeps
  a wide panel permanently open. For 48×36in posters, canvas is the scarcest resource.

---

## The strongest argument AGAINST restructuring

**The measured deficit is design training, not tool operation. Rebuilding the chrome transfers
zero design judgement.**

This is the finding that matters most, and it should not be softened.

- **Frontiers in Bioinformatics (2023)**, n=90 survey across 26 countries + 23 interviews:
  only **2 of 90** respondents had any training in graphical presentation of data or
  information design. Among the 23 interviewees, **zero** had any training in graphic design
  or poster preparation, at any point in their education.
- **67% received no feedback at all** on their poster before presenting it. Only 5% got
  thorough feedback from all authors.
- **Danish Cancer Research Conference 2024**, 103 posters, 2–4 independent raters each: the
  #BetterPoster format outscored classic IMRAD on first impression (32.5 vs 25.7,
  p = 1.6e-06) — but the authors' own conclusion was that **both formats reached high
  scores**, and that "mindful poster layout is essential." Format was not the deciding
  variable. Execution was.
- **Interface unfamiliarity is absent from the complaint corpus.** Across the Frontiers
  survey, a 2025 systematic review (3,570 articles screened, 439 included), Faulkes's Better
  Posters catalogue, and Cheung's critique — no source frames the problem as interface
  learnability. The recurring complaints are tiny text, wordiness, blurry images, logo
  swarms, chaotic colour, and print output. The one tool complaint is a learning-*cost*
  complaint ("I lacked time to learn vector software"), not a learnability one.

Three supporting arguments that independently weaken the redesign case:

**The theory backing it is folklore.** Jakob's Law has no controlled experiment behind it — it
is a 2000 Nielsen assertion, and the citation trail loops back on itself. The strongest
familiarity evidence (Google's prototypicality work) measures **beauty ratings at 17–50ms**,
not task time or error rate, and is routinely miscited as performance evidence. It is not.

**Hick's law argues the opposite of what people think.** Liu et al., CHI 2020, state
explicitly that Hick's law "speaks against, not for, the popular principle that less is
better." Their worked 32-item proof: showing all at once costs `a+5b`; splitting into four
*categorized* pages costs `2a+5b` — strictly worse by one fixed `a`. If any reviewer argues
"eleven tabs violates Hick's law," that is a citation error. Reject it.

**Depth is what the menu literature penalizes, not breadth.** Landauer & Nachbar (CHI 1985):
broad menus of 64 items can beat two levels of 8. Eleven flat, always-visible tabs is on the
*right* side of this literature. Do not nest them, and do not hide them behind a hamburger.

**Negative transfer is the specific risk of half-mimicry.** Superficial resemblance with
different behavior produces *higher* error rates than no prior experience at all — this is
well established in learning research and is a named root cause of use error in FDA human
factors guidance. Postr's canvas looking like Canva while behaving by print rules (300 DPI,
physical legibility, structured authors) is the highest-error configuration available.
Schumacher & Gentner: surface similarity and conceptual model affect transfer *independently*.
Copying Canva's look without Canva's model gets the weaker half and buys the risk.

**Time budget.** Poster preparation is a 2–3 working day job, roughly half of it on layout,
colour, and text arrangement. Reducing eleven tabs to six saves seconds. Automating layout
saves hours. Any UI change must cut into that day-and-a-half of fiddling to be worth a week.

---

## The strongest argument FOR it

**Postr's audience is almost pure novices on a one-off task — the one population where
learning-by-analogy is defensible — and Postr taxes the most frequent interaction in the
product.**

Stated as fairly as I can:

**Grudin's own concession.** Grudin's 1989 CACM critique is the canonical case *against*
consistency-by-analogy: it helps initial learning and hurts subsequent performance. But his
worked alphabetic-keyboard example shows complete novices genuinely *do* perform better on the
familiar-by-analogy layout. Postr's users are first-or-second-poster makers on a conference
deadline. Most will never reach expert use. That is precisely Grudin's novice case. Mimicry
is defensible here — but on **novice-onboarding** grounds, not on "consistency is good design."

**The mode-switch tax is real and frequency-multiplied.** In all four reference products,
selecting an object is *sufficient* to reach its properties. In Postr, selecting is necessary
but not sufficient — you must also be on the right one of eleven tabs. A user clicking a
figure to enlarge it may be sitting on `refs` or `check`. Object selection happens hundreds of
times per poster; insertion happens a handful. **Postr has optimized its permanent chrome for
the rare action and taxed the common one.**

**The one empirical result that cuts against Postr's current rail.** Darejeh & Singh (2014,
*Computer Standards & Interfaces*) found the Ribbon has serious usability problems
specifically for users with **low computer literacy** — the cohort closest to Postr's
non-CS, non-design-savvy target. A dense, tab-partitioned, command-rich rail is exactly the
pattern that cohort struggled with. Note carefully what this argues: the risk is **density
and predictability**, not insufficient Canva-mimicry. Fixing it does not require looking like
Canva.

**Uncategorized splitting is the proven-harmful case, and Postr has some.** Liu et al. prove
splitting helps *if and only if* the categories are genuinely exclusive and predictable. Ask a
psych postdoc where to change a heading's size: `layout`? `style`? `edit`? `insert`? There is
no principled way to predict. That is the harmful case, and it is a relabeling problem
measured in hours.

**Familiarity buys first-impression survival, which matters at zero traffic.** The
prototypicality research is real for what it measures: aesthetic judgement in the first 50ms.
For an unknown tool competing against the advisor-endorsed PowerPoint default, looking
legitimate in the first half-second has value. But spend that familiarity budget on the
**landing page and first-run screen** — where the judgement is aesthetic — not on the editor
rail, where the task is work.

---

## Ranked changes, cheapest first

Effort bands are derived from measured code structure, not estimates-by-feel.

### 1. Rename and regroup the eleven tabs — **1–3 days**

The tab rail is a single array literal at `Sidebar.tsx:605–632`; content dispatch is eleven
flat `{tab === 'x' && ...}` blocks at `667–806`. Sidebar.tsx is 4,263 lines but is a **pure
presentational component driven by ~60 props** — zero store imports for tab state. Reordering,
renaming, and grouping is a change to two array literals plus a wrapper.

Natural clusters: **Design** (layout, style) · **Content** (authors, insert, edit block,
references) · **Review** (figure, issues, comments) · **Output** (versions, export).

- **Buys:** attacks the one thing the evidence actually supports — unpredictable categories.
  Keeps all eleven flat and visible, so nothing regresses by removal.
- **Risks:** near zero. Purely presentational. Worst case is that the grouping is also
  unpredictable, which is another array edit away from fixed.
- **Do not** nest, collapse, or hide anything. Breadth wins; depth is what the literature
  penalizes.

### 2. Extract `editorMode` out of `sidebarTab` — **~2 days**

**This is the highest-priority item on the list and it is not a redesign.** `sidebarTab` is
load-bearing *editor mode* state, not chrome state. `PosterEditor.tsx` branches on it in ten
distinct behaviours across 14 references:

| Line | Behaviour |
|---|---|
| 698 | readOnly pins the comments tab |
| 763 | entering comments clears block selection |
| 866 | `commentMode` drives a MutationObserver flipping every canvas `contenteditable` to `"false"` |
| 2071 | keyboard delete/nudge early-returns in comment mode |
| 2254 | `data-comment-mode` attribute on canvas |
| 2637 | canvas pointerdown early-return |
| 3051, 3064 | block onClick / onPointerDown suppressed |
| 3105 | `sidebarTab === 'check'` gates the draggable figure-size overlay |

These are guard clauses. Remove the condition, remove the guard. A restructure that dissolves
tabs silently makes **the read-only share viewer editable** and **keyboard delete live during
review**.

- **Buys:** removes the single biggest regression hazard in any future chrome work; makes the
  read-only viewer's safety explicit rather than incidental.
- **Risks:** touching the comment-mode MutationObserver, which reaches directly into canvas
  DOM. Test the share viewer manually — there is no automated coverage (see below).
- **Worth doing on its own merits regardless of any redesign.**

### 3. Extend the floating toolbar to block selection — **~1 week for a good first cut**

`FloatingFormatToolbar.tsx` (476 lines) is **roughly 70% of the way there already**: portal to
`document.body`, viewport clamping with flip-below, position transition, mount animation,
`onMouseDown` + `preventDefault` to preserve selection, and a full button set. It already
mounts on the canvas at `blocks.tsx:2537`. The file already exports the content/positioning
split needed for reuse (`FormatToolbarButtons`, `DockedFormatToolbar`, `FloatingFormatToolbar`).

The gap is narrow and precisely identifiable: the toolbar hangs off **text** selection
(`SelectionInfo` = a DOMRect + 4 format booleans from `RichTextEditor`), not **block**
selection. Block selection state already exists (`PosterEditor.tsx:611–613`,
`selectedIds: Set<string>`), and `EditTab` (`Sidebar.tsx:2702`) already holds the per-type
property surface a block toolbar would show. What's genuinely new: a viewport-coordinate rect
for the selected block, plus a per-type button row reusing EditTab's existing handlers.

- **Buys:** the actual familiarity complaint. A PowerPoint/Canva user expects formatting
  controls next to the thing they clicked. This delivers exactly that, additively.
- **Risks:** `document.execCommand`, which the codebase's own header comment calls
  "deprecated but still the shortest path," and which has already broken once
  (`fix(editor): unbreak bullet/number lists`). The font-size bump already needs a fallback
  because `range.surroundContents` throws across element boundaries.
- **Mitigation — scope it deliberately.** Restrict the block toolbar to **block-level
  properties** (size, position, fit, caption, lock, alignment) routed through Postr's typed
  `onUpdateBlock` patches. Do **not** pile more inline-text commands onto execCommand. This
  makes it both cheaper and more robust.
- Auto-appear on selection. Do not require a click (the Slides failure mode).
- Empty selection → show poster-level style, which is most of what the `style` tab does today.
  That single rule lets two tabs become one surface with no feature loss.

### 4. Make the sidebar dismissible / hover-preview — **1–2 days**

Independent of everything above. Nobody keeps a 484px panel permanently open. Canvas is the
scarcest resource for a 48×36in poster.

- **Buys:** 484px of canvas immediately. Highest ratio of canvas gained to hours spent.
- **Risks:** panel content assumes ~360px width (stated explicitly at `Sidebar.tsx:~195`) —
  so collapse it, don't reflow it. Collapsing is safe; reflowing is where the cost lives.

### 5. Deepen `check` / `issues` into real poster feedback — **not costed here, but this is the real win**

Every threshold below is machine-checkable against Postr's document model, and Postr already
has the two tabs to surface them:

- body text below 24pt → warn (title 72–120pt, headings 36–72pt, body 24–48pt are the
  recurring institutional conventions; readable at 4–6 feet)
- total word count above ~800 → warn (300–800 typical; wordiness is called the number-one
  first-timer mistake)
- effective print resolution under 300 DPI at physical size → warn
- white-space ratio below ~40% → advisory

This substitutes for the feedback **67% of poster-makers never receive**, and attacks the
deficit the Frontiers survey actually measured. Caveat: these thresholds are conventions, not
empirically derived cutoffs. Ship them as **advisory warnings with visible rationale and an
easy dismiss** — never hard blocks.

Also unclosed and genuinely acute: **CMYK handling, font embedding, and bleed on export**.
Those are the documented reasons a print shop rejects a file. A student whose file bounces the
night before the conference is the sharpest pain in this space, and it is Postr's territory,
not Canva's.

---

## The cheap subset

**Items 1 + 2 + 3 — roughly 8–10 working days — capture most of the familiarity benefit for
about 15% of the full-restructure cost.**

They are additive, need no migration, keep every existing tab reachable, and directly target
the one complaint the evidence supports: formatting controls should appear next to the thing
you clicked.

If the week has to be cut further, **do item 2 alone**. It is not a UX change; it is a latent
bug in the read-only share viewer waiting for a user to find.

---

## Kill list

**Do not build a ribbon or a Canva-shaped restructure. 4–8 weeks, and it is the only option
that touches PosterEditor's interaction core.** Every tab's internals assume a ~360px panel
width — stated in code at `Sidebar.tsx:~195` ("Panel content width stays 360 so SmartTextarea
/ TableEditor / RichTextEditor layouts don't need to reflow"). Moving them into a horizontal
ribbon means reworking TableEditor (~337 lines), AuthorManager (~346), RefsTab (~310),
StyleTab (~322). It costs more than the entire manuscript-to-presentation plan, and it buys an
unmeasurable benefit at zero traffic.

**Do not consolidate eleven tabs into a nested structure or a hamburger.** Each nesting level
adds a fixed cost (CHI 2020), and depth is what the menu literature penalizes. Breadth with
predictable labels is the supported configuration.

**Do not delete or bury `authors`, `refs`, `check`, `issues`, `versions`.** These have no
Canva/PowerPoint equivalent because they *are* the product. All four reference products keep
document-health and document-data concerns in permanent chrome (PowerPoint's Review, Figma's
notification rail, Canva's Brand Kit). Postr is doing the right thing here.

**Do not make the canvas look like Canva while it behaves by print rules.** That is the
negative-transfer configuration: superficial resemblance, different behavior, error rates
worse than no prior experience. Make print-correctness surfaces look **deliberately
different**.

**Do not build a large template gallery as a differentiator.** The Danish conference study
found format was not the deciding variable — execution was. Templates do not rescue a poster.

**Do not cite Jakob's Law, Hick's law, or the Office Ribbon rollout as justification for
anything.** Jakob's Law has no experiment behind it. Hick's law argues the opposite of the
common reading. Microsoft's "learned with virtually no training" claim is an ~8-month
qualitative field study with **no control arm, no sample size, no task times, no error rates**.
Treat the Ribbon as a story, not a study — in *either* direction.

**Do not do a chrome restructure without tests, and there are none.** 88 test files in the
repo; **zero** cover `Sidebar.tsx` or `PosterEditor.tsx`, the two files a redesign touches
most. No `*.spec.ts` anywhere, no e2e directory. Every regression named above gets found by a
user — and at zero traffic, that user is you, weeks later. This independently inflates the
true cost of the ribbon beyond 4–8 weeks, and independently argues for **additive** changes
(a toolbar that adds a surface) over **subtractive** ones (a ribbon that removes the rail).

---

## Honesty: what this document cannot tell you

**Postr has zero traffic and zero analytics, by standing decision. "Measure it in production"
is not available.** No A/B test, no funnel, no session recording, no click heatmap. That
constraint is not going away and it should be treated as fixed for this decision.

### What is evidence

- **Code structure and effort bands** — measured. Line counts, prop counts, the fourteen
  `sidebarTab` references, the absent test coverage. Verifiable by reading the files.
- **What Canva/PowerPoint/Figma/Slides actually do** — documented in vendor sources. The
  four-product convergence on the persistent/contextual partition is solid.
- **The design-training deficit (2/90 trained, 67% no feedback)** — measured survey, though
  self-report, life-sciences sample, adjacent to but not identical with psych/medicine.
- **Format is not the deciding variable (Danish study)** — rated outcomes, independent raters,
  observational not randomised.
- **Hick's law misreading, Landauer & Nachbar breadth-over-depth, negative transfer,
  Carroll & Carrithers training wheels** — published, controlled where stated.

### What is judgement, not evidence

- **That a contextual toolbar would help Postr's users.** This is design-precedent reasoning
  from four products' documented behavior. **No usability study, task-time measurement, or
  A/B result was found comparing contextual toolbars against persistent property panels.** The
  mode-switch cost argument is structural inference. It is not measured on anyone, least of
  all on Postr's users.
- **That Postr's specific tab labels are unpredictable to a psychologist.** Plausible.
  Untested. Nobody has watched a psychologist try.
- **The 8–10 day and 4–8 week estimates.** Grounded in measured line counts and explicit
  in-code width assumptions, but still estimates.
- **The opportunity-cost ranking** (SEO > mobile share view > cheap subset > presentation
  generator > paid tier > ribbon). Judgement, grounded in the measured absence of data.
- **The 24pt / 800-word / 40% white-space thresholds.** Conventions repeated across
  institutional guidance, not empirically derived optima.

### The absence-of-evidence caveat, stated plainly

The poster-making corpus is about PowerPoint and Illustrator. It establishes that "looks
unfamiliar" is not the field's known pain. **It does not rule out that Postr's specific
eleven-tab layout has usability problems of its own.** Absence of complaints about a tool
nobody has used yet is not evidence of that tool's usability.

### The cheapest way to get real evidence

**Watch three to five psychology or medicine grad students make a poster in Postr. Moderated,
in person or over a screen share, one hour each.** Give them their own data and a real
deadline if possible. Say nothing; watch where they stall.

Five sessions would generate more decision-relevant evidence than any further desk research,
cost nothing but a day of your time, and would likely cost less than the redesign it prevents.
It is also the *only* mechanism available given the no-analytics constraint — there is no
production instrumentation path, now or later, under the current decision.

Three specific things to watch for, each of which would falsify or confirm a claim above:

1. **Do they hunt for tabs after selecting a block?** Confirms or kills the mode-switch
   argument — the entire case for item 3.
2. **Do they ask "where do I change the size of this heading?"** Confirms or kills the
   unpredictable-category argument — the case for item 1.
3. **Do they ever mention that it doesn't look like Canva?** If nobody does in five sessions,
   the owner's hypothesis is dead and the eleven-tab rail is fine as-is.

Run the sessions before spending the week, if a week can wait. If it cannot, items 1–3 are
additive and low-risk enough to ship regardless — none of them removes anything, so the
sessions stay valid afterward.
