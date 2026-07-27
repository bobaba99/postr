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
    // Cell contents are not reconstructed in the MVP — the ref exists
    // so the outline can say "1 table detected" and Q5 can pin it.
    items.push({ kind: 'table', text: '' });
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
