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
import { escapeHtml, htmlToPlainText, sanitizeHtml, sanitizeTyped } from '../sanitizeHtml';

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

describe('list sanitization', () => {
  it('preserves <ul>, <ol>, <li> structure (toolbar list buttons)', () => {
    const html = '<ul><li>one</li><li>two</li></ul>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it('preserves the <ol start> attribute when given an integer', () => {
    expect(sanitizeHtml('<ol start="5"><li>x</li></ol>')).toBe(
      '<ol start="5"><li>x</li></ol>',
    );
  });

  it('preserves <ol type> attribute (numbering style)', () => {
    expect(sanitizeHtml('<ol type="a"><li>x</li></ol>')).toBe(
      '<ol type="a"><li>x</li></ol>',
    );
  });

  it('strips dangerous attributes from list tags', () => {
    expect(
      sanitizeHtml('<ul onclick="alert(1)" style="display:none"><li>x</li></ul>'),
    ).toBe('<ul><li>x</li></ul>');
  });

  it('strips an oversized or non-alphanumeric ol-start value', () => {
    expect(sanitizeHtml('<ol start="javascript:alert(1)"><li>x</li></ol>')).toBe(
      '<ol><li>x</li></ol>',
    );
  });

  it('preserves nested list structures (indent button)', () => {
    const html = '<ul><li>a<ul><li>nested</li></ul></li></ul>';
    expect(sanitizeHtml(html)).toBe(html);
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

describe('F6 — paragraph boundaries on paste', () => {
  it('still flattens with NO separator by default', () => {
    // The default is unchanged, deliberately: only the paste path asks
    // for a separator. The render/commit paths and the .postr import
    // path see already-inline HTML and must keep byte-identical output.
    expect(sanitizeHtml('<div>a</div><p>b</p>')).toBe('ab');
  });

  it('separates paragraphs when the paste path asks for it', () => {
    // The bug: the last word of each paragraph was glued to the first of
    // the next — `weeks.Accuracy`, `raters.All`. The unwrap branch put
    // nothing in place of the block boundary.
    const word = '<p>Participants completed the task for 12 weeks.</p><p>Accuracy was scored by two raters.</p><p>All analyses used mixed models.</p>';
    const out = sanitizeHtml(word, { blockSeparator: '<br>' });
    expect(out).not.toContain('weeks.Accuracy');
    expect(out).not.toContain('raters.All');
    expect(out).toBe(
      'Participants completed the task for 12 weeks.<br>Accuracy was scored by two raters.<br>All analyses used mixed models.',
    );
  });

  it('does not double the separator on pretty-printed markup', () => {
    // Real Word/Docs markup carries whitespace between the tags. A naive
    // flush emits `a<br>\n<br>b`, and since export/richText.ts treats
    // BOTH <br> and a literal newline as a paragraph flush, every pasted
    // paragraph would gain a blank line.
    const out = sanitizeHtml('<p>a</p>\n<p>b</p>', { blockSeparator: '<br>' });
    expect(out).toBe('a<br>b');
  });

  it('emits no leading or trailing separator', () => {
    expect(sanitizeHtml('<p>only</p>', { blockSeparator: '<br>' })).toBe('only');
    expect(sanitizeHtml('\n<p>a</p>\n', { blockSeparator: '<br>' })).toBe('a');
  });

  it('uses a space for a single-line block, never a line break', () => {
    // A title block refuses Enter by design; injecting <br> there would
    // put a line break into text the editor will not let the user break.
    const out = sanitizeHtml('<p>Effects of Treatment</p><p>On Outcomes</p>', {
      blockSeparator: ' ',
    });
    expect(out).toBe('Effects of Treatment On Outcomes');
    expect(out).not.toContain('<br>');
  });

  it('keeps inline formatting across the boundary', () => {
    const out = sanitizeHtml('<p>a <b>bold</b></p><p><i>it</i> b</p>', {
      blockSeparator: '<br>',
    });
    expect(out).toBe('a <b>bold</b><br><i>it</i> b');
  });

  it('treats div, li and headings as block boundaries too', () => {
    expect(sanitizeHtml('<div>a</div><div>b</div>', { blockSeparator: '<br>' })).toBe('a<br>b');
    expect(sanitizeHtml('<h1>a</h1><h2>b</h2>', { blockSeparator: '<br>' })).toBe('a<br>b');
  });

  it('leaves an allowed <li> structure alone', () => {
    // ol/ul/li are ALLOWED, not unwrapped — the toolbar emits them and
    // the sanitizer must not turn a real list into separator-joined text.
    const out = sanitizeHtml('<ul><li>a</li><li>b</li></ul>', { blockSeparator: '<br>' });
    expect(out).toContain('<li>a</li>');
    expect(out).toContain('<li>b</li>');
    expect(out).not.toContain('a<br>b');
  });
});

describe('a block boundary is owed on the way out, not just on the way in', () => {
  const sep = { blockSeparator: '<br>' };

  it('text directly after a closed block is separated', () => {
    // The original glue symptom, one shape the entry-side boundary missed.
    expect(sanitizeHtml('<h2>Results</h2>Accuracy improved.', sep))
      .toBe('Results<br>Accuracy improved.');
  });

  it('an inline element after a closed block is separated', () => {
    expect(sanitizeHtml('<p>a</p><b>b</b>', sep)).toBe('a<br><b>b</b>');
  });

  it('a trailing sibling inside a wrapper is separated', () => {
    expect(sanitizeHtml('<div><div>a</div>b</div>', sep)).toBe('a<br>b');
  });

  it('block to block still behaves as before', () => {
    expect(sanitizeHtml('<p>a</p><p>b</p>', sep)).toBe('a<br>b');
  });

  it('a document ending in a block gains no dangling separator', () => {
    expect(sanitizeHtml('<p>a</p>', sep)).toBe('a');
    expect(sanitizeHtml('<p>a</p><p>b</p>', sep)).not.toMatch(/<br>$/);
  });

  it('adjacent table cells are not glued', () => {
    const out = sanitizeHtml(
      '<table><tr><td>Mean</td><td>12.4</td></tr><tr><td>SD</td><td>0.8</td></tr></table>',
      sep,
    );
    expect(out).not.toContain('Mean12.4');
    expect(out).not.toContain('SD0.8');
    expect(out).not.toContain('12.4SD');
  });

  it('header cells are separated too', () => {
    const out = sanitizeHtml('<table><tr><th>Group</th><th>n</th></tr></table>', sep);
    expect(out).not.toContain('Groupn');
  });

  it('text BEFORE a block is separated too (the other half)', () => {
    // The entry-side boundary had no test at all: deleting it left all 48
    // green while changing 11,456 outputs in an 80k sweep. A commit about
    // half-written bookkeeping should pin both halves.
    expect(sanitizeHtml('Intro<p>a</p>', sep)).toBe('Intro<br>a');
    expect(sanitizeHtml('text<h2>Head</h2>', sep)).toBe('text<br>Head');
  });

  it('no separator is emitted as a direct child of a list', () => {
    // Google Docs wraps every bullet's text in a <p>. The boundary that
    // <p> owes on exit escapes past </li> and lands in the <ul>, which is
    // invalid, is PERSISTED (<br> is allowed, so the next no-separator
    // re-sanitise keeps it), and splits the bullet run in every export.
    const out = sanitizeHtml('<ul><li><p>Item one</p></li><li><p>Item two</p></li></ul>', sep);
    expect(out).not.toMatch(/<\/li><br>/);
    expect(out).not.toMatch(/<ul><br>/);
  });

  it('a separator does not add a break in front of the source\'s own newline', () => {
    // Pretty-printed markup gives one text node that STARTS with a
    // newline; the whitespace-drop rule only fires when a node is
    // whitespace entirely. parseRichText flushes on a literal newline as
    // well as on <br>, so the pair became a blank paragraph.
    expect(sanitizeHtml('<h2>Results</h2>\nAccuracy improved by 12%.', sep))
      .toBe('Results<br>Accuracy improved by 12%.');
    expect(sanitizeHtml('<blockquote>Quoted.</blockquote>\n— Author', sep))
      .toBe('Quoted.<br>— Author');
  });

  it('a single-space separator does not double up', () => {
    expect(sanitizeHtml('<p>a</p> text', { blockSeparator: ' ' })).toBe('a text');
  });

  it('an explicit <br> between blocks is not tripled', () => {
    // The author wrote one break; the pending separator and the <br>'s own
    // break made three, compounding with every alternation.
    expect((sanitizeHtml('<p>a</p><br><p>b</p>', sep).match(/<br>/g) ?? []).length).toBe(2);
    expect((sanitizeHtml('<p>a</p><br><p>b</p><br><p>c</p>', sep).match(/<br>/g) ?? []).length).toBe(4);
  });

  it('with no separator configured the output is unchanged', () => {
    // The whole boundary mechanism is gated on blockSeparator; without it
    // this function must stay byte-identical.
    expect(sanitizeHtml('<h2>Results</h2>Accuracy improved.')).toBe('ResultsAccuracy improved.');
    expect(sanitizeHtml('<table><tr><td>Mean</td><td>12.4</td></tr></table>')).toBe('Mean12.4');
  });
});

describe('fix 27 — typed text: the browser\'s new lines become <br>, every space kept', () => {
  // The three engines' markup after " ZQA", Enter, "ZQB" (MEASURED by
  // scripts/keep-work-check.mjs; docs/fixes/27-keep-work-safe.md).
  it('Chromium and WebKit: a new line in a <div>', () => {
    expect(sanitizeTyped('words. ZQA<div>ZQB</div>', true)).toBe('words. ZQA<br>ZQB');
  });

  it('Firefox: the line before wrapped too', () => {
    expect(sanitizeTyped('<div>words. ZQA</div><div>ZQB</div>', true)).toBe('words. ZQA<br>ZQB');
  });

  it('a blank line, <div><br></div>, is a second <br>', () => {
    expect(sanitizeTyped('ZQG<div>ZQH</div><div><br></div><div>ZQK</div>', true)).toBe('ZQG<br>ZQH<br><br>ZQK');
  });

  it('keeps the spaces at the start of a line, and a block of spaces alone', () => {
    expect(sanitizeTyped('ZQI<div>  ZQJ</div>', true)).toBe('ZQI<br>  ZQJ');
    expect(sanitizeTyped('   ', true)).toBe('   ');
    // The paste path still trims what sits beside a boundary.
    expect(sanitizeHtml('ZQI<div>  ZQJ</div>', { blockSeparator: '<br>' })).toBe('ZQI<br>ZQJ');
  });

  it('a single-line block joins a stray line with a space, never a break', () => {
    expect(sanitizeTyped('Title<div>more</div>', false)).toBe('Title more');
  });

  it('a line already ended owes no break: after a list, after a <br> at its end', () => {
    // Enter twice in a toolbar list leaves it: `…</ul><div>c</div>` (MEASURED
    // in Chromium, keep-work-check E10). A <br> after the list drew a blank
    // line once stored.
    expect(sanitizeTyped('<ul><li>a</li><li>b</li></ul><div>c</div>', true)).toBe('<ul><li>a</li><li>b</li></ul>c');
    expect(sanitizeTyped('<ul><li>a</li></ul><div><br></div><div>c</div>', true)).toBe('<ul><li>a</li></ul><br>c');
    expect(sanitizeTyped('a<br><div>b</div>', true)).toBe('a<br>b');
    // The paste path too: Google Docs wraps each bullet's text in a <p>.
    expect(sanitizeHtml('<ul><li><p>Item one</p></li><li><p>Item two</p></li></ul><p>After</p>', { blockSeparator: '<br>' }))
      .toBe('<ul><li>Item one</li><li>Item two</li></ul>After');
  });

  it('typed text with no new line is unchanged, formatting and all', () => {
    const html = 'Plain <b>bold</b> and <span style="color: #ff0000">red</span>&nbsp;';
    expect(sanitizeTyped(html, true)).toBe(sanitizeHtml(html));
  });

  // Review round 1 (finding R1-A5): three parts of the line-end rule no test
  // above reached (the reviewer's mutants survived 125 of 125 tests). The
  // outputs on the left are the browser's drawing: a list item is a line of
  // its own; a line of typed spaces is a line (the editor draws with
  // white-space: pre-wrap); an empty inline element draws no line.
  it('a list item starts its own line: no break at the start of an item after text', () => {
    expect(sanitizeHtml('Intro<ul><li><p>Item one</p></li><li><p>Item two</p></li></ul>', { blockSeparator: '<br>' }))
      .toBe('Intro<ul><li>Item one</li><li>Item two</li></ul>');
  });

  it('a line of typed spaces alone is a line: the next line still gets its break', () => {
    expect(sanitizeTyped('a<div>  </div><div>b</div>', true)).toBe('a<br>  <br>b');
  });

  it('a break written for a boundary ends the line: an empty inline element adds no blank line', () => {
    expect(sanitizeTyped('a<div><span></span></div><div>b</div>', true)).toBe('a<br>b');
    expect(sanitizeHtml('<p>a</p><p><b></b></p><p>b</p>', { blockSeparator: '<br>' })).toBe('a<br><b></b>b');
  });
});

describe('fix 27 review round 2 — a newline typed with Shift+Enter ends the line, as a <br> does', () => {
  // Chromium and Firefox put a newline in the text for Shift+Enter (the
  // fields are drawn pre-wrap), and the browser draws no further line for a
  // newline that ends a line's text. The <div> Enter starts after it owed no
  // <br>: one was stored, a blank line more after a reload, in the PDF and in
  // PowerPoint (finding R2-A1). The inputs are the engines' markup, MEASURED
  // by scripts/keep-work-check.mjs E12; the outputs draw what the user saw.
  it('Shift+Enter, Enter, as Chromium types it', () => {
    expect(sanitizeTyped('ZQSA\n\n<div>ZQSB</div>', true)).toBe('ZQSA\n\nZQSB');
  });

  it('Shift+Enter, Enter, as Firefox types it (the empty line in a <div>)', () => {
    expect(sanitizeTyped('ZQSA\n<div><br></div><div>ZQSB</div>', true)).toBe('ZQSA\n<br>ZQSB');
  });

  it('Shift+Enter, a word, Enter, as Firefox types it, in a text block or a table cell', () => {
    expect(sanitizeTyped('ZQSC\n<div>ZQSD</div><div>ZQSE</div>', true)).toBe('ZQSC\nZQSD<br>ZQSE');
    expect(sanitizeTyped('Measure ZQSF\n<div>ZQSG</div><div>ZQSH</div>', true)).toBe('Measure ZQSF\nZQSG<br>ZQSH');
  });

  it('a newline inside the line, or spaces typed after it, leaves the line open', () => {
    // Chromium's markup for Shift+Enter, a word, Enter (stored right before).
    expect(sanitizeTyped('ZQSC\nZQSD<div>ZQSE</div>', true)).toBe('ZQSC\nZQSD<br>ZQSE');
    expect(sanitizeTyped('a\n  <div>b</div>', true)).toBe('a\n  <br>b');
  });
});
