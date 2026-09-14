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
        // that `sanitizeHtml('   ')` returns the spaces untouched.
        if (blockSeparator && (justClosedBlock || !emittedAny) && data.trim() === '') {
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
        if (blockSeparator && pendingBoundary && emittedAny) {
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
        if (isBlock && emittedAny) pendingBoundary = true;
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
          pendingBoundary = true;
        }
        continue;
      }

      // An explicit `<br>` in the source already carries the break the
      // pending separator would supply. Emitting both gave three breaks
      // where the author wrote one, compounding with every
      // block/`<br>` alternation.
      if (tag === 'BR') pendingBoundary = false;
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
   * `''`, which is exactly today's behaviour — only the PASTE path asks
   * for a separator, because that is the only place block-level HTML
   * from another application arrives. The render, commit and .postr
   * import paths all see already-inline content and must stay
   * byte-identical.
   *
   * `'<br>'` for a multi-line block; `' '` for a single-line one, where
   * a line break would put a break into text the editor refuses to let
   * the user make.
   */
  blockSeparator?: string;
}

export function sanitizeHtml(html: string, options: SanitizeOptions = {}): string {
  if (!html) return '';
  // DOMParser with text/html wraps the input in <html><body>…</body></html>
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="__root">${html}</div>`, 'text/html');
  const root = doc.getElementById('__root');
  if (!root) return '';
  const fragment = sanitizeNode(root, doc, options.blockSeparator ?? '');
  const container = doc.createElement('div');
  container.appendChild(fragment);
  return container.innerHTML;
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
