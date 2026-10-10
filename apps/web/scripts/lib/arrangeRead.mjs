/**
 * What scripts/auto-arrange-check.mjs reads, written from the record's rule
 * tables (docs/fixes/28-auto-arrange.md), not from the app's code: the sheet
 * as drawn (each block's frame: its inline left and top, its computed width
 * and height, the font sizes of its text, the heading and caption numbers
 * it shows), the reading order of what is drawn, overlaps, and the area of
 * the columns past the bottom margin.
 */

/** In the page: every block frame on the sheet as drawn, in poster units. */
export function readSheetInPage() {
  const canvas = document.querySelector('#poster-canvas');
  const W = parseFloat(canvas.style.width);
  const H = parseFloat(canvas.style.height);
  const blocks = [...canvas.querySelectorAll('[data-block-id]')]
    .filter((el) => el.getAttribute('data-block-id'))
    .map((el) => {
      const cs = getComputedStyle(el);
      const type = el.getAttribute('data-block-type');
      const text = el.innerText;
      const sizes = new Set();
      for (const n of el.querySelectorAll('*')) {
        if ([...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) sizes.add(getComputedStyle(n).fontSize);
      }
      const head = type === 'heading' ? text.match(/^\s*(\d+)\./) : null;
      const cap = text.match(/(Figure|Table) (\d+)\./);
      return {
        id: el.getAttribute('data-block-id'), type,
        x: parseFloat(el.style.left), y: parseFloat(el.style.top),
        w: parseFloat(cs.width), h: parseFloat(cs.height),
        fonts: [...sizes].sort().join(','),
        head: head ? Number(head[1]) : null,
        cap: cap ? Number(cap[2]) : null,
      };
    });
  return { W, H, blocks };
}

const MARGIN = 10;
const isHeader = (b) => b.type === 'title' || b.type === 'authors' || b.type === 'logo';

/** Columns by left edge: within 3 in (30 units) of the column's leftmost edge. */
export function columnsOf(blocks) {
  const col = new Map();
  let c = -1;
  let start = -Infinity;
  for (const b of [...blocks].sort((a, z) => a.x - z.x)) {
    if (b.x - start > 30) { c += 1; start = b.x; }
    col.set(b.id, c);
  }
  return col;
}

/** The record's reading order over drawn blocks: bands, then columns, then top edge. */
export function readingOrderOf(sheet) {
  const body = sheet.blocks.filter((b) => !isHeader(b));
  const col = columnsOf(body);
  const wideFrom = (sheet.W - 2 * MARGIN) * 0.9;
  const wide = body.filter((b) => b.w >= wideFrom).sort((a, z) => a.y - z.y);
  const narrow = body.filter((b) => b.w < wideFrom);
  const band = (b) => wide.filter((w) => w.y <= b.y).length;
  const out = [];
  for (let i = 0; i <= wide.length; i += 1) {
    out.push(...narrow.filter((b) => band(b) === i).sort((a, z) => col.get(a.id) - col.get(z.id) || a.y - z.y || a.x - z.x));
    if (i < wide.length) out.push(wide[i]);
  }
  return out.map((b) => b.id);
}

/** Pairs of drawn blocks overlapping by more than 2 units both ways. */
export function overlapsOf(sheet) {
  const out = [];
  const bs = sheet.blocks;
  for (let i = 0; i < bs.length; i += 1) {
    for (let j = i + 1; j < bs.length; j += 1) {
      const a = bs[i];
      const b = bs[j];
      const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (dx > 2 && dy > 2) out.push(`${a.type}:${a.id.slice(0, 6)}×${b.type}:${b.id.slice(0, 6)}`);
    }
  }
  return out;
}

/**
 * Area (in²) of the columns past the bottom margin: per column, the widest
 * block reaching past the line times how far the lowest one reaches.
 */
export function pastMarginOf(sheet) {
  const body = sheet.blocks.filter((b) => !isHeader(b));
  const col = columnsOf(body);
  const line = sheet.H - MARGIN;
  let area = 0;
  for (const c of new Set(col.values())) {
    const low = body.filter((b) => col.get(b.id) === c && b.y + b.h > line);
    if (!low.length) continue;
    area += Math.max(...low.map((b) => b.w)) * (Math.max(...low.map((b) => b.y + b.h)) - line);
  }
  return area / 100;
}

/**
 * Auto-Arrange's columns (the record's k rule): the columns above, except
 * that a column of one block starting inside the column to its left (left
 * of the right edge of every block there: a block dragged part-way across)
 * is counted in that column.
 */
export function arrangeColumnsOf(blocks) {
  const raw = columnsOf(blocks);
  const n = raw.size ? Math.max(...raw.values()) + 1 : 0;
  const members = Array.from({ length: n }, (_, c) => blocks.filter((b) => raw.get(b.id) === c));
  const eff = [];
  for (let c = 0; c < n; c += 1) {
    const lone = members[c].length === 1 ? members[c][0] : null;
    const inside = c > 0 && lone && members[c - 1].every((o) => lone.x < o.x + o.w);
    eff.push(c === 0 ? 0 : inside ? eff[c - 1] : eff[c - 1] + 1);
  }
  return new Map(blocks.map((b) => [b.id, eff[raw.get(b.id)]]));
}

/** Title and authors blocks in the header: their top edge in the top half of the sheet. */
const headerText = (sheet) => sheet.blocks.filter((b) => (b.type === 'title' || b.type === 'authors') && b.y < sheet.H / 2);
/** Title and authors blocks along the foot: their top edge in the bottom half. */
const footerText = (sheet) => sheet.blocks.filter((b) => (b.type === 'title' || b.type === 'authors') && b.y >= sheet.H / 2);

/** The header's drawn bottom: the header's title and authors, and logos that start above it. */
export function headerBottomOf(sheet) {
  const text = headerText(sheet);
  if (!text.length) return MARGIN - 6;
  let bottom = Math.max(...text.map((b) => b.y + b.h));
  for (const b of [...sheet.blocks].sort((a, z) => a.y - z.y)) if (b.type === 'logo' && b.y < bottom) bottom = Math.max(bottom, b.y + b.h);
  return bottom;
}

/** Where the body ends: the bottom margin, or 0.6 in above a title or authors block along the foot. */
export function bodyBottomOf(sheet) {
  const foot = footerText(sheet);
  return Math.min(sheet.H - MARGIN, ...foot.map((b) => b.y - 6));
}

/** Is there a title or authors block along the foot? */
export const hasFooter = (sheet) => footerText(sheet).length > 0;

/** Body blocks off the ½ in grid (x, y or w more than 0.1 units from a multiple of 5 units). */
export function offGridOf(sheet) {
  const off = (v) => Math.abs(v / 5 - Math.round(v / 5)) > 0.02;
  return sheet.blocks.filter((b) => !isHeader(b) && (off(b.x) || off(b.y) || off(b.w))).length;
}

/**
 * In the page: the width (poster units) a body line holds 40 characters at,
 * and each table's minimum width, read with the sheet's own fonts: the body
 * font of a text block's editable area or, on a poster with no text block,
 * the poster's body size and weight (its style) in the family the sheet
 * draws its text in (review round 1's six figures: the references block's
 * frame read 16 px, not the body's 5), the sample string the prototype
 * uses, and each table column's longest word (bold in the header row) over
 * its share of the width, plus the cell's 8 px of padding and 1.5 px of
 * rule, and the table's 4 px of frame padding.
 */
export async function readWidthsInPage() {
  const canvas = document.querySelector('#poster-canvas');
  const editable = canvas.querySelector('[data-block-type="text"] [contenteditable]');
  let cs = editable ? getComputedStyle(editable) : null;
  if (!cs) {
    const { usePosterStore } = await import('/src/stores/posterStore.ts');
    const body = usePosterStore.getState().doc.styles.body;
    const texty = [...canvas.querySelectorAll('[data-block-id] *')].find((n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()));
    cs = { fontFamily: getComputedStyle(texty ?? canvas).fontFamily, fontSize: `${body.size}px`, fontWeight: String(body.weight) };
  }
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;white-space:nowrap';
  canvas.appendChild(host);
  const widthOf = (text, weight, font = cs) => {
    const s = document.createElement('span');
    s.style.cssText = `display:inline-block;font-family:${font.fontFamily};font-size:${font.fontSize};font-weight:${weight}`;
    s.textContent = text;
    host.appendChild(s);
    const w = parseFloat(getComputedStyle(s).width);
    s.remove();
    return w;
  };
  const lineMin = (40 * widthOf('participants reported higher', cs.fontWeight)) / 28;
  const tables = {};
  for (const el of canvas.querySelectorAll('[data-block-type="table"]')) {
    const table = el.querySelector('table');
    if (!table) continue;
    const tcs = getComputedStyle(table);
    const cols = [...table.querySelectorAll('col')].map((c) => parseFloat(c.style.width));
    let need = 0;
    [...table.rows].forEach((row, r) => {
      [...row.cells].forEach((cell, c) => {
        for (const word of cell.innerText.split(/\s+/).filter(Boolean)) {
          const w = widthOf(word, r === 0 ? 700 : 400, tcs);
          need = Math.max(need, (w + 8 + 1.5) / ((cols[c] ?? 100 / row.cells.length) / 100));
        }
      });
    });
    tables[el.getAttribute('data-block-id')] = need + 4;
  }
  host.remove();
  return { lineMin, tables };
}
