---
name: ux-persona-check
description: Generate realistic user personas from a PRD (or equivalent product document), then run UI/UX flow checks against a running app using chrome-devtools-mcp, reporting pass/fail per persona. Use when the user asks to "test the UX", "check how real users would use this", "run persona-based UI checks", or after significant UI changes. Requires a PRD-like document and a running dev server.
---

# UX Persona Check

Turn a product document into actionable user personas, then drive a live app through each persona's motivations to find friction points a single-developer can't easily spot alone.

## When to invoke

- User asks "can you check this UI from a user's perspective"
- User asks "generate personas from my PRD" or "create test personas"
- User asks to validate a flow before shipping
- After a large UI refactor where the developer wants a fresh pair of eyes
- Before a release checkpoint

## What you need

1. **A PRD or equivalent** — a markdown/text document that describes:
   - Target users (even vaguely)
   - Core features and capabilities
   - Any friction / UX principles
2. **A running app** — usually on `http://localhost:5173` or similar
3. **chrome-devtools-mcp installed** — tools prefixed `mcp__plugin_chrome-devtools-mcp_chrome-devtools__*` are available

If any of these are missing, **stop and ask the user** rather than guessing.

## Workflow

### Phase 1 — Read the PRD

Read the PRD file in full. Extract:

- **Who is the target user?** Look for sections like "Overview", "Target Users", "Audience".
- **What are they trying to do?** Look at the feature list and the problem statement.
- **What friction does the PRD explicitly avoid?** Look for phrases like "zero friction", "no signup", "constraint as feature", etc. These become test assertions.
- **What's in scope vs out of scope?** Don't test personas against features that are marked "future work".

### Phase 2 — Generate personas

Write 3–6 personas to `docs/personas/<product>-personas.md` (create the `docs/personas` directory if absent). Each persona **must** have:

- **Name + 1-line bio** — realistic, specific, not archetypal
- **Job-to-be-done** — one sentence, concrete
- **Motivations** — 3–5 bullet points
- **Frustrations / anti-patterns** — what would make them bounce
- **Visual / style preferences** — relate to actual features in the PRD
- **Concrete test flow** — a numbered list of chrome-devtools-mcp actions that validate whether the app serves this persona well

**Persona diversity checklist:**

- Technical comfort range (novice → expert)
- Screen sizes (mobile, laptop, large desktop)
- Time pressure (minutes vs hours)
- Institutional constraints (hospital locked-down laptop, no-install, etc.)
- Visual taste range (conservative vs bold)
- Domain variety (if the app crosses multiple fields)

If the PRD gives specific target users, cover each. If it's vague, invent plausible ones grounded in the feature set.

**Red flags in generated personas:**

- Generic names like "Power User" or "Casual User" → replace with realistic names + backgrounds
- Test flows that just click every button → redo as persona-motivated flows
- Frustrations copy-pasted between personas → differentiate

### Phase 3 — Run the checks

For each persona, execute the test flow via chrome-devtools-mcp:

1. `list_pages` — confirm the dev server tab exists, or `navigate_page` to open one
2. `navigate_page` to the entry URL (usually `/`)
3. `take_snapshot` for initial a11y tree
4. Walk through the flow step-by-step:
   - Click: `click` by uid from the snapshot
   - Type: `fill` / `type_text`
   - Assert visibility: `take_snapshot` and grep for expected text
   - Assert no errors: `list_console_messages` with `types: ["error"]`
   - Visual sanity: `take_screenshot` at key checkpoints
5. Capture whether each step passed, failed, or was skipped due to a missing feature

**Important conventions:**

- **Snapshot before screenshot.** Snapshots are text + uid-based and give you reliable clickable targets. Screenshots are for visual verification only.
- **Don't drive the app in an impossible way.** If the persona's flow requires a feature that's not shipped yet, mark it `SKIP (not in scope per PRD §X)`.
- **Treat console warnings as info, not fail.** Known framework warnings (React Router future flags, etc.) should not fail the check.
- **Treat console errors as potential fail.** If an error fires during the persona flow, report it verbatim.
- **Respect `prefers-reduced-motion`.** If the app has animations, run one persona with `emulate` set to reduced motion to verify fallbacks.

