/**
 * SmartText — inline canvas text editor for title / heading / text
 * blocks. Wraps a plain <textarea> styled to look like the surrounding
 * poster content. Uses the same shared slash-command logic as the
 * sidebar SmartTextarea, so the two surfaces behave identically.
 *
 * Why a textarea and not contentEditable:
 *   - The caret is drawn natively. No "type something, then arrow-
 *     key, then caret appears" bug.
 *   - selectionStart / selectionEnd are reliable for slash-command
 *     positioning, unlike the Range walking contentEditable requires.
 *   - Focus transfer works with React's default event flow — no
 *     preventDefault fights with the block drag handler.
 *
 * We autosize the textarea to its content so it visually matches
 * the rendered block area and doesn't introduce a stray scrollbar.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { filterSymbols } from './symbols';
import { applySymbolInsertion, matchSlashAtCaret } from './slashCommand';

interface SmartTextProps {
  value: string;
  onChange: (value: string) => void;
  style?: CSSProperties;
  placeholder?: string;
  /** Allows newlines + wraps; falsy = single-line title/heading style. */
  multiline?: boolean;
}

interface MenuState {
  open: boolean;
  prefix: string;
  x: number;
  y: number;
}

const INITIAL_MENU: MenuState = { open: false, prefix: '', x: 0, y: 0 };

export function SmartText({ value, onChange, style, placeholder, multiline }: SmartTextProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [menu, setMenu] = useState<MenuState>(INITIAL_MENU);
  const [focused, setFocused] = useState(false);

  // Autosize: set the textarea height to match its scrollHeight so
  // the editor stretches with the user's content rather than showing
  // an internal scrollbar.
  const autosize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    autosize();
  }, [value]);

  // Recompute the slash-command menu based on the caret position.
  const recomputeMenu = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const caret = ta.selectionStart;
    const match = matchSlashAtCaret(ta.value.substring(0, caret));
    if (!match) {
      setMenu((prev) => (prev.open ? INITIAL_MENU : prev));
      return;
    }
    // Anchor below the caret using getBoundingClientRect + a rough
    // estimate. For the canvas, positioning precision is less
    // important than for the sidebar because the menu floats at a
    // high z-index and the user can always click an option visually.
    const rect = ta.getBoundingClientRect();
    const lh = parseFloat(window.getComputedStyle(ta).lineHeight) || 20;
    // Place the menu near the top-left of the textarea for simplicity.
    // The canvas scale makes pixel-perfect caret tracking unreliable.
    setMenu({ open: true, prefix: match.prefix, x: 0, y: lh + 4 });
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    // Defer to the next tick so selectionStart reflects the post-
    // change caret, not the pre-change one.
    requestAnimationFrame(recomputeMenu);
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight' ||
      e.key === 'ArrowUp' ||
      e.key === 'ArrowDown' ||
      e.key === 'Home' ||
      e.key === 'End'
    ) {
      recomputeMenu();
    }
  };

  const insertSymbol = (key: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const result = applySymbolInsertion(ta.value, ta.selectionStart, key);
    if (!result) return;
    onChange(result.text);
    setMenu(INITIAL_MENU);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(result.caret, result.caret);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && menu.open) {
      e.preventDefault();
      setMenu(INITIAL_MENU);
      return;
    }
    if (menu.open && (e.key === 'Tab' || e.key === 'Enter')) {
      const items = filterSymbols(menu.prefix, 1);
      if (items.length > 0 && items[0]) {
        e.preventDefault();
        insertSymbol(items[0][0]);
        return;
      }
    }
    // Single-line mode: swallow Enter so the title/heading stays
    // on one line (unless the user explicitly wants multiline).
    if (!multiline && e.key === 'Enter' && !menu.open) {
      e.preventDefault();
    }
  };

  const handleFocus = () => {
    setFocused(true);
  };

  const handleBlur = () => {
    setFocused(false);
    window.setTimeout(() => setMenu(INITIAL_MENU), 120);
  };

  // Stop pointer events from bubbling up to the BlockFrame drag
  // handler — clicking inside the textarea should position the caret,
  // not start a block drag. Drag still works from the block frame
  // outside the textarea's bounds.
  const stopDrag = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  const items = menu.open ? filterSymbols(menu.prefix, 8) : [];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <textarea
        ref={textareaRef}
        value={value}
        placeholder={placeholder}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onClick={recomputeMenu}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPointerDown={stopDrag}
        rows={1}
        style={{
          all: 'unset',
          display: 'block',
          width: '100%',
          minHeight: '1em',
          boxSizing: 'border-box',
          resize: 'none',
          overflow: 'hidden',
          wordWrap: 'break-word',
          whiteSpace: multiline ? 'pre-wrap' : 'nowrap',
          cursor: 'text',
          ...style,
        }}
      />

      {/*
        Focus hint — small floating badge that appears while the
        textarea is focused and no slash menu is open. Tells users
        that slash symbols are available even though the dropdown
        only shows after they start typing a prefix.
      */}
      {focused && !menu.open && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            bottom: -24,
            left: 0,
            fontSize: 10,
            fontFamily: 'system-ui',
            fontWeight: 600,
            color: '#9ca3af',
            background: '#1a1a26ee',
            border: '1px solid #2a2a3a',
            borderRadius: 4,
            padding: '3px 8px',
            letterSpacing: 0.3,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 150,
          }}
        >
          Type <span style={{ color: '#c8b6ff', fontFamily: 'monospace' }}>/</span> for symbols · <span style={{ color: '#c8b6ff', fontFamily: 'monospace' }}>/alpha</span>, <span style={{ color: '#c8b6ff', fontFamily: 'monospace' }}>/leq</span>, <span style={{ color: '#c8b6ff', fontFamily: 'monospace' }}>/pm</span>…
        </div>
      )}

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
            zIndex: 200,
            maxHeight: 180,
            overflow: 'auto',
            boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
            minWidth: 160,
          }}
        >
          {items.map(([k, sym]) => (
            <div
              key={k}
              role="option"
              aria-selected={false}
              onMouseDown={(e) => {
                e.preventDefault();
                insertSymbol(k);
              }}
              style={{
                padding: '6px 10px',
                cursor: 'pointer',
                fontSize: 12,
                color: '#ddd',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 16,
                borderRadius: 4,
              }}
            >
              <span style={{ color: '#7c6aed', fontFamily: 'monospace', fontSize: 11 }}>/{k}</span>
              <span style={{ fontSize: 14 }}>{sym}</span>
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
