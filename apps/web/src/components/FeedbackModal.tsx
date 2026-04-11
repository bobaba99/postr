/**
 * FeedbackModal — dark-themed modal for submitting bug reports,
 * feature requests, or general notes. Wired to the global
 * `useFeedbackStore`; render once near the app root so any page
 * can open it.
 */
import { useEffect, useRef, useState } from 'react';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { submitFeedback, type FeedbackKind } from '@/data/feedback';

const KINDS: Array<{ value: FeedbackKind; label: string; hint: string }> = [
  { value: 'bug', label: 'Bug', hint: 'Something broken or unexpected' },
  { value: 'feature', label: 'Feature', hint: 'An idea or missing capability' },
  { value: 'other', label: 'Other', hint: 'Questions, praise, anything else' },
];

export function FeedbackModal() {
  const isOpen = useFeedbackStore((s) => s.isOpen);
  const initialKind = useFeedbackStore((s) => s.initialKind);
  const close = useFeedbackStore((s) => s.close);

  const [kind, setKind] = useState<FeedbackKind>(initialKind);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setKind(initialKind);
      setTitle('');
      setBody('');
      setError(null);
      setDone(false);
      setSubmitting(false);
      // Focus the title field on open (next tick so the input exists).
      requestAnimationFrame(() => titleRef.current?.focus());
    }
  }, [isOpen, initialKind]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, close]);

  if (!isOpen) return null;

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await submitFeedback({ kind, title, body });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          background: '#111118',
          border: '1px solid #2a2a3a',
          borderRadius: 12,
          padding: 24,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
      >
        {done ? (
          <SuccessView onClose={close} />
        ) : (
          <>
            <h3
              style={{
                margin: '0 0 6px',
                fontSize: 16,
                fontWeight: 600,
                color: '#e2e2e8',
              }}
            >
              Send feedback
            </h3>
            <p
              style={{
                margin: '0 0 20px',
                fontSize: 13,
                lineHeight: 1.5,
                color: '#9ca3af',
              }}
            >
              Bug reports and feature requests go straight to the developer. We read
              everything — thank you for taking the time.
            </p>

            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#c8cad0',
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Type
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {KINDS.map((k) => {
                  const active = kind === k.value;
                  return (
                    <button
                      key={k.value}
                      type="button"
                      onClick={() => setKind(k.value)}
                      disabled={submitting}
                      style={{
                        cursor: submitting ? 'not-allowed' : 'pointer',
                        padding: '10px 12px',
                        background: active ? '#7c6aed' : '#1a1a26',
                        border: `1px solid ${active ? '#7c6aed' : '#2a2a3a'}`,
                        color: active ? '#fff' : '#c8cad0',
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: active ? 600 : 500,
                        textAlign: 'left',
                      }}
                    >
                      <div>{k.label}</div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 400,
                          color: active ? 'rgba(255,255,255,0.8)' : '#6b7280',
                          marginTop: 2,
                        }}
                      >
                        {k.hint}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="feedback-title"
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#c8cad0',
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Title
              </label>
              <input
                ref={titleRef}
                id="feedback-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  kind === 'bug' ? 'Short summary of the issue' : 'A one-line headline'
                }
                maxLength={120}
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: 14,
                  color: '#e2e2e8',
                  background: '#1a1a26',
                  border: '1px solid #2a2a3a',
                  borderRadius: 6,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label
                htmlFor="feedback-body"
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#c8cad0',
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Details
              </label>
              <textarea
                id="feedback-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={
                  kind === 'bug'
                    ? 'What did you expect to happen? What actually happened? Steps to reproduce if you remember.'
                    : 'Describe what you would like to see. The more context the better.'
                }
                maxLength={4000}
                rows={6}
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: 14,
                  lineHeight: 1.5,
                  color: '#e2e2e8',
                  background: '#1a1a26',
                  border: '1px solid #2a2a3a',
                  borderRadius: 6,
                  outline: 'none',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4, textAlign: 'right' }}>
                {body.length} / 4000
              </div>
            </div>

            {error && (
              <div
                role="alert"
                style={{
                  marginBottom: 16,
                  padding: '10px 12px',
                  background: 'rgba(220, 38, 38, 0.1)',
                  border: '1px solid rgba(220, 38, 38, 0.3)',
                  borderRadius: 6,
                  color: '#f87171',
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={close}
                disabled={submitting}
                style={{
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  padding: '8px 16px',
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
                onClick={handleSubmit}
                disabled={submitting || title.trim().length === 0 || body.trim().length === 0}
                style={{
                  cursor:
                    submitting || title.trim().length === 0 || body.trim().length === 0
                      ? 'not-allowed'
                      : 'pointer',
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#fff',
                  background: '#7c6aed',
                  border: 'none',
                  borderRadius: 6,
                  opacity:
                    submitting || title.trim().length === 0 || body.trim().length === 0 ? 0.4 : 1,
                }}
              >
                {submitting ? 'Sending…' : 'Send'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SuccessView({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '12px 0' }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'rgba(124, 106, 237, 0.15)',
          border: '1px solid rgba(124, 106, 237, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
          fontSize: 28,
        }}
      >
        ✓
      </div>
      <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: '#e2e2e8' }}>
        Thanks — got it.
      </h3>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: '#9ca3af', lineHeight: 1.5 }}>
        Your feedback is in the queue. If you left contact info in your profile, we may reach
        out with follow-up questions.
      </p>
      <button
        onClick={onClose}
        style={{
          cursor: 'pointer',
          padding: '8px 20px',
          fontSize: 13,
          fontWeight: 600,
          color: '#fff',
          background: '#7c6aed',
          border: 'none',
          borderRadius: 6,
        }}
      >
        Close
      </button>
    </div>
  );
}
