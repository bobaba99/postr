/**
 * Helpers for scripts/simplify-check.mjs (record docs/fixes/29-mvp-simplify.md;
 * docs/launch/mvp-editor/bounded-designs.md §3.1, §3.12 and §5.2 items 1 and
 * 4). Passive reads of what the editor draws and stores; the user's actions
 * are Playwright's mouse and keys. Nothing here calls the app's store.
 */
import fs from 'node:fs';
import { sleep } from './editorHarness.mjs';
import { makeRow } from './guestBackend.mjs';
import { decodePNG } from './png.mjs';
import { MOD } from './undoKit.mjs';
import { rowOf } from './keepWorkKit.mjs';

/**
 * The starting text main stored as content before record 29 (templates.ts and
 * PosterEditor.tsx at 21e6671): the title, the template guidance sentences,
 * Insert's two strings and the sample table. An older poster still holds
 * these; a new one must not.
 */
export const OLD_TITLE = 'Your Poster Title';
export const OLD_INSERT_TEXT = 'Enter your text here.';
export const OLD_INSERT_HEADING = 'Section Title';
export const OLD_GUIDANCE = [
  'Background and research question. Provide context, motivation, and the gap your work addresses.',
  'State your specific hypotheses or research aims here.',
  'Participants, design, materials, procedure, and analysis approach.',
  'Key findings, implications, and future directions.',
  'Motivation and background.',
  'Design and analysis approach.',
  'Interpretation of findings.',
  'YOUR KEY FINDING IN ONE CLEAR SENTENCE. Make this the takeaway.',
  'Brief context.',
  'Essential method details.',
  'So what? Future directions.',
  'Context and aims.',
  'Design and analysis.',
  'Key findings and implications.',
];
export const OLD_SAMPLE_CELLS = ['Measure', 'M (SD)', '𝑝', 'DV 1', '4.2 (0.8)', '< .01', 'DV 2', '3.1 (1.1)', '.03', 'DV 3', '2.8 (0.6)', '.12'];
/** The sample table's made-up results (its body cells but the row labels' header). */
export const OLD_SAMPLE_NUMBERS = ['4.2 (0.8)', '< .01', '3.1 (1.1)', '.03', '2.8 (0.6)', '.12'];
export const OLD_STRINGS = [OLD_TITLE, OLD_INSERT_TEXT, OLD_INSERT_HEADING, ...OLD_GUIDANCE];

export const plain = (html) => String(html ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

/** The stored row's blocks, once the new poster has been written (its template saved). */
export async function storedBlocks(state, id, { timeout = 10000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const blocks = rowOf(state, id)?.data?.blocks;
    if (Array.isArray(blocks) && blocks.length > 0) return blocks;
    await sleep(100);
  }
  return [];
}

/**
 * What an empty-or-not text block shows: its text, its prompt attribute, the
 * pseudo-element the stylesheet draws before it (content and colour), and
 * its innerHTML. For every title, heading and text block on the canvas.
 */
export const promptStates = (page, root = '#poster-canvas') => page.evaluate((r) => [...document.querySelectorAll(`${r} [data-block-id]`)]
  .filter((b) => ['title', 'heading', 'text'].includes(b.getAttribute('data-block-type')))
  .map((b) => {
    const ce = b.querySelector('[contenteditable]');
    const before = ce ? getComputedStyle(ce, '::before') : null;
    return {
      id: b.getAttribute('data-block-id'),
      type: b.getAttribute('data-block-type'),
      text: (ce?.textContent ?? '').trim(),
      html: ce?.innerHTML ?? null,
      placeholder: ce?.getAttribute('data-placeholder') ?? null,
      beforeContent: before?.content ?? null,
      beforeColor: before?.color ?? null,
      beforeDisplay: before?.display ?? null,
    };
  }), root);

/**
 * The editor's own hints in empty authors, image and references blocks
 * (blocks.tsx; older than record 29): drawn as text, so the print window
 * copies them (review round 1, R1-02: a sibling left open).
 */
export const EDITOR_HINTS = ['Add authors in sidebar', '+ Upload figure', 'Add references in Refs tab'];

/**
 * A prompt is drawn when the pseudo-element shows the block's prompt text:
 * Chromium and WebKit resolve `attr()` in the computed `content`, Firefox
 * returns it as written (MEASURED, record 29: `attr(data-placeholder)`).
 * inkIn reads the paint either way.
 */
export const promptDrawn = (s) => !!s.placeholder && s.beforeDisplay !== 'none' && typeof s.beforeContent === 'string'
  && (s.beforeContent.replace(/^"|"$/g, '') === s.placeholder || s.beforeContent === 'attr(data-placeholder)');

/**
 * Painted ink inside the editable part of block `id`: pixels whose colour
 * differs from the block's background by more than 40 (sum of channels),
 * from a screenshot of that box. Selection chrome is off (nothing selected
 * when called), so ink is the text or the prompt. `savePath` keeps the
 * screenshot.
 */
export async function inkIn(page, id, savePath = null, root = '#poster-canvas') {
  const box = await page.evaluate(([i, r0]) => {
    const ce = document.querySelector(`${r0} [data-block-id="${i}"] [contenteditable]`);
    if (!ce) return null;
    ce.scrollIntoView({ block: 'center', inline: 'center' });
    const r = ce.getBoundingClientRect();
    return { x: Math.max(0, r.left), y: Math.max(0, r.top), w: Math.max(1, r.width), h: Math.max(8, r.height) };
  }, [id, root]);
  if (!box) return null;
  await page.waitForTimeout(150);
  const shot = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.w, height: box.h } });
  if (savePath) fs.writeFileSync(savePath, shot);
  const png = decodePNG(shot);
  // The background: the colour most of the four corners share (text may
  // start at one corner).
  const corners = [png.rgb(0, 0), png.rgb(png.w - 1, 0), png.rgb(0, png.h - 1), png.rgb(png.w - 1, png.h - 1)];
  const key = (c) => c.join(',');
  const bg = corners.map((c) => [c, corners.filter((d) => key(d) === key(c)).length]).sort((a, b) => b[1] - a[1])[0][0];
  let ink = 0;
  for (let y = 0; y < png.h; y += 1) {
    for (let x = 0; x < png.w; x += 1) {
      const p = png.rgb(x, y);
      if (Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 40) ink += 1;
    }
  }
  return ink;
}

