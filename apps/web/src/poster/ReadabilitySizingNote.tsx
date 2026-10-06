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
 *
 * `keptResultNote` is its companion in the editor: the line that says
 * which size a kept result is for when that is not the size named here
 * (plan item 7, review round 2).
 */
import type { CheckedInputs } from './figureScriptDraft';
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

/** A size as the pill shows it: 10.0" × 7.0". */
function inchesLabel(widthIn: number, heightIn: number): string {
  return `${widthIn.toFixed(1)}" × ${heightIn.toFixed(1)}"`;
}

/**
 * The editor's line about a kept result that is not for the size the
 * sizing note names: hidden because it is for another figure, or shown
 * at the size it was checked at. Compared as the pill shows sizes, so a
 * hair's difference the pill cannot show does not raise it. Null when the
 * result is for what the note names, or there is none (or on the page,
 * which hides a result at another size).
 */
export function keptResultNote(
  layout: ReadabilityLayout,
  kept: CheckedInputs | null,
  otherFigure: boolean,
  widthIn: number,
  heightIn: number,
): string | null {
  if (layout !== 'panel' || kept === null) return null;
  const checkedAt = inchesLabel(kept.widthIn, kept.heightIn);
  if (otherFigure) {
    return kept.imageId !== null
      ? `The last result is for an image block at ${checkedAt}. Click Check to check the size above.`
      : `The last result is for the figure preview at ${checkedAt}. Click Check to check the size above.`;
  }
  return checkedAt === inchesLabel(widthIn, heightIn)
    ? null
    : `This result is for ${checkedAt}, not the size above. Click Check to update it.`;
}
