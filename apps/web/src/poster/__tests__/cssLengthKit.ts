/**
 * What a browser computes for a length written in an inline style, for the
 * fix 19 tests (docs/fixes/19-controls-one-size.md). jsdom does no layout,
 * but it keeps each inline style as React wrote it, so a control's size on
 * screen can be worked out the way CSS works it out:
 *
 *   - a length is resolved: `12px`, a bare number (0), `calc()` with + − × ÷
 *     and nested brackets, and `var(--name, fallback)` looked up on the
 *     element and then on each ancestor (a custom property inherits);
 *   - a percentage depends on the containing block, which needs layout: it
 *     is kept apart (`pct`), never mixed into `px`;
 *   - the on-screen size is the layout length times the `scale()`,
 *     `scaleX()` and `scaleY()` of the inline transforms above it (the
 *     sheet's zoom, and a control's own scale back), along the length's
 *     axis: an element's own transform scales its size but not where it is
 *     placed. Rotations and translations do not change a length.
 *
 * Nothing here knows how the editor sizes its controls: it reads what the
 * styles say and applies CSS's own rules, so the tests can catch a control
 * drawn in the sheet's units (its size then follows the zoom) whatever the
 * fix's helper is called.
 */

export interface Length {
  /** CSS px in the element's own layout (before any ancestor's scale). */
  px: number;
  /** Percent of the containing block (unresolved: needs layout). */
  pct: number;
}

type Val = { num: number } | Length;
const isLen = (v: Val): v is Length => 'px' in v;

/** The custom property `name` as the element inherits it, or null. */
function customProperty(el: Element, name: string): string | null {
  for (let e: Element | null = el; e; e = e.parentElement) {
    const v = (e as HTMLElement).style?.getPropertyValue(name);
    if (v && v.trim() !== '') return v.trim();
  }
  return null;
}

