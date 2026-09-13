/**
 * /tools/figure-readability — the public figure-readability check.
 *
 * Load-bearing properties, mirroring pages/__tests__/ChartChooser.test.tsx:
 * 1. No Supabase session is created on load — not even anonymous.
 * 2. Crawler copy parity — the live h1 and lede must match the
 *    routes.json record the prerender script injects for non-JS crawlers.
 * 3. The image-OCR scan path (Claude Vision via /api/import/extract) is
 *    never mounted and never called: the whole check is client-side.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const authSpies = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: null } })),
  signInAnonymously: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  onAuthStateChange: vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  })),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: authSpies },
}));

const apiSpies = vi.hoisted(() => ({
  postJson: vi.fn(),
}));

vi.mock('@/lib/apiClient', () => ({
  postJson: apiSpies.postJson,
  ApiError: class extends Error {},
}));

import FigureReadabilityPage from '../FigureReadability';
import routesJson from '../../seo/routes.json';

const RECORD = (
  routesJson.static as Record<string, { h1: string; copy: string[] } | undefined>
)['/tools/figure-readability'];

/** ggsave 7×5 at 10×7 → scale 1.4 → tick labels 12.3pt < 14pt (fails). */
const R_CODE = [
  'library(ggplot2)',
  'ggplot(mtcars, aes(mpg, wt)) + geom_point() + theme_minimal(base_size = 11)',
  'ggsave("fig.png", width = 7, height = 5)',
].join('\n');

/** WCAG 2.5.5 / Apple HIG minimum target size, in CSS px. */
const TARGET_FLOOR = 44;

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/tools/figure-readability']}>
      <FigureReadabilityPage />
    </MemoryRouter>,
  );
}

function codeEditor(): HTMLTextAreaElement {
  return screen.getByPlaceholderText(/paste your ggplot/i) as HTMLTextAreaElement;
}

function pasteCode(code: string) {
  fireEvent.change(codeEditor(), { target: { value: code } });
}

function clickCheck() {
  fireEvent.click(screen.getByRole('button', { name: /check$/i }));
}

