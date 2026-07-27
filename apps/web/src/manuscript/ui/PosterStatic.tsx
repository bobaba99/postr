/**
 * PosterStatic — read-only render of a PosterDoc at natural size
 * (1 poster unit = 1 CSS px, same as the editor canvas at zoom 1).
 *
 * Used by the standalone manuscript-to-poster page for the live
 * preview (scaled down by the parent) and as the print-window source.
 * Reuses AuthorLine and RefsBlock from the editor's block components
 * so author superscripts and citation formatting cannot diverge from
 * the real canvas.
 */
import type { Block, PosterDoc } from '@postr/shared';
import { AuthorLine, RefsBlock } from '../../poster/blocks';
import { FONTS, PX } from '../../poster/constants';

interface PosterStaticProps {
  doc: PosterDoc;
  /** DOM id for the natural-size container (print window source). */
  containerId?: string;
}

export function PosterStatic({ doc, containerId }: PosterStaticProps) {
  const fontFamily = FONTS[doc.fontFamily]?.css ?? FONTS['Source Sans 3']!.css;
  const width = doc.widthIn * PX;
  const height = doc.heightIn * PX;

  // Reading-order figure numbering (top-to-bottom, left-to-right),
  // matching the editor's caption auto-numbering.
  const imageBlocks = doc.blocks
    .filter((b) => b.type === 'image' && b.imageSrc)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const figureNumber = new Map(imageBlocks.map((b, i) => [b.id, i + 1]));

  return (
    <div
      id={containerId}
      style={{
        position: 'relative',
        width,
        height,
        background: doc.palette.bg,
        fontFamily,
        overflow: 'hidden',
      }}
    >
      {doc.blocks.map((block) => (
        <StaticBlock
          key={block.id}
          block={block}
          doc={doc}
          fontFamily={fontFamily}
          figureNumber={figureNumber.get(block.id)}
        />
      ))}
    </div>
  );
}

interface StaticBlockProps {
  block: Block;
  doc: PosterDoc;
  fontFamily: string;
  figureNumber?: number;
}

function StaticBlock({ block, doc, fontFamily, figureNumber }: StaticBlockProps) {
  const { palette, styles, headingStyle } = doc;
  const frame: React.CSSProperties = {
    position: 'absolute',
    left: block.x,
    top: block.y,
    width: block.w,
    height: block.h,
    overflow: 'hidden',
  };

  switch (block.type) {
    case 'title':
      return (
        <div
          style={{
            ...frame,
            fontSize: styles.title.size,
            fontWeight: styles.title.weight,
            lineHeight: styles.title.lineHeight,
            color: styles.title.color ?? palette.primary,
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span>{block.content}</span>
        </div>
      );

    case 'authors':
      return (
        <div style={frame}>
          <AuthorLine
            authors={doc.authors}
            institutions={doc.institutions}
            palette={palette}
            fontFamily={fontFamily}
            styles={styles}
          />
        </div>
      );

    case 'heading':
      return (
        <div
          style={{
            ...frame,
            fontSize: styles.heading.size,
            fontWeight: styles.heading.weight,
            lineHeight: styles.heading.lineHeight,
            color: styles.heading.color ?? palette.accent,
            textAlign: headingStyle.align,
            borderBottom:
              headingStyle.border === 'bottom' || headingStyle.border === 'thick'
                ? `${headingStyle.border === 'thick' ? 3 : 1.5}px solid ${palette.accent}`
                : undefined,
            borderLeft:
              headingStyle.border === 'left'
                ? `4px solid ${palette.accent}`
                : undefined,
            paddingLeft: headingStyle.border === 'left' ? 6 : 0,
            background: headingStyle.fill ? palette.headerBg : undefined,
            ...(headingStyle.fill ? { color: palette.headerFg } : {}),
          }}
        >
          {block.content}
        </div>
      );

    case 'text':
      return (
        <div
          style={{
            ...frame,
            fontSize: styles.body.size,
            fontWeight: styles.body.weight,
            lineHeight: styles.body.lineHeight,
            color: styles.body.color ?? palette.primary,
            whiteSpace: 'pre-wrap',
          }}
        >
          {block.content}
        </div>
      );

    case 'image': {
      if (!block.imageSrc) return null;
      const caption = block.caption?.trim();
      const showCaption = block.captionPosition !== 'none';
      return (
        <div
          style={{
            ...frame,
            display: 'flex',
            flexDirection:
              block.captionPosition === 'top' ? 'column-reverse' : 'column',
            gap: block.captionGap ?? 6,
          }}
        >
          <img
            src={block.imageSrc}
            alt={caption || 'Figure'}
            style={{
              flex: 1,
              minHeight: 0,
              width: '100%',
              objectFit: block.imageFit === 'fill' ? 'fill' : block.imageFit,
            }}
          />
          {showCaption && (caption || figureNumber !== undefined) && (
            <div
              style={{
                fontSize: styles.body.size * 0.85,
                lineHeight: 1.3,
                color: palette.muted,
              }}
            >
              {figureNumber !== undefined && (
                <strong style={{ color: palette.primary }}>
                  Figure {figureNumber}.{' '}
                </strong>
              )}
              {caption}
            </div>
          )}
        </div>
      );
    }

    case 'references':
      return (
        <div style={frame}>
          <RefsBlock
            references={doc.references}
            palette={palette}
            fontFamily={fontFamily}
            styles={styles}
            citationStyle="APA 7"
          />
        </div>
      );

    default:
      return null;
  }
}
