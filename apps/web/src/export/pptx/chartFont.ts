/**
 * The poster's web font, put inside a chart's svg before it is drawn as a
 * picture for the PowerPoint file (record docs/fixes/31-exports-charts.md).
 *
 * An svg drawn as an image is a document of its own: it cannot use the
 * fonts the editor loaded from Google Fonts, so its text would be drawn in
 * a fallback font, wider or narrower than the one the chart measured and
 * laid its labels out in. So the font's files are fetched again (the
 * browser's cache usually has them) and written into the svg as data: URLs,
 * which an svg image may use.
 *
 * Bounded: only the faces chart text uses (normal style, weight 400: the
 * chart draws no bold or italic text), and only the subsets (unicode-range)
 * holding a character of the chart's text. A font the page has from the
 * system (Charter on macOS) is drawn by the image as it is by the page, and
 * needs nothing.
 */
import { googleFontsUrl } from '@/poster/fontLoader';

/** A family name as a FontFace or a stylesheet gives it: unquoted, lower case. */
const familyKey = (f: string) => f.trim().replace(/^['"]|['"]$/g, '').toLowerCase();

/**
 * Whether the page has `family` as a web font that has loaded: then a
 * picture of a chart drawn in it needs the font embedded.
 */
export function documentHasWebFont(family: string): boolean {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  if (!fonts || typeof fonts.forEach !== 'function') return false;
  let found = false;
  fonts.forEach((face) => {
    if (familyKey(face.family) === familyKey(family) && face.status === 'loaded') found = true;
  });
  return found;
}

/** The code points a unicode-range covers, as [from, to] pairs. */
function ranges(value: string): Array<[number, number]> {
  return value.split(',').flatMap((part) => {
    const m = /U\+([0-9A-F?]+)(?:-([0-9A-F]+))?/i.exec(part.trim());
    if (!m) return [];
    const from = m[1]!;
    if (from.includes('?')) return [[parseInt(from.replace(/\?/g, '0'), 16), parseInt(from.replace(/\?/g, 'F'), 16)]];
    const a = parseInt(from, 16);
    return [[a, m[2] ? parseInt(m[2], 16) : a]];
  });
}

/** Whether a face's font-weight (one value or a range) holds 400. */
function holds400(weight: string | undefined): boolean {
  if (!weight) return true;
  const w = weight.trim().split(/\s+/).map((x) => (x === 'normal' ? 400 : x === 'bold' ? 700 : Number(x)));
  return w.length > 1 ? w[0]! <= 400 && 400 <= w[1]! : w[0] === 400;
}

const MIME: Record<string, string> = { woff2: 'font/woff2', woff: 'font/woff', truetype: 'font/ttf', opentype: 'font/otf' };

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const fileCache = new Map<string, Promise<string>>();
const cssCache = new Map<string, Promise<string | null>>();

/** The family's Google Fonts stylesheet, fetched once per page (null when it cannot be). */
function stylesheet(family: string, fetcher: typeof fetch): Promise<string | null> {
  let p = cssCache.get(family);
  if (!p) {
    p = fetcher(googleFontsUrl(family)).then((res) => (res.ok ? res.text() : null)).catch(() => null);
    cssCache.set(family, p);
    void p.then((css) => {
      if (css === null) cssCache.delete(family);
    });
  }
  return p;
}

async function dataUrl(url: string, format: string, fetcher: typeof fetch): Promise<string> {
  let p = fileCache.get(url);
  if (!p) {
    p = (async () => {
      const res = await fetcher(url);
      if (!res.ok) throw new Error(`font ${res.status}`);
      const mime = MIME[format] ?? 'font/woff2';
      return `data:${mime};base64,${bytesToBase64(new Uint8Array(await res.arrayBuffer()))}`;
    })();
    fileCache.set(url, p);
    p.catch(() => fileCache.delete(url));
  }
  return p;
}

/**
 * The @font-face rules for `family` that a chart with text `text` uses, each
 * file inlined as a data: URL; null when the family's stylesheet or a file
 * cannot be fetched (the caller draws the picture anyway and says so).
 */
export async function embeddedFontCss(family: string, text: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    const css = await stylesheet(family, fetcher);
    if (css === null) return null;
    const points = new Set([...text].map((ch) => ch.codePointAt(0)!));
    const rules: string[] = [];
    for (const m of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
      const body = m[1]!;
      const prop = (name: string) => new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i').exec(body)?.[1]?.trim();
      if (familyKey(prop('font-family') ?? '') !== familyKey(family)) continue;
      if ((prop('font-style') ?? 'normal') !== 'normal' || !holds400(prop('font-weight'))) continue;
      const range = prop('unicode-range');
      if (range && ![...points].some((cp) => ranges(range).some(([a, b]) => cp >= a && cp <= b))) continue;
      const src = /url\(\s*['"]?([^'")]+)['"]?\s*\)\s*(?:format\(\s*['"]?([\w-]+)['"]?\s*\))?/i.exec(prop('src') ?? '');
      if (!src) continue;
      const url = await dataUrl(src[1]!, src[2] ?? 'woff2', fetcher);
      rules.push(`@font-face { font-family: '${family.replace(/'/g, '')}'; font-style: normal; font-weight: 400; src: url(${url})${range ? `; unicode-range: ${range}` : ''}; }`);
    }
    return rules.length ? rules.join('\n') : null;
  } catch {
    return null;
  }
}
