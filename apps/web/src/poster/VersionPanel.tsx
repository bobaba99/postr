/**
 * VersionPanel — the "Versions" sidebar tab.
 *
 * Lists a poster's saved version snapshots (newest first), lets the
 * user save a new named checkpoint, restore any previous snapshot, or
 * delete one. Restore is non-destructive: PosterEditor auto-saves the
 * current state as a "Before restore" version before loading the chosen
 * snapshot (wired via the onRestoreVersion callback).
 *
 * Data reads (list) and deletes happen here directly; save + restore go
 * through PosterEditor callbacks because they need the Zustand store
 * (current doc + setPoster). Any version mutation dispatches a
 * `postr:versions-changed` window event; this panel listens and
 * refetches, so a Cmd+S save elsewhere keeps the list in sync.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  listVersions,
  deleteVersion,
  MAX_VERSIONS_PER_POSTER,
  VERSION_WARNING_THRESHOLD,
  type PosterVersionSummary,
} from '@/data/posterVersions';
import { ConfirmModal } from '@/components/ConfirmModal';

interface Props {
  posterId: string | null;
  onSaveVersion: (name: string) => Promise<void>;
  onRestoreVersion: (versionId: string) => Promise<void>;
}

/** "Jul 2, 5:30 PM" — used as the display label for unnamed versions. */
function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function VersionPanel({ posterId, onSaveVersion, onRestoreVersion }: Props) {
  const [versions, setVersions] = useState<PosterVersionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<PosterVersionSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PosterVersionSummary | null>(null);

  const refresh = useCallback(async () => {
    if (!posterId) return;
    setLoading(true);
    try {
      setVersions(await listVersions(posterId));
      setError(null);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to load versions:', err);
      setError('Could not load versions. Try reopening this tab.');
    } finally {
      setLoading(false);
    }
  }, [posterId]);

  useEffect(() => {
    void refresh();
    const onChanged = () => void refresh();
    window.addEventListener('postr:versions-changed', onChanged);
    return () => window.removeEventListener('postr:versions-changed', onChanged);
  }, [refresh]);

  if (!posterId) {
    return (
      <div style={emptyStyle}>
        Save your poster first — versions are attached to a specific poster.
      </div>
    );
  }

  const atLimit = versions.length >= MAX_VERSIONS_PER_POSTER;
  const nearLimit = versions.length >= VERSION_WARNING_THRESHOLD;

  async function handleSave() {
    if (busy || atLimit) return;
    setBusy(true);
    setError(null);
    try {
      await onSaveVersion(name.trim());
      setName('');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to save version:', err);
      setError('Could not save this version. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmRestore() {
    const target = restoreTarget;
    setRestoreTarget(null);
    if (!target || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onRestoreVersion(target.id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to restore version:', err);
      setError('Could not restore this version. Your current work is unchanged.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteVersion(target.id);
      window.dispatchEvent(new Event('postr:versions-changed'));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete version:', err);
      setError('Could not delete this version. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#e2e2e8' }}>
          Versions ({versions.length})
        </h3>
      </div>

      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: '#9ca3af' }}>
        Save a checkpoint you can return to. Restoring first auto-saves your
        current work, so nothing is lost.
      </p>

      {/* Save row */}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Optional name (e.g. Before advisor review)"
          aria-label="Version name (optional)"
          disabled={busy || atLimit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSave();
          }}
          style={{
            flex: 1,
            minWidth: 0,
            padding: '8px 10px',
            fontSize: 12,
            color: '#e2e2e8',
            background: '#1a1a26',
            border: '1px solid #2a2a3a',
            borderRadius: 6,
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={busy || atLimit}
          style={{
            flex: '0 0 auto',
            padding: '8px 14px',
            fontSize: 12,
            fontWeight: 600,
            color: '#fff',
            background: busy || atLimit ? '#3a3550' : '#7c6aed',
            border: 'none',
            borderRadius: 6,
            cursor: busy || atLimit ? 'not-allowed' : 'pointer',
            opacity: busy || atLimit ? 0.6 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          Save version
        </button>
      </div>

      {atLimit ? (
        <div style={warnStyle}>
          You've hit the {MAX_VERSIONS_PER_POSTER}-version limit. Delete an old
          version to save a new one.
        </div>
      ) : nearLimit ? (
        <div style={warnStyle}>
          {versions.length} of {MAX_VERSIONS_PER_POSTER} versions used.
        </div>
      ) : null}

      {error && <div style={errorStyle}>{error}</div>}

      {/* List */}
      {loading && versions.length === 0 ? (
        <div style={emptyStyle}>Loading…</div>
      ) : versions.length === 0 ? (
        <div style={emptyStyle}>
          No versions yet. Save one above, or press Cmd/Ctrl+S.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {versions.map((v) => (
            <li
              key={v.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                background: '#15151f',
                border: '1px solid #23232f',
                borderRadius: 6,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: '#e2e2e8',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={v.name || formatTimestamp(v.created_at)}
                >
                  {v.name || formatTimestamp(v.created_at)}
                </div>
                {v.name ? (
                  <div style={{ fontSize: 11, color: '#6b7280' }}>
                    {formatTimestamp(v.created_at)}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setRestoreTarget(v)}
                disabled={busy}
                style={rowBtnStyle('#b8a9ff', busy)}
              >
                Restore
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(v)}
                disabled={busy}
                aria-label="Delete version"
                style={rowBtnStyle('#f38ba8', busy)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        open={restoreTarget !== null}
        title="Restore this version?"
        message="This replaces your current poster with the saved snapshot. Your current state is auto-saved as a version first, so you can undo this by restoring it back."
        confirmLabel="Restore"
        cancelLabel="Cancel"
        onConfirm={() => void confirmRestore()}
        onCancel={() => setRestoreTarget(null)}
      />

      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete this version?"
        message={`"${deleteTarget?.name || (deleteTarget ? formatTimestamp(deleteTarget.created_at) : '')}" will be permanently removed. This can't be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

const emptyStyle: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  color: '#6b7280',
  padding: '12px 0',
};

const warnStyle: React.CSSProperties = {
  fontSize: 11,
  lineHeight: 1.4,
  color: '#f9e2af',
  background: 'rgba(249, 226, 175, 0.08)',
  border: '1px solid rgba(249, 226, 175, 0.25)',
  borderRadius: 6,
  padding: '6px 8px',
};

const errorStyle: React.CSSProperties = {
  fontSize: 11,
  lineHeight: 1.4,
  color: '#f38ba8',
  background: 'rgba(243, 139, 168, 0.08)',
  border: '1px solid rgba(243, 139, 168, 0.25)',
  borderRadius: 6,
  padding: '6px 8px',
};

function rowBtnStyle(color: string, busy: boolean): React.CSSProperties {
  return {
    flex: '0 0 auto',
    padding: '5px 9px',
    fontSize: 11,
    fontWeight: 600,
    color,
    background: 'transparent',
    border: `1px solid ${color}55`,
    borderRadius: 5,
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.5 : 1,
  };
}
