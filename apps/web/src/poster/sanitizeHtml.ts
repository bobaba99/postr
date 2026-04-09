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
]);

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
function sanitizeNode(input: Node, doc: Document): DocumentFragment {
  const fragment = doc.createDocumentFragment();

  const walk = (source: Node, target: Node) => {
    for (const child of Array.from(source.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        target.appendChild(doc.createTextNode(child.textContent ?? ''));
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) {
        // Comments, CDATA, processing instructions — drop entirely.
        continue;
      }

      const el = child as Element;
      const tag = el.tagName;

      if (!ALLOWED_TAGS.has(tag)) {
        // Unwrap: walk the children into the current target.
        walk(el, target);
        continue;
      }

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
export function sanitizeHtml(html: string): string {
  if (!html) return '';
  // DOMParser with text/html wraps the input in <html><body>…</body></html>
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="__root">${html}</div>`, 'text/html');
  const root = doc.getElementById('__root');
  if (!root) return '';
  const fragment = sanitizeNode(root, doc);
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
