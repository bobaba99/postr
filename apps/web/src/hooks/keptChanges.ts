/**
 * Changes whose editor closed before they were stored (fix 38, review round
 * 1, R1-1; docs/fixes/38-save-on-leave.md), by poster id.
 *
 * The editor left inside the app (the dashboard, the account page) with a
 * change not stored yet used to lose it: its retries and its leave dialog
 * went with the editor (MEASURED on main and on the first version of fix 38,
 * keep-work-check L3-inapp-*, three engines). The autosave hook that made
 * the change now goes on saving it after the editor has gone, until a write
 * of it is stored (hooks/useAutosave.ts `keep`), and records it here, so
 * that the poster opened again opens from it (pages/Editor.tsx) and its
 * editor takes the saving over (`handOver`): one writer for a poster.
 */
import type { PosterDoc } from '@postr/shared';

export type Change = { id: string; doc: PosterDoc };

/** A closed editor's saving, handed to the editor that opens its poster again. */
export interface HandedOver {
  change: Change | null;
  inFlight: Promise<boolean> | null;
  cutOff: boolean;
  storedTitle: string | undefined;
}

interface Kept {
  /** The hook that keeps it. */
  owner: object;
  doc: PosterDoc;
  title: string | undefined;
  /** Stops that hook's saving and returns its state. */
  handOver: () => HandedOver;
}

const kept = new Map<string, Kept>();

/**
 * The change kept for `posterId` after its editor closed, not stored yet, or
 * null: the poster is opened from it (pages/Editor.tsx), as the user left
 * it, since the server's copy is older.
 */
export function keptChange(posterId: string): { doc: PosterDoc; title: string | undefined } | null {
  const k = kept.get(posterId);
  return k ? { doc: k.doc, title: k.title } : null;
}

/** Records that `entry.owner` keeps a change of `posterId`. */
export function recordKept(posterId: string, entry: Kept): void {
  kept.set(posterId, entry);
}

/** The keeper of `posterId`'s change, if any. */
export function keeperOf(posterId: string): Kept | undefined {
  return kept.get(posterId);
}

/**
 * A deleted poster's kept change goes with it (fix 38, review round 2, R2-4):
 * its keeper stops, so nothing more is written and the tab close asks
 * nothing for it. It used to go on: a write every 30 s answered "no row"
 * (406), and the leave dialog for a poster that is gone (MEASURED,
 * keep-work-check L3-inapp-kept-then-delete, three engines). A write still
 * out may land after the delete; on a deleted row it changes nothing.
 */
export function dropKept(posterId: string): void {
  kept.get(posterId)?.handOver();
}

/** Forgets every change `owner` keeps (stored, given up, or handed over). */
export function forgetKeptBy(owner: object): void {
  for (const [id, k] of kept) {
    if (k.owner === owner) kept.delete(id);
  }
}
