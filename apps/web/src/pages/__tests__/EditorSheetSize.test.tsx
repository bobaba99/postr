/**
 * Fix 02, cause A — opening a poster whose saved size is unusable repairs it.
 *
 * The editor used to draw every size through a preset lookup that fell back
 * to 48×36, which hid a stored size that was missing or not a number. Drawn
 * as stored, such a size is NaN, and Auto-Arrange then deleted every body
 * block. The load path now repairs the size, so print, export and autosave
 * get real numbers too. Engineering record: docs/fixes/02-poster-size.md.
 *
 * Re-run: npx vitest run src/pages/__tests__/EditorSheetSize.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

// The editor tree is not under test here; the page's load path is.
vi.mock('@/poster/PosterEditor', () => ({ PosterEditor: () => <div data-testid="poster-editor" /> }));
vi.mock('@/hooks/useTwoTabGuard', () => ({
  useTwoTabGuard: () => ({ collision: false, tabId: 't', dismiss: vi.fn() }),
}));
vi.mock('@/hooks/useLeaveGuard', () => ({
  useLeaveGuard: () => ({ armed: false, leaveModalOpen: false, requestLeave: vi.fn(() => false), confirmLeave: vi.fn(), cancelLeave: vi.fn() }),
}));
const row = vi.hoisted(() => ({ data: {} as Record<string, unknown>, width_in: 48 as unknown, height_in: 36 as unknown }));
vi.mock('@/data/posters', async (orig) => ({
  ...(await orig<typeof import('@/data/posters')>()),
  loadPoster: vi.fn(async (id: string) => ({ id, title: 'Lab meeting draft v3', width_in: row.width_in, height_in: row.height_in, data: row.data })),
  loadPosterBySlug: vi.fn(async () => ({ id: 'p1', title: 'Lab meeting draft v3', width_in: row.width_in, height_in: row.height_in, data: row.data })),
}));

import Editor from '../Editor';
import Share from '../Share';
import { usePosterStore } from '@/stores/posterStore';

function storedDoc(size: Record<string, unknown>) {
  return {
    version: 1,
    blocks: [{ id: 'b1', type: 'text', x: 20, y: 20, w: 200, h: 40, content: 'Our words.', imageSrc: null, imageFit: 'contain', tableData: null }],
    fontFamily: 'Source Sans 3',
    palette: { bg: '#ffffff', primary: '#1a1a26', accent: '#7c6aed', accent2: '#4a6cf7', muted: '#6b7280', headerBg: '#f3f4f6', headerFg: '#1a1a26' },
    styles: {
      title: { size: 60, weight: 700, italic: false, lineHeight: 1.1, color: null, highlight: null },
      heading: { size: 28, weight: 700, italic: false, lineHeight: 1.2, color: null, highlight: null },
      authors: { size: 22, weight: 400, italic: false, lineHeight: 1.3, color: null, highlight: null },
      body: { size: 18, weight: 400, italic: false, lineHeight: 1.4, color: null, highlight: null },
    },
    headingStyle: { border: 'bottom', fill: false, align: 'left' },
    institutions: [],
    authors: [],
    references: [],
    ...size,
  };
}

async function open(size: Record<string, unknown>, columns: [unknown, unknown] = [48, 36], blocks?: unknown[]) {
  row.data = { ...storedDoc(size), ...(blocks ? { blocks } : {}) };
  [row.width_in, row.height_in] = columns;
  render(
    // The page reads the poster id from the route, as it does in the app.
    <MemoryRouter initialEntries={['/p/p1']}>
      <Routes>
        <Route path="/p/:posterId" element={<Editor />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(usePosterStore.getState().posterId).toBe('p1'));
  return usePosterStore.getState().doc!;
}

beforeEach(() => {
  usePosterStore.setState({ posterId: null, doc: null });
});

describe('opening a poster repairs an unusable saved size', () => {
  it.each([
    ['missing', {}],
    ['not numbers', { widthIn: 'abc', heightIn: null }],
    ['zero and negative', { widthIn: 0, heightIn: -5 }],
  ])('size %s becomes the default 48 × 36 in', async (_label, size) => {
    const doc = await open(size);
    expect([doc.widthIn, doc.heightIn]).toEqual([48, 36]);
  });

  it('a usable custom size is kept exactly, even a small one (a PowerPoint slide)', async () => {
    const doc = await open({ widthIn: 13.33, heightIn: 7.5 });
    expect([doc.widthIn, doc.heightIn]).toEqual([13.33, 7.5]);
  });

  it('a size stored as numeric strings becomes numbers', async () => {
    const doc = await open({ widthIn: '30', heightIn: '40' });
    expect([doc.widthIn, doc.heightIn]).toEqual([30, 40]);
  });
});

describe('the repair prefers the row\'s own size, and happens before an empty poster is laid out', () => {
  it('a poster whose data lost its size takes the row\'s valid size, not the default', async () => {
    const doc = await open({}, [30, 40]);
    expect([doc.widthIn, doc.heightIn]).toEqual([30, 40]);
  });

  it('an invalid row size falls through to the default', async () => {
    const doc = await open({}, [0, 'abc']);
    expect([doc.widthIn, doc.heightIn]).toEqual([48, 36]);
  });

  it('an empty poster with no size is laid out on the repaired sheet (no NaN blocks)', async () => {
    const doc = await open({}, [null, null], []);
    expect(doc.blocks.length, 'the starter layout').toBeGreaterThan(0);
    const bad = doc.blocks.filter((b) => ![b.x, b.y, b.w, b.h].every(Number.isFinite));
    expect(bad.map((b) => b.id)).toEqual([]);
  });
});

describe('the share page draws the same size as the editor (final review, RF-4)', () => {
  // A share link and the owner's editor showed one poster at two sizes when
  // its data had lost its size: only the Editor used the row's own columns.
  it('a poster whose data lost its size takes the row\'s valid size on the share page too', async () => {
    row.data = storedDoc({});
    [row.width_in, row.height_in] = [30, 40];
    render(
      <MemoryRouter initialEntries={['/s/abc']}>
        <Routes>
          <Route path="/s/:slug" element={<Share />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(usePosterStore.getState().posterId).toBe('p1'));
    const doc = usePosterStore.getState().doc!;
    expect([doc.widthIn, doc.heightIn]).toEqual([30, 40]);
  });
});
