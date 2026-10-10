#!/usr/bin/env node
/**
 * control-size-check.mjs — real-browser check that a selected block's
 * controls stay one size on screen at every zoom (plan item 19; from the
 * owner's answer to fix 03's question about the 64 px gutter, 2026-09-30:
 * the editor adapts to every screen size and feels smooth).
 *
 * The editor opens on a poster built from the 3-column template. A block
 * is selected the way a user selects it (a click; Shift + click for a
 * group; the Crop button for crop mode), then the zoom is moved the way a
 * user moves it: FIT, Zoom out until it stops (the floor), a pinch
 * (Ctrl + wheel) to 100%, Zoom in until it stops (the 10x ceiling). At
 * each zoom every selection control is read from layout: the 8 (or 4)
 * resize handles and their visible squares, the handle row above the block
 * (move, label, replace, crop, delete), the rotate stem and button below
 * it, a group's frame and handles, a table's row and column strips and
 * column-resize grips, the crop overlay's edge handles and its Cancel /
 * Reset / Apply bar. Where the sheet is larger than the canvas, the canvas
 * is first scrolled so the selection is centred, as a user pans to it.
 *
 * Subjects: the title (where the template puts it, and moved flush with
 * the sheet's top edge); a 15 x 2 in logo flush with the sheet's bottom
 * edge at its centre; a 3 in image at the sheet's left edge, and the same
 * image in crop mode; a group (the title and the first text block); the
 * template's table. Viewports 1280 x 800 and 2560 x 1440; the 48 x 36 in
 * poster, and for the top and bottom subjects 36 x 48 and 24 x 36 in
 * portrait posters too (fits limited by the canvas's height). One sweep
 * takes the selected table from the floor to the ceiling one Zoom in click
 * at a time (67 steps). Two more move the view without a zoom change, the
 * bottom logo selected (claim Rr): a scroll (a wheel), and a window 200 px
 * narrower.
 *
 * CLAIMS (a claim is OBSERVED when the defect is present; the fix's spec
 * is the owner's answers of 2026-10-06, Q1 to Q4, record 19)
 *   S   a control's on-screen size changes with the zoom: the size that
 *       should stay fixed (its width; a table strip's or a crop edge's
 *       thickness, whose length follows the block; the rotate stem's
 *       length; the handle row's and the label's height) differs by more
 *       than 0.5 px between the scenario's zooms (main's reproduction used
 *       a 1.1 × ratio; fix 19 tightened it). A group's frame is not
 *       counted: it outlines the blocks
 *   Sm  the mechanism (INFORMATION): every fixed-size control's on-screen
 *       size is its size in sheet units times the zoom, within 2 %: it is
 *       drawn inside the sheet's `transform: scale(zoom)`. Main's sizes
 *       (DESIGN_UNITS); after fix 19 it reads 0 by design
 *   Sp  a control's widest border (its own or one inside it, as computed,
 *       times the zoom) differs by more than 0.5 px between the zooms: a
 *       browser rounds a border up to a whole layout pixel, which the zoom
 *       enlarges (an 8 px square measured 20 px at 10× with a counter-scaled
 *       1 px border). Reads borders only, not shadows or backgrounds
 *   Sw  the sweep: a kind's fixed size differs by more than 0.5 px over
 *       the 67 Zoom in steps from 0.2 to 10. Also per kind, px per unit of
 *       zoom (a slope through the origin: the size in sheet units when it
 *       scales), the worst miss from that line, and the zoom from which it
 *       is 24 px (INFORMATION)
 *   T   INFORMATION since fix 19 (claim T-fit is the gate): a control a
 *       user grabs (a pointer target) is under 24 x 24 CSS px and fails
 *       WCAG 2.5.8's spacing test (a 24 px circle on its centre meets
 *       another target or another small target's circle), at any zoom
 *   T-fit  T at the views a user opens: the 1280 x 800 fit, the
 *       2560 x 1440 fit and 100% (both viewports), a table's row and
 *       column strips judged by their thickness (their length is the
 *       row's or the column's; claim Tl)
 *   Tl  INFORMATION: at those views, a table strip shorter than 24 px
 *       along its row or column (a row under 24 px on screen): T fails it
 *       by size and by spacing, which no control size can change
 *   T, T-fit and the sweep read a size up to zoom / 60 px short of 24 as
 *       24: the engines lay out in 1/64 (Chromium, WebKit) or 1/60
 *       (Firefox) of a pixel of the element's own space, so 24 px drawn in
 *       the zoomed sheet measures 23.98 px at the 1280 x 800 fit
 *   R   at a zoom where the whole sheet shows (the fit, the floor, 100% when
 *       the sheet fits), a control a user grabs sticks out of the visible
 *       canvas by more than 0.5 px, or the element on top at its centre is
 *       not it and is not another selection control (the ZoomBar, the
 *       autosave pill, the sidebar, the workspace). Rz lists them by zoom
 *   O   INFORMATION since fix 19 (claim Oc is the gate): two controls a
 *       user grabs overlap (more than 1 px2), or the element on top at
 *       one's centre (on the visible canvas) is another selection control
 *       (designed nesting excluded: a group frame and its own handles).
 *       Split: Od, an overlap present at every zoom (judged in sheet units,
 *       over 0.25 unit2; a covered control at every zoom where its centre
 *       is on the visible canvas); Oz, one present at some zooms only
 *   Oc  one block's own grabbable controls overlap (more than 1 px2), at
 *       any zoom of the matrix or the sweep, less the layout overlaps on
 *       the Later list (a group's frame and handles, crop mode's controls,
 *       a table's strips and grips: OC_EXCLUDED)
 *   Cm  the owner's rule for a block small on screen (Q2), or the rule for
 *       a handle row wider than its block (review F3), is not what is drawn,
 *       or a control goes missing: lib ruleCheck. The block's size is the box
 *       its handles sit on: its rendered box less the selection border
 *   Pl  a control is not where the design puts it, against the box it
 *       belongs to (unrotated blocks, within 1 px): a resize handle not
 *       centred on its corner or edge midpoint (main's design too); since
 *       fix 19, the handle row's bottom not 14 px above the block or not
 *       centred, the rotate control (below) not 14 px under it, a crop edge
 *       not centred on its line, the crop bar not 4 px under the image, a
 *       selected table's strips not ending 2 px out, a column grip not on
 *       its border. A regression guard written from fix 19's own geometry
 *       (selectionLayout.ts), not from the owner's answers: it says where
 *       the fix draws, not that the place is right; R, Oc and Ov judge that
 *   Rr  the rotate control is not where Q3 puts it after the view moved
 *       with the zoom unchanged (the room scenarios): below the block where
 *       it sticks out of the visible canvas or lies under the ZoomBar, or in
 *       the handle row while below has room
 *   Tf  INFORMATION: after a pinch, the floating format toolbar (a portal,
 *       drawn outside the sheet) is more than 2 px further from its
 *       selected text than before the pinch: it does not follow
 *   Th  INFORMATION, with Tf: the "Select text to format" hint (a portal
 *       placed under the text when it renders) is more than 2 px from its
 *       place under the text after the pinch
 *   Ov  at the fit, selecting the block makes the fitted canvas scroll
 *       (its scroll range grows past the one before the click): the
 *       controls stick out past the gutter and extend the scroll area
 *   Gf  INFORMATION: a group's frame is more than 1 sheet unit from the
 *       union of its blocks as rendered on one side (GroupFrame draws it
 *       from the stored geometry; a block that grows with its content
 *       renders at another height): its handles are not on the blocks
 *   Or, Pl-rot, Or-click, St, Fd, Fh, Fr (Or-tilt, Nb, Ns, Fz: INFORMATION):
 *       fix 19's review round 1, in lib/controlReview.mjs and (Fd, a click at
 *       another block's centre that deletes, replaces or crops the selected
 *       block; Fh, Fr, Ns, Fz) lib/neighbourClicks.mjs
 *   Controls (the instrument; a failure is exit 2; K-rot, K-settle, K-nb and
 *   K-fd in the libs):
 *   K-zoom      each zoom is reached: the floor 0.2 (or the fit, if lower),
 *               the ceiling 10, 100% within 0.5 %, and at the fit the sheet
 *               hides nothing; the sweep runs from 0.2 to 10
 *   K-select    the subject stays selected through every zoom step and
 *               every step of the sweep
 *   K-fixed     the ZoomBar's buttons and the format toolbar (both drawn
 *               outside the sheet) keep one size at every zoom (within
 *               0.5 px): the instrument can tell a control that does not
 *               scale from one that does
 *   K-hit       at the 1280 x 800 fit, the title's bottom-right handle (on
 *               the open sheet, nothing over it) is the element at its own
 *               centre: the hit test works
 *   Positive controls outside this file: the reproducer's mutant that
 *   counter-scales the handles, the handle row and the rotate button
 *   dropped S to the kinds it left alone (record 19, section 4); fix 19's
 *   own mutants (docs/fixes/19-controls-one-size.mutants.json, served with
 *   POSTR_MUTANT) turn the claims red part by part (record 19, section 8).
 *
 * BLIND SPOTS (not measured here)
 *   - Paint: sizes are layout boxes, and Sp reads computed borders; a
 *     shadow or a background (fix 19 draws the controls' outlines with
 *     them) is not read: it is not rounded to a pixel as a border is
 *     (INSPECTED), and record 19 checks it by eye. A table's row and
 *     column strips are laid out at 20 % opacity on a transparent
 *     background, so they are invisible until hovered; this reads them as
 *     present.
 *   - The hit test samples one point, the centre, not the whole hit area;
 *     at the floor (controls of 1 to 4 px) and where a centre lies on
 *     another control's edge, rounding decides what is on top (the Oz rows).
 *   - At zooms where the sheet overflows, the canvas is scrolled by setting
 *     scrollLeft/scrollTop, not by a wheel.
 *   - Rotated blocks but for claims Or, Pl-rot and Or-click (Pl, Oc, Cm, R skip
 *     them), device pixel ratios other than 1, touch and pen (a
 *     coarse pointer needs 44 px, not 24), classic scrollbars, other poster
 *     sizes and templates, the Check tab's figure-size overlay, the table's
 *     hover-only Add row / Add column bars, a production build (this is the
 *     dev server).
 *   - The rulers are hidden (RULERS_ENABLED false): nothing is measured
 *     against them.
 *   - WCAG 2.5.8's exceptions ("equivalent": arrow keys move a block) are
 *     a judgment, not measured: T reports the raw test.
 *
 * SWITCHES (record 29's ADJUSTMENTS_ENABLED, config/features.ts, hides the
 *   rotate control, the crop button and so crop mode, and a table's strips,
 *   grips and "+" bars; since the merge of main, record 30, into record 29):
 *   while the tree has it off, the scenarios whose subject is a hidden
 *   control are skipped, printed "skipped (switch off)" and counted on the
 *   summary line of that name (`needsOf`): the crop subject's two
 *   controls-…-crop and settle-…-crop, rotated-click (it turns the block
 *   with the rotate control) and the two room-… scenarios (Rr, the rotate
 *   control's place). The others run on the controls that stay: Cm does
 *   not ask for rotate or crop (lib ruleCheck; an image's or logo's row
 *   keeps crop's slot, drawn empty, blocks.tsx data-postr-row-slot, so its
 *   width is checked as before), Fr asks for Replace and Delete
 *   (lib/neighbourClicks.mjs), and the strips' readings are absent. Fd and
 *   Fh found the slot missing on the merge (a 3 in image's Replace over the
 *   blocks beside it at 0.35: Fd 2 of 78, Fh 1 of 42; 0 with crop back).
 *
 * RUN (from apps/web)
 *   node scripts/control-size-check.mjs [--only id,id]
 *   (the control readers, the zoom steps and the WCAG test are in
 *   lib/selectionControls.mjs)
 *   env PORT (default 5281), OUT_DIR, POSTR_REPO, POSTR_BROWSER,
 *       POSTR_MUTANT (lib/editorHarness.mjs)
 *
 * EXIT 0 no claim observed and every control held . 1 a claim observed
 *      (S, Sw, Sp, T-fit, R, Ov, Oc, Cm, Rr, Pl, Or, Pl-rot, Or-click, St, Fd,
 *      Fh or Fr; until fix 19: S, T, R or O) . 2 a
 *      scenario errored, a control failed, or the harness did not start
 *
 * Side effect: rewrites apps/web/public/version.json (Vite's build stamp);
 * restore with `git checkout -- apps/web/public/version.json`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SWITCH_OFF, log, openEditor, startHarness, switchOffReason, switchesOff } from './lib/editorHarness.mjs';
import { roomScenarios } from './lib/rotateRoom.mjs';
import { reviewScenarios, reviewVerdicts } from './lib/controlReview.mjs';
import {
  DESIGN_UNITS, baseKind, centreSelection, fixedDim, judge, layoutTolerance, ownOverlaps, pinchTo, readControls, round, ruleCheck, stepUntilStable, wcag, zoomNow,
} from './lib/selectionControls.mjs';

/** The harness's images are contained (imageFit 'contain'): corners only. */
const CORNERS_ONLY = (type) => type === 'image';
/** A size that should stay fixed may move this much between zooms (layout rounding). */
const ONE_SIZE_PX = 0.5;

