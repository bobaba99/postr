/**
 * Poster builder — condensed narrative → PosterDoc. Deterministic.
 *
 * Layout is a fixed three-column reading of the five-role spine:
 *   col 1 — Background (hook), Research Question, Methods
 *   col 2 — Key Findings: money figure + findings text
 *   col 3 — Take-Home Message, pinned sections, References (≤ 5)
 *
 * Budgets guarantee the text fits at the calibrated print sizes; the
 * builder still estimates block heights and HARD-CLIPS the last block
 * of an over-full column, reporting a warning instead of ever shrinking
 * type — type size is a print-legibility constraint, not a layout
 * variable.
 */
import { nanoid } from 'nanoid';
import type {
  Block,
  CondensedNarrative,
  DocumentModel,
  NarrativeRoleId,
  PosterDoc,
  TypeStyle,
} from '@postr/shared';
import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_HEADING_STYLE,
  DEFAULT_PALETTE,
  DEFAULT_STYLES,
  GAP,
  M,
  PX,
} from '../poster/constants';
import { POSTER_MAX_REFERENCES, POSTER_ROLE_SPECS } from './rubric';

export interface BuildPosterResult {
  doc: PosterDoc;
  warnings: string[];
}

const POSTER_WIDTH_IN = 48;
const POSTER_HEIGHT_IN = 36;
const HEADER_TITLE_H = 45;
const HEADER_AUTHORS_H = 22;
const HEADING_H = 20;
/** Gap between a heading and its content / between stacked panels. */
const PANEL_GAP = 4;

const FIGURE_CAPTION_PREFIX_RE = /^(figure|fig\.?)\s*\d+\s*[.:—-]\s*/i;

/** Estimate rendered text height in poster units for a given column
 *  width and type style. Mirrors autoLayout's char-count approach. */
export function estimateTextHeight(
  text: string,
  widthUnits: number,
  style: TypeStyle,
): number {
  const avgCharWidth = style.size * 0.55;
  const charsPerLine = Math.max(8, Math.floor(widthUnits / avgCharWidth));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  return Math.ceil(lines * style.size * style.lineHeight) + 4;
}

function textBlock(partial: Partial<Block> & Pick<Block, 'type' | 'x' | 'y' | 'w' | 'h'>): Block {
  return {
    id: nanoid(8),
    content: '',
    imageSrc: null,
    imageFit: 'contain',
    tableData: null,
    ...partial,
  };
}

interface ColumnCursor {
  x: number;
  y: number;
  w: number;
  bottom: number;
}

/** Append a heading + body pair to a column, clipping the body when
 *  the column is out of space. Returns the new cursor plus blocks. */
function appendPanel(
  cursor: ColumnCursor,
  heading: string,
  body: Block | null,
  warnings: string[],
): { cursor: ColumnCursor; blocks: Block[] } {
  const blocks: Block[] = [];
  let y = cursor.y;

  const headingSpace = HEADING_H + PANEL_GAP;
  const bodyH = body?.h ?? 0;
  if (y + headingSpace >= cursor.bottom) {
    warnings.push(
      `Not enough room for the "${heading}" panel — it was left off. Open the poster in the editor to rearrange.`,
    );
    return { cursor, blocks };
  }

  blocks.push(
    textBlock({
      type: 'heading',
      x: cursor.x,
      y,
      w: cursor.w,
      h: HEADING_H,
      content: heading,
    }),
  );
  y += headingSpace;

  if (body) {
    let h = bodyH;
    if (y + h > cursor.bottom) {
      h = Math.max(10, cursor.bottom - y);
      warnings.push(
        `The "${heading}" panel was clipped to fit — trim its text or rearrange in the editor.`,
      );
    }
    blocks.push({ ...body, x: cursor.x, y, w: cursor.w, h });
    y += h + PANEL_GAP * 2;
  }

  return { cursor: { ...cursor, y }, blocks };
}

/**
 * Build a complete PosterDoc from the ingest IR + condensed narrative.
 */
