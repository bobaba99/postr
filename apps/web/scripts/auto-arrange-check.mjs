#!/usr/bin/env node
/**
 * auto-arrange-check.mjs — Auto-Arrange and the poster's reading order, in a
 * real browser, from the user's entry: Layout tab › Auto-Arrange, then the
 * top bar's Undo (docs/fixes/28-auto-arrange.md).
 *
 * Posters (lib/arrangeScenarios.mjs): the five templates and the welcome
 * poster as a new user meets them, and posters a user has written into
 * (longer text, a crowded sheet, a portrait sheet, a heading pasted into a
 * column, three figures, a 48 × 24 sheet), and, from review round 1, the
 * authors block along the foot (set, and dragged there with the mouse), a
 * block dragged part-way across its column with the mouse, six figures on
 * a 48 × 24 sheet and four columns on a 72 × 48 one.
 *
 * GATES, per poster (exit 1 when one fails)
 *   G1  no font size changes (every text node's computed size, per block);
 *   G2  the reading order of what is drawn (lib/arrangeRead.mjs, the record's
 *       rule) is the same sequence of blocks after as before;
 *   G3  no two blocks overlap by more than 2 units both ways after; when the
 *       poster runs past the bottom margin (the prototype's O ≥ 0.05 in²),
 *       only the credit mark may be covered, by a block reaching past the
 *       margin (Auto-Arrange moves the mark to a free spot when one is left);
 *   G4  every heading, figure and table number shown is the same after;
 *   G5  one press of Undo puts every block back where it was;
 *   G6  under 300 ms from click() to the frame after the new layout is
 *       drawn (the click's own time is read too);
 *   G7  pressing Auto-Arrange a second time moves nothing and adds no undo
 *       step (one Undo after it goes back to the poster before the first);
 *   G8  the editor's columns are the prototype's (docs/fixes/28-auto-arrange-lab.html,
 *       its own arrange() run in the page by lib/arrangeLab.mjs) given the
 *       same block heights, then refined by the record's rule (every width
 *       within ±0.5 in of a centre, in 0.05 in steps, each set with
 *       its best cut points; lib/arrangeSolve.mjs, this harness's own
 *       solver): the same blocks in each column and the same widths (to
 *       0.01 units);
 *   G9  Issues states the area past the bottom margin: when the refined O is
 *       0.05 in² or more, within 0.1 in² of it, and nothing of it otherwise;
 *       with a title or authors block along the foot (O is then measured to
 *       0.6 in above it), the area past the margin as drawn after;
 *   G10 (posters marked `preview`) Export › Preview poster shows every
 *       figure and table with the same "Figure N." / "Table N." as the
 *       canvas, after Auto-Arrange (a sibling found in passing: the preview
 *       was never given the numbers, so it showed no caption at all);
 *   G11 the app's measurement (`measureHeights`, taken before the click, at
 *       each block's new width) is within 0.5 units of the height drawn after
 *       it, for every block it placed;
 *   G12 the number of columns drawn after is the poster's before by the
 *       record's rule (a column of one block that starts inside the column to
 *       its left counts in it), less any column the search leaves empty;
 *   G13 each column starts 0.6 in under the header (the title and authors in
 *       the top half of the sheet, and logos starting above their bottom) and
 *       its blocks are drawn 0.6 in apart (to 0.5 units).
 * READ, not gated: the area of the columns past the bottom margin before and
 * after as drawn, the number of columns before and after, wide blocks'
 * widths, a heading left at the foot of a column, whether the credit mark
 * moved, the prototype's run time and width sets searched, its grid choice's
 * O against the refined O, body blocks off the ½ in grid, (`dragAfter`)
 * where a block dragged straight down after Auto-Arrange lands, and Issues'
 * area past the bottom margin before the press.
 *
 * G8, G9 and G11 need the app's `measureHeights`
 * (src/poster/arrangeMeasure.ts): on a tree without it (main before the fix)
 * they are reported n/a. The prototype's other inputs are read by this
 * harness from the drawn sheet (lib/arrangeRead.mjs), not taken from the
 * app's Auto-Arrange code.
 *
 * BLIND SPOTS: only Chromium unless POSTR_BROWSER says otherwise; images in
 * the welcome poster do not load (the fake backend aborts storage), which
 * does not change a figure's frame (its height is stored); real posters'
 * pasted HTML, rotated blocks and logos inside the body are not covered.
 *
 * RUN (from apps/web)
 *   node scripts/auto-arrange-check.mjs [--only id,id] [--fine]
 *   --fine also reads, per poster of 2 or 3 columns, the least F on the whole 0.05 in grid
 *   with the app's heights (every width measured; slow), against the
 *   refined choice: how far the refinement is from the least.
 *   env PORT (default 5841), OUT_DIR, POSTR_REPO (another tree; run from its
 *   apps/web), POSTR_BROWSER, POSTR_MUTANT
 * EXIT 0 every gate holds · 1 a gate failed · 2 the instrument errored
 *
 * Side effect: rewrites apps/web/public/version.json (Vite's build stamp);
 * restore with `git checkout -- apps/web/public/version.json`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { log, startHarness, openEditor, REPO, WEB } from './lib/editorHarness.mjs';
import { SCENARIOS, templateBlocks, welcomeSeed } from './lib/arrangeScenarios.mjs';
import { labArrangeSource, runLabInPage } from './lib/arrangeLab.mjs';
import {
  readSheetInPage, readingOrderOf, overlapsOf, pastMarginOf, headerBottomOf, bodyBottomOf, hasFooter, columnsOf,
  arrangeColumnsOf, offGridOf, readWidthsInPage,
} from './lib/arrangeRead.mjs';
import { bestOver, centreOf, evaluate, gridSets, neighbourhoodWidths, refine } from './lib/arrangeSolve.mjs';
import { dragMove, clickAway } from './lib/arrangeUi.mjs';

const args = process.argv.slice(2);
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const FINE = args.includes('--fine');
const PORT = Number(process.env.PORT ?? 5841);
const HAS_MEASURE = fs.existsSync(path.join(WEB, 'src/poster/arrangeMeasure.ts'));
const LAB_SRC = labArrangeSource(REPO);

const tabs = (page, name) => page.locator('button[data-postr-tab]').filter({ hasText: new RegExp(`^${name}`, 'i') }).first().click();
/** Press Auto-Arrange: the click's own time, and to the frame after it painted. */
const clickArrange = (page) => page.evaluate(() => new Promise((resolve) => {
  const b = [...document.querySelectorAll('button')].find((x) => /Auto-Arrange/.test(x.textContent));
  const t0 = performance.now();
  b.click();
  const click = performance.now() - t0;
  requestAnimationFrame(() => setTimeout(() => resolve({ click, frame: performance.now() - t0 }), 0));
}));
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/**
 * The prototype's choice for the sheet as drawn now, the app's heights it
 * used, and that choice refined by the record's rule with this harness's own
 * solver: what the editor must arrange.
 */
