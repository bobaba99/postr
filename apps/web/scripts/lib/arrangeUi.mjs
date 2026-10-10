/**
 * Mouse steps for scripts/auto-arrange-check.mjs (record 28): a user selects
 * a block and drags it by its move handle, as on the canvas. Folded in from
 * record 28's review round 1 probe, which found with them that an authors
 * block dragged to the foot of the sheet put the whole body under it (B-R1)
 * and that one block dragged 5 in sideways added a column (B-R2).
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Click a block's frame near its top-left corner (selects it). */
export async function selectFrame(page, id) {
  const frame = page.locator(`#poster-canvas [data-block-id="${id}"]`).first();
  await frame.scrollIntoViewIfNeeded();
  const box = await frame.boundingBox();
  await page.mouse.click(box.x + 3, box.y + 3);
  await sleep(350);
}

/** Click the workspace beside the sheet (clears the selection). */
export async function clickAway(page) {
  const p = await page.evaluate(() => {
    const outer = document.querySelector('[data-postr-canvas-outer]').getBoundingClientRect();
    const sheet = document.getElementById('poster-canvas').getBoundingClientRect();
    return { x: (outer.left + sheet.left) / 2, y: outer.top + outer.height / 2 };
  });
  await page.mouse.click(Math.max(2, p.x), p.y);
  await sleep(250);
}

/** Select a block and drag it by its move handle `dx`, `dy` poster units, in 12 mouse moves. */
export async function dragMove(page, id, dx, dy) {
  await selectFrame(page, id);
  const handle = page.locator(`#poster-canvas [data-block-id="${id}"] button[title^="Drag to move"]`).first();
  const box = await handle.boundingBox();
  const zoom = await page.evaluate(() => {
    const c = document.getElementById('poster-canvas');
    return c.getBoundingClientRect().width / parseFloat(c.style.width);
  });
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) {
    await page.mouse.move(from.x + (dx * zoom * i) / 12, from.y + (dy * zoom * i) / 12);
    await sleep(10);
  }
  await page.mouse.up();
  await sleep(400);
}

/** Ids of the drawn blocks of a type, in DOM order. */
export const idsOf = (page, type) => page.evaluate(
  (t) => [...document.querySelectorAll(`#poster-canvas [data-block-type="${t}"]`)].map((e) => e.getAttribute('data-block-id')),
  type,
);