const PORT = Number(process.env.PORT ?? 5281);
const onlyArg = process.argv.find((a) => a.startsWith('--only'));
const ONLY = onlyArg
  ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : process.argv[process.argv.indexOf(onlyArg) + 1]).split(',')
  : null;
const fail = (e) => {
  log(`[harness] instrument error: ${String(e).slice(0, 300)}`);
  process.exit(2);
};

// A 2 × 2 PNG, so image blocks show a picture (an empty one opens the file
// picker on click).
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4AWP4z8DwHwyBAMQgYGBgAAB1SQX7nHNiaQAAAABJRU5ErkJggg==';

const SUBJECTS = {
  title: {
    async select(page) { await clickBlock(page, 'title', 'left'); },
  },
  top: {
    // The title moved flush with the sheet's top edge (fit-check's Hh case):
    // its handle row goes above the sheet.
    edit: (doc) => ({ ...doc, blocks: doc.blocks.map((b) => (b.type === 'title' ? { ...b, y: 0 } : b)) }),
    async select(page) { await clickBlock(page, 'title', 'left'); },
  },
  bottom: {
    // A 15 × 2 in logo flush with the sheet's bottom edge, centred: its
    // rotate control goes below the sheet. A logo with a picture keeps its
    // stored height (20 units, measured), where a references block or a
    // captioned image grows with its content and would overhang the edge.
    // 15 in wide: 148 px at 100%, where its label may show but not fit its row (F3).
    edit: (doc) => ({
      ...doc,
      blocks: [...doc.blocks, {
        id: 'zqbottom', type: 'logo', x: doc.widthIn * 5 - 75, y: doc.heightIn * 10 - 20, w: 150, h: 20,
        content: '', imageSrc: PNG, imageFit: 'contain', tableData: null,
      }],
    }),
    async select(page) { await clickBlock(page, '[data-block-id="zqbottom"]', 'center'); },
    // Precondition: the logo really is flush with the sheet's bottom edge.
    check: (page) => page.evaluate(() => {
      const s = document.getElementById('poster-canvas').getBoundingClientRect();
      const el = document.querySelector('[data-block-id="zqbottom"]');
      const off = el.getBoundingClientRect().bottom - s.bottom;
      if (Math.abs(off) > 0.5 || el.dataset.postrOob) throw new Error(`precondition: the bottom logo is flush (off by ${off} px, oob ${el.dataset.postrOob ?? 'no'})`);
    }),
  },
  leftImage: {
    // A 3 in image at the sheet's left edge: its handle row (five buttons)
    // is wider than the block and centred on it.
    edit: (doc) => ({
      ...doc,
      blocks: [...doc.blocks, {
        id: 'zqimage', type: 'image', x: 0, y: doc.heightIn * 10 * 0.55, w: 30, h: 30,
        content: '', imageSrc: PNG, imageFit: 'contain', tableData: null,
      }],
    }),
    async select(page) { await clickBlock(page, '[data-block-id="zqimage"]', 'center'); },
  },
  crop: {
    // The same image in crop mode (its Crop button, a user's click): the
    // crop overlay's edge handles and its Cancel / Reset / Apply bar, drawn
    // inside the block, so inside the zoomed sheet too.
    edit: (doc) => ({
      ...doc,
      blocks: [...doc.blocks, {
        id: 'zqimage', type: 'image', x: 0, y: doc.heightIn * 10 * 0.55, w: 30, h: 30,
        content: '', imageSrc: PNG, imageFit: 'contain', tableData: null,
      }],
    }),
    async select(page) {
      await clickBlock(page, '[data-block-id="zqimage"]', 'center');
      await page.locator('#poster-canvas [data-block-id="zqimage"] button[title="Crop image"]').click();
      await page.waitForTimeout(250);
    },
    check: (page) => page.evaluate(() => {
      if (!document.querySelector('#poster-canvas [data-block-id="zqimage"] [aria-label="crop top edge"]')) throw new Error('precondition: crop mode shows its edge handles');
    }),
  },
  group: {
    async select(page) {
      await clickBlock(page, 'title', 'left');
      await clickBlock(page, 'ZQSENT1', 'left', { shift: true });
    },
    expectSelected: 2,
  },
  table: {
    async select(page) { await clickBlock(page, '[data-block-type="table"]', 'center'); },
  },
};

