/**
 * Copy, cut and paste blocks (record 35, docs/fixes/35-block-copy.md;
 * bounded-designs.md §3.3 table B order 1, table C, D). The rules, pure;
 * the listeners are useBlockClipboard.ts (⌘C, ⌘X, and the paste of a
 * payload, which record 34's canvas paste hands over as table B's order 1).
 *
 * | When | Then |
 * |---|---|
 * | C1 ⌘C / Ctrl+C, blocks selected, nothing in edit mode (no caret in a text, a cell or a field; no cells selected by dragging; no text the user selected on the page since their last press on the canvas, whose copy is the browser's) | the system clipboard gets text/html holding the payload (`<div data-postr-blocks="{JSON}">` then the blocks' words as paragraphs) and text/plain holding the words. JSON: `{"v":1,"blocks":[…]}`, each block its original's id and fields, in the poster's order. Every kind is copied except the credit mark (locked) and charts (hidden, D1: left out with a toast). Only a payload ⌘V accepts is written: when the blocks would make one `readClip` refuses (over a bound below), nothing is copied (or cut) and a toast says they are too large (review round 1, R1-4) |
 * | C2 ⌘X / Ctrl+X | as ⌘C, then the copied blocks are deleted as Delete does (one undo step); the credit mark stays with Delete's toast, a chart stays, and a picture ⌘V could not bring back (`pictureTravels`: an address, as a preset or My Logos logo is stored, or a data URL) stays, with a toast, and is not copied (R1-2) |
 * | C3 ⌘V of a payload, nothing in edit mode | each block a copy with a new id, 1 in (10 units) down and right of its original while an original of the payload is on this poster, else at its own place (another poster, or after a cut); each kept on the sheet (x in [0, sheet − w], 0 when wider; the same for y); added at once, on top, in the payload's order, all in ONE undo step, selected (review round 2, R2-1: a paste that waited for its files let a ⌘Z pressed meanwhile undo the step before) |
 * | C4 | a title when the poster has one (or the paste already brought one), the same for an authors block and for a user logo (the locked credit mark is not one): not pasted; one toast says why. Judged on the poster as it is at the key; the copies land at once, so a second ⌘V counts the first's (R1-5) |
 * | D | an image or logo copy whose source is a poster-assets file (`storage://`, data/posterImages.ts `isPosterAssetSrc`) gets its own file, copied into this poster's folder under its new id; while it is copied the block shows its source when that is a file of this account's own folder, else nothing, and the copy's file takes its place silently, not as an undo step, in the poster and in every undo and redo step that holds the block showing it (`withCopiedFiles`; R3-3); a copy that fails keeps it showing its own-folder source, which nothing deletes, unless storage's first answer says that file does not exist (a 404 / not_found: data/posterImages.ts `copyPosterImage`'s `missing`, `heldAfterCopy`; the lead's rule on the final check's F35-FC-2, correction 5: storage busy on every try, R3-1, a refusal not about the file, a 404 after a busy try all keep it); any other source (another account's file, never shown; not a poster-assets file), or an own file storage says is not there, makes an empty block; one toast, naming the pasted images on the poster and empty when the copies have answered (R3-2); ⌘D's clone by the same rule (PosterEditor `duplicateBlock`) |
 * | C6 | the payload is untrusted (any page can put such HTML on the clipboard): `readClip` validates it strictly (below); every text is cleaned by the editor's sanitizer; a payload that fails pastes nothing (no fall-through to record 34's text row) and a toast says so |
 *
 * Validation (`readClip`): the JSON at most 2 000 000 characters; an object
 * of exactly `v` (1) and `blocks` (1 to 200); each block an object of the
 * fields of `REQUIRED` and `OPTIONAL` only, each of its type: a known
 * kind, finite numbers in range (x and y within ±10 000 units, w and h
 * above 0 and up to 10 000), texts up to 100 000 characters (a cell
 * 10 000, a prompt 500), a table of 1 to 500 rows and 1 to 50 columns (at
 * most 2 500 cells) with one cell per place, column widths 0 to 100, a known
 * border preset, a crop of 0 to 100 % a side (the crop overlay stores up to
 * 90 %, the canvas draws each side clamped to 49 %: R2-2, a stored crop over
 * 50 % was left out of a copy); and the payload's tables together at most 2 500 cells, the
 * bound of one table (R1-1: 200 tables of 2 500 cells each passed; the
 * reviewer measured 60 of them holding the page for seconds, and its
 * reopening). The JSON's cap is the
 * bound of all texts together (twenty texts of 99 000 characters paste and
 * draw in half a second, MEASURED, record 35 §9). A source that is not a
 * poster-assets file is not a failure: that image block is pasted empty (D).
 *
 * Out of scope (record 35 §10): the right-click menu (next fix), ⌘D on
 * several blocks, copying between accounts' files, deleting superseded files
 * (the orphan-files fix), pasting blocks into a table cell or a text (a
 * paste there is the field's own, record 32), charts, Paste Special.
 */
