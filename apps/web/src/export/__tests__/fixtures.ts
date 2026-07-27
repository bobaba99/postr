/**
 * Shared PosterDoc fixture for the export writer tests.
 * All names are deliberately bogus (John Smith / Jane Doe, Acme
 * State University, Sample Research Institute) — never real people.
 */
import type { Block, PosterDoc } from '@postr/shared';
import {
  DEFAULT_HEADING_STYLE,
  DEFAULT_PALETTE,
  DEFAULT_STYLES,
} from '@/poster/constants';

/** 1×1 transparent PNG, base64. */
export const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
export const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_B64}`;
export const TINY_PNG_BYTES = Uint8Array.from(atob(TINY_PNG_B64), (c) => c.charCodeAt(0));

export const baseBlock = (partial: Partial<Block> & Pick<Block, 'id' | 'type'>): Block => ({
  x: 0,
  y: 0,
  w: 100,
  h: 20,
  content: '',
  imageSrc: null,
  imageFit: 'contain',
  tableData: null,
  ...partial,
});

/** A small but representative poster exercising every block type. */
export function makeFixtureDoc(overrides: Partial<PosterDoc> = {}): PosterDoc {
  return {
    version: 1,
    widthIn: 48,
    heightIn: 36,
    fontFamily: 'Source Sans 3',
    palette: DEFAULT_PALETTE,
    styles: DEFAULT_STYLES,
    headingStyle: DEFAULT_HEADING_STYLE,
    institutions: [
      { id: 'acme', name: 'Acme State University', dept: 'Dept. of Cat Studies' },
      { id: 'sri', name: 'Sample Research Institute' },
    ],
    authors: [
      {
        id: 'a1',
        name: 'John Smith',
        affiliationIds: ['acme'],
        isCorresponding: true,
        equalContrib: false,
      },
      {
        id: 'a2',
        name: 'Jane Doe',
        affiliationIds: ['acme', 'sri'],
        isCorresponding: false,
        equalContrib: false,
      },
    ],
    references: [
      {
        id: 'r1',
        authors: ['Smith, John'],
        year: '2026',
        title: 'Whisker-driven navigation',
        journal: 'Journal of Sample Research',
      },
    ],
    blocks: [
      baseBlock({
        id: 'title1',
        type: 'title',
        x: 20,
        y: 15.5,
        w: 240,
        h: 30,
        content: 'Whisker Maps &amp; <b>Naps</b>: 100% Cat Science',
      }),
      baseBlock({ id: 'authors1', type: 'authors', x: 20, y: 50, w: 240, h: 22 }),
      baseBlock({
        id: 'head1',
        type: 'heading',
        x: 20,
        y: 80,
        w: 150,
        h: 12,
        content: 'Methods',
      }),
      baseBlock({
        id: 'text1',
        type: 'text',
        x: 20,
        y: 95,
        w: 150,
        h: 60,
        content:
          'We measured <i>n</i> = 12 naps.<br><ul><li>long naps</li><li>short naps</li></ul>',
      }),
      baseBlock({
        id: 'img1',
        type: 'image',
        x: 200,
        y: 95,
        w: 120,
        h: 90,
        imageSrc: TINY_PNG_DATA_URL,
        caption: 'Nap duration by whisker length',
        captionPosition: 'bottom',
      }),
      baseBlock({
        id: 'tbl1',
        type: 'table',
        x: 20,
        y: 170,
        w: 150,
        h: 60,
        tableData: {
          rows: 2,
          cols: 2,
          cells: ['Group', 'Naps', 'Cats &amp; kittens', '<b>42</b>'],
          colWidths: null,
          borderPreset: 'apa',
        },
      }),
      baseBlock({
        id: 'rot1',
        type: 'text',
        x: 350,
        y: 200,
        w: 80,
        h: 20,
        content: 'Rotated aside',
        rotation: 15,
      }),
      baseBlock({ id: 'refs1', type: 'references', x: 20, y: 250, w: 200, h: 60 }),
    ],
    ...overrides,
  };
}
