/**
 * HTML sanitizer for inline-rich text in poster blocks.
 *
 * Every text/heading/title block stores its content as HTML now
 * (instead of the previous plain string) so inline formatting —
 * bold, italic, underline, strikethrough, highlight, color — can
 * target a selection range instead of the whole block.
 *
 * HTML coming out of contentEditable / document.execCommand / paste
 * is untrusted: users can paste arbitrary markup from other sites,
 * paste HTML containing <script>, or a shared /s/:slug viewer can
 * eventually render HTML a user wrote on another device. We must
 * sanitize both on INSERT (paste, execCommand fallout) and on SAVE
 * (what we write back to the store).
 *
 * Strategy: allowlist parser. Parse the HTML with DOMParser, walk
 * the tree, keep only a fixed set of tags + attributes, drop
 * everything else. No regex — regexes on HTML are a footgun.
 *
 * Allowlist (intentionally tight):
 *   - b, strong, i, em, u
 *   - s, strike, del
 *   - mark
 *   - sub, sup
 *   - br
 *   - span[style="color: ...; background-color: ..."]
 *
 * Rationale for keeping span: execCommand('hiliteColor') and
 * ('foreColor') emit <span style="background-color: ...">, so
 * dropping span entirely would make those commands no-ops on save.
 */

/**
 * Tags that carry a paragraph boundary. They are NOT in ALLOWED_TAGS —
 * a poster block is a single inline run, and flattening a pasted
 * document into one is the deliberate design. What was not deliberate
 * was emitting NOTHING in their place, which joined two words.
 *
 * `LI` is absent on purpose: it is allowed, so it survives as real
 * markup and must not also be flattened into separator-joined text.
 */
const BLOCK_TAGS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER',
  'TR', 'TABLE', 'ADDRESS', 'FIGURE', 'FIGCAPTION', 'DD', 'DT', 'DL',
  // Cells, not just rows. TR alone separated row from row while the
  // cells inside a row ran together: a pasted two-column table gave
  // `Mean12.4`. TD/TH are unwrapped like any other non-allowed tag, so
  // without this they hit exactly the glue case BLOCK_TAGS exists for.
  'TD', 'TH',
]);

const ALLOWED_TAGS = new Set([
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'S',
  'STRIKE',
  'DEL',
  'MARK',
  'SUB',
  'SUP',
  'BR',
  'SPAN',
  // List structures emitted by document.execCommand('insertUnorderedList'),
  // ('insertOrderedList'), ('indent'), ('outdent') from the
  // FloatingFormatToolbar. Without these, the browser inserts <ul>/<ol>/<li>
  // but the next commit() runs through this sanitizer and strips them,
  // making the toolbar buttons appear broken.
  'OL',
  'UL',
  'LI',
]);

/** Per-tag attribute allowlist. Most tags allow nothing; OL allows
 *  `start` (so an "Insert Numbered List" that begins at 5 still
 *  reads correctly) and `type` (1 / a / A / i / I). */
const ALLOWED_ATTRS_BY_TAG: Record<string, Set<string>> = {
  OL: new Set(['start', 'type']),
};

const ALLOWED_STYLE_PROPS = new Set(['color', 'background-color']);

/**
 * Parses a CSS color value loosely. Accepts:
 *   - hex: #abc, #aabbcc, #aabbccdd
 *   - rgb()/rgba() with 3 or 4 numeric args
 *   - named CSS colors (allowlist below)
 * Rejects:
 *   - url(), var(), calc(), env(), any function other than rgb/rgba
 *   - anything with backticks, quotes, semicolons, parentheses that
 *     don't match the rgb() pattern
 */
