/**
 * Record 29 — hide, don't delete (bounded-designs.md §1, principle 6;
 * docs/fixes/29-mvp-simplify.md). With IMPORT_ENABLED, ADJUSTMENTS_ENABLED
 * and EDITOR_EXTRAS_ENABLED turned on, the controls they hide come back:
 * the switches hide them, they do not remove them. The shipped
 * configuration (all three off) is mvpHidden.test.tsx.
 *
 * Re-run: npx vitest run src/poster/__tests__/mvpShown.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent } from '@testing-library/react';
import type { Block, PosterDoc } from '@postr/shared';

vi.mock('@/config/features', async (orig) => ({
  ...(await orig<typeof import('@/config/features')>()),
  IMPORT_ENABLED: true,
  ADJUSTMENTS_ENABLED: true,
  EDITOR_EXTRAS_ENABLED: true,
}));
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

import { NoopResizeObserver, load, makeDoc, nextTask, openTab, q, renderEditor } from './editorKit';
import { stubScreen } from './workspaceKit';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4AWP4z8DwHwyBAMQgYGBgAAB1SQX7nHNiaQAAAABJRU5ErkJggg==';

function makeFixture(): PosterDoc {
  const d = makeDoc(48, 36);
  const base = d.blocks[2]!;
  const extra: Block[] = [
    { ...base, id: 'im1', type: 'image', x: 20, y: 240, w: 120, h: 90, content: '', imageSrc: PNG, caption: 'Our figure' },
    {
      ...base, id: 'tb1', type: 'table', x: 160, y: 240, w: 150, h: 60, content: '',
      tableData: { rows: 3, cols: 3, cells: ['A', 'B', 'C', '1', '2', '3', '4', '5', '6'], colWidths: null, borderPreset: 'apa' },
    } as Block,
  ];
  return { ...d, blocks: [...d.blocks, ...extra] } as PosterDoc;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  stubScreen({ width: 1000, height: 640 });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const side = () => q<HTMLElement>('[data-postr-sidebar]');
const has = (re: RegExp) => re.test(side().textContent ?? '');
async function open() {
  load(makeFixture());
  renderEditor();
  await nextTask();
}
async function tab(label: RegExp) {
  await act(async () => { openTab(label); });
  await nextTask();
}
async function select(id: string) {
  fireEvent.click(q(`#poster-canvas [data-block-id="${id}"]`));
  await nextTask();
}

describe('the switches turned on bring the hidden controls back', () => {
  it('IMPORT_ENABLED: the Import tile and Save as .postr', async () => {
    await open();
    await tab(/^layout$/);
    expect(document.querySelector('[data-postr-import-tile]')).not.toBeNull();
    await tab(/^export$/);
    expect(document.querySelector('[data-postr-export-postr]')).not.toBeNull();
  });

  it('ADJUSTMENTS_ENABLED: grid, style controls, crop and rotate, caption position, borders, table strips, citation styles', async () => {
    await open();
    await tab(/^layout$/);
    expect(has(/Show grid/)).toBe(true);
    expect(document.querySelector('[data-postr-overlay="grid"]')).not.toBeNull();
    await tab(/^style$/);
    expect(has(/Copy a design/) && has(/Create custom palette/) && has(/Save as style preset/)).toBe(true);
    await select('b1');
    expect(side().querySelector('[contenteditable]'), 'the Content box').not.toBeNull();
    await select('im1');
    const frame = q('#poster-canvas [data-block-id="im1"]');
    expect(frame.querySelector('button[title="Crop image"]')).not.toBeNull();
    expect(frame.querySelectorAll('button[title^="Drag to rotate"]').length).toBe(1);
    await tab(/^edit block$/);
    expect(has(/Caption position/) && has(/Stretch to fit block/)).toBe(true);
    await select('tb1');
    await tab(/^edit block$/);
    expect(has(/Border Style/)).toBe(true);
    expect(q('#poster-canvas [data-block-id="tb1"]').querySelectorAll('[aria-label^="Select row"]').length).toBe(3);
    await tab(/^references$/);
    expect(Array.from(side().querySelectorAll('option')).some((o) => o.textContent === 'Vancouver')).toBe(true);
  });

  it('EDITOR_EXTRAS_ENABLED: the guidelines panel or its toggle, Duplicate, and Staples', async () => {
    await open();
    expect(document.querySelector('[data-postr-guidelines], [data-postr-guidelines-toggle]')).not.toBeNull();
    expect(document.querySelector('button[title="Duplicate this poster"]')).not.toBeNull();
    await tab(/^export$/);
    expect(has(/Email the PDF to Staples/)).toBe(true);
  });
});
