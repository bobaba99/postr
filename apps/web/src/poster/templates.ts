/**
 * Layout templates — extracted from prototype.js.
 *
 * Each template is a pure function (posterWidthInches, posterHeightInches)
 * → array of partial Block definitions. Coordinates are in poster units
 * (1 unit = 1/10 inch). The Editor adds ids and default fields with
 * makeBlocks() to produce ready-to-render Block objects.
 *
 * Five templates: 3-column classic, 2-column wide figure, billboard,
 * sidebar+focus, blank. The picker in the Layout tab uses these names
 * + descriptions verbatim.
 */
import { nanoid } from 'nanoid';
import type { Block, BlockType } from '@postr/shared';
import { PX, M, GAP } from './constants';

export type LayoutKey = '3col' | '2col' | 'billboard' | 'sidebar' | 'empty';

export interface LayoutTemplate {
  key: LayoutKey;
  name: string;
  description: string;
  build: (posterWidthIn: number, posterHeightIn: number) => Array<Partial<Block> & { type: BlockType }>;
}

// Header (title + authors) area height in poster units
const HEADER_HEIGHT = 71;

function bodyMetrics(posterWidthIn: number, posterHeightIn: number) {
  const W = posterWidthIn * PX;
  const H = posterHeightIn * PX;
  const bodyTop = HEADER_HEIGHT + M;
  const bodyHeight = H - bodyTop - M;
  return { W, H, bodyTop, bodyHeight };
}

// =========================================================================
// Templates
// =========================================================================

const threeCol: LayoutTemplate = {
  key: '3col',
  name: '3-Column Classic',
  description: 'Traditional conference layout.',
  build: (pw, ph) => {
    const { W, bodyTop, bodyHeight } = bodyMetrics(pw, ph);
    const c = (W - M * 2 - GAP * 2) / 3;
    return [
      { type: 'title', x: M, y: M, w: W - M * 2, h: 45 },
      { type: 'authors', x: M, y: 57, w: W - M * 2, h: 22 },
      // Column 1
      { type: 'heading', x: M, y: bodyTop, w: c, h: 20, content: 'Introduction' },
      { type: 'text', x: M, y: bodyTop + 22, w: c, h: bodyHeight * 0.42, content: 'Background and research question. Provide context, motivation, and the gap your work addresses.' },
      { type: 'heading', x: M, y: bodyTop + 24 + bodyHeight * 0.42, w: c, h: 20, content: 'Hypotheses' },
      { type: 'text', x: M, y: bodyTop + 46 + bodyHeight * 0.42, w: c, h: bodyHeight * 0.42, content: 'State your specific hypotheses or research aims here.' },
      // Column 2
      { type: 'heading', x: M + c + GAP, y: bodyTop, w: c, h: 20, content: 'Methods' },
      { type: 'text', x: M + c + GAP, y: bodyTop + 22, w: c, h: bodyHeight * 0.35, content: 'Participants, design, materials, procedure, and analysis approach.' },
      { type: 'image', x: M + c + GAP, y: bodyTop + 24 + bodyHeight * 0.35, w: c, h: bodyHeight * 0.55 },
      // Column 3
      { type: 'heading', x: M + (c + GAP) * 2, y: bodyTop, w: c, h: 20, content: 'Results' },
      {
        type: 'table',
        x: M + (c + GAP) * 2,
        y: bodyTop + 22,
        w: c,
        h: bodyHeight * 0.32,
        tableData: {
          rows: 4,
          cols: 3,
          cells: ['Measure', 'M (SD)', '𝑝', 'DV 1', '4.2 (0.8)', '< .01', 'DV 2', '3.1 (1.1)', '.03', 'DV 3', '2.8 (0.6)', '.12'],
          colWidths: null,
          borderPreset: 'apa',
        },
      },
      { type: 'heading', x: M + (c + GAP) * 2, y: bodyTop + 24 + bodyHeight * 0.32, w: c, h: 20, content: 'Conclusions' },
      { type: 'text', x: M + (c + GAP) * 2, y: bodyTop + 46 + bodyHeight * 0.32, w: c, h: bodyHeight * 0.25, content: 'Key findings, implications, and future directions.' },
      { type: 'references', x: M + (c + GAP) * 2, y: bodyTop + 48 + bodyHeight * 0.59, w: c, h: bodyHeight * 0.32 },
    ];
  },
};

