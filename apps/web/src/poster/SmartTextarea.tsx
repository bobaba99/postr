/**
 * SmartTextarea — plain <textarea> + slash-command autocomplete.
 *
 * Parallel to the canvas SmartText but built on top of a regular
 * textarea instead of contentEditable, so it slots cleanly into the
 * sidebar edit panel and feels like any other form control. Uses
 * textarea.selectionStart / selectionEnd for cursor math (much more
 * reliable than contentEditable Range walking).
 *
 * The slash command flow:
 *   1. User types `/al` → onChange fires, we diff before/after.
 *   2. Regex `/([a-zA-Z0-9]*)$` against the substring left of the
 *      caret surfaces the active prefix.
 *   3. Dropdown anchors to the caret using a hidden mirror div that
 *      reproduces the textarea's layout up to the caret position —
 *      standard pattern for pinning a popover to a textarea caret.
 *   4. Picking an item (click, Tab, or Enter) replaces `/prefix`
 *      with the symbol and commits via onChange.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { filterSymbols } from './symbols';
import { applySymbolInsertion, matchSlashAtCaret } from './slashCommand';

export interface SmartTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Extra styles merged into the textarea's inline style object. */
  style?: CSSProperties;
  /** Visual rows — maps to the HTML rows attribute. */
  rows?: number;
}

interface MenuState {
  open: boolean;
  prefix: string;
  /** Caret position in px relative to the textarea's top-left. */
  x: number;
  y: number;
}

const INITIAL_MENU: MenuState = { open: false, prefix: '', x: 0, y: 0 };

/**
 * Mirrors the textarea's content in a hidden div to measure where
 * the caret currently sits. Copies every style that affects text
 * metrics (font, padding, line-height, etc.) so the positions match.
 */
function measureCaretPosition(
  textarea: HTMLTextAreaElement,
  caretIndex: number,
): { x: number; y: number } {
  const mirror = document.createElement('div');
  const style = window.getComputedStyle(textarea);
  const props = [
    'boxSizing',
    'width',
    'height',
    'overflowX',
    'overflowY',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'fontStyle',
    'fontVariant',
    'fontWeight',
    'fontStretch',
    'fontSize',
    'fontSizeAdjust',
    'lineHeight',
    'fontFamily',
    'textAlign',
    'textTransform',
    'textIndent',
    'textDecoration',
    'letterSpacing',
    'wordSpacing',
    'tabSize',
  ] as const;

  for (const p of props) {
    // The `any` cast is unavoidable — style is a CSSStyleDeclaration
    // proxy with index-signature access but getPropertyValue is overkill here.
    mirror.style[p as never] = style[p as never] as never;
  }
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';

  const before = textarea.value.substring(0, caretIndex);
  mirror.textContent = before;

  // A zero-width marker span at the caret position — its bounding
  // rect gives us the caret coordinates within the mirror.
  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  mirror.appendChild(marker);

  document.body.appendChild(mirror);
  const markerRect = marker.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  document.body.removeChild(mirror);

  return {
    x: markerRect.left - mirrorRect.left - textarea.scrollLeft,
    y: markerRect.top - mirrorRect.top - textarea.scrollTop,
  };
}

export function SmartTextarea({ value, onChange, placeholder, style, rows = 4 }: SmartTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [menu, setMenu] = useState<MenuState>(INITIAL_MENU);

  const recomputeMenu = (text: string, caret: number) => {
    const match = matchSlashAtCaret(text.substring(0, caret));
    if (!match) {
      setMenu((prev) => (prev.open ? INITIAL_MENU : prev));
      return;
    }
    const textarea = textareaRef.current;
    if (!textarea) return;
    // Anchor the dropdown at the position of the slash itself so it
    // grows downward from the trigger, not from the cursor tail.
    const slashIdx = match.before.length;
    const pos = measureCaretPosition(textarea, slashIdx);
    const lineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight) || 20;
    setMenu({
      open: true,
      prefix: match.prefix,
      x: pos.x,
      y: pos.y + lineHeight + 2,
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    onChange(next);
    recomputeMenu(next, e.target.selectionStart ?? next.length);
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Arrow keys / click moves the caret without changing value;
    // re-check the slash context so the menu closes or shifts.
    if (
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight' ||
      e.key === 'ArrowUp' ||
      e.key === 'ArrowDown' ||
      e.key === 'Home' ||
      e.key === 'End'
    ) {
      const ta = textareaRef.current;
      if (ta) recomputeMenu(ta.value, ta.selectionStart);
    }
  };

  const insertSymbol = (key: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const result = applySymbolInsertion(ta.value, ta.selectionStart, key);
    if (!result) return;
    onChange(result.text);
    setMenu(INITIAL_MENU);
    // Restore caret position just after the inserted symbol on the
    // next tick, once React has flushed the new value.
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(result.caret, result.caret);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && menu.open) {
      setMenu(INITIAL_MENU);
      return;
    }
    if (menu.open && (e.key === 'Tab' || e.key === 'Enter')) {
      const items = filterSymbols(menu.prefix, 1);
      if (items.length > 0 && items[0]) {
        e.preventDefault();
        insertSymbol(items[0][0]);
      }
    }
  };

  // Close the menu on blur, but use a short delay so clicking an
  // item (which blurs the textarea first) doesn't dismiss before
  // the click registers.
  const handleBlur = () => {
    window.setTimeout(() => setMenu(INITIAL_MENU), 120);
  };

  // Keep controlled value in sync — React's controlled textarea
  // pattern already handles this, but we rerun recomputeMenu if the
  // value changed from outside (e.g. parent re-render) so the
  // dropdown stays consistent.
  useLayoutEffect(() => {
    if (!textareaRef.current) return;
    if (textareaRef.current.value !== value) {
      textareaRef.current.value = value;
    }
  }, [value]);

  const items = menu.open ? filterSymbols(menu.prefix, 8) : [];

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <textarea
        ref={textareaRef}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onBlur={handleBlur}
        style={{
          all: 'unset',
          display: 'block',
          width: '100%',
          boxSizing: 'border-box',
          background: '#1a1a26',
          border: '1px solid #2a2a3a',
          borderRadius: 6,
          padding: '12px 14px',
          color: '#ddd',
          fontSize: 16,
          fontFamily: 'inherit',
          lineHeight: 1.5,
          resize: 'vertical',
          ...style,
        }}
      />

      {menu.open && items.length > 0 && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: menu.y,
            left: menu.x,
            background: '#1a1a2e',
            border: '1px solid #3a3a4a',
            borderRadius: 6,
            padding: 4,
            zIndex: 300,
            maxHeight: 180,
            overflow: 'auto',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            minWidth: 180,
          }}
        >
          {items.map(([k, sym]) => (
            <div
              key={k}
              role="option"
              aria-selected={false}
              onMouseDown={(e) => {
                // preventDefault so the textarea doesn't blur (which
                // would cancel the caret restore we do after insert).
                e.preventDefault();
                insertSymbol(k);
              }}
              style={{
                padding: '6px 10px',
                cursor: 'pointer',
                fontSize: 13,
                color: '#ddd',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 16,
                borderRadius: 4,
              }}
            >
              <span style={{ color: '#7c6aed', fontFamily: 'monospace', fontSize: 12 }}>/{k}</span>
              <span style={{ fontSize: 15 }}>{sym}</span>
            </div>
          ))}
          <div style={{ fontSize: 10, color: '#666', padding: '4px 10px', borderTop: '1px solid #333' }}>
            Tab or Enter to insert
          </div>
        </div>
      )}
    </div>
  );
}
