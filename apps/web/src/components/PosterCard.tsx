/**
 * PosterCard — thumbnail + title + last-edited timestamp.
 *
 * Presentational only: the card renders a link to the editor and two
 * hover-revealed action buttons. The parent (Home) owns the actual
 * duplicate/delete side effects and the optimistic state updates.
 */
import { Link } from 'react-router-dom';
import type { PosterRow } from '@/data/posters';

export interface PosterCardProps {
  row: PosterRow;
  onDuplicate: (row: PosterRow) => void;
  onDelete: (row: PosterRow) => void;
}

function formatLastEdited(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const ms = now.getTime() - date.getTime();
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function PosterCard({ row, onDuplicate, onDelete }: PosterCardProps) {
  const title = row.title?.trim() || 'Untitled Poster';
  const ratio = row.width_in / row.height_in;

  return (
    <div className="group relative">
      <Link
        to={`/p/${row.id}`}
        aria-label={title}
        className="block overflow-hidden rounded-lg border border-[#2a2a3a] bg-[#151520] transition-colors hover:border-[#7c6aed]"
      >
        <div
          className="relative w-full bg-[#0f0f17]"
          style={{ aspectRatio: `${ratio}` }}
        >
          {row.thumbnail_path ? (
            <img
              src={row.thumbnail_path}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-widest text-[#3a3a4a]">
              No preview
            </div>
          )}
        </div>
        <div className="flex items-baseline justify-between gap-2 px-3 py-2">
          <span className="truncate text-sm font-medium text-[#e2e2e8]">{title}</span>
          <span className="shrink-0 text-[10px] text-[#6b7280]">
            {formatLastEdited(row.updated_at)}
          </span>
        </div>
      </Link>

      {/* Hover actions — positioned absolutely so they never push layout. */}
      <div className="pointer-events-none absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
        <button
          type="button"
          aria-label={`Duplicate ${title}`}
          onClick={(e) => {
            e.preventDefault();
            onDuplicate(row);
          }}
          className="rounded-md border border-[#2a2a3a] bg-[#1a1a26]/90 px-2 py-1 text-[10px] font-semibold text-[#c8cad0] backdrop-blur hover:border-[#7c6aed]"
        >
          Duplicate
        </button>
        <button
          type="button"
          aria-label={`Delete ${title}`}
          onClick={(e) => {
            e.preventDefault();
            onDelete(row);
          }}
          className="rounded-md border border-[#2a2a3a] bg-[#1a1a26]/90 px-2 py-1 text-[10px] font-semibold text-[#f87171] backdrop-blur hover:border-[#f87171]"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