const twoCol: LayoutTemplate = {
  key: '2col',
  name: '2-Col Wide Figure',
  description: 'Full-width figure zone.',
  build: (pw, ph) => {
    const { W, bodyTop, bodyHeight } = bodyMetrics(pw, ph);
    const c = (W - M * 2 - GAP) / 2;
    return [
      { type: 'title', x: M, y: M, w: W - M * 2, h: 45 },
      { type: 'authors', x: M, y: 57, w: W - M * 2, h: 22 },
      { type: 'heading', x: M, y: bodyTop, w: c, h: 20, content: 'Introduction' },
      { type: 'text', x: M, y: bodyTop + 22, w: c, h: bodyHeight * 0.22, content: 'Motivation and background.' },
      { type: 'heading', x: M + c + GAP, y: bodyTop, w: c, h: 20, content: 'Methods' },
      { type: 'text', x: M + c + GAP, y: bodyTop + 22, w: c, h: bodyHeight * 0.22, content: 'Design and analysis approach.' },
      { type: 'heading', x: M, y: bodyTop + 24 + bodyHeight * 0.22, w: W - M * 2, h: 20, content: 'Key Results' },
      { type: 'image', x: M, y: bodyTop + 46 + bodyHeight * 0.22, w: W - M * 2, h: bodyHeight * 0.38 },
      { type: 'heading', x: M, y: bodyTop + 48 + bodyHeight * 0.6, w: c, h: 20, content: 'Discussion' },
      { type: 'text', x: M, y: bodyTop + 70 + bodyHeight * 0.6, w: c, h: bodyHeight * 0.22, content: 'Interpretation of findings.' },
      { type: 'references', x: M + c + GAP, y: bodyTop + 48 + bodyHeight * 0.6, w: c, h: bodyHeight * 0.28 },
    ];
  },
};

const billboard: LayoutTemplate = {
  key: 'billboard',
  name: 'Billboard',
  description: 'Award-winning assertion-evidence.',
  build: (pw, ph) => {
    const { W, bodyTop, bodyHeight } = bodyMetrics(pw, ph);
    const c = (W - M * 2 - GAP * 2) / 3;
    return [
      { type: 'title', x: M, y: M, w: W - M * 2, h: 45 },
      { type: 'authors', x: M, y: 57, w: W - M * 2, h: 22 },
      { type: 'text', x: M + 15, y: bodyTop, w: W - M * 2 - 30, h: 55, content: 'YOUR KEY FINDING IN ONE CLEAR SENTENCE. Make this the takeaway.' },
      { type: 'image', x: M, y: bodyTop + 60, w: W - M * 2, h: bodyHeight * 0.42 },
      { type: 'heading', x: M, y: bodyTop + 64 + bodyHeight * 0.42, w: c, h: 20, content: 'Background' },
      { type: 'text', x: M, y: bodyTop + 86 + bodyHeight * 0.42, w: c, h: bodyHeight * 0.35, content: 'Brief context.' },
      { type: 'heading', x: M + c + GAP, y: bodyTop + 64 + bodyHeight * 0.42, w: c, h: 20, content: 'Methods' },
      { type: 'text', x: M + c + GAP, y: bodyTop + 86 + bodyHeight * 0.42, w: c, h: bodyHeight * 0.35, content: 'Essential method details.' },
      { type: 'heading', x: M + (c + GAP) * 2, y: bodyTop + 64 + bodyHeight * 0.42, w: c, h: 20, content: 'Implications' },
      { type: 'text', x: M + (c + GAP) * 2, y: bodyTop + 86 + bodyHeight * 0.42, w: c, h: bodyHeight * 0.35, content: 'So what? Future directions.' },
    ];
  },
};