describe('FigureReadabilityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has a routes.json record to prerender from', () => {
    expect(RECORD, 'the static /tools/figure-readability record is missing').toBeDefined();
  });

  it('keeps the h1 and lede in parity with the prerender record', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(RECORD!.h1);
    expect(screen.getByText(RECORD!.copy[0]!)).toBeInTheDocument();
  });

  it('creates no Supabase session on load', () => {
    renderPage();
    expect(authSpies.signInAnonymously).not.toHaveBeenCalled();
    expect(authSpies.signUp).not.toHaveBeenCalled();
    expect(authSpies.signInWithPassword).not.toHaveBeenCalled();
  });

  it('never mounts the image-OCR scan path', () => {
    renderPage();
    expect(screen.queryByText(/scan image/i)).toBeNull();
    expect(screen.queryByText(/scan image text/i)).toBeNull();
  });

  it('uses page copy, not the editor canvas-overlay copy', () => {
    renderPage();
    expect(screen.queryByText(/drag or resize it/i)).toBeNull();
    expect(screen.getByText(/print size you entered above/i)).toBeInTheDocument();
    expect(screen.getByText('Printed figure size')).toBeInTheDocument();
  });

  it('places the panel under a screen-reader section heading', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Check your code' }),
    ).toBeInTheDocument();
  });

  it('runs a full check client-side and reports the fix', () => {
    renderPage();
    pasteCode(R_CODE);
    clickCheck();

    expect(screen.getByText('Tick labels')).toBeInTheDocument();
    // The advice leads with per-element sizes, not base_size: base_size
    // scales every text element including the ones already passing, and
    // the block is a fixed size, so it takes panel space the plot needs.
    expect(screen.getByText(/raise these text elements/i)).toBeInTheDocument();
    // base_size is still offered, one level down.
    expect(screen.getByText(/or change one number: base_size = \d+/i)).toBeInTheDocument();
    expect(apiSpies.postJson).not.toHaveBeenCalled();
  });

  it('passes the same figure at the quarter-poster preset', () => {
    renderPage();
    pasteCode(R_CODE);
    clickCheck();
    expect(screen.queryByText(/all elements pass/i)).toBeNull();

    const preset = screen.getByRole('button', { name: /quarter of a 48 × 36 poster/i });
    fireEvent.click(preset);
    expect(preset).toHaveAttribute('aria-pressed', 'true');
    expect((screen.getByLabelText('Width') as HTMLInputElement).value).toBe('24');
    expect((screen.getByLabelText('Height') as HTMLInputElement).value).toBe('18');

    clickCheck();
    expect(screen.getByText(/all elements pass/i)).toBeInTheDocument();
    expect(apiSpies.postJson).not.toHaveBeenCalled();
  });

  it('clamps a typed width to the 96-inch ceiling on blur', () => {
    renderPage();
    const width = screen.getByLabelText('Width') as HTMLInputElement;
    fireEvent.focus(width);
    fireEvent.change(width, { target: { value: '500' } });
    fireEvent.blur(width);
    expect(width.value).toBe('96');
  });

  it('reverts a draft on Escape and ignores garbage on blur', () => {
    renderPage();
    const height = screen.getByLabelText('Height') as HTMLInputElement;
    fireEvent.focus(height);
    fireEvent.change(height, { target: { value: '12' } });
    fireEvent.keyDown(height, { key: 'Escape' });
    expect(height.value).toBe('7');

    fireEvent.focus(height);
    fireEvent.change(height, { target: { value: '' } });
    fireEvent.blur(height);
    expect(height.value).toBe('7');
  });

  it('commits a decimal on Enter, rounded to a tenth', () => {
    renderPage();
    const height = screen.getByLabelText('Height') as HTMLInputElement;
    fireEvent.focus(height);
    fireEvent.change(height, { target: { value: '7.46' } });
    fireEvent.keyDown(height, { key: 'Enter' });
    expect(height.value).toBe('7.5');
  });

  it('accepts a comma decimal through the DOM, so "7,5" is 7.5 in, not 75', () => {
    // A type="number" input drops the "," keystroke in Chromium, so the
    // field is a text input with a decimal keypad — the comma must
    // actually reach parseInches.
    renderPage();
    const height = screen.getByLabelText('Height') as HTMLInputElement;
    expect(height.type).toBe('text');
    expect(height.inputMode).toBe('decimal');
    fireEvent.focus(height);
    fireEvent.change(height, { target: { value: '7,5' } });
    fireEvent.keyDown(height, { key: 'Enter' });
    expect(height.value).toBe('7.5');
  });

  it('drops a stale results table when the print size changes', () => {
    // The pill under the intro tracks the live size; a table computed
    // at the old size must not sit next to it asserting a verdict.
    renderPage();
    pasteCode(R_CODE);
    clickCheck();
    expect(screen.getByText(/scale factor/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /quarter of a 48 × 36 poster/i }));
    expect(screen.queryByText(/scale factor/i)).toBeNull();
    expect(screen.queryByText('Tick labels')).toBeNull();

    clickCheck();
    expect(screen.getByText(/scale factor/i)).toBeInTheDocument();
  });

  it('writes the typed print size into the full-fix save call', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /quarter of a 48 × 36 poster/i }));
    pasteCode('library(ggplot2)\nggplot(mtcars, aes(mpg, wt)) + geom_point()');
    clickCheck();
    fireEvent.click(screen.getByRole('button', { name: /open full edited code/i }));

    const dialog = screen.getByRole('dialog', { name: /full edited code/i });
    expect(dialog).toHaveTextContent('width = 24, height = 18');
    expect(dialog).not.toHaveTextContent('width = 10, height = 7');
  });

  it('names the code editor for assistive tech and keeps its focus ring', () => {
    renderPage();
    const editor = screen.getByLabelText(/plotting code/i);
    expect(editor).toBe(codeEditor());
    expect(editor.style.outline).not.toBe('none');
    expect(editor.className).toContain('postr-code-editor');
  });

  it('links the editor upsell to the guest editor entry, inside main', () => {
    const { container } = renderPage();
    const main = container.querySelector('main') as HTMLElement;
    const cta = within(main).getByRole('link', { name: 'Open the editor' });
    expect(cta).toHaveAttribute('href', '/p/new');
    expect(
      within(main).getByRole('heading', { level: 2, name: /need this check while you build/i }),
    ).toBeInTheDocument();
  });

  it('does not cross-link the hidden plot picker', () => {
    const { container } = renderPage();
    const hrefs = Array.from(container.querySelectorAll('a[href]')).map(
      (a) => a.getAttribute('href'),
    );
    expect(hrefs).not.toContain('/chart-chooser');
    expect(hrefs).not.toContain('/plot-picker');
  });

  it('never mentions AI', () => {
    const { container } = renderPage();
    expect(container.querySelector('main')?.textContent ?? '').not.toMatch(/\bAI\b/);
  });

  describe('phone ergonomics', () => {
    it('gives the Check button and language toggles a 44px target', () => {
      renderPage();
      for (const name of [/check$/i, /^auto$/i, /^r$/i, /^python$/i]) {
        const button = screen.getByRole('button', { name });
        expect(parseFloat(getComputedStyle(button).minHeight)).toBeGreaterThanOrEqual(
          TARGET_FLOOR,
        );
      }
    });

    it('sizes the code editor at 16px so iOS Safari does not zoom on focus', () => {
      renderPage();
      expect(getComputedStyle(codeEditor()).fontSize).toBe('16px');
    });

    it('sizes the width and height inputs at 16px and 44px', () => {
      renderPage();
      for (const label of ['Width', 'Height']) {
        const input = screen.getByLabelText(label);
        expect(getComputedStyle(input).fontSize).toBe('16px');
        expect(input.className).toContain('min-h-11');
      }
    });

    it('scales the fix box, snippet and preset chips to page size, not sidebar 13px', () => {
      renderPage();
      pasteCode(R_CODE);
      clickCheck();
      const copySnippet = screen.getByRole('button', { name: /copy snippet/i });
      expect(getComputedStyle(copySnippet).fontSize).toBe('15px');
      expect(getComputedStyle(copySnippet).whiteSpace).toBe('nowrap');
      const openFull = screen.getByRole('button', { name: /open full edited code/i });
      expect(getComputedStyle(openFull).fontSize).toBe('15px');
      const snippetPre = document.querySelector('pre') as HTMLElement;
      expect(getComputedStyle(snippetPre).fontSize).toBe('16px');
      const chip = screen.getByRole('button', { name: /small figure/i });
      expect(chip.className).toContain('text-[15px]');
    });

    it('does not pad the page to a desktop gutter on a phone', () => {
      const { container } = renderPage();
      const section = container.querySelector('section');
      expect(section?.className).toContain('px-5');
      expect(section?.className).toContain('sm:px-8');
    });
  });
});
