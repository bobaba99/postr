/**
 * Plan item 7, the same cause in the sibling panels: text a user is still
 * writing in a sidebar panel survives a tab change and a click on a block
 * (which changes the tab), for the rest of the session. Engineering record:
 * docs/fixes/07-figure-script-kept.md, section 6.
 *
 * Owner decision (2026-10-06): the Authors paste box, the References paste
 * box and manual-entry fields, the Make-a-figure table draft and ladder
 * progress, the Layout poster-name draft and the version name are kept in
 * memory only, per poster: nothing is written to browser storage, and a
 * reload starts them empty.
 *
 * Entry points are the user's: typing, clicks on the rail and on a text
 * block. A reload is every module loaded again. Opening another poster in
 * the mounted editor is the store's setPoster, which is what the editor
 * page calls when it opens one.
 *
 * Re-run: npx vitest run src/poster/__tests__/sidebarDraftsKept.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => {
  const chain = {
    eq: () => chain,
    order: () => Promise.resolve({ data: [], error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  return {
    supabase: {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
        getSession: vi.fn(async () => ({ data: { session: null } })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      },
      from: () => ({ select: () => chain }),
      storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) },
    },
  };
});
vi.mock('@/data/posters', async (orig) => ({
  ...(await orig<typeof import('@/data/posters')>()),
  upsertPoster: vi.fn(async () => ({})),
}));
vi.mock('@/data/thumbnails', () => ({ captureThumbnail: vi.fn(async () => null) }));
// The author and reference parsers' server call: held until a test answers it.
const api = vi.hoisted(() => ({ postJson: vi.fn() }));
vi.mock('@/lib/apiClient', async (orig) => ({
  ...(await orig<typeof import('@/lib/apiClient')>()),
  postJson: api.postJson,
}));
// A workbook with two sheets, as read-excel-file returns it.
vi.mock('@/charts/parseExcel', async (orig) => ({
  ...(await orig<typeof import('@/charts/parseExcel')>()),
  readExcelFile: vi.fn(async () => ({
    ok: true,
    sheets: [
      { name: 'Sheet A', grid: [['Group', 'Score'], ['A', 4], ['B', 7]] },
      { name: 'Sheet B', grid: [['Group', 'Score'], ['C', 5], ['D', 6]] },
    ],
  })),
}));

// A .postr imported over the open poster: its document and its own name.
const imported = vi.hoisted(() => ({ title: 'Imported poster' }));
vi.mock('@/import/postrFile', async (orig) => ({
  ...(await orig<typeof import('@/import/postrFile')>()),
  importPostr: vi.fn(async () => {
    const { makeDoc } = await import('./editorKit');
    return { doc: makeDoc(), title: imported.title, hashMatch: true };
  }),
}));

type Kit = typeof import('./editorKit');
type Rtl = typeof import('@testing-library/react');

const MARK = 'ZQ7MARK';
let k: Kit;
let rtl: Rtl;
let view: { unmount: () => void } | null = null;

async function pageLoad(posterId = 'fixture-1') {
  view?.unmount();
  view = null;
  vi.resetModules();
  k = await import('./editorKit');
  rtl = await import('@testing-library/react');
  const { usePosterStore } = await import('@/stores/posterStore');
  usePosterStore.getState().setPoster(posterId, k.makeDoc(), k.NAME);
  view = k.renderEditor();
  await k.nextTask();
}
async function openPosterInPlace(posterId: string) {
  const { usePosterStore } = await import('@/stores/posterStore');
  rtl.act(() => {
    usePosterStore.getState().setPoster(posterId, k.makeDoc(), k.NAME);
  });
  await k.nextTask();
}
async function tab(label: RegExp) {
  k.openTab(label);
  await k.nextTask();
}
async function type(el: Element | null, value: string) {
  if (!el) throw new Error('no field to type in');
  rtl.fireEvent.change(el, { target: { value } });
  await k.nextTask();
}
/** A click on a text block: the sidebar moves to Edit block. */
async function clickTextBlock() {
  await k.click(k.q('[data-block-id="b1"]'), 'text block b1');
}
const field = <T extends Element>(sel: string) => k.q<T>(sel) as unknown as HTMLInputElement | null;
function storedCopies(): string[] {
  const hits: string[] = [];
  for (const s of [localStorage, sessionStorage]) {
    for (let i = 0; i < s.length; i += 1) {
      const key = s.key(i)!;
      if ((s.getItem(key) ?? '').includes(MARK)) hits.push(key);
    }
  }
  return hits;
}

