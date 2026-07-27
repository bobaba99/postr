/**
 * Rich-text run model for editable exports.
 *
 * Poster text content (title / heading / text blocks, captions,
 * notes, table cells) is stored as sanitized inline HTML produced by
 * `sanitizeHtml.ts` — a tight allowlist of b/strong, i/em, u,
 * s/strike/del, mark, sub, sup, br, span[color|background-color],
 * ol/ul/li plus plain text with entities.
 *
 * Both export writers need that HTML as a flat list of styled runs
 * (PPTX: `<a:r>` run objects; LaTeX: nested inline commands). This
 * parser converts the allowlisted dialect WITHOUT DOMParser so the
 * writers stay pure `PosterDoc → bytes` functions with no DOM
 * dependency (plan §5 — the standalone-pipeline constraint).
 *
 * Unknown `<` sequences are treated as literal text, so legacy
 * plain-text content like "x < y" survives unmangled.
 */

export interface RichRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  sub: boolean;
  sup: boolean;
  /** CSS color value from span[style], null = inherit. */
  color: string | null;
  /** CSS background-color / mark highlight, null = none. */
  highlight: string | null;
}

export interface RichParagraph {
  runs: RichRun[];
  /** Set when the paragraph is a list item. */
  list: 'ordered' | 'unordered' | null;
  /** 1-based number within its ordered list, null otherwise. */
  listIndex: number | null;
}

interface StyleState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  sub: boolean;
  sup: boolean;
  color: string | null;
  highlight: string | null;
}

const INITIAL_STATE: StyleState = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  sub: false,
  sup: false,
  color: null,
  highlight: null,
};

/** Browser default `<mark>` background. */
const MARK_HIGHLIGHT = '#FFFF00';

/** Tags the sanitizer can emit — anything else is literal text. */
const KNOWN_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'mark',
  'sub', 'sup', 'br', 'span', 'ol', 'ul', 'li',
]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  // Decoded to a REGULAR space on purpose: U+00A0 breaks pdfLaTeX
  // and buys nothing in an export context.
  nbsp: ' ',
};

/** Decode the entity forms `escapeHtml` / browsers emit. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

interface ParsedTag {
  name: string;
  closing: boolean;
  attrs: string;
  /** Index just past the closing `>`. */
  end: number;
}

/**
 * Try to read a tag at `start` (which points at `<`). Returns null
 * when the text is not a well-formed known tag — caller treats the
 * `<` as literal text.
 */
function readTag(html: string, start: number): ParsedTag | null {
  const close = html.indexOf('>', start);
  if (close === -1) return null;
  const raw = html.slice(start + 1, close).trim();
  if (!raw) return null;
  const closing = raw.startsWith('/');
  const body = (closing ? raw.slice(1) : raw).replace(/\/$/, '').trim();
  const nameMatch = /^([a-zA-Z]+)([\s\S]*)$/.exec(body);
  if (!nameMatch) return null;
  const name = nameMatch[1]!.toLowerCase();
  if (!KNOWN_TAGS.has(name)) return null;
  return { name, closing, attrs: nameMatch[2] ?? '', end: close + 1 };
}

/** Extract color / background-color from a span's attrs string. */
function parseSpanStyle(attrs: string): { color: string | null; highlight: string | null } {
  const styleMatch = /style\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
  const style = styleMatch?.[1] ?? styleMatch?.[2] ?? '';
  let color: string | null = null;
  let highlight: string | null = null;
  for (const rule of style.split(';')) {
    const idx = rule.indexOf(':');
    if (idx === -1) continue;
    const prop = rule.slice(0, idx).trim().toLowerCase();
    const value = rule.slice(idx + 1).trim();
    if (!value) continue;
    if (prop === 'color') color = value;
    if (prop === 'background-color') highlight = value;
  }
  return { color, highlight };
}

/** Read the `start` attribute off an `<ol>` tag, default 1. */
function parseOlStart(attrs: string): number {
  const m = /start\s*=\s*(?:"(\d{1,4})"|'(\d{1,4})'|(\d{1,4}))/i.exec(attrs);
  const raw = m?.[1] ?? m?.[2] ?? m?.[3];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function applyTag(state: StyleState, tag: ParsedTag): StyleState {
  switch (tag.name) {
    case 'b':
    case 'strong':
      return { ...state, bold: true };
    case 'i':
    case 'em':
      return { ...state, italic: true };
    case 'u':
      return { ...state, underline: true };
    case 's':
    case 'strike':
    case 'del':
      return { ...state, strike: true };
    case 'mark':
      return { ...state, highlight: MARK_HIGHLIGHT };
    case 'sub':
      return { ...state, sub: true };
    case 'sup':
      return { ...state, sup: true };
    case 'span': {
      const { color, highlight } = parseSpanStyle(tag.attrs);
      return {
        ...state,
        color: color ?? state.color,
        highlight: highlight ?? state.highlight,
      };
    }
    default:
      return state;
  }
}

const STYLE_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'mark', 'sub', 'sup', 'span',
]);

/**
 * Parse sanitized inline HTML into paragraphs of styled runs.
 * Paragraph boundaries: `<br>`, literal newlines (the editor renders
 * with `white-space: pre-wrap`), and `<li>` items. Trailing empty
 * paragraphs are dropped; empty input returns [].
 */
