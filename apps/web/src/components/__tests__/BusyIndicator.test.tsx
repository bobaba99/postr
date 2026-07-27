import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BusyIndicator, busyProps } from '../BusyIndicator';

describe('BusyIndicator', () => {
  it('announces the label to screen readers as a polite status', () => {
    render(<BusyIndicator label="Reading your spreadsheet…" />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Reading your spreadsheet…');
    expect(status.getAttribute('aria-live')).toBe('polite');
  });

  it('says what is happening in words, not just a spinner', () => {
    render(<BusyIndicator label="Building slides…" hint="First export takes longer." />);
    expect(screen.getByText('Building slides…')).toBeInTheDocument();
    expect(screen.getByText('First export takes longer.')).toBeInTheDocument();
  });

  it('never renders a percentage — duration is unknown', () => {
    const { container } = render(<BusyIndicator label="Drafting…" />);
    expect(container.textContent).not.toMatch(/\d+\s*%/);
    // Indeterminate work gets a sweeping shuttle, not a measured fill.
    expect(container.querySelector('.postr-busy-shuttle')).not.toBeNull();
  });

  it('hides the moving parts from assistive tech so only words are read', () => {
    const { container } = render(<BusyIndicator label="Working…" />);
    const track = container.querySelector('.postr-busy-track');
    expect(track?.getAttribute('aria-hidden')).toBe('true');
  });

  it('uses the animation classes the reduced-motion rules target', () => {
    // The fallback lives in index.css keyed on these class names — if
    // they are renamed without updating the stylesheet, reduced-motion
    // users silently lose their static indicator.
    const block = render(<BusyIndicator label="Working…" />);
    expect(block.container.querySelector('.postr-busy-shuttle')).not.toBeNull();
    block.unmount();

    const inline = render(<BusyIndicator label="Working…" inline />);
    expect(inline.container.querySelector('.postr-busy-dot')).not.toBeNull();
  });

  it('inline form still carries the label and the status role', () => {
    render(<BusyIndicator label="Zipping 3 figures…" inline />);
    expect(screen.getByRole('status')).toHaveTextContent('Zipping 3 figures…');
  });
});

describe('busyProps', () => {
  it('marks a region busy so assistive tech knows it is mid-update', () => {
    expect(busyProps(true)).toEqual({ 'aria-busy': true });
    expect(busyProps(false)).toEqual({ 'aria-busy': false });
  });
});