/** Click a block like a user: `which` is a type, a text marker or a selector. */
async function clickBlock(page, which, where, { shift = false } = {}) {
  const loc = which.startsWith('[')
    ? page.locator(`#poster-canvas ${which}`).first()
    : which === 'title'
      ? page.locator('#poster-canvas [data-block-type="title"]').first()
      : page.locator('#poster-canvas [data-block-id]', { hasText: which }).last();
  const b = await loc.boundingBox();
  if (!b) throw new Error(`precondition: block ${which} is laid out`);
  const x = where === 'left' ? b.x + Math.min(6, b.width / 4) : b.x + b.width / 2;
  const y = b.y + b.height / 2;
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(x, y);
  if (shift) await page.keyboard.up('Shift');
  await page.waitForTimeout(250);
}


const ZOOMS = ['fit', 'floor', '100', 'ceiling'];
const SCENARIOS = [];
// The default 48 × 36 in landscape poster for every subject; 36 × 48 and
// 24 × 36 in portrait ones (fits limited by the canvas's height; 24 × 36 is
// fit-check's worst Hh case) for the subjects at the sheet's top and bottom
// edges.
const MATRIX = [];
for (const [vw, vh] of [[1280, 800], [2560, 1440]]) {
  for (const name of Object.keys(SUBJECTS)) MATRIX.push({ vw, vh, name, pw: 48, ph: 36 });
  for (const name of ['top', 'bottom']) {
    MATRIX.push({ vw, vh, name, pw: 36, ph: 48 });
    MATRIX.push({ vw, vh, name, pw: 24, ph: 36 });
  }
}
for (const { vw, vh, name, pw, ph } of MATRIX) {
  const subj = SUBJECTS[name];
  {
    SCENARIOS.push({
      id: `controls-${vw}x${vh}-${pw}x${ph}-${name}`,
      async run(h) {
        const { context, page, state } = await openEditor(h, {
          viewport: { width: vw, height: vh }, poster: { w: pw, h: ph }, editDoc: subj.edit,
        });
        try {
          await page.getByRole('button', { name: 'Fit poster to screen' }).click();
          await page.waitForTimeout(350);
          const overflowBefore = await page.evaluate(() => {
            const o = document.querySelector('[data-postr-canvas-outer]');
            return { x: o.scrollWidth - o.clientWidth, y: o.scrollHeight - o.clientHeight };
          });
          await subj.select(page);
          if (subj.check) await subj.check(page);
          const steps = {};
          const reached = {};
          for (const z of ZOOMS) {
            if (z === 'fit') {
              await page.getByRole('button', { name: 'Fit poster to screen' }).click();
              await page.waitForTimeout(350);
              reached.fit = await zoomNow(page);
            } else if (z === 'floor') {
              reached.floor = (await stepUntilStable(page, 'Zoom out', 60)).zoom;
            } else if (z === '100') {
              reached['100'] = await pinchTo(page, 1);
            } else {
              reached.ceiling = (await stepUntilStable(page, 'Zoom in', 100)).zoom;
            }
            await centreSelection(page);
            const reading = await readControls(page);
            const whole = reading.sheetHidden <= 0.5;
            steps[z] = {
              zoom: round(reading.zoom, 4), whole, selectedCount: reading.selectedCount, handleCounts: reading.handleCounts, reading,
              verdict: judge(reading, whole), cm: ruleCheck(reading, CORNERS_ONLY),
            };
          }
          if (state.errors.length) throw new Error(`page errors: ${state.errors.join(' | ').slice(0, 200)}`);
          return { vw, vh, pw, ph, subject: name, expectSelected: subj.expectSelected ?? 1, reached, overflowBefore, steps };
        } finally {
          await context.close();
        }
      },
    });
  }
}
// The format toolbar across a pinch (claim Tf, and the K-fixed control).
SCENARIOS.push({
  id: 'toolbar-1280x800-pinch',
  async run(h) {
    const { context, page } = await openEditor(h, { viewport: { width: 1280, height: 800 }, poster: { w: 48, h: 36 } });
    try {
      await page.getByRole('button', { name: 'Fit poster to screen' }).click();
      await page.waitForTimeout(350);
      const text = page.locator('#poster-canvas [data-block-id]', { hasText: 'ZQSENT1' }).last();
      const tb = await text.boundingBox();
      await page.mouse.click(tb.x + 10, tb.y + tb.height / 2);
      await page.waitForTimeout(200);
      const word = page.locator('#poster-canvas [contenteditable="true"]', { hasText: 'ZQSENT1' }).last();
      const wb = await word.boundingBox();
      await page.mouse.dblclick(wb.x + 20, wb.y + wb.height / 2);
      await page.waitForTimeout(400);
      const read = () => page.evaluate(() => {
        const t = [...document.body.children].find((d) => d.style && d.style.position === 'fixed' && d.style.zIndex === '9700');
        const s = window.getSelection();
        const r = s && s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : null;
        if (!t || !r || r.width === 0) return null;
        const tbx = t.getBoundingClientRect();
        // The focus hint sits 4 px under the focused editor, left-aligned.
        const hint = [...document.body.children].find((d) => (d.textContent || '').startsWith('Select text to format'));
        const ed = document.activeElement && document.activeElement.isContentEditable ? document.activeElement.getBoundingClientRect() : null;
        const hb = hint ? hint.getBoundingClientRect() : null;
        return {
          toolbar: { x: tbx.x, y: tbx.y, w: tbx.width, h: tbx.height }, range: { x: r.x, y: r.y, w: r.width, h: r.height },
          gapY: r.top - tbx.bottom, dx: (tbx.x + tbx.width / 2) - (r.x + r.width / 2),
          hintOff: hb && ed ? Math.hypot(hb.left - ed.left, hb.top - (ed.bottom + 4)) : null,
        };
      });
      const before = await read();
      if (!before) throw new Error('precondition: double-clicking a word shows the format toolbar');
      const z0 = await zoomNow(page);
      await pinchTo(page, z0 * 1.6);
      await page.waitForTimeout(300);
      const after = await read();
      const z1 = await zoomNow(page);
      if (!after) return { observed: false, note: 'toolbar or selection gone after the pinch', z0, z1, before };
      const moved = Math.hypot(after.gapY - before.gapY, after.dx - before.dx);
      return {
        observed: moved > 2, z0: round(z0, 4), z1: round(z1, 4), drift: round(moved, 1), before, after,
        hintObserved: after.hintOff !== null && after.hintOff > 2, hintOff: after.hintOff === null ? null : round(after.hintOff, 1),
        fixedOk: Math.abs(after.toolbar.w - before.toolbar.w) <= 0.5 && Math.abs(after.toolbar.h - before.toolbar.h) <= 0.5,
      };
    } finally {
      await context.close();
    }
  },
});

