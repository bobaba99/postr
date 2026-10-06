/**
 * useSessionDraft — useState for something a user is still writing in a
 * panel that unmounts (plan item 7, docs/fixes/07-figure-script-kept.md).
 *
 * The editor's sidebar renders only the active tab's panel, and selecting
 * a block on the canvas changes the tab (Sidebar.tsx's selection effect),
 * so a draft held in a panel's own useState was lost the moment the user
 * clicked anything on the poster. A draft kept here lives in this module
 * instead, under a key the caller scopes (the sidebar passes the poster
 * id), for as long as the page is open: it survives the panel unmounting
 * and mounting again, and is gone after a reload or when the tab closes.
 * Nothing is written to browser storage (owner decision, 2026-10-06).
 *
 * Every write lands here synchronously, so one made after the panel
 * unmounted (a parse that finishes, a feedback timer) is what the next
 * mount reads, and every mounted reader of the key re-renders. With a null
 * key it is plain useState, so a component used outside the editor (the
 * standalone pages, a unit test) behaves as it always did.
 */
import { useCallback, useState, useSyncExternalStore } from 'react';

type Update<T> = T | ((prev: T) => T);

const drafts = new Map<string, unknown>();
const listeners = new Map<string, Set<() => void>>();

function subscribeTo(key: string, listener: () => void): () => void {
  const forKey = listeners.get(key) ?? new Set<() => void>();
  listeners.set(key, forKey);
  forKey.add(listener);
  return () => {
    forKey.delete(listener);
    if (forKey.size === 0) listeners.delete(key);
  };
}

const noSubscription = () => () => {};

/** `scope:name`, or null (plain state) when there is no scope. */
export function draftKey(scope: string | null | undefined, name: string): string | null {
  return scope ? `${scope}:${name}` : null;
}

export function useSessionDraft<T>(
  key: string | null,
  initial: T | (() => T),
): [T, (next: Update<T>) => void] {
  // The value until the key's first write, and the whole state with no
  // key. Computed once per mount, so a lazy initial (fresh ids) is stable.
  const [local, setLocal] = useState<T>(initial);
  const subscribe = useCallback(
    (listener: () => void) => (key === null ? noSubscription() : subscribeTo(key, listener)),
    [key],
  );
  const stored = useSyncExternalStore(subscribe, () => (key === null ? undefined : drafts.get(key)));
  const value = key !== null && drafts.has(key) ? (stored as T) : local;

  const set = useCallback(
    (next: Update<T>) => {
      if (key === null) {
        setLocal(next);
        return;
      }
      const prev = drafts.has(key) ? (drafts.get(key) as T) : local;
      drafts.set(key, typeof next === 'function' ? (next as (p: T) => T)(prev) : next);
      listeners.get(key)?.forEach((listener) => listener());
    },
    [key, local],
  );
  return [value, set];
}
