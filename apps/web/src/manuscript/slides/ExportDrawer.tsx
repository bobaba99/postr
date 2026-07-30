/**
 * ExportDrawer — the upward-expanding export surface (Phase 1).
 *
 * Two cards, side by side: the FREE PDF on the left, the PAID PowerPoint
 * `.pptx` on the right. The copy here is a MONETIZATION CONTRACT, not
 * decoration — every line is transcribed from spec §6:
 *
 *   "The polish is FREE. You never pay for beauty — only for the
 *    editable file."
 *
 * The polished deck is identical across both formats; the ONLY thing money
 * buys is editability + the PowerPoint scaffolding + no watermark. The
 * inclusion lists below mirror the spec §6 free/paid table exactly, so the
 * user sees the split honestly before choosing. (spec §6)
 *
 * The paywall is DISPLAY-ONLY in Phase 1: the buttons simply invoke
 * `onExportPdf` / `onExportPptx`. No Stripe, no card, no account gate is
 * reached from here — real plumbing is Plan 3. The "no card to preview"
 * note states that plainly so the offer never reads as a trap.
 *
 * Motion: the shell's `useWizardMotion` reveals the open body (opacity + a
 * short upward rise, `--ease-drawer`, 280ms) by targeting `data-export-body`
 * from the wizard root. Close is an immediate React unmount — no lingering
 * exit tween to keep the surface honest and the code un-fussy. Under
 * reduced motion / a hidden tab the body simply appears. The component is
 * static and correct on its own.
 */
import type { SlideDeck } from '../deck/types';

interface ExportDrawerProps {
  open: boolean;
  onToggle: () => void;
  /** Reserved for the export handlers (slide count in the toggle label);
   *  the deck itself is not rendered here — the viewer owns that. */
  deck: SlideDeck;
  /** Task 10 — both exports now render the styled deck (spec §3), so
   *  neither button can do anything useful until the automatic
   *  style+theme pass has produced one. Defaults to true so existing
   *  callers/tests that don't pass it keep the buttons enabled. */
  exportReady?: boolean;
  onExportPdf: () => void;
  onExportPptx: () => void;
}

/** Pricing is DISPLAY-ONLY in Phase 1 (spec §6). One canonical string,
 *  kept here so the price never drifts between the drawer and the plan. */
const PRICE_LINE = '$18.99 CAD / 4-month term · or $9.99 for 3 exports';

export function ExportDrawer({
  open,
  onToggle,
  deck,
  exportReady = true,
  onExportPdf,
  onExportPptx,
}: ExportDrawerProps) {
  const slideCount = deck.slides.length;

  return (
    <section className="border-t border-[#1f1f2e] bg-[#0a0a12]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <span className="text-sm font-semibold text-[#e2e2e8]">
          Export
          {slideCount > 0 && (
            <span className="ml-2 text-xs font-normal text-[#8b8f99]">
              {slideCount} slide{slideCount === 1 ? '' : 's'}
            </span>
          )}
        </span>
        <span
          className="text-[#8b8f99] transition-transform"
          aria-hidden="true"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
        >
          ▴
        </span>
      </button>

      {open && (
        <div data-export-body className="px-5 pb-5">
          {/* The promise, stated first and loud — spec §6's non-negotiable
              line. Everything below is the honest split beneath it. */}
          <p className="mb-4 text-sm leading-relaxed text-[#c8cad0]">
            <span className="font-semibold text-white">
              The polish is free.
            </span>{' '}
            You never pay for beauty — you pay only for the editable file.
          </p>

          {!exportReady && (
            <p className="mb-4 text-xs text-[#8b8fa3]" role="status">
              Styling your deck — export unlocks once it's done.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <ExportCard
              badge="Free"
              badgeClass="bg-[#16a34a22] text-[#4ade80]"
              title="PDF"
              subtitle="The full polished deck, print-ready."
              features={[
                { included: true, label: 'Full polished deck — identical to paid' },
                { included: true, label: 'Print-ready, final-form pages' },
                {
                  included: true,
                  label: '“Made by Postr.sh” mark on the acknowledgement slide (never over your content)',
                },
                { included: false, label: 'Editable in PowerPoint' },
                { included: false, label: 'Empty layout slides to duplicate' },
              ]}
              action={
                <button
                  type="button"
                  onClick={onExportPdf}
                  disabled={!exportReady}
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-md border border-[#3a3a4e] px-4 text-sm font-semibold text-[#c8cad0] hover:border-[#7c6aed] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#3a3a4e] disabled:hover:text-[#c8cad0]"
                >
                  Download PDF
                </button>
              }
            />

            <ExportCard
              badge="Paid"
              badgeClass="bg-[#7c6aed33] text-[#c8b6ff]"
              title="PowerPoint (.pptx)"
              subtitle="The same polished deck — now yours to edit."
              features={[
                { included: true, label: 'Same polished deck — identical to the PDF' },
                { included: true, label: 'Real, editable text boxes' },
                { included: true, label: '5 empty layout slides to duplicate' },
                { included: true, label: 'Icon-library slide, ready to reuse' },
                { included: true, label: '4-palette slide, ready to reuse' },
                { included: true, label: 'No watermark' },
              ]}
              action={
                // Pricing + account note sit ABOVE the button so the button
                // is the last element in the card — flush to the bottom,
                // bottom-aligned with the PDF card's "Download PDF". Keeps the
                // two export CTAs on the same baseline (cleaner, per review).
                <div className="mt-4">
                  <p className="text-center text-xs font-medium text-[#c8cad0]">
                    {PRICE_LINE}
                  </p>
                  <p className="mt-1 mb-3 text-center text-[11px] text-[#8b8f99]">
                    Account asked only here — no card to preview.
                  </p>
                  <button
                    type="button"
                    onClick={onExportPptx}
                    disabled={!exportReady}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-[#5641b8] px-4 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
                  >
                    Export PowerPoint (.pptx)
                  </button>
                </div>
              }
            />
          </div>
        </div>
      )}
    </section>
  );
}

interface Feature {
  included: boolean;
  label: string;
}

function ExportCard({
  badge,
  badgeClass,
  title,
  subtitle,
  features,
  action,
}: {
  badge: string;
  badgeClass: string;
  title: string;
  subtitle: string;
  features: Feature[];
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-[#2a2a3a] bg-[#111118] p-4">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-base font-semibold text-[#e2e2e8]">{title}</h3>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${badgeClass}`}
        >
          {badge}
        </span>
      </div>
      <p className="mb-3 text-xs text-[#8b8fa3]">{subtitle}</p>
      <ul className="flex flex-1 flex-col gap-1.5">
        {features.map((f, i) => (
          <FeatureRow key={i} included={f.included} label={f.label} />
        ))}
      </ul>
      {action}
    </div>
  );
}

function FeatureRow({ included, label }: Feature) {
  return (
    <li className="flex items-start gap-2 text-xs leading-snug">
      <span
        aria-hidden="true"
        className={`mt-0.5 shrink-0 font-semibold ${
          included ? 'text-[#4ade80]' : 'text-[#8b8f99]'
        }`}
      >
        {included ? '✓' : '—'}
      </span>
      <span className={included ? 'text-[#c8cad0]' : 'text-[#8b8f99]'}>
        {label}
      </span>
    </li>
  );
}
