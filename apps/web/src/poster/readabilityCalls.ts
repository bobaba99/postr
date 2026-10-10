/**
 * The plot checker's call scanner (fix 13b), shared by its Python and R rule
 * tables (readabilityPyRules.ts, readabilityRModel.ts) and by the script
 * generators that edit a script in place (readabilityPyFix.ts,
 * readabilityRFix.ts).
 *
 * Every call is found in the masked copy of the code (comments and string
 * contents blanked, same length: readabilitySource.ts maskCodeForRewrite),
 * so a call named in a comment or a string is never read and never edited,
 * and every offset it reports is valid in the original. Values are read
 * from the original through those offsets.
 */
import { maskCodeForRewrite, maskComments } from './readabilitySource';

export interface Source {
  /** The code as pasted. */
  code: string;
  /** Comments and string contents blanked (quotes kept), same length. */
  masked: string;
  /** Comments blanked, string contents kept, same length. */
  text: string;
  /** For each opening bracket in `masked`, the index of its closing one (-1 elsewhere or unbalanced). */
  close: Int32Array;
  /** Bracket depth just before each character of `masked`. */
  depth: Int32Array;
}

export function source(code: string): Source {
  const masked = maskCodeForRewrite(code);
  const close = new Int32Array(masked.length).fill(-1);
  const depth = new Int32Array(masked.length + 1);
  const stack: number[] = [];
  for (let i = 0; i < masked.length; i++) {
    depth[i] = stack.length;
    const ch = masked[i]!;
    if (ch === '(' || ch === '[' || ch === '{') stack.push(i);
    else if ((ch === ')' || ch === ']' || ch === '}') && stack.length) close[stack.pop()!] = i;
  }
  depth[masked.length] = stack.length;
  return { code, masked, text: maskComments(code), close, depth };
}

/** One top-level argument of a call; offsets into the code, value trimmed. */
export interface Arg {
  /** The keyword, or null for a positional argument. */
  name: string | null;
  start: number;
  end: number;
  /** The whole argument, keyword included (for removing it). */
  argStart: number;
  argEnd: number;
  /** Python's `*args` (1) or `**kwargs` (2): `start` is past the stars. Never a positional argument. */
  star?: 1 | 2;
}

export interface Call {
  /** The function or method name: `set_xlabel`. */
  name: string;
  /** What it is called on, as written (`ax`, `axs[0]`, `plt`, `g.figure`), '' for a bare call. */
  receiver: string;
  /** Start of the receiver (or of the name for a bare call). */
  start: number;
  open: number;
  close: number;
  args: Arg[];
}

/** An argument's name: a Python keyword, or an R one, which may hold dots (`axis.text`). */
const IDENT = /[A-Za-z_.][\w.]*/y;

/** The top-level arguments between `open` and its closing bracket. */
export function splitArgs(src: Source, open: number): Arg[] {
  const end = src.close[open]!;
  if (end < 0) return [];
  const out: Arg[] = [];
  let from = open + 1;
  const push = (to: number) => {
    let a = from;
    let b = to;
    while (a < b && /\s/.test(src.masked[a]!)) a++;
    while (b > a && /\s/.test(src.masked[b - 1]!)) b--;
    if (a >= b) return;
    IDENT.lastIndex = a;
    const id = IDENT.exec(src.masked);
    let name: string | null = null;
    let start = a;
    if (src.masked[a] === '*') {
      const star = src.masked[a + 1] === '*' ? 2 : 1;
      out.push({ name: null, start: a + star, end: b, argStart: a, argEnd: b, star });
      return;
    }
    if (id) {
      let k = a + id[0].length;
      while (k < b && /[ \t]/.test(src.masked[k]!)) k++;
      // `name = value` (Python) or `name = value` (R); not `==`.
      if (src.masked[k] === '=' && src.masked[k + 1] !== '=') {
        name = id[0];
        start = k + 1;
        while (start < b && /\s/.test(src.masked[start]!)) start++;
      }
    }
    out.push({ name, start, end: b, argStart: a, argEnd: b });
  };
  for (let i = open + 1; i < end; i++) {
    if (src.masked[i] === ',' && src.depth[i] === src.depth[open + 1]) {
      push(i);
      from = i + 1;
    }
  }
  push(end);
  return out;
}

