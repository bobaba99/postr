/**
 * useTwoTabGuard — detect when the same poster is being edited in
 * two tabs at once and warn the user about the last-write-wins
 * autosave behavior.
 *
 * Postr's autosave is a simple PATCH on every debounced edit, with
 * no row-level version field and no conflict detection. If two
 * tabs edit the same poster, the second tab's PATCH clobbers the
 * first — the first tab shows "Saved · 2s ago" but its changes
 * are silently gone the next time the row is fetched. This hook
 * surfaces that risk BEFORE data loss happens so the user can
 * close the duplicate tab.
 *
 * Mechanism: BroadcastChannel ping-and-respond. When a tab mounts
 * the editor for a posterId, it broadcasts a "hello" with its own
 * tabId. Any other tab listening on the same channel responds
 * with "also editing" if it's on the same posterId. The receiving
 * tab of that response flips its `collision` state to true, and
 * the editor shows the warning banner.
 *
 * A `storage` event fallback covers browsers without
 * BroadcastChannel (very old Safari) — we poke a timestamp into
 * localStorage and listen for other tabs to poke the same key.
 *
 * Returns `{ collision, tabId, dismiss }`. The caller decides how
 * to render the warning.
 */
import { useEffect, useRef, useState } from 'react';

interface TabGuardResult {
  collision: boolean;
  tabId: string;
  dismiss: () => void;
}

const CHANNEL_NAME = 'postr-editors';
const STORAGE_PREFIX = 'postr.active-editor.';

// A short stable tab id persists in sessionStorage so re-mounts
// during hot reload / code-split / route transitions don't count
// as "another tab" for collision purposes.
function getTabId(): string {
  const key = 'postr.tab-id';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `tab-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

interface Message {
  type: 'hello' | 'ack';
  posterId: string;
  tabId: string;
}

export function useTwoTabGuard(posterId: string | null): TabGuardResult {
  const [collision, setCollision] = useState(false);
  const tabIdRef = useRef<string>('');
  if (!tabIdRef.current) tabIdRef.current = getTabId();
  const tabId = tabIdRef.current;

  useEffect(() => {
    if (!posterId) return;
    // BroadcastChannel is supported everywhere we care about
    // (Chrome, Firefox, Safari 15.4+). For unsupported browsers we
    // fall back to storage events which is strictly worse (requires
    // a localStorage write to fire) but still correct.
    const hasChannel = typeof BroadcastChannel !== 'undefined';
    let channel: BroadcastChannel | null = null;
    if (hasChannel) {
      channel = new BroadcastChannel(CHANNEL_NAME);
      const onMessage = (event: MessageEvent<Message>) => {
        const { type, posterId: otherPoster, tabId: otherTab } = event.data;
        if (otherTab === tabId) return;
        if (otherPoster !== posterId) return;
        if (type === 'hello') {
          // Another tab just opened THIS poster — respond so it
          // knows we're here, and mark ourselves as colliding.
          channel?.postMessage({ type: 'ack', posterId, tabId } satisfies Message);
          setCollision(true);
        } else if (type === 'ack') {
          // An earlier-registered tab acknowledged our hello — we
          // now know it's open.
          setCollision(true);
        }
      };
      channel.addEventListener('message', onMessage);
      channel.postMessage({ type: 'hello', posterId, tabId } satisfies Message);
    }

    // Storage-event fallback + complementary signal. We write a
    // timestamped registration so tabs that came up offline can
    // still see each other when they reconnect.
    const storageKey = `${STORAGE_PREFIX}${posterId}`;
    const existing = localStorage.getItem(storageKey);
    if (existing) {
      try {
        const parsed = JSON.parse(existing) as {
          tabId: string;
          ts: number;
        };
        // Consider a prior registration stale after 2 minutes so
        // crashed tabs don't leave a permanent false-positive.
        if (parsed.tabId !== tabId && Date.now() - parsed.ts < 120_000) {
          setCollision(true);
        }
      } catch {
        // Corrupted entry — ignore
      }
    }
    localStorage.setItem(
      storageKey,
      JSON.stringify({ tabId, ts: Date.now() }),
    );

    // Keep our timestamp fresh so other tabs don't mistake us for
    // stale. 30s interval is cheap and gives us a 2-min grace
    // window before a crashed tab is forgotten.
    const heartbeat = window.setInterval(() => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ tabId, ts: Date.now() }),
      );
    }, 30_000);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue) as {
          tabId: string;
          ts: number;
        };
        if (parsed.tabId !== tabId) setCollision(true);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(heartbeat);
      channel?.close();
      // Leave the localStorage entry so other newly-opened tabs can
      // see we were editing recently. The 2-minute staleness check
      // will clean it up naturally.
    };
  }, [posterId, tabId]);

  return {
    collision,
    tabId,
    dismiss: () => setCollision(false),
  };
}
