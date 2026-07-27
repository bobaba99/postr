/**
 * DOCX ingest — structure mapping from mammoth's HTML output. mammoth
 * itself is exercised only in the browser; these tests cover the part
 * we own — the HTML walk and its DocumentModel integration — with
 * hand-written HTML shaped like mammoth's real output.
 */
import { describe, it, expect } from 'vitest';
import { htmlToIngestItems } from '../docxIngest';
import { buildDocumentModel } from '../buildDocumentModel';

const PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const DOCX_HTML = `
<h1>Working Memory Training in Older Adults</h1>
<p>Jane Doe1, John Smith2</p>
<p>(1) Acme State University, (2) Sample Research Institute</p>
<h2>Abstract</h2>
<p>We evaluated a six-week training programme. Gains transferred to untrained tasks.</p>
<h2>Introduction</h2>
<p>Working memory declines with age.</p>
<h2>Methods</h2>
<p>Sixty adults completed the programme.</p>
<ul><li>Session one: baseline.</li><li>Session two: training.</li></ul>
<h2>Results</h2>
<p>Span scores improved by 18% (p = .003), as shown in Figure 1.</p>
<p><img src="${PNG_DATA_URI}" /></p>
<p>Figure 1. Span improvement across sessions.</p>
<table><tr><td>Group</td><td>Mean</td></tr></table>
<h2>References</h2>
<p>Doe, J. (2025). Training effects. Sample Journal, 3, 1-9.</p>
`;

describe('htmlToIngestItems', () => {
  const items = htmlToIngestItems(DOCX_HTML);

  it('maps headings with their levels', () => {
    const headings = items.filter((i) => i.kind === 'heading');
    expect(headings[0]).toMatchObject({ text: expect.stringMatching(/Working Memory/), level: 1 });
    expect(headings.some((h) => h.text === 'Methods' && h.level === 2)).toBe(true);
  });

  it('extracts data-URI images as bare figures', () => {
    const figures = items.filter((i) => i.kind === 'figure');
    expect(figures).toHaveLength(1);
    expect(figures[0]!.imageRef).toBe(PNG_DATA_URI);
    expect(figures[0]!.text).toBe('');
  });

  it('flattens list items into paragraphs', () => {
    const texts = items.filter((i) => i.kind === 'paragraph').map((i) => i.text);
    expect(texts).toContain('Session one: baseline.');
    expect(texts).toContain('Session two: training.');
  });

  it('records tables as caption-only refs', () => {
    expect(items.filter((i) => i.kind === 'table')).toHaveLength(1);
  });
});

describe('DOCX → DocumentModel integration', () => {
  const doc = buildDocumentModel(htmlToIngestItems(DOCX_HTML));

  it('extracts title and structured authors', () => {
    expect(doc.title).toBe('Working Memory Training in Older Adults');
    expect(doc.authors.map((a) => a.name)).toEqual(['Jane Doe', 'John Smith']);
    expect(doc.institutions).toHaveLength(2);
  });

  it('pairs the bare image with its following caption paragraph', () => {
    expect(doc.figures).toHaveLength(1);
    expect(doc.figures[0]!.imageRef).toBe(PNG_DATA_URI);
    expect(doc.figures[0]!.caption).toMatch(/^Figure 1\. Span improvement/);
  });

  it('scores figure prominence from Results mentions', () => {
    expect(doc.figures[0]!.prominence).toBeGreaterThan(0);
  });

  it('splits abstract and references away from body sections', () => {
    expect(doc.abstract).toMatch(/six-week training/);
    expect(doc.references).toHaveLength(1);
    const kinds = doc.sections.map((s) => s.kind);
    expect(kinds).toEqual(['introduction', 'methods', 'results']);
  });
});
