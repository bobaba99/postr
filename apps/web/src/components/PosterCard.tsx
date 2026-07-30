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
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { PosterRow, PosterListRow } from '@/data/posters';
import { getThumbnailUrl } from '@/data/thumbnails';
import { PALETTES } from '@/poster/constants';

export interface PosterCardProps {
  row: PosterListRow;
  onDuplicate: (row: PosterListRow) => void;
  onDelete: (row: PosterListRow) => void;
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
function MiniPreview({ row }: { row: PosterListRow }) {
  // Use thumbnail image when available — fast, no JSONB needed.
  // `imgFailed` covers the case where the storage object is missing or
  // returns 4xx (e.g. orphaned thumbnail_path pointing at a deleted
  // file): without this, the broken <img> would render an empty white
  // card. On error we fall through to the synthetic preview below.
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
    setThumbUrl(null);
    if (row.thumbnail_path) {
      getThumbnailUrl(row.thumbnail_path).then(setThumbUrl);
    }
  }, [row.thumbnail_path]);

  if (thumbUrl && !imgFailed) {
    return (
      <img
        src={thumbUrl}
        alt={row.title || 'Poster preview'}
        onError={() => setImgFailed(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    );
  }

  // Fallback: initial + label when there is neither a thumbnail nor
  // block data to synthesise a preview from. The list query omits the
  // heavy `data` column, so this is the common case for a poster that
  // was never opened in the editor (it has no captured thumbnail yet) —
  // e.g. the seeded welcome poster. The previous version drew a 10px
  // initial in #3a3a4a on the #0f0f17 card, which measured 1.7:1 —
  // below the WCAG floor and effectively invisible, so the card read as
  // a blank white/dark rectangle. Give it a legible initial and a
  // one-word label so it reads as a poster, not a rendering bug.
  const doc = 'data' in row ? (row as PosterRow).data : null;
  if (!doc?.blocks?.length) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#12121c] text-[#9aa0b4]">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#20202e] text-lg font-bold uppercase text-[#c8b6ff]">
          {row.title?.trim() ? row.title.trim().charAt(0).toUpperCase() : 'P'}
        </div>
        <span className="text-[10px] uppercase tracking-widest text-[#6b7280]">Poster</span>
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
          <span className="truncate text-[14pt] font-medium text-[#e2e2e8]">{title}</span>
          <span className="shrink-0 text-[12pt] tabular-nums text-[#6b7280]">
            {formatLastEdited(row.updated_at)}
          </span>
        </div>
      </Link>

      {/*
        Hover actions — positioned absolutely so they never push layout.

        The Publish action was removed when the public gallery was
        deactivated. It was the last ungated publish entry point: the
        button navigated to `/p/:id?publish=1`, but PosterEditor bails
        on that param while GALLERY_PUBLIC_ENABLED is false, so the
        click opened the editor and silently did nothing. Restore it
        alongside the flag (see config/features.ts).
      */}
      <div className="pointer-events-none absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
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

