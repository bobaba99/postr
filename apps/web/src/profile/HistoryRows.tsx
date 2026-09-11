/**
 * Row renderers for the Profile page's history lists — gallery
 * submissions (with retract) and feedback submissions (with status).
 */
import { Link } from 'react-router';
import type { FeedbackRow } from '@/data/feedback';
import { labelForField, type GalleryEntryWithUrls } from '@/data/gallery';
import { GALLERY_PUBLIC_ENABLED } from '@/config/features';

export function GallerySubmissionRow({
  entry,
  onRetract,
}: {
  entry: GalleryEntryWithUrls;
  onRetract: () => void;
}) {
  const date = new Date(entry.created_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  // An entry with retracted_at + retracted_by populated was taken
  // down by a moderator. Owner-initiated retraction hard-deletes the
  // row entirely, so we'll never see both cases on the same row.
  const moderatorRetracted =
    entry.retracted_at !== null && entry.retracted_by !== null;

  return (
    <div
      className={`flex items-start gap-3 rounded-md border p-3 ${
        moderatorRetracted
          ? 'border-[#f87171]/30 bg-[#f87171]/5'
          : 'border-[#1f1f2e] bg-[#0a0a12]'
      }`}
    >
      <img
        src={entry.image_url}
        alt={entry.title}
        className={`h-16 w-16 shrink-0 rounded object-cover ${moderatorRetracted ? 'opacity-60' : ''}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded bg-[#1a1a26] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#7c6aed]">
            {labelForField(entry.field)}
          </span>
          {moderatorRetracted && (
            <span className="rounded bg-[#f87171]/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#f87171]">
              Retracted by moderator
            </span>
          )}
          {GALLERY_PUBLIC_ENABLED ? (
            <Link
              to={`/gallery/${entry.id}`}
              className="truncate text-[13px] font-medium text-[#c8cad0] no-underline hover:text-white"
            >
              {entry.title}
            </Link>
          ) : (
            <span className="truncate text-[13px] font-medium text-[#c8cad0]">
              {entry.title}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[11px] text-[#8b8f99]">
          Published {date}
          {entry.conference && ` · ${entry.conference}`}
          {entry.year && ` · ${entry.year}`}
        </div>
        {moderatorRetracted && entry.retraction_reason && (
          <div className="mt-2 border-l-2 border-[#f87171] bg-[#f87171]/5 px-2 py-1 text-[12px] leading-relaxed text-[#f87171]">
            <strong>Moderator note:</strong> {entry.retraction_reason}
          </div>
        )}
      </div>
      {!moderatorRetracted && (
        <button
          type="button"
          onClick={onRetract}
          className="shrink-0 rounded-md border border-[#2a2a3a] bg-[#1a1a26] px-3 py-1.5 text-[12px] font-medium text-[#f87171] hover:border-[#f87171]"
        >
          Retract
        </button>
      )}
    </div>
  );
}

const FEEDBACK_STATUS_LABEL: Record<FeedbackRow['status'], string> = {
  new: 'Received',
  triaged: 'Triaged',
  in_progress: 'In progress',
  done: 'Shipped',
  wontfix: 'Declined',
};

const FEEDBACK_STATUS_COLOR: Record<FeedbackRow['status'], string> = {
  new: '#8b8f99',
  triaged: '#7c6aed',
  in_progress: '#f59e0b',
  done: '#a6e3a1',
  wontfix: '#8b8f99',
};

export function FeedbackHistoryRow({ row }: { row: FeedbackRow }) {
  const date = new Date(row.created_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const kindLabel = row.kind === 'bug' ? 'Bug' : row.kind === 'feature' ? 'Feature' : 'Other';
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-[#1f1f2e] bg-[#0a0a12] px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded bg-[#1a1a26] px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[#7c6aed]">
            {kindLabel}
          </span>
          <span className="truncate text-[13px] font-medium text-[#c8cad0]">{row.title}</span>
        </div>
        <div className="mt-0.5 text-[11px] text-[#8b8f99]">{date}</div>
      </div>
      <span
        className="shrink-0 rounded px-2 py-0.5 text-[11px] font-medium"
        style={{
          color: FEEDBACK_STATUS_COLOR[row.status],
          background: `${FEEDBACK_STATUS_COLOR[row.status]}1a`,
          border: `1px solid ${FEEDBACK_STATUS_COLOR[row.status]}33`,
        }}
      >
        {FEEDBACK_STATUS_LABEL[row.status]}
      </span>
    </div>
  );
}
