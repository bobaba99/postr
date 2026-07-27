/**
 * DocumentModel builder — the shared, deterministic second half of
 * every ingest path. Format-specific parsers (pasted text, .docx)
 * reduce their input to a flat `IngestItem[]`; this module turns that
 * into the pipeline's IR.
 *
 * Pure functions, no I/O — safe to unit-test.
 */
import { nanoid } from 'nanoid';
import type {
  DocumentModel,
  ManuscriptFigure,
  ManuscriptSection,
  ManuscriptTableData,
  ManuscriptTableRef,
  Reference,
  SectionKind,
} from '@postr/shared';
import { parseAuthorsText } from '../import/parseAuthors';
import { classifyHeading } from './sectionLexicon';

export interface IngestItem {
  kind: 'heading' | 'paragraph' | 'figure' | 'table';
  /** Heading text, paragraph text, or figure/table caption ('' when
   *  the caption is expected in the following paragraph). */
  text: string;
  /** Headings only, 1 = top-level. */
  level?: number;
  /** Figures only — data: URL from the DOCX image converter. */
  imageRef?: string;
  /** Tables only — the reconstructed grid, when the source had one. */
  tableData?: ManuscriptTableData | null;
}

const FIGURE_CAPTION_RE = /^(figure|fig\.?)\s*(\d+)\s*[.:—-]/i;
const TABLE_CAPTION_RE = /^(table|tbl\.?)\s*(\d+)\s*[.:—-]/i;
/** Byline candidates get at most this many words — a 60+ word second
 *  paragraph is prose, not an author list. */
const MAX_BYLINE_WORDS = 60;

/** Rejoin hard-wrapped lines inside one paragraph chunk. */
function unwrapLines(text: string): string {
  return text.replace(/\n+/g, ' ').trim();
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** True when a paragraph reads like a manuscript byline. */
export function looksLikeByline(text: string): boolean {
  if (countWords(text) > MAX_BYLINE_WORDS) return false;
  const parsed = parseAuthorsText(text);
  if (parsed.authors.length === 0) return false;
  // Affiliation digits or superscripts are the strongest signal.
  if (/\d|¹|²|³/.test(text)) return true;
  // Otherwise require at least two comma-separated names and no
  // sentence verbs — "Jane Doe, John Smith" yes, prose no.
  return parsed.authors.length >= 2 && !/\b(is|are|was|were|the)\b/i.test(text);
}

interface HeadState {
  title: string;
  authorsText: string;
  bodyStart: number;
}

/** Pull title + byline off the front of the item list. */
function extractHead(items: IngestItem[]): HeadState {
  let title = '';
  let authorsText = '';
  let i = 0;

  // Skip leading empties.
  while (i < items.length && !items[i]!.text.trim() && items[i]!.kind !== 'figure') i++;

  const first = items[i];
  if (first && first.kind === 'heading' && classifyHeading(first.text) === 'other') {
    // A leading non-section heading is the manuscript title.
    title = first.text.trim();
    i++;
  } else if (
    first &&
    first.kind === 'paragraph' &&
    countWords(first.text) <= 40 &&
    !looksLikeByline(first.text)
  ) {
    title = first.text.trim();
    i++;
  }

  // Byline: the next 1–2 paragraphs after the title. The institutions
  // list often sits on its own following paragraph.
  if (title) {
    const next = items[i];
    if (next && next.kind === 'paragraph' && looksLikeByline(next.text)) {
      authorsText = next.text.trim();
      i++;
      const after = items[i];
      if (
        after &&
        after.kind === 'paragraph' &&
        /^\(?\d+\)?[.)\s]/.test(after.text.trim()) &&
        countWords(after.text) <= MAX_BYLINE_WORDS
      ) {
        authorsText = `${authorsText}\n${after.text.trim()}`;
        i++;
      }
    }
  }

  return { title, authorsText, bodyStart: i };
}

function parseReferences(paragraphs: string[]): Reference[] {
  const refs: Reference[] = [];
  // Reference lists are one citation per LINE, so split chunks on the
  // newlines the text parser preserved.
  for (const line of paragraphs.flatMap((p) => p.split('\n'))) {
    const text = line.trim();
    if (!text) continue;
    const cleaned = text.replace(/^\[?\d+\]?[.)]?\s+/, '');
    const yearMatch = cleaned.match(/\((\d{4})\)|\b(19|20)\d{2}\b/);
    refs.push({
      id: nanoid(8),
      authors: [],
      year: yearMatch ? (yearMatch[1] ?? yearMatch[0]) : undefined,
      rawText: text,
    });
  }
  return refs;
}

/** Deterministic figure salience: mention count in results/discussion
 *  plus a small earlier-is-better position bonus. Normalized to [0,1]. */
function computeProminence(
  figures: ManuscriptFigure[],
  sections: ManuscriptSection[],
): ManuscriptFigure[] {
  if (figures.length === 0) return figures;
  const resultsText = sections
    .filter((s) => s.kind === 'results' || s.kind === 'discussion')
    .flatMap((s) => s.paragraphs)
    .join(' ');

  const rawScores = figures.map((fig, index) => {
    const numMatch = fig.caption.match(FIGURE_CAPTION_RE);
    const num = numMatch ? numMatch[2] : null;
    const mentions = num
      ? (resultsText.match(new RegExp(`\\b(figure|fig\\.?)\\s*${num}\\b`, 'gi')) ?? [])
          .length
      : 0;
    const positionBonus = (figures.length - index) / figures.length;
    return mentions * 2 + positionBonus;
  });
  const max = Math.max(...rawScores, 1);
  return figures.map((fig, i) => ({
    ...fig,
    prominence: Math.round((rawScores[i]! / max) * 100) / 100,
  }));
}