export function parseRichText(html: string): RichParagraph[] {
  const paragraphs: RichParagraph[] = [];
  let runs: RichRun[] = [];
  let currentList: 'ordered' | 'unordered' | null = null;
  let currentListIndex: number | null = null;
  let inListItem = false;
  let olCounter = 1;

  /** Style stack — index 0 is the base state. */
  const stack: Array<{ tag: string; state: StyleState }> = [
    { tag: '', state: INITIAL_STATE },
  ];
  const top = (): StyleState => stack[stack.length - 1]!.state;

  const flushParagraph = () => {
    paragraphs.push({
      runs,
      list: inListItem ? currentList : null,
      listIndex: inListItem && currentList === 'ordered' ? currentListIndex : null,
    });
    runs = [];
  };

  const pushText = (raw: string) => {
    if (!raw) return;
    const state = top();
    const pieces = raw.split('\n');
    pieces.forEach((piece, i) => {
      if (i > 0) flushParagraph();
      if (!piece) return;
      const text = decodeEntities(piece);
      const prev = runs[runs.length - 1];
      if (prev && runsCompatible(prev, state)) {
        runs[runs.length - 1] = { ...prev, text: prev.text + text };
      } else {
        runs.push({ ...state, text });
      }
    });
  };

  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      pushText(html.slice(i));
      break;
    }
    pushText(html.slice(i, lt));
    const tag = readTag(html, lt);
    if (!tag) {
      // Not a known tag — literal `<`.
      pushText('&lt;');
      i = lt + 1;
      continue;
    }
    i = tag.end;

    if (tag.name === 'br') {
      flushParagraph();
      continue;
    }

    if (tag.name === 'ol' || tag.name === 'ul') {
      if (!tag.closing) {
        if (runs.length > 0) flushParagraph();
        currentList = tag.name === 'ol' ? 'ordered' : 'unordered';
        olCounter = tag.name === 'ol' ? parseOlStart(tag.attrs) : 1;
      } else {
        if (inListItem) {
          flushParagraph();
          inListItem = false;
        }
        currentList = null;
        currentListIndex = null;
      }
      continue;
    }

    if (tag.name === 'li') {
      if (!tag.closing) {
        if (inListItem || runs.length > 0) flushParagraph();
        inListItem = true;
        currentListIndex = olCounter;
        olCounter += 1;
      } else {
        flushParagraph();
        inListItem = false;
      }
      continue;
    }

    if (STYLE_TAGS.has(tag.name)) {
      if (!tag.closing) {
        stack.push({ tag: tag.name, state: applyTag(top(), tag) });
      } else {
        // Pop the nearest matching frame; tolerate mismatched HTML.
        for (let s = stack.length - 1; s >= 1; s--) {
          if (stack[s]!.tag === tag.name) {
            stack.splice(s, 1);
            break;
          }
        }
      }
    }
  }

  if (runs.length > 0 || inListItem) flushParagraph();

  // Drop trailing empty paragraphs (a dangling <br> shouldn't emit
  // an empty line in the export).
  while (paragraphs.length > 0 && isEmptyParagraph(paragraphs[paragraphs.length - 1]!)) {
    paragraphs.pop();
  }
  return paragraphs;
}

function isEmptyParagraph(p: RichParagraph): boolean {
  return p.list === null && p.runs.every((r) => r.text.length === 0);
}

function runsCompatible(run: RichRun, state: StyleState): boolean {
  return (
    run.bold === state.bold &&
    run.italic === state.italic &&
    run.underline === state.underline &&
    run.strike === state.strike &&
    run.sub === state.sub &&
    run.sup === state.sup &&
    run.color === state.color &&
    run.highlight === state.highlight
  );
}

/** Plain-text projection — for alt text, warnings, filenames. */
export function richTextToPlain(paragraphs: RichParagraph[]): string {
  return paragraphs
    .map((p) => p.runs.map((r) => r.text).join(''))
    .join('\n');
}

/**
 * Split citation-formatter output (`_italic_` marker dialect from
 * citations.ts) into italic/regular segments. Not HTML — a separate
 * tiny dialect used only by reference strings.
 */
export function splitItalicMarkers(text: string): Array<{ text: string; italic: boolean }> {
  const out: Array<{ text: string; italic: boolean }> = [];
  const re = /_([^_]+)_/g;
  let last = 0;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), italic: false });
    out.push({ text: m[1]!, italic: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), italic: false });
  return out;
}

/**
 * Normalize a CSS color to a 6-digit uppercase hex string (no `#`),
 * the form both LaTeX `[HTML]` and PPTX hex options accept.
 * Alpha channels are dropped. Returns null for unparseable values.
 */
export function cssColorToHex6(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  const hexMatch = /^#([0-9a-f]{3,8})$/.exec(v);
  if (hexMatch) {
    const h = hexMatch[1]!;
    if (h.length === 3 || h.length === 4) {
      return (h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!).toUpperCase();
    }
    if (h.length === 6 || h.length === 8) {
      return h.slice(0, 6).toUpperCase();
    }
    return null;
  }
  const rgbMatch = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(v);
  if (rgbMatch) {
    const toHex = (raw: string): string => {
      const n = Math.max(0, Math.min(255, Math.round(Number.parseFloat(raw))));
      return n.toString(16).padStart(2, '0');
    };
    return (toHex(rgbMatch[1]!) + toHex(rgbMatch[2]!) + toHex(rgbMatch[3]!)).toUpperCase();
  }
  return null;
}
