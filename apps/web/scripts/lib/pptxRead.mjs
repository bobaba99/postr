/**
 * What scripts/pptx-export-check.mjs reads from a PowerPoint file and how it
 * compares pictures (record docs/fixes/31-exports-charts.md). Plain Node: the
 * file is unzipped with the repo's fflate and its XML read with regular
 * expressions, so nothing of the app's own export or import code is used to
 * read what the export wrote (the re-import through the app's own reader is
 * a separate claim in the harness).
 *
 * - `readPptx(bytes)`: the slide size, every picture on slide 1 (its box and
 *   rotation in slide inches, its media part, a PNG's pixel size and bytes),
 *   every text shape (its box, rotation and text) and every paragraph.
 * - `inkDiff(a, b)`: how two screenshots of the same size differ where
 *   either is drawn: the share of inked pixels with no pixel of their colour
 *   (INK_DIFF) within REACH px in the other.
 * - The fake web font: `installFakeFonts(context, …)` answers the poster
 *   font's Google Fonts stylesheet and font files with a font this machine
 *   has (Comic Sans MS: glyphs and widths far from the fallback system
 *   font's), so the editor draws its charts in a web font the way it does
 *   in production, where the harnesses' fake backend otherwise aborts Google
 *   Fonts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { REPO } from './editorHarness.mjs';
import { decodePNG } from './png.mjs';

const require = createRequire(import.meta.url);
const { unzipSync, strFromU8 } = require(path.join(REPO, 'node_modules/fflate'));

const EMU_PER_IN = 914400;
const r3 = (v) => Math.round(v * 1000) / 1000;
const decodeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** The pixel size a PNG's header gives, or null when the bytes are not a PNG. */
export function pngSize(bytes) {
  const b = Buffer.from(bytes);
  if (b.length < 24 || b.toString('ascii', 1, 4) !== 'PNG') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/**
 * Slide 1 of a .pptx: `slideIn` [w, h], `pics` (each `box` [x, y, w, h] in
 * slide inches as written, before its rotation, `rot` in degrees, `media`
 * the part's name, `png` its pixel size or null, `bytes`), `paras` (each
 * paragraph's text, line breaks as "\n") and `text` (every run joined).
 */
export function readPptx(bytes) {
  const files = unzipSync(new Uint8Array(bytes));
  const pres = strFromU8(files['ppt/presentation.xml']);
  const sz = /<p:sldSz[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/.exec(pres);
  const slideIn = sz ? [r3(Number(sz[1]) / EMU_PER_IN), r3(Number(sz[2]) / EMU_PER_IN)] : null;
  const xml = strFromU8(files['ppt/slides/slide1.xml']);
  const relsXml = strFromU8(files['ppt/slides/_rels/slide1.xml.rels'] ?? new Uint8Array());
  const rels = new Map([...relsXml.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const pics = [...xml.matchAll(/<p:pic>([\s\S]*?)<\/p:pic>/g)].map((m) => {
    const body = m[1];
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"\s*\/>/.exec(body);
    const ext = /<a:ext cx="(\d+)" cy="(\d+)"\s*\/>/.exec(body);
    const rot = /<a:xfrm\b[^>]*\brot="(-?\d+)"/.exec(body);
    const embed = /<a:blip\b[^>]*\br:embed="([^"]+)"/.exec(body);
    const target = embed ? rels.get(embed[1]) : null;
    const media = target ? path.posix.normalize(path.posix.join('ppt/slides', target)) : null;
    const data = media ? files[media] : null;
    return {
      box: off && ext ? [Number(off[1]), Number(off[2]), Number(ext[1]), Number(ext[2])].map((v) => r3(v / EMU_PER_IN)) : null,
      rot: rot ? Number(rot[1]) / 60000 : 0,
      media,
      png: data ? pngSize(data) : null,
      bytes: data ?? null,
      descr: decodeXml(/<p:cNvPr\b[^>]*\bdescr="([^"]*)"/.exec(body)?.[1] ?? ''),
    };
  });
  const paras = [];
  for (const m of xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>|<a:p\s[^>]*>([\s\S]*?)<\/a:p>/g)) {
    const body = m[1] ?? m[2] ?? '';
    let t = '';
    for (const x of body.matchAll(/<a:t>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/>/g)) t += x[1] !== undefined ? decodeXml(x[1]) : '\n';
    if (t) paras.push(t);
  }
  // Each text shape: its box (before its turn) and turn, and its text.
  const boxes = [...xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)].map((m) => {
    const body = m[1];
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"\s*\/>/.exec(body);
    const ext = /<a:ext cx="(\d+)" cy="(\d+)"\s*\/>/.exec(body);
    const rot = /<a:xfrm\b[^>]*\brot="(-?\d+)"/.exec(body);
    let t = '';
    for (const x of body.matchAll(/<a:t>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/>|<\/a:p>/g)) t += x[1] !== undefined ? decodeXml(x[1]) : '\n';
    return {
      box: off && ext ? [Number(off[1]), Number(off[2]), Number(ext[1]), Number(ext[2])].map((v) => r3(v / EMU_PER_IN)) : null,
      rot: rot ? Number(rot[1]) / 60000 : 0,
      text: t.trim(),
    };
  });
  return { slideIn, pics, paras, boxes, text: paras.join('\n'), shapes: boxes.length };
}

