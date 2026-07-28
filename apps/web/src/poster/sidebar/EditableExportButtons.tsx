/**
 * EditableExportButtons — the "keep editing elsewhere" exports:
 * PowerPoint (.pptx) and LaTeX (.zip).
 *
 * Both writers are pure `PosterDoc → bytes` modules loaded via
 * dynamic import, so fflate/pptxgenjs and the writer code stay out
 * of the editor bundle for users who never export.
 *
 * PowerPoint's 56-inch ceiling is surfaced HERE, before export —
 * silent scaling is how someone prints a 36-inch poster for a
 * 72-inch board. Beyond 112 in the PPTX button is disabled and the
 * copy steers to LaTeX/PDF, which have no size limit.
 *
 * Reads from `usePosterStore` directly (same pattern as
 * PostrExportButton) so the host tab needs no new plumbing beyond
 * the citation style used to render the references block.
 */
import { useState } from 'react';
import { BusyIndicator, busyProps } from '@/components/BusyIndicator';
import { usePosterStore } from '@/stores/posterStore';
import type { CitationStyleKey } from '@/poster/citations';
import { PPTX_MAX_DIMENSION_IN } from '@/export/units';
import { usePlan } from '@/hooks/usePlan';
import { createCheckout, consumeExportCredit as consumeCreditApi } from '@/data/billing';

type ExportKind = 'latex' | 'pptx';

interface ExportState {
  busy: ExportKind | null;
  done: ExportKind | null;
  /** Product-toned notes from the writer (fit approximations etc.). */
  notes: string[];
  failed: boolean;
}

const IDLE: ExportState = { busy: null, done: null, notes: [], failed: false };

