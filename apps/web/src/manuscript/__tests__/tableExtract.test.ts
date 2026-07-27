/**
 * Q2 plot branch, data source (a): the manuscript's own tables, read
 * deterministically and offered to the chart chooser pre-filled.
 *
 * An empty result is not a failure — it is the signal to fall back to
 * the chooser's paste / CSV / XLSX ingest, so these tests pin both.
 */
import { describe, it, expect } from 'vitest';
import type { DocumentModel, ManuscriptTableRef } from '@postr/shared';
import { htmlToIngestItems, readTableGrid } from '../docxIngest';
import { buildDocumentModel } from '../buildDocumentModel';
import { parseManuscriptText } from '../parseManuscriptText';
import { extractPlottableTables } from '../tableExtract';

function docWithTables(tables: ManuscriptTableRef[]): DocumentModel {
  return {
    version: 1,
    title: 'A Study',
    authors: [],
    institutions: [],
    abstract: null,
    sections: [],
    figures: [],
    tables,
    references: [],
    venue: null,
    wordCount: 100,
  };
}

const GOOD_TABLE: ManuscriptTableRef = {
  id: 'tbl1',
  caption: 'Table 1. Recall by group.',
  sourceSectionId: null,
  data: {
    header: ['Group', 'Recall'],
    rows: [
      ['Control', '82'],
      ['Restricted', '61'],
    ],
  },
};

describe('readTableGrid', () => {
  const grid = (html: string) => {
    const el = new DOMParser()
      .parseFromString(html, 'text/html')
      .querySelector('table')!;
    return readTableGrid(el);
  };

  it('reads a header row and data rows', () => {
    expect(
      grid(
        '<table><tr><th>Group</th><th>Recall</th></tr><tr><td>Control</td><td>82</td></tr></table>',
      ),
    ).toEqual({ header: ['Group', 'Recall'], rows: [['Control', '82']] });
  });

  it('pads ragged rows to the header width rather than dropping them', () => {
    expect(
      grid(
        '<table><tr><td>A</td><td>B</td><td>C</td></tr><tr><td>1</td><td>2</td></tr></table>',
      )?.rows,
    ).toEqual([['1', '2', '']]);
  });

  it('truncates rows wider than the header', () => {
    expect(
      grid('<table><tr><td>A</td><td>B</td></tr><tr><td>1</td><td>2</td><td>3</td></tr></table>')
        ?.rows,
    ).toEqual([['1', '2']]);
  });

  it('collapses whitespace inside cells', () => {
    expect(
      grid('<table><tr><td>Group  name</td><td>x</td></tr><tr><td>a</td><td>1</td></tr></table>')
        ?.header,
    ).toEqual(['Group name', 'x']);
  });

  it('rejects a single-column layout table', () => {
    expect(grid('<table><tr><td>only</td></tr><tr><td>one</td></tr></table>')).toBeNull();
  });

  it('rejects a header with no data rows', () => {
    expect(grid('<table><tr><th>A</th><th>B</th></tr></table>')).toBeNull();
  });
});

describe('docx ingest keeps the grid', () => {
  it('carries cells through to the DocumentModel', () => {
    const items = htmlToIngestItems(
      '<h1>Results</h1><table><tr><th>Group</th><th>Recall</th></tr><tr><td>Control</td><td>82</td></tr><tr><td>Restricted</td><td>61</td></tr></table>',
    );
    const doc = buildDocumentModel(items);
    expect(doc.tables).toHaveLength(1);
    expect(doc.tables[0]!.data).toEqual({
      header: ['Group', 'Recall'],
      rows: [
        ['Control', '82'],
        ['Restricted', '61'],
      ],
    });
  });

  it('pairs a following "Table N." paragraph as the caption', () => {
    const items = htmlToIngestItems(
      '<table><tr><th>Group</th><th>Recall</th></tr><tr><td>A</td><td>1</td></tr></table><p>Table 1. Recall by group.</p>',
    );
    const doc = buildDocumentModel(items);
    expect(doc.tables).toHaveLength(1);
    expect(doc.tables[0]!.caption).toBe('Table 1. Recall by group.');
  });
});

describe('pasted text has captions but no cells', () => {
  it('records the table with a null grid', () => {
    const doc = parseManuscriptText(
      ['A Title', '', 'Results', '', 'Table 1. Recall by group.', '', 'Recall fell 21%.'].join(
        '\n',
      ),
    );
    expect(doc.tables).toHaveLength(1);
    expect(doc.tables[0]!.data).toBeNull();
    // Which means the plot branch falls back to the chooser's ingest.
    expect(extractPlottableTables(doc)).toEqual([]);
  });
});

describe('extractPlottableTables', () => {
  it('offers a usable numeric table', () => {
    const extracted = extractPlottableTables(docWithTables([GOOD_TABLE]));
    expect(extracted).toHaveLength(1);
    expect(extracted[0]!.label).toBe('Table 1. Recall by group.');
    expect(extracted[0]!.summary).toBe('2 rows × 2 columns');
    expect(extracted[0]!.table.header).toEqual(['Group', 'Recall']);
  });

  it('skips a caption-only table', () => {
    expect(
      extractPlottableTables(docWithTables([{ ...GOOD_TABLE, data: null }])),
    ).toEqual([]);
  });

  it('skips a table with no numbers — nothing to plot', () => {
    const textual: ManuscriptTableRef = {
      ...GOOD_TABLE,
      data: {
        header: ['Item', 'Included'],
        rows: [
          ['Consent', 'Yes'],
          ['Screening', 'No'],
        ],
      },
    };
    expect(extractPlottableTables(docWithTables([textual]))).toEqual([]);
  });

  it('skips a single-data-row table — that is a summary line', () => {
    const oneRow: ManuscriptTableRef = {
      ...GOOD_TABLE,
      data: { header: ['Group', 'Recall'], rows: [['Control', '82']] },
    };
    expect(extractPlottableTables(docWithTables([oneRow]))).toEqual([]);
  });

  it('puts results tables first', () => {
    const doc: DocumentModel = {
      ...docWithTables([
        { ...GOOD_TABLE, id: 'demo', caption: 'Table 1. Demographics.', sourceSectionId: 'sec-m' },
        { ...GOOD_TABLE, id: 'res', caption: 'Table 2. Recall.', sourceSectionId: 'sec-r' },
      ]),
      sections: [
        { id: 'sec-m', heading: 'Methods', kind: 'methods', level: 1, paragraphs: [], sourceOrder: 0 },
        { id: 'sec-r', heading: 'Results', kind: 'results', level: 1, paragraphs: [], sourceOrder: 1 },
      ],
    };
    expect(extractPlottableTables(doc).map((t) => t.id)).toEqual(['res', 'demo']);
  });

  it('falls back to a positional label when there is no caption', () => {
    expect(
      extractPlottableTables(docWithTables([{ ...GOOD_TABLE, caption: '' }]))[0]!.label,
    ).toBe('Table 1');
  });

  it('returns an empty list for a manuscript with no tables', () => {
    expect(extractPlottableTables(docWithTables([]))).toEqual([]);
  });
});
