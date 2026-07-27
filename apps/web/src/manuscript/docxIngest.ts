/**
 * .docx ingest — Word manuscript → DocumentModel via mammoth.
 *
 * mammoth converts the .docx to semantic HTML (real h1–h6 from Word's
 * heading styles, inline images as data: URIs). We walk that HTML into
 * the shared `IngestItem[]` shape and reuse the same DocumentModel
 * builder as pasted text, so the two primary ingest paths cannot
 * drift apart.
 *
 * mammoth is dynamically imported — it only loads when a user actually
 * drops a .docx, keeping it out of the page's initial chunk.
 */
import type { DocumentModel } from '@postr/shared';
import { buildDocumentModel, type IngestItem } from './buildDocumentModel';

/** Reject absurd uploads before mammoth ever sees them. Typical
 *  manuscripts are 50 KB–5 MB; 20 MB covers image-heavy theses. */
export const MAX_DOCX_BYTES = 20 * 1024 * 1024;

export class DocxIngestError extends Error {
  constructor(
    public readonly code: 'too_large' | 'parse_failed' | 'empty',
  ) {
    super(`docx_ingest_${code}`);
    this.name = 'DocxIngestError';
  }
}

/**
 * Walk mammoth's HTML output into ingest items. Exported separately so
 * unit tests can exercise the structure mapping without a real .docx.
 *
 * Caption pairing note: Word convention places figure captions BELOW
 * the image, which the DocumentModel builder pairs up. A caption
 * paragraph above its image is recorded as a second caption-only
 * figure — a cosmetic duplicate the outline makes visible.
 */
export function htmlToIngestItems(html: string): IngestItem[] {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const items: IngestItem[] = [];
  walkChildren(parsed.body, items);
  return items;
}

function walkChildren(parent: Element, items: IngestItem[]): void {
  for (const el of Array.from(parent.children)) {
    visitElement(el, items);
  }
}

/**
 * Read a `<table>` into a header + rows grid.
 *
 * Word tables rarely carry `<thead>`, so the first row is treated as
 * the header when mammoth gives us no better signal — the same
 * convention the chart chooser's paste path already uses. Ragged rows
 * are padded to the header width rather than dropped: a missing cell is
 * a blank, not a reason to lose the row.
 *
 * Returns null for anything that is not a usable grid (a layout table
 * with one cell, an empty table), so callers can fall back to the
 * caption-only record without a special case.
 */
export function readTableGrid(el: Element): { header: string[]; rows: string[][] } | null {
  const rowEls = Array.from(el.querySelectorAll('tr'));
  const grid = rowEls
    .map((tr) =>
      Array.from(tr.querySelectorAll('th, td')).map((cell) =>
        (cell.textContent ?? '').replace(/\s+/g, ' ').trim(),
      ),
    )
    .filter((cells) => cells.some((c) => c.length > 0));

  // A header plus at least one data row, at least two columns — below
  // that it is a layout box, not data worth charting.
  if (grid.length < 2) return null;
  const header = grid[0]!;
  if (header.length < 2) return null;

  const rows = grid.slice(1).map((cells) => {
    const padded = [...cells];
    while (padded.length < header.length) padded.push('');
    return padded.slice(0, header.length);
  });

  return { header, rows };
}

function visitElement(el: Element, items: IngestItem[]): void {
  const tag = el.tagName.toLowerCase();

  if (/^h[1-6]$/.test(tag)) {
    const text = (el.textContent ?? '').trim();
    if (text) {
      items.push({ kind: 'heading', text, level: Number(tag[1]) });
    }
    return;
  }

  if (tag === 'p') {
    // Images first — a paragraph that is only an image becomes a bare
    // figure awaiting its caption from the following paragraph.
    const imgs = Array.from(el.querySelectorAll('img'));
    const text = (el.textContent ?? '').trim();
    for (const img of imgs) {
      const src = img.getAttribute('src') ?? '';
      if (src.startsWith('data:image/')) {
        items.push({ kind: 'figure', text: imgs.length === 1 ? text : '', imageRef: src });
      }
    }
    if (text && imgs.length === 0) {
      items.push({ kind: 'paragraph', text });
    }
    return;
  }

  if (tag === 'ul' || tag === 'ol') {
    for (const li of Array.from(el.querySelectorAll(':scope > li'))) {
      const text = (li.textContent ?? '').trim();
      if (text) items.push({ kind: 'paragraph', text });
    }
    return;
  }

  if (tag === 'table') {
    // Cells ARE reconstructed: Q2's plot branch offers the manuscript's
    // own results table to the chart chooser pre-filled, and that is
    // only possible if ingest keeps the grid. Deterministic parsing —
    // no model involved in reading a <table>.
    items.push({ kind: 'table', text: '', tableData: readTableGrid(el) });
    return;
  }

  // Containers mammoth occasionally emits (div, blockquote, section).
  if (el.children.length > 0) {
    walkChildren(el, items);
    return;
  }

  const text = (el.textContent ?? '').trim();
  if (text) items.push({ kind: 'paragraph', text });
}

/**
 * Parse a .docx File into the pipeline IR.
 */
export async function ingestDocx(file: File): Promise<DocumentModel> {
  if (file.size > MAX_DOCX_BYTES) {
    throw new DocxIngestError('too_large');
  }

  let html: string;
  try {
    const mammoth = (await import('mammoth')).default;
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    html = result.value;
  } catch (error) {
    // Surfaced to the user as a generic failure — raw parser errors
    // never reach the UI.
    console.error('docx conversion failed:', error);
    throw new DocxIngestError('parse_failed');
  }

  const items = htmlToIngestItems(html);
  if (items.length === 0) {
    throw new DocxIngestError('empty');
  }
  return buildDocumentModel(items);
}
