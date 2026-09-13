/**
 * The sentence under "Code Readability Check" that says what size the
 * analyzer is scoring against — split out of ReadabilityPanel because
 * it is the one piece of copy that differs per host:
 *
 *   image block selected (editor) → "Using selected image block …"
 *   editor, no block               → the draggable canvas overlay
 *   public page                    → the print size typed above
 *
 * The animated `postr-dimension-pill` is re-keyed on the dimensions so
 * the browser restarts its pulse whenever the size changes (a drag on
 * the canvas, a different image, a new number in the page's inputs),
 * drawing the eye to the fresh value.
 */
import type { ReadabilityLayout } from './readabilityLayout';

interface Props {
  layout: ReadabilityLayout;
  /** True only when an image block sizes the check (editor layout). */
  isImage: boolean;
  widthIn: number;
  heightIn: number;
}

export function ReadabilitySizingNote({ layout, isImage, widthIn, heightIn }: Props) {
  const w = widthIn.toFixed(1);
  const h = heightIn.toFixed(1);
  const pill = (
    <span key={`${w}-${h}`} className="postr-dimension-pill">
      {w}&quot; × {h}&quot;
    </span>
  );

  if (isImage) {
    return <>Using selected image block {pill}.</>;
  }
  if (layout === 'page') {
    return (
      <>
        Sizing against the print size you entered above {pill}. Change the
        width or height and click <b>Check</b> again.
      </>
    );
  }
  return (
    <>
      Sizing against the gray <b>figure preview</b> on the canvas {pill} — drag
      or resize it to match your real figure, or click an existing image block
      to use its exact dimensions.
    </>
  );
}
