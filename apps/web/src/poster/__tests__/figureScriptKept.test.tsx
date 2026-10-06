/**
 * Plan item 7 (FR9) — the editor's plot checker keeps the researcher's
 * script. Engineering record: docs/fixes/07-figure-script-kept.md.
 *
 * Before the fix the checker held the script, its language and the checked
 * table in its own state, and the sidebar unmounts a panel on every tab
 * change (selecting a block is a tab change), so all of it was lost on the
 * way back; and nothing stored it, so a reload lost it too (record section
 * 6). Owner decisions (2026-10-06): the script and its language are kept per
 * poster in this browser and come back after a reload; a restored script
 * runs its check again, so the table comes back; another poster has its own
 * box; the Figure tab stays on Check once a script has been entered.
 *
 * Entry points are the user's: clicks on the rail, the canvas and the
 * checker, and typing in the code box. A page load is modelled as what it
 * is: every module loaded again (nothing kept in memory) with the browser's
 * storage as it was. Opening a different poster is the store's setPoster,
 * which is what the editor page calls when it opens one (pages/Editor.tsx);
 * the browser harness drives the real Duplicate → "Open copy" path
 * (scripts/figure-script-check.mjs, claim L6).
 *
 * Re-run: npx vitest run src/poster/__tests__/figureScriptKept.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block, PosterDoc } from '@postr/shared';

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
// A parser defect, for one marked script only: the checker must survive
// keeping a script it cannot read. The calls are counted: typing after a
// check must not run it again.
const parser = vi.hoisted(() => ({ pythonCalls: 0 }));
vi.mock('@/poster/readability', async (orig) => {
  const real = await orig<typeof import('@/poster/readability')>();
  return {
    ...real,
    parsePythonCode: (code: string, opts: Parameters<typeof real.parsePythonCode>[1]) => {
      parser.pythonCalls += 1;
      if (code.includes('ZQ7THROW')) throw new Error('parser defect');
      return real.parsePythonCode(code, opts);
    },
  };
});

type Kit = typeof import('./editorKit');
type Rtl = typeof import('@testing-library/react');

const MARK = 'ZQ7MARK';
const SCRIPT = [
  `# ${MARK}`,
  'import matplotlib.pyplot as plt',
  "plt.rcParams['font.size'] = 12",
  'fig, ax = plt.subplots(figsize=(8, 6))',
  "ax.set_xlabel('Time (min)')",
  "fig.savefig('figure1.png', dpi=300)",
].join('\n');

/** Base R graphics: R, a system the check does not read (fix 15). */
const BASE_R = ['x <- c(3, 5, 2)', 'plot(x, main = "Counts")', 'abline(h = 2)'].join('\n');
/** R ggplot2 whose only plotnine hint is a string in aes(): Auto cannot place it, a pick of R checks it (fix 15). */
const UNPLACEABLE_GGPLOT =
  'ggplot(votes, aes(x = "", y = share, fill = party)) + geom_col(width = 1) + coord_polar("y")';
const CANNOT_TELL = 'Couldn’t tell R from Python — pick R (ggplot2) or Python (matplotlib).';
const OUT_OF_DATE = 'Out of date: this result is from your last check';

let k: Kit;
let rtl: Rtl;
let view: { unmount: () => void } | null = null;

const codeBox = () => k.q<HTMLTextAreaElement>('textarea[aria-label="Your R or Python plotting code"]');
const pressed = (label: string) => k.findButton(label)?.getAttribute('aria-pressed') === 'true';
const resultTable = () =>
  Array.from(document.querySelectorAll('table')).find((t) => /Element/.test(t.querySelector('thead')?.textContent ?? ''));
const resultRows = () => resultTable()?.querySelectorAll('tbody tr').length ?? 0;
const onFigureTab = () => document.querySelector('[aria-label="Figure tools"]') !== null;
/** The edited script the checker hands back ("Copy edited code" copies this text). */
const editedCode = () =>
  Array.from(document.querySelectorAll('pre')).find((p) => p.textContent?.includes(MARK))?.textContent ?? '';
/** Every browser-storage entry that holds the script, by its text (not its key). */
function storedCopies(): string[] {
  const hits: string[] = [];
  for (const [area, s] of [['localStorage', localStorage], ['sessionStorage', sessionStorage]] as const) {
    for (let i = 0; i < s.length; i += 1) {
      const key = s.key(i)!;
      if ((s.getItem(key) ?? '').includes(MARK)) hits.push(`${area}:${key}`);
    }
  }
  return hits;
}