const authorsBox = () => field('textarea[placeholder^="John Smith"]');
const refsBox = () => field('textarea[placeholder^="Smith, J. (2023)"]');
const manualAuthors = () => field('input[placeholder^="Authors, comma-separated"]');
const manualTitle = () => field('input[placeholder="Title"]');
const tableBox = () => field('textarea[aria-label="Paste your table"]');
const posterName = () => field('input[aria-label="Poster name"]');
const versionName = () => field('input[placeholder^="Optional name"]');

/** Layout › Import → "Replace poster" → a .postr file → "Replace current poster". */
async function importOverThePoster(title: string) {
  imported.title = title;
  await k.click(k.q('[data-postr-import-tile]'), 'the import tile');
  await k.click(k.findButton('Replace poster'), 'Replace poster');
  const input = k.q<HTMLInputElement>('input[type="file"][accept*=".postr"]') ??
    Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]')).at(-1)!;
  rtl.fireEvent.change(input, { target: { files: [new File(['zip'], 'poster.postr')] } });
  await rtl.waitFor(() => expect(k.findButton('Replace current poster')?.disabled).toBe(false));
  await k.click(k.findButton('Replace current poster'), 'Replace current poster');
  await rtl.waitFor(async () => {
    const { usePosterStore } = await import('@/stores/posterStore');
    expect(usePosterStore.getState().posterTitle).toBe(title);
  });
  await k.nextTask();
}

/** The ladder's steps as a screen reader lists them, with each answer. */
const ladderSteps = () =>
  Array.from(document.querySelectorAll('section[aria-label^="Step "]')).map(
    (section) => `${section.getAttribute('aria-label')} ${section.querySelector('h3') ? '(asked)' : section.textContent}`,
  );
/** A table with two columns to compare across (Sex, Site) and one outcome. */
const GROUPED_TABLE =
  'Condition\tSex\tSite\tMean (ms)\nA\tF\tX\t1\nB\tM\tY\t2\nC\tF\tX\t3\nA\tM\tY\t4\nB\tF\tX\t5\nC\tM\tY\t6';
const variableName = (n: number) => field(`input[aria-label="Variable ${n} name"]`);

async function openMake() {
  await tab(/^figure$/i);
  if (k.findButton('Make a figure')?.getAttribute('aria-pressed') !== 'true') {
    await k.click(k.findButton('Make a figure'), 'Make a figure');
  }
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  api.postJson.mockReset();
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  await pageLoad();
});
afterEach(() => {
  view?.unmount();
  view = null;
  vi.unstubAllGlobals();
});

