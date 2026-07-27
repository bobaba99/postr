/**
 * StyleMiniPreview — a small schematic render of the user's OWN poster
 * under a given palette + font. Two of these side by side form the
 * before/after in the copy-a-design modal (plan §4: the screen after
 * extraction previews *your* poster, not a report about theirs).
 *
 * Deliberately lightweight: real block positions, real text content
 * (as texture — it is unreadable at this scale, which is fine), image
 * and table blocks as tinted placeholders. Not the full renderer.
 */
import type { CSSProperties } from 'react';
import type { Block, Palette, PosterDoc } from '@postr/shared';
import { FONTS } from '@/poster/constants';

interface Props {
  doc: PosterDoc;
  palette: Palette;
  fontFamily: string;
  /** Card label rendered above the canvas, e.g. "Now". */
  label: string;
  /** Rendered canvas width in px (height follows the aspect ratio). */
  width?: number;
}

/** Strip markup so rich-text block content renders as plain texture. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function StyleMiniPreview({
  doc,
  palette,
  fontFamily,
  label,
  width = 210,
}: Props) {
  // Poster coordinates are in units (1 unit = 1/10 inch).
  const posterUnitsW = doc.widthIn * 10;
  const posterUnitsH = doc.heightIn * 10;
  const scale = width / posterUnitsW;
  const fontCss = FONTS[fontFamily]?.css ?? fontFamily;

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          color: '#6b7280',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        aria-hidden
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: `${posterUnitsW} / ${posterUnitsH}`,
          maxHeight: 260,
          background: palette.bg,
          border: '1px solid #2a2a3a',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        {doc.blocks.map((b) => (
          <MiniBlock
            key={b.id}
            block={b}
            palette={palette}
            fontCss={fontCss}
            scale={scale}
            docStyles={doc}
          />
        ))}
      </div>
    </div>
  );
}

function MiniBlock({
  block,
  palette,
  fontCss,
  scale,
  docStyles,
}: {
  block: Block;
  palette: Palette;
  fontCss: string;
  scale: number;
  docStyles: PosterDoc;
}) {
  const base: CSSProperties = {
    position: 'absolute',
    left: `${(block.x / (docStyles.widthIn * 10)) * 100}%`,
    top: `${(block.y / (docStyles.heightIn * 10)) * 100}%`,
    width: `${(block.w / (docStyles.widthIn * 10)) * 100}%`,
    overflow: 'hidden',
    fontFamily: fontCss,
    lineHeight: 1.15,
  };

  if (block.type === 'image' || block.type === 'logo') {
    return (
      <div
        style={{
          ...base,
          height: `${(block.h / (docStyles.heightIn * 10)) * 100}%`,
          background: `${palette.muted}33`,
          border: `1px solid ${palette.muted}66`,
          borderRadius: 2,
        }}
      />
    );
  }

  if (block.type === 'table') {
    return (
      <div
        style={{
          ...base,
          height: `${(block.h / (docStyles.heightIn * 10)) * 100}%`,
          border: `1px solid ${palette.accent}`,
          background: `${palette.accent}14`,
          borderRadius: 2,
        }}
      />
    );
  }

  const styleLevel =
    block.type === 'title'
      ? docStyles.styles.title
      : block.type === 'heading'
        ? docStyles.styles.heading
        : block.type === 'authors'
          ? docStyles.styles.authors
          : docStyles.styles.body;

  const color = block.type === 'heading' ? palette.accent : palette.primary;

  return (
    <div
      style={{
        ...base,
        maxHeight: `${(Math.max(block.h, 1) / (docStyles.heightIn * 10)) * 100}%`,
        color,
        fontSize: Math.max(2, styleLevel.size * scale),
        fontWeight: styleLevel.weight,
        borderBottom:
          block.type === 'heading' &&
          docStyles.headingStyle.border === 'bottom'
            ? `1px solid ${palette.accent}`
            : undefined,
      }}
    >
      {stripHtml(block.content)}
    </div>
  );
}