// The whole zoom range, one Zoom in click at a time (claim Sw): the table
// (it carries every kind of block control plus its strips and grips),
// selected at the 1280 × 800 fit, taken to the floor, then clicked up to the
// ceiling. Each step reads every control's fixed size and the WCAG test.
SCENARIOS.push({
  id: 'sweep-1280x800-48x36-table',
  async run(h) {
    const { context, page, state } = await openEditor(h, { viewport: { width: 1280, height: 800 }, poster: { w: 48, h: 36 } });
    try {
      await page.getByRole('button', { name: 'Fit poster to screen' }).click();
      await page.waitForTimeout(350);
      await SUBJECTS.table.select(page);
      await stepUntilStable(page, 'Zoom out', 60);
      const rows = [];
      for (let i = 0; i < 90; i++) {
        const reading = await readControls(page);
        const sel = reading.controls.filter((c) => c.owner !== 'chrome' && c.owner !== 'portal');
        const sizes = {};
        for (const c of sel) {
          const b = baseKind(c.kind);
          const v = c.r[fixedDim(b)];
          sizes[b] = Math.min(sizes[b] ?? Infinity, v);
        }
        const targets = sel.filter((c) => c.target);
        const w = wcag(targets, layoutTolerance(reading.zoom));
        rows.push({
          zoom: reading.zoom, selectedCount: reading.selectedCount, sizes,
          targets: targets.length, under24: targets.filter((c) => c.r.w < 24 || c.r.h < 24).length, failWcag: w.filter((x) => !x.pass).length,
          own: ownOverlaps(targets, reading.zoom).map((o) => `${o.a} / ${o.b} ${o.area} px²`), cm: ruleCheck(reading, CORNERS_ONLY),
          handles: reading.handleCounts,
        });
        const before = reading.zoom;
        await page.getByRole('button', { name: 'Zoom in' }).click();
        await page.waitForTimeout(40);
        if (Math.abs((await zoomNow(page)) - before) < 1e-9) break;
      }
      if (state.errors.length) throw new Error(`page errors: ${state.errors.join(' | ').slice(0, 200)}`);
      return { sweep: rows };
    } finally {
      await context.close();
    }
  },
});

