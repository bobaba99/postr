/**
 * Scenarios for scripts/undo-history-check.mjs from record 36 (select and
 * move like PowerPoint; docs/fixes/36-select-move.md, the MVP design doc
 * bounded-designs.md §3.4). Every press is a real key on the focused
 * element, every drag a real mouse drag, every selection a click on the
 * sheet; the store is read, never written. Each returns
 * { claims: {id: observed}, numbers } (or { info, numbers }); a claim is
 * OBSERVED when the defect is present. The claims are listed in the
 * harness header (the "record 36" block).
 *
 * The rule table (§3.4):
 *   K0  focus in a text field (INPUT, TEXTAREA, SELECT or editable text):
 *       keys go to the field; Delete, arrows, ⌘D, ⌘A and Esc's deselect do
 *       nothing to blocks (OF-11: SELECT was left out);
 *   K1  Esc inside text leaves the text and keeps the block selected;
 *       otherwise it deselects; what is open (the slash menu, a dialog)
 *       takes Esc first;
 *   K2  ⌘A / Ctrl+A outside text selects every block but the credit mark;
 *   K3  an arrow moves the selection ½ in; the fine nudge (Ctrl + arrow,
 *       PowerPoint's on Windows; ⌘ + arrow on a Mac by the same rule: the
 *       record's §2) moves it 0.1 in; any other modifier with an arrow does
 *       nothing to blocks;
 *   K4  a group move or resize is one undo step; Redo re-applies it
 *       (OF-06, item 6); a drag, or an arrow, that changes nothing adds no
 *       step (review round 1, R36-1).
 *
 * Distances are read where they are drawn: a block's box on the sheet,
 * divided by the sheet's own drawn width per inch (`drawnIn`), beside the
 * stored units (1 unit = 0.1 in).
 */
import { MOD, canonical, focusBlockEnd, openTab, press, selectFrame, sleep } from './undoKit.mjs';
import { holdBackspaceNavigation } from './undoScenariosButtonKeys.mjs';

/** The fine nudge's key on this host: ⌘ on a Mac, Ctrl elsewhere (record 36 §2). */
export const FINE = MOD;
/** The other platform's key: with an arrow it must do nothing to blocks here. */
const OTHER = MOD === 'Meta' ? 'Control' : 'Meta';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4AWP4z8DwHwyBAMQgYGBgAAB1SQX7nHNiaQAAAABJRU5ErkJggg==';

/** The shared fixture with a picture in its image block (an empty one opens the file chooser when clicked). */
const withPicture = (doc) => {
  const d = canonical(doc);
  return { ...d, blocks: d.blocks.map((b) => (b.type === 'image' ? { ...b, imageSrc: PNG, imageFit: 'contain' } : b)) };
};

/**
 * withPicture with every column ending above 33 in, so the editor seeds the
 * locked credit mark at load (the 3-column layout at 48 × 36 reaches the
 * band the mark needs, 33.8–35 in, and gets none: PLAN.md "Handed on").
 */
const withMark = (doc) => {
  const d = withPicture(doc);
  return { ...d, blocks: d.blocks.map((b) => (b.y + b.h > 330 ? { ...b, h: Math.max(20, 330 - b.y) } : b)) };
};

const round = (v) => Math.round(v * 1000) / 1000;

/** Every block and the history flags (the store, read only), the blocks marked selected on the sheet, and the focus. */
export const sheetState = (page) => page.evaluate(async () => {
  const m = await import('/src/stores/posterStore.ts');
  const s = m.usePosterStore.getState();
  const a = document.activeElement;
  return {
    blocks: s.doc.blocks.map((b) => ({
      id: b.id, type: b.type, x: b.x, y: b.y, w: b.w, h: b.h, locked: b.locked === true,
      content: b.content ?? '', cells: b.tableData ? b.tableData.cells.join('|') : null,
    })),
    widthIn: s.doc.widthIn, fontFamily: s.doc.fontFamily, canUndo: s.canUndo, canRedo: s.canRedo,
    selected: [...new Set([...document.querySelectorAll('#poster-canvas [data-postr-selected="true"]')].map((e) => e.getAttribute('data-block-id')))].sort(),
    focus: !a || a === document.body ? 'body' : a.isContentEditable
      ? `editable:${a.closest('#poster-canvas [data-block-id]')?.getAttribute('data-block-id') ?? 'outside-sheet'}`
      : `${a.tagName}${a.getAttribute('aria-label') ? `[${a.getAttribute('aria-label')}]` : ''}`,
    textSelection: (getSelection()?.toString() ?? '').replace(/\s+/g, ' ').trim(),
  };
});

/** A block's drawn box on the sheet, in inches: its box over the sheet's drawn width per inch. */
export const drawnIn = (page, id) => page.evaluate(async (id) => {
  const m = await import('/src/stores/posterStore.ts');
  const widthIn = m.usePosterStore.getState().doc.widthIn;
  const sheet = document.getElementById('poster-canvas')?.getBoundingClientRect();
  const el = document.querySelector(`#poster-canvas [data-block-id="${id}"]`);
  if (!sheet || !el) return null;
  const r = el.getBoundingClientRect();
  const ppi = sheet.width / widthIn;
  return { x: (r.left - sheet.left) / ppi, y: (r.top - sheet.top) / ppi, w: r.width / ppi, h: r.height / ppi };
}, id);