const SAFE_COLOR_REGEX =
  /^(?:#[0-9a-fA-F]{3,8}|rgba?\s*\(\s*[\d.\s,%]+\s*\)|transparent|currentcolor|inherit|initial|unset)$/i;

function isSafeColor(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return false;
  return SAFE_COLOR_REGEX.test(trimmed);
}

/**
 * Parses a `style="..."` attribute into an allowed-only minimal
 * string. Returns empty string if nothing survived — callers should
 * drop the attribute entirely in that case.
 */
function sanitizeStyleAttr(raw: string): string {
  const pieces: string[] = [];
  for (const rule of raw.split(';')) {
    const [k, ...rest] = rule.split(':');
    if (!k || rest.length === 0) continue;
    const prop = k.trim().toLowerCase();
    if (!ALLOWED_STYLE_PROPS.has(prop)) continue;
    const value = rest.join(':').trim();
    if (!isSafeColor(value)) continue;
    pieces.push(`${prop}: ${value}`);
  }
  return pieces.join('; ');
}

/**
 * Recursively walks a DOM tree and returns a fresh, sanitized
 * document fragment. Disallowed tags are unwrapped (children kept),
 * not dropped — so `<script>hello</script>` becomes `hello`, not
 * empty. That matches what users expect when pasting rich text
 * from a word processor or website.
 */
function sanitizeNode(
  input: Node,
  doc: Document,
  blockSeparator: string,
  keepWhitespace: boolean,
): DocumentFragment {
  const fragment = doc.createDocumentFragment();

  // Boundary bookkeeping. Deferred rather than emitted on sight, because
  // a boundary is only real once there is content on BOTH sides of it —
  // that is what keeps a leading/trailing block from producing a stray
  // separator, and what stops the whitespace between `</p>` and `<p>` in
  // pretty-printed markup from producing a second one.
  let emittedAny = false;
  let pendingBoundary = false;
  let justClosedBlock = false;
  // Whether the line being written has content nothing has ended yet. A
  // block boundary owes a separator only then: a line already ended by a
  // list (`<ul>…</ul><div>b</div>`), by a `<br>` written at its end
  // (`a<br><div>b</div>`) or by a newline at its end (`a\n<div>b</div>`)
  // gets none, as the browser draws no line there.
  // Without this, a list left with Enter gained a blank line once stored
  // (MEASURED, fix 27, keep-work-check E10: the gap after the list 1.5
  // lines while typing, 2.79 after a reload).
  let lineOpen = false;

  const flushBoundary = (target: Node) => {
    if (!pendingBoundary || !emittedAny || !blockSeparator) {
      pendingBoundary = false;
      return;
    }
    // UL/OL may only contain LI. A boundary owed by a block INSIDE an
    // `<li>` (Google Docs wraps every bullet's text in a `<p>`) escapes
    // past `</li>` and would be flushed into the list itself, emitting
    // `<ul><li>a</li><br><li>b</li></ul>`. That is invalid markup, it is
    // PERSISTED — `<br>` is allowed, so the next no-separator re-sanitise
    // keeps it — and `parseRichText` flushes on a bare `<br>`, breaking
    // the bullet run into two lists in every editable export. `<li>`
    // already carries a paragraph boundary, so nothing is lost by
    // dropping the debt here.
    const tag = (target as Element).tagName;
    if (tag === 'UL' || tag === 'OL') {
      pendingBoundary = false;
      return;
    }
    pendingBoundary = false;
    // Parsed rather than string-concatenated, so `<br>` becomes a real
    // element and a plain space becomes a text node — the caller picks
    // which, and neither can inject markup.
    const holder = doc.createElement('div');
    holder.innerHTML = blockSeparator;
    for (const n of Array.from(holder.childNodes)) target.appendChild(n);
    lineOpen = false;
  };

  const walk = (source: Node, target: Node) => {
    for (const child of Array.from(source.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const data = child.textContent ?? '';
        // Whitespace sitting beside a block boundary is layout, not
        // content. Dropping it is what stops `<p>a</p>\n<p>b</p>`
        // becoming `a<br>\n<br>b` — which matters because
        // export/richText.ts treats a literal newline as a paragraph
        // flush too, so the blank line would survive into the export.
        // Leading whitespace goes for the same reason.
        //
        // Gated on the separator being in use: with no separator this
        // function must stay byte-identical, and it has a test pinning
        // that `sanitizeHtml('   ')` returns the spaces untouched. Off for
        // typed text (`keepWhitespace`): the editor's own markup is never
        // pretty-printed, and every space in it is one the user typed.
        const trim = !!blockSeparator && !keepWhitespace;
        if (trim && (justClosedBlock || !emittedAny) && data.trim() === '') {
          continue;
        }
        // The rule above only fires for a node that is whitespace ENTIRELY.
        // Pretty-printed markup gives `</h2>\nAccuracy improved.` — one
        // node that merely STARTS with a newline — and the separator about
        // to be flushed would put a break in front of it. `parseRichText`
        // flushes on a literal newline too, so the pair became a blank
        // paragraph in the export: exactly what the whitespace rule exists
        // to prevent, arriving by the other door. Same gating, so the
        // no-separator path stays byte-identical.
        let text = data;
        if (trim && pendingBoundary && emittedAny) {
          text = text.replace(/^\s+/, '');
          if (text === '') continue;
        }
        if (text !== '') {
          flushBoundary(target);
          target.appendChild(doc.createTextNode(text));
          if (text.trim() !== '') {
            emittedAny = true;
            justClosedBlock = false;
          }
          // Typed spaces alone are a line's content too.
          if (text.trim() !== '' || keepWhitespace) lineOpen = true;
          // A newline at the end of a line ends that line, as a `<br>` does:
          // the fields are drawn pre-wrap, so the browser draws no further
          // line for it before a block. Typed with Shift+Enter (Chromium and
          // Firefox put a "\n" in the text), owing a `<br>` here stored a
          // blank line more (MEASURED, fix 27 review round 2, R2-A1,
          // keep-work-check E12: 2.58 glyph heights while typing, 3.87 after
          // a reload). The same for a paste whose text ends a line with a
          // newline (pretty-printed `<p>a\n</p><p>b</p>`): the rule was the
          // typing path's only, and the paste stored a blank line the source
          // does not show (fix 27, the first review round 3's mutant).
          if (text.endsWith('\n')) lineOpen = false;
        }
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) {
        // Comments, CDATA, processing instructions — drop entirely.
        continue;
      }

      const el = child as Element;
      const tag = el.tagName;

      if (!ALLOWED_TAGS.has(tag)) {
        // Unwrap: walk the children into the current target. A
        // block-level tag leaves a boundary behind it, because that is
        // the information the unwrap would otherwise destroy — the
        // original bug glued the last word of one paragraph to the
        // first of the next (`weeks.Accuracy`).
        const isBlock = BLOCK_TAGS.has(tag);
        if (isBlock && emittedAny && lineOpen) pendingBoundary = true;
        walk(el, target);
        if (isBlock) {
          justClosedBlock = true;
          // A boundary is owed on the way OUT as well. Setting it only on
          // the way IN covered block-to-block (`<p>a</p><p>b</p>`) and
          // missed everything else that can follow a block: bare text,
          // an inline element, a trailing sibling inside a wrapper. So
          // `<h2>Results</h2>Accuracy improved.` still glued — the exact
          // symptom the entry-side boundary was added to remove.
          //
          // A trailing boundary costs nothing: flushBoundary only emits
          // when something is actually written after it, so a document
          // ending in a block does not gain a dangling separator.
          // No `emittedAny` guard: flushBoundary re-checks it, so the
          // guard was measurably dead (0 divergences over 80k inputs).
          // A line already ended owes nothing (`lineOpen`, above).
          if (lineOpen) pendingBoundary = true;
        }
        continue;
      }

      // An explicit `<br>` in the source already carries the break the
      // pending separator would supply. Emitting both gave three breaks
      // where the author wrote one, compounding with every
      // block/`<br>` alternation.
      // That `<br>` then starts a line of its own, an empty one until text
      // follows (`<div><br></div>` is a blank line; `</p><br><p>` an empty
      // line between paragraphs), which its block's end must close; a `<br>`
      // written where nothing was owed ends the line it is on.
      const brForBoundary = tag === 'BR' && pendingBoundary;
      if (tag === 'BR') pendingBoundary = false;
      // A list item starts its own line.
      if (tag === 'LI') lineOpen = false;
      flushBoundary(target);
      const clone = doc.createElement(tag.toLowerCase());

      // Only copy the style attribute on span, and only the
      // allowlisted properties.
      if (tag === 'SPAN') {
        const rawStyle = el.getAttribute('style');
        if (rawStyle) {
          const safe = sanitizeStyleAttr(rawStyle);
          if (safe) {
            clone.setAttribute('style', safe);
          } else {
            // A span with nothing interesting → unwrap it.
            walk(el, target);
            continue;
          }
        } else {
          // A span with no style is also pointless; unwrap.
          walk(el, target);
          continue;
        }
      }

      // Per-tag attribute allowlist (e.g. OL.start). Only safe
      // attributes — never style/onclick/href etc.
      const allowedAttrs = ALLOWED_ATTRS_BY_TAG[tag];
      if (allowedAttrs) {
        for (const attr of allowedAttrs) {
          const v = el.getAttribute(attr);
          // Tight value validation: only short alphanumeric-ish
          // values survive (covers integers + "1"/"a"/"A"/"i"/"I"
          // for OL).
          if (v && /^[A-Za-z0-9]{1,4}$/.test(v)) {
            clone.setAttribute(attr, v);
          }
        }
      }

      walk(el, clone);
      target.appendChild(clone);
      if (tag === 'BR') lineOpen = brForBoundary;
      // A list, and each of its items, ends the line it closes: what a
      // block inside the item owed is paid.
      if (tag === 'UL' || tag === 'OL' || tag === 'LI') {
        lineOpen = false;
        pendingBoundary = false;
      }
    }
  };

  walk(input, fragment);
  return fragment;
}

/**
 * Sanitize a piece of HTML. Returns the cleaned string.
 * Empty input returns empty string.
 */
export interface SanitizeOptions {
  /**
   * Emitted between two unwrapped block-level elements. Defaults to
   * `''`: the render and .postr import paths see already-inline content
   * and must stay byte-identical. Two paths ask for one, because block
   * markup reaches them: the PASTE path (HTML from another application)
   * and the TYPING path (`sanitizeTyped`: the browser's own new lines).
   *
   * `'<br>'` for a multi-line block; `' '` for a single-line one, where
   * a line break would put a break into text the editor refuses to let
   * the user make.
   */
  blockSeparator?: string;
  /**
   * Keep whitespace beside a block boundary. Off by default, so pasted,
   * pretty-printed markup (`<p>a</p>\n<p>b</p>`) gains no blank line; on
   * for typed text, where a space at the start of a line is the user's.
   */
  keepWhitespace?: boolean;
}

export function sanitizeHtml(html: string, options: SanitizeOptions = {}): string {
  if (!html) return '';
  // DOMParser with text/html wraps the input in <html><body>…</body></html>
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="__root">${html}</div>`, 'text/html');
  const root = doc.getElementById('__root');
  if (!root) return '';
  const fragment = sanitizeNode(root, doc, options.blockSeparator ?? '', options.keepWhitespace ?? false);
  const container = doc.createElement('div');
  container.appendChild(fragment);
  return container.innerHTML;
}

/**
 * What the editor stores for text the user typed into an editable field
 * (a text block, the Content box, a table cell): the field's markup,
 * sanitized, with each new line the browser started turned into a `<br>`.
 *
 * Enter in an editable field does not insert a `<br>`: Chromium and WebKit
 * put the new line in a `<div>` (`ZQA<div>ZQB</div>`), Firefox wraps the
 * first line too (`<div>…ZQA</div><div>ZQB</div>`), and a blank line is
 * `<div><br></div>` (MEASURED in the three engines,
 * scripts/keep-work-check.mjs, docs/fixes/27-keep-work-safe.md). Sanitized
 * with no separator the `<div>` went and the words joined ("ZQAZQB") in the
 * store, after a reload, in the copy, the PDF and PowerPoint (OF-01).
 * Every space typed is kept (`keepWhitespace`). A newline typed with
 * Shift+Enter (Chromium and Firefox put one in the text) ends its line as a
 * `<br>` does, so a line Enter starts after it gains no blank line (fix 27
 * review round 2).
 */
export function sanitizeTyped(html: string, multiline: boolean): string {
  return sanitizeHtml(html, { blockSeparator: multiline ? '<br>' : ' ', keepWhitespace: true });
}

/**
 * Convenience helper: escape plain text for insertion into HTML.
 * Useful on paste when the user copied plain text from terminal
 * or code output.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strip all HTML tags and return plain text. Used by the slash
 * command matcher, which only cares about text-before-caret.
 */
export function htmlToPlainText(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return doc.body.textContent ?? '';
}
