/**
 * The plot checker's draft: the script a researcher put into it, its
 * language, and the inputs of the last Check whose table was showing
 * (plan item 7, docs/fixes/07-figure-script-kept.md).
 *
 * The checker is a sidebar panel, and the sidebar unmounts a panel on every
 * tab change (selecting a block is one), so the panel's own useState lost
 * all of it; a reload lost it too. It is kept in the browser instead:
 *
 *   - in the editor, per poster, in localStorage under
 *     `postr.figure-script.<poster id>` (PLAN.md "Assumptions accepted":
 *     saved in this browser, not in the poster);
 *   - on the public /tools/figure-readability page, in sessionStorage
 *     (`postr.figure-script-page`, and the typed size under
 *     `postr.figure-size-page`), so a reload keeps it and closing the tab
 *     forgets it: library guides link students to the page, often on
 *     shared computers (owner decision, 2026-10-06).
 *
 * Storage is the record whenever it works. Every change is written at
 * once, synchronously: no debounce, because a pending write is what lost a
 * save when the poster changed under a mounted editor (fix 02, L-2). A
 * draft storage cannot take (blocked, full, or a script over
 * MAX_SCRIPT_CHARS) is kept in memory instead, while the page stays open:
 * a reload, or closing the tab, loses it. Its older stored copy is removed
 * so a reload never brings back an outdated script.
 *
 * Bounds, so pasted scripts can never crowd the sign-in session out of
 * localStorage: each copy of a script in an entry (the script, and the
 * version last checked when it differs) is at most MAX_SCRIPT_CHARS
 * characters as stored, and only the MAX_STORED_SCRIPTS most recently
 * changed posters keep one: about a million characters in all. An empty
 * code box stores nothing.
 */
import { useCallback, useState, useSyncExternalStore } from 'react';
import { PRINT_SIZE_MAX_IN, PRINT_SIZE_MIN_IN, type PrintSize } from './printSize';

export type ScriptLanguage = 'auto' | 'r' | 'python';

/** What the last Check ran on: re-running it gives the same table. */
export interface CheckedInputs {
  readonly code: string;
  readonly lang: 'r' | 'python';
  /**
   * True when the language was picked by hand, false when Auto read it.
   * The table is shown only while the code, read the same way, still reads
   * as that language and as a system the check reads (fix 15's gate,
   * applied to a kept check at the merge of fixes 7 and 15). A stored check
   * without it is read as Auto's.
   */
  readonly picked: boolean;
  readonly widthIn: number;
  readonly heightIn: number;
  /**
   * The image block whose size it was checked at, or null for the gray
   * figure preview (and the public page): the editor shows the table only
   * while the same figure sizes the check (review round 2, R2-01).
   */
  readonly imageId: string | null;
}

export interface FigureScriptDraft {
  readonly code: string;
  readonly lang: ScriptLanguage;
  /** The last Check's inputs while its table is showing, else null. */
  readonly checked: CheckedInputs | null;
}

type Area = 'localStorage' | 'sessionStorage';

/** Where one checker's draft is kept. */
export interface ScriptDraftSlot {
  readonly area: Area;
  readonly key: string;
}

export const FIGURE_SCRIPT_KEY_PREFIX = 'postr.figure-script.';
export const PAGE_SCRIPT_SLOT: ScriptDraftSlot = { area: 'sessionStorage', key: 'postr.figure-script-page' };
const PAGE_SIZE_KEY = 'postr.figure-size-page';

/** One copy of a script as stored, about 50 KB; plotting scripts are a few KB. */
export const MAX_SCRIPT_CHARS = 50_000;
export const MAX_STORED_SCRIPTS = 10;

export const EMPTY_SCRIPT_DRAFT: FigureScriptDraft = { code: '', lang: 'auto', checked: null };

export function posterScriptSlot(posterId: string): ScriptDraftSlot {
  return { area: 'localStorage', key: `${FIGURE_SCRIPT_KEY_PREFIX}${posterId}` };
}

// ── storage access (every call may throw: blocked, private mode, full) ──

function getStored(area: Area, key: string): string | null {
  return area === 'localStorage' ? localStorage.getItem(key) : sessionStorage.getItem(key);
}

function setStored(area: Area, key: string, value: string): void {
  if (area === 'localStorage') localStorage.setItem(key, value);
  else sessionStorage.setItem(key, value);
}