### Phase 4 — Report

Write a single report back to the user with:

1. **Per-persona pass/fail summary** (table)
2. **Specific friction points discovered** — not "the UI looks okay" but "Maya's test failed at step 5 because the Palette swatch doesn't announce a screen-reader label"
3. **Any new personas the PRD should add** (if you found gaps)
4. **Screenshots of the worst failures** inline via `take_screenshot`
5. **Concrete next actions**, grouped as: code fix / PRD clarification / persona update

The report should be terse and actionable. Don't describe every click — describe the outcomes.

## Proactive Visual Consistency Scan — Run First, Every Audit

**Before** any persona flow, **before** the regression checklist,
**before** the user has a chance to complain: run an automated
visual consistency sweep that looks for the most common classes of
UI inconsistency. These are bugs users feel but can't articulate —
"something looks off" — and they stay hidden until a power user
points at them explicitly. The audit skill's job is to find them
first.

Run this sweep on every screen with repeated UI elements — editor
canvas, dashboard card grid, settings bento, gallery list, modal
stacks. It takes under 60 seconds total and catches ~80% of the
visual inconsistency class.

### The six classes worth auto-detecting

1. **Overlap** — two elements whose bounding boxes intersect when
   they shouldn't. Classic: a sticky header over a save pill, a
   modal over a tour overlay, handles stacking on the same
   coordinates.
2. **Inconsistent dimensions** — same-semantic-role elements that
   rendered at different heights, widths, padding, or font-size.
   The "all primary buttons should be 40px tall" class.
3. **Cut-off / clipping** — a parent with `overflow: hidden` where
   `scrollHeight > clientHeight`, meaning content is being hidden
   from the user. Check every block, every card, every row.
4. **Misalignment** — siblings that should share a centerline,
   baseline, or edge. Tolerance of 1 px for anti-aliasing; anything
   else is a finding.
5. **Inconsistent gaps** — padding / margin between a parent and
   its positioned children should be identical across variants.
   Catches padding mismatches like "text blocks have 4 px padding,
   image blocks have 0".
6. **Counter-rotate drift** — if any parent uses
   `transform: rotate()`, every descendant that should stay
   upright needs a matching counter-rotation. Easy to miss one.

### The script (run on every editor screen)

