/**
 * SheetSizeFields — Layout › Poster Size: the preset menu and the custom
 * width × height inputs.
 *
 * Typing only changes the field. The size is REQUESTED when the fields are
 * committed (Enter, or leaving them), and the editor then asks before moving
 * the poster onto the new sheet (owner decision, docs/fixes/02-poster-size.md).
 * Width and height are one change: moving from one to the other asks
 * nothing. Asking on that move opened the dialog mid-flow, and the height
 * the user went on to type landed on its button (re-check of fix 02, BK-8).
 *
 * The menu follows the same rule for the keyboard: a closed <select> fires
 * `change` on every type-ahead key, so asking on each one opened a dialog for
 * a preset nobody chose, and the next key (the space in "A0 P") pressed its
 * button. A keyboard change only moves the menu; Enter or leaving it asks,
 * Escape puts it back. A mouse pick asks at once. Pressing the mouse on the
 * menu drops any keyboard choice: left in place, a pick of the current size
 * showed the keyboard choice and leaving the menu asked about it (BK-7), and
 * a picker that takes focus when it opens asked about it before any pick.
 *
 * The fields used to apply every keystroke: typing "24" made a 2-inch poster
 * for a moment, which dropped the credit mark, and a value below the field's
 * own minimum was accepted because `min` is only a hint to the browser.
 */
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { POSTER_SIZES, type PosterSizeKey } from '../constants';
import { parseSheetInches, SHEET_MAX_IN, SHEET_MIN_IN } from '../resizeSheet';

type Field = 'width' | 'height';

export function SheetSizeFields(props: {
  /** The preset this poster's size matches, or 'custom'. */
  sizeKey: PosterSizeKey | 'custom';
  widthIn: number;
  heightIn: number;
  /** Ask for this size. The editor confirms before applying it. */
  onRequestSize: (widthIn: number, heightIn: number) => void;
  inputStyle: CSSProperties;
  selectStyle: CSSProperties;
}) {
  // The preset chosen by keyboard and not yet committed; null shows the poster's.
  const [menuDraft, setMenuDraft] = useState<string | null>(null);
  // Whether the menu's next change comes from the keyboard.
  const keyed = useRef(false);
  const requestPreset = (key: string) => {
    const preset = POSTER_SIZES[key];
    if (preset) props.onRequestSize(preset.w, preset.h);
  };
  const commitMenu = () => {
    if (menuDraft === null) return;
    const key = menuDraft;
    setMenuDraft(null);
    requestPreset(key);
  };

  // What the user is typing, per field; null shows the poster's own size.
  const [draft, setDraft] = useState<Record<Field, string | null>>({ width: null, height: null });
  // The rejected field and why, shown under the fields until the next edit.
  const [error, setError] = useState<{ field: Field; message: string } | null>(null);
  const errorId = useId();

  // The poster's size changed (a confirmed change, the menu, undo): the
  // fields show it, with nothing left over from an earlier edit.
  useEffect(() => {
    setDraft({ width: null, height: null });
    setError(null);
  }, [props.widthIn, props.heightIn]);

  // Commits what both fields hold: a side not typed in keeps the poster's.
  // `leaving`: focus is leaving both fields, so nothing typed is kept.
  const commit = (leaving: boolean) => {
    if (draft.width === null && draft.height === null) return;
    const inches = (field: Field, current: number) => {
      const typed = draft[field];
      return typed === null ? current : parseSheetInches(typed);
    };
    const w = inches('width', props.widthIn);
    const h = inches('height', props.heightIn);
    const bad: Field | null = w === null ? 'width' : h === null ? 'height' : null;
    if (bad) {
      // While the change is in progress (Enter in a field), only the rejected
      // side goes back to the poster's size: clearing both threw away a valid
      // value typed in the other field (final review, F3). Leaving both
      // fields puts both back, or the fields would go on showing a size the
      // poster does not have (last-round verification, L-1).
      if (leaving) setDraft({ width: null, height: null });
      else setDraft((d) => ({ ...d, [bad]: null }));
      setError({ field: bad, message: `The poster ${bad} must be between ${SHEET_MIN_IN} and ${SHEET_MAX_IN} in.` });
      return;
    }
    setDraft({ width: null, height: null });
    setError(null);
    if (w === props.widthIn && h === props.heightIn) return;
    props.onRequestSize(w!, h!);
  };

  const fieldRefs = useRef<Record<Field, HTMLInputElement | null>>({ width: null, height: null });

  const onKeyDown = (field: Field) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(false);
    } else if (e.key === 'Escape') {
      setDraft((d) => ({ ...d, [field]: null }));
      setError(null);
    }
  };

  const input = (field: Field, label: string, current: number) => (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 2 }}>{label}</div>
      <input
        ref={(el) => {
          fieldRefs.current[field] = el;
        }}
        type="number"
        value={draft[field] ?? String(current)}
        aria-label={`Poster ${field} in inches`}
        aria-invalid={error?.field === field || undefined}
        aria-describedby={error?.field === field ? errorId : undefined}
        onChange={(e) => {
          setDraft((d) => ({ ...d, [field]: e.target.value }));
          setError(null);
        }}
        onKeyDown={onKeyDown(field)}
        onBlur={(e) => {
          // Moving to the other size field is part of the same change.
          const other = fieldRefs.current[field === 'width' ? 'height' : 'width'];
          if (other && e.relatedTarget === other) return;
          commit(true);
        }}
        min={SHEET_MIN_IN}
        max={SHEET_MAX_IN}
        step={0.1}
        style={{ ...props.inputStyle, fontSize: 14, width: '100%' }}
      />
    </div>
  );

  return (
    <>
      <select
        aria-label="Poster size"
        value={menuDraft ?? props.sizeKey}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitMenu();
          } else if (e.key === 'Escape') {
            setMenuDraft(null);
          } else if (e.key !== 'Tab') {
            keyed.current = true;
          }
        }}
        onMouseDown={() => {
          keyed.current = false;
          setMenuDraft(null);
        }}
        onChange={(e) => {
          if (keyed.current) setMenuDraft(e.target.value);
          else requestPreset(e.target.value);
        }}
        onBlur={() => {
          keyed.current = false;
          commitMenu();
        }}
        style={props.selectStyle}
      >
        {Object.entries(POSTER_SIZES).map(([k, v]) => (
          <option key={k} value={k}>
            {v.label}
          </option>
        ))}
        <option value="custom">Custom Size</option>
      </select>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        {input('width', 'Width (in)', props.widthIn)}
        <div style={{ fontSize: 14, color: '#6b7280', marginTop: 16 }}>×</div>
        {input('height', 'Height (in)', props.heightIn)}
      </div>
      <div
        id={errorId}
        role="status"
        aria-live="polite"
        style={{ fontSize: 12, color: '#f87171', marginTop: error ? 4 : 0 }}
      >
        {error?.message}
      </div>
    </>
  );
}