// Claim Rr: two scenarios that move the view with the zoom unchanged
// (lib/rotateRoom.mjs).
SCENARIOS.push(...roomScenarios(SUBJECTS.bottom));
// Claims Or, Or-click, St, Nb, Fd, Fh and Ns (lib/controlReview.mjs).
SCENARIOS.push(...reviewScenarios(SUBJECTS));

/** Per kind, the on-screen width at each zoom (the headline table). */
function sizeTable(results) {
  const rows = {};
  for (const r of results.filter((x) => x.steps)) {
    for (const z of ZOOMS) {
      const st = r.steps[z];
      for (const c of st.reading.controls) {
        const kind = baseKind(c.kind);
        const key = `${r.subject}@${r.pw}x${r.ph}:${kind}`;
        rows[key] ??= {};
        const col = `${r.vw}:${z}`;
        rows[key][col] ??= { w: c.r.w, h: c.r.h, zoom: st.zoom, n: 0 };
        rows[key][col].w = Math.min(rows[key][col].w, c.r.w);
        rows[key][col].h = Math.min(rows[key][col].h, c.r.h);
        rows[key][col].n += 1;
      }
    }
  }
  return rows;
}

const list = SCENARIOS.filter((s) => (ONLY ? ONLY.includes(s.id) : !s.onDemand));
/** The switch a scenario's subject needs (see SWITCHES in the header). */
const needsOf = (id) => (/-crop$|^rotated-click-|^room-/.test(id) ? 'ADJUSTMENTS_ENABLED' : null);
if (ONLY && list.length !== ONLY.length) fail(`unknown --only id: ${ONLY.filter((id) => !SCENARIOS.some((s) => s.id === id))}`);
const h = await startHarness({ name: 'control-size-check', port: PORT }).catch(fail);
const results = [];
let errors = 0;
const switchSkips = [];
try {
  for (const sc of list) {
    const off = switchesOff(needsOf(sc.id));
    if (off.length) {
      switchSkips.push(sc.id);
      results.push({ id: sc.id, skipped: switchOffReason(off) });
      log(`[skipped] ${sc.id} ${switchOffReason(off)}`);
      continue;
    }
    try {
      const r = await sc.run(h);
      results.push({ id: sc.id, ...r });
      if (r.steps) {
        const v = Object.fromEntries(ZOOMS.map((z) => [z, r.steps[z].zoom]));
        const flags = ['T', 'R', 'O', 'Oc'].filter((k) => ZOOMS.some((z) => r.steps[z].verdict[k]));
        if (ZOOMS.some((z) => r.steps[z].cm.length)) flags.push('Cm');
        if (ZOOMS.some((z) => r.steps[z].reading.placement.length)) flags.push('Pl');
        log(`[${flags.length ? 'OBSERVED ' + flags.join(',') : 'not observed'}] ${sc.id} zooms ${JSON.stringify(v)}`);
      } else if (r.room) {
        const bad = r.room.filter((x) => x.verdict);
        log(`[${bad.length ? 'OBSERVED Rr' : 'not observed'}] ${sc.id} zoom ${r.zoom} ${r.room.map((x) => `${x.label}: ${x.inRow ? 'row' : 'below'}${x.verdict ? ` (${x.verdict})` : ''}`).join(' · ')}`);
      } else if (r.sweep) {
        const first = r.sweep[0];
        const last = r.sweep[r.sweep.length - 1];
        log(`[sweep] ${sc.id} ${r.sweep.length} steps, zoom ${round(first.zoom, 3)} → ${round(last.zoom, 3)}`);
      } else if (r.line) {
        log(r.line);
      } else {
        log(`[${r.observed ? 'OBSERVED Tf' : 'not observed'}] ${sc.id} ${JSON.stringify({ z0: r.z0, z1: r.z1, drift: r.drift, hintOff: r.hintOff, fixedOk: r.fixedOk })}`);
      }
    } catch (e) {
      errors += 1;
      results.push({ id: sc.id, error: String(e).slice(0, 300) });
      log(`[ERROR] ${sc.id} ${String(e).slice(0, 200)}`);
    }
  }
} finally {
  await h.stop();
}