async function prototypeFor(page, sheet) {
  const body = readingOrderOf(sheet);
  const col = arrangeColumnsOf(sheet.blocks.filter((b) => body.includes(b.id)));
  const k = new Set(col.values()).size;
  const widths = await page.evaluate(readWidthsInPage);
  const types = new Map(sheet.blocks.map((b) => [b.id, b.type]));
  const order = body.map((id) => ({ id, type: types.get(id), col: col.get(id) }));
  await page.evaluate(async (ids) => {
    const m = await import('/src/poster/arrangeMeasure.ts');
    const { usePosterStore } = await import('/src/stores/posterStore.ts');
    const all = usePosterStore.getState().doc.blocks;
    const blocks = ids.map((id) => all.find((b) => b.id === id));
    const at = m.measureHeights(document.querySelector('#poster-canvas'), blocks, []);
    window.__zqHeights = { at, seen: {} };
    window.__zqHeightAt = (i, w) => {
      const v = at(i, w);
      window.__zqHeights.seen[`${i}@${w.toFixed(3)}`] = v;
      return v;
    };
  }, body);
  // The body's top and bottom: the lab reads the body height as
  // H − 2 in − header − 0.6 in, so a footer is given as a shorter sheet.
  const top = headerBottomOf(sheet);
  const bottom = bodyBottomOf(sheet);
  const grid = await page.evaluate(runLabInPage, {
    src: LAB_SRC, W: sheet.W / 10, H: bottom / 10 + 1, header: (top - 10) / 10, k, order,
    lineMinIn: widths.lineMin / 10,
    tableMinIn: Object.fromEntries(Object.entries(widths.tables).map(([id, w]) => [id, w / 10])),
    heightKey: '__zqHeightAt',
  });
  // Refined by the record's rule, from the prototype's grid choice: the
  // centre from this harness's own grid and solver, then its neighbourhood.
  const ws = grid.cols.map((c) => c.w);
  const cuts = [0];
  for (const c of grid.cols) cuts.push(cuts[cuts.length - 1] + c.ids.length);
  const bounds = { BW: grid.BW, wMin: grid.wMin, wMax: grid.wMax };
  const sets = gridSets({ k, ...bounds });
  const heightsAt = (need) => page.evaluate(({ need, n }) => Object.fromEntries(
    need.map((w) => [w.toFixed(3), Array.from({ length: n }, (_, i) => window.__zqHeightAt(i, w))]),
  ), { need, n: body.length });
  const table = await heightsAt([...new Set([...ws, ...sets.flat()])]);
  const ctx = { h: (i, w) => table[w.toFixed(3)][i], Hb: grid.Hb, was: order.map((o) => o.col), wEq: grid.wEq, n: body.length };
  const centre = centreOf(ctx, sets);
  Object.assign(table, await heightsAt(neighbourhoodWidths({ ws: centre, ...bounds })));
  const gridF = evaluate(ctx, ws, cuts).F;
  const best = refine(ctx, { ws, cuts }, centre, bounds);
  const cols = best.ws.map((w, c) => ({ w, ids: body.slice(best.cuts[c], best.cuts[c + 1]) }));
  const seen = await page.evaluate(() => window.__zqHeights.seen);
  // --fine: the least F on the whole 0.05 in grid, every width measured in one pass.
  let fine = null;
  if (FINE && k >= 2 && k <= 3) {
    const fineSets = gridSets({ k, ...bounds }, 0.05);
    const fw = [...new Set(fineSets.flat().map((w) => w.toFixed(3)))].map(Number);
    const ft = await page.evaluate(async ({ ids, fw }) => {
      const m = await import('/src/poster/arrangeMeasure.ts');
      const { usePosterStore } = await import('/src/stores/posterStore.ts');
      const all = usePosterStore.getState().doc.blocks;
      const at = m.measureHeights(document.querySelector('#poster-canvas'), ids.map((id) => all.find((b) => b.id === id)), fw);
      return Object.fromEntries(fw.map((w) => [w.toFixed(3), ids.map((_, i) => at(i, w))]));
    }, { ids: body, fw });
    const f = bestOver({ ...ctx, h: (i, w) => ft[w.toFixed(3)][i] }, fineSets);
    fine = { O: f.O, F: f.F, ws: f.ws, sets: fineSets.length, widths: fw.length };
  }
  return {
    cols, O: best.O, F: best.F, refinedTried: best.tried, centre, gridSets: sets.length, fine, k, lineMin: widths.lineMin, tables: widths.tables, seen, order: body,
    grid: { cols: grid.cols, O: grid.O, F: 1000 * grid.O + grid.U + 8 * grid.moved + 2 * grid.dev, harnessF: gridF, evaluated: grid.evaluated, ms: grid.ms },
    wMin: grid.wMin, wMax: grid.wMax, wEq: grid.wEq,
  };
}

