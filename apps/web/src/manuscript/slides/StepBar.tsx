/**
 * StepBar — the wizard's left spine (spec §2, left-bar design).
 *
 * One foldable card per wizard step. Each card DOCUMENTS the user's input
 * for that step: when open, its body lists the `inputSummary[id]` rows as
 * k/v pairs, so the user can see at a glance what they told the wizard and
 * jump back to any step. Clicking a header navigates (via the parent's
 * `onToggle`); the parent owns both which step is active and which cards
 * are open.
 *
 * The header chip reads as a number (1..6) for steps not yet reached, and
 * a ✓ for completed steps — a step counts complete when it sits BEFORE the
 * active step in `WIZARD_STEPS` order. The active card is accent-highlighted.
 *
 * Presentational ON PURPOSE — no local state, no motion logic. It exposes
 * two hooks the shell's `useWizardMotion` drives from the wizard root:
 * `data-motion-card` on each card (first-mount stagger) and
 * `data-step-body` + `data-active` on the open body (active-card reveal).
 * The GSAP owns those entrances, so the card no longer carries the CSS
 * `postr-rise-in` — one entrance, not two fighting each other. The
 * component still renders static and correct if the hook never runs
 * (reduced motion, hidden tab, JS-light crawler).
 */
import { WIZARD_STEPS, STEP_LABELS, type StepId } from './stepConfig';

/** One documented input row for a step — a short key and its value. */
export interface StepInputRow {
  k: string;
  v: string;
}

interface StepBarProps {
  activeStep: StepId;
  openSteps: StepId[];
  onToggle: (id: StepId) => void;
  inputSummary: Partial<Record<StepId, StepInputRow[]>>;
}

export function StepBar({
  activeStep,
  openSteps,
  onToggle,
  inputSummary,
}: StepBarProps) {
  const activeIndex = WIZARD_STEPS.indexOf(activeStep);

  return (
    <aside
      aria-label="Wizard steps"
      className="flex w-full flex-col gap-2"
    >
      {WIZARD_STEPS.map((id, i) => {
        const open = openSteps.includes(id);
        const active = id === activeStep;
        const complete = i < activeIndex;
        const rows = inputSummary[id] ?? [];

        return (
          <div
            key={id}
            data-motion-card
            className={`overflow-hidden rounded-lg border transition-colors ${
              active
                ? 'border-[#7c6aed] bg-[#16161f]'
                : 'border-[#2a2a3a] bg-[#0f0f16]'
            }`}
          >
            <button
              type="button"
              onClick={() => onToggle(id)}
              aria-expanded={open}
              aria-current={active ? 'step' : undefined}
              className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2.5 text-left"
            >
              <StepChip index={i} complete={complete} active={active} />
              <span
                className={`flex-1 text-sm font-semibold ${
                  active ? 'text-white' : 'text-[#c8cad0]'
                }`}
              >
                {STEP_LABELS[id]}
              </span>
              <span
                aria-hidden="true"
                className="text-xs text-[#8b8f99] transition-transform"
                style={{ transform: open ? 'rotate(90deg)' : 'none' }}
              >
                ▸
              </span>
            </button>

            {open && (
              <div
                data-step-body
                data-active={active ? 'true' : 'false'}
                className="border-t border-[#2a2a3a] px-3 py-2.5"
              >
                {rows.length === 0 ? (
                  <p className="text-xs text-[#8b8f99]">
                    Nothing recorded yet.
                  </p>
                ) : (
                  <dl className="flex flex-col gap-1.5">
                    {rows.map((row) => (
                      <div key={row.k} className="flex flex-col gap-0.5">
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b8f99]">
                          {row.k}
                        </dt>
                        <dd className="text-xs leading-snug text-[#c8cad0]">
                          {row.v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
}

/** The numbered chip — a step's ordinal until it is completed, then a ✓. */
function StepChip({
  index,
  complete,
  active,
}: {
  index: number;
  complete: boolean;
  active: boolean;
}) {
  const base =
    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold';
  if (complete) {
    return (
      <span
        aria-hidden="true"
        className={`${base} bg-[#16a34a22] text-[#4ade80]`}
      >
        ✓
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${base} ${
        active
          ? 'bg-[#5641b8] text-white'
          : 'bg-[#1f1f2e] text-[#8b8fa3]'
      }`}
    >
      {index + 1}
    </span>
  );
}