// ---------------------------------------------------------------- verdicts
const ctl = results.filter((r) => r.steps);
const controls = { 'K-zoom': [], 'K-select': [], 'K-fixed': [], 'K-hit': [] };
const claims = {
  S: { observed: 0, of: 0, worst: [] }, Sm: { observed: 0, of: 0, off: [] }, T: { observed: 0, of: 0 }, R: { observed: 0, of: 0 },
  'T-fit': { observed: 0, of: 0, cases: [] }, Oc: { observed: 0, of: 0, cases: [] }, Cm: { observed: 0, of: 0, cases: [] },
  Tl: { observed: 0, of: 0, cases: [] }, Sp: { observed: 0, of: 0, worst: [] }, Rr: { observed: 0, of: 0, cases: [] },
  Pl: { observed: 0, of: 0, cases: [] },
  O: { observed: 0, of: 0 }, Tf: { observed: 0, of: 0 }, Ov: { observed: 0, of: 0, cases: [] },
  Od: { observed: 0, of: 'distinct', cases: new Map() }, Oz: { observed: 0, of: 'distinct', cases: [] },
  Rz: { observed: 0, of: 'steps', cases: [] }, Gf: { observed: 0, of: 0, cases: [] }, Sw: { observed: 0, of: 0 },
};
for (const r of ctl) {
  const { reached, steps } = r;
  const fitZ = reached.fit;
  const okFloor = Math.abs(reached.floor - Math.min(0.2, fitZ)) < 1e-6;
  const okCeil = Math.abs(reached.ceiling - 10) < 1e-6;
  const ok100 = Math.abs(reached['100'] - 1) < 0.005;
  const okFit = steps.fit.reading.sheetHidden <= 0.5;
  if (!(okFloor && okCeil && ok100 && okFit)) controls['K-zoom'].push(`${r.id} ${JSON.stringify(reached)} fitHidden=${round(steps.fit.reading.sheetHidden)}`);
  for (const z of ZOOMS) {
    if (steps[z].selectedCount !== r.expectSelected) controls['K-select'].push(`${r.id} at ${z}: ${steps[z].selectedCount} selected`);
  }
  // K-fixed: ZoomBar buttons keep their size across this scenario's zooms.
  const zb = {};
  for (const z of ZOOMS) for (const c of steps[z].reading.controls.filter((x) => x.owner === 'chrome')) (zb[c.kind] ??= []).push(c.r.w);
  for (const [k, ws] of Object.entries(zb)) if (Math.max(...ws) - Math.min(...ws) > 0.5) controls['K-fixed'].push(`${r.id} ${k} ${ws.map((v) => round(v)).join('/')}`);
  if (r.subject === 'title' && r.vw === 1280) {
    const se = steps.fit.reading.controls.find((c) => c.kind === 'handle-se');
    if (!se || !se.hitOk) controls['K-hit'].push(`${r.id} title handle-se at fit: ${se ? se.onTop : 'absent'}`);
  }
  // S and Sm per control kind instance.
  const byKey = {};
  for (const z of ZOOMS) {
    for (const c of steps[z].reading.controls.filter((x) => x.owner !== 'chrome' && x.owner !== 'portal')) {
      (byKey[`${c.owner}:${c.kind}`] ??= []).push({ z: steps[z].zoom, w: c.r.w, h: c.r.h, kind: c.kind, bpx: c.bpx });
    }
  }
  for (const [key, arr] of Object.entries(byKey)) {
    if (arr.length < 2) continue;
    // Sp: the widest border the control draws, on screen, at each zoom.
    claims.Sp.of += 1;
    const bspread = Math.max(...arr.map((a) => a.bpx)) - Math.min(...arr.map((a) => a.bpx));
    if (bspread > ONE_SIZE_PX) {
      claims.Sp.observed += 1;
      claims.Sp.worst.push(`${r.id}/${key}: ${arr.map((a) => `${round(a.bpx)} px at ${a.z}`).join(', ')}`);
    }
    const base = baseKind(arr[0].kind);
    // A group's frame outlines its blocks: it should follow the zoom.
    if (base === 'group-body') continue;
    const dim = fixedDim(base);
    const lo = arr.reduce((a, b) => (b.z < a.z ? b : a));
    const hi = arr.reduce((a, b) => (b.z > a.z ? b : a));
    claims.S.of += 1;
    const ratio = hi[dim] / Math.max(lo[dim], 1e-6);
    const spread = Math.max(...arr.map((a) => a[dim])) - Math.min(...arr.map((a) => a[dim]));
    if (spread > ONE_SIZE_PX) {
      claims.S.observed += 1;
      claims.S.worst.push({ key: `${r.id}/${key}`, lo: [lo.z, round(lo[dim])], hi: [hi.z, round(hi[dim])], ratio: round(ratio, 1), spread: round(spread) });
    }
    const units = DESIGN_UNITS[base];
    // Only fixed-size controls (handles, buttons, strip thicknesses) have a size in units.
    if (units) {
      for (const a of arr) {
        claims.Sm.of += 1;
        if (Math.abs(a[dim] / (units * a.z) - 1) > 0.02) claims.Sm.off.push(`${r.id}/${key} at ${a.z}: ${round(a[dim])} px vs ${round(units * a.z)}`);
        else claims.Sm.observed += 1;
      }
    }
  }
  // Ov: at the fit, selecting the block makes the canvas scroll.
  claims.Ov.of += 1;
  const ov = steps.fit.reading.overflow;
  if (Math.max(ov.x, ov.y) > Math.max(r.overflowBefore.x, r.overflowBefore.y)) {
    claims.Ov.observed += 1;
    claims.Ov.cases.push(`${r.id}: ${JSON.stringify(r.overflowBefore)} -> ${JSON.stringify(ov)}`);
  }
  for (const z of ZOOMS) {
    const v = steps[z].verdict;
    claims.T.of += 1; if (v.T) claims.T.observed += 1;
    claims.O.of += 1; if (v.O) claims.O.observed += 1;
    if (steps[z].whole) { claims.R.of += 1; if (v.R) claims.R.observed += 1; }
    // T-fit: the views a user opens (the fit at 1280 × 800 and 2560 × 1440, and 100%).
    if (z === 'fit' || z === '100') {
      claims['T-fit'].of += 1;
      if (v.Tfit) {
        claims['T-fit'].observed += 1;
        claims['T-fit'].cases.push(`${r.id} at ${z} (${steps[z].zoom}): ${v.tFitFails.join('; ')}`);
      }
      claims.Tl.of += 1;
      if (v.shortStrips.length) {
        claims.Tl.observed += 1;
        claims.Tl.cases.push(`${r.id} at ${z} (${steps[z].zoom}): ${v.shortStrips.join('; ')}`);
      }
    }
    claims.Oc.of += 1;
    if (v.Oc) {
      claims.Oc.observed += 1;
      claims.Oc.cases.push(`${r.id} at ${z} (${steps[z].zoom}): ${v.ownOverlaps.join('; ')}`);
    }
    claims.Pl.of += 1;
    if (steps[z].reading.placement.length) {
      claims.Pl.observed += 1;
      claims.Pl.cases.push(`${r.id} at ${z} (${steps[z].zoom}): ${steps[z].reading.placement.slice(0, 6).join('; ')}`);
    }
    claims.Cm.of += 1;
    if (steps[z].cm.length) {
      claims.Cm.observed += 1;
      claims.Cm.cases.push(`${r.id} at ${z} (${steps[z].zoom}): ${steps[z].cm.join('; ')}`);
    }
  }
  // O split: an overlap seen at every zoom of the scenario comes from the
  // controls' layout in sheet units (it scales with them); one seen at some
  // zooms only comes from the zoom.
  // An overlap is judged in sheet units (present at a zoom when over 0.25
  // unit²); a covered control only at zooms where its centre is on the
  // visible canvas, keyed by the control alone (what covers it is listed).
  const pairsAt = {};
  const seenAt = {};
  const what = {};
  for (const z of ZOOMS) {
    const st = steps[z];
    for (const o of st.verdict.overlapsUnits) {
      const k = `overlap ${o.a} / ${o.b}`;
      (pairsAt[k] ??= []).push(z);
      (what[k] ??= new Set()).add(`${o.units} unit²`);
    }
    for (const c of st.reading.controls.filter((x) => x.target && x.owner !== 'chrome' && x.owner !== 'portal')) {
      const k = `covered ${c.owner}:${c.kind}`;
      if (c.inVis) (seenAt[k] ??= []).push(z);
      if (c.inVis && !c.hitOk && String(c.onTop).startsWith('selection:')) {
        (pairsAt[k] ??= []).push(z);
        (what[k] ??= new Set()).add(`by ${c.onTop}`);
      }
    }
  }
  for (const [k, at] of Object.entries(pairsAt)) {
    const observable = k.startsWith('covered ') ? (seenAt[k] ?? []) : ZOOMS;
    const label = `${k} (${[...what[k]].slice(0, 3).join(', ')})`;
    if (observable.length >= 2 && observable.every((z) => at.includes(z))) {
      // Keyed by subject and pair: the same pair on another poster or engine
      // may differ by a fraction of a unit.
      const key = `${r.subject}: ${k}`;
      if (!claims.Od.cases.has(key)) claims.Od.cases.set(key, new Set());
      for (const w of what[k]) claims.Od.cases.get(key).add(w);
    }
    else claims.Oz.cases.push(`${r.id}: ${label} at ${at.join(',')} of ${observable.join(',')}`);
  }
  // R split by zoom: what sticks out or is covered, and at which zoom.
  for (const z of ZOOMS) {
    if (!steps[z].whole || !steps[z].verdict.R) continue;
    const v = steps[z].verdict;
    claims.Rz.cases.push(`${r.id} at ${z} (${steps[z].zoom}): ${[...v.outside, ...v.coveredByOther].join('; ')}`);
  }
  // Gf: the group frame against its rendered blocks, in sheet units.
  for (const z of ZOOMS) {
    const g = steps[z].reading.groupFit;
    if (!g) continue;
    claims.Gf.of += 1;
    const worst = Object.entries(g.units).reduce((a, b) => (Math.abs(b[1]) > Math.abs(a[1]) ? b : a));
    if (Math.abs(worst[1]) > 1) {
      claims.Gf.observed += 1;
      claims.Gf.cases.push(`${r.id} at ${z}: ${worst[0]} ${round(worst[1], 1)} units (${round(g.px[worst[0]], 1)} px)`);
    }
  }
}
claims.Od.cases = [...claims.Od.cases].map(([k, w]) => `${k} (${[...w].slice(0, 3).join(', ')})`);
claims.Od.observed = claims.Od.cases.length;
claims.Oz.observed = claims.Oz.cases.length;
claims.Rz.observed = claims.Rz.cases.length;