/**
 * Empty block `id` with the user's keys: a click in its text, "ZQ" typed (so
 * a block that starts empty is emptied by hand too), select all, Backspace.
 * Chromium leaves a lone <br> behind (MEASURED on 21e6671, T1).
 */
export async function emptyBlock(page, id) {
  const ce = page.locator(`#poster-canvas [data-block-id="${id}"] [contenteditable="true"]`).first();
  await ce.scrollIntoViewIfNeeded();
  await ce.click();
  await page.waitForTimeout(200);
  await page.keyboard.type('ZQ', { delay: 30 });
  await page.keyboard.press(`${MOD}+a`);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(400);
}

/** Deselect: Escape does not deselect in this editor, so a click on the workspace outside the sheet. */
export async function deselect(page) {
  const pt = await page.evaluate(() => {
    const outer = document.querySelector('[data-postr-canvas-outer]');
    const poster = document.getElementById('poster-canvas');
    if (!outer || !poster) return null;
    const o = outer.getBoundingClientRect();
    const p = poster.getBoundingClientRect();
    const cands = [[(o.left + p.left) / 2, o.top + o.height / 2], [(p.right + o.right) / 2, o.top + o.height / 2], [o.left + o.width / 2, (p.bottom + o.bottom) / 2], [o.left + o.width / 2, (o.top + p.top) / 2]];
    for (const [x, y] of cands) {
      const el = document.elementFromPoint(x, y);
      if (el && outer.contains(el) && !el.closest('#poster-canvas, button, input, select, textarea')) return { x, y };
    }
    return null;
  });
  if (pt) await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(300);
}

/** The Issues tab's rows: category and message (the tab must be open). */
export const issueRows = (page) => page.evaluate(() => {
  const side = document.querySelector('[data-postr-sidebar]');
  return [...(side?.querySelectorAll('button') ?? [])]
    .map((b) => [...b.children].map((c) => (c.textContent ?? '').trim()))
    .filter((parts) => parts.length >= 2 && parts[0] && parts[1] && !/^\d/.test(parts[0]))
    .map(([category, message]) => ({ category, message }));
});

/**
 * Seed a poster row holding `data` for the signed-in user of session `s`
 * (lib/keepWorkKit.mjs openSignedIn) and open it in the same page, as a
 * user opens a poster from the dashboard.
 */
export async function openStoredPoster(h, s, data, title = 'ZQ older poster') {
  const userId = rowOf(s.state, s.id)?.user_id;
  if (!userId) throw new Error('no signed-in user to own the seeded poster');
  const row = makeRow(userId, data, { title });
  s.state.rows.push(row);
  await s.page.goto(`${h.base}/p/${row.id}`);
  await s.page.waitForSelector('#poster-canvas [data-block-id]', { timeout: 90000 });
  await s.page.evaluate(() => document.fonts.ready);
  await s.page.waitForTimeout(900);
  return row.id;
}

/**
 * Count, in the page, the visible elements each probe names. A probe is
 * `{ sel, text, within, dom }`: a CSS selector (default: the controls a user
 * can press or type in), an optional regex source matched against each of
 * the element's own words (its text, title, aria-label or placeholder), an
 * optional container, and `dom: true` to count elements present at all
 * (a closed panel clipped to zero width still counts as offered).
 */
export const countProbes = (page, probes) => page.evaluate((list) => {
  const CONTROLS = 'button, label, input, select, textarea, a, [role="button"], [title]';
  const visible = (el) => {
    if (el.closest('[inert]')) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.01;
  };
  const words = (el) => [el.textContent, el.getAttribute('title'), el.getAttribute('aria-label'), el.getAttribute('placeholder')]
    .filter(Boolean).map((t) => t.trim().replace(/\s+/g, ' '));
  const out = {};
  for (const [key, p] of Object.entries(list)) {
    const roots = p.within ? [...document.querySelectorAll(p.within)] : [document];
    const re = p.text ? new RegExp(p.text, p.flags ?? '') : null;
    const seen = new Set();
    for (const root of roots) {
      for (const el of root.querySelectorAll(p.sel ?? CONTROLS)) {
        if (seen.has(el)) continue;
        if (re && !words(el).some((w) => re.test(w))) continue;
        if (!p.dom && !visible(el)) continue;
        seen.add(el);
      }
    }
    out[key] = seen.size;
  }
  return out;
}, probes);
