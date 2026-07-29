/**
 * Shared review finding card + score header — used by BOTH review
 * surfaces: the /presentation-checker page and the editor ReviewTab.
 */
import type {
  ReviewDimension,
  ReviewFinding,
  ReviewFindingAction,
  ReviewSeverity,
} from '@postr/shared';

const DIMENSION_LABELS: Record<ReviewDimension, string> = {
  narrative: 'Narrative',
  design: 'Design',
  content: 'Content',
};

export const SEVERITY_LABELS: Record<ReviewSeverity, string> = {
  high: 'High impact',
  medium: 'Medium',
  low: 'Polish',
};

export const SEVERITY_COLORS: Record<ReviewSeverity, string> = {
  high: '#f38ba8',
  medium: '#f9e2af',
  low: '#89b4fa',
};

const ACTION_LABELS: Record<ReviewFindingAction, string> = {
  cut: 'Cut',
  'demote-to-appendix': 'Demote to appendix',
  'show-visually': 'Show visually',
  condense: 'Condense',
  'keep-as-primary': 'Keep as primary',
  add: 'Add',
};

function Chip({ text, color }: { text: string; color: string }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
      style={{ color, border: `1px solid ${color}55`, background: `${color}11` }}
    >
      {text}
    </span>
  );
}

export function FindingCard({
  finding,
  onJump,
}: {
  finding: ReviewFinding;
  onJump?: () => void;
}) {
  const severityColor = SEVERITY_COLORS[finding.severity];
  return (
    <div
      role={onJump ? 'button' : undefined}
      tabIndex={onJump ? 0 : undefined}
      onClick={onJump}
      onKeyDown={
        onJump
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onJump();
              }
            }
          : undefined
      }
      className="rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9b8cf0] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a12]"
      style={{
        cursor: onJump ? 'pointer' : 'default',
        borderColor: `${severityColor}44`,
        background: '#0d0d15',
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Chip text={DIMENSION_LABELS[finding.dimension]} color="#9b8cf0" />
        <Chip text={SEVERITY_LABELS[finding.severity]} color={severityColor} />
        <Chip text={ACTION_LABELS[finding.action]} color="#8ec5ff" />
      </div>
      <div className="mt-2 text-sm font-semibold leading-snug text-[#e2e2e8]">
        {finding.problem}
      </div>
      <div className="mt-1 text-sm leading-relaxed text-[#c8cad0]">
        {finding.fix}
      </div>
      <blockquote className="mt-2 border-l-2 border-[#7c6aed] pl-3 text-sm italic leading-relaxed text-[#9ca3af]">
        {finding.example}
      </blockquote>
      {finding.tradeoff && (
        <div className="mt-2 text-xs leading-relaxed text-[#6b7280]">
          Tradeoff: {finding.tradeoff}
        </div>
      )}
      {onJump && (
        <div className="mt-2 text-xs text-[#6b7280]">→ click to see it</div>
      )}
    </div>
  );
}

/** The three dimension scores (narrative / design / content, 1–5). */
export function ReviewScoreHeader({
  scores,
}: {
  scores: Record<ReviewDimension, number>;
}) {
  const dimensions: Array<{ key: ReviewDimension; label: string }> = [
    { key: 'narrative', label: 'Narrative' },
    { key: 'design', label: 'Design' },
    { key: 'content', label: 'Content' },
  ];
  return (
    <div
      aria-label="Review scores"
      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
    >
      {dimensions.map((dimension) => (
        <div
          key={dimension.key}
          data-testid={`score-${dimension.key}`}
          className="rounded-lg border border-[#1f1f2e] bg-[#0d0d15] px-4 py-3 text-center"
        >
          <div className="text-xs font-bold uppercase tracking-wider text-[#6b7280]">
            {dimension.label}
          </div>
          <div className="mt-1 text-xl font-bold text-white">
            {scores[dimension.key]}/5
          </div>
        </div>
      ))}
    </div>
  );
}
