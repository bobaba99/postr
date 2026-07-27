/**
 * Pasted-text ingest — the cheapest possible path to a DocumentModel.
 *
 * No parser dependencies: the manuscript arrives as plain text (from
 * Word, Google Docs, or a text editor), we split it into paragraph
 * chunks, promote heading-shaped lines, and hand the result to the
 * shared DocumentModel builder.
 *
 * Two paragraph modes, detected from the paste itself:
 *   - blank-line mode — paragraphs separated by empty lines; single
 *     newlines inside a chunk are hard-wraps and get rejoined.
 *   - line mode — no blank lines anywhere (common when copying out of
 *     Word with "paragraph marks only"); every line is a paragraph.
 */
import type { DocumentModel } from '@postr/shared';
import { looksLikeHeading } from './sectionLexicon';
import { buildDocumentModel, type IngestItem } from './buildDocumentModel';

/** Upper bound on accepted paste size (characters). A 60k-word thesis
 *  is ~400 KB; anything past this is probably an accidental paste of
 *  something else entirely. */
export const MAX_MANUSCRIPT_CHARS = 500_000;

export function parseManuscriptText(raw: string): DocumentModel {
  const text = raw.slice(0, MAX_MANUSCRIPT_CHARS).replace(/\r\n?/g, '\n');
  const hasBlankLines = /\n[ \t]*\n/.test(text.trim());
  const items = hasBlankLines ? parseBlankLineMode(text) : parseLineMode(text);
  return buildDocumentModel(items);
}

function headingItem(trimmed: string): IngestItem {
  const level = /^#+\s/.test(trimmed)
    ? Math.min(6, trimmed.match(/^#+/)?.[0].length ?? 1)
    : 1;
  return {
    kind: 'heading',
    text: trimmed.replace(/^#+\s*/, '').replace(/:$/, ''),
    level,
  };
}

function parseBlankLineMode(text: string): IngestItem[] {
  const items: IngestItem[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    // Newlines survive into the item so the DocumentModel builder can
    // treat a chunk as one wrapped paragraph (body prose) or as one
    // item per line (reference lists) depending on the section.
    items.push({ kind: 'paragraph', text: buffer.join('\n').trim() });
    buffer = [];
  };

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    if (looksLikeHeading(trimmed)) {
      flush();
      items.push(headingItem(trimmed));
      continue;
    }
    buffer.push(trimmed);
  }
  flush();
  return items;
}

function parseLineMode(text: string): IngestItem[] {
  const items: IngestItem[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (looksLikeHeading(trimmed)) {
      items.push(headingItem(trimmed));
    } else {
      items.push({ kind: 'paragraph', text: trimmed });
    }
  }
  return items;
}
