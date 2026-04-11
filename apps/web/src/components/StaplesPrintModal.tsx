/**
 * StaplesPrintModal — step-by-step helper for printing at Staples.
 *
 * Staples' "Print & Go" mobile service lets customers email a PDF to
 * `staplesmobile@printme.com`, receive an 8-digit code, and release
 * the print at any kiosk without transferring files on a USB drive
 * or creating an account. This modal walks students through the flow
 * directly from the editor so they don't have to hunt for the email
 * address or miss a step.
 *
 *   1. Save the poster as PDF (triggers the browser Save dialog)
 *   2. Open email client pre-addressed to staplesmobile@printme.com
 *   3. Attach the PDF and send
 *   4. Wait for the 8-digit release code email back from Staples
 *   5. At any Staples kiosk → "Mobile Device" → enter the code → print
 */
import { useEffect, useState } from 'react';

const STAPLES_EMAIL = 'staplesmobile@printme.com';

interface Props {
  open: boolean;
  posterTitle: string;
  onClose: () => void;
  onSavePdf: () => void;
}

export function StaplesPrintModal({
  open,
  posterTitle,
  onClose,
  onSavePdf,
}: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  // Pre-compose URLs for the three common webmail clients students
  // use (Gmail / Outlook / Yahoo). We deliberately DO NOT include a
  // plain `mailto:` fallback — it silently fails for any user who
  // doesn't have a default mail client configured at the OS level,
  // and the copy-address button already covers every other case
  // (ProtonMail, Fastmail, iCloud, university webmail, …).
  //
  // Subject is pre-filled from the poster title so the reply from
  // Staples threads sensibly in the user's inbox. Body is left BLANK
  // on purpose — Staples' printme.com service only looks at the
  // attachment, so any body text just adds noise for the user to
  // delete before they attach their PDF.
  const rawSubject = posterTitle
    ? `Poster: ${posterTitle}`
    : 'Poster for printing';
  const enc = encodeURIComponent;

  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(STAPLES_EMAIL)}&su=${enc(rawSubject)}`;
  const outlookUrl = `https://outlook.live.com/mail/0/deeplink/compose?to=${enc(STAPLES_EMAIL)}&subject=${enc(rawSubject)}`;
  const yahooUrl = `https://compose.mail.yahoo.com/?to=${enc(STAPLES_EMAIL)}&subject=${enc(rawSubject)}`;

  function handleCopy() {
    navigator.clipboard
      ?.writeText(STAPLES_EMAIL)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // Older browsers / insecure contexts — fall back to a prompt.
        window.prompt('Copy this email address:', STAPLES_EMAIL);
      });
  }

  return (
    <div
      onClick={onClose}
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
          maxWidth: 560,
          maxHeight: '92vh',
          overflowY: 'auto',
          background: '#111118',
          border: '1px solid #2a2a3a',
          borderRadius: 12,
          padding: 28,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          color: '#c8cad0',
        }}
      >
        <h3
          style={{
            margin: '0 0 6px',
            fontSize: 18,
            fontWeight: 700,
            color: '#e2e2e8',
          }}
        >
          🏪 Print at Staples
        </h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#9ca3af', lineHeight: 1.55 }}>
          Staples' Print &amp; Go flow — email your PDF, get a release code,
          print at any kiosk. No USB drive, no Staples account, no upload
          portal.
        </p>

        <ol
          style={{
            margin: 0,
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <Step
            index={1}
            title="Save your poster as PDF"
            body={
              <>
                Use your browser's Save as PDF dialog. Set layout to{' '}
                <strong style={{ color: '#c8cad0' }}>Landscape</strong>, margins
                to <strong style={{ color: '#c8cad0' }}>None</strong>, and
                enable <strong style={{ color: '#c8cad0' }}>Background graphics</strong>{' '}
                so fills don't print white.
              </>
            }
          >
            <button
              type="button"
              onClick={onSavePdf}
              style={primaryBtnStyle}
            >
              ⎙ Open Save as PDF dialog
            </button>
          </Step>

          <Step
            index={2}
            title="Email the PDF to Staples"
            body={
              <>
                Attach the PDF you just saved and send it to{' '}
                <code
                  style={{
                    background: '#1a1a26',
                    padding: '2px 6px',
                    borderRadius: 4,
                    color: '#c8b6ff',
                    fontSize: 12,
                  }}
                >
                  {STAPLES_EMAIL}
                </code>
                . Pick whichever mail client you actually use — subject and
                body are optional. Staples only needs the attachment.
              </>
            }
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <a
                href={gmailUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  ...primaryBtnStyle,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span role="img" aria-label="Gmail">📧</span> Gmail
              </a>
              <a
                href={outlookUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  ...secondaryBtnStyle,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span role="img" aria-label="Outlook">📨</span> Outlook
              </a>
              <a
                href={yahooUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  ...secondaryBtnStyle,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span role="img" aria-label="Yahoo">📬</span> Yahoo
              </a>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              style={{
                ...secondaryBtnStyle,
                marginTop: 8,
                background: copied ? '#0f3f2a' : secondaryBtnStyle.background,
                color: copied ? '#a6e3a1' : secondaryBtnStyle.color,
                borderColor: copied ? '#2d6a4f' : '#2a2a3a',
              }}
            >
              {copied ? '✓ Copied' : '📋 Copy email address'}
            </button>
            <div
              style={{
                marginTop: 8,
                padding: '8px 10px',
                background: 'rgba(124, 106, 237, 0.08)',
                border: '1px solid rgba(124, 106, 237, 0.25)',
                borderRadius: 6,
                fontSize: 11,
                color: '#c8b6ff',
                lineHeight: 1.55,
              }}
            >
              <strong>⚠️ Don't forget to attach the PDF.</strong> The email
              body can be left blank — Staples only reads the attachment.
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                color: '#6b7280',
                lineHeight: 1.55,
              }}
            >
              Using ProtonMail, Fastmail, iCloud, or a university webmail? Tap
              "Copy email address" and paste it into a new message in your
              own mail client.
            </div>
          </Step>

          <Step
            index={3}
            title="Wait for the 8-digit release code"
            body={
              <>
                Staples will reply within a few minutes with an email
                containing an 8-digit code. This code unlocks your print job
                at any Staples location.
              </>
            }
          />

          <Step
            index={4}
            title="Print at any Staples kiosk"
            body={
              <>
                Walk up to a self-serve print kiosk → select{' '}
                <strong style={{ color: '#c8cad0' }}>"Mobile Device"</strong>{' '}
                (sometimes "Print from Mobile" or "Email") → enter the 8-digit
                code → pick paper size and pay. Your poster prints right
                away.
              </>
            }
          />
        </ol>

        <div
          style={{
            marginTop: 18,
            padding: '10px 12px',
            background: 'rgba(124, 106, 237, 0.08)',
            border: '1px solid rgba(124, 106, 237, 0.25)',
            borderRadius: 8,
            fontSize: 12,
            color: '#9ca3af',
            lineHeight: 1.55,
          }}
        >
          💡 <strong style={{ color: '#c8b6ff' }}>Tip:</strong> Some campus Staples
          stores require 24–48h lead time for large-format poster printing.
          Ask the associate about in-stock paper sizes (A0, A1, 36×48") before
          committing the print job.
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginTop: 20,
          }}
        >
          <button type="button" onClick={onClose} style={secondaryBtnStyle}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({
  index,
  title,
  body,
  children,
}: {
  index: number;
  title: string;
  body: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <li
      style={{
        display: 'flex',
        gap: 12,
        padding: '12px 14px',
        background: '#0a0a12',
        border: '1px solid #1f1f2e',
        borderRadius: 8,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: '#7c6aed',
          color: '#fff',
          fontWeight: 700,
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {index}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e2e8' }}>
          {title}
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: 12,
            color: '#9ca3af',
            lineHeight: 1.55,
          }}
        >
          {body}
        </div>
        {children && <div style={{ marginTop: 10 }}>{children}</div>}
      </div>
    </li>
  );
}

// ── Button styles ──────────────────────────────────────────────────

const primaryBtnStyle: React.CSSProperties = {
  cursor: 'pointer',
  padding: '9px 16px',
  fontSize: 13,
  fontWeight: 600,
  color: '#fff',
  background: '#7c6aed',
  border: 'none',
  borderRadius: 6,
};

const secondaryBtnStyle: React.CSSProperties = {
  cursor: 'pointer',
  padding: '9px 16px',
  fontSize: 13,
  fontWeight: 500,
  color: '#c8cad0',
  background: '#1a1a26',
  border: '1px solid #2a2a3a',
  borderRadius: 6,
};
