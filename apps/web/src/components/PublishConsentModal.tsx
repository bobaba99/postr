/**
 * PublishConsentModal — a hard gate before a poster leaves private space.
 *
 * Shown before:
 *   - publishing a poster to the public gallery (mode="publish")
 *   - creating a read-only share link for anyone with the URL (mode="share")
 *
 * The user must tick every checkbox before the confirm button enables.
 * The content mirrors Section 5.3 of the Terms of Service so that no
 * user can plausibly claim they were not warned about copyright, co-author
 * consent, and retraction responsibilities.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

type Mode = 'publish' | 'share';

interface Props {
  open: boolean;
  mode: Mode;
  posterTitle?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

interface Clause {
  id: string;
  label: React.ReactNode;
}

const PUBLISH_CLAUSES: Clause[] = [
  {
    id: 'owner',
    label: (
      <>
        I am the <strong className="text-[#e2e2e8]">rightful owner</strong> of every
        element of this poster — text, figures, photos, logos, data — or I have
        written permission from every rights-holder to display them publicly.
      </>
    ),
  },
  {
    id: 'coauthors',
    label: (
      <>
        All <strong className="text-[#e2e2e8]">co-authors</strong> named on the
        poster have agreed to its public display.
      </>
    ),
  },
  {
    id: 'confidential',
    label: (
      <>
        The poster contains <strong className="text-[#e2e2e8]">no confidential,
        embargoed, or export-controlled</strong> material.
      </>
    ),
  },
  {
    id: 'retract',
    label: (
      <>
        I understand Postr is a sharing platform, not a publisher. Third parties may
        cache, download, or index the poster while it is public. I will{' '}
        <strong className="text-[#e2e2e8]">retract the poster promptly</strong> if my
        ownership or permission changes.
      </>
    ),
  },
];

const SHARE_CLAUSES: Clause[] = [
  {
    id: 'owner',
    label: (
      <>
        I am the <strong className="text-[#e2e2e8]">rightful owner</strong> of
        everything on this poster, or I have permission to share it with the people I
        intend to show it to.
      </>
    ),
  },
  {
    id: 'link',
    label: (
      <>
        I understand that anyone with the share link can open the poster — Postr
        does <strong className="text-[#e2e2e8]">not password-protect</strong> share
        links, and recipients may forward the URL or take screenshots.
      </>
    ),
  },
  {
    id: 'revoke',
    label: (
      <>
        I can revoke the share link at any time from my dashboard, but existing
        copies made while it was active cannot be recalled.
      </>
    ),
  },
];

const COPY = {
  publish: {
    title: 'Publish to the public gallery?',
    intro:
      'Anything you publish to the gallery is visible to everyone on the internet, including people who do not have a Postr account. It may be indexed by search engines. Read each statement below carefully.',
    confirmLabel: 'Publish',
  },
  share: {
    title: 'Create a shareable link?',
    intro:
      'Share links are read-only URLs that anyone with the link can open. Use them for advisors and co-authors, but treat the link itself like a password.',
    confirmLabel: 'Create link',
  },
} as const;

export function PublishConsentModal({
  open,
  mode,
  posterTitle,
  onConfirm,
  onCancel,
}: Props) {
  const clauses = mode === 'publish' ? PUBLISH_CLAUSES : SHARE_CLAUSES;
  const copy = COPY[mode];

  // Track which clauses have been accepted. Keyed by clause id so the
  // set survives re-renders cleanly.
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});

  // Reset state whenever the modal opens or the mode changes. Prevents
  // "already ticked" state leaking between a share flow and a publish
  // flow on the same poster card.
  useEffect(() => {
    if (open) setAccepted({});
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  const allAccepted = clauses.every((c) => accepted[c.id]);

  function toggle(id: string) {
    setAccepted((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div
      data-postr-modal-backdrop
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        padding: 16,
      }}
    >
      <div
        data-postr-modal-content
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#111118',
          border: '1px solid #2a2a3a',
          borderRadius: 12,
          padding: 28,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
      >
        <h3
          style={{
            margin: '0 0 4px',
            fontSize: 18,
            fontWeight: 700,
            color: '#e2e2e8',
          }}
        >
          {copy.title}
        </h3>
        {posterTitle && (
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
            “{posterTitle}”
          </div>
        )}

        <div
          style={{
            margin: '12px 0 20px',
            padding: '14px 16px',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 8,
            fontSize: 13,
            lineHeight: 1.55,
            color: '#f59e0b',
          }}
        >
          {copy.intro}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          {clauses.map((clause) => {
            const isChecked = !!accepted[clause.id];
            return (
              <label
                key={clause.id}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '12px 14px',
                  background: isChecked ? 'rgba(124, 106, 237, 0.08)' : '#1a1a26',
                  border: `1px solid ${isChecked ? '#7c6aed' : '#2a2a3a'}`,
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: '#9ca3af',
                  transition: 'background 120ms, border-color 120ms',
                }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(clause.id)}
                  style={{
                    marginTop: 3,
                    flexShrink: 0,
                    width: 16,
                    height: 16,
                    accentColor: '#7c6aed',
                    cursor: 'pointer',
                  }}
                />
                <span>{clause.label}</span>
              </label>
            );
          })}
        </div>

        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 20 }}>
          By continuing you confirm the above and acknowledge the{' '}
          <Link
            to="/terms"
            style={{ color: '#7c6aed', textDecoration: 'underline' }}
            target="_blank"
            rel="noopener noreferrer"
          >
            Terms of Service
          </Link>
          , including your content warranties and indemnity in Section 5.
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onCancel}
            style={{
              cursor: 'pointer',
              padding: '9px 18px',
              fontSize: 13,
              fontWeight: 500,
              color: '#c8cad0',
              background: '#1a1a26',
              border: '1px solid #2a2a3a',
              borderRadius: 6,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!allAccepted}
            style={{
              cursor: allAccepted ? 'pointer' : 'not-allowed',
              padding: '9px 18px',
              fontSize: 13,
              fontWeight: 600,
              color: '#fff',
              background: '#7c6aed',
              border: 'none',
              borderRadius: 6,
              opacity: allAccepted ? 1 : 0.4,
            }}
          >
            {copy.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
