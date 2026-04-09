/**
 * SmartText — contentEditable block with slash-command autocomplete.
 *
 * The user types `/foo` and a dropdown surfaces matching symbols
 * from the SYMBOLS map. Selecting one (click, Tab, or Enter)
 * replaces the `/foo` literal with the symbol character.
 *
 * Cursor position is computed by walking the DOM range — see the
 * `getTextAndCursor` helper. The dropdown is anchored to the
 * caret rectangle, not the block, so it follows the cursor.
 *
 * Ported from prototype.js. The logic is fiddly because
 * contentEditable is fiddly; resist refactoring without tests.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { SYMBOLS, filterSymbols } from './symbols';

interface SmartTextProps {
  value: string;
  onChange: (value: string) => void;
  style?: CSSProperties;
  placeholder?: string;
  multiline?: boolean;
}

interface MenuPosition {
  top: number;
  left: number;
}

export function SmartText({ value, onChange, style, placeholder, multiline }: SmartTextProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [menuFilter, setMenuFilter] = useState('');
  const [menuPos, setMenuPos] = useState<MenuPosition>({ top: 0, left: 0 });

  // Sync external value into the contentEditable on first mount only.
  // We don't want to fight the DOM on every parent re-render — the
  // contentEditable is the source of truth while the user types.
  useEffect(() => {
    if (ref.current && ref.current.textContent !== value) {
      ref.current.textContent = value || '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getTextAndCursor = (): { text: string; pos: number } => {
    if (!ref.current) return { text: '', pos: 0 };
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      return { text: ref.current.textContent ?? '', pos: 0 };
    }
    const range = sel.getRangeAt(0).cloneRange();
    range.selectNodeContents(ref.current);
    range.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
    return { text: ref.current.textContent ?? '', pos: range.toString().length };
  };

  const checkSlash = () => {
    const { text, pos } = getTextAndCursor();
    const before = text.substring(0, pos);
    const m = before.match(/\/([a-zA-Z0-9]*)$/);
    if (m && m[0].length >= 2) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount && ref.current) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        const pr = ref.current.getBoundingClientRect();
        setMenuFilter(m[1] ?? '');
        setMenuPos({ top: rect.bottom - pr.top + 2, left: Math.max(0, rect.left - pr.left) });
        setShowMenu(true);
      }
    } else {
      setShowMenu(false);
    }
  };

  const insertSymbol = (key: string) => {
    const sym = SYMBOLS[key];
    if (!sym || !ref.current) return;
    const { text, pos } = getTextAndCursor();
    const before = text.substring(0, pos);
    const slashIdx = before.lastIndexOf('/');
    if (slashIdx < 0) return;

    const newText = text.substring(0, slashIdx) + sym + text.substring(pos);
    ref.current.textContent = newText;
    onChange(newText);

    // Restore caret to just after the inserted symbol.
    try {
      const newPos = slashIdx + sym.length;
      const walker = document.createTreeWalker(ref.current, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode() as Text | null;
      let offset = 0;
      while (node) {
        if (offset + node.length >= newPos) {
          const rng = document.createRange();
          rng.setStart(node, newPos - offset);
          rng.collapse(true);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(rng);
          break;
        }
        offset += node.length;
        node = walker.nextNode() as Text | null;
      }
    } catch {
      /* swallow — selection APIs are flaky cross-browser */
    }
    setShowMenu(false);
  };

  const handleInput = () => {
    if (!ref.current) return;
    onChange(ref.current.textContent ?? '');
    checkSlash();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      setShowMenu(false);
      return;
    }
    if (showMenu && (e.key === 'Tab' || e.key === 'Enter')) {
      e.preventDefault();
      const filtered = filterSymbols(menuFilter, 1);
      if (filtered.length > 0 && filtered[0]) {
        insertSymbol(filtered[0][0]);
      }
    }
  };

  const dropdownItems = showMenu ? filterSymbols(menuFilter, 8) : [];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        data-placeholder={placeholder}
        style={{
          outline: 'none',
          minHeight: '1em',
          cursor: 'text',
          wordWrap: 'break-word',
          whiteSpace: multiline ? 'pre-wrap' : 'normal',
          width: '100%',
          height: '100%',
          ...style,
        }}
      />

      {showMenu && dropdownItems.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: menuPos.top,
            left: menuPos.left,
            background: '#1a1a2e',
            border: '1px solid #444',
            borderRadius: 5,
            padding: 3,
            zIndex: 200,
            maxHeight: 140,
            overflow: 'auto',
            boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
            minWidth: 120,
          }}
        >
          {dropdownItems.map(([k, sym]) => (
            <div
              key={k}
              onMouseDown={(e) => {
                e.preventDefault();
                insertSymbol(k);
              }}
              style={{
                padding: '4px 10px',
                cursor: 'pointer',
                fontSize: 11,
                color: '#ddd',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 16,
                borderRadius: 3,
              }}
            >
              <span style={{ color: '#7c6aed', fontFamily: 'monospace', fontSize: 10 }}>/{k}</span>
              <span style={{ fontSize: 13 }}>{sym}</span>
            </div>
          ))}
          <div style={{ fontSize: 8, color: '#555', padding: '3px 10px', borderTop: '1px solid #333' }}>
            Tab or Enter to insert
          </div>
        </div>
      )}
    </div>
  );
}
