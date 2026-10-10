/**
 * Scenarios for scripts/undo-history-check.mjs from fix 12's merge with main
 * (record docs/fixes/12-one-undo-history.md, section 11; the merge review's
 * F1, folded in from its probe undo-controls.mjs): every drag is ONE undo
 * step, from pointerdown to pointerup (PowerPoint), as move, resize and
 * rotate drags already were. A crop-edge drag and a table column-width drag
 * were one step per pointer move, so one crop gesture of a few hundred moves
 * pushed every earlier edit out of the 100-step history; the caption-spacing
 * slider was a step per value (review R2-I1) and the line-spacing slider
 * split a drag at a 600 ms pause. Entered with the mouse on the real
 * controls; the store is read, never written. Each returns
 * { claims: {id: observed}, numbers } (or { control, ok, numbers }); a claim
 * is OBSERVED when the defect is present. The claims are listed in the
 * harness header.
 */
import { KEY, canonical, focusBlockEnd, openTab, press, selectFrame, sleep } from './undoKit.mjs';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4AWP4z8DwHwyBAMQgYGBgAAB1SQX7nHNiaQAAAABJRU5ErkJggg==';

/** The shared fixture with a picture in its image block, so the block offers Crop (an empty one opens the file picker). */
const withPicture = (doc) => {
  const d = canonical(doc);
  return { ...d, blocks: d.blocks.map((b) => (b.type === 'image' ? { ...b, imageSrc: PNG, imageFit: 'contain' } : b)) };
};

/** One block's fields and the history flags, from the store (read only). */
const storeOf = (page, id) => page.evaluate(async (id) => {
  const m = await import('/src/stores/posterStore.ts');
  const s = m.usePosterStore.getState();
  const b = s.doc.blocks.find((x) => x.id === id);
  return {
    x: b?.x, crop: b?.crop ?? null, colWidths: b?.tableData?.colWidths ?? null, captionGap: b?.captionGap ?? 0,
    lineHeight: s.doc.styles.body.lineHeight, canUndo: s.canUndo, canRedo: s.canRedo,
  };
}, id);

const idOf = (page, type) => page.evaluate((t) => document.querySelector(`#poster-canvas [data-block-type="${t}"]`)?.getAttribute('data-block-id') ?? null, type);

async function centre(page, sel) {
  const b = await page.locator(sel).first().boundingBox();
  if (!b) throw new Error(`not on screen: ${sel}`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height };
}

/**
 * A drag with the mouse: down at `from`, one pointer move per point of
 * `path` (offsets from `from`), each in its own frame, then up. `hold`
 * pauses that long, still pressed, after that many moves.
 */
async function drag(page, from, path, { holdAt = -1, holdMs = 0 } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 0; i < path.length; i += 1) {
    await page.mouse.move(from.x + path[i][0], from.y + path[i][1]);
    await sleep(8);
    if (i + 1 === holdAt) await sleep(holdMs);
  }
  await page.mouse.up();
  await sleep(250);
}

/** `n` moves `step` px apart along x. */
const line = (n, step) => Array.from({ length: n }, (_, i) => [step * (i + 1), 0]);

/** Press `via` (the Undo / Redo button, or a key) until `done(state)`; the presses, or null if the history ran out first. */
async function pressUntil(page, id, done, via, cap = 150) {
  for (let i = 1; i <= cap; i += 1) {
    const s = await storeOf(page, id);
    const can = via === 'redo' || via === KEY.redo ? s.canRedo : s.canUndo;
    if (!can) return null;
    if (via === 'undo' || via === 'redo') await page.locator(`[data-postr-history-buttons] button[aria-label="${via === 'undo' ? 'Undo' : 'Redo'}"]`).click();
    else await press(page, via, 0);
    await sleep(120);
    if (done(await storeOf(page, id))) return i;
  }
  return null;
}

/** Select the image and enter crop mode; the right edge's centre and the frame's width. */
async function enterCrop(page, id) {
  await selectFrame(page, id);
  await page.locator(`#poster-canvas [data-block-id="${id}"] button[title="Crop image"]`).first().click();
  await sleep(250);
  return centre(page, `#poster-canvas [data-block-id="${id}"] [aria-label="crop right edge"]`);
}

