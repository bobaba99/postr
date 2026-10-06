/**
 * Plan item 7 — the public plot checker (/tools/figure-readability) keeps
 * the visitor's script, its language and the typed size across a reload,
 * and forgets them when the tab is closed. Engineering record:
 * docs/fixes/07-figure-script-kept.md.
 *
 * Owner decision (2026-10-06): sessionStorage, not localStorage. Library
 * guides link students to this page, often on shared computers; a closed
 * tab must not hand one student's script to the next.
 *
 * A reload is modelled as every module loaded again with the tab's storage
 * as it was; a new tab as every module loaded again with an empty
 * sessionStorage (localStorage is shared by the browser's tabs, so it is
 * left as it was). The visitor types, clicks and presses Enter.
 *
 * Re-run: npx vitest run src/pages/__tests__/figureReadabilityKept.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));
vi.mock('@/lib/apiClient', () => ({ postJson: vi.fn(), ApiError: class extends Error {} }));

type Rtl = typeof import('@testing-library/react');

const MARK = 'ZQ7MARK';
/** ggsave 7×5 → its tick labels fail at the default size, so the table shows a fix. */
const R_CODE = [
  `# ${MARK}`,
  'library(ggplot2)',
  'ggplot(mtcars, aes(mpg, wt)) + geom_point() + theme_minimal(base_size = 11)',
  'ggsave("fig.png", width = 7, height = 5)',
].join('\n');

let rtl: Rtl;
let view: { unmount: () => void } | null = null;

/** Open the page as a load of the tab does: every module loaded again. */
async function loadPage() {
  view?.unmount();
  view = null;
  vi.resetModules();
  rtl = await import('@testing-library/react');
  const { MemoryRouter } = await import('react-router');
  const { default: Page } = await import('../FigureReadability');
  view = rtl.render(
    <MemoryRouter initialEntries={['/tools/figure-readability']}>
      <Page />
    </MemoryRouter>,
  );
}

const codeBox = () => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Your R or Python plotting code"]')!;
const field = (label: string) => rtl.screen.getByLabelText(label, { exact: true }) as HTMLInputElement;
const pressed = (name: string) =>
  rtl.screen.getByRole('button', { name: new RegExp(`^${name}$`) }).getAttribute('aria-pressed') === 'true';
const resultRows = () =>
  Array.from(document.querySelectorAll('table'))
    .find((t) => /Element/.test(t.querySelector('thead')?.textContent ?? ''))
    ?.querySelectorAll('tbody tr').length ?? 0;
function storedCopies(area: Storage): string[] {
  const hits: string[] = [];
  for (let i = 0; i < area.length; i += 1) {
    const key = area.key(i)!;
    if ((area.getItem(key) ?? '').includes(MARK)) hits.push(key);
  }
  return hits;
}

/** 6 × 4.5 in typed and committed with Enter, R picked, the code in, ▶ Check. */
async function checkAtTypedSize() {
  for (const [label, value] of [['Width', '6'], ['Height', '4.5']] as const) {
    rtl.fireEvent.change(field(label), { target: { value } });
    rtl.fireEvent.keyDown(field(label), { key: 'Enter' });
  }
  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: /^R$/ }));
  rtl.fireEvent.change(codeBox(), { target: { value: R_CODE } });
  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: /check$/i }));
  expect(resultRows()).toBeGreaterThan(0);
  expect(field('Width').value).toBe('6');
  expect(field('Height').value).toBe('4.5');
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  await loadPage();
});
afterEach(() => {
  view?.unmount();
  view = null;
});

describe('item 7 — the public plot checker', () => {
  it('a reload keeps the script, the language and the typed size, and the table comes back', async () => {
    await checkAtTypedSize();
    const rows = resultRows();
    await loadPage();
    expect(codeBox().value).toBe(R_CODE);
    expect(pressed('R')).toBe(true);
    expect(field('Width').value).toBe('6');
    expect(field('Height').value).toBe('4.5');
    expect(resultRows()).toBe(rows);
  });

  it('a script typed but not checked comes back after a reload without a table', async () => {
    rtl.fireEvent.change(codeBox(), { target: { value: R_CODE } });
    await loadPage();
    expect(codeBox().value).toBe(R_CODE);
    expect(resultRows()).toBe(0);
  });

  it('it is kept in this tab only: a new tab starts empty at the default size, and nothing is in localStorage', async () => {
    await checkAtTypedSize();
    expect(storedCopies(localStorage)).toEqual([]);
    sessionStorage.clear();
    await loadPage();
    expect(codeBox().value).toBe('');
    expect(pressed('Auto')).toBe(true);
    expect(field('Width').value).toBe('10');
    expect(field('Height').value).toBe('7');
    expect(resultRows()).toBe(0);
  });

  it('a kept size outside the fields\' range (another version, a hand edit) opens at the default size', async () => {
    for (const raw of ['{"w":0.5,"h":7}', '{"w":10,"h":500}', '{"w":"6","h":4}', '{not json']) {
      sessionStorage.setItem('postr.figure-size-page', raw);
      await loadPage();
      expect(field('Width').value, raw).toBe('10');
      expect(field('Height').value, raw).toBe('7');
    }
  });

  it('a script too long to store is not kept: a reload opens an empty box (the Cookies Policy says so)', async () => {
    const huge = `${R_CODE}\n${'# padding line for a very long script\n'.repeat(2000)}`;
    rtl.fireEvent.change(codeBox(), { target: { value: huge } });
    expect(codeBox().value).toBe(huge);
    expect(storedCopies(sessionStorage)).toEqual([]);
    await loadPage();
    expect(codeBox().value).toBe('');
  });

  // The page's slot has the editor's writer: one keystroke after a Check
  // used to unstore a script of 25,000 to 50,000 characters (review round
  // 2, R2-02).
  it('a long script that fits, edited after its check, is still kept across a reload', async () => {
    const long = `${R_CODE}\n${'# a line of a long analysis script, kept as written\n'.repeat(500)}`;
    rtl.fireEvent.click(rtl.screen.getByRole('button', { name: /^R$/ }));
    rtl.fireEvent.change(codeBox(), { target: { value: long } });
    rtl.fireEvent.click(rtl.screen.getByRole('button', { name: /check$/i }));
    const rows = resultRows();
    expect(rows).toBeGreaterThan(0);
    rtl.fireEvent.change(codeBox(), { target: { value: `${long}#` } });
    expect(storedCopies(sessionStorage)).toEqual(['postr.figure-script-page']);
    await loadPage();
    expect(codeBox().value).toBe(`${long}#`);
    expect(resultRows()).toBe(rows);
  });

  it('a size changed after the check still hides the old table after a reload', async () => {
    await checkAtTypedSize();
    rtl.fireEvent.change(field('Width'), { target: { value: '9' } });
    rtl.fireEvent.keyDown(field('Width'), { key: 'Enter' });
    expect(resultRows()).toBe(0);
    await loadPage();
    expect(field('Width').value).toBe('9');
    expect(codeBox().value).toBe(R_CODE);
    expect(resultRows()).toBe(0);
  });
});