/** The default test poster plus the block types the auto-route sends elsewhere. */
function posterDoc(extra: Block[] = []): PosterDoc {
  const doc = k.makeDoc();
  const base = { imageSrc: null, imageFit: 'contain' as const, tableData: null, content: '' };
  return {
    ...doc,
    blocks: [
      ...doc.blocks,
      { ...base, id: 'au1', type: 'authors', x: 20, y: 240, w: 210, h: 40 },
      { ...base, id: 'rf1', type: 'references', x: 250, y: 240, w: 210, h: 60 },
      ...extra,
    ] as Block[],
  };
}
const IMAGE: Block = {
  id: 'img1', type: 'image', x: 20, y: 320, w: 120, h: 80, content: '',
  imageSrc: null, imageFit: 'contain', tableData: null,
} as Block;

/**
 * A page load of the editor on `posterId`: every module is loaded again, so
 * nothing the last page held in memory survives; browser storage does.
 */
async function pageLoad(posterId = 'fixture-1', extra: Block[] = []) {
  view?.unmount();
  view = null;
  vi.resetModules();
  k = await import('./editorKit');
  rtl = await import('@testing-library/react');
  const { usePosterStore } = await import('@/stores/posterStore');
  usePosterStore.getState().setPoster(posterId, posterDoc(extra), k.NAME);
  view = k.renderEditor();
  await k.nextTask();
}

/** The editor page opens another poster while the editor stays mounted. */
async function openPosterInPlace(posterId: string) {
  const { usePosterStore } = await import('@/stores/posterStore');
  rtl.act(() => {
    usePosterStore.getState().setPoster(posterId, posterDoc(), k.NAME);
  });
  await k.nextTask();
}

async function openChecker() {
  k.openTab(/^figure$/i);
  await k.nextTask();
  if (!pressed('Check a figure')) await k.click(k.findButton('Check a figure'), 'Check a figure');
}
async function typeScript(text = SCRIPT) {
  rtl.fireEvent.change(codeBox(), { target: { value: text } });
  await k.nextTask();
}
/** FIGURE › Check a figure › Python › the script › ▶ Check. */
async function checkScript() {
  await openChecker();
  await k.click(k.findButton('Python'), 'Python');
  await typeScript();
  await k.click(k.findButton('Check'), 'Check');
  expect(resultRows()).toBeGreaterThan(0);
}
function expectKept(rows: number) {
  expect(codeBox()?.value).toBe(SCRIPT);
  expect(pressed('Python')).toBe(true);
  expect(resultRows()).toBe(rows);
}
async function clickBlock(id: string) {
  await k.click(k.q(`[data-block-id="${id}"]`), `block ${id}`);
}
/** A click on the empty workspace around the sheet: deselects. */
async function clickEmptyCanvas() {
  rtl.fireEvent.pointerDown(k.q('[data-postr-canvas-outer]'), { button: 0, clientX: 5, clientY: 5 });
  rtl.fireEvent.pointerUp(window);
  await k.nextTask();
}

