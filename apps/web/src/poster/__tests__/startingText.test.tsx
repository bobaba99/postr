/**
 * Record 29, part 2 — starting text (docs/launch/mvp-editor/bounded-designs.md
 * §3.1 rules 5 and 6, §3.12; docs/fixes/29-mvp-simplify.md).
 *
 * A new poster and a new block start empty: the title, the template's text
 * blocks and Insert's text and heading store no text, and show a grey
 * prompt instead, as PowerPoint's "Click to add text" does. A template's
 * headings keep their section names (they are labels). A template text
 * block's prompt is its old guidance sentence, held in the block's `prompt`
 * field, never in its text; the title's prompt is "Poster title"; the sample
 * table keeps its header labels, its made-up results become empty cells,
 * and its first body cell shows the table's prompt while every body cell is
 * empty. Issues lists an empty heading or text block (info), a block still
 * holding template or Insert text (info; compared with the old strings, so
 * an older poster is covered), and a table whose cells are all still the
 * old sample (warning). An older poster keeps its stored text.
 *
 * Entered where a user enters: the editor page opening a new (empty)
 * poster, the layout tab's templates, the Insert tab, typing in a block,
 * the Issues tab. jsdom applies no stylesheet: that the prompt is drawn
 * grey and never printed is measured in a browser by
 * scripts/simplify-check.mjs (claims T5, T6, T7, T8); here the attributes
 * the stylesheet reads are checked.
 *
 * Re-run: npx vitest run src/poster/__tests__/startingText.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { Block, PosterDoc } from '@postr/shared';

vi.setConfig({ testTimeout: 20_000 });

const authSpies = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: { id: 'owner' } } })),
  getSession: vi.fn(async () => ({ data: { session: { user: { id: 'owner' } } } })),
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
const row = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));
vi.mock('@/data/posters', async (orig) => ({
  ...(await orig<typeof import('@/data/posters')>()),
  loadPoster: vi.fn(async (id: string) => ({ id, user_id: 'owner', title: 'Lab meeting draft v3', width_in: 48, height_in: 36, data: row.data })),
  upsertPoster: vi.fn(async () => ({})),
}));
vi.mock('@/data/thumbnails', () => ({ captureThumbnail: vi.fn(async () => null) }));
vi.mock('@/hooks/useTwoTabGuard', () => ({ useTwoTabGuard: () => ({ collision: false, tabId: 't', dismiss: vi.fn() }) }));
vi.mock('@/motion/timelines/editorEntrance', () => ({ editorEntrance: vi.fn() }));
vi.mock('@/motion/timelines/blockSelection', () => ({ blockSelection: vi.fn() }));

import Editor from '@/pages/Editor';
import { usePosterStore } from '@/stores/posterStore';
import { ACK_BLOCK_ID } from '@/export/ackBlock';
import { NoopResizeObserver, confirmButton, dialog, findButton, nextTask, openTab, q } from './editorKit';

/** What main stored before record 29 (templates.ts, PosterEditor.tsx at 21e6671). */
const OLD = {
  title: 'Your Poster Title',
  insertText: 'Enter your text here.',
  insertHeading: 'Section Title',
  guidance: [
    'Background and research question. Provide context, motivation, and the gap your work addresses.',
    'State your specific hypotheses or research aims here.',
    'Participants, design, materials, procedure, and analysis approach.',
    'Key findings, implications, and future directions.',
  ],
  sample: ['Measure', 'M (SD)', '𝑝', 'DV 1', '4.2 (0.8)', '< .01', 'DV 2', '3.1 (1.1)', '.03', 'DV 3', '2.8 (0.6)', '.12'],
};

const STYLES = {
  title: { size: 14, weight: 700, italic: false, lineHeight: 1.1, color: null, highlight: null },
  heading: { size: 8, weight: 700, italic: false, lineHeight: 1.2, color: null, highlight: null },
  authors: { size: 5, weight: 400, italic: false, lineHeight: 1.3, color: null, highlight: null },
  body: { size: 5, weight: 400, italic: false, lineHeight: 1.4, color: null, highlight: null },
};
function storedDoc(blocks: unknown[]): Record<string, unknown> {
  return {
    version: 1, widthIn: 48, heightIn: 36, blocks, fontFamily: 'Source Sans 3',
    palette: { bg: '#ffffff', primary: '#1a1a26', accent: '#7c6aed', accent2: '#4a6cf7', muted: '#6b7280', headerBg: '#f3f4f6', headerFg: '#1a1a26' },
    styles: STYLES, headingStyle: { border: 'bottom', fill: false, align: 'left' },
    institutions: [], authors: [{ id: 'a1', name: 'Jane Doe', affiliationIds: [] }], references: [],
  };
}

