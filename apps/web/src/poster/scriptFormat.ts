/**
 * Superscript and subscript like PowerPoint (record
 * docs/fixes/39-text-editing.md; the MVP design doc
 * docs/launch/mvp-editor/bounded-designs.md §3.2 "Text editing rules",
 * rows T1 and T2): the format bar's x² and x₂ and PowerPoint's keys act on
 * the selected text of a text block, a title or a heading.
 *
 *   x² / superscript key   wraps the selection in <sup>; pressed again on
 *                          text that is all superscript, removes it
 *   x₂ / subscript key     the same with <sub>
 *   the two exclude each other: making text superscript takes its subscript
 *   away, and the other way round
 *
 * Each press is one undo step: the change is committed through the editing
 * host's `input` event (type formatSuperscript / formatSubscript, the type
 * a browser gives its own command), which the editor stores as a format
 * change, a step of its own (stores/historySteps.ts).
 *
 * Why not the browsers' own superscript and subscript commands: they read
 * the state from the computed `vertical-align`, and the page's base style
 * (Tailwind's preflight, restated for print in export/printSheetBase.ts)
 * draws sub and sup with `vertical-align: baseline` and a relative offset.
 * In Chromium and WebKit the state then reads false on superscript text, so
 * a second press applied it again instead of removing it (MEASURED, record
 * 39 §4: queryCommandState false right after the command; with the
 * preflight rule overridden it read true and the second press removed it).
 * Overriding the rule would change how every sub and sup is drawn, the
 * author markers included, against the print document and the PowerPoint
 * file. So the state is read from the markup, and the change is made here.
 *
 * The keys (T2), from Microsoft's PowerPoint pages (record 39 §2):
 *   Windows  Ctrl + Shift + Plus sign (superscript), Ctrl + = (subscript)
 *   macOS    Control + Shift + Plus sign and Control + = (Microsoft's
 *            "Format text as superscript or subscript" article), and
 *            ⌘ + Control + Shift + = and ⌘ + Control + = (its keyboard
 *            shortcut table): Control is the key, ⌘ may be held with it
 * Taken only while the caret is in such text (RichTextEditor's own key
 * handler); everywhere else they stay the browser's (Ctrl + = zooms the
 * page in Windows browsers). With only a caret and no selection the key is
 * still taken in text, and does nothing (out of scope: PowerPoint's toggle
 * for the next letters typed, record 39 §10).
 */

export type ScriptTag = 'sup' | 'sub';

type KeyFields = Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>;

/**
 * The = key (Shift + = types +): by the character, or by its physical key.
 * Not the numeric keypad's + or =: Ctrl + keypad + is the Windows browsers'
 * zoom-in, and an unshifted + made subscript, the opposite of Microsoft's
 * "Ctrl+Shift+Plus sign" (record 39 §9, R1-F3).
 */
const isEqualKey = (e: KeyFields) => !(e.code ?? '').startsWith('Numpad') && (e.key === '=' || e.key === '+' || e.code === 'Equal');

/** What PowerPoint's superscript / subscript keys ask for, or null for any other key. */
export function scriptKeyAction(e: KeyFields, mac: boolean): ScriptTag | null {
  if (!e.ctrlKey || e.altKey || !isEqualKey(e)) return null;
  // ⌘ with Control is Microsoft's Mac table's form; on Windows the Windows
  // key with Ctrl is the system's, not PowerPoint's.
  if (e.metaKey && !mac) return null;
  return e.shiftKey ? 'sup' : 'sub';
}

/** The format bar button's title: what it does and its key on this platform. */
export function scriptTitle(tag: ScriptTag, mac: boolean): string {
  if (tag === 'sup') return mac ? 'Superscript (⌃⇧=)' : 'Superscript (Ctrl+Shift+=)';
  return mac ? 'Subscript (⌃=)' : 'Subscript (Ctrl+=)';
}

/** The editing host (the contenteditable root) that holds `node`, or null. */
export function editingHostOf(node: Node | null): HTMLElement | null {
  const el = node ? (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement) : null;
  const host = el?.closest<HTMLElement>('[contenteditable]') ?? null;
  return host && host.getAttribute('contenteditable') !== 'false' ? host : null;
}

/** The nearest ancestor of `node` (itself included) named `tags`, below `host`. */
function ancestorIn(node: Node, tags: readonly string[], host: Node): Element | null {
  for (let el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement; el && el !== host; el = el.parentElement) {
    if (tags.includes(el.tagName)) return el;
  }
  return null;
}

/** The outermost ancestor of `node` named `tags`, below `host`. */
function outermostIn(node: Node, tags: readonly string[], host: Node): Element | null {
  let found: Element | null = null;
  for (let el = node.parentElement; el && el !== host; el = el.parentElement) {
    if (tags.includes(el.tagName)) found = el;
  }
  return found;
}

/** The text nodes of `host` that `range` covers some of (not merely touches). */
export function coveredTexts(host: Node, range: Range): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (!range.intersectsNode(n)) continue;
    const start = n === range.startContainer ? range.startOffset : 0;
    const end = n === range.endContainer ? range.endOffset : n.data.length;
    // A text node the range starts at the end of, or ends at the start of,
    // is touched, not covered.
    if (end > start) out.push(n);
  }
  return out;
}

/** Characters [start, end) of `host`'s text that `range` covers. */
export function offsetsIn(host: Node, range: Range): { start: number; end: number } {
  const pre = document.createRange();
  pre.selectNodeContents(host);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  return { start, end: start + range.toString().length };
}

/**
 * The DOM point `offset` characters into `host`'s text. A start point at a
 * boundary between two text nodes goes into the later one, an end point
 * into the earlier one, so a range made of them covers its characters only
 * (the superscript "2" in "H<sup>2</sup>O" starts inside the <sup>).
 */