```javascript
async () => {
  const findings = [];

  // ── 1. Overlap check ─────────────────────────────────────────
  // For every pair of sibling absolutely-positioned elements,
  // check if their rects intersect. Intersection is a finding
  // UNLESS both have `pointer-events: none` (decorative overlays).
  function rectsOverlap(a, b) {
    return !(a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top);
  }
  const absElements = Array.from(document.querySelectorAll('[style*="position: absolute"], [style*="position:absolute"]'));
  for (let i = 0; i < absElements.length; i++) {
    for (let j = i + 1; j < absElements.length; j++) {
      const a = absElements[i];
      const b = absElements[j];
      if (a.contains(b) || b.contains(a)) continue;
      const sa = getComputedStyle(a);
      const sb = getComputedStyle(b);
      if (sa.pointerEvents === 'none' && sb.pointerEvents === 'none') continue;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      if (ra.width === 0 || rb.width === 0) continue;
      if (rectsOverlap(ra, rb)) {
        // Only flag if BOTH are visible interactive elements in same stacking context
        if ((a.tagName === 'BUTTON' || a.tagName === 'A') && (b.tagName === 'BUTTON' || b.tagName === 'A')) {
          findings.push({
            type: 'overlap',
            a: a.getAttribute('title') || a.textContent?.trim().slice(0, 30),
            b: b.getAttribute('title') || b.textContent?.trim().slice(0, 30),
          });
        }
      }
    }
  }

  // ── 2. Clipping check (overflow:hidden with hidden content) ──
  document.querySelectorAll('*').forEach((el) => {
    const s = getComputedStyle(el);
    if (s.overflow !== 'hidden' && s.overflowY !== 'hidden' && s.overflowX !== 'hidden') return;
    if (el.scrollHeight > el.clientHeight + 1) {
      findings.push({
        type: 'clipped-vertical',
        selector: el.tagName + (el.getAttribute('data-block-type') ? `[${el.getAttribute('data-block-type')}]` : ''),
        scrollH: el.scrollHeight,
        clientH: el.clientHeight,
        hiddenPx: el.scrollHeight - el.clientHeight,
      });
    }
    if (el.scrollWidth > el.clientWidth + 1) {
      findings.push({
        type: 'clipped-horizontal',
        selector: el.tagName + (el.getAttribute('data-block-type') ? `[${el.getAttribute('data-block-type')}]` : ''),
        scrollW: el.scrollWidth,
        clientW: el.clientWidth,
        hiddenPx: el.scrollWidth - el.clientWidth,
      });
    }
  });

  // ── 3. Inconsistent dimensions across same-role siblings ──
  // Group buttons by their aria-label prefix or data-role, assert
  // same height. Adapt the grouping key to your app.
  const roleGroups = {};
  document.querySelectorAll('button[title], button[aria-label], [data-role]').forEach((el) => {
    const role = el.getAttribute('data-role') || el.getAttribute('title') || el.getAttribute('aria-label');
    if (!role) return;
    // Skip — only group elements that look like the same kind
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    const key = role.split(/[\s_-]/)[0]; // crude key
    (roleGroups[key] ||= []).push({ h: Math.round(r.height), w: Math.round(r.width), el });
  });
  for (const [key, group] of Object.entries(roleGroups)) {
    if (group.length < 2) continue;
    const heights = new Set(group.map((g) => g.h));
    if (heights.size > 1) {
      findings.push({
        type: 'inconsistent-height',
        group: key,
        heights: [...heights],
        count: group.length,
      });
    }
  }

  // ── 4. Misalignment check ─────────────────────────────────────
  // Find handle clusters around a common parent and verify their
  // centers line up. Adapt the selector to your app — here it's
  // the block handle row that should share a centerline.
  document.querySelectorAll('[data-block-id]').forEach((frame) => {
    const handles = Array.from(frame.querySelectorAll('button[title]'))
      .filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.width <= 30; // circle handles only
      });
    if (handles.length < 2) return;
    const centers = handles.map((b) => {
      const r = b.getBoundingClientRect();
      return Math.round(r.top + r.height / 2);
    });
    const delta = Math.max(...centers) - Math.min(...centers);
    if (delta > 1) {
      findings.push({
        type: 'misaligned',
        blockType: frame.getAttribute('data-block-type'),
        centers,
        deltaY: delta,
      });
    }
  });

  // ── 5. Counter-rotate drift ─────────────────────────────────
  document.querySelectorAll('[data-block-id]').forEach((frame) => {
    const style = frame.style.transform || '';
    const match = style.match(/rotate\(([-\d.]+)deg\)/);
    if (!match) return;
    const parentRot = parseFloat(match[1]);
    if (parentRot === 0) return;
    frame.querySelectorAll('button[title], [data-counter-rotate]').forEach((child) => {
      const cm = (child.style.transform || '').match(/rotate\(([-\d.]+)deg\)/);
      const childRot = cm ? parseFloat(cm[1]) : 0;
      if (Math.abs(parentRot + childRot) > 0.1) {
        findings.push({
          type: 'counter-rotate-drift',
          element: child.getAttribute('title'),
          parentRot,
          childRot,
          expected: -parentRot,
        });
      }
    });
  });

  return findings;
}
```

### How to use the output

- **Zero findings** → move on to persona flows.
- **Any findings** → stop, diagnose the root cause in source,
  fix, re-run the exact same script to verify all findings clear.
  Only then proceed to persona flows.
- **Include the finding count in the report header** even if zero.
  "Visual consistency scan: 0 findings across editor + dashboard
  + gallery" is a meaningful line.

### When the user DOES report a visual bug