/** Open the editor page on a stored poster, as a user opens /p/<id>. */
async function open(blocks: unknown[]) {
  row.data = storedDoc(blocks);
  render(
    <MemoryRouter initialEntries={['/p/p1']}>
      <Routes>
        <Route path="/p/:posterId" element={<Editor />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(q('#poster-canvas [data-block-id]')).not.toBeNull());
  await nextTask();
}
const doc = () => usePosterStore.getState().doc as PosterDoc;
const userBlocks = () => doc().blocks.filter((b) => b.id !== ACK_BLOCK_ID);
const plain = (html: string | undefined) => (html ?? '').replace(/<[^>]+>/g, '').trim();
const editableOf = (id: string) => q<HTMLElement>(`#poster-canvas [data-block-id="${id}"] [contenteditable]`);

beforeEach(() => {
  usePosterStore.setState({ posterId: null, doc: null });
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a new poster starts empty, with prompts', () => {
  it('the title and the text blocks store no text; the headings keep their section names', async () => {
    await open([]);
    const blocks = userBlocks();
    const title = blocks.find((b) => b.type === 'title')!;
    expect(plain(title.content)).toBe('');
    const texts = blocks.filter((b) => b.type === 'text');
    expect(texts.length, 'precondition: the 3-column template').toBe(4);
    expect(texts.map((b) => plain(b.content))).toEqual(['', '', '', '']);
    expect(blocks.filter((b) => b.type === 'heading').map((b) => plain(b.content))).toEqual(['Introduction', 'Hypotheses', 'Methods', 'Results', 'Conclusions']);
  });

  it('each template text block holds its guidance sentence as its prompt, not as its text', async () => {
    await open([]);
    const texts = userBlocks().filter((b) => b.type === 'text');
    expect(texts.map((b) => b.prompt)).toEqual(OLD.guidance);
    for (const b of texts) {
      const el = editableOf(b.id);
      expect(el.getAttribute('data-placeholder')).toBe(b.prompt);
      expect(el.hasAttribute('data-empty'), `${b.id} is drawn empty`).toBe(true);
      expect(el.textContent).toBe('');
    }
  });

  it('the title shows "Poster title" as its prompt', async () => {
    await open([]);
    const title = userBlocks().find((b) => b.type === 'title')!;
    const el = editableOf(title.id);
    expect(el.getAttribute('data-placeholder')).toBe('Poster title');
    expect(el.hasAttribute('data-empty')).toBe(true);
  });

  it('the sample table keeps its header labels, has empty body cells, and its first body cell shows the prompt', async () => {
    await open([]);
    const table = userBlocks().find((b) => b.type === 'table')!;
    const cells = table.tableData!.cells;
    expect(cells.slice(0, 3)).toEqual(OLD.sample.slice(0, 3));
    expect(cells.slice(3)).toEqual(Array(9).fill(''));
    const tds = Array.from(document.querySelectorAll(`#poster-canvas [data-block-id="${table.id}"] td [contenteditable]`));
    const prompted = tds.filter((el) => el.hasAttribute('data-placeholder'));
    expect(prompted.length).toBe(1);
    expect(prompted[0]).toBe(tds[3]);
    expect(prompted[0]!.getAttribute('data-placeholder')).toBe(table.prompt);
    expect(prompted[0]!.hasAttribute('data-empty')).toBe(true);
  });

  it('the table\'s prompt goes once a body cell holds text, and comes back when the body is empty again', async () => {
    await open([]);
    const table = userBlocks().find((b) => b.type === 'table')!;
    const cells = () => Array.from(document.querySelectorAll<HTMLElement>(`#poster-canvas [data-block-id="${table.id}"] td [contenteditable]`));
    const typeInCell = async (i: number, html: string) => {
      const el = cells()[i]!;
      el.innerHTML = html;
      await act(async () => { fireEvent.input(el); });
      await nextTask();
    };
    await typeInCell(7, '4.2');
    expect(cells().filter((el) => el.hasAttribute('data-placeholder')).length).toBe(0);
    await typeInCell(7, '');
    expect(cells()[3]!.getAttribute('data-placeholder')).toBe(table.prompt);
  });

  it('typing into an empty block drops its prompt; emptying it again brings the prompt back', async () => {
    await open([]);
    const text = userBlocks().find((b) => b.type === 'text')!;
    const el = editableOf(text.id);
    el.innerHTML = 'Our own words';
    await act(async () => { fireEvent.input(el); });
    await nextTask();
    expect(el.hasAttribute('data-empty')).toBe(false);
    el.innerHTML = '<br>';
    await act(async () => { fireEvent.input(el); });
    await nextTask();
    expect(el.hasAttribute('data-empty'), 'a lone <br> left by the browser counts as empty').toBe(true);
  });

  it('no template guidance, title or sample number is stored anywhere in the new poster', async () => {
    await open([]);
    const stored = JSON.stringify(userBlocks().map((b) => [b.content, b.tableData?.cells, b.caption, b.note]));
    for (const s of [OLD.title, ...OLD.guidance, '4.2 (0.8)', '< .01', 'DV 1']) expect(stored).not.toContain(s);
  });
});

describe('every template applied from the layout tab stores no guidance text', () => {
  it.each(['2-Col Wide Figure', 'Billboard', 'Sidebar + Focus', 'Blank', '3-Column Classic'])('%s', async (name) => {
    await open([]);
    await act(async () => { openTab(/^layout$/); });
    fireEvent.click(findButton(name)!);
    await nextTask();
    const box = dialog(/Replace/i);
    if (box) {
      fireEvent.click(confirmButton(box)!);
      await nextTask();
    }
    const blocks = userBlocks();
    expect(blocks.find((b) => b.type === 'title')!.content).toBe('');
    for (const b of blocks.filter((x) => x.type === 'text')) {
      expect(plain(b.content), `${b.id}`).toBe('');
      expect(b.prompt, `${b.id} has a prompt`).toBeTruthy();
    }
  });
});

describe('Insert › + Text and Insert › + Heading make empty blocks with prompts', () => {
  // findButton reads a label without its leading "+ ".
  it.each([['Text', 'text', 'Type here… (type / for symbols)'], ['Heading', 'heading', 'Section Heading']] as const)(
    '%s',
    async (label, type, prompt) => {
      await open([]);
      const before = new Set(doc().blocks.map((b) => b.id));
      await act(async () => { openTab(/^insert$/); });
      fireEvent.click(findButton(label)!);
      await nextTask();
      const added = doc().blocks.find((b) => !before.has(b.id))!;
      expect(added.type).toBe(type);
      expect(added.content).toBe('');
      const el = editableOf(added.id);
      expect(el.getAttribute('data-placeholder')).toBe(prompt);
      expect(el.hasAttribute('data-empty')).toBe(true);
    },
  );
});

/** Issues rows: category and message of each. */
async function issueRows() {
  await act(async () => { openTab(/^issues/); });
  await nextTask();
  const side = q<HTMLElement>('[data-postr-sidebar]');
  return Array.from(side.querySelectorAll('button'))
    .map((b) => Array.from(b.children).map((c) => (c.textContent ?? '').trim()))
    .filter((p) => p.length >= 2 && p[0] && p[1])
    .map(([category, message]) => ({ category: category!, message: message! }));
}

const base = { imageSrc: null, imageFit: 'contain', tableData: null };
const blk = (id: string, type: Block['type'], content: string, extra: Partial<Block> = {}) => ({ ...base, id, type, x: 20, y: 20, w: 140, h: 40, content, ...extra });

describe('Issues lists the starting text left in place', () => {
  it('an empty heading or text block: "Empty block: type in it or delete it." (info)', async () => {
    await open([blk('t', 'title', 'Our title'), blk('h', 'heading', ''), blk('e', 'text', ''), blk('own', 'text', 'Our words.')]);
    const rows = (await issueRows()).filter((r) => r.message === 'Empty block: type in it or delete it.');
    expect(rows.length).toBe(2);
  });

  it('an older poster: template guidance and Insert text are listed, and so is the sample table; its stored text is kept', async () => {
    const blocks = [
      blk('t', 'title', OLD.title),
      blk('g1', 'text', OLD.guidance[0]!),
      blk('g2', 'text', `<p>${OLD.guidance[2]!}</p>`),
      blk('i1', 'text', OLD.insertText),
      blk('i2', 'heading', OLD.insertHeading),
      blk('h', 'heading', 'Introduction'),
      blk('own', 'text', 'Our words about the results.'),
      blk('tab', 'table', '', { tableData: { rows: 4, cols: 3, cells: OLD.sample, colWidths: null, borderPreset: 'apa' } }),
      blk('tab2', 'table', '', { tableData: { rows: 4, cols: 3, cells: [...OLD.sample.slice(0, 11), '.15'], colWidths: null, borderPreset: 'apa' } }),
    ];
    await open(blocks);
    const rows = await issueRows();
    const template = rows.filter((r) => r.message === "This block still has the template's text.");
    expect(template.length, 'g1, g2, i1 and i2; not the heading "Introduction" or our words').toBe(4);
    const sample = rows.filter((r) => r.message === 'This table still has the sample numbers.');
    expect(sample.length, 'the untouched sample table only').toBe(1);
    expect(rows.some((r) => /default placeholder/.test(r.message)), 'the default title row stays').toBe(true);
    expect(rows.some((r) => /Enter your text here/.test(r.message)), 'one row per block, not two').toBe(false);
    for (const b of blocks) {
      const now = doc().blocks.find((x) => x.id === b.id)!;
      expect(now.content, `${b.id} keeps its text`).toBe(b.content);
    }
  });

  it('the severities: empty and template blocks are suggestions, the sample table a warning', async () => {
    await open([blk('t', 'title', 'Our title'), blk('e', 'text', ''), blk('g', 'text', OLD.guidance[1]!),
      blk('tab', 'table', '', { tableData: { rows: 4, cols: 3, cells: OLD.sample, colWidths: null, borderPreset: 'apa' } })]);
    await issueRows();
    const side = q<HTMLElement>('[data-postr-sidebar]').textContent ?? '';
    const warnings = side.slice(side.indexOf('Warnings'), side.indexOf('Suggestions'));
    const infos = side.slice(side.indexOf('Suggestions'));
    expect(warnings).toMatch(/This table still has the sample numbers\./);
    expect(infos).toMatch(/Empty block: type in it or delete it\./);
    expect(infos).toMatch(/This block still has the template's text\./);
  });
});