/**
 * Build the IR from a flat ingest item list.
 */
export function buildDocumentModel(items: IngestItem[]): DocumentModel {
  const { title, authorsText, bodyStart } = extractHead(items);
  const parsedAuthors = authorsText
    ? parseAuthorsText(authorsText)
    : { authors: [], institutions: [] };

  const sections: ManuscriptSection[] = [];
  const figures: ManuscriptFigure[] = [];
  const tables: ManuscriptTableRef[] = [];
  let abstractParas: string[] = [];
  let referencesParas: string[] = [];

  let current: ManuscriptSection | null = null;
  let sourceOrder = 0;
  let pendingFigure: ManuscriptFigure | null = null;
  let pendingTable: ManuscriptTableRef | null = null;

  const pushSection = (heading: string, kind: SectionKind, level: number) => {
    const section: ManuscriptSection = {
      id: nanoid(8),
      heading,
      kind,
      level,
      paragraphs: [],
      sourceOrder: sourceOrder++,
    };
    sections.push(section);
    return section;
  };

  for (let i = bodyStart; i < items.length; i++) {
    const item = items[i]!;
    const text = item.text.trim();

    if (item.kind === 'heading') {
      if (!text) continue;
      pendingFigure = null;
      pendingTable = null;
      current = pushSection(text, classifyHeading(text), item.level ?? 1);
      continue;
    }

    if (item.kind === 'figure') {
      const figure: ManuscriptFigure = {
        id: nanoid(8),
        imageRef: item.imageRef ?? null,
        caption: text,
        sourceSectionId: current?.id ?? null,
        prominence: 0,
      };
      figures.push(figure);
      // An imageRef with no caption pairs with the next "Figure N."
      // paragraph.
      pendingFigure = !text && item.imageRef ? figure : null;
      continue;
    }

    if (item.kind === 'table') {
      const table: ManuscriptTableRef = {
        id: nanoid(8),
        caption: text,
        sourceSectionId: current?.id ?? null,
        data: item.tableData ?? null,
      };
      tables.push(table);
      // A grid with no caption of its own pairs with the next
      // "Table N." paragraph, exactly as figures do — Word convention
      // puts the caption above or below, never inside.
      pendingTable = !text ? table : null;
      continue;
    }

    if (!text) continue;

    // Caption pairing: a "Figure N." paragraph right after a bare image
    // becomes that image's caption instead of body prose.
    if (pendingFigure && FIGURE_CAPTION_RE.test(text)) {
      const idx = figures.indexOf(pendingFigure);
      figures[idx] = { ...pendingFigure, caption: text };
      pendingFigure = null;
      continue;
    }
    // Same for a "Table N." paragraph following a bare grid — the
    // caption is what the chart chooser labels the pre-filled data
    // with, so losing it costs the user their own bearings.
    if (pendingTable && TABLE_CAPTION_RE.test(text)) {
      const idx = tables.indexOf(pendingTable);
      tables[idx] = { ...pendingTable, caption: text };
      pendingTable = null;
      continue;
    }
    pendingFigure = null;
    pendingTable = null;

    if (current?.kind === 'abstract') {
      abstractParas = [...abstractParas, unwrapLines(text)];
      continue;
    }
    if (current?.kind === 'references') {
      referencesParas = [...referencesParas, text];
      continue;
    }

    // Text-only manuscripts still declare figures/tables via caption
    // paragraphs — record them AND keep the caption text out of the
    // section prose (a caption is not body content).
    if (FIGURE_CAPTION_RE.test(text)) {
      figures.push({
        id: nanoid(8),
        imageRef: null,
        caption: text,
        sourceSectionId: current?.id ?? null,
        prominence: 0,
      });
      continue;
    }
    if (TABLE_CAPTION_RE.test(text)) {
      // Caption-only: pasted text declares "Table 1." but the numbers
      // themselves are an image or were never pasted. `data` stays null
      // and Q2's plot branch falls back to the chooser's own ingest.
      tables.push({
        id: nanoid(8),
        caption: text,
        sourceSectionId: current?.id ?? null,
        data: null,
      });
      continue;
    }

    if (!current) {
      current = pushSection('', 'other', 1);
    }
    current.paragraphs = [...current.paragraphs, unwrapLines(text)];
  }

  const keptSections = sections.filter(
    (s) => s.kind !== 'abstract' && s.kind !== 'references',
  );
  const abstract = abstractParas.length > 0 ? abstractParas.join('\n\n') : null;

  const wordCount =
    keptSections.reduce(
      (sum, s) => sum + s.paragraphs.reduce((a, p) => a + countWords(p), 0),
      0,
    ) + countWords(abstract ?? '');

  return {
    version: 1,
    title,
    authors: parsedAuthors.authors,
    institutions: parsedAuthors.institutions,
    abstract,
    sections: keptSections,
    figures: computeProminence(figures, keptSections),
    tables,
    references: parseReferences(referencesParas),
    venue: null,
    wordCount,
  };
}
