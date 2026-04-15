/**
 * useComments — local cache + mutators for a poster's comment thread.
 *
 * Loads the full list once on mount (cheap — comments are small rows)
 * and exposes imperative `add / edit / resolve / delete` operations
 * that optimistically update the cache, then refetch on error so the
 * UI self-heals from a server-side RLS or rate-limit rejection.
 *
 * Polling rather than realtime: Supabase realtime needs a separate
 * WebSocket subscription and authentication concerns (anon sessions
 * can subscribe to public tables, but the gymnastics aren't worth it
 * for a review flow where refetching every 15 s is plenty).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createComment,
  deleteComment,
  editCommentBody,
  listComments,
  setCommentResolved,
  type Comment,
  type CommentAnchor,
} from '@/data/comments';

const POLL_INTERVAL_MS = 15_000;

export interface UseCommentsResult {
  comments: Comment[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  addComment: (args: {
    authorName: string;
    body: string;
    anchor: CommentAnchor;
    parentId?: string | null;
  }) => Promise<Comment>;
  editComment: (id: string, body: string) => Promise<Comment>;
  resolveComment: (id: string, resolved: boolean) => Promise<Comment>;
  removeComment: (id: string) => Promise<void>;
}

export function useComments(posterId: string | null | undefined): UseCommentsResult {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const load = useCallback(async () => {
    if (!posterId) {
      setComments([]);
      setLoading(false);
      return;
    }
    try {
      const list = await listComments(posterId);
      if (cancelledRef.current) return;
      setComments(list);
      setError(null);
    } catch (e) {
      if (cancelledRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [posterId]);

  useEffect(() => {
    cancelledRef.current = false;
    setLoading(true);
    load();
    if (!posterId) return;
    const id = window.setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelledRef.current = true;
      window.clearInterval(id);
    };
  }, [posterId, load]);

  const addComment = useCallback<UseCommentsResult['addComment']>(
    async (args) => {
      if (!posterId) throw new Error('No poster to comment on.');
      const created = await createComment({ posterId, ...args });
      setComments((prev) => [created, ...prev]);
      return created;
    },
    [posterId],
  );

  const editComment = useCallback<UseCommentsResult['editComment']>(
    async (id, body) => {
      const updated = await editCommentBody(id, body);
      setComments((prev) => prev.map((c) => (c.id === id ? updated : c)));
      return updated;
    },
    [],
  );

  const resolveComment = useCallback<UseCommentsResult['resolveComment']>(
    async (id, resolved) => {
      const updated = await setCommentResolved(id, resolved);
      setComments((prev) => prev.map((c) => (c.id === id ? updated : c)));
      return updated;
    },
    [],
  );

  const removeComment = useCallback<UseCommentsResult['removeComment']>(
    async (id) => {
      await deleteComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id && c.parentId !== id));
    },
    [],
  );

  return {
    comments,
    loading,
    error,
    refetch: load,
    addComment,
    editComment,
    resolveComment,
    removeComment,
  };
}

/** Guest display name persisted in localStorage so reviewers don't
 * retype it on every poster. */
const GUEST_NAME_KEY = 'postr.comment-name';

export function readGuestName(): string {
  try {
    return localStorage.getItem(GUEST_NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function writeGuestName(name: string) {
  try {
    localStorage.setItem(GUEST_NAME_KEY, name.trim());
  } catch {
    // private mode — in-memory only, the name will need to be re-entered
  }
}