const places = (st, ids) => ids.map((id) => {
  const b = st.blocks.find((x) => x.id === id);
  return b ? `${id}@${round(b.x)},${round(b.y)} ${round(b.w)}×${round(b.h)}` : `${id}@gone`;
}).join(' ');
const allPlaces = (st) => places(st, st.blocks.map((b) => b.id));
const idOf = (st, type) => st.blocks.find((b) => b.type === type)?.id ?? null;
const textIds = (st) => st.blocks.filter((b) => b.type === 'text').map((b) => b.id);

/** Wait out a selection's pop (the frame scales while it plays), so a drawn box is read at rest. */
const settle = (page, ms = 700) => page.waitForTimeout(ms);

/** The Style tab's font menu, clicked as a user clicks it; throws unless it then has the focus. */
async function clickFontMenu(page) {
  await openTab(page, 'style');
  const menu = page.locator('[data-postr-sidebar] select, select').filter({ has: page.locator('option[value="Source Sans 3"]') }).first();
  await menu.click();
  await page.waitForTimeout(250);
  const tag = await page.evaluate(() => document.activeElement?.tagName);
  if (tag !== 'SELECT') throw new Error(`a click on the font menu left the focus on ${tag}`);
}

/** Shift + a click near a block's frame corner (the item 12 confirmer's way in, `selectFrame`), adding it to the selection. */
async function addFrame(page, id) {
  const bb = await page.locator(`#poster-canvas [data-block-id="${id}"]`).first().boundingBox();
  await page.keyboard.down('Shift');
  await page.mouse.click(bb.x + 3, bb.y + 3);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(400);
}

/**
 * The group frame a selection of two or more blocks draws (GroupFrame.tsx:
 * selection chrome outside every block, holding resize handles): a point
 * inside it that reaches the frame itself, and its 'se' handle's centre.
 */
const groupFrame = (page) => page.evaluate(() => {
  const frames = [...document.querySelectorAll('#poster-canvas [data-postr-selection-ui]')]
    .filter((el) => !el.closest('[data-block-id]') && el.querySelector('[data-postr-resize-handle]'));
  if (frames.length !== 1) return { error: `${frames.length} group frames` };
  const f = frames[0];
  const r = f.getBoundingClientRect();
  let inside = null;
  for (const fy of [0.5, 0.35, 0.65, 0.2, 0.8]) {
    for (const fx of [0.5, 0.35, 0.65]) {
      const x = r.left + r.width * fx;
      const y = r.top + r.height * fy;
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === f || (f.contains(hit) && !hit.closest('[data-postr-resize-handle]')))) { inside = { x, y }; break; }
    }
    if (inside) break;
  }
  const se = f.querySelector('[data-postr-resize-handle="se"]')?.getBoundingClientRect();
  return { inside, se: se ? { x: se.left + se.width / 2, y: se.top + se.height / 2 } : null };
});

/** A mouse drag: down at `from`, `n` moves of (dx, dy) px, each in its own frame, then up. */
async function drag(page, from, n, dx, dy) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= n; i += 1) {
    await page.mouse.move(from.x + dx * i, from.y + dy * i);
    await sleep(16);
  }
  await page.mouse.up();
  await sleep(300);
}

/** A mouse drag that goes out `n` moves of (dx, dy) px and comes back the same way, released where it was pressed. */
async function dragOutAndBack(page, from, n, dx, dy) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const steps = [...Array.from({ length: n }, (_, i) => i + 1), ...Array.from({ length: n }, (_, i) => n - 1 - i)];
  for (const i of steps) {
    await page.mouse.move(from.x + dx * i, from.y + dy * i);
    await sleep(16);
  }
  await page.mouse.up();
  await sleep(300);
}