/** Split at top-level separators (whitespace and commas), keeping brackets whole. */
export function topLevelParts(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of text) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (depth === 0 && (ch === ' ' || ch === ',')) {
      if (cur) out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

class Parser {
  i = 0;
  constructor(private s: string, private el: Element) {}

  private ws() {
    while (this.s[this.i] === ' ') this.i += 1;
  }

  sum(): Val {
    let v = this.product();
    for (;;) {
      this.ws();
      const op = this.s[this.i];
      if (op !== '+' && op !== '-') return v;
      this.i += 1;
      const r = this.product();
      v = add(v, r, op === '-' ? -1 : 1);
    }
  }

  private product(): Val {
    let v = this.unary();
    for (;;) {
      this.ws();
      const op = this.s[this.i];
      if (op !== '*' && op !== '/') return v;
      this.i += 1;
      const r = this.unary();
      v = op === '*' ? mul(v, r) : div(v, r);
    }
  }

  private unary(): Val {
    this.ws();
    const rest = this.s.slice(this.i);
    if (rest.startsWith('(')) {
      this.i += 1;
      const v = this.sum();
      this.expect(')');
      return v;
    }
    if (rest.startsWith('calc(')) {
      this.i += 5;
      const v = this.sum();
      this.expect(')');
      return v;
    }
    if (rest.startsWith('var(')) {
      this.i += 4;
      this.ws();
      const name = /^--[\w-]+/.exec(this.s.slice(this.i));
      if (!name) throw new Error(`bad var() in ${this.s}`);
      this.i += name[0].length;
      this.ws();
      let fallback: string | null = null;
      if (this.s[this.i] === ',') {
        const start = this.i + 1;
        let depth = 0;
        while (this.i < this.s.length && !(depth === 0 && this.s[this.i] === ')')) {
          if (this.s[this.i] === '(') depth += 1;
          if (this.s[this.i] === ')') depth -= 1;
          this.i += 1;
        }
        fallback = this.s.slice(start, this.i).trim();
      }
      this.expect(')');
      const text = customProperty(this.el, name[0]) ?? fallback;
      if (text === null) throw new Error(`${name[0]} is not set and has no fallback`);
      return new Parser(text, this.el).sum();
    }
    const m = /^(-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?)(px|%)?/.exec(rest);
    if (!m) throw new Error(`cannot read a length at "${rest}" in "${this.s}"`);
    this.i += m[0].length;
    const n = Number(m[1]);
    if (m[2] === 'px') return { px: n, pct: 0 };
    if (m[2] === '%') return { px: 0, pct: n };
    return { num: n };
  }

  private expect(ch: string) {
    this.ws();
    if (this.s[this.i] !== ch) throw new Error(`expected "${ch}" at ${this.i} in "${this.s}"`);
    this.i += 1;
  }
}

function add(a: Val, b: Val, sign: number): Val {
  if (isLen(a) && isLen(b)) return { px: a.px + sign * b.px, pct: a.pct + sign * b.pct };
  if (!isLen(a) && !isLen(b)) return { num: a.num + sign * b.num };
  // `0` stands for a zero length.
  const len = isLen(a) ? a : (b as Length);
  const num = isLen(a) ? (b as { num: number }).num : a.num;
  if (num !== 0) throw new Error('a number added to a length');
  return isLen(a) ? len : { px: sign * len.px, pct: sign * len.pct };
}
function mul(a: Val, b: Val): Val {
  if (isLen(a) && isLen(b)) throw new Error('a length times a length');
  if (isLen(a)) return { px: a.px * (b as { num: number }).num, pct: a.pct * (b as { num: number }).num };
  if (isLen(b)) return { px: b.px * a.num, pct: b.pct * a.num };
  return { num: a.num * b.num };
}
function div(a: Val, b: Val): Val {
  if (isLen(b)) throw new Error('division by a length');
  if (isLen(a)) return { px: a.px / b.num, pct: a.pct / b.num };
  return { num: a.num / b.num };
}

/** One length (a number, `Npx`, `N%`, `calc()` or `var()`), as the element resolves it. */
export function resolveLength(el: Element, text: string): Length {
  const p = new Parser(text.trim(), el);
  const v = p.sum();
  return isLen(v) ? v : { px: v.num, pct: 0 };
}

const LENGTH_START = /^(-?(?:\d+\.?\d*|\.\d+)(px|%)?$|calc\(|var\()/;

/**
 * Every length in a property's value, in order: `border: 1px solid #fff`
 * has one, `padding: 0 8px` two, `box-shadow: 0 1px 4px rgba(…)` three, a
 * `drop-shadow()` filter and a gradient's colour stops their own. Colours,
 * angles and keywords are skipped.
 */
export function lengthsIn(el: Element, value: string): Length[] {
  const out: Length[] = [];
  for (const part of topLevelParts(value)) {
    const fn = /^(drop-shadow|(?:repeating-)?(?:linear|radial|conic)-gradient)\(/.exec(part);
    if (fn) {
      out.push(...lengthsIn(el, part.slice(fn[0].length, -1)));
    } else if (LENGTH_START.test(part)) {
      out.push(resolveLength(el, part));
    }
  }
  return out;
}

/** The calls to `name(…)` in a value, with their arguments split at top-level commas. */
function calls(value: string, names: string[]): { name: string; args: string[] }[] {
  const out: { name: string; args: string[] }[] = [];
  const re = new RegExp(`\\b(${names.join('|')})\\(`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(value))) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    const args: string[] = [];
    let argStart = start;
    for (; i < value.length && depth > 0; i++) {
      if (value[i] === '(') depth += 1;
      else if (value[i] === ')') depth -= 1;
      else if (value[i] === ',' && depth === 1) {
        args.push(value.slice(argStart, i).trim());
        argStart = i + 1;
      }
    }
    args.push(value.slice(argStart, i - 1).trim());
    out.push({ name: m[1]!, args });
    re.lastIndex = i;
  }
  return out;
}

/** A number written in a transform function (`2`, `calc(1 / var(--x, 1))`). */
const numberIn = (el: Element, text: string) => {
  const v = new Parser(text, el).sum();
  if (isLen(v)) throw new Error(`a length where a number belongs: ${text}`);
  return v.num;
};

export interface Scale {
  x: number;
  y: number;
}

/**
 * The x and y scale of an element's own inline transform: `scale()`,
 * `scaleX()`, `scaleY()` (with calc() and var() resolved). A rotation or a
 * translation does not change a length; a matrix is not read.
 */
export function ownScale(el: Element): Scale {
  const t = (el as HTMLElement).style?.transform ?? '';
  let x = 1;
  let y = 1;
  for (const c of calls(t, ['scale', 'scaleX', 'scaleY'])) {
    const a = numberIn(el, c.args[0]!);
    if (c.name === 'scale') {
      x *= a;
      y *= c.args[1] ? numberIn(el, c.args[1]) : a;
    } else if (c.name === 'scaleX') x *= a;
    else y *= a;
  }
  return { x, y };
}

/** The product of the scales above an element: its ancestors' transforms, and its own when `self`. */
export function scaleAbove(el: Element, self = true): Scale {
  const k = { x: 1, y: 1 };
  for (let e: Element | null = self ? el : el.parentElement; e; e = e.parentElement) {
    const s = ownScale(e);
    k.x *= s.x;
    k.y *= s.y;
  }
  return k;
}

/**
 * Where an element is placed (`top`, `margin-left`…) is a length in its
 * parent's space, so only the scales above it apply; its own size, padding,
 * border, font and shadows are drawn in its own space, so its own transform
 * applies too. Each along its axis.
 */
const PLACEMENT: Record<string, 'x' | 'y'> = { top: 'y', bottom: 'y', 'margin-top': 'y', 'margin-bottom': 'y', left: 'x', right: 'x', 'margin-left': 'x', 'margin-right': 'x' };
const SIZE_AXIS: Record<string, 'x' | 'y'> = { width: 'x', 'min-width': 'x', 'padding-left': 'x', 'padding-right': 'x', 'letter-spacing': 'x', height: 'y', 'min-height': 'y', 'padding-top': 'y', 'padding-bottom': 'y' };

/**
 * The lengths of one inline style property on screen: the px part times
 * the scale that applies to it. A percentage part is returned as written.
 * A property with no single axis (a border, a radius, a shadow, a font
 * size, a gap) is read along x, and not at all on an element scaled
 * differently along x and y (a strip): its on-screen size has no one value.
 * A gradient is read along its direction (90deg: x; 180deg: y).
 */
export function onScreen(el: Element, prop: string): Length[] {
  const value = (el as HTMLElement).style.getPropertyValue(prop);
  if (!value) return [];
  let axis: 'x' | 'y' | null = PLACEMENT[prop] ?? SIZE_AXIS[prop] ?? null;
  const k = scaleAbove(el, !(prop in PLACEMENT));
  if (!axis && prop === 'background-image') axis = /\b180deg\b/.test(value) ? 'y' : 'x';
  if (!axis) {
    if (Math.abs(k.x - k.y) > 1e-9) return [];
    axis = 'x';
  }
  const f = k[axis];
  return lengthsIn(el, value).map((l) => ({ px: l.px * f, pct: l.pct }));
}