function removeStored(area: Area, key: string): void {
  if (area === 'localStorage') localStorage.removeItem(key);
  else sessionStorage.removeItem(key);
}

// ── the stored entry ──

const LANGUAGES: readonly ScriptLanguage[] = ['auto', 'r', 'python'];

const isInches = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 10_000;

/** Strictly increasing, so the most recent change sorts first even within a millisecond. */
let lastStamp = 0;
function stamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}

/** The JSON stored for a draft; a check of the same code does not store it twice. */
function serialize(draft: FigureScriptDraft): string {
  const { checked } = draft;
  return JSON.stringify({
    v: 1,
    code: draft.code,
    lang: draft.lang,
    checked: checked && {
      lang: checked.lang,
      picked: checked.picked,
      widthIn: checked.widthIn,
      heightIn: checked.heightIn,
      imageId: checked.imageId,
      ...(checked.code === draft.code ? {} : { code: checked.code }),
    },
    at: stamp(),
  });
}

/**
 * A stored entry read back, or null for anything that is not one. Throws
 * on text that is not JSON; the caller treats that like no entry.
 */
function parse(raw: string): FigureScriptDraft | null {
  const entry = JSON.parse(raw) as Record<string, unknown> | null;
  if (entry?.v !== 1 || typeof entry.code !== 'string') return null;
  const lang = LANGUAGES.find((l) => l === entry.lang);
  if (!lang) return null;
  const c = entry.checked as Record<string, unknown> | null | undefined;
  const checked: CheckedInputs | null =
    c &&
    (c.lang === 'r' || c.lang === 'python') &&
    (c.picked === undefined || typeof c.picked === 'boolean') &&
    isInches(c.widthIn) &&
    isInches(c.heightIn) &&
    (c.imageId === null || typeof c.imageId === 'string') &&
    (c.code === undefined || typeof c.code === 'string')
      ? {
          code: typeof c.code === 'string' ? c.code : entry.code,
          lang: c.lang,
          picked: c.picked === true,
          widthIn: c.widthIn,
          heightIn: c.heightIn,
          imageId: c.imageId,
        }
      : null;
  return { code: entry.code, lang, checked };
}

const storedLength = (code: string) => JSON.stringify(code).length;

/**
 * A copy of the script over the cap: the script, or the version last
 * checked when the entry holds it too. Each copy is capped on its own:
 * capping the whole entry unstored a stored script on the first keystroke
 * after its Check, when the version last checked joined it (review round
 * 2, R2-02).
 */
function tooLongToStore({ code, checked }: FigureScriptDraft): boolean {
  return (
    storedLength(code) > MAX_SCRIPT_CHARS ||
    (checked !== null && checked.code !== code && storedLength(checked.code) > MAX_SCRIPT_CHARS)
  );
}

function storedAt(raw: string | null): number {
  try {
    const at = raw === null ? undefined : (JSON.parse(raw) as { at?: unknown }).at;
    return typeof at === 'number' ? at : 0;
  } catch {
    return 0;
  }
}

/** Keep the MAX_STORED_SCRIPTS most recently changed posters' scripts. */
function pruneStoredScripts(): void {
  const entries: Array<{ key: string; at: number }> = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(FIGURE_SCRIPT_KEY_PREFIX)) entries.push({ key, at: storedAt(localStorage.getItem(key)) });
  }
  entries
    .sort((a, b) => b.at - a.at)
    .slice(MAX_STORED_SCRIPTS)
    .forEach(({ key }) => localStorage.removeItem(key));
}

// ── the module's state: drafts storage could not take, and the last parse ──

const unstored = new Map<string, FigureScriptDraft>();
const parsed = new Map<string, { raw: string; draft: FigureScriptDraft }>();
const listeners = new Set<() => void>();

const slotId = (slot: ScriptDraftSlot) => `${slot.area}:${slot.key}`;

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeScriptDrafts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The slot's draft: storage's copy, else the one it could not take. */
export function readScriptDraft(slot: ScriptDraftSlot): FigureScriptDraft {
  const id = slotId(slot);
  try {
    const raw = getStored(slot.area, slot.key);
    if (raw !== null) {
      const last = parsed.get(id);
      if (last?.raw === raw) return last.draft;
      const draft = parse(raw);
      if (draft) {
        // Same object while the stored text is the same (useSyncExternalStore).
        parsed.set(id, { raw, draft });
        return draft;
      }
    }
  } catch {
    // Storage unreadable, or its text is not JSON: only the memory copy is left.
  }
  return unstored.get(id) ?? EMPTY_SCRIPT_DRAFT;
}