export function pointIn(host: Node, offset: number, side: 'start' | 'end'): [Node, number] {
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  let left = offset;
  let last: Text | null = null;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const len = n.data.length;
    if (side === 'start' ? left < len : left <= len) return [n, left];
    left -= len;
    last = n;
  }
  return last ? [last, last.data.length] : [host, host.childNodes.length];
}

/**
 * Whether the selected text is all `tag` (every covered character inside a
 * <sup> or <sub> below the host). With only a caret: whether the caret is
 * inside one.
 */
export function scriptState(host: Node, range: Range, tag: ScriptTag): boolean {
  const name = tag.toUpperCase();
  const texts = coveredTexts(host, range);
  if (texts.length === 0) return ancestorIn(range.startContainer, [name], host) !== null;
  return texts.every((t) => ancestorIn(t, [name], host) !== null);
}

/** Whether every covered character (or the caret) is inside a list of `tag` (UL or OL) below the host. */
export function listState(host: Node, range: Range, tag: 'UL' | 'OL'): boolean {
  const texts = coveredTexts(host, range);
  const nodes: Node[] = texts.length ? texts : [range.startContainer];
  return nodes.every((n) => {
    const list = ancestorIn(n, ['UL', 'OL'], host);
    return list !== null && list.tagName === tag;
  });
}

const SCRIPTS = ['SUP', 'SUB'] as const;

/** Take `node` out of its ancestor `outer` (below the host): `outer` split around it, its copy around the node unwrapped. */
function liftOut(node: Node, outer: Element) {
  const doc = outer.ownerDocument;
  const before = doc.createRange();
  before.setStart(outer, 0);
  before.setEndBefore(node);
  const after = doc.createRange();
  after.setStartAfter(node);
  after.setEnd(outer, outer.childNodes.length);
  const head = before.extractContents();
  const tail = after.extractContents();
  // Kept when it holds text or a line break; an empty copy of an inline
  // ancestor (a <b> the cut went through) is not.
  const keep = (f: DocumentFragment) => !!f.textContent || f.querySelector('br') !== null;
  if (keep(head)) {
    const a = outer.cloneNode(false) as Element;
    a.append(head);
    outer.before(a);
  }
  if (keep(tail)) {
    const b = outer.cloneNode(false) as Element;
    b.append(tail);
    outer.after(b);
  }
  outer.replaceWith(...Array.from(outer.childNodes));
}

/**
 * A sup or sub with no text goes (its line break, if it holds one, stays),
 * and one followed at once by the same kind is joined with it.
 */
export function tidy(host: HTMLElement) {
  for (const el of Array.from(host.querySelectorAll('sup, sub'))) {
    if (!el.textContent) el.replaceWith(...Array.from(el.childNodes));
  }
  for (const el of Array.from(host.querySelectorAll('sup, sub'))) {
    let next = el.nextSibling;
    while (next && next.nodeType === Node.ELEMENT_NODE && (next as Element).tagName === el.tagName) {
      el.append(...Array.from(next.childNodes));
      const gone = next;
      next = next.nextSibling;
      gone.remove();
    }
  }
  host.normalize();
}

/**
 * Toggle `tag` on the selected text of `host` (T1): on, unless the text is
 * all `tag` already, then off; the other kind is taken away either way.
 * The same characters stay selected. Returns false (nothing done) for a
 * caret with no selection, or a range outside the host.
 */
export function toggleScriptIn(host: HTMLElement, range: Range, tag: ScriptTag): boolean {
  if (range.collapsed || !host.contains(range.commonAncestorContainer)) return false;
  const turnOn = !scriptState(host, range, tag);
  const { start, end } = offsetsIn(host, range);
  // Cut text nodes at the selection's ends, so it covers whole text nodes.
  const startNode = pointIn(host, start, 'start');
  if (startNode[0].nodeType === Node.TEXT_NODE && startNode[1] > 0) (startNode[0] as Text).splitText(startNode[1]);
  const endNode = pointIn(host, end, 'end');
  if (endNode[0].nodeType === Node.TEXT_NODE && endNode[1] < (endNode[0] as Text).data.length) (endNode[0] as Text).splitText(endNode[1]);
  const whole = host.ownerDocument.createRange();
  whole.setStart(...pointIn(host, start, 'start'));
  whole.setEnd(...pointIn(host, end, 'end'));
  const texts = coveredTexts(host, whole);
  for (const t of texts) {
    for (let outer = outermostIn(t, SCRIPTS, host); outer; outer = outermostIn(t, SCRIPTS, host)) liftOut(t, outer);
    if (turnOn) {
      const wrap = host.ownerDocument.createElement(tag);
      t.replaceWith(wrap);
      wrap.append(t);
    }
  }
  tidy(host);
  const sel = host.ownerDocument.getSelection();
  if (sel) {
    const r = host.ownerDocument.createRange();
    r.setStart(...pointIn(host, start, 'start'));
    r.setEnd(...pointIn(host, end, 'end'));
    sel.removeAllRanges();
    sel.addRange(r);
  }
  return true;
}

/**
 * The format bar's x² / x₂ and the keys: toggle `tag` on the window's
 * selection in its editing host, then fire the host's `input` event as a
 * browser's own format command does, which the editor commits as one undo
 * step. Returns whether anything changed.
 */
export function toggleScript(tag: ScriptTag): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  const host = editingHostOf(range.commonAncestorContainer);
  if (!host || !toggleScriptIn(host, range, tag)) return false;
  host.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: tag === 'sup' ? 'formatSuperscript' : 'formatSubscript' }));
  return true;
}