import type { Block, CustomTableBorder, TableData } from '@postr/shared';
import { isPosterAssetSrc } from '@/data/posterImages';
import { TABLE_BORDER_PRESETS } from './constants';
import { sanitizeHtml } from './sanitizeHtml';

/** The attribute that marks Postr's copied blocks in the clipboard's HTML. */
export const CLIP_ATTR = 'data-postr-blocks';
export const CLIP_VERSION = 1;

/** The bounds of a payload (C6). */
export const CLIP_LIMITS = {
  json: 2_000_000,
  blocks: 200,
  coord: 10_000,
  text: 100_000,
  cell: 10_000,
  prompt: 500,
  rows: 500,
  cols: 50,
  cells: 2_500,
  /** The cells of all the payload's tables together (R1-1). */
  cellsInAll: 2_500,
} as const;

/** The kinds a payload carries (a chart is not copied: charts are hidden, D1). */
const KINDS = new Set<Block['type']>(['title', 'authors', 'heading', 'text', 'image', 'logo', 'table', 'references']);
/** The kinds a poster has one of (C4). */
export const ONE_PER_POSTER = ['title', 'authors', 'logo'] as const;
export type OnePerPoster = (typeof ONE_PER_POSTER)[number];

/** A copied block as the payload carries it: the original's id and the block's fields (never `locked`, never `chartSpec`). */
export type ClipBlock = Omit<Block, 'locked' | 'chartSpec'>;
export interface ClipPayload { v: 1; blocks: ClipBlock[] }

// ------------------------------------------------------------ the checks

type Check = (v: unknown) => boolean;
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const num = (lo: number, hi: number): Check => (v) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const positive = (hi: number): Check => (v) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= hi;
const int = (lo: number, hi: number): Check => (v) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const str = (max: number): Check => (v) => typeof v === 'string' && v.length <= max;
const oneOf = (...xs: unknown[]): Check => (v) => xs.includes(v);
const bools = (max: number): Check => (v) => Array.isArray(v) && v.length <= max && v.every((x) => typeof x === 'boolean');
/** Only the listed keys, each passing its check (`need`: the ones that must be there). */
function shaped(v: unknown, checks: Record<string, Check>, need: readonly string[]): v is Record<string, unknown> {
  if (!isPlain(v)) return false;
  if (!Object.keys(v).every((k) => own(checks, k) && checks[k]!(v[k]))) return false;
  return need.every((k) => own(v, k));
}

const BORDER: Record<string, Check> = {
  topLine: (v) => typeof v === 'boolean', bottomLine: (v) => typeof v === 'boolean', leftLine: (v) => typeof v === 'boolean',
  rightLine: (v) => typeof v === 'boolean', headerLine: (v) => typeof v === 'boolean', headerBox: (v) => typeof v === 'boolean',
  innerH: bools(CLIP_LIMITS.rows), innerV: bools(CLIP_LIMITS.cols),
};
const isBorder: Check = (v) => shaped(v, BORDER, Object.keys(BORDER));

const isTable: Check = (v) => {
  const T: Record<string, Check> = {
    rows: int(1, CLIP_LIMITS.rows), cols: int(1, CLIP_LIMITS.cols),
    cells: (c) => Array.isArray(c) && c.length <= CLIP_LIMITS.cells && c.every(str(CLIP_LIMITS.cell)),
    colWidths: (c) => c === null || (Array.isArray(c) && c.length <= CLIP_LIMITS.cols && c.every(num(0, 100))),
    borderPreset: (p) => typeof p === 'string' && (p === 'custom' || own(TABLE_BORDER_PRESETS, p)),
    customBorder: isBorder,
  };
  if (!shaped(v, T, ['rows', 'cols', 'cells', 'colWidths', 'borderPreset'])) return false;
  const t = v as unknown as TableData;
  return t.rows * t.cols <= CLIP_LIMITS.cells && t.cells.length === t.rows * t.cols && (t.colWidths === null || t.colWidths.length === t.cols);
};

