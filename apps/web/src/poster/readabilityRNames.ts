/**
 * R15 of the plot checker's R rule table (fix 13b, review round 3;
 * readabilityRModel.ts holds the table): a name that holds a theme gives it
 * where the name is used, not where it is written.
 *
 * | rule | idiom | gives | notes |
 * |------|-------|-------|-------|
 * | R15  | a top-level `name <- value` whose value holds a theme call, or uses a name that does: a theme object (`theme_fig <- theme_bw(16) + theme(...)`), a function that builds a plot (`make_panel <- function(d) ggplot(d) + theme_bw(16)`), a plot another is built from (`p2 <- p1 + labs(...)`) | its theme calls, at the place the name is used (the last use that reaches the plot read) | P13B-R3-01: a figure combining plots read each plot from its own assignment lines only, assumed base 11 and wrote `text = 11` over a theme_bw(16) held in a name or a function (14 element-runs lowered); one plot read a theme() held in a name where it was written, before the complete theme added after it, and the fix wrote a tick size below the 20 pt it set |
 *
 * Only a name whose last assignment before the use is top level is followed:
 * one assigned again inside a block (`if (poster) { p <- p + theme_bw(16) }`)
 * is read where it is written, in source order, as before.
 *
 * Positions: a theme call inside a followed name's value gets a position just
 * after the use (`use + k / (length + 2)` of the gap to the next character),
 * nested names nest inside that gap, so sorting by position applies themes in
 * the order ggplot2 adds them. Names are followed three deep.
 */
import { rStatementEnd } from './readabilityROutput';
import type { Source } from './readabilityCalls';

interface Holder { name: string; start: number; value: number; end: number }

/** What R15 needs of a source, found once per source. */
export interface Names {
  /** Top-level assignments holding a theme, by start: their values never overlap. */
  holders: Holder[];
  /** Each use of a holder's name and the holder it refers to. */
  uses: Array<{ at: number; holder: Holder }>;
}

const ASSIGN = /^[ \t]*([A-Za-z.][\w.]*)[ \t]*(?:<<-|<-|=(?!=))[ \t]*/gm;

/** Every `name <- value` statement at the start of a line: top level, or inside a block (`depth > 0`). */
function assignments(src: Source): Array<Holder & { top: boolean }> {
  const out: Array<Holder & { top: boolean }> = [];
  ASSIGN.lastIndex = 0;
  for (let m = ASSIGN.exec(src.masked); m; m = ASSIGN.exec(src.masked)) {
    const at = m.index + m[0].length - m[0].trimStart().length;
    const top = src.depth[at] === 0;
    // A `name = ` inside a call is an argument, not an assignment.
    if (!top && /=[ \t]*$/.test(m[0]) && !/<-/.test(m[0]) && !inBraces(src, at)) continue;
    const end = top ? rStatementEnd(src, at) : lineEnd(src, at);
    out.push({ name: m[1]!, start: at, value: m.index + m[0].length, end, top });
  }
  return out;
}

const lineEnd = (src: Source, at: number) => { const nl = src.masked.indexOf('\n', at); return nl < 0 ? src.masked.length : nl; };

/**
 * Each position's innermost open bracket (0 at the top level), found in one
 * pass per source: walking back from each `name = v` made a long function
 * body quadratic (3.7 s at 16,003 lines, MEASURED).
 */
const OPENER = new WeakMap<Source, Uint8Array>();
/** Whether the innermost bracket around `at` is a `{` (a block, where `name = v` assigns). */
function inBraces(src: Source, at: number): boolean {
  let open = OPENER.get(src);
  if (!open) {
    open = new Uint8Array(src.masked.length + 1);
    const stack: number[] = [];
    for (let i = 0; i < src.masked.length; i++) {
      open[i] = stack.length ? stack[stack.length - 1]! : 0;
      const ch = src.masked.charCodeAt(i);
      if (ch === 40 || ch === 91 || ch === 123) stack.push(ch);
      else if ((ch === 41 || ch === 93 || ch === 125) && stack.length) stack.pop();
    }
    OPENER.set(src, open);
  }
  return open[at] === 123;
}

const esc = (s: string) => s.replace(/[.]/g, '\\.');

/**
 * The holders and their uses. A holder holds one of `themeAts` (theme
 * calls), or uses a holder's name (a function that adds a theme object), to
 * three levels.
 */