describe('item 7 siblings — drafts survive a click on a block', () => {
  it('the Authors "Paste author list" box', async () => {
    await tab(/^authors$/i);
    await type(authorsBox(), `Jane Doe¹, John Smith² ${MARK}`);
    await clickTextBlock();
    expect(authorsBox()).toBeNull();
    await tab(/^authors$/i);
    expect(authorsBox()?.value).toBe(`Jane Doe¹, John Smith² ${MARK}`);
  });

  it('the References paste box and the manual-entry fields', async () => {
    await tab(/^references$/i);
    await type(refsBox(), `Doe, J. (2024). A sample paper. ${MARK}`);
    await type(manualAuthors(), `Doe J ${MARK}`);
    await type(manualTitle(), 'A sample title');
    await clickTextBlock();
    expect(refsBox()).toBeNull();
    await tab(/^references$/i);
    expect(refsBox()?.value).toBe(`Doe, J. (2024). A sample paper. ${MARK}`);
    expect(manualAuthors()?.value).toBe(`Doe J ${MARK}`);
    expect(manualTitle()?.value).toBe('A sample title');
  });

  it('the Make a figure table being typed', async () => {
    await openMake();
    // A header still waiting for its rows: a blur does not use it yet
    // (DataStep's looksLikeTable), so in a browser too it stays a draft.
    const draft = `Condition\tMean (ms) ${MARK}`;
    await type(tableBox(), draft);
    await clickTextBlock();
    await openMake();
    expect(tableBox()?.value).toBe(draft);
  });

  it('the Make a figure ladder: a pasted table and an answered step stay answered', async () => {
    await openMake();
    rtl.fireEvent.paste(tableBox()!, {
      clipboardData: {
        getData: () => 'Condition\tMean (ms)\tAccuracy (%)\nControl\t512\t91\nPlacebo\t498\t90\nHigh dose\t428\t84',
      },
    });
    await k.nextTask();
    await k.click(k.findButton('Mean (ms)'), 'the outcome column');
    const steps = ladderSteps;
    const progress = steps();
    expect(progress[0]).toContain('3 rows × 3 columns');
    expect(progress[1]).toContain('Mean (ms)');
    expect(progress.length).toBeGreaterThanOrEqual(3);
    await clickTextBlock();
    await openMake();
    expect(tableBox()).toBeNull();
    expect(steps()).toEqual(progress);
  });

  it('the Layout poster-name draft, which is still not saved', async () => {
    await tab(/^layout$/i);
    await type(posterName(), `${k.NAME} ${MARK}`);
    await clickTextBlock();
    await tab(/^layout$/i);
    expect(posterName()?.value).toBe(`${k.NAME} ${MARK}`);
    const { usePosterStore } = await import('@/stores/posterStore');
    expect(usePosterStore.getState().posterTitle).toBe(k.NAME);
  });

  it('guard: a name typed but not saved gives way to the name of a poster imported over this one, as before', async () => {
    await tab(/^layout$/i);
    await type(posterName(), `${k.NAME} ${MARK}`);
    await importOverThePoster('Imported poster');
    expect(posterName()?.value).toBe('Imported poster');
  });

  it('guard: after a save, a poster imported with the old name shows that name, not the saved text', async () => {
    await tab(/^layout$/i);
    await type(posterName(), `${k.NAME} renamed`);
    await k.click(k.findButton('Save'), 'Save');
    const { usePosterStore } = await import('@/stores/posterStore');
    expect(usePosterStore.getState().posterTitle).toBe(`${k.NAME} renamed`);
    await importOverThePoster(k.NAME);
    expect(posterName()?.value).toBe(k.NAME);
  });

  it('the version name', async () => {
    await tab(/^versions$/i);
    await type(versionName(), `before advisor ${MARK}`);
    await clickTextBlock();
    await tab(/^versions$/i);
    expect(versionName()?.value).toBe(`before advisor ${MARK}`);
  });
});