/** A crop's sides in percent: the crop overlay stores up to 90 % (CropOverlay MIN_REMAINING), the canvas draws each clamped to 49 % (R2-2). */
const CROP: Record<string, Check> = { top: num(0, 100), right: num(0, 100), bottom: num(0, 100), left: num(0, 100) };

/** A payload block's fields that must be there, with their checks. */
const REQUIRED: Record<string, Check> = {
  id: (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v),
  type: (v) => typeof v === 'string' && KINDS.has(v as Block['type']),
  x: num(-CLIP_LIMITS.coord, CLIP_LIMITS.coord),
  y: num(-CLIP_LIMITS.coord, CLIP_LIMITS.coord),
  w: positive(CLIP_LIMITS.coord),
  h: positive(CLIP_LIMITS.coord),
  content: str(CLIP_LIMITS.text),
  imageSrc: (v) => v === null || str(4096)(v),
  imageFit: oneOf('contain', 'cover', 'fill'),
  tableData: (v) => v === null || isTable(v),
};
/** The fields a payload block may carry, with their checks. */
const OPTIONAL: Record<string, Check> = {
  prompt: str(CLIP_LIMITS.prompt),
  rotation: num(-360, 360),
  caption: str(CLIP_LIMITS.text),
  captionPosition: oneOf('top', 'bottom', 'left', 'right', 'none'),
  captionGap: num(0, 100),
  note: str(CLIP_LIMITS.text),
  crop: (v) => shaped(v, CROP, Object.keys(CROP)),
};
const FIELDS: Record<string, Check> = { ...REQUIRED, ...OPTIONAL };

function isClipBlock(v: unknown): v is ClipBlock {
  if (!shaped(v, FIELDS, Object.keys(REQUIRED))) return false;
  // A table carries its table (record 34's grid reader and Insert › Table both make one).
  return v.type !== 'table' || v.tableData !== null;
}

// ------------------------------------------------------------- reading

/**
 * Table B's order 1: the payload in the clipboard's HTML. Null when the
 * HTML carries no mark (not Postr's blocks: the next order reads it);
 * `{ payload: null }` when it carries one that fails validation (C6:
 * nothing is pasted). The HTML is parsed in an inert document (DOMParser
 * runs no script and loads nothing).
 */
export function readClip(html: string): { payload: ClipPayload | null } | null {
  if (!html || !html.includes(CLIP_ATTR)) return null;
  const el = new DOMParser().parseFromString(html, 'text/html').querySelector(`[${CLIP_ATTR}]`);
  if (!el) return null;
  const raw = el.getAttribute(CLIP_ATTR) ?? '';
  if (raw.length > CLIP_LIMITS.json) return { payload: null };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { payload: null };
  }
  const ok = shaped(json, {
    v: (v) => v === CLIP_VERSION,
    blocks: (b) => Array.isArray(b) && b.length >= 1 && b.length <= CLIP_LIMITS.blocks && b.every(isClipBlock),
  }, ['v', 'blocks']);
  return { payload: ok && tableCells((json as unknown as ClipPayload).blocks) <= CLIP_LIMITS.cellsInAll ? (json as unknown as ClipPayload) : null };
}

/** The cells of a payload's tables together (a table block's own; another kind's table is never pasted). */
const tableCells = (blocks: readonly ClipBlock[]) =>
  blocks.reduce((n, b) => n + (b.type === 'table' && b.tableData ? b.tableData.rows * b.tableData.cols : 0), 0);

/** A pasted prompt as plain text (it is drawn as an attribute's text, never markup). */
const plainText = (html: string) => new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';

/**
 * A payload block as a new block of the poster: id `id`, every text cleaned
 * by the editor's sanitizer (sanitizeHtml.ts, the allowlist the canvas and
 * the .postr import use), the image source left out (`src`: the
 * poster-assets file to copy for an image or a logo, else null; `lost`:
 * the block had another source, so it is pasted empty, D).
 */