export function buildPosterDoc(
  doc: DocumentModel,
  condensed: CondensedNarrative,
): BuildPosterResult {
  const warnings: string[] = [];
  const W = POSTER_WIDTH_IN * PX;
  const H = POSTER_HEIGHT_IN * PX;
  const bodyTop = HEADER_TITLE_H + M + HEADER_AUTHORS_H + M;
  const bodyBottom = H - M;
  const colW = (W - M * 2 - GAP * 2) / 3;
  const colX = (i: number) => M + (colW + GAP) * i;

  const textByRole = new Map<NarrativeRoleId, string>(
    condensed.roles.map((r) => [r.role, r.text]),
  );
  const styles = DEFAULT_STYLES;

  const blocks: Block[] = [
    textBlock({
      type: 'title',
      x: M,
      y: M,
      w: W - M * 2,
      h: HEADER_TITLE_H,
      content: doc.title || 'Untitled poster',
    }),
    textBlock({
      type: 'authors',
      x: M,
      y: M + HEADER_TITLE_H + 2,
      w: W - M * 2,
      h: HEADER_AUTHORS_H,
    }),
  ];

  const bodyText = (role: NarrativeRoleId): Block | null => {
    const text = textByRole.get(role)?.trim() ?? '';
    if (!text) return null;
    return textBlock({
      type: 'text',
      x: 0,
      y: 0,
      w: colW,
      h: estimateTextHeight(text, colW, styles.body),
      content: text,
    });
  };

  // ── Column 1: hook, question, methods ─────────────────────────────
  let col1: ColumnCursor = { x: colX(0), y: bodyTop, w: colW, bottom: bodyBottom };
  for (const role of ['hook', 'question', 'methods'] as const) {
    const body = bodyText(role);
    if (!body) continue;
    const spec = POSTER_ROLE_SPECS[role];
    const result = appendPanel(col1, spec.displayHeading, body, warnings);
    col1 = result.cursor;
    blocks.push(...result.blocks);
  }

  // ── Column 2: Key Findings — figure-led ───────────────────────────
  let col2: ColumnCursor = { x: colX(1), y: bodyTop, w: colW, bottom: bodyBottom };
  const keyBody = bodyText('keyResult');
  const keyPanel = appendPanel(
    col2,
    POSTER_ROLE_SPECS.keyResult.displayHeading,
    keyBody,
    warnings,
  );
  col2 = keyPanel.cursor;
  blocks.push(...keyPanel.blocks);

  // The money figure: highest-prominence figure that has real pixels.
  const moneyFigure = [...doc.figures]
    .filter((f) => f.imageRef !== null)
    .sort((a, b) => b.prominence - a.prominence)[0];
  if (moneyFigure?.imageRef) {
    const remaining = col2.bottom - col2.y;
    if (remaining >= 40) {
      blocks.push(
        textBlock({
          type: 'image',
          x: col2.x,
          y: col2.y,
          w: colW,
          h: remaining,
          imageSrc: moneyFigure.imageRef,
          caption: moneyFigure.caption.replace(FIGURE_CAPTION_PREFIX_RE, ''),
          captionPosition: 'bottom',
        }),
      );
      col2 = { ...col2, y: col2.bottom };
    } else {
      warnings.push(
        'No room for the main figure next to the findings — add it in the editor.',
      );
    }
  }

  // ── Column 3: takeaway, pinned sections, references ───────────────
  let col3: ColumnCursor = { x: colX(2), y: bodyTop, w: colW, bottom: bodyBottom };
  const takeawayBody = bodyText('takeaway');
  if (takeawayBody) {
    const result = appendPanel(
      col3,
      POSTER_ROLE_SPECS.takeaway.displayHeading,
      takeawayBody,
      warnings,
    );
    col3 = result.cursor;
    blocks.push(...result.blocks);
  }

  for (const pin of condensed.pinned) {
    const text = pin.text.trim();
    if (!text) continue;
    const body = textBlock({
      type: 'text',
      x: 0,
      y: 0,
      w: colW,
      h: estimateTextHeight(text, colW, styles.body),
      content: text,
    });
    const result = appendPanel(col3, pin.heading, body, warnings);
    col3 = result.cursor;
    blocks.push(...result.blocks);
  }

  const references = doc.references.slice(0, POSTER_MAX_REFERENCES);
  if (doc.references.length > POSTER_MAX_REFERENCES) {
    warnings.push(
      `References trimmed to the ${POSTER_MAX_REFERENCES} most relevant — the full list stays in your manuscript.`,
    );
  }
  if (references.length > 0) {
    const remaining = col3.bottom - col3.y;
    if (remaining >= HEADING_H + PANEL_GAP + 20) {
      blocks.push(
        textBlock({
          type: 'references',
          x: col3.x,
          y: col3.y,
          w: colW,
          h: remaining,
        }),
      );
    } else {
      warnings.push('No room for the reference list — add it in the editor.');
    }
  }

  const posterDoc: PosterDoc = {
    version: 1,
    widthIn: POSTER_WIDTH_IN,
    heightIn: POSTER_HEIGHT_IN,
    blocks,
    fontFamily: DEFAULT_FONT_FAMILY,
    palette: DEFAULT_PALETTE,
    styles,
    headingStyle: DEFAULT_HEADING_STYLE,
    institutions: doc.institutions,
    authors: doc.authors,
    references,
  };

  return { doc: posterDoc, warnings };
}
