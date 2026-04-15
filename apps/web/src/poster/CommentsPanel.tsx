/**
 * CommentsPanel — review-thread UI used by both the editor sidebar
 * (for the poster owner) and the public share viewer (for guests).
 *
 * Fetches + mutates via useComments. Supports:
 *   - Doc-anchored comments (just a message on the whole poster)
 *   - Block / text / area anchored comments authored elsewhere in
 *     the app (canvas overlay or selection toolbar) and passed in
 *     via `pendingAnchor` → the panel renders the draft form with
 *     that anchor pre-set.
 *   - Threaded replies, resolve/unresolve, and delete.
 *
 * Guest name lives in localStorage; the first comment triggers an
 * inline name prompt if none is stored yet.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Comment, CommentAnchor } from '@/data/comments';
import {
  readGuestName,
  useComments,
  writeGuestName,
  type UseCommentsResult,
} from '@/hooks/useComments';
import { ConfirmModal } from '@/components/ConfirmModal';

interface Props {
  posterId: string | null;
  /** Anchor to attach to the next new comment (populated by the canvas
   * overlay or floating toolbar when the user drags a rectangle or
   * highlights text). null → comment is filed against the whole doc. */
  pendingAnchor: CommentAnchor | null;
  onClearPendingAnchor: () => void;
  /** Called when the user clicks a comment to jump to its anchor
   * location on the canvas. Owner side uses this to scroll the
   * editor; guest side uses it to scroll the share viewer. */
  onJumpToAnchor?: (c: Comment) => void;
  /** True if the viewer is the poster owner. Only owners can resolve
   * other people's comments and delete any comment. */
  isOwner: boolean;
  /** Optional override — when rendered in the share viewer the
   * session user id is known externally. null → resolved in panel. */
  currentUserId?: string | null;
}