export function fromClip(c: ClipBlock, id: string): { block: Block; src: string | null; lost: boolean } {
  const picture = c.type === 'image' || c.type === 'logo';
  const block: Block = {
    id, type: c.type, x: c.x, y: c.y, w: c.w, h: c.h,
    content: sanitizeHtml(c.content),
    imageSrc: null,
    imageFit: c.imageFit,
    tableData: c.type === 'table' && c.tableData
      ? { ...c.tableData, cells: c.tableData.cells.map((cell) => sanitizeHtml(cell)), colWidths: c.tableData.colWidths ? [...c.tableData.colWidths] : null }
      : null,
  };
  if (c.prompt !== undefined) block.prompt = plainText(c.prompt);
  if (c.rotation !== undefined) block.rotation = c.rotation;
  if (c.caption !== undefined) block.caption = sanitizeHtml(c.caption);
  if (c.captionPosition !== undefined) block.captionPosition = c.captionPosition;
  if (c.captionGap !== undefined) block.captionGap = c.captionGap;
  if (c.note !== undefined) block.note = sanitizeHtml(c.note);
  if (c.crop !== undefined) block.crop = { ...c.crop };
  const src = picture && isPosterAssetSrc(c.imageSrc) ? c.imageSrc : null;
  return { block, src, lost: picture && c.imageSrc !== null && src === null };
}

// ------------------------------------------------------------ the rules

/** C4: which payload blocks go in (the poster's own title, authors block and user logo refuse another), and the kinds refused. */
export function admit<T extends Pick<Block, 'type'>>(blocks: readonly T[], poster: readonly Block[]): { kept: T[]; refused: OnePerPoster[] } {
  const has: Record<OnePerPoster, boolean> = {
    title: poster.some((b) => b.type === 'title'),
    authors: poster.some((b) => b.type === 'authors'),
    logo: poster.some((b) => b.type === 'logo' && !b.locked),
  };
  const refused = new Set<OnePerPoster>();
  const kept = blocks.filter((b) => {
    const kind = (ONE_PER_POSTER as readonly string[]).includes(b.type) ? (b.type as OnePerPoster) : null;
    if (!kind) return true;
    if (has[kind]) {
      refused.add(kind);
      return false;
    }
    has[kind] = true;
    return true;
  });
  return { kept, refused: ONE_PER_POSTER.filter((k) => refused.has(k)) };
}

/** C3: the offset of the copies, in units: 1 in (10) while an original of the payload is on the poster, else 0. */
export function copyOffset(payload: readonly Pick<Block, 'id'>[], poster: readonly Block[]): number {
  return payload.some((c) => poster.some((b) => b.id === c.id)) ? 10 : 0;
}

/** C3: a copy's place: its original's, moved by `offset`, kept on the sheet (at 0 when larger than the sheet). */
export function keptOnSheet(b: Pick<Block, 'x' | 'y' | 'w' | 'h'>, offset: number, sheet: { w: number; h: number }): { x: number; y: number } {
  const keep = (v: number, len: number, room: number) => Math.max(0, Math.min(room - len, v));
  return { x: keep(b.x + offset, b.w, sheet.w), y: keep(b.y + offset, b.h, sheet.h) };
}

/** A pasted or cloned image's own file, once storage has copied it (D): what the block showed while copying (`from`), and the copy (`to`; null when it failed). */
export interface CopiedFile { id: string; from: string | null; to: string | null }

/**
 * D (R2-1): each block of `files` takes its copied file (`to`; null: empty,
 * the copy refused) in place of what it showed while copying (`from`), only
 * while it still shows that (a Replace made meanwhile stays). Null when no
 * block changes. Applied to the poster and to each undo and redo step
 * (`settleCopiedFiles`, R3-3).
 */
export function withCopiedFiles(blocks: readonly Block[], files: readonly CopiedFile[]): Block[] | null {
  let changed = false;
  const next = blocks.map((b) => {
    const f = files.find((x) => x.id === b.id);
    if (!f || f.from === f.to || b.imageSrc !== f.from) return b;
    changed = true;
    return { ...b, imageSrc: f.to };
  });
  return changed ? next : null;
}