/** jsdom has no PointerEvent; the canvas's own handlers read only these fields. */
class InertPointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal('PointerEvent', InertPointerEvent);
  await pageLoad();
});
afterEach(() => {
  view?.unmount();
  view = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('item 7 — leaving the Figure tab keeps the script', () => {
  it.each([
    [/^layout$/i],
    [/^style$/i],
    [/^authors$/i],
    [/^insert$/i],
    [/^edit block$/i],
    [/^references$/i],
    [/^issues/i],
    [/^versions$/i],
    [/^export$/i],
  ])('a round trip through the %s tab keeps the script, the language and the table', async (tab) => {
    await checkScript();
    const rows = resultRows();
    k.openTab(tab);
    await k.nextTask();
    expect(onFigureTab()).toBe(false);
    await openChecker();
    expectKept(rows);
  });

  it.each([['t1', 'title'], ['h1', 'heading'], ['b1', 'text'], ['au1', 'authors'], ['rf1', 'references']])(
    'selecting the %s block (%s), which moves the sidebar to another tab, and coming back keeps it',
    async (id) => {
      await checkScript();
      const rows = resultRows();
      await clickBlock(id);
      expect(onFigureTab()).toBe(false);
      await openChecker();
      expectKept(rows);
    },
  );

  it('guard: typing after a check does not run the check again (a run button, not a live pad)', async () => {
    await checkScript();
    const table = resultTable()?.textContent;
    const calls = parser.pythonCalls;
    for (const n of [1, 2, 3]) await typeScript(`${SCRIPT}\n# edit ${n}`);
    expect(parser.pythonCalls).toBe(calls);
    expect(resultTable()?.textContent).toBe(table);
  });

  // The table is computed from the kept check's inputs; a Check after an
  // edit must compute it again (review round 1, R1-03).
  it('guard: Check again after an edit shows the edited script\'s table and edited code', async () => {
    await checkScript();
    const table = resultTable()?.textContent;
    const edited = `${SCRIPT.replace("plt.rcParams['font.size'] = 12", "plt.rcParams['font.size'] = 11")}\n# second version`;
    await typeScript(edited);
    expect(editedCode()).not.toContain('# second version');
    await k.click(k.findButton('Check'), 'Check');
    expect(resultTable()?.textContent).not.toBe(table);
    expect(editedCode()).toContain('# second version');
  });

  it('guard: the same script checked again in the other language shows that language\'s table', async () => {
    await checkScript();
    const table = resultTable()?.textContent;
    await k.click(k.findButton('R'), 'R');
    await k.click(k.findButton('Check'), 'Check');
    expect(pressed('R')).toBe(true);
    expect(resultTable()?.textContent).not.toBe(table);
  });

  // Merged with fix 15: Check on code it cannot place, or on a plotting
  // system it does not read, answers so and leaves the result on screen,
  // marked out of date (the owner's answer to item 15). The draft keeps
  // that result, so a tab change and a reload bring it back too. Until the
  // merge this guard pinned main's old behaviour, the table cleared.
  it('Check on text that is neither R nor Python keeps the old table, marked out of date, after a tab round trip and a reload too', async () => {
    await openChecker();
    await typeScript();
    await k.click(k.findButton('Check'), 'Check');
    expect(pressed('Auto')).toBe(true);
    const table = resultTable()?.textContent;
    expect(resultRows()).toBeGreaterThan(0);
    const notes = `${MARK} some notes, not code`;
    await typeScript(notes);
    await k.click(k.findButton('Check'), 'Check');
    expect(document.body.textContent).toContain(CANNOT_TELL);
    expect(resultTable()?.textContent).toBe(table);
    expect(document.body.textContent).toContain(OUT_OF_DATE);
    k.openTab(/^layout$/i);
    await k.nextTask();
    await openChecker();
    expect(codeBox()?.value).toBe(notes);
    expect(resultTable()?.textContent).toBe(table);
    expect(document.body.textContent).toContain(OUT_OF_DATE);
    // The answer was for the press; the line beside Check says what it reads.
    expect(document.body.textContent).not.toContain(CANNOT_TELL);
    expect(document.body.textContent).toContain('Can’t tell R from Python. Pick one above.');
    await pageLoad('fixture-1');
    await openChecker();
    expect(codeBox()?.value).toBe(notes);
    expect(resultTable()?.textContent).toBe(table);
    expect(document.body.textContent).toContain(OUT_OF_DATE);
  });

  it('Check on a plotting system the check does not read, R picked by hand, names it and keeps the old table marked out of date; a reload brings that table back, not one for the new code', async () => {
    await checkScript();
    const table = resultTable()?.textContent;
    await k.click(k.findButton('R'), 'R');
    await typeScript(BASE_R);
    await k.click(k.findButton('Check'), 'Check');
    expect(document.body.textContent).toContain('Not supported yet: base R graphics.');
    expect(resultTable()?.textContent).toBe(table);
    expect(document.body.textContent).toContain(OUT_OF_DATE);
    await pageLoad('fixture-1');
    await openChecker();
    expect(codeBox()?.value).toBe(BASE_R);
    expect(pressed('R')).toBe(true);
    expect(resultTable()?.textContent).toBe(table);
    expect(document.body.textContent).toContain(OUT_OF_DATE);
  });

  it('a check made with R picked on ggplot code Auto cannot place comes back after a reload', async () => {
    await openChecker();
    await typeScript(UNPLACEABLE_GGPLOT);
    expect(document.body.textContent).toContain('Can’t tell R from Python. Pick one above.');
    await k.click(k.findButton('R'), 'R');
    await k.click(k.findButton('Check'), 'Check');
    const table = resultTable()?.textContent;
    expect(resultRows()).toBeGreaterThan(0);
    await pageLoad('fixture-1');
    await openChecker();
    expect(pressed('R')).toBe(true);
    expect(resultTable()?.textContent).toBe(table);
    expect(document.body.textContent).not.toContain(OUT_OF_DATE);
  });

  it('a kept check that now reads as a system the check does not read, or that Auto no longer places, opens without a table', async () => {
    // What an earlier version of the reading could have kept: a check it
    // took, which this one would refuse (fix 15's gate, read again on load).
    const check = (code: string, box: 'auto' | 'r' | 'python', lang: 'r' | 'python', extra: Record<string, unknown>) =>
      JSON.stringify({ v: 1, code, lang: box, checked: { lang, widthIn: 10, heightIn: 7, imageId: null, ...extra } });
    const entries: Array<[string, string, string, number]> = [
      // [poster, entry, code, rows: 0 none, 1 some]
      ['poster-g', check(BASE_R, 'r', 'r', { picked: true }), BASE_R, 0],
      ['poster-i', check(UNPLACEABLE_GGPLOT, 'auto', 'r', { picked: false }), UNPLACEABLE_GGPLOT, 0],
      // No `picked`: a check kept before the merge is read as Auto's.
      ['poster-j', check(UNPLACEABLE_GGPLOT, 'auto', 'r', {}), UNPLACEABLE_GGPLOT, 0],
      // Auto's R reading of code Auto now reads as Python: an R table for it would be wrong.
      ['poster-n', check(SCRIPT, 'auto', 'r', { picked: false }), SCRIPT, 0],
      // Not a boolean: not a check.
      ['poster-k', check(SCRIPT, 'auto', 'python', { picked: 'yes' }), SCRIPT, 0],
      // Controls: the entries a Check of this version keeps.
      ['poster-l', check(UNPLACEABLE_GGPLOT, 'r', 'r', { picked: true }), UNPLACEABLE_GGPLOT, 1],
      ['poster-m', check(SCRIPT, 'auto', 'python', { picked: false }), SCRIPT, 1],
    ];
    for (const [id, raw, code, rows] of entries) {
      localStorage.setItem(`postr.figure-script.${id}`, raw);
      await pageLoad(id);
      await openChecker();
      expect(codeBox()?.value, id).toBe(code);
      if (rows === 0) expect(resultRows(), id).toBe(0);
      else expect(resultRows(), id).toBeGreaterThan(0);
    }
  });

  it('a kept check Auto could not place opens without a table; picking R and pressing Check shows the R table', async () => {
    // Merge review finding 1: the table must follow `picked` alone. The entry
    // is one kept before the merge (no `picked`), so it reads as Auto's.
    localStorage.setItem(
      'postr.figure-script.poster-p',
      JSON.stringify({ v: 1, code: UNPLACEABLE_GGPLOT, lang: 'auto', checked: { lang: 'r', widthIn: 10, heightIn: 7, imageId: null } }),
    );
    await pageLoad('poster-p');
    await openChecker();
    expect(resultRows()).toBe(0);
    await k.click(k.findButton('R'), 'R');
    await k.click(k.findButton('Check'), 'Check');
    expect(resultRows()).toBeGreaterThan(0);
  });

  it('a blank line typed into the empty box stays in it, and is not stored (it is not a script)', async () => {
    await openChecker();
    await typeScript('\n');
    expect(codeBox()?.value).toBe('\n');
    k.openTab(/^layout$/i);
    await k.nextTask();
    await openChecker();
    expect(codeBox()?.value).toBe('\n');
    expect(localStorage.getItem('postr.figure-script.fixture-1')).toBeNull();
  });

  it('guard: Make a figure → Check a figure keeps it', async () => {
    await checkScript();
    const rows = resultRows();
    await k.click(k.findButton('Make a figure'), 'Make a figure');
    await k.click(k.findButton('Check a figure'), 'Check a figure');
    expectKept(rows);
  });

  it('guard: hiding and showing the sidebar keeps it', async () => {
    await checkScript();
    const rows = resultRows();
    await k.click(k.q('button[aria-label="Hide sidebar"]'), 'Hide sidebar');
    await k.click(k.q('button[aria-label="Show sidebar"]'), 'Show sidebar');
    await openChecker();
    expectKept(rows);
  });
});

describe('item 7 — the script survives a reload, per poster', () => {
  it('a reload of the same poster keeps the script and the language, and the table comes back', async () => {
    await checkScript();
    const rows = resultRows();
    await pageLoad('fixture-1');
    await openChecker();
    expectKept(rows);
  });

  it('a script that was never checked comes back without a table', async () => {
    await openChecker();
    await k.click(k.findButton('Python'), 'Python');
    await typeScript();
    await pageLoad('fixture-1');
    await openChecker();
    expectKept(0);
  });

  it('after a reload, the Figure tab opens on Check when the poster has a kept script', async () => {
    await checkScript();
    await pageLoad('fixture-1');
    k.openTab(/^figure$/i);
    await k.nextTask();
    expect(pressed('Check a figure')).toBe(true);
    expect(codeBox()).toBeVisible();
  });

  it('another poster has its own (empty) box, and the first keeps its script', async () => {
    await checkScript();
    const rows = resultRows();
    await pageLoad('fixture-2');
    await openChecker();
    expect(codeBox()?.value).toBe('');
    expect(resultRows()).toBe(0);
    await pageLoad('fixture-1');
    await openChecker();
    expectKept(rows);
  });

  it('a different poster opened while the editor stays mounted shows its own box, and nothing of the first is written under its id', async () => {
    await checkScript();
    const rows = resultRows();
    await openPosterInPlace('fixture-2');
    await openChecker();
    expect(codeBox()?.value).toBe('');
    expect(resultRows()).toBe(0);
    // Back to the first poster in place: its script and table.
    await openPosterInPlace('fixture-1');
    await openChecker();
    expectKept(rows);
    // The second poster, loaded afresh, never received the first one's script.
    await pageLoad('fixture-2');
    await openChecker();
    expect(codeBox()?.value).toBe('');
  });

  it('a script edited after its check comes back with the table of the check, not of the edit', async () => {
    await checkScript();
    const table = resultTable()?.textContent;
    const edited = SCRIPT.replace("plt.rcParams['font.size'] = 12", "plt.rcParams['font.size'] = 30");
    await typeScript(edited);
    // Typing does not re-run the check: the table stays the check's.
    expect(resultTable()?.textContent).toBe(table);
    await pageLoad('fixture-1');
    await openChecker();
    expect(codeBox()?.value).toBe(edited);
    expect(resultTable()?.textContent).toBe(table);
  });

  it('a kept script the parser cannot read still opens, without a table, and after a reload too', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const unreadable = `${SCRIPT}\n# ZQ7THROW`;
    await openChecker();
    await k.click(k.findButton('Python'), 'Python');
    await typeScript(unreadable);
    await k.click(k.findButton('Check'), 'Check');
    expect(codeBox()?.value).toBe(unreadable);
    expect(resultRows()).toBe(0);
    await pageLoad('fixture-1');
    await openChecker();
    expect(codeBox()?.value).toBe(unreadable);
    expect(resultRows()).toBe(0);
  });

  it('a stored entry that is not one (corrupt, another version, an unknown language) opens an empty box, not a crash', async () => {
    // What another version of Postr, or a hand edit, could leave under the
    // key the owner named (postr.figure-script.<poster id>).
    const entries: Record<string, string> = {
      'poster-a': '{not json',
      'poster-b': JSON.stringify({ v: 2, code: SCRIPT, lang: 'python', checked: null }),
      'poster-c': JSON.stringify({ v: 1, code: SCRIPT, lang: 'klingon', checked: null }),
    };
    for (const [id, raw] of Object.entries(entries)) {
      localStorage.setItem(`postr.figure-script.${id}`, raw);
      await pageLoad(id);
      await openChecker();
      expect(codeBox()?.value, id).toBe('');
      expect(pressed('Auto'), id).toBe(true);
    }
    // A good script with a check that is not one: the script, no table.
    localStorage.setItem(
      'postr.figure-script.poster-d',
      JSON.stringify({ v: 1, code: SCRIPT, lang: 'python', checked: { lang: 'python', widthIn: -5, heightIn: 'tall', imageId: null } }),
    );
    await pageLoad('poster-d');
    await openChecker();
    expect(codeBox()?.value).toBe(SCRIPT);
    expect(pressed('Python')).toBe(true);
    expect(resultRows()).toBe(0);
    // A check that does not say which figure it was made against (the
    // figure preview, null, or an image block's id): the script, no table
    // and no note about one (review round 2).
    for (const [id, imageId] of [['poster-e', undefined], ['poster-f', 5]] as const) {
      localStorage.setItem(
        `postr.figure-script.${id}`,
        JSON.stringify({ v: 1, code: SCRIPT, lang: 'python', checked: { lang: 'python', widthIn: 10, heightIn: 7, imageId } }),
      );
      await pageLoad(id);
      await openChecker();
      expect(codeBox()?.value, id).toBe(SCRIPT);
      expect(resultRows(), id).toBe(0);
      expect(k.q('[aria-label="Figure tools"]')?.parentElement?.textContent, id).not.toMatch(/result is for/);
    }
  });

  it('emptying the code box is kept too: a reload shows the empty box, not the old script', async () => {
    await checkScript();
    await typeScript('');
    await pageLoad('fixture-1');
    await openChecker();
    expect(codeBox()?.value).toBe('');
    expect(storedCopies()).toEqual([]);
  });

  it('a script too large to store is kept for the session, and a reload never brings back the older one', async () => {
    await checkScript();
    const huge = `${SCRIPT}\n${'# padding line for a very long script\n'.repeat(2000)}`;
    await typeScript(huge);
    k.openTab(/^layout$/i);
    await k.nextTask();
    await openChecker();
    expect(codeBox()?.value).toBe(huge);
    await pageLoad('fixture-1');
    await openChecker();
    expect(codeBox()?.value).toBe('');
  });

  it('a long script shortened again is stored again, and the long one is not kept behind it', async () => {
    await checkScript();
    const huge = `${SCRIPT}\n${'# padding line for a very long script\n'.repeat(2000)}`;
    await typeScript(huge);
    expect(storedCopies()).toEqual([]);
    await typeScript(SCRIPT);
    expect(storedCopies()).toEqual(['localStorage:postr.figure-script.fixture-1']);
    // The stored copy goes while this page is open: another tab deletes the
    // poster or the account, or the browser's data is cleared (jsdom has one
    // window, so the other tab's removal is made here).
    localStorage.removeItem('postr.figure-script.fixture-1');
    k.openTab(/^layout$/i);
    await k.nextTask();
    await openChecker();
    expect(codeBox()?.value).toBe('');
  });

  it('with browser storage blocked, the script still survives a tab change', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    await checkScript();
    const rows = resultRows();
    k.openTab(/^layout$/i);
    await k.nextTask();
    await openChecker();
    expectKept(rows);
  });

  it('only the ten most recently changed posters keep a script in this browser', async () => {
    for (let n = 1; n <= 11; n += 1) {
      await pageLoad(`poster-${n}`);
      await openChecker();
      await typeScript(`${SCRIPT}\n# poster ${n}`);
    }
    await pageLoad('poster-1');
    await openChecker();
    expect(codeBox()?.value).toBe('');
    for (const n of [2, 11]) {
      await pageLoad(`poster-${n}`);
      await openChecker();
      expect(codeBox()?.value).toBe(`${SCRIPT}\n# poster ${n}`);
    }
  });
});