export function CommentsPanel({
  posterId,
  pendingAnchor,
  onClearPendingAnchor,
  onJumpToAnchor,
  isOwner,
  currentUserId,
}: Props) {
  const state = useComments(posterId);
  const [name, setName] = useState(() => readGuestName());
  const [draft, setDraft] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  // Tracks whether the canvas is currently in "drag an area" mode, so
  // the toggle button can render with a glowing active state. PosterEditor
  // fires `postr:comment-area` on successful drag and
  // `postr:cancel-area-comment` on Escape/cancel — we listen to both
  // to flip the toggle back off.
  const [areaMode, setAreaMode] = useState(false);
  useEffect(() => {
    const off = () => setAreaMode(false);
    window.addEventListener('postr:comment-area', off);
    window.addEventListener('postr:cancel-area-comment', off);
    return () => {
      window.removeEventListener('postr:comment-area', off);
      window.removeEventListener('postr:cancel-area-comment', off);
    };
  }, []);

  // Listen for anchor edits from the canvas (posted area comments
  // being dragged/resized by their author). PosterEditor owns the
  // overlay and fires `postr:comment-edit-anchor` with the new rect;
  // we forward to the server via the already-loaded useComments
  // state so optimistic cache updates are shared across all threads.
  useEffect(() => {
    function onEdit(e: Event) {
      const d = (e as CustomEvent).detail as {
        id: string;
        anchor: CommentAnchor;
      };
      if (!d?.id || !d.anchor) return;
      state.editAnchor(d.id, d.anchor).catch((err) => {
        console.error('Failed to update comment anchor', err);
      });
    }
    window.addEventListener('postr:comment-edit-anchor', onEdit);
    return () =>
      window.removeEventListener('postr:comment-edit-anchor', onEdit);
  }, [state]);
  function toggleAreaMode() {
    if (areaMode) {
      setAreaMode(false);
      window.dispatchEvent(new CustomEvent('postr:cancel-area-comment'));
    } else {
      setAreaMode(true);
      window.dispatchEvent(new CustomEvent('postr:start-area-comment'));
    }
  }

  // Group comments by their root thread: top-level (parent_id null)
  // plus all descendants flattened underneath. Flat replies is enough
  // for a review tool — no need for nested nested nested threads.
  const threads = useMemo(() => {
    const roots = state.comments.filter((c) => !c.parentId);
    return roots
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((root) => ({
        root,
        replies: state.comments
          .filter((c) => c.parentId === root.id)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      }));
  }, [state.comments]);

  const filtered = showResolved
    ? threads
    : threads.filter((t) => !t.root.resolvedAt);

  async function submitNew() {
    if (!posterId) return;
    setSubmitError(null);
    const cleanName = name.trim();
    const cleanBody = draft.trim();
    if (!cleanName) {
      setSubmitError('Enter a display name first.');
      return;
    }
    if (!cleanBody) {
      setSubmitError('Write something before posting.');
      return;
    }
    setSubmitting(true);
    try {
      writeGuestName(cleanName);
      await state.addComment({
        authorName: cleanName,
        body: cleanBody,
        anchor: pendingAnchor ?? { type: 'doc' },
      });
      setDraft('');
      onClearPendingAnchor();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (!posterId) {
    return (
      <div style={emptyStyle}>
        Save your poster first — comments are attached to a specific
        poster.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <NameField name={name} onChange={setName} />

      {!pendingAnchor && (
        <button
          type="button"
          aria-pressed={areaMode}
          onClick={toggleAreaMode}
          style={{
            alignSelf: 'flex-start',
            padding: '6px 10px',
            fontSize: 12,
            fontWeight: areaMode ? 600 : 500,
            color: areaMode ? '#ffffff' : '#b8a9ff',
            background: areaMode
              ? 'rgba(124, 106, 237, 0.55)'
              : 'rgba(124, 106, 237, 0.12)',
            border: `1px solid ${
              areaMode ? '#b8a9ff' : 'rgba(124, 106, 237, 0.35)'
            }`,
            borderRadius: 6,
            cursor: 'pointer',
            boxShadow: areaMode
              ? '0 0 0 3px rgba(184, 169, 255, 0.25), 0 0 16px rgba(124, 106, 237, 0.65)'
              : 'none',
            transition:
              'background 120ms ease, box-shadow 160ms ease, color 120ms ease',
          }}
        >
          {areaMode ? '▣ Drag a rectangle on the canvas' : '▭ Comment on area'}
        </button>
      )}

      <AnchorPreview
        anchor={pendingAnchor}
        onClear={onClearPendingAnchor}
      />

      <DraftField
        value={draft}
        onChange={setDraft}
        onSubmit={submitNew}
        submitting={submitting}
        error={submitError}
        hasPendingAnchor={!!pendingAnchor}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 11,
          color: '#6b7280',
          paddingTop: 6,
          borderTop: '1px solid #2a2a3a',
        }}
      >
        <span>
          {threads.length} thread{threads.length === 1 ? '' : 's'}
        </span>
        <label style={{ display: 'flex', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
          />
          Show resolved
        </label>
      </div>

      {state.error && (
        <div style={errorStyle}>Couldn't load comments: {state.error}</div>
      )}

      {state.loading && filtered.length === 0 && (
        <div style={emptyStyle}>Loading…</div>
      )}

      {!state.loading && filtered.length === 0 && (
        <div style={emptyStyle}>
          {threads.length === 0
            ? 'No comments yet. Highlight text or drag a rectangle on the canvas to anchor feedback to a specific spot.'
            : 'All threads resolved. Toggle "Show resolved" to review them.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map(({ root, replies }) => (
          <ThreadCard
            key={root.id}
            root={root}
            replies={replies}
            state={state}
            isOwner={isOwner}
            currentUserId={currentUserId ?? null}
            authorName={name}
            onAuthorNameChange={setName}
            onJumpToAnchor={onJumpToAnchor}
          />
        ))}
      </div>
    </div>
  );
}

// ── sub-components ────────────────────────────────────────────────

function NameField({
  name,
  onChange,
}: {
  name: string;
  onChange: (n: string) => void;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={labelStyle}>Display name</span>
      <input
        value={name}
        onChange={(e) => {
          onChange(e.target.value);
          writeGuestName(e.target.value);
        }}
        placeholder="Your name (shown next to your comments)"
        maxLength={60}
        style={inputStyle}
      />
    </label>
  );
}

function AnchorPreview({
  anchor,
  onClear,
}: {
  anchor: CommentAnchor | null;
  onClear: () => void;
}) {
  if (!anchor || anchor.type === 'doc') return null;
  const label =
    anchor.type === 'text'
      ? `"${(anchor.quote ?? '').slice(0, 60) || 'highlighted text'}"`
      : anchor.type === 'area'
      ? `Area ${Math.round(anchor.rect[2] / 10)}×${Math.round(anchor.rect[3] / 10)} in`
      : 'Block';
  return (
    <div
      style={{
        padding: '8px 10px',
        background: '#1c1a2e',
        border: '1px solid #7c6aed',
        borderRadius: 6,
        fontSize: 12,
        color: '#c8b6ff',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span style={{ flex: 1 }}>
        Commenting on:{' '}
        <strong style={{ color: '#e2e2e8' }}>{label}</strong>
      </span>
      <button type="button" onClick={onClear} style={iconBtnStyle}>
        ×
      </button>
    </div>
  );
}

function DraftField({
  value,
  onChange,
  onSubmit,
  submitting,
  error,
  hasPendingAnchor,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  hasPendingAnchor: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={
          hasPendingAnchor
            ? 'What should change about this spot?'
            : "Add a note about the poster (or highlight text / drag an area on the canvas to pin feedback)"
        }
        rows={3}
        style={{ ...inputStyle, resize: 'vertical', minHeight: 64 }}
      />
      {error && <div style={errorStyle}>{error}</div>}
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting}
        style={primaryBtnStyle(submitting)}
      >
        {submitting ? 'Posting…' : 'Post comment'}
      </button>
    </div>
  );
}

function ThreadCard({
  root,
  replies,
  state,
  isOwner,
  currentUserId,
  authorName,
  onAuthorNameChange,
  onJumpToAnchor,
}: {
  root: Comment;
  replies: Comment[];
  state: UseCommentsResult;
  isOwner: boolean;
  currentUserId: string | null;
  authorName: string;
  onAuthorNameChange: (n: string) => void;
  onJumpToAnchor?: (c: Comment) => void;
}) {
  const [replyDraft, setReplyDraft] = useState('');
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const resolved = !!root.resolvedAt;

  async function submitReply() {
    setReplyError(null);
    const cleanName = authorName.trim();
    const cleanBody = replyDraft.trim();
    if (!cleanName) return setReplyError('Enter a display name above to reply.');
    if (!cleanBody) return;
    setReplying(true);
    try {
      writeGuestName(cleanName);
      await state.addComment({
        authorName: cleanName,
        body: cleanBody,
        anchor: { type: 'doc' }, // replies inherit their thread's anchor conceptually; server just links via parent_id
        parentId: root.id,
      });
      setReplyDraft('');
    } catch (e) {
      setReplyError(e instanceof Error ? e.message : String(e));
    } finally {
      setReplying(false);
    }
  }

  function canEdit(c: Comment) {
    return isOwner || (!!currentUserId && c.userId === currentUserId);
  }

  // Highlight events — on hover, the poster editor draws a purple
  // outline/rect over the anchored block/area/text so the reviewer
  // can see WHERE a thread is pinned without jumping away. On click,
  // we promote to a "focus" highlight that persists until another
  // thread is focused or the user clears selection on the canvas.
  function broadcast(type: 'hover' | 'focus' | 'blur') {
    window.dispatchEvent(
      new CustomEvent(`postr:comment-${type}`, {
        detail: { id: root.id, anchor: root.anchor },
      }),
    );
  }
  return (
    <div
      onMouseEnter={() => broadcast('hover')}
      onMouseLeave={() => broadcast('blur')}
      onClick={(e) => {
        // Ignore clicks that bubbled from inner inputs/buttons.
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
        broadcast('focus');
      }}
      style={{
        padding: 12,
        borderRadius: 8,
        border: `1px solid ${resolved ? '#2a3a2a' : '#2a2a3a'}`,
        background: resolved ? '#0f1a14' : '#13131c',
        opacity: resolved ? 0.7 : 1,
        cursor: 'pointer',
      }}
    >
      <CommentBody
        c={root}
        canEdit={canEdit(root)}
        canDelete={canEdit(root)}
        onEdit={(body) => state.editComment(root.id, body)}
        onDelete={() => state.removeComment(root.id)}
        onJump={onJumpToAnchor}
      />

      {replies.length > 0 && (
        <div
          style={{
            marginTop: 10,
            paddingLeft: 12,
            borderLeft: '2px solid #2a2a3a',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {replies.map((r) => (
            <CommentBody
              key={r.id}
              c={r}
              canEdit={canEdit(r)}
              canDelete={canEdit(r)}
              onEdit={(body) => state.editComment(r.id, body)}
              onDelete={() => state.removeComment(r.id)}
            />
          ))}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 6,
          marginTop: 10,
          alignItems: 'flex-start',
        }}
      >
        <input
          value={replyDraft}
          onChange={(e) => setReplyDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submitReply();
            }
          }}
          placeholder="Reply…"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          type="button"
          onClick={submitReply}
          disabled={replying || !replyDraft.trim()}
          style={secondaryBtnStyle(replying || !replyDraft.trim())}
        >
          Reply
        </button>
      </div>
      {replyError && <div style={errorStyle}>{replyError}</div>}

      {(isOwner || canEdit(root)) && (
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => state.resolveComment(root.id, !resolved)}
            style={linkBtnStyle}
          >
            {resolved ? 'Reopen' : 'Mark resolved'}
          </button>
        </div>
      )}
    </div>
  );
}

function CommentBody({
  c,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  onJump,
}: {
  c: Comment;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (body: string) => Promise<Comment>;
  onDelete: () => Promise<void>;
  onJump?: (c: Comment) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.body);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await onEdit(draft);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  const anchorLabel =
    c.anchor.type === 'text'
      ? `📝 "${(c.anchor.quote ?? '').slice(0, 40) || 'text'}"`
      : c.anchor.type === 'area'
      ? `▭ area`
      : c.anchor.type === 'block'
      ? `◧ block`
      : null;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          fontSize: 11,
          color: '#9b9ba5',
        }}
      >
        <strong style={{ color: '#e2e2e8', fontSize: 12 }}>
          {c.authorName}
        </strong>
        <span>{formatRelative(c.createdAt)}</span>
        {anchorLabel && onJump && (
          <button
            type="button"
            onClick={() => onJump(c)}
            style={linkBtnStyle}
            title="Jump to anchor"
          >
            {anchorLabel}
          </button>
        )}
      </div>
      {editing ? (
        <div style={{ marginTop: 6 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            style={{ ...inputStyle, width: '100%', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              style={secondaryBtnStyle(busy)}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(c.body);
              }}
              style={linkBtnStyle}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            marginTop: 4,
            color: '#e2e2e8',
            fontSize: 13,
            lineHeight: 1.45,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {c.body}
        </div>
      )}
      {(canEdit || canDelete) && !editing && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 4,
            fontSize: 11,
          }}
        >
          {canEdit && (
            <button type="button" onClick={() => setEditing(true)} style={linkBtnStyle}>
              Edit
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              style={linkBtnStyle}
            >
              Delete
            </button>
          )}
        </div>
      )}
      <ConfirmModal
        open={confirmingDelete}
        title="Delete comment?"
        message="This will permanently remove the comment and any replies. This can't be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={async () => {
          setConfirmingDelete(false);
          await onDelete();
        }}
      />
    </div>
  );
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ── styles (match Sidebar aesthetic) ──────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  color: '#9b9ba5',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 13,
  color: '#e2e2e8',
  background: '#1a1a26',
  border: '1px solid #2a2a3a',
  borderRadius: 6,
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const emptyStyle: React.CSSProperties = {
  padding: '20px 12px',
  fontSize: 12,
  color: '#8a8a95',
  textAlign: 'center',
  background: '#13131c',
  border: '1px dashed #2a2a3a',
  borderRadius: 8,
  lineHeight: 1.5,
};

const errorStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 12,
  color: '#ffb4b4',
  background: '#2a1818',
  border: '1px solid #6e2d2d',
  borderRadius: 6,
};

const iconBtnStyle: React.CSSProperties = {
  all: 'unset',
  cursor: 'pointer',
  color: '#9b9ba5',
  fontSize: 14,
  padding: '2px 6px',
};

const linkBtnStyle: React.CSSProperties = {
  all: 'unset',
  cursor: 'pointer',
  color: '#a78bfa',
  fontSize: 11,
  textDecoration: 'underline',
  textDecorationColor: 'transparent',
};

function primaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    all: 'unset',
    cursor: disabled ? 'not-allowed' : 'pointer',
    padding: '8px 14px',
    background: disabled ? '#443e7a' : '#7c6aed',
    color: '#fff',
    borderRadius: 6,
    fontWeight: 700,
    fontSize: 12,
    textAlign: 'center',
    opacity: disabled ? 0.7 : 1,
  };
}

function secondaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    all: 'unset',
    cursor: disabled ? 'not-allowed' : 'pointer',
    padding: '6px 10px',
    background: disabled ? '#2a2a3a' : '#3a3a4a',
    color: '#e2e2e8',
    borderRadius: 6,
    fontWeight: 600,
    fontSize: 12,
    opacity: disabled ? 0.6 : 1,
  };
}
