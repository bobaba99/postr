/**
 * PosterCard — mini-preview + title + last-edited timestamp.
 *
 * Renders a live miniature of the poster from its PosterDoc data —
 * no html2canvas or external screenshot needed. The mini-preview
 * shows block positions + colors at ~1/20 scale with CSS transform,
 * giving users a recognizable thumbnail that updates on every save.
 *
 * The parent (Home) owns the actual duplicate/delete side effects
 * and the optimistic state updates.
 */
import { Link, useNavigate } from 'react-router-dom';
import type { PosterRow } from '@/data/posters';
import { PALETTES } from '@/poster/constants';

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

/**
 * Tiny poster preview — renders block rectangles at miniature scale
 * so the card shows a recognizable layout instead of "No preview".
 */
function MiniPreview({ row }: { row: PosterRow }) {
  const doc = row.data;
  if (!doc?.blocks?.length) {
    return (
      <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-widest text-[#3a3a4a]">
        Empty
      </div>
    );
  }

  const palette = doc.palette ?? PALETTES[0]!;
  // Poster canvas is w × h in poster units (1 unit = 1/10 inch),
  // rendered at PX=10, so the canvas pixel dimensions are w*10 × h*10.
  // We need to scale that down to fit in a ~320px wide card.
  const PX = 10;
  const canvasW = row.width_in * PX;
  const canvasH = row.height_in * PX;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        background: palette.bg,
      }}
    >
      {/* Scale the canvas to fit the card width. The card's aspect
          ratio matches the poster, so we scale uniformly. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: canvasW,
          height: canvasH,
          transform: `scale(${1 / (canvasW / 320)})`,
          transformOrigin: 'top left',
        }}
      >
        {doc.blocks.map((b) => {
          const isTitle = b.type === 'title';
          const isHeading = b.type === 'heading';
          const isImage = b.type === 'image';
          const isTable = b.type === 'table';
          const isAuthors = b.type === 'authors';

          return (
            <div
              key={b.id}
              style={{
                position: 'absolute',
                left: b.x,
                top: b.y,
                width: b.w,
                height: isTitle ? 'auto' : b.h,
                minHeight: isTitle ? b.h : undefined,
                overflow: 'hidden',
              }}
            >
              {isTitle && (
                <div
                  style={{
                    fontSize: doc.styles?.title?.size ?? 22,
                    fontWeight: 800,
                    color: palette.primary,
                    fontFamily: doc.fontFamily ?? 'system-ui',
                    textAlign: 'center',
                    lineHeight: 1.15,
                  }}
                >
                  {stripHtmlSimple(b.content) || 'Untitled'}
                </div>
              )}
              {isAuthors && (
                <div
                  style={{
                    fontSize: doc.styles?.authors?.size ?? 5,
                    color: palette.primary,
                    fontFamily: doc.fontFamily ?? 'system-ui',
                    textAlign: 'center',
                    opacity: 0.6,
                  }}
                >
                  {doc.authors?.map((a) => a.name).join(', ') || ''}
                </div>
              )}
              {isHeading && (
                <div
                  style={{
                    fontSize: doc.styles?.heading?.size ?? 8,
                    fontWeight: 700,
                    color: palette.accent,
                    fontFamily: doc.fontFamily ?? 'system-ui',
                    borderBottom: `1px solid ${palette.accent}44`,
                  }}
                >
                  {stripHtmlSimple(b.content)}
                </div>
              )}
              {b.type === 'text' && (
                <div
                  style={{
                    fontSize: doc.styles?.body?.size ?? 5,
                    color: palette.primary,
                    fontFamily: doc.fontFamily ?? 'system-ui',
                    opacity: 0.5,
                    lineHeight: 1.4,
                    overflow: 'hidden',
                  }}
                >
                  {stripHtmlSimple(b.content)?.slice(0, 200)}
                </div>
              )}
              {isImage && b.imageSrc && (
                <img
                  src={b.imageSrc}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: b.imageFit ?? 'contain' }}
                />
              )}
              {isImage && !b.imageSrc && (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    border: `1px dashed ${palette.muted}44`,
                    borderRadius: 2,
                  }}
                />
              )}
              {isTable && (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    border: `1px solid ${palette.accent}33`,
                    borderRadius: 1,
                    background: palette.accent + '08',
                  }}
                />
              )}
              {b.type === 'references' && (
                <div
                  style={{
                    fontSize: 3,
                    color: palette.primary,
                    opacity: 0.3,
                    overflow: 'hidden',
                  }}
                >
                  References
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function stripHtmlSimple(html: string): string {
  return html?.replace(/<[^>]+>/g, '') ?? '';
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
          <MiniPreview row={row} />
        </div>
        <div className="flex items-baseline justify-between gap-2 px-3 py-2">
          <span className="truncate text-sm font-medium text-[#e2e2e8]">{title}</span>
          <span className="shrink-0 text-[13px] text-[#6b7280]">
            {formatLastEdited(row.updated_at)}
          </span>
        </div>
      </Link>

      {/* Hover actions — positioned absolutely so they never push layout. */}
      <div className="pointer-events-none absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
        <PublishButton row={row} title={title} />
        <button
          type="button"
          aria-label={`Duplicate ${title}`}
          onClick={(e) => {
            e.preventDefault();
            onDuplicate(row);
          }}
          className="rounded-md border border-[#2a2a3a] bg-[#1a1a26]/90 px-2 py-1 text-[13px] font-semibold text-[#c8cad0] backdrop-blur hover:border-[#7c6aed]"
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
          className="rounded-md border border-[#2a2a3a] bg-[#1a1a26]/90 px-2 py-1 text-[13px] font-semibold text-[#f87171] backdrop-blur hover:border-[#f87171]"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function PublishButton({ row, title }: { row: PosterRow; title: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      aria-label={`Publish ${title}`}
      // Navigate to the editor with ?publish=1. The editor mounts the
      // poster, then auto-opens the publish flow so html-to-image can
      // capture #poster-canvas from the real DOM. Publishing from the
      // dashboard without first rendering the poster would force the
      // user to upload a screenshot themselves.
      onClick={(e) => {
        e.preventDefault();
        navigate(`/p/${row.id}?publish=1`);
      }}
      className="rounded-md border border-[#2a2a3a] bg-[#1a1a26]/90 px-2 py-1 text-[13px] font-semibold text-[#7c6aed] backdrop-blur hover:border-[#7c6aed]"
    >
      Publish
    </button>
  );
}