/**
 * A channel difference above this is a different colour, not anti-aliasing:
 * half the range, so an edge pixel blended halfway between a bar's blue and
 * the white beside it matches either (calibrated on 13 charts' saved
 * comparisons, record 31 §4: at 96 the same drawing differed by up to
 * 2.31 % at a horizontal bar chart's edges, at 128 by 0.00 %; another font by
 * at least 27.5 % and 24.5 %).
 */
export const INK_DIFF = 128;
/** A pixel is drawn (inked) when one of its channels is darker than this on white. */
const INK = 200;
/** How far (px) a pixel may find its match in the other picture: resampling moves an edge by a pixel. */
const REACH = 1;
/** Dark ink: every channel below this (the chart's text and axes, #1c1b1a; bars and grid are lighter). */
const DARK = 128;

/**
 * Two screenshots (PNG buffers) of the same size: the pixels inked in either
 * that have no pixel of the same colour (each channel within INK_DIFF)
 * within REACH px in the other, as a share of the pixels dark in either (the
 * text and axes; of all inked pixels when none is dark), and the counts.
 * Over all inked pixels a chart of large bars hid its text: the fallback
 * font changed 0.36 % of a 14.7 in bar chart's ink (record 31 §4). A picture drawn at
 * 300 px per inch and scaled down to the comparison's size moves a glyph's
 * edge by up to a pixel against the same svg drawn at that size (up to 6.4 %
 * of the inked pixels differed pixel for pixel on a scatter whose glyphs are
 * identical to the eye: record 31 §4); a text drawn in another font moves
 * whole strokes. Sizes that differ compare over the smaller box and say so.
 */
export function inkDiff(aBuf, bBuf) {
  const a = decodePNG(aBuf);
  const b = decodePNG(bBuf);
  const w = Math.min(a.w, b.w);
  const h = Math.min(a.h, b.h);
  const same = (p, q) => Math.abs(p[0] - q[0]) <= INK_DIFF && Math.abs(p[1] - q[1]) <= INK_DIFF && Math.abs(p[2] - q[2]) <= INK_DIFF;
  const matched = (img, x, y, p) => {
    for (let dy = -REACH; dy <= REACH; dy += 1) {
      for (let dx = -REACH; dx <= REACH; dx += 1) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && same(p, img.rgb(xx, yy))) return true;
      }
    }
    return false;
  };
  let inked = 0;
  let dark = 0;
  let differ = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const p = a.rgb(x, y);
      const q = b.rgb(x, y);
      if (Math.min(...p) >= INK && Math.min(...q) >= INK) continue;
      inked += 1;
      if (Math.max(...p) < DARK || Math.max(...q) < DARK) dark += 1;
      if (!matched(b, x, y, p) || !matched(a, x, y, q)) differ += 1;
    }
  }
  const base = dark || inked;
  return { share: base ? Math.round((differ / base) * 10000) / 10000 : 0, inked, dark, differ, sizes: a.w === b.w && a.h === b.h ? null : [[a.w, a.h], [b.w, b.h]] };
}

/** The families the fake answers; any other gets Google's answer for a family it does not have (400). */
export const FAKE_FAMILIES = ['Source Sans 3'];
const FONT_FILES = { regular: '/System/Library/Fonts/Supplemental/Comic Sans MS.ttf', bold: '/System/Library/Fonts/Supplemental/Comic Sans MS Bold.ttf' };

/** Whether this machine has the fake web font's files (macOS). */
export const fakeFontsAvailable = () => Object.values(FONT_FILES).every((f) => fs.existsSync(f));

/**
 * Answer https://fonts.googleapis.com/css2 the way Google does (one
 * @font-face per requested weight and subset, a latin and a latin-ext
 * unicode-range, CORS open) for FAKE_FAMILIES, and their files at
 * https://fonts.gstatic.com/s/zq/…, with this machine's Comic Sans MS.
 * `log` records each request (`css`, `font`, `refused`).
 */
export async function installFakeFonts(context, log = []) {
  const cors = { 'access-control-allow-origin': '*' };
  const latin = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
  const latinExt = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';
  await context.route('https://fonts.googleapis.com/**', (route) => {
    const u = new URL(route.request().url());
    const fam = (u.searchParams.get('family') ?? '').split(':');
    const family = fam[0].replace(/\+/g, ' ');
    if (!FAKE_FAMILIES.includes(family)) {
      log.push({ kind: 'refused', family });
      return route.fulfill({ status: 400, headers: cors, contentType: 'text/html', body: 'family not found' });
    }
    log.push({ kind: 'css', family });
    const weights = (/wght@([\d;]+)/.exec(fam[1] ?? '')?.[1] ?? '400').split(';').map(Number);
    const slug = family.toLowerCase().replace(/\s+/g, '');
    const faces = weights.flatMap((wt) => [['latin-ext', latinExt], ['latin', latin]].map(([sub, range]) => `/* ${sub} */
@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: ${wt};
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/zq/${slug}-${wt >= 600 ? 'bold' : 'regular'}-${sub}.ttf) format('truetype');
  unicode-range: ${range};
}`));
    return route.fulfill({ status: 200, headers: cors, contentType: 'text/css; charset=utf-8', body: faces.join('\n') });
  });
  await context.route('https://fonts.gstatic.com/**', (route) => {
    const u = route.request().url();
    log.push({ kind: 'font', url: u.slice(0, 120) });
    const file = /-bold-/.test(u) ? FONT_FILES.bold : FONT_FILES.regular;
    return route.fulfill({ status: 200, headers: cors, contentType: 'font/ttf', body: fs.readFileSync(file) });
  });
}
