/**
 * Fix 27, parts 2 and 3 — a failed save is never counted as saved (OF-05,
 * plan item 8), and ⌘S / Ctrl+S saves now instead of making a version
 * (owner decision D8). Engineering record: docs/fixes/27-keep-work-safe.md.
 *
 * Entry is the user's: typing in a text block, ⌘S on the focused element,
 * the sidebar's Duplicate and Poster name field, and the browser's own
 * `beforeunload` and `online` events on the window; another poster opened
 * in the same editor is the store's `setPoster`, what the editor page calls
 * (pages/Editor.tsx). The backend is the data layer's
 * `upsertPoster`, `duplicatePoster` and `saveVersion` (mocked, to fail, to
 * hold a write, and to record what was asked of them). Time is faked for
 * the timers only and runs on its own (`shouldAdvanceTime`), so a test
 * jumps to a retry with `advanceTimersByTimeAsync`.
 *
 * Re-run: npx vitest run src/poster/__tests__/keepWorkSafe.test.tsx
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';

const upsertSpy = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => ({})));
const duplicateSpy = vi.hoisted(() => vi.fn(async () => ({ id: 'copy-1', title: 'ZQ copy' })));
const saveVersionSpy = vi.hoisted(() => vi.fn(async () => ({})));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
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
  upsertPoster: upsertSpy,
  duplicatePoster: duplicateSpy,
}));
vi.mock('@/data/posterVersions', async (orig) => ({
  ...(await orig<typeof import('@/data/posterVersions')>()),
  listVersions: vi.fn(async () => []),
  saveVersion: saveVersionSpy,
}));
vi.mock('@/data/thumbnails', () => ({ captureThumbnail: vi.fn(async () => null) }));
vi.mock('@/lib/diagnostics', () => ({ reportUiSignal: vi.fn() }));

import { usePosterStore } from '@/stores/posterStore';
import {
  NAME,
  NoopResizeObserver,
  canvasEditor,
  clickToEnd,
  installContentEditableShim,
  installExecCommandShim,
  load,
  openTab,
  renderEditor,
  typeText,
  undoDoc,
} from './undoKit';

const NOT_SAVED = 'Not saved — retrying…';
/** The poster text each write sent, in order. */
const writes = () => upsertSpy.mock.calls.map((c) => JSON.stringify((c[1] as { data?: unknown }).data ?? null));
const offline = () => Object.assign(new TypeError('Failed to fetch'), {});
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const settle = () => act(async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); });

let unshims: Array<() => void> = [];
beforeAll(() => {
  unshims = [installContentEditableShim(), installExecCommandShim()];
});
afterAll(() => unshims.forEach((u) => u()));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  upsertSpy.mockReset();
  upsertSpy.mockImplementation(async () => ({}));
  duplicateSpy.mockClear();
  saveVersionSpy.mockClear();
  load(undoDoc());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Open the editor and type `word` at the end of the first text block. */
async function typeWord(word: string) {
  const ed = canvasEditor('b1');
  await clickToEnd(ed);
  await typeText(ed, word);
  return ed;
}

/** A tab close: whether the page asked the browser to confirm leaving. */
function closeTab(): boolean {
  const ev = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(ev);
  return ev.defaultPrevented;
}