const applyCrop = async (page, id) => {
  await page.locator(`#poster-canvas [data-block-id="${id}"] button[title^="Apply crop"]`).first().click();
  await sleep(250);
};

const sameCrop = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export const DRAGS = [
  {
    id: 'G0-move-drag-control', control: true,
    editDoc: withPicture,
    how: 'control: the image\'s move button dragged 12 moves of 3 px (a move drag was one step before this change): the Undo button once returns it',
    async run(page) {
      const id = await idOf(page, 'image');
      await selectFrame(page, id);
      const x0 = (await storeOf(page, id)).x;
      await drag(page, await centre(page, `#poster-canvas [data-block-id="${id}"] button[title^="Drag to move"]`), line(12, 3));
      const moved = (await storeOf(page, id)).x !== x0;
      const presses = await pressUntil(page, id, (s) => s.x === x0, 'undo');
      return { control: true, ok: moved && presses === 1, numbers: { moved, undoPresses: presses } };
    },
  },
  {
    id: 'G1-crop-edge-drag', claims: ['G1'], needs: 'ADJUSTMENTS_ENABLED', // the crop button is hidden (record 29)
    editDoc: withPicture,
    how: 'the image selected, Crop, its right edge dragged 12 moves of 2 px inward, Apply; the Undo button until no crop, then ⌘⇧Z until it is back',
    async run(page) {
      const id = await idOf(page, 'image');
      const edge = await enterCrop(page, id);
      await drag(page, edge, line(12, -2));
      await applyCrop(page, id);
      const cropped = (await storeOf(page, id)).crop;
      if (!cropped) throw new Error('the drag did not crop the image');
      const undoPresses = await pressUntil(page, id, (s) => s.crop === null, 'undo');
      const redoPresses = await pressUntil(page, id, (s) => sameCrop(s.crop, cropped), KEY.redo);
      return {
        claims: { G1: undoPresses !== 1 || redoPresses !== 1 },
        numbers: { cropRight: Math.round(cropped.right * 100) / 100, undoButtonPresses: undoPresses ?? 'ran out', redoKeyPresses: redoPresses ?? 'ran out' },
      };
    },
  },
  {
    id: 'G2-long-crop-gesture', claims: ['G2'], needs: 'ADJUSTMENTS_ENABLED', // the crop button is hidden (record 29)
    editDoc: withPicture,
    how: 'the image selected and nudged with ArrowRight; Crop, its right edge dragged back and forth for 330 moves of 1 px (each move a new crop), Apply; ⌘Z twice: no crop, then the nudge undone',
    async run(page) {
      const id = await idOf(page, 'image');
      await selectFrame(page, id);
      const x0 = (await storeOf(page, id)).x;
      await press(page, 'ArrowRight', 200);
      const x1 = (await storeOf(page, id)).x;
      if (x1 === x0) throw new Error('ArrowRight did not nudge the image');
      const edge = await enterCrop(page, id);
      // Back and forth within the frame, so every one of the 330 moves
      // changes the crop (a drag past the 10 % floor would stop changing it).
      const blockW = (await centre(page, `#poster-canvas [data-block-id="${id}"]`)).w;
      const amp = Math.max(20, Math.min(110, Math.floor(blockW * 0.6)));
      const path = [];
      let at = 0; let dir = -1;
      for (let i = 0; i < 330; i += 1) {
        at += dir;
        if (at <= -amp || at >= 0) dir = -dir;
        path.push([at, 0]);
      }
      await drag(page, edge, path);
      await applyCrop(page, id);
      if (!(await storeOf(page, id)).crop) throw new Error('the gesture left no crop');
      await press(page, KEY.undo, 200);
      const afterOne = await storeOf(page, id);
      await press(page, KEY.undo, 200);
      const afterTwo = await storeOf(page, id);
      let more = 0;
      while ((await storeOf(page, id)).x !== x0 && (await storeOf(page, id)).canUndo && more < 120) { await press(page, KEY.undo, 0); more += 1; }
      return {
        claims: { G2: afterOne.crop !== null || afterTwo.x !== x0 },
        numbers: {
          amplitudePx: amp, nudge: `${x0} → ${x1}`,
          afterOneUndo: afterOne.crop ? `crop right ${Math.round(afterOne.crop.right * 10) / 10}` : 'no crop',
          afterTwoUndos: `x ${afterTwo.x}`,
          nudgeBackAfterMorePresses: (await storeOf(page, id)).x === x0 ? `yes, after ${2 + more}` : `never (history ran out after ${2 + more})`,
        },
      };
    },
  },
  {
    id: 'G3-column-width-drag', claims: ['G3'], needs: 'ADJUSTMENTS_ENABLED', // the column grip is hidden (record 29)
    editDoc: withPicture,
    how: 'the table selected, the grip between its first two columns dragged 12 moves of 3 px; the Undo button until the widths are back',
    async run(page) {
      const id = await idOf(page, 'table');
      await selectFrame(page, id);
      const before = (await storeOf(page, id)).colWidths;
      await drag(page, await centre(page, `#poster-canvas [data-block-id="${id}"] [title="Drag to resize column"]`), line(12, 3));
      const after = (await storeOf(page, id)).colWidths;
      if (JSON.stringify(after) === JSON.stringify(before)) throw new Error('the drag did not change the column widths');
      const presses = await pressUntil(page, id, (s) => JSON.stringify(s.colWidths) === JSON.stringify(before), 'undo');
      return {
        claims: { G3: presses !== 1 },
        numbers: { widths: `${JSON.stringify(before)} → ${JSON.stringify(after?.map((w) => Math.round(w * 10) / 10))}`, undoButtonPresses: presses ?? 'ran out' },
      };
    },
  },
  {
    id: 'G4-caption-slider-drag', claims: ['G4'], needs: 'ADJUSTMENTS_ENABLED', // the caption spacing slider is hidden (record 29)
    editDoc: withPicture,
    how: 'the image selected, Edit block › Caption spacing: the slider pressed at its left end and dragged 12 moves to the right; the Undo button until the gap is back to 0',
    async run(page) {
      const id = await idOf(page, 'image');
      await selectFrame(page, id);
      await openTab(page, 'edit block');
      const s = page.locator('input[type="range"][max="24"]').first();
      await s.scrollIntoViewIfNeeded();
      const b = await s.boundingBox();
      if (!b) throw new Error('no Caption spacing slider');
      await drag(page, { x: b.x + 6, y: b.y + b.height / 2 }, line(12, (b.width * 0.6) / 12));
      const gap = (await storeOf(page, id)).captionGap;
      if (!gap) throw new Error('the drag did not change the caption spacing');
      const presses = await pressUntil(page, id, (st) => !st.captionGap, 'undo');
      return { claims: { G4: presses !== 1 }, numbers: { gapPx: gap, undoButtonPresses: presses ?? 'ran out' } };
    },
  },
  {
    id: 'G5-line-spacing-drag-held', claims: ['G5'], needs: 'ADJUSTMENTS_ENABLED', // the line spacing slider is hidden (record 29)
    editDoc: withPicture,
    how: 'block 1 clicked, Edit block › Line spacing: the slider pressed at its thumb, dragged 6 moves, held still 0.8 s, 6 more moves, released; the Undo button until the spacing is back',
    async run(page, ids) {
      const [a] = ids;
      await focusBlockEnd(page, a);
      await openTab(page, 'edit block');
      const s = page.locator('input[type="range"][max="3"]').first();
      await s.scrollIntoViewIfNeeded();
      const b = await s.boundingBox();
      if (!b) throw new Error('no Line spacing slider');
      const before = (await storeOf(page, a)).lineHeight;
      const thumbX = b.x + ((before - 1) / 2) * b.width;
      await drag(page, { x: thumbX, y: b.y + b.height / 2 }, line(12, 6), { holdAt: 6, holdMs: 800 });
      const after = (await storeOf(page, a)).lineHeight;
      if (after === before) throw new Error('the drag did not change the line spacing');
      const presses = await pressUntil(page, a, (st) => st.lineHeight === before, 'undo');
      return { claims: { G5: presses !== 1 }, numbers: { lineHeight: `${before} → ${after}`, undoButtonPresses: presses ?? 'ran out' } };
    },
  },
];
