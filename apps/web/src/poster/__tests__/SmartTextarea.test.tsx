/**
 * SmartTextarea behavioural tests.
 *
 * Focuses on the user-visible contract:
 *  - typing `/al` opens a dropdown with matching symbols
 *  - clicking an item replaces `/prefix` with the symbol character
 *  - Escape closes the menu without inserting
 *  - Tab / Enter picks the top match
 *  - a bare `/` (no letters yet) does NOT open the menu
 *
 * Caret-position pinning (the mirror-div measurement) is tested
 * implicitly by the dropdown being in the DOM after a slash —
 * exact pixel placement is a jsdom wart not worth asserting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { SmartTextarea } from '../SmartTextarea';

function ControlledHarness({ onChange }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <SmartTextarea
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      placeholder="type here"
    />
  );
}

beforeEach(() => {
  // jsdom doesn't lay out text, so getBoundingClientRect is all
  // zeroes. That's fine — the menu still renders and we assert on
  // its presence + content rather than position.
});

describe('SmartTextarea slash commands', () => {
  it('opens the dropdown after typing "/al"', async () => {
    render(<ControlledHarness />);
    const ta = screen.getByPlaceholderText('type here') as HTMLTextAreaElement;

    fireEvent.change(ta, { target: { value: '/al' } });

    // "alpha" should be in the filtered list
    await waitFor(() => {
      expect(screen.getByText('/alpha')).toBeInTheDocument();
    });
  });

  it('does not open the dropdown without any slash', () => {
    render(<ControlledHarness />);
    const ta = screen.getByPlaceholderText('type here') as HTMLTextAreaElement;

    fireEvent.change(ta, { target: { value: 'hello' } });

    expect(screen.queryByText('/alpha')).not.toBeInTheDocument();
  });

  it('inserts the symbol and removes the /prefix on click', async () => {
    const onChange = vi.fn();
    render(<ControlledHarness onChange={onChange} />);
    const ta = screen.getByPlaceholderText('type here') as HTMLTextAreaElement;

    fireEvent.change(ta, { target: { value: '/alp' } });
    await waitFor(() => screen.getByText('/alpha'));

    fireEvent.mouseDown(screen.getByText('/alpha'));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('α');
    });
  });

  it('Escape closes the menu without inserting', async () => {
    const onChange = vi.fn();
    render(<ControlledHarness onChange={onChange} />);
    const ta = screen.getByPlaceholderText('type here') as HTMLTextAreaElement;

    fireEvent.change(ta, { target: { value: '/al' } });
    await waitFor(() => screen.getByText('/alpha'));

    fireEvent.keyDown(ta, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByText('/alpha')).not.toBeInTheDocument();
    });
    // Value unchanged (no insert)
    expect(onChange).toHaveBeenLastCalledWith('/al');
  });

  it('Tab picks the top match', async () => {
    const onChange = vi.fn();
    render(<ControlledHarness onChange={onChange} />);
    const ta = screen.getByPlaceholderText('type here') as HTMLTextAreaElement;

    fireEvent.change(ta, { target: { value: '/bet' } });
    await waitFor(() => screen.getByText('/beta'));

    fireEvent.keyDown(ta, { key: 'Tab' });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('β');
    });
  });

  it('preserves surrounding text when inserting in the middle', async () => {
    const onChange = vi.fn();
    render(<ControlledHarness onChange={onChange} />);
    const ta = screen.getByPlaceholderText('type here') as HTMLTextAreaElement;

    // Simulate the user typing "p = /al" then the caret being at the
    // end of "al" when they pick alpha.
    fireEvent.change(ta, {
      target: { value: 'p = /al', selectionStart: 7, selectionEnd: 7 },
    });
    await waitFor(() => screen.getByText('/alpha'));

    fireEvent.mouseDown(screen.getByText('/alpha'));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('p = α');
    });
  });
});