/** Walk back from a `.` (or the name) over the receiver: names, dots and whole bracket groups. */
function receiverStart(src: Source, at: number): number {
  let j = at - 1;
  while (j >= 0) {
    const ch = src.masked[j]!;
    if (/[\w.]/.test(ch)) { j--; continue; }
    if (ch === ')' || ch === ']') {
      const opener = ch === ')' ? '(' : '[';
      let d = 1;
      j--;
      while (j >= 0 && d > 0) {
        if (src.masked[j] === ch) d++;
        else if (src.masked[j] === opener) d--;
        j--;
      }
      continue;
    }
    break;
  }
  return j + 1;
}

/** Every call whose name matches `name` (anchored), in source order. */
export function calls(src: Source, name: RegExp): Call[] {
  const re = /([A-Za-z_]\w*)\s*\(/g;
  const exact = new RegExp(`^(?:${name.source})$`);
  const out: Call[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src.masked)) !== null) {
    const fn = m[1]!;
    if (!exact.test(fn)) continue;
    const open = m.index + m[0].length - 1;
    if (src.close[open]! < 0) continue;
    // `def set_title(` defines, it does not call.
    if (/\bdef\s+$/.test(src.masked.slice(Math.max(0, m.index - 8), m.index))) continue;
    const dot = m.index - 1;
    const hasReceiver = dot >= 0 && src.masked[dot] === '.';
    const start = hasReceiver ? receiverStart(src, dot) : m.index;
    if (!hasReceiver && m.index > 0 && /[\w.]/.test(src.masked[m.index - 1]!)) continue;
    out.push({
      name: fn,
      receiver: hasReceiver ? src.masked.slice(start, dot) : '',
      start,
      open,
      close: src.close[open]!,
      args: splitArgs(src, open),
    });
  }
  return out;
}

/** The argument named `name`, else the positional one at `position` (`*args` and `**kwargs` are not positional). */
export function argOf(call: Call, name: string, position?: number): Arg | undefined {
  const named = call.args.find((a) => a.name === name);
  if (named || position === undefined) return named;
  return call.args.filter((a) => a.name === null && !a.star)[position];
}

/**
 * R's own argument matching (R Language Definition 4.3.2), for a call to a
 * function whose formals are `formals` (all before its `...`): exact names
 * first, then a unique partial name (`file =` is `filename =`), then the
 * unnamed arguments in the order of the formals left. A name that matches
 * no formal, or more than one partially, goes to `...` (R: an error for the
 * second), and so does every unnamed argument past the last formal.
 * P13B-R1-07: counting only unnamed arguments read the plot of
 * `ggsave(filename = "f.png", p)` as missing, and the fix bound p to device.
 */
export function matchR(call: Call, formals: readonly string[]): Map<string, Arg> {
  const out = new Map<string, Arg>();
  const left = new Set(formals);
  const named = call.args.filter((a) => a.name !== null);
  const rest: Arg[] = [];
  for (const a of named) {
    if (left.has(a.name!)) { out.set(a.name!, a); left.delete(a.name!); } else rest.push(a);
  }
  for (const a of rest) {
    const hits = [...left].filter((f) => f.startsWith(a.name!));
    if (hits.length === 1) { out.set(hits[0]!, a); left.delete(hits[0]!); }
  }
  const order = formals.filter((f) => left.has(f));
  call.args.filter((a) => a.name === null).forEach((a, k) => { if (order[k]) out.set(order[k]!, a); });
  return out;
}