// Sw: the sweep, per kind: px per zoom (a least-squares slope through the
// origin, which is the size in sheet units when the control scales), the
// largest relative miss from that line, and the zoom from which it is 24 px.
const sw = results.find((r) => r.sweep && !r.error);
if (sw) {
  const rows = sw.sweep;
  if (Math.abs(rows[0].zoom - 0.2) > 1e-6 || Math.abs(rows[rows.length - 1].zoom - 10) > 1e-6) controls['K-zoom'].push(`sweep ${round(rows[0].zoom, 4)} → ${round(rows[rows.length - 1].zoom, 4)}`);
  const lost = rows.filter((x) => x.selectedCount !== 1);
  if (lost.length) controls['K-select'].push(`sweep: ${lost.length} steps without the table selected`);
  const kinds = [...new Set(rows.flatMap((x) => Object.keys(x.sizes)))];
  claims.Sw.kinds = {};
  for (const k of kinds) {
    const pts = rows.filter((x) => Number.isFinite(x.sizes[k])).map((x) => [x.zoom, x.sizes[k]]);
    const slope = pts.reduce((a, [z, v]) => a + z * v, 0) / pts.reduce((a, [z]) => a + z * z, 0);
    const miss = Math.max(...pts.map(([z, v]) => Math.abs(v / (slope * z) - 1)));
    const reach = pts.find(([, v]) => v >= 24);
    claims.Sw.kinds[k] = {
      steps: pts.length, unitsPerZoom: round(slope, 3), worstMiss: `${round(miss * 100, 2)}%`,
      atFloor: round(pts[0][1]), atCeiling: round(pts[pts.length - 1][1]),
      reaches24pxAtZoom: reach ? round(reach[0], 3) : null, stepsUnder24: pts.filter(([, v]) => v < 24).length,
    };
    claims.Sw.of += 1;
    const spread = Math.max(...pts.map(([, v]) => v)) - Math.min(...pts.map(([, v]) => v));
    claims.Sw.kinds[k].spread = round(spread);
    if (spread > ONE_SIZE_PX) claims.Sw.observed += 1;
  }
  // Oc and Cm at every step of the sweep.
  for (const x of rows) {
    claims.Oc.of += 1;
    if (x.own.length) { claims.Oc.observed += 1; claims.Oc.cases.push(`sweep at ${round(x.zoom, 2)}: ${x.own.join('; ')}`); }
    claims.Cm.of += 1;
    if (x.cm.length) { claims.Cm.observed += 1; claims.Cm.cases.push(`sweep at ${round(x.zoom, 2)}: ${x.cm.join('; ')}`); }
  }
  const passing = rows.filter((x) => x.failWcag === 0).map((x) => round(x.zoom, 2));
  claims.Sw.wcagPassAtZooms = passing.length ? `${passing.length} of ${rows.length} steps (${passing[0]} … ${passing[passing.length - 1]})` : `0 of ${rows.length} steps`;
  claims.Sw.failWcagByZoom = rows.map((x) => [round(x.zoom, 2), x.failWcag, x.targets]);
}
for (const r of results.filter((x) => x.room)) {
  for (const x of r.room) {
    claims.Rr.of += 1;
    if (x.verdict) { claims.Rr.observed += 1; claims.Rr.cases.push(`${r.id}, ${x.label}: ${x.verdict}`); }
  }
}
const tb = results.find((r) => r.id === 'toolbar-1280x800-pinch' && !r.error);
if (tb) {
  claims.Tf.of = 1;
  claims.Tf.observed = tb.observed ? 1 : 0;
  claims.Th = { observed: tb.hintObserved ? 1 : 0, of: tb.hintOff === null ? 0 : 1, off: tb.hintOff };
  if (tb.fixedOk === false) controls['K-fixed'].push(`format toolbar size changed across the pinch: ${JSON.stringify([tb.before.toolbar, tb.after.toolbar])}`);
}
claims.S.worst = claims.S.worst.sort((a, b) => b.ratio - a.ratio).slice(0, 8);
claims.Sm.off = claims.Sm.off.slice(0, 12);
const review = reviewVerdicts(results);
Object.assign(claims, review.claims);
Object.assign(controls, review.controls);
const controlFailures = Object.values(controls).reduce((n, v) => n + v.length, 0);
const summary = {
  git: h.git, engine: h.engine, mutant: h.mutant, claims, controls, errors, switchSkips,
  table: sizeTable(results),
};
fs.writeFileSync(path.join(h.out, `results-${h.engine}.json`), JSON.stringify({ summary, results }, null, 2));

