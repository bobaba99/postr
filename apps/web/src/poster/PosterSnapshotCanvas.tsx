import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Block, PosterDoc } from '@postr/shared';
import { BlockFrame } from './blocks';
import {
  DEFAULT_CITATION_STYLE,
  sortReferences,
} from './citations';
import { FONTS, PX } from './constants';

/**
 * A print-faithful, interaction-free poster canvas for DOM capture outside
 * the editor. It stays laid out off-screen because html-to-image needs real
 * dimensions; `display:none` or `visibility:hidden` would produce a blank
 * capture.
 */
export function PosterSnapshotCanvas({ doc }: { doc: PosterDoc }) {
  const didDragRef = useRef(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [titleOverflowPx, setTitleOverflowPx] = useState(0);
  const titleBlockId = useMemo(
    () => doc.blocks.find((block) => block.type === 'title')?.id ?? null,
    [doc.blocks],
  );
  const titleBlockH = useMemo(
    () => doc.blocks.find((block) => block.type === 'title')?.h ?? 0,
    [doc.blocks],
  );
  const headingNumbers = useMemo(() => {
    const numbers: Record<string, number> = {};
    let next = 0;
    for (const block of doc.blocks) {
      if (block.type === 'heading') {
        next += 1;
        numbers[block.id] = next;
      }
    }
    return numbers;
  }, [doc.blocks]);
  const captionNumbers = useMemo(
    () => computeCaptionNumbers(doc.blocks),
    [doc.blocks],
  );
  const references = useMemo(
    () => sortReferences(doc.references, 'alpha'),
    [doc.references],
  );
  const fontFamily = FONTS[doc.fontFamily]?.css ?? doc.fontFamily;

  useLayoutEffect(() => {
    if (!titleBlockId || !canvasRef.current || titleBlockH <= 0) {
      setTitleOverflowPx(0);
      return;
    }
    const title = canvasRef.current.querySelector<HTMLElement>(
      `[data-block-id="${titleBlockId}"]`,
    );
    if (!title) return;
    const measure = () => {
      setTitleOverflowPx(Math.max(0, title.offsetHeight - titleBlockH));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(title);
    return () => observer.disconnect();
  }, [titleBlockH, titleBlockId]);

  return (
    <div
      aria-hidden="true"
      data-testid="poster-snapshot-host"
      style={{
        position: 'fixed',
        left: -100_000,
        top: 0,
        pointerEvents: 'none',
        zIndex: -1,
      }}
    >
      <div
        ref={canvasRef}
        id="poster-canvas"
        style={{
          width: doc.widthIn * PX,
          height: doc.heightIn * PX,
          position: 'relative',
          overflow: 'hidden',
          background: doc.palette.bg,
        }}
      >
        {doc.blocks.map((block) => (
          <BlockFrame
            key={block.id}
            block={block}
            palette={doc.palette}
            fontFamily={fontFamily}
            styles={doc.styles}
            headingStyle={doc.headingStyle}
            authors={doc.authors}
            institutions={doc.institutions}
            references={references}
            citationStyle={DEFAULT_CITATION_STYLE}
            headingNumber={headingNumbers[block.id] ?? 0}
            selected={false}
            onSelect={() => undefined}
            onPointerDown={() => undefined}
            didDragRef={didDragRef}
            onUpdate={() => undefined}
            onDelete={() => undefined}
            titleOverflowPx={titleOverflowPx}
            captionNumber={captionNumbers[block.id]}
          />
        ))}
      </div>
    </div>
  );
}

function computeCaptionNumbers(blocks: Block[]): Record<string, number> {
  const numbers: Record<string, number> = {};
  const byReadingOrder = (a: Block, b: Block) =>
    a.y - b.y || a.x - b.x;

  blocks
    .filter((block) => block.type === 'image' || block.type === 'chart')
    .slice()
    .sort(byReadingOrder)
    .forEach((block, index) => {
      numbers[block.id] = index + 1;
    });
  blocks
    .filter((block) => block.type === 'table')
    .slice()
    .sort(byReadingOrder)
    .forEach((block, index) => {
      numbers[block.id] = index + 1;
    });
  return numbers;
}