export function namesOf(src: Source, themeAts: number[]): Names {
  const all = assignments(src);
  const top = all.filter((a) => a.top);
  /** The top-level assignment whose value holds `x` (their values never overlap). */
  const valueAt = (x: number): (typeof top)[number] | null => {
    let lo = 0;
    let hi = top.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const a = top[mid]!;
      if (x < a.value) hi = mid - 1;
      else if (x >= a.end) lo = mid + 1;
      else return a;
    }
    return null;
  };
  const holders = new Set<Holder>();
  for (const t of themeAts) { const a = valueAt(t); if (a) holders.add(a); }
  let uses: Names['uses'] = [];
  for (let round = 0; round < 4; round++) {
    uses = usesOf(src, all, holders);
    const size = holders.size;
    for (const u of uses) { const a = valueAt(u.at); if (a) holders.add(a); }
    if (holders.size === size) break;
  }
  return { holders: [...holders].sort((a, b) => a.start - b.start), uses };
}

function usesOf(src: Source, all: Array<Holder & { top: boolean }>, holders: Set<Holder>): Names['uses'] {
  const names = [...new Set([...holders].map((h) => h.name))];
  if (!names.length) return [];
  const byName = new Map<string, Array<Holder & { top: boolean }>>();
  for (const a of all) { if (names.includes(a.name)) { const l = byName.get(a.name) ?? []; l.push(a); byName.set(a.name, l); } }
  // Not `p$theme` (a part of p, read by Postr's own floor), not an assignment's left side or an argument's name.
  const re = new RegExp(`(?<![\\w.$@])(?:${names.map(esc).join('|')})(?![\\w.$@])(?![ \\t]*(?:<<-|<-|=(?!=)))`, 'g');
  const out: Names['uses'] = [];
  for (let m = re.exec(src.masked); m; m = re.exec(src.masked)) {
    const u = m.index;
    // The value a use refers to: the last assignment of the name done before it (R evaluates
    // `p <- p + x`'s right side first, so its own assignment is not done yet).
    const list = byName.get(m[0]) ?? [];
    let lo = 0;
    let hi = list.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid]!.start < u) lo = mid + 1; else hi = mid; }
    let i = lo - 1;
    while (i >= 0 && list[i]!.end > u) i--;
    const last = i >= 0 ? list[i]! : null;
    if (last && last.top && holders.has(last)) out.push({ at: u, holder: last });
  }
  return out;
}

/**
 * A theme call's position in the order ggplot2 applies it to one plot, or
 * null when it does not reach the plot. `bases`: the plot's own statements
 * (the whole script for a figure of one plot), read in place; `own`: those of
 * them that are a combined plot's own assignments, never moved, so they take
 * none of the three levels (the edited script's `p1 <- p1 + theme(...)` once
 * pushed a theme three names down out of reach: a re-check false fail on
 * r3-three-deep, MEASURED); `until`: the end of what the script writes.
 */
export function themeOrder(names: Names, bases: Array<[number, number]>, own: Array<[number, number]>, until: number): (at: number) => number | null {
  const inBase = (x: number) => bases.some(([s, e]) => x >= s && x < e);
  const placed = new Map<Holder, { at: number; step: number; depth: number }>();
  const holderAt = (x: number): Holder | null => {
    let lo = 0;
    let hi = names.holders.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const h = names.holders[mid]!;
      if (x < h.value) hi = mid - 1;
      else if (x >= h.end) lo = mid + 1;
      else return h;
    }
    return null;
  };
  /** A position, and the room after it for what a use there brings in. */
  const map = (x: number): { at: number; room: number; depth: number } | null => {
    const h = holderAt(x);
    const p = h ? placed.get(h) : undefined;
    if (h && p) return { at: p.at + p.step * (x - h.value + 1), room: p.step, depth: p.depth };
    return inBase(x) ? { at: x, room: 1, depth: 0 } : null;
  };
  // The last use first: a holder's own uses sit inside its value, before its own use.
  for (const u of [...names.uses].filter((x) => x.at < until).sort((a, b) => b.at - a.at)) {
    const h = u.holder;
    if (placed.has(h) || own.some(([s, e]) => h.start >= s && h.start < e)) continue;
    const m = map(u.at);
    if (!m || m.depth >= 3) continue;
    placed.set(h, { at: m.at, step: m.room / (h.end - h.value + 2), depth: m.depth + 1 });
  }
  return (at) => map(at)?.at ?? null;
}