export function writeScriptDraft(slot: ScriptDraftSlot, draft: FigureScriptDraft): void {
  const id = slotId(slot);
  try {
    if (!draft.code.trim()) {
      // Nothing is stored for a box with no code in it; what it does
      // hold (blank lines typed first, a language picked before the
      // code goes in, a table still showing) lasts while the page is open.
      removeStored(slot.area, slot.key);
      if (draft.code === '' && draft.lang === 'auto' && draft.checked === null) unstored.delete(id);
      else unstored.set(id, draft);
    } else {
      if (tooLongToStore(draft)) throw new RangeError('too large to store');
      const raw = serialize(draft);
      const isNew = getStored(slot.area, slot.key) === null;
      setStored(slot.area, slot.key, raw);
      unstored.delete(id);
      if (isNew && slot.area === 'localStorage') pruneStoredScripts();
    }
  } catch {
    // Blocked, full or too large: keep it while the page is open, and
    // drop the stored copy so a reload cannot bring back an older script.
    unstored.set(id, draft);
    try {
      removeStored(slot.area, slot.key);
    } catch {
      // Storage unavailable — there is no stored copy to drop.
    }
  }
  notify();
}

/**
 * The checker's draft and its update. The update merges a patch into the
 * slot's current draft and writes it at once. With no slot, the draft is
 * component state only.
 */
export function useScriptDraft(
  slot: ScriptDraftSlot | null,
): [FigureScriptDraft, (patch: Partial<FigureScriptDraft>) => void] {
  const [local, setLocal] = useState<FigureScriptDraft>(EMPTY_SCRIPT_DRAFT);
  const area = slot?.area ?? null;
  const key = slot?.key ?? null;
  const stored = useSyncExternalStore(subscribeScriptDrafts, () =>
    area && key ? readScriptDraft({ area, key }) : EMPTY_SCRIPT_DRAFT,
  );
  const update = useCallback(
    (patch: Partial<FigureScriptDraft>) => {
      if (!area || !key) {
        setLocal((prev) => ({ ...prev, ...patch }));
        return;
      }
      const target = { area, key };
      writeScriptDraft(target, { ...readScriptDraft(target), ...patch });
    },
    [area, key],
  );
  return [area && key ? stored : local, update];
}

/** Whether the poster has a script in its checker: the Figure tab then opens on Check. */
export function useHasPosterScript(posterId: string | null): boolean {
  return useSyncExternalStore(
    subscribeScriptDrafts,
    () => posterId !== null && readScriptDraft(posterScriptSlot(posterId)).code.trim() !== '',
  );
}

/** A deleted poster's script goes with it. */
export function forgetPosterScript(posterId: string): void {
  const slot = posterScriptSlot(posterId);
  unstored.delete(slotId(slot));
  try {
    localStorage.removeItem(slot.key);
  } catch {
    // Storage unavailable — nothing stored to remove.
  }
  notify();
}

/** Every poster's script, from this browser (account deletion). */
export function clearStoredFigureScripts(): void {
  for (const id of [...unstored.keys()]) {
    if (id.startsWith(`localStorage:${FIGURE_SCRIPT_KEY_PREFIX}`)) unstored.delete(id);
  }
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(FIGURE_SCRIPT_KEY_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage unavailable — nothing stored to clear.
  }
  notify();
}

/** The public page's typed size, kept for the tab like its script. */
export function readPageSize(): PrintSize | null {
  try {
    const raw = sessionStorage.getItem(PAGE_SIZE_KEY);
    if (raw === null) return null;
    const { w, h } = JSON.parse(raw) as { w?: unknown; h?: unknown };
    const inRange = (n: unknown): n is number =>
      typeof n === 'number' && n >= PRINT_SIZE_MIN_IN && n <= PRINT_SIZE_MAX_IN;
    return inRange(w) && inRange(h) ? { w, h } : null;
  } catch {
    return null;
  }
}

export function writePageSize(size: PrintSize): void {
  try {
    sessionStorage.setItem(PAGE_SIZE_KEY, JSON.stringify({ w: size.w, h: size.h }));
  } catch {
    // Storage unavailable — the size lasts until the page is left.
  }
}