const sidebar: LayoutTemplate = {
  key: 'sidebar',
  name: 'Sidebar + Focus',
  description: 'Narrow text, wide visuals.',
  build: (pw, ph) => {
    const { W, bodyTop, bodyHeight } = bodyMetrics(pw, ph);
    const sW = (W - M * 2 - GAP) * 0.3;
    const mW = (W - M * 2 - GAP) * 0.7;
    const mX = M + sW + GAP;
    return [
      { type: 'title', x: M, y: M, w: W - M * 2, h: 45 },
      { type: 'authors', x: M, y: 57, w: W - M * 2, h: 22 },
      { type: 'heading', x: M, y: bodyTop, w: sW, h: 20, content: 'Background' },
      { type: 'text', x: M, y: bodyTop + 22, w: sW, h: bodyHeight * 0.22, content: 'Context and aims.' },
      { type: 'heading', x: M, y: bodyTop + 24 + bodyHeight * 0.22, w: sW, h: 20, content: 'Methods' },
      { type: 'text', x: M, y: bodyTop + 46 + bodyHeight * 0.22, w: sW, h: bodyHeight * 0.22, content: 'Design and analysis.' },
      { type: 'heading', x: M, y: bodyTop + 48 + bodyHeight * 0.44, w: sW, h: 20, content: 'Conclusions' },
      { type: 'text', x: M, y: bodyTop + 70 + bodyHeight * 0.44, w: sW, h: bodyHeight * 0.18, content: 'Key findings.' },
      { type: 'references', x: M, y: bodyTop + 72 + bodyHeight * 0.64, w: sW, h: bodyHeight * 0.28 },
      { type: 'heading', x: mX, y: bodyTop, w: mW, h: 20, content: 'Results' },
      { type: 'image', x: mX, y: bodyTop + 22, w: mW, h: bodyHeight * 0.47 },
      { type: 'image', x: mX, y: bodyTop + 24 + bodyHeight * 0.47, w: mW, h: bodyHeight * 0.45 },
    ];
  },
};

const blank: LayoutTemplate = {
  key: 'empty',
  name: 'Blank',
  description: 'Title + authors only.',
  build: (pw) => {
    const W = pw * PX;
    return [
      { type: 'title', x: M, y: M, w: W - M * 2, h: 45 },
      { type: 'authors', x: M, y: 57, w: W - M * 2, h: 22 },
    ];
  },
};

export const LAYOUT_TEMPLATES: Record<LayoutKey, LayoutTemplate> = {
  '3col': threeCol,
  '2col': twoCol,
  billboard,
  sidebar,
  empty: blank,
};

export const DEFAULT_LAYOUT_KEY: LayoutKey = '3col';

// =========================================================================
// Block factory
// =========================================================================

/**
 * Builds a complete set of Block objects for the given layout key.
 * Adds nanoid ids and fills in defaults so the result can be dropped
 * straight into PosterDoc.blocks.
 */
export function makeBlocks(
  key: LayoutKey,
  posterWidthIn: number,
  posterHeightIn: number,
): Block[] {
  const template = LAYOUT_TEMPLATES[key] ?? LAYOUT_TEMPLATES['3col'];
  return template.build(posterWidthIn, posterHeightIn).map((partial) => {
    const type = partial.type;
    return {
      id: nanoid(8),
      type,
      x: partial.x ?? 0,
      y: partial.y ?? 0,
      w: partial.w ?? 100,
      h: partial.h ?? 50,
      content: partial.content ?? (type === 'title' ? 'Your Poster Title' : ''),
      imageSrc: partial.imageSrc ?? null,
      imageFit: partial.imageFit ?? 'contain',
      tableData:
        partial.tableData ??
        (type === 'table'
          ? {
              rows: 3,
              cols: 3,
              cells: Array(9).fill(''),
              colWidths: null,
              borderPreset: 'apa',
            }
          : null),
    } satisfies Block;
  });
}