// ------------------------------------------------------------- copying

/**
 * C2: whether ⌘V can bring this block's picture back: not a picture, no
 * source, or a poster-assets file. An address (a preset or My Logos logo) or
 * a data URL (a picture not yet stored as a file) is never pasted (C6), so
 * ⌘X leaves such a picture on the poster (R1-2).
 */
export function pictureTravels(b: Block): boolean {
  return !(b.type === 'image' || b.type === 'logo') || !b.imageSrc || isPosterAssetSrc(b.imageSrc);
}

/** C1: the selected blocks the rule copies, in the poster's order, and how many charts it leaves out. */
export function copiedBlocks(blocks: readonly Block[], selected: ReadonlySet<string>): { blocks: Block[]; charts: number } {
  const picked = blocks.filter((b) => selected.has(b.id) && !b.locked);
  return { blocks: picked.filter((b) => KINDS.has(b.type)), charts: picked.filter((b) => b.type === 'chart').length };
}

/**
 * A block as the payload carries it: its own fields, each of the checks'
 * kind (an optional field that would fail is left out), so a copy of the
 * poster's own blocks is a valid payload. An image's source travels only
 * when it is a poster-assets file; any other source (a data URL, an
 * address) is written as '', which the paste counts as an image it cannot
 * copy (D).
 */
export function toClip(b: Block): ClipBlock {
  const clamp = (v: number, lo: number, hi: number, fallback: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
  const picture = b.type === 'image' || b.type === 'logo';
  const c: ClipBlock = {
    id: b.id, type: b.type,
    x: clamp(b.x, -CLIP_LIMITS.coord, CLIP_LIMITS.coord, 0),
    y: clamp(b.y, -CLIP_LIMITS.coord, CLIP_LIMITS.coord, 0),
    w: clamp(b.w, 1, CLIP_LIMITS.coord, 10),
    h: clamp(b.h, 1, CLIP_LIMITS.coord, 10),
    content: typeof b.content === 'string' ? b.content : '',
    imageSrc: picture && b.imageSrc ? (isPosterAssetSrc(b.imageSrc) ? b.imageSrc : '') : null,
    imageFit: REQUIRED.imageFit!(b.imageFit) ? b.imageFit : 'contain',
    tableData: b.type === 'table' && b.tableData ? tableToClip(b.tableData) : null,
  };
  for (const k of Object.keys(OPTIONAL)) {
    const v = (b as unknown as Record<string, unknown>)[k];
    if (v !== undefined && OPTIONAL[k]!(v)) (c as unknown as Record<string, unknown>)[k] = v;
  }
  return c;
}

/**
 * A table as the payload carries it: its known fields only, one cell per
 * place (missing cells empty, as the canvas draws them), column widths kept
 * only when there is one per column, an unknown border preset as APA (as
 * the canvas draws it), a custom border in its known fields (`borderToClip`).
 */
function tableToClip(t: TableData): TableData {
  const rows = Math.max(1, Math.trunc(t.rows) || 1);
  const cols = Math.max(1, Math.trunc(t.cols) || 1);
  const cells = Array.from({ length: rows * cols }, (_, i) => (typeof t.cells?.[i] === 'string' ? t.cells[i]! : ''));
  const colWidths = Array.isArray(t.colWidths) && t.colWidths.length === cols && t.colWidths.every(num(0, 100)) ? [...t.colWidths] : null;
  const borderPreset = typeof t.borderPreset === 'string' && (t.borderPreset === 'custom' || own(TABLE_BORDER_PRESETS, t.borderPreset)) ? t.borderPreset : 'apa';
  return { rows, cols, cells, colWidths, borderPreset, ...(t.customBorder && typeof t.customBorder === 'object' ? { customBorder: borderToClip(t.customBorder) } : {}) };
}

/**
 * A custom border in the payload's shape, drawn as the canvas draws the
 * stored one: its eight known fields, a flag set only when stored truthy, an
 * inner line only when stored `true` (missing ones none). Review round 2,
 * R2-2's sibling: a border of an older stored shape (no `innerH` / `innerV`,
 * which the Table tab pads when it next writes one) failed the check and was
 * left out, so the copy drew APA's lines.
 */
function borderToClip(cb: CustomTableBorder): CustomTableBorder {
  const lines = (a: unknown, max: number) => (Array.isArray(a) ? a.slice(0, max).map((x) => x === true) : []);
  return {
    topLine: !!cb.topLine, bottomLine: !!cb.bottomLine, leftLine: !!cb.leftLine, rightLine: !!cb.rightLine,
    headerLine: !!cb.headerLine, headerBox: !!cb.headerBox,
    innerH: lines(cb.innerH, CLIP_LIMITS.rows), innerV: lines(cb.innerV, CLIP_LIMITS.cols),
  };
}

/** A stored HTML text as lines of plain text (a line break, a paragraph or a list item ends a line). */
export function linesOf(html: string | undefined | null): string[] {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  let out = '';
  const walk = (n: Node) => {
    for (const ch of Array.from(n.childNodes)) {
      if (ch.nodeType === Node.TEXT_NODE) out += ch.textContent ?? '';
      else if (ch.nodeName === 'BR') out += '\n';
      else if (ch.nodeType === Node.ELEMENT_NODE) {
        const line = /^(P|DIV|LI)$/.test(ch.nodeName);
        if (line && out && !out.endsWith('\n')) out += '\n';
        walk(ch);
        if (line && !out.endsWith('\n')) out += '\n';
      }
    }
  };
  walk(doc.body);
  return out.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l, i, all) => l !== '' || (i > 0 && i < all.length - 1));
}