Treat it as a test failure in the proactive scan — run the script
FIRST and see if it catches the issue. If yes, you can show the
user the exact numeric delta that proves their intuition right.
If no, extend the script with a new check that would have caught
it, then fix the bug. This is how the scan gets better over time
— every user-reported inconsistency adds a new detector.

Real examples of findings the scan caught on Postr 2026-04-11:

- **Cut-off** — authors block's inner div had
  `scrollHeight: 32, clientHeight: 20`, so 12 px of the placeholder
  "Add authors in sidebar →" text was hidden. Fix: add `authors`
  to the `growsWithContent` set so height becomes `auto` with
  `minHeight` as the floor.
- **Misalignment** — block-type label in the top handle row had
  `top: -22` while the move + delete buttons had `top: -26`,
  putting the label center 4 px below the button centerline.
  Fix: explicit `height: 20` + `top: -26` so all three siblings
  share the same bounding box.
- **Inconsistent gap** — handles sat at `top: -26` which was
  measured from the frame's padding box, and the frame had
  different padding per block type (`0` for image/logo/table,
  `'4px 6px'` for text/title/heading). Fix: move padding from
  the outer frame to an inner content div so the frame's padding
  box === border box for all variants.

All three were caught by running the scan BEFORE the user could
complain, OR verified against the scan when the user did complain
so the fix could be proved exhaustively (across 6 block types,
not just the one in the screenshot).

## Regression Checklist — Run Every Audit

In addition to persona flows, every audit MUST run these automated
regression checks via `page.evaluate()`. These cover bugs that were
previously found and fixed — they must never reappear.

```javascript
// Run this on the editor page with a poster open
const results = {};

// B1: Title/authors overlap — multi-line title must not collide with authors
const title = document.querySelector('[data-block-type="title"]');
const authors = document.querySelector('[data-block-type="authors"]');
if (title && authors) {
  const tr = title.getBoundingClientRect();
  const ar = authors.getBoundingClientRect();
  results.B1 = { overlap: ar.top < tr.bottom, gap: Math.round(ar.top - tr.bottom) };
}

// B2: References block must auto-grow (not clip)
const refs = document.querySelector('[data-block-type="references"]');
if (refs) results.B2 = { height: getComputedStyle(refs).height };

// B3/B4: No buttons clipped by canvas overflow:hidden
const cr = document.querySelector('[data-postr-canvas-frame]')?.getBoundingClientRect();
let clipped = 0;
document.querySelectorAll('#poster-canvas button').forEach(b => {
  const br = b.getBoundingClientRect();
  if (br.width > 0 && cr && (br.right > cr.right + 5 || br.left < cr.left - 5)) clipped++;
});
results.B3_B4 = { clippedCount: clipped };

// S1: Table cells must be contentEditable, not <input>
const ce = document.querySelectorAll('#poster-canvas table [contenteditable="true"]');
const inp = document.querySelectorAll('#poster-canvas table input');
results.S1 = { contentEditable: ce.length, inputs: inp.length };

// K1: Presets persist in localStorage
results.K1 = { exists: !!localStorage.getItem('postr.style-presets') };

// Layout: sidebars must not overlap canvas
const sb = document.querySelector('[data-postr-sidebar]')?.getBoundingClientRect();
const gl = document.querySelector('[data-postr-guidelines]')?.getBoundingClientRect();
results.layout = {
  leftOverlap: sb && cr ? cr.left < sb.right : false,
  rightOverlap: gl && cr ? gl.left < cr.right : false,
};
```

**Every check must pass.** If any fails, it's a CRITICAL finding.

### Visual Consistency Audits — Measure-and-Compare