describe('item 7 siblings — per poster, in memory only', () => {
  it('another poster opened in the mounted editor has its own empty drafts, and the first keeps its own', async () => {
    await tab(/^authors$/i);
    await type(authorsBox(), `Jane Doe ${MARK}`);
    await openPosterInPlace('fixture-2');
    await tab(/^authors$/i);
    expect(authorsBox()?.value).toBe('');
    await openPosterInPlace('fixture-1');
    await tab(/^authors$/i);
    expect(authorsBox()?.value).toBe(`Jane Doe ${MARK}`);
  });

  it('another poster opened in the mounted editor does not show the first one\'s paste error', async () => {
    await openMake();
    rtl.fireEvent.paste(tableBox()!, { clipboardData: { getData: () => `just a sentence ${MARK}` } });
    await k.nextTask();
    expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/couldn’t find any rows/);
    await openPosterInPlace('fixture-2');
    await openMake();
    expect(tableBox()?.value).toBe('');
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('nothing is written to browser storage, and a reload starts the drafts empty', async () => {
    await tab(/^authors$/i);
    await type(authorsBox(), `Jane Doe ${MARK}`);
    await tab(/^references$/i);
    await type(refsBox(), `Doe, J. (2024). ${MARK}`);
    await tab(/^layout$/i);
    await type(posterName(), `${k.NAME} ${MARK}`);
    await clickTextBlock();
    expect(storedCopies()).toEqual([]);
    await pageLoad();
    await tab(/^authors$/i);
    expect(authorsBox()?.value).toBe('');
    await tab(/^references$/i);
    expect(refsBox()?.value).toBe('');
    await tab(/^layout$/i);
    expect(posterName()?.value).toBe(k.NAME);
  });

  it('an author list being parsed when the tab changes is still parsing on return, and lands once', async () => {
    let answer: (value: unknown) => void = () => {};
    api.postJson.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    await tab(/^authors$/i);
    await type(authorsBox(), `Jane Doe, John Smith ${MARK}`);
    await k.click(k.findButton('Parse with AI'), 'Parse with AI');
    expect(k.findButton('Parsing…')).toBeDefined();
    await clickTextBlock();
    await tab(/^authors$/i);
    // Still parsing, so it cannot be sent twice; the text is still there.
    expect(k.findButton('Parsing…')?.disabled).toBe(true);
    expect(authorsBox()?.value).toBe(`Jane Doe, John Smith ${MARK}`);
    await rtl.act(async () => {
      answer({ authors: [{ name: 'Jane Doe' }, { name: 'John Smith' }], institutions: [] });
      await Promise.resolve();
    });
    await k.nextTask();
    expect(authorsBox()?.value).toBe('');
    expect(document.body.textContent).toContain('✓ Added 2 authors');
    expect(api.postJson).toHaveBeenCalledTimes(1);
    const { usePosterStore } = await import('@/stores/posterStore');
    expect(usePosterStore.getState().doc!.authors.map((a) => a.name)).toEqual(['Jane Doe', 'Jane Doe', 'John Smith']);
  });

  it('a reference list being parsed when the tab changes is still parsing on return, and lands once', async () => {
    let answer: (value: unknown) => void = () => {};
    api.postJson.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    await tab(/^references$/i);
    await type(refsBox(), `Doe, J. (2024). A sample paper. ${MARK}`);
    await k.click(k.findButton('Parse with AI'), 'Parse with AI');
    await clickTextBlock();
    await tab(/^references$/i);
    expect(k.findButton('Parsing…')?.disabled).toBe(true);
    expect(refsBox()?.value).toBe(`Doe, J. (2024). A sample paper. ${MARK}`);
    await rtl.act(async () => {
      answer({ references: [{ authors: ['Doe, J.'], year: '2024', title: 'A sample paper' }] });
      await Promise.resolve();
    });
    await k.nextTask();
    expect(refsBox()?.value).toBe('');
    expect(document.body.textContent).toContain('✓ Added 1 reference');
    expect(api.postJson).toHaveBeenCalledTimes(1);
  });
});

describe('item 7 siblings — the Make a figure ladder', () => {
  it('columns picked to compare across, not yet used, stay picked', async () => {
    await openMake();
    rtl.fireEvent.paste(tableBox()!, { clipboardData: { getData: () => GROUPED_TABLE } });
    await k.nextTask();
    expect(document.body.textContent).toContain('Compare across which columns?');
    await k.click(k.findButton('Sex'), 'the Sex column');
    expect(k.findButton('Sex')?.getAttribute('aria-pressed')).toBe('true');
    await clickTextBlock();
    await openMake();
    expect(k.findButton('Sex')?.getAttribute('aria-pressed')).toBe('true');
  });

  // Each answer is built on the one before it (a functional update of the
  // session draft); review round 1, R1-02.
  it('two columns picked one after the other, "Use these" and the next answer all stay answered', async () => {
    await openMake();
    rtl.fireEvent.paste(tableBox()!, { clipboardData: { getData: () => GROUPED_TABLE } });
    await k.nextTask();
    await k.click(k.findButton('Sex'), 'the Sex column');
    await k.click(k.findButton('Site'), 'the Site column');
    expect(k.findButton('Sex')?.getAttribute('aria-pressed')).toBe('true');
    expect(k.findButton('Site')?.getAttribute('aria-pressed')).toBe('true');
    await k.click(k.findButton('Use these'), 'Use these');
    await k.click(k.findButton('Difference between groups'), 'the emphasis');
    const progress = ladderSteps();
    expect(progress.join(' | ')).toContain('Sex, Site');
    expect(progress.join(' | ')).toContain('Difference between groups');
    await clickTextBlock();
    await openMake();
    expect(ladderSteps()).toEqual(progress);
  });

  it('two variables named one after the other both stay', async () => {
    await openMake();
    await k.click(k.findButton('List my variables'), 'List my variables');
    await type(variableName(1), `Reaction time ${MARK}`);
    await type(variableName(2), 'Caffeine dose');
    await clickTextBlock();
    await openMake();
    expect(variableName(1)?.value).toBe(`Reaction time ${MARK}`);
    expect(variableName(2)?.value).toBe('Caffeine dose');
  });

  it('the variables being listed', async () => {
    await openMake();
    await k.click(k.findButton('List my variables'), 'List my variables');
    await type(field('input[aria-label="Variable 1 name"]'), `Reaction time ${MARK}`);
    await clickTextBlock();
    await openMake();
    expect(field('input[aria-label="Variable 1 name"]')?.value).toBe(`Reaction time ${MARK}`);
  });

  it('the sheet still to choose from an uploaded workbook', async () => {
    await openMake();
    const upload = k.q<HTMLInputElement>('input[type="file"]');
    rtl.fireEvent.change(upload, { target: { files: [new File(['x'], 'results.xlsx')] } });
    await k.nextTask();
    await k.nextTask();
    expect(k.findButton('Sheet B')).toBeDefined();
    await clickTextBlock();
    await openMake();
    expect(k.findButton('Sheet A')).toBeDefined();
    expect(k.findButton('Sheet B')).toBeDefined();
  });

  it('guard: reopening step 1 after its table was used starts with an empty box, as before', async () => {
    await openMake();
    rtl.fireEvent.paste(tableBox()!, {
      clipboardData: { getData: () => 'Condition\tMean (ms)\nControl\t512\nPlacebo\t498' },
    });
    await k.nextTask();
    expect(tableBox()).toBeNull();
    await k.click(k.findButton('change'), 'change step 1');
    expect(tableBox()?.value).toBe('');
  });

  it('guard: reopening step 1 after a sheet was used does not ask for the sheet again, as before', async () => {
    await openMake();
    const upload = k.q<HTMLInputElement>('input[type="file"]');
    rtl.fireEvent.change(upload, { target: { files: [new File(['x'], 'results.xlsx')] } });
    await k.nextTask();
    await k.nextTask();
    await k.click(k.findButton('Sheet A'), 'Sheet A');
    expect(tableBox()).toBeNull();
    await k.click(k.findButton('change'), 'change step 1');
    expect(tableBox()).not.toBeNull();
    expect(k.findButton('Sheet B')).toBeUndefined();
  });

  it('guard: leaving the variables form starts the next visit with blank rows, as before', async () => {
    await openMake();
    await k.click(k.findButton('List my variables'), 'List my variables');
    await type(field('input[aria-label="Variable 1 name"]'), `Reaction time ${MARK}`);
    await k.click(k.findButton('Back'), 'Back');
    await k.click(k.findButton('List my variables'), 'List my variables');
    expect(field('input[aria-label="Variable 1 name"]')?.value).toBe('');
  });

  it('guard: declaring the variables starts the next visit to the form with blank rows, as before', async () => {
    await openMake();
    await k.click(k.findButton('List my variables'), 'List my variables');
    await type(variableName(1), `Reaction time ${MARK}`);
    await type(variableName(2), 'Caffeine dose');
    await k.click(k.findButton('Show me the figure'), 'Show me the figure');
    expect(ladderSteps()[0]).toContain('1 outcome × 1 factor');
    await k.click(k.findButton('change'), 'change step 1');
    await k.click(k.findButton('List my variables'), 'List my variables');
    expect(variableName(1)?.value).toBe('');
    expect(variableName(2)?.value).toBe('');
  });
});