describe('item 7 — the Figure tab stays on Check once a script has been entered', () => {
  it('deselecting an image after a script was entered keeps Check and the script on screen', async () => {
    await pageLoad('fixture-1', [IMAGE]);
    k.openTab(/^figure$/i);
    await k.nextTask();
    await clickBlock('img1');
    // Check came up because an image is selected, not by a click on it.
    expect(pressed('Check a figure')).toBe(true);
    await typeScript();
    await clickEmptyCanvas();
    expect(onFigureTab()).toBe(true);
    expect(pressed('Check a figure')).toBe(true);
    expect(codeBox()).toBeVisible();
    expect(codeBox()?.value).toBe(SCRIPT);
  });

  it('guard: with no script, deselecting the image goes back to Make', async () => {
    await pageLoad('fixture-1', [IMAGE]);
    k.openTab(/^figure$/i);
    await k.nextTask();
    await clickBlock('img1');
    expect(pressed('Check a figure')).toBe(true);
    await clickEmptyCanvas();
    expect(pressed('Make a figure')).toBe(true);
  });

  it('guard: a box holding only blank lines is not a script: deselecting the image goes back to Make', async () => {
    await pageLoad('fixture-1', [IMAGE]);
    k.openTab(/^figure$/i);
    await k.nextTask();
    await clickBlock('img1');
    expect(pressed('Check a figure')).toBe(true);
    await typeScript('\n\n');
    await clickEmptyCanvas();
    expect(pressed('Make a figure')).toBe(true);
  });

  // An explicit pick wins over a kept script (review round 1, R1-01).
  it('guard: with a kept script, a click on "Make a figure" shows Make and hides the code box', async () => {
    await checkScript();
    await pageLoad('fixture-1');
    k.openTab(/^figure$/i);
    await k.nextTask();
    expect(pressed('Check a figure')).toBe(true);
    await k.click(k.findButton('Make a figure'), 'Make a figure');
    expect(pressed('Make a figure')).toBe(true);
    expect(codeBox()).not.toBeVisible();
  });

  it('guard: after Check came up for an image and a script went in, a click on "Make a figure" shows Make', async () => {
    await pageLoad('fixture-1', [IMAGE]);
    k.openTab(/^figure$/i);
    await k.nextTask();
    await clickBlock('img1');
    await typeScript();
    await k.click(k.findButton('Make a figure'), 'Make a figure');
    expect(pressed('Make a figure')).toBe(true);
    expect(codeBox()).not.toBeVisible();
  });

  it('guard: with a kept script, Insert › Chart opens Make a figure', async () => {
    await checkScript();
    await pageLoad('fixture-1');
    k.openTab(/^insert$/i);
    await k.nextTask();
    await k.click(k.findButton('Chart'), 'Insert › Chart');
    expect(onFigureTab()).toBe(true);
    expect(pressed('Make a figure')).toBe(true);
    expect(codeBox()).not.toBeVisible();
  });
});