// The headline: each control's fixed size on screen (CSS px) at the zooms
// a user meets, on the 48 × 36 in poster.
const HEAD_COLS = [['1280:floor', 'floor'], ['1280:fit', 'fit 1280'], ['1280:100', '100%'], ['2560:fit', 'fit 2560'], ['1280:ceiling', 'ceiling']];
const HEAD_KINDS = [
  ['title', 'handle'], ['title', 'handle-dot'], ['title', 'move'], ['title', 'delete'], ['title', 'label'], ['title', 'row'], ['title', 'rotate'], ['title', 'stem'],
  ['leftImage', 'replace'], ['leftImage', 'crop'], ['crop', 'crop-edge-top'], ['crop', 'crop-btn'],
  ['table', 'table-row-sel'], ['table', 'table-col-sel'], ['table', 'table-col-resize'], ['group', 'group-handle'],
];
const tableRows = summary.table;
log(`[table] fixed size on screen, CSS px (zoom): ${HEAD_COLS.map(([, n]) => n).join(' | ')}`);
for (const [subj, kind] of HEAD_KINDS) {
  const row = tableRows[`${subj}@48x36:${kind}`];
  if (!row) continue;
  const dim = fixedDim(kind);
  log(`[table] ${subj}:${kind} (${dim}) ${HEAD_COLS.map(([c]) => (row[c] ? `${round(row[c][dim], 1)} (${round(row[c].zoom, 2)})` : '-')).join(' | ')}`);
}
if (claims.Sw.kinds) for (const [k, v] of Object.entries(claims.Sw.kinds)) log(`[sweep] ${k} ${JSON.stringify(v)}`);
if (claims.Sw.wcagPassAtZooms) log(`[sweep] every grabbable control passes WCAG 2.5.8 at ${claims.Sw.wcagPassAtZooms}`);
log(`[Od] overlaps at every zoom (sheet-unit layout): ${claims.Od.cases.length ? '\n  ' + claims.Od.cases.join('\n  ') : 'none'}`);
log(`[Oz] overlaps at some zooms only: ${claims.Oz.cases.length ? '\n  ' + claims.Oz.cases.join('\n  ') : 'none'}`);
log(`[Rz] outside the canvas or under other chrome, whole-sheet zooms: ${claims.Rz.cases.length ? '\n  ' + claims.Rz.cases.join('\n  ') : 'none'}`);
log(`[Gf] group frame vs rendered blocks: ${claims.Gf.cases.length ? '\n  ' + claims.Gf.cases.join('\n  ') : 'within 1 unit'}`);
log(`[Ov] ${claims.Ov.cases.join(' ; ') || 'none'}`);
claims.Sp.worst = claims.Sp.worst.slice(0, 12);
for (const k of ['T-fit', 'Tl', 'Oc', 'Cm', 'Rr', 'Pl', 'Or', 'Or-tilt', 'Pl-rot', 'Or-click', 'St', 'Nb', 'Fd', 'Fh', 'Fr', 'Ns', 'Fz']) {
  const cs = claims[k]?.cases ?? [];
  log(`[${k}] ${cs.length ? `${cs.length} step(s)\n  ${cs.slice(0, 40).join('\n  ')}${cs.length > 40 ? `\n  … ${cs.length - 40} more` : ''}` : 'none'}`);
}
log(`[harness] claims ${JSON.stringify(Object.fromEntries(Object.entries(claims).map(([k, v]) => [k, `${v.observed} of ${v.of}`])))}`);
log(`[harness] controls ${JSON.stringify(controls)}`);
log(`[harness] ${SWITCH_OFF}: ${switchSkips.length}${switchSkips.length ? ` (${switchSkips.join(', ')})` : ''}`);
const DEFECT = ['S', 'Sw', 'Sp', 'T-fit', 'R', 'Ov', 'Oc', 'Cm', 'Rr', 'Pl', 'Or', 'Pl-rot', 'Or-click', 'St', 'Fd', 'Fh', 'Fr'];
const exit = errors || controlFailures ? 2 : DEFECT.some((k) => claims[k].observed > 0) ? 1 : 0;
log(`[harness] exit=${exit} wrote ${path.join(h.out, `results-${h.engine}.json`)}`);
process.exit(exit);
