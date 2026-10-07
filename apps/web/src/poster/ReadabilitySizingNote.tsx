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
 *
 * In French on the French page (fix 26; i18n/readability.ts `sizing`),
 * the pill in French style (10,0 po × 7,0 po). `keptResultNote` is the
 * editor's only, so English.
 */
import type { CheckedInputs } from './figureScriptDraft';
import type { ReadabilityLayout } from './readabilityLayout';
import { READABILITY_COPY } from '@/i18n/readability';
import { formatNumber, type Lang } from '@/i18n/lang';

interface Props {
  layout: ReadabilityLayout;
  /** The page's language; the editor passes none. */
  lang?: Lang;
  /** True only when an image block sizes the check (editor layout). */
  isImage: boolean;
  widthIn: number;
  heightIn: number;
}

export function ReadabilitySizingNote({ layout, lang = 'en', isImage, widthIn, heightIn }: Props) {
  const c = READABILITY_COPY[lang];
  const s = c.sizing;
  const w = formatNumber(widthIn, lang, 1);
  const h = formatNumber(heightIn, lang, 1);
  const pill = (
    <span key={`${w}-${h}`} className="postr-dimension-pill">
      {lang === 'fr' ? `${w}\u00a0po × ${h}\u00a0po` : `${w}" × ${h}"`}
    </span>
  );

  if (isImage) {
    return <>{s.image} {pill}.</>;
  }
  if (layout === 'page') {
    return (
      <>
        {s.pageLead} {pill}{s.pageMiddle} <b>{c.introCheck}</b>{s.pageTail}
      </>
    );
  }
  return (
    <>
      {s.panelLead} <b>{s.panelPreview}</b> {s.panelMiddle} {pill} {s.panelTail}
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