/** The text of an argument's value, from the original code. */
export function valueOf(src: Source, arg: Arg): string {
  return src.code.slice(arg.start, arg.end);
}

/** The contents of a quoted string literal spanning start..end, or null. */
export function stringAt(src: Source, start: number, end: number): string | null {
  const t = src.code.slice(start, end).trim();
  const m = t.match(/^[rRuUbB]?(['"])(.*)\1$/s);
  return m ? m[2]! : null;
}

/** One `key: value` entry of a dict literal `{...}` whose `{` is at `open`. */
export interface DictEntry {
  key: string | null;
  start: number;
  end: number;
}

export function dictEntries(src: Source, open: number): DictEntry[] {
  const out: DictEntry[] = [];
  for (const part of splitArgs(src, open)) {
    const colon = (() => {
      for (let i = part.argStart; i < part.argEnd; i++) {
        if (src.masked[i] === ':' && src.depth[i] === src.depth[part.argStart]) return i;
      }
      return -1;
    })();
    if (colon < 0) continue;
    let start = colon + 1;
    while (start < part.argEnd && /\s/.test(src.masked[start]!)) start++;
    out.push({ key: stringAt(src, part.argStart, colon), start, end: part.argEnd });
  }
  return out;
}

/** Start of the line on which the statement holding `at` begins (a newline at bracket depth 0). */
export function statementStart(src: Source, at: number): number {
  let i = at;
  while (i > 0) {
    const nl = src.masked.lastIndexOf('\n', i - 1);
    if (nl < 0) return 0;
    if (src.depth[nl] === 0 && !/\\\s*$/.test(src.masked.slice(src.masked.lastIndexOf('\n', nl - 1) + 1, nl))) return nl + 1;
    i = nl;
  }
  return 0;
}

/** End of the statement holding `at`: the next newline at bracket depth 0 (or the end). */
export function statementEnd(src: Source, at: number): number {
  for (let i = at; i < src.masked.length; i++) {
    if (src.masked[i] === '\n' && src.depth[i] === 0 && src.masked[i - 1] !== '\\') return i;
  }
  return src.masked.length;
}

/** The leading blanks of the line starting at `lineStart`. */
export function indentAt(code: string, lineStart: number): string {
  return /^[ \t]*/.exec(code.slice(lineStart))![0];
}

/**
 * A number written as a literal, a name holding one, or arithmetic of
 * those (`250 / 25.4`, `8.5 * cm`, `(26 / 2.54)`): + - * / and brackets
 * only. Anything else (a call, an attribute, an unknown name) is null,
 * never a guess.
 */
export function evalNumber(text: string, resolve: (name: string) => number | null): number | null {
  const toks = text.match(/\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|[A-Za-z_][\w.]*|[-+*/()]|\S/g) ?? [];
  let k = 0;
  const peek = () => toks[k];
  const atom = (): number | null => {
    const t = toks[k++];
    if (t === undefined) return null;
    if (t === '(') {
      const v = sum();
      return toks[k++] === ')' ? v : null;
    }
    if (t === '-') { const v = atom(); return v === null ? null : -v; }
    if (t === '+') return atom();
    if (/^[\d.]/.test(t)) { const n = Number(t); return Number.isFinite(n) ? n : null; }
    if (/^[A-Za-z_]/.test(t)) return resolve(t);
    return null;
  };
  const product = (): number | null => {
    let v = atom();
    while (v !== null && (peek() === '*' || peek() === '/')) {
      const op = toks[k++];
      const r = atom();
      if (r === null) return null;
      v = op === '*' ? v * r : r === 0 ? null : v / r;
    }
    return v;
  };
  const sum = (): number | null => {
    let v = product();
    while (v !== null && (peek() === '+' || peek() === '-')) {
      const op = toks[k++];
      const r = product();
      if (r === null) return null;
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const v = sum();
  return v !== null && k === toks.length && Number.isFinite(v) ? v : null;
}