describe('a failed save is kept and tried again', () => {
  it('retries a failed save, and the change reaches the server once it accepts', async () => {
    upsertSpy.mockRejectedValueOnce(offline()).mockRejectedValueOnce(offline());
    renderEditor();
    await typeWord(' ZQNET');
    await advance(800);
    expect(upsertSpy, 'the first save').toHaveBeenCalledTimes(1);
    await advance(1500);
    expect(upsertSpy, 'no retry before 2 s').toHaveBeenCalledTimes(1);
    await advance(600);
    expect(upsertSpy, 'the retry 2 s after the failure').toHaveBeenCalledTimes(2);
    await advance(5100);
    expect(upsertSpy, 'the next 5 s after').toHaveBeenCalledTimes(3);
    expect(writes().at(-1)).toContain('ZQNET');
    await waitFor(() => expect(screen.getByText(/^Saved · /)).toBeTruthy());
  });

  it('says "Not saved — retrying…" while the change is not saved', async () => {
    upsertSpy.mockRejectedValue(offline());
    renderEditor();
    await typeWord(' ZQNET');
    await advance(800);
    await waitFor(() => expect(screen.getByText(NOT_SAVED)).toBeTruthy());
  });

  it('warns before the tab closes while a change is unsaved, and not once it is saved', async () => {
    upsertSpy.mockRejectedValueOnce(offline());
    renderEditor();
    await typeWord(' ZQLEAVE');
    await advance(800);
    await settle();
    expect(closeTab(), 'after the failed save').toBe(true);
    await advance(2100);
    await settle();
    expect(writes().at(-1)).toContain('ZQLEAVE');
    expect(closeTab(), 'once it is saved').toBe(false);
  });

  it('warns before the tab closes while the write is still out', async () => {
    let release: () => void = () => {};
    upsertSpy.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({}); }));
    renderEditor();
    await typeWord(' ZQSLOW');
    await advance(800);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    expect(closeTab(), 'a write out, nothing stored yet').toBe(true);
    await act(async () => { release(); });
    await settle();
    expect(closeTab(), 'once it is stored').toBe(false);
  });

  it('writes at once when the browser is back online', async () => {
    upsertSpy.mockRejectedValueOnce(offline());
    renderEditor();
    await typeWord(' ZQOFF');
    await advance(800);
    await settle();
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await settle();
    expect(upsertSpy, 'without waiting for the 2 s retry').toHaveBeenCalledTimes(2);
    expect(writes().at(-1)).toContain('ZQOFF');
  });

  it('one write at a time: an edit made during a slow write is written after it', async () => {
    let release: () => void = () => {};
    upsertSpy.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({}); }));
    renderEditor();
    const ed = await typeWord(' ZQR1');
    await advance(800);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    await typeText(ed, ' ZQR2');
    await advance(900);
    expect(upsertSpy, 'no second write while the first is out').toHaveBeenCalledTimes(1);
    await act(async () => { release(); });
    await settle();
    expect(upsertSpy).toHaveBeenCalledTimes(2);
    expect(writes().at(-1)).toContain('ZQR2');
  });

  // Review round 1 (finding R1-A5): parts of the fix no test reached.
  it('closing the tab sends the change at once, before its 800 ms wait is up', async () => {
    renderEditor();
    await typeWord(' ZQBYE');
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(closeTab()).toBe(true);
    await settle();
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    expect(writes()[0]).toContain('ZQBYE');
  });

  it('after a save goes through, the next failure is retried after 2 s again, not 5', async () => {
    upsertSpy.mockRejectedValueOnce(offline());
    renderEditor();
    const ed = await typeWord(' ZQS1');
    await advance(800);
    await advance(2100);
    expect(upsertSpy, 'failed, then stored at the retry').toHaveBeenCalledTimes(2);
    upsertSpy.mockRejectedValueOnce(offline());
    await typeText(ed, ' ZQS2');
    await advance(800);
    expect(upsertSpy).toHaveBeenCalledTimes(3);
    await advance(2100);
    expect(upsertSpy).toHaveBeenCalledTimes(4);
    expect(writes().at(-1)).toContain('ZQS2');
  });

  it('one write at a time with two saves waiting (the next edit\'s, then ⌘S): one write after the first, not two', async () => {
    const releases: Array<() => void> = [];
    upsertSpy.mockImplementation(() => new Promise((resolve) => { releases.push(() => resolve({})); }));
    renderEditor();
    const ed = await typeWord(' ZQW1');
    await advance(800);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    await typeText(ed, ' ZQW2');
    await advance(900);
    fireEvent.keyDown(ed, { key: 's', code: 'KeyS', metaKey: true });
    await settle();
    expect(upsertSpy, 'both wait for the first').toHaveBeenCalledTimes(1);
    await act(async () => { releases[0]!(); });
    await settle();
    expect(upsertSpy, 'one write, not two at once').toHaveBeenCalledTimes(2);
    expect(writes()[1]).toContain('ZQW2');
    await act(async () => { releases[1]!(); });
    await settle();
    expect(upsertSpy).toHaveBeenCalledTimes(2);
  });

  // Review round 1 (finding R1-A3). Another poster opened in the same editor
  // (the in-editor Duplicate's "Open copy", or Back after it) is the store's
  // setPoster, which is what the editor page calls when it opens one
  // (pages/Editor.tsx; the same model as figureScriptKept.test.tsx).
  it('a write for the poster left behind that fails does not mark the poster opened next as unsaved', async () => {
    let fail: (e: Error) => void = () => {};
    upsertSpy.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    renderEditor();
    await typeWord(' ZQSW');
    await advance(800);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    await act(async () => { usePosterStore.getState().setPoster('copy-1', undoDoc(), 'ZQ copy'); });
    await act(async () => { fail(offline()); });
    await settle();
    expect(screen.queryByText(NOT_SAVED)).toBeNull();
    await advance(10_000);
    expect(screen.queryByText(NOT_SAVED)).toBeNull();
    expect(closeTab()).toBe(false);
  });

  // From the runs of the first review round 3 (its report never reached the
  // record), reproduced here first: the Poster name field's button said
  // "✓ Saved" while every save of the name failed, and while the retry was
  // out (MEASURED in three engines, keep-work-check K9 and K9r; on main too).
  // "Saved" is said once the name is stored, by the field as by the pill.
  it('the Poster name\'s button says "✓ Saved" only once the name is stored', async () => {
    upsertSpy.mockRejectedValue(offline());
    renderEditor();
    const field = document.querySelector<HTMLInputElement>('input[aria-label="Poster name"]')!;
    const button = () => field.parentElement!.querySelector('button')!.textContent;
    fireEvent.change(field, { target: { value: 'ZQ Name' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await settle();
    await advance(800);
    await settle();
    expect(screen.getByText(NOT_SAVED)).toBeTruthy();
    expect(button(), 'while every save fails').toBe('Save');
    let release: () => void = () => {};
    upsertSpy.mockReset();
    upsertSpy.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({}); }));
    upsertSpy.mockImplementation(async () => ({}));
    const before = upsertSpy.mock.calls.length;
    await advance(5100);
    expect(upsertSpy.mock.calls.length, 'the retry is out').toBe(before + 1);
    expect(button(), 'while the retry is out').toBe('Save');
    expect(screen.getByText(NOT_SAVED), 'the pill, while the retry is out').toBeTruthy();
    await act(async () => { release(); });
    await settle();
    expect((upsertSpy.mock.calls.at(-1)![1] as { title?: string }).title).toBe('ZQ Name');
    await waitFor(() => expect(button(), 'once stored').toBe('✓ Saved'));
    expect(screen.getByText(/^Saved · /)).toBeTruthy();
  });

  // Round 1 of the restarted review (finding N1-F1), reproduced here first:
  // the button said "✓ Saved" while the name's first write was still out,
  // before any failure (MEASURED in three engines, keep-work-check K10; on
  // main too).
  it('the Poster name\'s button says no "✓ Saved" while the name\'s write is out', async () => {
    let release: () => void = () => {};
    upsertSpy.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({}); }));
    renderEditor();
    const field = document.querySelector<HTMLInputElement>('input[aria-label="Poster name"]')!;
    const button = () => field.parentElement!.querySelector('button')!.textContent;
    fireEvent.change(field, { target: { value: 'ZQ Name' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await settle();
    expect(upsertSpy, 'the name\'s write is out').toHaveBeenCalledTimes(1);
    expect(button(), 'while the write is out').toBe('Save');
    await act(async () => { release(); });
    await settle();
    await waitFor(() => expect(button(), 'once stored').toBe('✓ Saved'));
  });

  it('a second name saved while the first one\'s write is out: no "✓ Saved" until the second is stored', async () => {
    const releases: Array<() => void> = [];
    const held = () => new Promise<object>((resolve) => { releases.push(() => resolve({})); });
    upsertSpy.mockImplementationOnce(held).mockImplementationOnce(held);
    renderEditor();
    const field = document.querySelector<HTMLInputElement>('input[aria-label="Poster name"]')!;
    const button = () => field.parentElement!.querySelector('button')!.textContent;
    fireEvent.change(field, { target: { value: 'ZQ First' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await settle();
    fireEvent.change(field, { target: { value: 'ZQ Second' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await settle();
    await act(async () => { releases[0]!(); });
    await settle();
    expect(upsertSpy, 'the second name\'s write is out').toHaveBeenCalledTimes(2);
    expect((upsertSpy.mock.calls[1]![1] as { title?: string }).title).toBe('ZQ Second');
    expect(button(), 'the first name stored, the second not yet').toBe('Save');
    await act(async () => { releases[1]!(); });
    await settle();
    await waitFor(() => expect(button(), 'once the second is stored').toBe('✓ Saved'));
  });

  it('the sidebar\'s Duplicate makes no copy while a change is not saved, and says so', async () => {
    upsertSpy.mockRejectedValue(offline());
    renderEditor();
    await typeWord(' ZQDUP');
    await advance(800);
    await settle();
    fireEvent.click(document.querySelector('button[title="Duplicate this poster"]')!);
    await settle();
    expect(duplicateSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/not saved yet, so no copy was made/);
  });
});

describe('⌘S / Ctrl+S saves now', () => {
  it('writes the change at once, makes no version, and says "Saved"', async () => {
    renderEditor();
    const ed = await typeWord(' ZQK1');
    expect(upsertSpy, 'nothing written yet').not.toHaveBeenCalled();
    const allowed = fireEvent.keyDown(ed, { key: 's', code: 'KeyS', metaKey: true });
    await settle();
    expect(allowed, 'the browser\'s save dialog is swallowed').toBe(false);
    expect(upsertSpy, 'written without waiting for the 800 ms').toHaveBeenCalledTimes(1);
    expect(writes()[0]).toContain('ZQK1');
    expect(saveVersionSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
  });

  it('Ctrl+S does the same', async () => {
    renderEditor();
    const ed = await typeWord(' ZQK2');
    fireEvent.keyDown(ed, { key: 's', code: 'KeyS', ctrlKey: true });
    await settle();
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    expect(saveVersionSpy).not.toHaveBeenCalled();
  });

  it('pressed 31 times, makes no version at all', async () => {
    renderEditor();
    const ed = await typeWord(' ZQK4');
    for (let i = 0; i < 31; i += 1) {
      fireEvent.keyDown(ed, { key: 's', code: 'KeyS', metaKey: true });
      await settle();
    }
    expect(saveVersionSpy).not.toHaveBeenCalled();
  });

  it('a held key\'s auto-repeat saves nothing more: only the press does', async () => {
    renderEditor();
    const ed = await typeWord(' ZQK7');
    fireEvent.keyDown(ed, { key: 's', code: 'KeyS', metaKey: true });
    await settle();
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    await typeText(ed, ' ZQK8');
    fireEvent.keyDown(ed, { key: 's', code: 'KeyS', metaKey: true, repeat: true });
    await settle();
    expect(upsertSpy, 'the repeat wrote nothing (the change waits for its 800 ms)').toHaveBeenCalledTimes(1);
  });

  it('the Poster name, saved with Enter, is written at once', async () => {
    renderEditor();
    const field = document.querySelector<HTMLInputElement>('input[aria-label="Poster name"]')!;
    fireEvent.change(field, { target: { value: 'ZQ Name' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await settle();
    expect(upsertSpy, 'without waiting for the 800 ms').toHaveBeenCalledTimes(1);
    expect(upsertSpy.mock.calls[0]![1]).toMatchObject({ title: 'ZQ Name' });
  });

  // Review round 2 (finding R2-A4): the name is a draft until Enter or its
  // Save button (fix 12), and ⌘S in the field said "Saved" while the name
  // typed was not written (MEASURED in three engines, keep-work-check K8).
  it('in the Poster name field, saves the name being typed, then says "Saved"', async () => {
    renderEditor();
    const field = document.querySelector<HTMLInputElement>('input[aria-label="Poster name"]')!;
    fireEvent.change(field, { target: { value: 'ZQ Name' } });
    const allowed = fireEvent.keyDown(field, { key: 's', code: 'KeyS', metaKey: true });
    await settle();
    expect(allowed, 'the browser\'s save dialog is swallowed').toBe(false);
    expect(upsertSpy.mock.calls.map((c) => (c[1] as { title?: string }).title), 'the name typed is written').toContain('ZQ Name');
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
    expect(saveVersionSpy).not.toHaveBeenCalled();
  });

  // The first review round 3's own mutants (its report never reached the
  // record; its spec run reproduced here first): two parts of the R2-A4
  // change no test reached.
  it('Ctrl+S in the Poster name field saves the name being typed too', async () => {
    renderEditor();
    const field = document.querySelector<HTMLInputElement>('input[aria-label="Poster name"]')!;
    fireEvent.change(field, { target: { value: 'ZQ Ctrl Name' } });
    fireEvent.keyDown(field, { key: 's', code: 'KeyS', ctrlKey: true });
    await settle();
    expect(upsertSpy.mock.calls.map((c) => (c[1] as { title?: string }).title)).toContain('ZQ Ctrl Name');
  });

  it('another ⌘ chord in the Poster name field (⌘A) leaves the name a draft', async () => {
    renderEditor();
    const field = document.querySelector<HTMLInputElement>('input[aria-label="Poster name"]')!;
    fireEvent.change(field, { target: { value: 'ZQ Draft Name' } });
    fireEvent.keyDown(field, { key: 'a', code: 'KeyA', metaKey: true });
    await settle();
    await advance(900);
    expect(usePosterStore.getState().posterTitle).not.toBe('ZQ Draft Name');
    expect(upsertSpy.mock.calls.map((c) => (c[1] as { title?: string }).title)).not.toContain('ZQ Draft Name');
    expect(field.value, 'the draft stays in the field').toBe('ZQ Draft Name');
  });

  it('in the Poster name field emptied, keeps the poster\'s name, as the field\'s disabled Save button does', async () => {
    renderEditor();
    const before = usePosterStore.getState().posterTitle;
    const field = document.querySelector<HTMLInputElement>('input[aria-label="Poster name"]')!;
    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.keyDown(field, { key: 's', code: 'KeyS', metaKey: true });
    await settle();
    expect(usePosterStore.getState().posterTitle).toBe(before);
    expect(upsertSpy.mock.calls.map((c) => (c[1] as { title?: string }).title)).not.toContain('   ');
  });

  it('when the write fails, says "Not saved — retrying…", never "Saved"', async () => {
    upsertSpy.mockRejectedValue(offline());
    renderEditor();
    const ed = await typeWord(' ZQK6');
    fireEvent.keyDown(ed, { key: 's', code: 'KeyS', metaKey: true });
    await settle();
    await waitFor(() => expect(screen.getAllByText(NOT_SAVED).length).toBeGreaterThan(0));
    expect(screen.queryByText('Saved')).toBeNull();
  });
});

// Round 2 of the restarted review (finding N2-F3), reproduced here first:
// with every change stored and the saves then failing, the sidebar's
// Duplicate said "Your latest changes are not saved yet" and made no copy,
// and Enter in the Poster name field with the name unchanged turned the pill
// to "Not saved — retrying…" and the field's button to "Save"; both armed
// the leave warning (MEASURED in three engines, keep-work-check K11 and
// K11n). Nothing was unsaved: a write queued for the name passed along with
// the action was the one failing.
describe('nothing unsaved is never called unsaved', () => {
  // The Poster name's draft is kept for the page, per poster id
  // (useSessionDraft): an earlier test's draft for the fixture (a name
  // emptied, a name left typed) would show in the field. A poster id of its
  // own for each test.
  let fresh = 0;
  beforeEach(() => { fresh += 1; usePosterStore.getState().setPoster(`fixture-k11-${fresh}`, undoDoc(), NAME); });
  /** Type `word`, let its save go through, then make every save fail. */
  async function storedThenOffline(word: string) {
    await typeWord(word);
    await advance(800);
    await settle();
    expect(writes().at(-1), 'the change is stored').toContain(word);
    upsertSpy.mockRejectedValue(offline());
    return upsertSpy.mock.calls.length;
  }
  const field = () => document.querySelector<HTMLInputElement>('input[aria-label="Poster name"]')!;
  const nameButton = () => field().parentElement!.querySelector('button')!.textContent;
  const duplicate = () => fireEvent.click(document.querySelector('button[title="Duplicate this poster"]')!);

  it('the sidebar\'s Duplicate makes the copy while saves fail, with nothing to write', async () => {
    renderEditor();
    const writesBefore = await storedThenOffline(' ZQK11');
    duplicate();
    await settle();
    expect(upsertSpy.mock.calls.length, 'nothing to write').toBe(writesBefore);
    expect(duplicateSpy, 'the copy is made').toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/not saved yet/)).toBeNull();
    expect(screen.queryByText(NOT_SAVED)).toBeNull();
    expect(closeTab(), 'no leave warning').toBe(false);
  });

  it('a poster just opened, nothing typed: the sidebar\'s Duplicate makes the copy while saves fail, its name as loaded counting as stored', async () => {
    upsertSpy.mockRejectedValue(offline());
    renderEditor();
    duplicate();
    await settle();
    expect(upsertSpy, 'nothing to write').not.toHaveBeenCalled();
    expect(duplicateSpy).toHaveBeenCalledTimes(1);
    expect(closeTab()).toBe(false);
  });

  it('Enter in the Poster name field with the name unchanged writes nothing and keeps "✓ Saved"', async () => {
    renderEditor();
    const writesBefore = await storedThenOffline(' ZQK11N');
    act(() => openTab(/layout/i));
    fireEvent.keyDown(field(), { key: 'Enter' });
    await settle();
    await advance(2100);
    await settle();
    expect(upsertSpy.mock.calls.length, 'nothing to write').toBe(writesBefore);
    expect(screen.queryByText(NOT_SAVED)).toBeNull();
    expect(nameButton()).toBe('✓ Saved');
    expect(closeTab(), 'no leave warning').toBe(false);
  });

  it('a new name once stored counts as stored: Enter again, unchanged, writes nothing while saves fail', async () => {
    renderEditor();
    fireEvent.change(field(), { target: { value: 'ZQ Stored Name' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    await settle();
    await advance(900);
    await settle();
    expect((upsertSpy.mock.calls.at(-1)![1] as { title?: string }).title).toBe('ZQ Stored Name');
    upsertSpy.mockRejectedValue(offline());
    const writesBefore = upsertSpy.mock.calls.length;
    fireEvent.keyDown(field(), { key: 'Enter' });
    await settle();
    expect(upsertSpy.mock.calls.length, 'nothing to write').toBe(writesBefore);
    expect(nameButton()).toBe('✓ Saved');
    expect(closeTab(), 'no leave warning').toBe(false);
  });

  it('a poster with no name (its title taken from the title block) duplicates while saves fail', async () => {
    usePosterStore.getState().setPoster('fixture-k11-unnamed', undoDoc(), '');
    renderEditor();
    const writesBefore = await storedThenOffline(' ZQK11E');
    expect((upsertSpy.mock.calls.at(-1)![1] as { title?: string }).title, 'the title block\'s words').toBe('Effects of Sample Treatment');
    duplicate();
    await settle();
    expect(upsertSpy.mock.calls.length, 'nothing to write').toBe(writesBefore);
    expect(duplicateSpy).toHaveBeenCalledTimes(1);
    expect(closeTab()).toBe(false);
  });

  it('another poster opened in the editor duplicates while saves fail, its name as loaded counting as stored', async () => {
    renderEditor();
    await act(async () => { usePosterStore.getState().setPoster('copy-1', undoDoc(), 'ZQ copy'); });
    await settle();
    upsertSpy.mockRejectedValue(offline());
    duplicate();
    await settle();
    expect(upsertSpy, 'nothing to write').not.toHaveBeenCalled();
    expect(duplicateSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/not saved yet/)).toBeNull();
    expect(closeTab()).toBe(false);
  });

  it('a write for the poster left behind that succeeds after the switch leaves the next poster\'s name as loaded', async () => {
    let release: () => void = () => {};
    upsertSpy.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({}); }));
    renderEditor();
    await typeWord(' ZQSW2');
    await advance(800);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    await act(async () => { usePosterStore.getState().setPoster('copy-1', undoDoc(), 'ZQ copy'); });
    await act(async () => { release(); });
    await settle();
    upsertSpy.mockRejectedValue(offline());
    duplicate();
    await settle();
    expect(upsertSpy, 'nothing to write for the poster opened next').toHaveBeenCalledTimes(1);
    expect(duplicateSpy).toHaveBeenCalledTimes(1);
  });
});