/** Each drawn column's blocks, top to bottom, by the record's columns. */
function drawnColumns(sheet, ids) {
  const col = columnsOf(sheet.blocks.filter((b) => ids.includes(b.id)));
  return [...new Set(col.values())].sort((a, b) => a - b)
    .map((c) => sheet.blocks.filter((b) => col.get(b.id) === c).sort((a, b) => a.y - b.y));
}

async function runScenario(h, sc, t, seed) {
  const { page, context, state } = await openEditor(h, {
    viewport: { width: 1440, height: 900 }, poster: sc.size,
    editDoc: (d) => ({ ...d, ...sc.build(t, seed) }),
  });
  try {
    if (sc.ui) await sc.ui(page);
    // READ: Issues' area past the bottom margin before Auto-Arrange (the
    // poster as the user has it; review round 1, B-R6).
    await tabs(page, 'issues');
    await page.waitForTimeout(300);
    const issueBeforeText = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.innerText).find((x) => /bottom margin/i.test(x)) ?? null);
    await tabs(page, 'layout');
    await page.waitForTimeout(300);
    const before = await page.evaluate(readSheetInPage);
    const hasBody = readingOrderOf(before).length > 0;
    const top = headerBottomOf(before) + 6;
    const fixedInBody = before.blocks.filter((b) => b.type === 'logo' && b.y >= top - 6 && b.y < before.H - 10 && b.y + b.h > top).map((b) => b.id);
    const proto = HAS_MEASURE && hasBody ? await prototypeFor(page, before) : null;
    const { click: ms, frame: frameMs } = await clickArrange(page);
    await page.waitForTimeout(700);
    const after = await page.evaluate(readSheetInPage);
    const byId = (s) => new Map(s.blocks.map((b) => [b.id, b]));
    const A = byId(after);
    const fontChanges = before.blocks.filter((b) => A.get(b.id) && A.get(b.id).fonts !== b.fonts).map((b) => `${b.type}:${b.fonts}→${A.get(b.id).fonts}`);
    const numberChanges = before.blocks.filter((b) => A.get(b.id) && (A.get(b.id).head !== b.head || A.get(b.id).cap !== b.cap))
      .map((b) => `${b.type}:${b.head ?? b.cap}→${A.get(b.id).head ?? A.get(b.id).cap}`);
    const orderBefore = readingOrderOf(before);
    const orderAfter = readingOrderOf(after);
    const orderViolations = orderBefore.filter((id, i) => orderAfter[i] !== id).length;
    const overflowing = (proto?.O ?? 0) >= 0.05;
    const mark = after.blocks.find((b) => b.id === '__postr_ack_mark__');
    const pastLine = (b) => b && b.y + b.h > after.H - 10;
    const overlaps = overlapsOf(after).filter((pair) => {
      if (!overflowing || !mark || !pair.includes('__post')) return true;
      const other = after.blocks.find((b) => b.id !== mark.id && pair.includes(b.id.slice(0, 6)));
      return !pastLine(other);
    });
    const markCovered = overlapsOf(after).filter((pair) => pair.includes('__post'));
    const markBefore = before.blocks.find((b) => b.id === '__postr_ack_mark__');
    const markMoved = mark && markBefore ? !(near(mark.x, markBefore.x, 0.01) && near(mark.y, markBefore.y, 0.01)) : null;
    const moved = before.blocks.filter((b) => {
      const a = A.get(b.id);
      return a && !(near(a.x, b.x, 0.05) && near(a.y, b.y, 0.05) && near(a.w, b.w, 0.05));
    }).length;
    const colsBefore = new Set(columnsOf(before.blocks.filter((b) => orderBefore.includes(b.id))).values()).size;
    const colsAfter = new Set(columnsOf(after.blocks.filter((b) => orderAfter.includes(b.id))).values()).size;
    const wideFrom = (before.W - 20) * 0.9;
    const wide = before.blocks.filter((b) => orderBefore.includes(b.id) && b.w >= wideFrom).map((b) => `${b.type} ${b.w.toFixed(0)}→${A.get(b.id).w.toFixed(0)}`);
    // A heading drawn last in its column (nothing under it).
    const colA = columnsOf(after.blocks.filter((b) => orderAfter.includes(b.id)));
    const footHeadings = after.blocks.filter((b) => b.type === 'heading' && !after.blocks.some((o) => o.id !== b.id && colA.get(o.id) === colA.get(b.id) && o.y > b.y)).length;

    // G8 + the measurement's error.
    let g8 = null;
    let heightErr = null;
    if (proto) {
      const editorCols = [...new Set(colA.values())].sort((a, b) => a - b).map((c) => {
        const ids = orderAfter.filter((id) => colA.get(id) === c);
        return { ids, w: A.get(ids[0]).w };
      });
      const same = (cols) => {
        const full = cols.filter((c) => c.ids.length);
        const cuts = JSON.stringify(editorCols.map((c) => c.ids)) === JSON.stringify(full.map((c) => c.ids));
        const diff = Math.max(...full.map((c, i) => Math.abs((editorCols[i]?.w ?? NaN) - c.w * 10)));
        return { cuts, diff };
      };
      const refined = same(proto.cols);
      const onGrid = same(proto.grid.cols);
      g8 = {
        sameCuts: refined.cuts, widthDiffUnits: Number(refined.diff.toFixed(4)),
        gridChoiceSame: onGrid.cuts && onGrid.diff <= 0.01,
        editor: editorCols.map((c) => `${(c.w / 10).toFixed(2)}in:${c.ids.length}`),
        expected: proto.cols.map((c) => `${c.w.toFixed(2)}in:${c.ids.length}`),
        protoGrid: proto.grid.cols.map((c) => `${c.w.toFixed(2)}in:${c.ids.length}`),
      };
      const errs = [];
      for (const c of proto.cols) {
        for (const id of c.ids) {
          const i = proto.order.indexOf(id);
          const predicted = proto.seen[`${i}@${c.w.toFixed(3)}`];
          if (predicted !== undefined && A.get(id)) errs.push({ id, type: A.get(id).type, d: A.get(id).h - predicted * 10 });
        }
      }
      heightErr = errs.length ? { maxAbsUnits: Number(Math.max(...errs.map((e) => Math.abs(e.d))).toFixed(3)), n: errs.length, worst: errs.sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0] } : null;
    }

    // G12: the number of columns; G13: 0.6 in under the header and apart.
    const emptyCols = proto ? proto.cols.filter((c) => !c.ids.length).length : 0;
    const kBefore = proto?.k ?? null;
    const columnsKept = kBefore === null ? null : colsAfter === kBefore - emptyCols;
    const spacing = [];
    if (hasBody) {
      const headTop = headerBottomOf(before) + 6;
      for (const colBlocks of drawnColumns(after, orderAfter)) {
        if (!near(colBlocks[0].y, headTop, 0.5)) spacing.push(`top ${colBlocks[0].type} ${colBlocks[0].y.toFixed(2)} vs ${headTop.toFixed(2)}`);
        for (let i = 1; i < colBlocks.length; i += 1) {
          const gap = colBlocks[i].y - (colBlocks[i - 1].y + colBlocks[i - 1].h);
          if (!near(gap, 6, 0.5)) spacing.push(`${colBlocks[i - 1].type}→${colBlocks[i].type} ${gap.toFixed(2)}`);
        }
      }
    }

    // G9: Issues.
    await tabs(page, 'issues');
    await page.waitForTimeout(300);
    const issueText = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.innerText).find((x) => /bottom margin/i.test(x)) ?? null);
    const issueArea = issueText ? Number((issueText.match(/([\d.]+)\s*in²/) ?? [])[1]) : null;
    await tabs(page, 'layout');

    // G10: the preview's captions against the canvas's.
    let previewCaps = null;
    if (sc.preview) {
      const caps = () => page.evaluate(() => [...document.querySelectorAll('[data-block-type="image"], [data-block-type="table"]')]
        .map((el) => ({ where: el.closest('#poster-canvas') ? 'canvas' : 'preview', id: el.getAttribute('data-block-id'), cap: (el.innerText.match(/(Figure|Table) \d+\./) ?? [null])[0] })));
      await tabs(page, 'export');
      await page.getByRole('button', { name: /Preview poster/ }).click();
      await page.waitForTimeout(600);
      const all = await caps();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      const canvasCaps = new Map(all.filter((c) => c.where === 'canvas').map((c) => [c.id, c.cap]));
      const shown = all.filter((c) => c.where === 'preview');
      previewCaps = { n: shown.length, matching: shown.filter((c) => c.cap !== null && c.cap === canvasCaps.get(c.id)).length, shown: shown.map((c) => c.cap) };
      await tabs(page, 'layout');
    }

    // G5: one Undo (a press that changed nothing leaves no step to undo; a
    // poster the user dragged first has steps of its own).
    const undoBtn = page.getByRole('button', { name: 'Undo', exact: true });
    const undoable = moved > 0 && (await undoBtn.isEnabled());
    if (undoable) {
      await undoBtn.click();
      await page.waitForTimeout(500);
    }
    const undone = await page.evaluate(readSheetInPage);
    const U = byId(undone);
    const notBack = before.blocks.filter((b) => {
      const u = U.get(b.id);
      return !u || !(near(u.x, b.x, 0.01) && near(u.y, b.y, 0.01) && near(u.w, b.w, 0.01) && u.fonts === b.fonts);
    }).length;
    // G7: redo, then press again.
    if (undoable) {
      await page.getByRole('button', { name: 'Redo', exact: true }).click();
      await page.waitForTimeout(500);
    }
    const redone = await page.evaluate(readSheetInPage);
    if (hasBody) await clickArrange(page);
    await page.waitForTimeout(600);
    const again = await page.evaluate(readSheetInPage);
    const R = byId(redone);
    const secondDetail = again.blocks.filter((b) => {
      const r = R.get(b.id);
      return r && !(near(r.x, b.x, 0.05) && near(r.y, b.y, 0.05) && near(r.w, b.w, 0.05));
    }).map((b) => `${b.type} y ${R.get(b.id).y}→${b.y} x ${R.get(b.id).x}→${b.x}`);
    const secondMoves = secondDetail.length;
    // …and adds no undo step: one Undo now goes back to the poster before the first press.
    let secondStep = null;
    if (undoable && hasBody) {
      await undoBtn.click();
      await page.waitForTimeout(500);
      const U2 = byId(await page.evaluate(readSheetInPage));
      secondStep = before.blocks.some((b) => {
        const u = U2.get(b.id);
        return !u || !(near(u.x, b.x, 0.01) && near(u.y, b.y, 0.01) && near(u.w, b.w, 0.01));
      });
      await page.getByRole('button', { name: 'Redo', exact: true }).click();
      await page.waitForTimeout(500);
    }
    // READ (B-R4): a block of the last column dragged straight down 1 in after Auto-Arrange.
    let dragAfter = null;
    if (sc.dragAfter && hasBody) {
      const sheet = await page.evaluate(readSheetInPage);
      const cols = drawnColumns(sheet, readingOrderOf(sheet));
      const last = cols[cols.length - 1];
      const target = last.find((b) => b.type === 'text') ?? last[0];
      await dragMove(page, target.id, 0, 10);
      await clickAway(page);
      const moved2 = (await page.evaluate(readSheetInPage)).blocks.find((b) => b.id === target.id);
      dragAfter = { type: target.type, x: target.x, xAfter: moved2.x, dx: Number((moved2.x - target.x).toFixed(2)), dy: Number((moved2.y - target.y).toFixed(2)), mates: last.filter((b) => b.id !== target.id).map((b) => b.x) };
    }

    const pastBefore = pastMarginOf(before);
    const pastAfter = pastMarginOf(after);
    // With a title or authors block along the foot, O is measured to 0.6 in
    // above it; Issues states the area past the bottom margin as drawn.
    const issueShould = hasFooter(before) ? pastAfter : proto?.O ?? 0;
    const gates = {
      G1: fontChanges.length === 0,
      G2: orderViolations === 0,
      G3: overlaps.length === 0,
      G4: numberChanges.length === 0,
      G5: notBack === 0,
      G6: sc.timing === 'read' ? null : frameMs < 300,
      G7: secondMoves === 0 && secondStep !== true,
      G8: g8 ? g8.sameCuts && g8.widthDiffUnits <= 0.01 : null,
      G10: previewCaps ? previewCaps.n > 0 && previewCaps.matching === previewCaps.n : null,
      G11: heightErr ? heightErr.maxAbsUnits <= 0.5 : null,
      G9: proto ? (issueShould >= 0.05 ? issueArea !== null && near(issueArea, issueShould, 0.1) : issueArea === null) : null,
      G12: columnsKept,
      G13: hasBody ? spacing.length === 0 : null,
    };
    return {
      id: sc.id, size: `${sc.size.w}x${sc.size.h}`, gates,
      read: {
        clickMs: Number(ms.toFixed(1)), frameMs: Number(frameMs.toFixed(1)), moved, fixedInBody, markCovered, markMoved, colsBefore, colsAfter, kBefore, emptyCols, wide, footHeadings,
        pastMarginBefore: Number(pastBefore.toFixed(2)), pastMarginAfter: Number(pastAfter.toFixed(2)), footer: hasFooter(before),
        protoO: proto ? Number(proto.O.toFixed(3)) : null, gridO: proto ? Number(proto.grid.O.toFixed(3)) : null,
        gridF: proto ? Number(proto.grid.F.toFixed(3)) : null, gridHarnessF: proto ? Number(proto.grid.harnessF.toFixed(3)) : null, refinedF: proto ? Number(proto.F.toFixed(3)) : null,
        protoEvaluated: proto?.grid.evaluated ?? null, refinedTried: proto?.refinedTried ?? null, protoMs: proto ? Number(proto.grid.ms.toFixed(1)) : null,
        fine: proto?.fine ?? null,
        protoWidths: proto ? { wMin: Number(proto.wMin.toFixed(3)), wMax: Number(proto.wMax.toFixed(3)), wEq: Number(proto.wEq.toFixed(3)), lineMin: Number(proto.lineMin.toFixed(2)), tables: proto.tables } : null,
        issueBefore: issueBeforeText ? Number((issueBeforeText.match(/([\d.]+)\s*in²/) ?? [])[1]) : null, issueArea, issueText, g8, heightErr, previewCaps, spacing, offGrid: offGridOf(after), dragAfter,
        fontChanges, numberChanges, orderViolations, overlaps, undoable, undoNotBack: notBack, secondMoves, secondDetail, secondStep,
        headingsBefore: before.blocks.filter((b) => b.head !== null).sort((a, b) => a.head - b.head).map((b) => b.head),
      },
      errors: state.errors,
    };
  } finally {
    await context.close().catch(() => {});
  }
}

