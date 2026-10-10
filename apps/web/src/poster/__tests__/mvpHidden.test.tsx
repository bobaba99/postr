/**
 * Record 29 — the minimal editor's hide switches (owner decisions D3 and D4
 * of 2026-10-07 on docs/launch/mvp-editor/bounded-designs.md §6;
 * config/features.ts IMPORT_ENABLED, ADJUSTMENTS_ENABLED,
 * EDITOR_EXTRAS_ENABLED). Engineering record: docs/fixes/29-mvp-simplify.md.
 *
 * Entered the way a researcher gets there: the editor opens a poster, they
 * click the sidebar's tabs and the blocks on the canvas, hover and
 * right-click a table. With the switches off (as shipped), none of the
 * hidden controls is offered, the controls that stay are, and the hidden
 * controls' values hold: no grid, a caption on top unless stored
 * elsewhere, new tables APA 3-line, references in APA 7. The pages outside
 * the editor (the dashboard, the profile, the tour) are
 * src/__tests__/mvpHiddenPages.test.tsx; the copy is
 * src/__tests__/copyInventory.test.ts; mvpShown.test.tsx turns the switches
 * on and finds the controls still there. jsdom draws nothing:
 * scripts/simplify-check.mjs counts the same controls in a browser.
 *
 * Re-run: npx vitest run src/poster/__tests__/mvpHidden.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import type { Block, PosterDoc } from '@postr/shared';

vi.setConfig({ testTimeout: 20_000 });

const authSpies = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: authSpies,
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) },
  },
}));
vi.mock('@/data/posters', async (orig) => ({
  ...(await orig<typeof import('@/data/posters')>()),
  upsertPoster: vi.fn(async () => ({})),
}));
vi.mock('@/data/thumbnails', () => ({ captureThumbnail: vi.fn(async () => null) }));
vi.mock('@/motion/timelines/editorEntrance', () => ({ editorEntrance: vi.fn() }));
vi.mock('@/motion/timelines/blockSelection', () => ({ blockSelection: vi.fn() }));

import { NoopResizeObserver, doc, findButton, load, makeDoc, nextTask, openTab, q, renderEditor } from './editorKit';
import { stubScreen } from './workspaceKit';
import { FormatToolbarButtons } from '../FloatingFormatToolbar';

/** A 2 × 2 PNG, so image and logo blocks show a picture. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4AWP4z8DwHwyBAMQgYGBgAAB1SQX7nHNiaQAAAABJRU5ErkJggg==';

/** The default fixture plus an image, a table, a logo and a references block, each with room. */
function makeFixture(): PosterDoc {
  const d = makeDoc(48, 36);
  const base = d.blocks[2]!;
  const extra: Block[] = [
    { ...base, id: 'im1', type: 'image', x: 20, y: 240, w: 120, h: 90, content: '', imageSrc: PNG, caption: 'Our figure' },
    {
      ...base, id: 'tb1', type: 'table', x: 160, y: 240, w: 150, h: 60, content: '',
      tableData: { rows: 3, cols: 3, cells: ['A', 'B', 'C', '1', '2', '3', '4', '5', '6'], colWidths: null, borderPreset: 'apa' },
    } as Block,
    { ...base, id: 'lg1', type: 'logo', x: 330, y: 240, w: 60, h: 40, content: '', imageSrc: PNG },
    { ...base, id: 'rf1', type: 'references', x: 330, y: 300, w: 140, h: 50, content: '' },
  ];
  return {
    ...d,
    blocks: [...d.blocks, ...extra],
    references: [{ id: 'r1', authors: ['Doe, Jane'], year: '2020', title: 'A sample study', journal: 'Sample Journal' }],
  } as PosterDoc;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  // A canvas with room, so a selected block draws its whole handle row.
  stubScreen({ width: 1000, height: 640 });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const side = () => q<HTMLElement>('[data-postr-sidebar]');
const blockEl = (id: string) => q<HTMLElement>(`#poster-canvas [data-block-id="${id}"]`);
const sideText = () => side().textContent ?? '';
const sideButtons = (re: RegExp) => Array.from(side().querySelectorAll('button')).filter((b) => re.test((b.textContent ?? '').trim()));
const sideLabels = (re: RegExp) => Array.from(side().querySelectorAll('label')).filter((l) => re.test((l.textContent ?? '').trim()));
const selectWithOption = (value: string) =>
  Array.from(side().querySelectorAll('select')).filter((s) => Array.from(s.options).some((o) => o.value === value || o.textContent === value));

async function openEditor() {
  load(makeFixture());
  renderEditor();
  await nextTask();
}
async function select(id: string) {
  fireEvent.click(blockEl(id));
  await nextTask();
}
async function tab(label: RegExp) {
  await act(async () => { openTab(label); });
  await nextTask();
}

describe('import and the .postr backup are hidden (IMPORT_ENABLED, D3)', () => {
  it('the layout tab offers no Import tile', async () => {
    await openEditor();
    await tab(/^layout$/);
    expect(document.querySelector('[data-postr-import-tile]')).toBeNull();
    expect(sideText()).not.toMatch(/Import (a|an|your) poster|\.postr/i);
  });

  it('the export tab offers no Save as .postr, and keeps Save PDF and PowerPoint', async () => {
    await openEditor();
    await tab(/^export$/);
    expect(document.querySelector('[data-postr-export-postr]')).toBeNull();
    expect(sideText()).not.toMatch(/Backup file|\.postr/i);
    expect(findButton('Save PDF'), 'Save PDF stays').toBeDefined();
    expect(document.querySelector('[data-postr-export-pptx]'), 'PowerPoint stays').not.toBeNull();
  });
});

describe('the adjustments are hidden (ADJUSTMENTS_ENABLED, D4)', () => {
  it('the layout tab has no Show grid, and the canvas draws no grid', async () => {
    await openEditor();
    await tab(/^layout$/);
    expect(sideLabels(/Show grid/)).toEqual([]);
    expect(document.querySelector('[data-postr-overlay="grid"]')).toBeNull();
    expect(sideText()).not.toMatch(/visual aid/i);
  });

  it('the style tab keeps palette, font and the four sizes, and nothing else', async () => {
    await openEditor();
    await tab(/^style$/);
    expect(sideButtons(/Copy a design/)).toEqual([]);
    expect(sideButtons(/Create custom palette/)).toEqual([]);
    expect(sideText()).not.toMatch(/Save as style preset|Your palettes|Headings?Border/i);
    expect(side().querySelector('input[placeholder="e.g. Smith Lab Green"]')).toBeNull();
    expect(sideButtons(/^(None|Box|Thick)$/), 'heading border styles').toEqual([]);
    expect(selectWithOption('800'), 'weight menus').toEqual([]);
    expect(side().querySelectorAll('button[aria-pressed]').length, 'italic toggles').toBe(0);
    expect(side().querySelectorAll('input[title^="Line height"]').length, 'line heights').toBe(0);
    // Kept: the theme and the size of each level.
    expect(sideButtons(/Classic Academic/).length).toBe(1);
    expect(selectWithOption('Source Sans 3').length, 'the font').toBe(1);
    expect(side().querySelectorAll('input[title="Font size (points)"]').length, 'the four sizes').toBe(4);
  });

  it('a text block selected: no font controls and no second text box, one line naming its level', async () => {
    await openEditor();
    await select('b1');
    expect(side().querySelector('[contenteditable]'), 'the Content box').toBeNull();
    expect(side().querySelector('input[title="Font size (points)"]')).toBeNull();
    expect(selectWithOption('800')).toEqual([]);
    expect(side().querySelector('input[type="range"]'), 'line spacing').toBeNull();
    expect(side().querySelector('input[type="color"]'), 'text colour').toBeNull();
    expect(sideButtons(/Reset to palette/)).toEqual([]);
    expect(sideText()).toMatch(/Body text · 130 pt/);
  });

  it('the format bar keeps B, I, U, bullets, numbered and Clear, and nothing else', () => {
    render(<FormatToolbarButtons />);
    const titles = Array.from(document.querySelectorAll('button')).map((b) => b.getAttribute('title'));
    expect(titles).toEqual(['B', 'I', 'U', '•', '1.', 'Clear formatting']);
  });

  it('an image selected: no crop, rotate, stretch, caption position, spacing or Format; Show caption instead', async () => {
    await openEditor();
    await select('im1');
    const frame = blockEl('im1');
    expect(frame.querySelector('button[title="Replace image"]'), 'precondition: the handle row is drawn').not.toBeNull();
    expect(frame.querySelector('button[title="Crop image"]')).toBeNull();
    expect(frame.querySelectorAll('button[title^="Drag to rotate"]').length).toBe(0);
    await tab(/^edit block$/);
    expect(sideLabels(/Stretch to fit block/)).toEqual([]);
    expect(sideButtons(/^(Top|Bottom|Left|Right|Hide)$/)).toEqual([]);
    expect(sideText()).not.toMatch(/Caption spacing|Format note|Note formatted|✂︎ Crop/);
    expect(side().querySelector('input[type="range"]')).toBeNull();
    const show = sideLabels(/Show caption/)[0]?.querySelector('input');
    expect(show, 'Show caption').toBeTruthy();
    expect(show!.checked).toBe(true);
    fireEvent.click(show!);
    await nextTask();
    expect(doc().blocks.find((b) => b.id === 'im1')!.captionPosition).toBe('none');
    fireEvent.click(sideLabels(/Show caption/)[0]!.querySelector('input')!);
    await nextTask();
    expect(doc().blocks.find((b) => b.id === 'im1')!.captionPosition).toBe('top');
  });

  it('an image selected, the Figure tab: no Scan image, and Check a figure stays', async () => {
    await openEditor();
    await select('im1');
    await tab(/^figure$/);
    expect(sideButtons(/Scan image/)).toEqual([]);
    expect(sideButtons(/Check a figure/).length).toBe(1);
  });

  it('a logo selected: no stretch and no crop hint', async () => {
    await openEditor();
    await select('lg1');
    await tab(/^edit block$/);
    expect(sideLabels(/Stretch to fit block/)).toEqual([]);
    expect(sideText()).not.toMatch(/✂︎|crop/i);
    expect(blockEl('lg1').querySelector('button[title="Crop image"]')).toBeNull();
    expect(sideText()).toMatch(/press its Replace button to choose another\./);
  });

  it('an empty logo selected (Insert › Logo): the note asks to choose one, not "another" (review round 1, R1-06)', async () => {
    const d = makeFixture();
    load({ ...d, blocks: d.blocks.map((b) => (b.id === 'lg1' ? { ...b, imageSrc: null } : b)) } as PosterDoc);
    renderEditor();
    await nextTask();
    await select('lg1');
    await tab(/^edit block$/);
    expect(sideText()).toMatch(/press its Replace button to choose one\./);
    expect(sideText()).not.toMatch(/another/);
  });

  it('a table selected: no border styles or Format; Rows and Columns stay; the tips name no hidden control', async () => {
    await openEditor();
    await select('tb1');
    await tab(/^edit block$/);
    expect(sideButtons(/^(None|APA 3-Line|All Lines|H-Lines|Header Box|Custom)$/)).toEqual([]);
    expect(sideText()).not.toMatch(/Border Style|Format table|Table formatted|header strip|Drag column borders|Caption position/);
    expect(side().querySelectorAll('button[title="Add row at bottom"], button[title="Add column at right"]').length).toBe(2);
  });

  it('a table on the canvas: no row or column strips, no border drag, no hover "+", no right-click menu', async () => {
    await openEditor();
    await select('tb1');
    const table = blockEl('tb1');
    expect(table.querySelectorAll('[aria-label^="Select row"], [aria-label^="Select column"]').length).toBe(0);
    expect(table.querySelectorAll('[title="Drag to resize column"]').length).toBe(0);
    const last = Array.from(table.querySelectorAll('td')).pop()!;
    fireEvent.mouseEnter(last);
    await nextTask();
    expect(table.querySelectorAll('button[title="Add row"], button[title="Add column"]').length).toBe(0);
    const menu = fireEvent.contextMenu(last);
    await nextTask();
    expect(menu, 'the browser\'s own menu shows: the event is not cancelled').toBe(true);
    expect(document.body.textContent).not.toMatch(/Insert row above/);
  });

  it('Insert › Table makes an APA 3-line table', async () => {
    await openEditor();
    await tab(/^insert$/);
    fireEvent.click(findButton('Table')!);
    await nextTask();
    const tables = doc().blocks.filter((b) => b.type === 'table' && b.id !== 'tb1');
    expect(tables.map((b) => b.tableData?.borderPreset)).toEqual(['apa']);
  });

  it('the references tab has no style menu; the references show in APA 7', async () => {
    await openEditor();
    await tab(/^references$/);
    expect(selectWithOption('Vancouver')).toEqual([]);
    // Pasted references keep their own text ("your existing APA / Vancouver /
    // in-house formatting is preserved" stays true); no style is offered.
    expect(sideText()).not.toMatch(/(Vancouver|IEEE)( and \w+)? styles?|Harvard|Display/);
    expect(findButton('Import .bib / .ris'), 'import stays').toBeDefined();
    expect(blockEl('rf1').textContent).toMatch(/Doe, J\. \(2020\)\. A sample study\./);
  });
});

describe('the editor extras are hidden (EDITOR_EXTRAS_ENABLED, D4)', () => {
  it('no guidelines panel and no button that opens it', async () => {
    await openEditor();
    expect(document.querySelector('[data-postr-guidelines]')).toBeNull();
    expect(document.querySelector('[data-postr-guidelines-toggle]')).toBeNull();
  });

  it('a window 1280 px wide (where the panel used to start closed): no button that opens it either', async () => {
    vi.restoreAllMocks();
    stubScreen({ width: 1000, height: 640 }, 1280);
    await openEditor();
    expect(document.querySelector('[data-postr-guidelines-toggle]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/poster guidelines/i);
  });

  it('no Duplicate inside the editor', async () => {
    await openEditor();
    expect(document.querySelector('button[title="Duplicate this poster"]')).toBeNull();
  });

  it('the export tab has no Staples help, and the layout tab does not name it', async () => {
    await openEditor();
    await tab(/^export$/);
    expect(sideText()).not.toMatch(/Staples/);
    await tab(/^layout$/);
    expect(sideText()).not.toMatch(/Staples/);
  });

  it('the layout tab\'s export hint names what the Export tab offers, in one list (review round 1, R1-06)', async () => {
    await openEditor();
    await tab(/^layout$/);
    expect(sideText()).toMatch(/Head to the Export tab to preview, save a PDF or export to PowerPoint\./);
    expect(sideText()).not.toMatch(/to preview, or/);
  });
});