// A kept table was computed at the size it was checked at, while the
// sizing note above it names the size the panel sizes against NOW (the
// selected image, else the gray figure preview). Review round 2 (R2-01):
// a check made against an image block came back under the preview's pill
// and "(default block size)", passing where a Check at that size fails;
// and after a reload the preview is back at 10 × 7 under a table checked at
// another size (R1-08).
describe('item 7 — a kept result says which figure and size it is for (review round 2)', () => {
  const IMAGE_2 = { ...IMAGE, id: 'img2', x: 160, w: 60, h: 40 } as Block;
  const pill = () => k.q('.postr-dimension-pill')?.textContent ?? null;
  /** The Figure tab's text (both modes; the note is in the checker's). */
  const panelText = () => k.q('[aria-label="Figure tools"]')?.parentElement?.textContent ?? '';
  const scaleLine = () =>
    Array.from(document.querySelectorAll('div')).find((d) => d.children.length === 0 && /^Scale factor:/.test(d.textContent ?? ''))
      ?.textContent ?? null;

  /** Select the image (Check comes up for it), Python, the script, ▶ Check. */
  async function checkOnImage(id = 'img1') {
    await pageLoad('fixture-1', [IMAGE, IMAGE_2]);
    k.openTab(/^figure$/i);
    await k.nextTask();
    await clickBlock(id);
    expect(pressed('Check a figure')).toBe(true);
    await k.click(k.findButton('Python'), 'Python');
    await typeScript();
    await k.click(k.findButton('Check'), 'Check');
    expect(resultRows()).toBeGreaterThan(0);
    expect(panelText()).not.toMatch(/result is for/);
  }
  // jsdom has no pointer capture; the preview's drag handlers call it.
  const proto = Element.prototype as unknown as Record<string, unknown>;
  beforeEach(() => {
    proto.setPointerCapture = () => {};
    proto.releasePointerCapture = () => {};
  });
  afterEach(() => {
    delete proto.setPointerCapture;
    delete proto.releasePointerCapture;
  });
  /** Pull the gray figure preview's corner handle by (dx, dy) screen px. */
  async function resizePreview(dx: number, dy: number) {
    const rect = k.q<HTMLElement>('[data-postr-figure-size-overlay]');
    const handle = rect.lastElementChild as HTMLElement;
    rtl.fireEvent.pointerDown(handle, { clientX: 500, clientY: 500, button: 0, pointerId: 2 });
    rtl.fireEvent.pointerMove(rect, { clientX: 500 + dx, clientY: 500 + dy, pointerId: 2 });
    rtl.fireEvent.pointerUp(rect, { clientX: 500 + dx, clientY: 500 + dy, pointerId: 2 });
    await k.nextTask();
  }

  it('a check against an image block is not shown under the figure preview after a deselect; selecting the image shows it again', async () => {
    await checkOnImage();
    const table = resultTable()?.textContent;
    expect(pill()).toBe('12.0" × 8.0"');
    expect(scaleLine()).not.toMatch(/default block size/);
    await clickEmptyCanvas();
    expect(pressed('Check a figure')).toBe(true);
    expect(pill()).toBe('10.0" × 7.0"');
    expect(resultRows()).toBe(0);
    expect(scaleLine()).toBeNull();
    // A status line (fix 15's answer region, always mounted, is another).
    expect(Array.from(document.querySelectorAll('[role="status"]'), (el) => el.textContent)).toContain(
      'The last result is for an image block at 12.0" × 8.0". Click Check to check the size above.',
    );
    await clickBlock('img1');
    expect(resultTable()?.textContent).toBe(table);
    expect(panelText()).not.toMatch(/result is for/);
  });

  it('after a reload, a check made against an image block waits for that image, and its table comes back with it', async () => {
    await checkOnImage();
    const table = resultTable()?.textContent;
    await pageLoad('fixture-1', [IMAGE, IMAGE_2]);
    k.openTab(/^figure$/i);
    await k.nextTask();
    expect(pressed('Check a figure')).toBe(true);
    expect(codeBox()?.value).toBe(SCRIPT);
    expect(resultRows()).toBe(0);
    expect(panelText()).toContain('The last result is for an image block at 12.0" × 8.0"');
    await clickBlock('img1');
    expect(resultTable()?.textContent).toBe(table);
  });

  it('a check against one image block is not shown for another image block', async () => {
    await checkOnImage('img1');
    await clickBlock('img2');
    expect(pill()).toBe('6.0" × 4.0"');
    expect(resultRows()).toBe(0);
    expect(panelText()).toContain('The last result is for an image block at 12.0" × 8.0"');
  });

  it('a check against the figure preview is not shown while an image block is selected, and comes back on a deselect', async () => {
    await pageLoad('fixture-1', [IMAGE, IMAGE_2]);
    await checkScript();
    const table = resultTable()?.textContent;
    expect(pill()).toBe('10.0" × 7.0"');
    await clickBlock('img1');
    expect(resultRows()).toBe(0);
    expect(panelText()).toContain('The last result is for the figure preview at 10.0" × 7.0"');
    await clickEmptyCanvas();
    expect(resultTable()?.textContent).toBe(table);
  });

  it('a result kept through a resize of the figure preview says the size it is for, until Check runs at the new size', async () => {
    await checkScript();
    const table = resultTable()?.textContent;
    await resizePreview(-40, -30);
    const resized = pill();
    expect(resized).not.toBe('10.0" × 7.0"');
    // The editor keeps the result through the drag, as it always has.
    expect(resultTable()?.textContent).toBe(table);
    expect(panelText()).toContain('This result is for 10.0" × 7.0", not the size above.');
    await k.click(k.findButton('Check'), 'Check');
    expect(panelText()).not.toMatch(/result is for/);
  });

  it('guard: a change of the image\'s size the pill cannot show (a poster 48 → 48.1 in wide) raises no note', async () => {
    await checkOnImage();
    const rows = resultRows();
    k.openTab(/^layout$/i);
    await k.nextTask();
    await k.typeKeystrokes(k.widthField(), ['48.1']);
    await k.pressEnter(k.widthField());
    const box = k.dialog(/Change poster to 48\.1 × 36 in/);
    expect(box).not.toBeNull();
    await k.click(k.confirmButton(box!), 'confirm');
    k.openTab(/^figure$/i);
    await k.nextTask();
    await clickEmptyCanvas();
    await clickBlock('img1');
    // 120 units scaled by 48.1 / 48: 12.025 in, which the pill shows as 12.0.
    expect(k.doc().blocks.find((b) => b.id === 'img1')?.w, 'premise: the image was scaled').toBeCloseTo(120.25, 2);
    expect(pill()).toBe('12.0" × 8.0"');
    expect(resultRows()).toBe(rows);
    expect(panelText()).not.toMatch(/result is for/);
  });

  it('after a reload, the table checked at a resized preview says the size it is for (the preview is back at 10 × 7)', async () => {
    await openChecker();
    await resizePreview(-40, -30);
    const checkedAt = pill();
    await k.click(k.findButton('Python'), 'Python');
    await typeScript();
    await k.click(k.findButton('Check'), 'Check');
    const table = resultTable()?.textContent;
    await pageLoad('fixture-1');
    await openChecker();
    expect(pill()).toBe('10.0" × 7.0"');
    expect(resultTable()?.textContent).toBe(table);
    expect(panelText()).toContain(`This result is for ${checkedAt}, not the size above.`);
  });
});