let exitCode = 0;
const h = await startHarness({ name: 'auto-arrange', port: PORT });
try {
  const prep = await h.browser.newPage();
  const t = await templateBlocks(prep, h.base);
  await prep.close();
  const seed = await welcomeSeed(REPO);
  const results = [];
  for (const sc of SCENARIOS) {
    if (only && !only.has(sc.id)) continue;
    let r;
    try {
      r = await runScenario(h, sc, t, seed);
    } catch (e) {
      log(`[harness] ${sc.id}: instrument error, retrying alone once: ${String(e).split('\n')[0]}`);
      try {
        r = await runScenario(h, sc, t, seed);
      } catch (e2) {
        r = { id: sc.id, error: String(e2.stack ?? e2).slice(0, 600) };
        exitCode = 2;
      }
    }
    results.push(r);
    if (r.gates) {
      const failed = Object.entries(r.gates).filter(([, v]) => v === false).map(([g]) => g);
      if (failed.length && exitCode === 0) exitCode = 1;
      log(`[${r.id} ${r.size}] ${failed.length ? `FAIL ${failed.join(',')}` : 'ok'} | click ${r.read.clickMs} ms (frame ${r.read.frameMs}), moved ${r.read.moved}, cols ${r.read.colsBefore}→${r.read.colsAfter} (k ${r.read.kBefore}), past margin ${r.read.pastMarginBefore}→${r.read.pastMarginAfter} in² (O grid ${r.read.gridO} → refined ${r.read.protoO}), issue ${r.read.issueArea}, G8 ${r.read.g8 ? `${r.read.g8.sameCuts}/${r.read.g8.widthDiffUnits}${r.read.g8.gridChoiceSame ? ' (= grid choice)' : ''}` : 'n/a'}, height err ${r.read.heightErr?.maxAbsUnits ?? "n/a"}, off grid ${r.read.offGrid}${r.read.fine ? `, fine O ${r.read.fine.O.toFixed(3)} F ${r.read.fine.F.toFixed(1)} (refined F ${r.read.refinedF})` : ''}${r.read.spacing.length ? `, spacing ${r.read.spacing.slice(0, 2).join('; ')}` : ''}${r.read.secondStep ? ', 2nd press added a step' : ''}${r.read.dragAfter ? `, drag after dx ${r.read.dragAfter.dx}` : ''}${r.read.fixedInBody.length ? `, fixed in body ${r.read.fixedInBody.length}` : ""}${r.read.markCovered.length ? `, mark covered ${r.read.markCovered.length}` : ""}`);
    } else log(`[${r.id}] ERROR ${r.error}`);
  }
  const out = path.join(h.out, 'results.json');
  fs.writeFileSync(out, JSON.stringify({ ranAt: new Date().toISOString(), git: h.git, engine: h.engine, mutant: h.mutant, hasMeasure: HAS_MEASURE, results }, null, 1));
  log(`[harness] exit=${exitCode} wrote ${out}`);
} catch (e) {
  log('[harness] fatal:', e?.stack ?? e);
  exitCode = 2;
} finally {
  await h.stop();
}
process.exit(exitCode);