function downloadBytes(bytes: Uint8Array, fileName: string, mime: string): void {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const blob = new Blob([buf as ArrayBuffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const exportButtonStyle = (
  disabled: boolean,
  done: boolean,
  accent: string,
  border: string,
): React.CSSProperties => ({
  padding: '14px 20px',
  background: '#1a1a26',
  color: done ? '#a6e3a1' : accent,
  border: `1px solid ${done ? '#3a5a3a' : border}`,
  borderRadius: 8,
  cursor: disabled ? 'wait' : 'pointer',
  fontSize: 15,
  fontWeight: 600,
  textAlign: 'center',
  width: '100%',
  opacity: disabled ? 0.65 : 1,
});

const hintStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#6b7280',
  marginTop: 6,
  lineHeight: 1.5,
};

export function EditableExportButtons({
  citationStyle,
}: {
  citationStyle: CitationStyleKey;
}) {
  const doc = usePosterStore((s) => s.doc);
  const posterTitle = usePosterStore((s) => s.posterTitle);
  const plan = usePlan();
  const [state, setState] = useState<ExportState>(IDLE);

  // The paywall (docs/plans/2026-07-28-payment-and-paywall.md): editable
  // exports are paid. Unlock on an active term (unlimited) or an export
  // credit from the $9.99 pack. A credit-based export spends one credit
  // (server-side, after the bytes are produced); a term export does not.
  const canExport = plan.canExport;
  const usesCredit = !plan.hasActiveTerm && plan.credits > 0;

  // The 56-inch ceiling, surfaced BEFORE export (plan §2 req. 1).
  const overCeiling =
    !!doc &&
    (doc.widthIn > PPTX_MAX_DIMENSION_IN || doc.heightIn > PPTX_MAX_DIMENSION_IN);
  const beyondHalf =
    !!doc &&
    (doc.widthIn > PPTX_MAX_DIMENSION_IN * 2 || doc.heightIn > PPTX_MAX_DIMENSION_IN * 2);

  async function run(kind: ExportKind, job: () => Promise<string[]>) {
    if (!doc || state.busy) return;
    // Paywall gate: a user without an active term or a credit can't run
    // an editable export — the button is disabled and the upgrade prompt
    // is shown instead, so this is a belt-and-suspenders guard.
    if (!canExport) return;
    setState({ ...IDLE, busy: kind });
    try {
      const notes = await job();
      // Credit-based export: spend one credit AFTER the bytes are
      // produced, so a failed export never burns a credit. Server-side,
      // because export_credits is server-owned. A term export skips this.
      if (usesCredit) {
        await consumeExportCredit();
      }
      setState({ busy: null, done: kind, notes, failed: false });
      setTimeout(() => setState((s) => ({ ...s, done: null })), 2500);
    } catch (err) {
      // House rule: the user-facing message stays generic. But the
      // error itself must not vanish — an earlier revision swallowed it
      // entirely, which is why a real pptxgenjs failure (it cannot embed
      // SVG, so the seeded acknowledgement mark threw) surfaced only as
      // "Something went wrong" with nothing in the console to diagnose.
      // Log it so the Send Feedback capture and any future debugging
      // have the actual cause.
      console.error(`[export:${kind}]`, err);
      setState({ busy: null, done: null, notes: [], failed: true });
    }
  }

  // Spend one credit after a successful credit-based export. Best-effort:
  // the file is already downloaded, so a failure here must NOT make the
  // export look failed — log and move on. (Worst case the user keeps a
  // credit they used; acceptable, and far better than a "failed" export
  // that actually succeeded.)
  async function consumeExportCredit() {
    try {
      await consumeCreditApi();
    } catch (err) {
      console.error('[billing] consume-credit failed (export already done):', err);
    }
  }

  async function startCheckout(sku: 'term' | 'pack') {
    try {
      const url = await createCheckout(sku);
      window.location.href = url;
    } catch (err) {
      console.error('[billing] checkout failed:', err);
      setState((s) => ({ ...s, failed: true }));
    }
  }

  const handlePptx = () =>
    run('pptx', async () => {
      const [{ exportPosterPptx }, { safeFileBaseName }] = await Promise.all([
        import('@/export/pptx/writer'),
        import('@/export/posterContent'),
      ]);
      const { bytes, note, warnings } = await exportPosterPptx(doc!, {
        citationStyle,
        attribution: { paidPlan: canExport },
      });
      downloadBytes(
        bytes,
        `${safeFileBaseName(posterTitle)}.pptx`,
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      );
      return note ? [note, ...warnings] : warnings;
    });

  const handleLatex = () =>
    run('latex', async () => {
      const [{ exportPosterLatex }, { safeFileBaseName }] = await Promise.all([
        import('@/export/latex/exportLatex'),
        import('@/export/posterContent'),
      ]);
      const { bytes, warnings } = await exportPosterLatex(doc!, {
        citationStyle,
        attribution: { paidPlan: canExport },
      });
      downloadBytes(bytes, `${safeFileBaseName(posterTitle)}-latex.zip`, 'application/zip');
      return warnings;
    });

  const pptxDisabled = !doc || state.busy !== null || beyondHalf || !canExport;
  const latexDisabled = !doc || state.busy !== null || !canExport;

  return (
    <div {...busyProps(state.busy !== null)}>
      {/*
        Paywall (docs/plans/2026-07-28-payment-and-paywall.md): editable
        exports are the paid line. Shown only once the plan has loaded and
        the user can't export — never flashes during the initial read.
        Copy names what they GET ("keep editing in PowerPoint or
        Overleaf"), not what they're blocked from (marketing rule).
      */}
      {!plan.loading && !canExport && (
        <div
          style={{
            padding: '14px 16px',
            marginBottom: 12,
            borderRadius: 8,
            border: '1px solid #3a3050',
            background: '#17141f',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e2e8', marginBottom: 4 }}>
            Keep editing in PowerPoint or Overleaf
          </div>
          <div style={{ fontSize: 12.5, color: '#9ca3af', lineHeight: 1.5, marginBottom: 12 }}>
            Your PDF export is free. Unlock clean PowerPoint &amp; LaTeX with a
            $18.99 term, or grab a $9.99 3-export pack.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => startCheckout('term')}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: 7,
                border: 'none',
                background: '#5641b8',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Get the term
            </button>
            <button
              onClick={() => startCheckout('pack')}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: 7,
                border: '1px solid #3a3050',
                background: '#1a1a26',
                color: '#c8cad0',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Get the pack
            </button>
          </div>
        </div>
      )}
      {/* Credit-holder reassurance: show the remaining count so a pack
          buyer knows an export will spend one of a finite number. */}
      {!plan.loading && canExport && usesCredit && (
        <div style={{ ...hintStyle, color: '#a3a7b3', marginTop: 0, marginBottom: 10 }}>
          {plan.credits} export{plan.credits === 1 ? '' : 's'} left in your pack —
          each PowerPoint or LaTeX export uses one.
        </div>
      )}
      <button
        onClick={handlePptx}
        disabled={pptxDisabled}
        data-postr-export-pptx
        style={exportButtonStyle(
          pptxDisabled,
          state.done === 'pptx',
          '#f0a35e',
          '#c46a1f',
        )}
      >
        {state.done === 'pptx' ? (
          '✓ Saved'
        ) : state.busy === 'pptx' ? (
          // The first click pays a ~368 kB pptxgenjs chunk fetch before
          // any slide is written, so the label alone left the button
          // looking frozen. The dot proves the app is alive.
          <BusyIndicator inline tone="#f0a35e" label="Building slides…" />
        ) : (
          '▤ PowerPoint (.pptx)'
        )}
      </button>
      {doc && beyondHalf && (
        <div style={{ ...hintStyle, color: '#fca5a5' }}>
          This poster is {doc.widthIn}×{doc.heightIn} in — too large for
          PowerPoint even at half size (its limit is {PPTX_MAX_DIMENSION_IN} in
          per side). Export LaTeX or PDF instead; neither has a size limit.
        </div>
      )}
      {doc && overCeiling && !beyondHalf && (
        <div style={{ ...hintStyle, color: '#d4b106' }}>
          Your poster is {doc.widthIn}×{doc.heightIn} in. PowerPoint&apos;s
          limit is {PPTX_MAX_DIMENSION_IN} in per side, so this file will be
          exactly half size ({doc.widthIn / 2}×{doc.heightIn / 2} in) —{' '}
          <strong style={{ color: '#e3c520' }}>print at 200%</strong>. The note
          is also written inside the file. For a full-size editable export, use
          LaTeX below.
        </div>
      )}
      {!beyondHalf && (
        <div style={hintStyle}>
          One editable slide — every block stays a real PowerPoint text box,
          image, or table. Also opens in Keynote, Google Slides, and
          LibreOffice.
        </div>
      )}

      <div style={{ height: 10 }} />

      <button
        onClick={handleLatex}
        disabled={latexDisabled}
        data-postr-export-latex
        style={exportButtonStyle(
          latexDisabled,
          state.done === 'latex',
          '#8ec5ff',
          '#3178c6',
        )}
      >
        {state.done === 'latex' ? (
          '✓ Saved'
        ) : state.busy === 'latex' ? (
          <BusyIndicator inline tone="#8ec5ff" label="Writing LaTeX…" />
        ) : (
          '⌨ LaTeX source (.zip)'
        )}
      </button>
      <div style={hintStyle}>
        A compilable <code>poster.tex</code> with your figures and a{' '}
        <code>references.bib</code> — every block keeps its exact position,
        ready to keep editing in Overleaf or any TeX setup. Full size at any
        poster dimension.
      </div>

      {state.notes.length > 0 && (
        <ul
          style={{
            fontSize: 12,
            color: '#d4b106',
            marginTop: 6,
            lineHeight: 1.5,
            paddingLeft: 16,
          }}
        >
          {state.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {state.failed && (
        <div role="alert" style={{ fontSize: 12, color: '#fca5a5', marginTop: 6 }}>
          Something went wrong. Try again, or use Send Feedback so we can look
          into it.
        </div>
      )}
      {state.done && (
        <span role="status" aria-live="polite" className="sr-only">
          {state.done === 'pptx' ? 'PowerPoint file saved' : 'LaTeX source saved'}
        </span>
      )}
    </div>
  );
}