/** A block's words for another application (text/plain): its text, a table's cells (tabs between, one row a line), its caption and note. Authors and references blocks draw from their tabs: no words of their own. */
export function wordsOf(b: Block): string[] {
  const rows = b.type === 'table' && b.tableData
    ? Array.from({ length: b.tableData.rows }, (_, r) => b.tableData!.cells.slice(r * b.tableData!.cols, (r + 1) * b.tableData!.cols).map((c) => linesOf(c).join(' ')).join('\t'))
    : [];
  return [...linesOf(b.caption), ...linesOf(b.content), ...rows, ...linesOf(b.note)].filter((l) => l.trim() !== '');
}

const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string) => escapeText(s).replace(/"/g, '&quot;');

/** C1: what ⌘C puts on the clipboard for `blocks` (in the poster's order). */
export function clipboardOf(blocks: readonly Block[]): { html: string; text: string } {
  const payload: ClipPayload = { v: CLIP_VERSION, blocks: blocks.map(toClip) };
  const words = blocks.map(wordsOf).filter((w) => w.length);
  const html = `<div ${CLIP_ATTR}="${escapeAttr(JSON.stringify(payload))}">${words.flat().map((l) => `<p>${escapeText(l)}</p>`).join('')}</div>`;
  return { html, text: words.map((w) => w.join('\n')).join('\n\n') };
}

// ------------------------------------------------------------ messages

/** The toasts the rules name (C1, C2, C4, D, C6). */
export const CLIP_MESSAGES = {
  invalid: 'These blocks can\'t be pasted.',
  copyFailed: 'Couldn\'t copy the blocks.',
  tooLarge: 'These blocks are too large to copy.',
} as const;

/** C1: "Charts can't be copied, so the chart was left out." (R1-7: plural for several.) */
export function chartsMessage(n: number): string {
  return n === 1 ? 'Charts can\'t be copied, so the chart was left out.' : 'Charts can\'t be copied, so the charts were left out.';
}

/** C2: "1 picture stays on the canvas: it can't be pasted back." (R1-2) */
export function picturesStayMessage(n: number): string {
  return n === 1 ? '1 picture stays on the canvas: it can\'t be pasted back.' : `${n} pictures stay on the canvas: they can't be pasted back.`;
}

/** C4: "Not pasted: the poster already has a title and an authors block." */
export function refusalMessage(kinds: readonly OnePerPoster[]): string {
  const names = kinds.map((k) => ({ title: 'a title', authors: 'an authors block', logo: 'a logo' })[k]);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  return `Not pasted: the poster already has ${list}.`;
}

/** D: "1 image couldn't be copied, so its block is empty." */
export function imagesLostMessage(n: number): string {
  return n === 1 ? '1 image couldn\'t be copied, so its block is empty.' : `${n} images couldn't be copied, so their blocks are empty.`;
}