Separate category from the regression checklist. Persona-driven flow
tests catch FUNCTIONAL bugs ("clicking X does Y"); these audits catch
AESTHETIC INCONSISTENCY ("X should look the same across all variants,
and it doesn't"). These are the bugs users feel but often can't
articulate — "something looks off" — and they're invisible in code
review because the inconsistency only exists when multiple variants
are rendered side-by-side.

**The technique**: for any category of UI (buttons, handles, labels,
cards, modals, etc.) where multiple variants exist, use Playwright's
`browser_evaluate` to:

1. Enumerate every variant of the category
2. For each variant, read the **actual rendered geometry** via
   `getBoundingClientRect()` and computed styles via
   `getComputedStyle()`
3. Return a table of numeric values
4. Compare — any delta beyond a small tolerance (usually 0-1 px for
   anti-aliasing noise) is a finding

Don't trust screenshots. The human eye misses 2-4 px inconsistencies
that make a UI feel subtly "off". Numeric measurement catches them.

#### Spacing / gap consistency

When external chrome (labels, handles, badges) is positioned
relative to a parent, verify the gap is identical across variants.
Common trap: parent's `padding` varies by variant, but the absolutely-
positioned child uses the same `top` offset — so the visual gap to
the BORDER differs even though the numeric offset is the same.

```javascript
// Measure handle→border gap for every block variant
async () => {
  async function measure(type) {
    const blk = document.querySelector(`[data-block-type="${type}"]`);
    if (!blk) return null;
    blk.click();
    await new Promise(r => setTimeout(r, 100));  // React re-render
    const frameRect = blk.getBoundingClientRect();
    const handle = blk.querySelector('button[title*="move"]');
    if (!handle) return { error: 'no handle' };
    const handleRect = handle.getBoundingClientRect();
    return {
      gapPx: Math.round(frameRect.top - handleRect.bottom),
      handleCenterY: Math.round(handleRect.top + handleRect.height / 2),
    };
  }
  const results = {};
  for (const t of ['heading', 'text', 'image', 'table', 'title', 'references']) {
    results[t] = await measure(t);
  }
  return results;
}
```

**Expected**: every `gapPx` identical (±0 px). Any variant with a
different value is a finding with code-level root cause. The fix
is usually "move the padding from the parent to an inner wrapper
so positioning offsets measure from the same edge everywhere".

#### Alignment consistency

Two or more sibling elements that should share a center line, baseline,
or edge. Measure the relevant axis on each and assert equality.

```javascript
// Verify three buttons in a toolbar share the same Y center
() => {
  const toolbar = document.querySelector('[data-toolbar]');
  const btns = Array.from(toolbar.querySelectorAll('button'));
  const centers = btns.map(b => {
    const r = b.getBoundingClientRect();
    return {
      label: b.getAttribute('aria-label') || b.textContent?.trim(),
      centerY: Math.round(r.top + r.height / 2),
      centerX: Math.round(r.left + r.width / 2),
    };
  });
  // All centerY values should match
  const centerYs = centers.map(c => c.centerY);
  const delta = Math.max(...centerYs) - Math.min(...centerYs);
  return { centers, deltaY: delta };
}
```

**Expected**: `deltaY: 0`. Anything ≥ 2 px is a finding (1 px is
usually anti-aliasing).

#### Size consistency

Elements sharing a semantic level (e.g. "all primary buttons", "all
h3 headings", "all icon handles") should render at identical
dimensions. Measure `offsetWidth`/`offsetHeight`/`font-size`/
`line-height` across all instances.

```javascript
() => {
  const buttons = document.querySelectorAll('[data-variant="primary"]');
  const sizes = Array.from(buttons).map(b => {
    const s = getComputedStyle(b);
    return {
      text: b.textContent?.trim(),
      width: b.offsetWidth,
      height: b.offsetHeight,
      fontSize: s.fontSize,
      padding: s.padding,
      borderRadius: s.borderRadius,
    };
  });
  // Group by height — any outliers?
  const heights = new Set(sizes.map(s => s.height));
  return { sizes, distinctHeights: [...heights] };
}
```

**Expected**: `distinctHeights.length === 1`. Multiple heights mean
some variant is computing its size differently (longer text +
no `min-width`? content-box vs border-box mismatch? inconsistent
`padding`?).

#### Color token consistency

Every use of a semantic color should resolve to the exact same
hex. Catches drift where someone hardcoded `#7c6aed` in one place
and `#7d6bed` in another.

```javascript
() => {
  // All "primary accent" text should be the same color
  const accents = document.querySelectorAll('[data-role="accent"], .text-accent');
  const colors = new Set();
  accents.forEach(el => colors.add(getComputedStyle(el).color));
  return { distinctColors: [...colors], count: colors.size };
}
```

**Expected**: `count: 1`. Anything else means the design token
system has a leak — find where the mismatched values are and
route them through the same CSS variable / Tailwind token.

#### State consistency

Hover / focus / active / disabled states should follow the same
visual pattern across every interactive element of the same
variant. This requires triggering each state in JS and measuring.

```javascript
// Verify disabled buttons all get the same opacity + cursor
() => {
  const disabled = document.querySelectorAll('button:disabled');
  const states = Array.from(disabled).map(b => {
    const s = getComputedStyle(b);
    return {
      text: b.textContent?.trim(),
      opacity: s.opacity,
      cursor: s.cursor,
      background: s.backgroundColor,
    };
  });
  const uniqueOpacities = new Set(states.map(s => s.opacity));
  return { states, distinctOpacities: [...uniqueOpacities] };
}
```

#### Counter-rotate consistency

If any parent applies `transform: rotate()`, every child icon /
label that should STAY UPRIGHT needs a matching counter-rotation.
Easy to miss one.

```javascript
() => {
  // Find rotated frames and check that their external handles
  // have matching counter-rotations
  const rotated = document.querySelectorAll('[data-block-id]');
  const issues = [];
  rotated.forEach(frame => {
    const style = frame.style;
    const match = style.transform?.match(/rotate\(([-\d.]+)deg\)/);
    if (!match) return;
    const parentRot = parseFloat(match[1]);
    if (parentRot === 0) return;
    frame.querySelectorAll('button').forEach(btn => {
      const btnMatch = btn.style.transform?.match(/rotate\(([-\d.]+)deg\)/);
      const btnRot = btnMatch ? parseFloat(btnMatch[1]) : 0;
      // Sum should be zero (child counter-rotates to stay upright)
      if (Math.abs(parentRot + btnRot) > 0.1) {
        issues.push({
          element: btn.getAttribute('title') || btn.textContent,
          parentRot,
          btnRot,
          expected: -parentRot,
        });
      }
    });
  });
  return { issues };
}
```

#### When to run these audits

- **After any PR that touches layout CSS, positioning, or padding**
- **After introducing a new block/card/variant type** — regression
  test across all existing types
- **When the user reports "something looks off but I can't say what"**
  — this is the single highest-signal request for visual consistency
  audits. The user is seeing a real inconsistency they can't name.
  Enumerate the category, measure, find the outlier.
- **Before every ship** if the changed files touch the block frame,
  buttons, modals, or any component rendered in multiple variants.

#### Reporting format

Present results as a table, not prose:

```
| Variant    | gap (px) | center-Y |  ✓/✗ |
|------------|----------|----------|------|
| heading    | 7        | 262      | ✓    |
| text       | 7        | 295      | ✓    |
| image      | 7        | 417      | ✓    |
| table      | 7        | 295      | ✓    |
| title      | 7        | 158      | ✓    |
| references | 7        | 531      | ✓    |
```

The numeric uniformity is the proof. Screenshots are for follow-up
communication, not the primary evidence.

#### Worked example

2026-04-11, Postr editor. User complained "make sure these buttons
are the same space away from the border for all components" with a
screenshot of move + label + delete handles around an image block.

1. **Diagnosis from source code**: Read `BlockFrame` — found
   `padding: ['table', 'image', 'logo'].includes(b.type) ? 0 : '4px 6px'`.
   Hypothesis: handles positioned at `top: -26` measure from the
   padding box edge, which means padded blocks push the handles
   4px further from the visual content than unpadded blocks.
2. **Measurement**: Ran the handle→border gap script above. Initial
   result showed 7 px gap on image (padding 0) but expected 3 px on
   text blocks (padding 4+1.5=5.5). Actually, all types measured
   at 7 px — which proved my hypothesis was wrong about WHICH
   variant was the outlier, but confirmed the inconsistency
   existed between on-canvas visible content and the handle.
3. **Fix**: moved padding from frame to inner content div, so
   frame's padding box === border box.
4. **Verification**: re-ran the same script. Every variant: 7 px gap,
   perfect Y alignment. Shipped.

The entire cycle — read code → script the measurement → fix → verify
— took 15 minutes. Without the numeric measurement, I'd have needed
a dozen screenshots and still wouldn't have known if the fix was
actually consistent across all 6 variants.

### Additional Manual Checks
- Table right-click → custom context menu appears (NOT browser default)
- Tab key moves between table cells
- Poster Name save button shows "Saved" after clicking Save
- Tour highlights sidebar (not grays it out) on sidebar steps
- Dashboard cards show mini-preview (not "NO PREVIEW")
- Dashboard cards show actual poster title (not "Untitled Poster")
- ConfirmModal appears on delete (not browser window.confirm)
- Closing guidelines panel expands canvas (not just hides overlay)
- Logo in sidebar navigates to dashboard on click
- Drag a block to the poster edge → red dashed border + warning banner appears
- Move it back inside → warning disappears
- Insert a block on a crowded poster → verify it doesn't spawn outside canvas
- Drag an IMAGE block to a new position → verify it stays where dropped (not snapping back)
- Drag a TEXT block while a table cell is focused → verify no position reset
- Resize a block from the corner handle → verify width/height change persists

### Interaction Edge Cases (frequently missed in code review)

These bugs are invisible in source code review and require real browser testing:

**Stale closure bugs** — React re-renders create new array references, but
event handlers (pointermove, keydown) capture the old reference in their
closure. Test by:
- Dragging an image block after editing a table cell (triggers re-render)
- Dragging any block immediately after autosave fires
- Resizing a block after switching sidebar tabs

**contentEditable + rich text** — When cells contain `<b>`, `<i>`, or
`<mark>` wrappers, the browser's Selection/Range API behaves differently:
- ArrowRight at end of `<b>text</b>` — endOffset may be inside the `<b>`
  node, not the cell div. Must use pre-caret range to measure true offset.
- Tab navigation after applying bold — verify focus actually moves
- Paste into a bold cell — verify the paste handler still intercepts

**Browser event capture vs bubble** — contentEditable intercepts paste
events before they bubble to parent handlers:
- Paste TSV into a contentEditable table cell — verify `onPasteCapture`
  intercepts (not just `onPaste` which won't fire)
- Right-click inside a contentEditable — verify custom context menu
  appears (not browser default)
- Cmd+B inside a table cell — verify it doesn't trigger a browser-level
  shortcut that conflicts

**Z-index stacking** — Portals, overlays, and fixed-position elements
can occlude each other:
- Open context menu near the tour overlay boundary
- Open context menu while the guidelines panel is visible
- Select a block near the canvas edge → verify delete button visible

### Auth & Account Lifecycle (frequently missed entirely)

These bugs are invisible in the editor because they only surface when
the user navigates OUTSIDE the editing flow. Code review that focuses
on the poster canvas misses every one of these:

**Auth flow completeness** — test the FULL lifecycle, not just "can I log in":
- Sign up with email → does the app tell you to check your email for
  confirmation, or does it silently navigate to a blank dashboard?
- Sign in with wrong password → is the error message helpful?
- Click "Continue with Google" then CANCEL the popup → does the button
  recover (not stuck on "Loading...")?
- Click "Forgot password?" → does the link exist? Does it actually
  send a reset email? Does it show feedback?
- Sign out → can you press browser Back to access protected pages?
- Delete account → is the user ACTUALLY deleted from auth.users, or
  just signed out? Can they re-register with the same email?
- Delete account → does it require typed confirmation ("I confirm the
  deletion of my account") to add friction?

**Session lifecycle** — test what happens OVER TIME:
- Session expires while editing → does the app detect it and redirect
  to auth, or do saves silently fail with 401?
- Tab left open overnight → does the session refresh, or does the next
  edit fail?
- Two tabs open on the same poster → does autosave conflict?

**Data safety during auth transitions**:
- Close the browser tab mid-edit → does beforeunload flush the pending
  autosave, or are the last 800ms of edits lost?
- Network goes down mid-editing → does the save-status pill show an
  error, or does the user keep typing unaware that nothing is saving?
- Open /p/nonexistent-id → does it show "Poster not found", or does
  it silently load a different poster?

**Why these are missed**: Code reviewers focus on the feature they just
built (the editor canvas). Auth, account deletion, session expiry, and
network failures are cross-cutting concerns that sit in different files
(AuthGuard, useAutosave, Editor loader) and aren't exercised by any
canvas-focused persona flow. The fix: every UX audit must include a
**full-lifecycle walkthrough** that starts at the landing page, creates
an account, edits a poster, deletes the account, and re-registers —
not just "open the editor and click around."

## Constraints

- **Never alter the production database or push code.** This skill is read-only on behalf of the user's app state.
- **Never bypass auth walls with credentials you weren't given.** If a persona flow hits an auth wall, that IS a finding — report it, don't work around it.
- **Don't re-run passing tests.** If a persona passes on the first execution, don't loop unless the user asks.
- **Cap at ~30 minutes of work.** This is a quality-check skill, not a full test harness.

## Testing auth-gated flows against production

When the user explicitly asks to run a **production smoke test** that
requires signing in, follow this protocol:

### Pick the right auth method
- **Email + password signup** — use for automated flows. Hermetic,
  reproducible, and fully automatable from Playwright.
- **Anonymous / guest signup** — use when the app supports it and
  the flow doesn't need email verification. Even hermetic-er.
- **Google/Apple/GitHub OAuth** — **cannot be driven headlessly.**
  Google explicitly blocks automated browsers from the consent
  screen with "This browser or app may not be secure". Don't try.
  If OAuth is the only auth path, stop and tell the user to sign
  in manually, then resume the flow post-login.

### Track every test user you create
Before creating the first account, start a mental (or literal)
list of the credentials you used. Include:
- Email address
- The `auth.users.id` UUID once you have a session (read from
  localStorage or via an evaluate() call in the browser)
- Any poster IDs / gallery entry IDs the user created

At the end of the audit, **always** clean up:
1. Delete each gallery entry via the UI or admin tools
2. Delete each poster via the UI or a SQL DELETE
3. Delete the auth user via `supabase.auth.admin.deleteUser(id)`
   or a `DELETE FROM auth.users WHERE email = ...` query
4. Verify counts are back to the pre-test baseline

If you're working in a Claude Code session where the Supabase MCP
tools are loaded, you can run `execute_sql` directly against the
project. If not, give the user a ready-to-paste SQL block and ask
them to run it in the Supabase SQL editor.

### Use unique, recognizable test emails
Prefer a convention like `postr-smoke-YYYYMMDD-HHMMSS@mailinator.com`
or `postr-smoke-${uuid()}@example.test`. Benefits:
1. Easy to identify and bulk-delete by email prefix if cleanup
   fails or is interrupted
2. Won't collide with real user emails
3. Obvious in logs that it's test data

**Never use real emails of people you know**, even with permission —
the test user ends up in Supabase's audit trail, Resend bounce logs,
and any downstream analytics.

### Email-verification flows
If the app requires email verification before the session is usable,
either:
- Use Supabase admin API to mark the email confirmed immediately
  (via MCP `execute_sql`: `UPDATE auth.users SET email_confirmed_at = now() WHERE email = '...'`)
- OR use a Mailinator/1secmail mailbox and poll for the confirmation
  link via HTTP
- OR sign up via anonymous/guest flow and test auth as a separate
  verification step

Don't get stuck waiting on an email that will never arrive.

## Example invocation prompts

- "Run ux-persona-check on this repo"
- "Create personas from PRD.md and verify the editor is usable for each"
- "My landing page is live on localhost:3000 — check it with realistic users"

## What good looks like

- 4 personas, each with a 5-8 step test flow
- 80% of steps pass on first run
- 2-3 concrete friction points surfaced
- A screenshot of the worst-looking moment
- A suggested PRD update or code fix for each finding
- Total execution time < 20 minutes for the developer (reads the report, not the process)