/** The centre of an image's move handle (the button above a selected image, "Drag to move"). */
const moveHandle = (page, id) => page.evaluate((id) => {
  const btn = [...document.querySelectorAll('#poster-canvas button[title]')].find((b) => /Drag to move/.test(b.getAttribute('title') || '') && b.closest('[data-block-id]')?.getAttribute('data-block-id') === id);
  if (!btn) return null;
  const r = btn.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, id);

/** The keys K0 presses on a focused menu, each on a new page. */
const MENU_KEYS = ['Backspace', 'Delete', 'ArrowRight', `${MOD}+d`, `${MOD}+a`, 'Escape'];

export const SELECT_MOVE = [
  {
    id: 'SM-K0-keys-on-a-menu', claims: ['K0'],
    editDoc: withPicture,
    how: 'each key on a new page: the references block selected by a click on its frame, the Style tab, a click on its font menu (the focus on a SELECT), then Backspace, Delete, ArrowRight, ⌘D, ⌘A or Esc there (a Backspace still uncancelled after the app is held at the window, B3w): no block may be removed, moved, copied, selected or deselected',
    async run(page, ids, reopen) {
      const claims = { K0: false };
      const numbers = {};
      for (const [i, key] of MENU_KEYS.entries()) {
        const p = i === 0 ? page : (await reopen()).page;
        const ref = idOf(await sheetState(p), 'references');
        await selectFrame(p, ref);
        await clickFontMenu(p);
        const before = await sheetState(p);
        if (before.selected.join() !== ref) throw new Error(`the references block is not the selection at the menu (${before.selected.join(',')})`);
        const url = await holdBackspaceNavigation(p);
        await press(p, key, 400);
        if (p.url() !== url) throw new Error(`${key} left the editor (${url} → ${p.url()})`);
        const after = await sheetState(p);
        const changed = after.blocks.length !== before.blocks.length || allPlaces(after) !== allPlaces(before) || after.selected.join() !== before.selected.join();
        claims.K0 ||= changed;
        numbers[key] = `${changed ? 'CHANGED' : 'nothing'}: blocks ${before.blocks.length}→${after.blocks.length}, selected [${before.selected.join(',')}]→[${after.selected.join(',')}], focus ${after.focus}${allPlaces(after) !== allPlaces(before) ? ', a block MOVED' : ''}`;
      }
      return { claims, numbers };
    },
  },
  {
    // A sibling of OF-11 with the same cause: the table's own Delete /
    // Backspace listener for a range of cells had the same guard
    // (blocks.tsx), so Backspace on a focused menu cleared the cells. Its
    // signature is the range's cells emptied (or, while the editor's own
    // guard missed SELECT too, the whole table removed). A cell edited
    // without being emptied is not that listener: Playwright's WebKit runs
    // a forward Delete pressed on a focused control as a delete of the
    // document's selection, here the text the drag selected in a cell (the
    // engine's own edit, U-10's family: open-findings.md U-10), reported
    // as `engineEdit`, information.
    id: 'SM-K0t-table-range-then-menu', claims: ['K0t'],
    editDoc: withPicture,
    how: 'the table\'s first two cells selected by dragging, the Style tab\'s font menu clicked, Backspace then Delete on it: the table kept and neither cell of the range emptied (a cell edited without being emptied is reported as engineEdit, information)',
    async run(page) {
      const st0 = await sheetState(page);
      const table = idOf(st0, 'table');
      const td = (i) => page.locator(`#poster-canvas [data-block-id="${table}"] td`).nth(i);
      const [c0, c1] = [await td(0).boundingBox(), await td(1).boundingBox()];
      await page.mouse.move(c0.x + c0.width / 2, c0.y + c0.height / 2);
      await page.mouse.down();
      await page.mouse.move(c1.x + c1.width / 2, c1.y + c1.height / 2, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(300);
      const range = await page.evaluate(() => document.querySelector('#poster-canvas [data-postr-cell-range]') !== null);
      const dragged = await page.evaluate(() => (getSelection()?.toString() ?? '').trim());
      await clickFontMenu(page);
      const before = await sheetState(page);
      const cellsOf = (st) => st.blocks.find((b) => b.id === table)?.cells.split('|') ?? null;
      const c = [cellsOf(before)];
      const url = await holdBackspaceNavigation(page);
      for (const key of ['Backspace', 'Delete']) {
        await press(page, key, 300);
        c.push(cellsOf(await sheetState(page)));
      }
      if (page.url() !== url) throw new Error(`Backspace left the editor (${url} → ${page.url()})`);
      const emptied = (x) => !x || [0, 1].some((i) => c[0][i] !== '' && x[i] === '');
      const edited = (x) => !!x && x.join('|') !== c[0].join('|');
      const show = (x) => (x ? JSON.stringify(x.slice(0, 3).join('|')) : 'the table REMOVED');
      return {
        claims: { K0t: emptied(c[1]) || emptied(c[2]) },
        numbers: {
          rangeShownAfterDrag: range, textTheDragSelected: JSON.stringify(dragged), selectedAtMenu: `[${before.selected.join(',')}]`,
          cells: `${show(c[0])} → Backspace ${show(c[1])} → Delete ${show(c[2])}`,
          engineEdit: (edited(c[1]) && !emptied(c[1])) || (edited(c[2]) && !emptied(c[2])),
        },
      };
    },
  },
  {
    id: 'SM-K1-escape', claims: ['K1', 'K1c', 'K1d'],
    editDoc: withPicture,
    how: 'K1: the caret at the end of text block 1 (a click), Esc, then Delete: the caret out of the text with block 1 selected, its text unchanged, then block 1 removed; K1c: the same from a table cell (a click in its first cell); K1d: the references block selected by a click on its frame, Esc: nothing selected; then it and the table selected (Shift + click on the table\'s frame), Esc: nothing selected',
    async run(page, ids, reopen) {
      const numbers = {};
      // K1: text block 1.
      const [a] = ids;
      await focusBlockEnd(page, a);
      const t0 = await sheetState(page);
      await press(page, 'Escape', 300);
      const t1 = await sheetState(page);
      const url = await holdBackspaceNavigation(page);
      await press(page, 'Delete', 300);
      if (page.url() !== url) throw new Error(`Delete left the editor (${url} → ${page.url()})`);
      const t2 = await sheetState(page);
      const textOf = (st) => st.blocks.find((b) => b.id === a)?.content ?? null;
      const k1 = t1.focus !== 'body' || t1.selected.join() !== a || textOf(t1) !== textOf(t0) || t2.blocks.some((b) => b.id === a);
      numbers.K1 = `focus ${t0.focus} → Esc → ${t1.focus}, selected [${t1.selected.join(',')}], text ${textOf(t1) === textOf(t0) ? 'unchanged' : 'CHANGED'}; Delete → block 1 ${t2.blocks.some((b) => b.id === a) ? `KEPT (text …${JSON.stringify((textOf(t2) ?? '').slice(-12))})` : 'removed'}`;
      // K1c: a table cell.
      const { page: p } = await reopen();
      const s0 = await sheetState(p);
      const table = idOf(s0, 'table');
      await p.locator(`#poster-canvas [data-block-id="${table}"] td`).first().click();
      await p.waitForTimeout(300);
      const c0 = await sheetState(p);
      if (!c0.focus.startsWith('editable:')) throw new Error(`a click in the first cell left the focus on ${c0.focus}`);
      await press(p, 'Escape', 300);
      const c1 = await sheetState(p);
      const url2 = await holdBackspaceNavigation(p);
      await press(p, 'Delete', 300);
      if (p.url() !== url2) throw new Error(`Delete left the editor (${url2} → ${p.url()})`);
      const c2 = await sheetState(p);
      const cellsOf = (st) => st.blocks.find((b) => b.id === table)?.cells ?? null;
      const k1c = c1.focus !== 'body' || c1.selected.join() !== table || cellsOf(c1) !== cellsOf(c0) || c2.blocks.some((b) => b.id === table);
      numbers.K1c = `focus ${c0.focus} → Esc → ${c1.focus}, selected [${c1.selected.join(',')}], cells ${cellsOf(c1) === cellsOf(c0) ? 'unchanged' : 'CHANGED'}; Delete → the table ${c2.blocks.some((b) => b.id === table) ? 'KEPT' : 'removed'}`;
      // K1d: outside text, one block and then two.
      const { page: q } = await reopen();
      const r0 = await sheetState(q);
      const ref = idOf(r0, 'references');
      const tbl = idOf(r0, 'table');
      await selectFrame(q, ref);
      const d0 = await sheetState(q);
      await press(q, 'Escape', 300);
      const d1 = await sheetState(q);
      await selectFrame(q, ref);
      await addFrame(q, tbl);
      const g0 = await sheetState(q);
      await press(q, 'Escape', 300);
      const g1 = await sheetState(q);
      const k1d = d0.selected.join() !== ref || d1.selected.length > 0 || g0.selected.length !== 2 || g1.selected.length > 0 || allPlaces(g1) !== allPlaces(r0);
      numbers.K1d = `one: [${d0.selected.join(',')}] focus ${d0.focus} → Esc → [${d1.selected.join(',')}]; two: [${g0.selected.join(',')}] → Esc → [${g1.selected.join(',')}]`;
      return { claims: { K1: k1, K1c: k1c, K1d: k1d }, numbers };
    },
  },
  {
    // Esc keeps the jobs it has where something open takes it first.
    id: 'SM-K1o-escape-open-things-first', claims: ['K1s', 'K1m'],
    editDoc: withPicture,
    how: 'K1s: " /al" typed at the end of text block 1 (the slash menu opens), Esc: the menu closed, the caret still in block 1, block 1 selected, the text kept; K1m: the references block selected, Layout › 3-Column Classic (its dialog opens), Esc: the dialog closed, no block changed, the references block still selected',
    async run(page, ids, reopen) {
      const [a] = ids;
      await focusBlockEnd(page, a);
      await page.keyboard.type(' /al', { delay: 40 });
      await page.waitForTimeout(400);
      const menuOpen = () => page.evaluate(() => [...document.querySelectorAll('[role="listbox"]')].some((e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed'));
      const m0 = await menuOpen();
      if (!m0) throw new Error('typing " /al" opened no slash menu');
      const s0 = await sheetState(page);
      await press(page, 'Escape', 300);
      const s1 = await sheetState(page);
      const m1 = await menuOpen();
      const textOf = (st) => st.blocks.find((b) => b.id === a)?.content ?? '';
      const k1s = m1 || s1.focus !== `editable:${a}` || s1.selected.join() !== a || textOf(s1) !== textOf(s0);
      // K1m: a dialog.
      const { page: p } = await reopen();
      const ref = idOf(await sheetState(p), 'references');
      await selectFrame(p, ref);
      await openTab(p, 'layout');
      await p.locator('[data-postr-sidebar] button').filter({ hasText: /^3-Column Classic/ }).first().click();
      const dialog = p.locator('[role="dialog"]:not([data-state="closing"]), [data-postr-modal-content]:not([data-state="closing"])');
      await dialog.first().waitFor({ state: 'visible', timeout: 4000 });
      const d0 = await sheetState(p);
      await press(p, 'Escape', 600);
      const open = await dialog.count();
      const d1 = await sheetState(p);
      const k1m = open > 0 || d1.selected.join() !== ref || allPlaces(d1) !== allPlaces(d0) || d1.blocks.length !== d0.blocks.length;
      return {
        claims: { K1s: k1s, K1m: k1m },
        numbers: {
          K1s: `menu ${m0 ? 'open' : 'closed'} → Esc → ${m1 ? 'STILL OPEN' : 'closed'}, focus ${s0.focus} → ${s1.focus}, selected [${s1.selected.join(',')}], text ${textOf(s1) === textOf(s0) ? 'kept' : 'CHANGED'}`,
          K1m: `dialog open, selected [${d0.selected.join(',')}] → Esc → dialogs ${open}, selected [${d1.selected.join(',')}], blocks ${d0.blocks.length}→${d1.blocks.length}${allPlaces(d1) !== allPlaces(d0) ? ', a block MOVED' : ''}`,
        },
      };
    },
  },
  {
    id: 'SM-K2-select-all', claims: ['K2', 'K2t'],
    editDoc: withMark,
    how: 'a poster carrying the locked credit mark: K2, a click on the empty workspace (nothing selected), ⌘A; then the references block selected, ⌘A: every block but the mark selected both times; K2t: the caret in text block 1, ⌘A: the text selected, the selection still block 1 alone',
    async run(page, ids, reopen) {
      const st0 = await sheetState(page);
      const mark = st0.blocks.find((b) => b.locked);
      if (!mark) throw new Error('precondition: the editor seeded no credit mark on this poster');
      const want = st0.blocks.filter((b) => !b.locked).map((b) => b.id).sort().join();
      const outer = await page.locator('[data-postr-canvas-outer]').boundingBox();
      const sheet = await page.locator('#poster-canvas').boundingBox();
      await page.mouse.click(outer.x + outer.width / 2, (sheet.y + sheet.height + outer.y + outer.height) / 2);
      await page.waitForTimeout(300);
      const n0 = await sheetState(page);
      await press(page, `${MOD}+a`, 400);
      const a1 = await sheetState(page);
      const ref = idOf(st0, 'references');
      await selectFrame(page, ref);
      await press(page, `${MOD}+a`, 400);
      const a2 = await sheetState(page);
      const k2 = n0.selected.length !== 0 || a1.selected.join() !== want || a2.selected.join() !== want;
      // K2t: inside text.
      const { page: p } = await reopen();
      const [a] = textIds(await sheetState(p));
      await focusBlockEnd(p, a);
      await press(p, `${MOD}+a`, 400);
      const t1 = await sheetState(p);
      const plain = await p.evaluate((id) => (document.querySelector(`#poster-canvas [data-block-id="${id}"] [contenteditable]`)?.textContent ?? '').replace(/\s+/g, ' ').trim(), a);
      const k2t = t1.selected.join() !== a || t1.focus !== `editable:${a}` || t1.textSelection !== plain;
      return {
        claims: { K2: k2, K2t: k2t },
        numbers: {
          blocks: `${st0.blocks.length} (the mark ${mark.id} at ${round(mark.x)},${round(mark.y)})`,
          fromNothing: `[${n0.selected.length}] → ⌘A → ${a1.selected.length} selected, mark ${a1.selected.includes(mark.id) ? 'SELECTED' : 'left out'}${a1.selected.join() === want ? '' : ` (want ${want.split(',').length})`}`,
          fromOne: `⌘A → ${a2.selected.length} selected, mark ${a2.selected.includes(mark.id) ? 'SELECTED' : 'left out'}`,
          inText: `selected [${t1.selected.join(',')}], focus ${t1.focus}, text selected ${t1.textSelection === plain ? 'all' : JSON.stringify(t1.textSelection.slice(0, 40))}`,
        },
      };
    },
  },
  {
    id: 'SM-K3-nudge', claims: ['K3', 'K3f', 'K3x'],
    editDoc: withPicture,
    how: `the image selected by a click on its frame; K3: ArrowRight, ArrowDown (each ½ in, drawn and stored); K3f: ${FINE} + ArrowRight, ${FINE} + ArrowDown (each 0.1 in); K3x: Shift, Alt, Shift + ${FINE}, Alt + ${FINE}, ${OTHER} with ArrowRight and ArrowDown (no move)`,
    async run(page) {
      const img = idOf(await sheetState(page), 'image');
      await selectFrame(page, img);
      await settle(page);
      const rows = [];
      const step = async (key) => {
        const s0 = await sheetState(page);
        const d0 = await drawnIn(page, img);
        const url = page.url();
        await press(page, key, 350);
        if (page.url() !== url) throw new Error(`${key} left the editor (${url} → ${page.url()})`);
        const s1 = await sheetState(page);
        const d1 = await drawnIn(page, img);
        const b0 = s0.blocks.find((b) => b.id === img);
        const b1 = s1.blocks.find((b) => b.id === img);
        const r = { key, dxIn: round(d1.x - d0.x), dyIn: round(d1.y - d0.y), dxUnits: round(b1.x - b0.x), dyUnits: round(b1.y - b0.y), selected: s1.selected.join() };
        rows.push(r);
        return r;
      };
      const near = (v, want) => Math.abs(v - want) <= 0.005;
      let k3 = false; let k3f = false; let k3x = false;
      for (const [key, dx, dy] of [['ArrowRight', 0.5, 0], ['ArrowDown', 0, 0.5]]) {
        const r = await step(key);
        k3 ||= !near(r.dxIn, dx) || !near(r.dyIn, dy) || !near(r.dxUnits, dx * 10) || !near(r.dyUnits, dy * 10);
      }
      for (const [key, dx, dy] of [[`${FINE}+ArrowRight`, 0.1, 0], [`${FINE}+ArrowDown`, 0, 0.1]]) {
        const r = await step(key);
        k3f ||= !near(r.dxIn, dx) || !near(r.dyIn, dy) || !near(r.dxUnits, dx * 10) || !near(r.dyUnits, dy * 10);
      }
      for (const mod of ['Shift', 'Alt', `Shift+${FINE}`, `Alt+${FINE}`, OTHER]) {
        for (const arrow of ['ArrowRight', 'ArrowDown']) {
          const r = await step(`${mod}+${arrow}`);
          k3x ||= !near(r.dxIn, 0) || !near(r.dyIn, 0) || r.dxUnits !== 0 || r.dyUnits !== 0;
        }
      }
      const sel = rows.every((r) => r.selected === img);
      return {
        claims: { K3: k3 || !sel, K3f: k3f, K3x: k3x },
        numbers: Object.fromEntries(rows.map((r) => [r.key, `drawn Δ ${r.dxIn}, ${r.dyIn} in · stored Δ ${r.dxUnits}, ${r.dyUnits} units`])),
      };
    },
  },
  {
    id: 'SM-K4-group-steps', claims: ['K4m', 'K4r'],
    editDoc: withPicture,
    how: 'the references block and the table selected (a click on one frame, Shift + click on the other; an image is not used: SM-I-shift-click-image); K4m: the group frame dragged 12 moves of (6, 4) px; one ⌘Z: both blocks where they were (stored exactly, drawn within 0.005 in); one ⌘⇧Z: both where the drag left them; K4r: on a new page the group\'s se handle dragged 12 moves of (5, 4) px, the same checks with widths and heights',
    async run(page, ids, reopen) {
      const numbers = {};
      const one = async (p, mode) => {
        const st = await sheetState(p);
        const pair = [idOf(st, 'references'), idOf(st, 'table')];
        await selectFrame(p, pair[0]);
        await addFrame(p, pair[1]);
        await settle(p);
        const s0 = await sheetState(p);
        if (s0.selected.join() !== [...pair].sort().join()) throw new Error(`the two blocks are not the selection ([${s0.selected.join(',')}])`);
        const f = await groupFrame(p);
        if (f.error || !f.inside || !f.se) throw new Error(`no group frame to drag (${f.error ?? (f.inside ? 'no se handle' : 'no point reaches the frame')})`);
        const d0 = await Promise.all(pair.map((id) => drawnIn(p, id)));
        if (mode === 'move') await drag(p, f.inside, 12, 6, 4);
        else await drag(p, f.se, 12, 5, 4);
        await settle(p, 400);
        const s1 = await sheetState(p);
        const moved = places(s1, pair) !== places(s0, pair);
        await press(p, `${MOD}+z`, 400);
        const s2 = await sheetState(p);
        const d2 = await Promise.all(pair.map((id) => drawnIn(p, id)));
        await press(p, `${MOD}+Shift+z`, 400);
        const s3 = await sheetState(p);
        const drawnBack = d2.every((d, i) => d && ['x', 'y', 'w', 'h'].every((k) => Math.abs(d[k] - d0[i][k]) <= 0.005));
        const undone = places(s2, pair) === places(s0, pair) && allPlaces(s2) === allPlaces(s0) && drawnBack;
        const redone = places(s3, pair) === places(s1, pair);
        numbers[mode === 'move' ? 'K4m' : 'K4r'] = `before ${places(s0, pair)} · after the drag ${places(s1, pair)} · one ⌘Z ${places(s2, pair)}${drawnBack ? '' : ' (drawn NOT back)'} · one ⌘⇧Z ${places(s3, pair)}`;
        return !moved || !undone || !redone;
      };
      const k4m = await one(page, 'move');
      const { page: p } = await reopen();
      const k4r = await one(p, 'resize');
      return { claims: { K4m: k4m, K4r: k4r }, numbers };
    },
  },
  {
    // Review round 1, R36-1 (the reviewer's `jiggle` probe, folded in): a
    // drag that ends where it started changed nothing and still added an
    // undo step, so the next ⌘Z showed nothing visible. The group's drag
    // and one block's drag shared the cause with an arrow pressed at the
    // sheet's edge (K3e): the store's setBlocks pushed a step with no check
    // for a change, where updateBlock, patchDoc and removeBlock had one.
    id: 'SM-K4j-drag-that-changes-nothing', claims: ['K4j', 'K3e'],
    editDoc: withPicture,
    how: 'K4j, for the group (the references block and the table, by the group frame) and for one block (the image, by its move handle), each on a new page: a drag of 12 moves of (6, 4) px (it lands on the grid); then a drag out 6 moves of (6, 4) px and back, released where it was pressed; then 16 Zoom in clicks and a drag of 2 moves of (3, 0) px (past the 4 px start, under half a grid step, the reviewer\'s case): neither may change a block, and one ⌘Z must then put every block back where it was before the first drag (stored exactly); K3e: the image selected by its frame, ArrowLeft until its x is 0 and once more (nothing moves): one ⌘Z must put it back where the last move started',
    async run(page, ids, reopen) {
      const numbers = {};
      const one = async (p, mode) => {
        const st = await sheetState(p);
        const ref = idOf(st, 'references');
        const tbl = idOf(st, 'table');
        const img = idOf(st, 'image');
        const moving = mode === 'group' ? [ref, tbl] : [img];
        await selectFrame(p, moving[0]);
        if (mode === 'group') await addFrame(p, moving[1]);
        await settle(p);
        const s0 = await sheetState(p);
        if (s0.selected.join() !== [...moving].sort().join()) throw new Error(`${mode}: the selection is [${s0.selected.join(',')}]`);
        const grip = async () => {
          if (mode === 'group') {
            const f = await groupFrame(p);
            if (f.error || !f.inside) throw new Error(`no group frame to drag (${f.error ?? 'no point reaches the frame'})`);
            return f.inside;
          }
          const h = await moveHandle(p, img);
          if (!h) throw new Error('no move handle on the image');
          return h;
        };
        await drag(p, await grip(), 12, 6, 4);
        await settle(p, 400);
        const s1 = await sheetState(p);
        if (places(s1, moving) === places(s0, moving)) throw new Error(`${mode}: the first drag moved nothing`);
        await dragOutAndBack(p, await grip(), 6, 6, 4);
        await settle(p, 400);
        const s2 = await sheetState(p);
        for (let i = 0; i < 16; i += 1) {
          await p.getByRole('button', { name: 'Zoom in' }).click();
          await p.waitForTimeout(60);
        }
        await p.waitForTimeout(400);
        await p.evaluate((id) => document.querySelector(`#poster-canvas [data-block-id="${id}"]`)?.scrollIntoView({ block: 'center', inline: 'center' }), moving[0]);
        await p.waitForTimeout(300);
        const ppi = await p.evaluate(async () => {
          const m = await import('/src/stores/posterStore.ts');
          return document.getElementById('poster-canvas').getBoundingClientRect().width / m.usePosterStore.getState().doc.widthIn;
        });
        await drag(p, await grip(), 2, 3, 0);
        await settle(p, 400);
        const s3 = await sheetState(p);
        await press(p, `${MOD}+z`, 500);
        const s4 = await sheetState(p);
        const unchanged = allPlaces(s2) === allPlaces(s1) && allPlaces(s3) === allPlaces(s1);
        const back = allPlaces(s4) === allPlaces(s0);
        numbers[mode] = `before ${places(s0, moving)} · a drag ${places(s1, moving)} · out and back ${places(s2, moving)}${allPlaces(s2) === allPlaces(s1) ? '' : ' (CHANGED)'} · 6 px at ${round(ppi)} px/in (${round((6 / ppi) * 10)} units) ${places(s3, moving)}${allPlaces(s3) === allPlaces(s1) ? '' : ' (CHANGED)'} · one ⌘Z ${places(s4, moving)}${back ? '' : ' (NOT back)'}`;
        return !unchanged || !back;
      };
      const group = await one((await reopen()).page, 'group');
      const single = await one((await reopen()).page, 'single');
      // K3e: an arrow at the sheet's edge (the image: a click on a text
      // block's frame can land in its text, where the arrows are the text's).
      const a = idOf(await sheetState(page), 'image');
      await selectFrame(page, a);
      await settle(page);
      const xOf = async () => (await sheetState(page)).blocks.find((b) => b.id === a).x;
      const xs = [await xOf()];
      for (let i = 0; i < 80 && xs[xs.length - 1] > 0; i += 1) {
        await press(page, 'ArrowLeft', 150);
        xs.push(await xOf());
      }
      if (xs[xs.length - 1] !== 0 || xs.length < 2) throw new Error(`the image did not reach the left edge (${xs.map(round).join(' → ')})`);
      const lastStart = xs[xs.length - 2];
      await press(page, 'ArrowLeft', 300);
      const atEdge = await xOf();
      await press(page, `${MOD}+z`, 400);
      const afterUndo = await xOf();
      numbers.K3e = `x ${xs.map(round).join(' → ')}; ArrowLeft at the edge → ${round(atEdge)}; one ⌘Z → ${round(afterUndo)} (want ${round(lastStart)})`;
      return { claims: { K4j: group || single, K3e: atEdge !== 0 || afterUndo !== lastStart }, numbers };
    },
  },
  {
    // Information, review round 1, R36-2 (the reviewer's nav-keys and
    // nav-save probes, folded in): the rule leaves Alt + arrow and the other
    // platform's key + arrow to the browser (main cancelled every arrow
    // with a block selected, as a ½ in nudge). In Playwright's WebKit both
    // chords are the browser's Back; Chromium and Firefox through
    // Playwright run no browser shortcuts. The control: a nudge, then the
    // page's own Back at once (no key), to see whether an edit made just
    // before leaving is saved whatever the way out (fix 27's flush).
    id: 'SM-I-arrow-chords-leave', info: true,
    editDoc: withPicture,
    how: `information: the references block selected, each on a new page: Alt + ArrowLeft, and ${OTHER} + ArrowLeft (the other platform's key): did the page leave the editor (read 1.5 s after), and did the app cancel the key? Then a nudge (ArrowRight) followed at once by ${OTHER} + ArrowLeft, and a nudge followed at once by history.back() (no key, the control): was the nudge saved (the fake backend's row, read 3 s after)?`,
    async run(page, ids, reopen) {
      const numbers = {};
      for (const chord of ['Alt+ArrowLeft', `${OTHER}+ArrowLeft`]) {
        const { page: p } = await reopen();
        await selectFrame(p, idOf(await sheetState(p), 'references'));
        await p.evaluate(() => {
          window.__arrowCancelled = null;
          window.addEventListener('keydown', (e) => { if (e.key.startsWith('Arrow')) window.__arrowCancelled = e.defaultPrevented; });
        });
        const url = p.url();
        await press(p, chord, 1500);
        const left = p.url() !== url;
        numbers[chord] = left ? 'LEFT the editor' : `stayed, cancelled ${await p.evaluate(() => window.__arrowCancelled)}`;
      }
      for (const way of [`${OTHER}+ArrowLeft`, 'history.back()']) {
        const o = await reopen();
        const p = o.page;
        const ref = idOf(await sheetState(p), 'references');
        await selectFrame(p, ref);
        const x0 = o.state.row.data.blocks.find((b) => b.id === ref).x;
        const saves0 = o.state.saves.length;
        const url = p.url();
        await p.keyboard.press('ArrowRight');
        if (way === 'history.back()') await p.evaluate(() => history.back());
        else await p.keyboard.press(way);
        await p.waitForTimeout(3000);
        const left = p.url() !== url;
        const x1 = o.state.row.data.blocks.find((b) => b.id === ref).x;
        numbers[`nudge then ${way}`] = `${left ? 'left the editor' : 'stayed'}; saved x ${round(x0)} → ${round(x1)} (${round(x1) === round(x0 + 5) ? 'the nudge saved' : 'the nudge NOT saved'}), ${o.state.saves.length - saves0} save(s)`;
      }
      return { numbers };
    },
  },
  {
    // Information, found while writing K4 (older than record 36, outside its
    // rule table): an image's pointerdown is left to the canvas (blocks.tsx
    // BlockFrame: an image moves by its handle), whose click-without-drag
    // clears the selection before the image's own click adds it.
    id: 'SM-I-shift-click-image', info: true,
    editDoc: withPicture,
    how: 'information: the references block selected by a click on its frame, then Shift + click on the image\'s frame, and on the table\'s frame: which blocks are selected after each?',
    async run(page, ids, reopen) {
      const st = await sheetState(page);
      const ref = idOf(st, 'references');
      await selectFrame(page, ref);
      await addFrame(page, idOf(st, 'image'));
      const a = await sheetState(page);
      const { page: p } = await reopen();
      const st2 = await sheetState(p);
      await selectFrame(p, idOf(st2, 'references'));
      await addFrame(p, idOf(st2, 'table'));
      const b = await sheetState(p);
      const name = (s, id) => s.blocks.find((x) => x.id === id)?.type ?? id;
      return { numbers: { refThenShiftImage: `[${a.selected.map((id) => name(a, id)).join(',')}]`, refThenShiftTable: `[${b.selected.map((id) => name(b, id)).join(',')}]` } };
    },
  },
  {
    // Information: the block menu (a right-click on an image) has no Esc of
    // its own today; what Esc does while it is open.
    id: 'SM-I-escape-block-menu', info: true,
    editDoc: withPicture,
    how: 'information: a right-click on the image (its block menu opens), Esc: is the menu still open, and is the image still selected?',
    async run(page) {
      const img = idOf(await sheetState(page), 'image');
      const bb = await page.locator(`#poster-canvas [data-block-id="${img}"]`).first().boundingBox();
      await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2, { button: 'right' });
      await page.waitForTimeout(300);
      const menu = () => page.getByRole('button', { name: /^Bring Forward/ }).count();
      const open0 = await menu();
      const s0 = await sheetState(page);
      await press(page, 'Escape', 300);
      const open1 = await menu();
      const s1 = await sheetState(page);
      return { numbers: { menu: `${open0 ? 'open' : 'not open'} → Esc → ${open1 ? 'open' : 'closed'}`, selected: `[${s0.selected.join(',')}] → [${s1.selected.join(',')}]` } };
    },
  },
];
