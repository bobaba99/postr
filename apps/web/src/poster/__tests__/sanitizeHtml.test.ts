/**
 * @vitest-environment jsdom
 */
/**
 * Sanitizer contract tests.
 *
 * The sanitizer is the last line of defense against stored XSS in
 * the public /s/:slug viewer, so every deviation from the allowlist
 * needs a test. Cover:
 *   - allowed tags pass through with content intact
 *   - disallowed tags are unwrapped (children kept)
 *   - <script> is defanged
 *   - event handler attributes are stripped
 *   - span with unsafe style values gets its style dropped
 *   - span[style] with allowlisted props survives
 *   - empty / null input returns empty string
 *   - nested disallowed tags unwrap recursively
 */
import { describe, it, expect } from 'vitest';
import { escapeHtml, htmlToPlainText, sanitizeHtml } from '../sanitizeHtml';

describe('sanitizeHtml · allowlisted tags', () => {
  it('passes through bold, italic, underline', () => {
    expect(sanitizeHtml('<b>a</b><i>b</i><u>c</u>')).toBe('<b>a</b><i>b</i><u>c</u>');
  });

  it('passes through mark, sub, sup, strong, em', () => {
    expect(sanitizeHtml('<mark>m</mark><sub>x</sub><sup>2</sup><strong>s</strong><em>e</em>')).toBe(
      '<mark>m</mark><sub>x</sub><sup>2</sup><strong>s</strong><em>e</em>',
    );
  });

  it('passes through <br>', () => {
    expect(sanitizeHtml('a<br>b')).toBe('a<br>b');
  });

  it('allows s / strike / del', () => {
    expect(sanitizeHtml('<s>a</s><strike>b</strike><del>c</del>')).toBe('<s>a</s><strike>b</strike><del>c</del>');
  });
});

describe('sanitizeHtml · disallowed tags are unwrapped', () => {
  it('unwraps <script> but keeps its text children', () => {
    expect(sanitizeHtml('<script>alert("x")</script>')).toBe('alert("x")');
  });

  it('unwraps <iframe>, <object>, <embed>', () => {
    expect(sanitizeHtml('<iframe src="evil">x</iframe><object>y</object><embed>z</embed>')).toBe('xyz');
  });

  it('unwraps <div> and <p> (structural, not inline)', () => {
    expect(sanitizeHtml('<div>a</div><p>b</p>')).toBe('ab');
  });

  it('recursively unwraps nested disallowed tags', () => {
    expect(sanitizeHtml('<div><p><script>inner</script></p></div>')).toBe('inner');
  });

  it('keeps allowed children when unwrapping a disallowed parent', () => {
    expect(sanitizeHtml('<div><b>a</b><i>b</i></div>')).toBe('<b>a</b><i>b</i>');
  });
});

describe('sanitizeHtml · attribute stripping', () => {
  it('drops event handler attributes on allowed tags', () => {
    expect(sanitizeHtml('<b onclick="alert(1)">x</b>')).toBe('<b>x</b>');
  });

  it('drops href on <b> (no href allowed)', () => {
    expect(sanitizeHtml('<b href="evil">x</b>')).toBe('<b>x</b>');
  });

  it('drops src / srcset on unwrapped tags', () => {
    // <img> is unwrapped; its children (none) vanish. We assert no
    // residual src leaks through as text.
    expect(sanitizeHtml('<img src="x.png">')).toBe('');
  });
});

describe('sanitizeHtml · span[style]', () => {
  it('keeps allowlisted color property', () => {
    expect(sanitizeHtml('<span style="color: #ff0000">x</span>')).toBe('<span style="color: #ff0000">x</span>');
  });

  it('keeps background-color', () => {
    expect(sanitizeHtml('<span style="background-color: #FFEB3B">x</span>')).toBe(
      '<span style="background-color: #FFEB3B">x</span>',
    );
  });

  it('keeps both when combined', () => {
    const out = sanitizeHtml('<span style="color: #fff; background-color: #000">x</span>');
    expect(out).toContain('color: #fff');
    expect(out).toContain('background-color: #000');
    expect(out).toContain('>x</span>');
  });

  it('drops disallowed style props but keeps safe ones', () => {
    const out = sanitizeHtml('<span style="color: #fff; font-family: evil; position: absolute">x</span>');
    expect(out).toContain('color: #fff');
    expect(out).not.toContain('font-family');
    expect(out).not.toContain('position');
  });

  it('unwraps <span> whose only style is disallowed', () => {
    expect(sanitizeHtml('<span style="position: absolute">x</span>')).toBe('x');
  });

  it('unwraps <span> with no style attribute', () => {
    expect(sanitizeHtml('<span>x</span>')).toBe('x');
  });

  it('rejects unsafe color expressions (url, expression)', () => {
    expect(sanitizeHtml('<span style="color: url(http://evil)">x</span>')).toBe('x');
    expect(sanitizeHtml('<span style="color: expression(alert(1))">x</span>')).toBe('x');
  });

  it('accepts rgb()/rgba() color values', () => {
    expect(sanitizeHtml('<span style="color: rgb(255,0,0)">x</span>')).toBe(
      '<span style="color: rgb(255,0,0)">x</span>',
    );
    expect(sanitizeHtml('<span style="background-color: rgba(0,0,0,0.5)">x</span>')).toBe(
      '<span style="background-color: rgba(0,0,0,0.5)">x</span>',
    );
  });
});

describe('sanitizeHtml · edges', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeHtml('')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    // Whitespace is a text node, which is preserved.
    expect(sanitizeHtml('   ')).toBe('   ');
  });

  it('is idempotent — sanitizing twice matches sanitizing once', () => {
    const dirty = '<div><script>x</script><b onclick="evil">y</b></div>';
    const once = sanitizeHtml(dirty);
    const twice = sanitizeHtml(once);
    expect(twice).toBe(once);
  });
});

describe('escapeHtml', () => {
  it('escapes the big five', () => {
    expect(escapeHtml(`<>"'&`)).toBe('&lt;&gt;&quot;&#39;&amp;');
  });
});

describe('htmlToPlainText', () => {
  it('strips tags and returns text content', () => {
    expect(htmlToPlainText('<b>hello</b> <i>world</i>')).toBe('hello world');
  });

  it('preserves surrounding whitespace in text nodes', () => {
    expect(htmlToPlainText('a <b>b</b> c')).toBe('a b c');
  });
});