// The stored entry holds the version last checked too, when it differs
// from the box. Review round 2 (R2-02): the cap counted both copies, so one
// keystroke after a Check unstored a script of 25,000 to 50,000
// characters that had been stored, and the next reload lost it.
describe('item 7 — a long script that fits stays stored after an edit (review round 2)', () => {
  // About 26,500 characters as stored: each copy fits, the two do not
  // fit in 50,000.
  const LONG = `${SCRIPT}\n${'# a line of a long analysis script, kept as written\n'.repeat(500)}`;

  it('a long script edited after its check is still stored, and a reload brings back the edit and the table', async () => {
    await openChecker();
    await k.click(k.findButton('Python'), 'Python');
    await typeScript(LONG);
    await k.click(k.findButton('Check'), 'Check');
    const table = resultTable()?.textContent;
    expect(resultRows()).toBeGreaterThan(0);
    await typeScript(`${LONG}#`);
    expect(storedCopies()).toEqual(['localStorage:postr.figure-script.fixture-1']);
    await pageLoad('fixture-1');
    await openChecker();
    expect(codeBox()?.value).toBe(`${LONG}#`);
    expect(resultTable()?.textContent).toBe(table);
  });

  it('guard: no stored entry holds a copy over the cap; a script checked while too long, then shortened, is stored at its next Check', async () => {
    const huge = `${SCRIPT}\n${'# padding line for a very long script\n'.repeat(2000)}`;
    await openChecker();
    await k.click(k.findButton('Python'), 'Python');
    await typeScript(huge);
    await k.click(k.findButton('Check'), 'Check');
    await typeScript(SCRIPT);
    // The version last checked is the long one: it is not stored, so neither is the entry yet.
    expect(storedCopies()).toEqual([]);
    k.openTab(/^layout$/i);
    await k.nextTask();
    await openChecker();
    expect(codeBox()?.value).toBe(SCRIPT);
    await k.click(k.findButton('Check'), 'Check');
    expect(storedCopies()).toEqual(['localStorage:postr.figure-script.fixture-1']);
  });
});

// A deleted poster's or account's scripts going with it is entered at
// the user's clicks: the dashboard's Delete
// (pages/__tests__/figureScriptDeletion.test.tsx) and the Danger Zone
// (pages/__tests__/Profile.dangerZone.test.tsx).
