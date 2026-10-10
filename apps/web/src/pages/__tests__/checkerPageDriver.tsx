/**
 * Drives /tools/figure-readability the way a visitor does, for the plot
 * checker's entry tests (fix 13b): a print size typed into Width and Height
 * (Enter commits), the script pasted, ▶ Check pressed, the table, the scale
 * line and "Copy edited code"'s code read from the page.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import FigureReadabilityPage from '../FigureReadability';

export const ALL_PASS = 'Every element in the table meets its minimum at this poster size.';

export function renderPage(): void {
  render(
    <MemoryRouter initialEntries={['/tools/figure-readability']}>
      <FigureReadabilityPage />
    </MemoryRouter>,
  );
}

export function typeSize(w: number, h: number) {
  for (const [label, v] of [['Width', w], ['Height', h]] as const) {
    const input = screen.getByLabelText(label) as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: String(v) } });
    fireEvent.keyDown(input, { key: 'Enter' });
  }
}

export function check(code: string) {
  fireEvent.change(screen.getByLabelText('Your R or Python plotting code'), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: /check$/i }));
}

/** One row of the results table as the page shows it ("10pt*": a size the code does not set), or null. */
export function findRow(name: string): { source: string; print: string; glyph: string } | null {
  const tr = screen.getAllByRole('row').find((r) => r.querySelector('td')?.textContent === name);
  if (!tr) return null;
  const td = [...tr.querySelectorAll('td')].map((c) => c.textContent ?? '');
  return { source: td[1]!, print: td[2]!, glyph: td[4]! };
}

export function row(name: string): { source: string; print: string; glyph: string } {
  const r = findRow(name);
  if (!r) throw new Error(`no row ${name}`);
  return r;
}

/** The code "Copy edited code" copies: the fix box's own code view ('' when none is offered). */
export function editedCode(): string {
  const button = screen.queryByRole('button', { name: 'Copy edited code' });
  if (!button) return '';
  const box = button.parentElement!.parentElement!;
  return box.querySelector('pre')!.textContent ?? '';
}

/** The scale line ("Scale factor: 1.25x", with "*" when the canvas is assumed). */
export const scaleLine = () => screen.getByText(/^Scale factor:/).textContent ?? '';
