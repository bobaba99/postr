/**
 * [A−] Body 36 pt [A+]: the poster's text size, one control for the whole
 * poster, in the editor's top bar between Redo and Save PDF (the MVP design
 * doc §3.7, owner decision D2; record docs/fixes/33-text-size.md). The rules
 * are poster/textSize.ts's.
 *
 * - The label is the body's size in whole pt, always (no "Custom" state);
 *   a body that is not a size (the Style tab's Body field cleared, or an
 *   odd stored value) shows no number, "Body – pt", and A+ sets it to 28 pt
 *   (textSize.ts rows 7 and 8).
 * - A press writes the four levels in one `patchDoc`: one undo step in the
 *   editor's one history (fix 12), so ⌘Z or Undo restores all four at once.
 * - A mouse press keeps the caret where it is: the buttons cancel mousedown,
 *   whose default action would move the focus out of the text, so the
 *   typing step in progress is neither lost nor split and the next letter
 *   lands where the last one did. A press from the keyboard (or by assistive
 *   technology) leaves the focus on the button, so pressing again steps
 *   again, and the editor's delete / nudge / duplicate keys do not act from
 *   the group (`onHistoryButtons`, the same rule as Undo and Redo, fix 12
 *   R3-F1).
 * - At a bound the button is greyed and marked aria-disabled, kept
 *   focusable so a keyboard user who stepped to the end keeps their place;
 *   its title says why. A press there does nothing.
 */
import type { MouseEvent } from 'react';
import { usePosterStore } from '@/stores/posterStore';
import { button, topBarGroup } from './HistoryButtons';
import { BODY_SIZES_PT, bodyTarget, isSize, stepTextSize, type TextSizeStep } from './textSize';
import { unitsToPt } from './constants';

const TOP = BODY_SIZES_PT[BODY_SIZES_PT.length - 1];
const BOTTOM = BODY_SIZES_PT[0];

/** What a button's title says: where a press takes the body, or why it cannot. */
function titleOf(step: TextSizeStep, to: number | null, hasSize: boolean): string {
  if (step === 'up') return to === null ? `Largest text size: the body is ${TOP} pt or more` : `Increase text size (body to ${to} pt)`;
  if (to !== null) return `Decrease text size (body to ${to} pt)`;
  return hasSize ? `Smallest text size: the body is ${BOTTOM} pt or less` : `No body size: A+ sets the body to ${BOTTOM} pt`;
}

function Glyph({ sign }: { sign: '−' | '+' }) {
  return (
    <span aria-hidden="true" style={{ display: 'flex', alignItems: 'baseline', fontFamily: "'DM Sans', system-ui, sans-serif", lineHeight: 1 }}>
      <span style={{ fontSize: sign === '+' ? 15 : 12, fontWeight: 600 }}>A</span>
      <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 1 }}>{sign}</span>
    </span>
  );
}

export function TextSizeControl({ left }: { left: number }) {
  const hasDoc = usePosterStore((s) => s.doc !== null);
  const bodySize: unknown = usePosterStore((s) => s.doc?.styles?.body?.size);
  if (!hasDoc) return null;
  const hasSize = isSize(bodySize);
  const press = (step: TextSizeStep) => () => {
    const { doc, patchDoc } = usePosterStore.getState();
    if (!doc) return;
    const styles = stepTextSize(doc.styles, step);
    if (styles) patchDoc({ styles }, null);
  };
  // The caret stays in the text a mouse press would take it from.
  const keepCaret = (e: MouseEvent) => e.preventDefault();
  const sizeButton = (step: TextSizeStep) => {
    const to = bodyTarget(bodySize, step);
    return (
      <button
        type="button"
        aria-label={step === 'up' ? 'Increase text size' : 'Decrease text size'}
        title={titleOf(step, to, hasSize)}
        aria-disabled={to === null ? true : undefined}
        onMouseDown={keepCaret}
        onClick={press(step)}
        style={button(to !== null)}
      >
        <Glyph sign={step === 'up' ? '+' : '−'} />
      </button>
    );
  };
  return (
    <div role="group" aria-label="Text size" data-postr-text-size style={{ ...topBarGroup, left }}>
      {sizeButton('down')}
      <span
        aria-live="polite"
        style={{
          padding: '0 6px',
          fontSize: 13,
          lineHeight: '28px',
          color: '#c8cad0',
          fontFamily: "'DM Sans', system-ui, sans-serif",
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        Body {hasSize ? Math.round(unitsToPt(bodySize)) : '–'} pt
      </span>
      {sizeButton('up')}
    </div>
  );
}
