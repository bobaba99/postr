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
    expect(screen.queryByText(/every element in the table meets its minimum/i)).toBeNull();

    const preset = screen.getByRole('button', { name: /quarter of a 48 × 36 poster/i });
    fireEvent.click(preset);
    expect(preset).toHaveAttribute('aria-pressed', 'true');
    expect((screen.getByLabelText('Width') as HTMLInputElement).value).toBe('24');
    expect((screen.getByLabelText('Height') as HTMLInputElement).value).toBe('18');

    clickCheck();
    expect(screen.getByText(/every element in the table meets its minimum/i)).toBeInTheDocument();
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

    it('keeps ▶ Check on one line beside a long answer', () => {
      // Fix 15's answers run to three lines at 375 px; the button was
      // squeezed onto two (seen in a screenshot of the fix's first version).
      renderPage();
      pasteCode('plot(dose, response, main = "Dose response")');
      clickCheck();
      expect(getComputedStyle(screen.getByRole('button', { name: /check$/i })).whiteSpace).toBe('nowrap');
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

// ──────────────────────────────────────────────────────────────────────
// Fix 15: code the check cannot place, and code it cannot read.
// ──────────────────────────────────────────────────────────────────────
//
// Each test enters where the user does: paste into the code box, press a
// language button, press ▶ Check, and read what the page shows (the line
// beside Check, the panel's live region, the results table). The owner's
// answers of 2026-10-06 are the spec: Check stays enabled and answers in
// the line beside it; an unsupported plotting system is named, with no
// table and no edited code, even after a hand pick; a result on screen
// stays, marked out of date; every outcome reaches a screen reader.

/** pandas' own plot method with no import: parses as R and as Python. */
const PANDAS_BARE = 'df.plot(kind="bar", title="Counts by group", rot=0)';
const BASE_R_PLOT = 'plot(dose, response, main = "Dose response", xlab = "Dose (mg)", ylab = "Response")';
const PLOTNINE = [
  'from plotnine import ggplot, aes, geom_point, theme_bw, theme, element_text',
  'p = (',
  '    ggplot(df, aes("dose", "response"))',
  '    + geom_point()',
  '    + theme_bw(base_size=11)',
  '    + theme(axis_text_x=element_text(size=8))',
  ')',
  'p.save("fig.png", width=6, height=4, dpi=300)',
].join('\n');
const CANNOT_TELL = 'Couldn’t tell R from Python — pick R (ggplot2) or Python (matplotlib).';

/** The line beside ▶ Check as a sighted user reads it (screen-reader-only text left out). */
function checkLabel(): string {
  const slot = screen.getByRole('button', { name: /check$/i }).previousElementSibling as HTMLElement;
  const copy = slot.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.sr-only').forEach((e) => e.remove());
  return copy.textContent?.trim() ?? '';
}

/** Everything the panel's live regions hold: what a screen reader is told. */
function announced(): string {
  return screen.queryAllByRole('status').map((e) => e.textContent?.trim() ?? '').join(' | ');
}

function pressLanguage(name: 'Auto' | 'R' | 'Python') {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}$`, 'i') }));
}

describe('FigureReadabilityPage: code the check cannot place (fix 15)', () => {
  it('answers beside Check that it could not tell R from Python, and offers both', () => {
    renderPage();
    pasteCode(PANDAS_BARE);
    clickCheck();
    expect(checkLabel()).toBe(CANNOT_TELL);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('tells a screen reader the same thing', () => {
    renderPage();
    pasteCode(PANDAS_BARE);
    clickCheck();
    expect(announced()).toContain(CANNOT_TELL);
  });

  it('announces again when Check is pressed again on code it still cannot place', () => {
    // A second press with the same words must still reach a screen reader
    // and change the screen: the announcement is put back, not left alone.
    renderPage();
    pasteCode(PANDAS_BARE);
    clickCheck();
    const first = screen.getByText(CANNOT_TELL);
    clickCheck();
    const second = screen.getByText(CANNOT_TELL);
    expect(second).not.toBe(first);
    expect(second.closest('[role="status"]')).not.toBeNull();
  });

  it('never says it is waiting for code while the box holds code', () => {
    renderPage();
    pasteCode(PANDAS_BARE);
    expect(checkLabel()).not.toMatch(/waiting for code/i);
    clickCheck();
    expect(checkLabel()).not.toMatch(/waiting for code/i);
  });

  it('keeps Check enabled on code it cannot place', () => {
    renderPage();
    pasteCode(PANDAS_BARE);
    expect(screen.getByRole('button', { name: /check$/i })).toBeEnabled();
  });

  it('checks the code once the language is picked by hand', () => {
    renderPage();
    pasteCode(PANDAS_BARE);
    clickCheck();
    pressLanguage('Python');
    clickCheck();
    expect(screen.getByText('Tick labels')).toBeInTheDocument();
    expect(checkLabel()).toBe('Detected: Python / matplotlib');
  });

  it('goes back to what it detects once the code is edited after an answer', () => {
    renderPage();
    pasteCode(PANDAS_BARE);
    clickCheck();
    expect(checkLabel()).toBe(CANNOT_TELL);
    pasteCode(R_CODE);
    expect(checkLabel()).toBe('Detected: R / ggplot2');
    expect(announced()).not.toContain(CANNOT_TELL);
  });

  it('keeps a result on screen, marked out of date, when the new code cannot be checked', () => {
    renderPage();
    pasteCode(R_CODE);
    clickCheck();
    expect(screen.getByText('Tick labels')).toBeInTheDocument();
    expect(screen.queryByText(/^Out of date: /)).toBeNull();

    pasteCode(PANDAS_BARE);
    clickCheck();
    expect(screen.getByText('Tick labels')).toBeInTheDocument();
    expect(screen.getByText(/^Out of date: /)).toBeInTheDocument();
    expect(checkLabel()).toBe(CANNOT_TELL);
  });

  it('marks a result out of date when the language is picked again after it', () => {
    renderPage();
    pasteCode(R_CODE);
    clickCheck();
    pressLanguage('Python');
    expect(screen.getByText(/^Out of date: /)).toBeInTheDocument();
    pressLanguage('Auto');
    expect(screen.queryByText(/^Out of date: /)).toBeNull();
  });

  it('clears the out-of-date mark when the new code is checked', () => {
    renderPage();
    pasteCode(R_CODE);
    clickCheck();
    pasteCode(PANDAS_BARE);
    clickCheck();
    pressLanguage('Python');
    clickCheck();
    expect(screen.queryByText(/^Out of date: /)).toBeNull();
    expect(checkLabel()).toBe('Detected: Python / matplotlib');
  });

  it('announces a successful check to screen readers too', () => {
    renderPage();
    pasteCode(R_CODE);
    clickCheck();
    // R_CODE's tick labels print below the minimum at the page's 10 × 7 in.
    expect(announced()).toMatch(/Checked as R \/ ggplot2: \d+ of 7 text elements are below the minimum\./);
    // The sighted line beside Check is unchanged by the announcement.
    expect(checkLabel()).toBe('Detected: R / ggplot2');
  });

  it('drops the announcement with the table when the print size changes', () => {
    // The page hides a table computed at another size; its announcement,
    // still in the live region, would describe a result no longer shown.
    renderPage();
    pasteCode(R_CODE);
    clickCheck();
    expect(announced()).toMatch(/Checked as R \/ ggplot2/);
    fireEvent.click(screen.getByRole('button', { name: /quarter of a 48 × 36 poster/i }));
    expect(screen.queryByText('Tick labels')).toBeNull();
    expect(announced()).not.toMatch(/Checked as/);
  });

  it('announces a check where every element passes', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /quarter of a 48 × 36 poster/i }));
    pasteCode(R_CODE);
    clickCheck();
    expect(announced()).toContain('Checked as R / ggplot2: every text element meets its minimum.');
  });
});

describe('FigureReadabilityPage: plotting systems the check does not read (fix 15)', () => {
  it('names base R graphics as not supported, with no table and no edited code', () => {
    renderPage();
    pasteCode(BASE_R_PLOT);
    expect(checkLabel()).toBe('Detected: R / base graphics');
    clickCheck();
    expect(checkLabel()).toBe('Not supported yet: base R graphics. The check reads R (ggplot2) and Python (matplotlib).');
    expect(announced()).toContain('Not supported yet: base R graphics.');
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: /copy edited code/i })).toBeNull();
  });

  it('still names base R graphics after R is picked by hand', () => {
    renderPage();
    pasteCode(BASE_R_PLOT);
    clickCheck();
    pressLanguage('R');
    clickCheck();
    expect(checkLabel()).toMatch(/^Not supported yet: base R graphics\./);
    expect(screen.queryByRole('table')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\+\s*theme\(/);
  });

  it('a bare plot(x, y) cannot be placed, and picking R names base graphics', () => {
    renderPage();
    pasteCode('plot(x, y)');
    clickCheck();
    expect(checkLabel()).toBe(CANNOT_TELL);
    pressLanguage('R');
    clickCheck();
    expect(checkLabel()).toMatch(/^Not supported yet: base R graphics\./);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('does not score plotnine as R, and names it as not supported', () => {
    renderPage();
    pasteCode(PLOTNINE);
    expect(checkLabel()).toBe('Detected: Python / plotnine');
    clickCheck();
    expect(checkLabel()).toBe('Not supported yet: plotnine. The check reads R (ggplot2) and Python (matplotlib).');
    expect(screen.queryByRole('table')).toBeNull();
    expect(document.body.textContent).not.toMatch(/plot\.title\s*=|axis\.text\s*=/);
  });

  it('keeps plotnine unsupported when R is picked by hand', () => {
    renderPage();
    pasteCode(PLOTNINE);
    pressLanguage('R');
    clickCheck();
    expect(checkLabel()).toMatch(/^Not supported yet: plotnine\./);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it.each([
    ['lattice', 'xyplot(response ~ dose | group, data = df, type = "b")', 'Detected: R / lattice', 'lattice'],
    ['plotly in R', 'plot_ly(df, x = ~dose, y = ~response, type = "scatter")', 'Detected: R / plotly', 'plotly'],
    ['plotly in Python', 'import plotly.express as px\nfig = px.scatter(df, x="dose", y="response")\nfig.write_image("f.png")', 'Detected: Python / plotly', 'plotly'],
    ['Altair', 'import altair as alt\nalt.Chart(df).mark_point().encode(x="dose", y="response")', 'Detected: Python / Altair', 'Altair'],
  ])('names %s as not supported', (_name, code, label, system) => {
    renderPage();
    pasteCode(code);
    expect(checkLabel()).toBe(label);
    clickCheck();
    expect(checkLabel()).toBe(`Not supported yet: ${system}. The check reads R (ggplot2) and Python (matplotlib).`);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('keeps a result on screen, marked out of date, when the new code is unsupported', () => {
    renderPage();
    pasteCode(R_CODE);
    clickCheck();
    pasteCode(BASE_R_PLOT);
    clickCheck();
    expect(screen.getByText('Tick labels')).toBeInTheDocument();
    expect(screen.getByText(/^Out of date: /)).toBeInTheDocument();
  });
});

describe('FigureReadabilityPage: what the line beside Check detects (fix 15)', () => {
  // The label is read before Check: it is the language and system the
  // check would score the code as. Each row turns on one part of the
  // detection; the comment says which.
  it.each([
    // Comments are not code: an R script carrying a commented-out
    // matplotlib draft (D9 in AUDIT.md; the held-back 9ea9f38).
    ['an R script with a commented-out matplotlib draft', [
      'library(ggplot2)',
      '# python draft I abandoned:',
      '# import matplotlib.pyplot as plt',
      '# fig, ax = plt.subplots(1, 2, figsize=(12, 8))',
      '# ax.set_xlabel("x"); plt.savefig("f.png")',
      'p <- ggplot(mtcars, aes(wt, mpg)) + geom_point() + theme_minimal(base_size = 11)',
      'ggsave("fig.png", p, width = 7, height = 5)',
    ].join('\n'), 'Detected: R / ggplot2'],
    // Strings are not code: a docstring quoting the R version.
    ['a Python function whose docstring quotes the R version', [
      'def make_figure(df):',
      '    """Port of the R figure:',
      '    p <- ggplot(df, aes(dose, response)) + geom_point() + theme_bw()',
      '    ggsave("fig.png", p, width = 6, height = 4)',
      '    """',
      '    fig, ax = plt.subplots(figsize=(6, 4))',
      '    return fig',
    ].join('\n'), 'Detected: Python / matplotlib'],
    // A name inside a longer name does not count: ax. in max.temp.
    ['a dotted column name holding "ax."', 'plot(weather$month, weather$max.temp, type = "l")', 'Detected: R / base graphics'],
    // scale_ in scale_factor is not a ggplot scale.
    ['a variable called scale_factor', 'scale_factor = 1.5\nline.set_ydata(y * scale_factor)', 'Can’t tell R from Python. Pick one above.'],
    // <- counts only as an assignment at the start of a statement.
    ['the comparison y<-0.5', 'low = y<-0.5\nax.scatter(x[low], y[low], s=8)', 'Detected: Python / matplotlib'],
    ['an R assignment', 'x <- seq(0, 10)\nplot(x, sin(x))', 'Detected: R / base graphics'],
    // Words in a title are not statements.
    ['"import" in a title', 'plot(dose, response, main = "Effect of import duties")', 'Detected: R / base graphics'],
    ['"class" in a title', 'hist(scores, main = "Scores by class label")', 'Detected: R / base graphics'],
    // Signals R has and Python does not.
    ['a function()', 'draw = function(d) {\n  plot(d)\n}', 'Detected: R / base graphics'],
    ['TRUE or FALSE', 'plot(time, score, axes = FALSE)', 'Detected: R / base graphics'],
    ['a dotted argument name', 'plot(time, score, cex.lab = 1.4)', 'Detected: R / base graphics'],
    ['a formula', 'boxplot(value ~ group, data = df)', 'Detected: R / base graphics'],
    ['a base graphics function', 'abline(h = 0, lty = 2)', 'Detected: R / base graphics'],
    // seaborn has a barplot() too (round 1): the name alone places nothing,
    // R's own arguments do.
    ['barplot(), a name seaborn shares', 'barplot(counts)', 'Can’t tell R from Python. Pick one above.'],
    ['barplot() with an argument only R has', 'barplot(counts, names.arg = groups)', 'Detected: R / base graphics'],
    ['lattice\'s stripplot(), a name seaborn shares, in R', 'stripplot(yield ~ site, data = barley, jitter.data = TRUE)', 'Detected: R / lattice'],
    ['a graphics device', 'png("fig.png")\nplot(time, score)', 'Detected: R / base graphics'],
    ['library(lattice)', 'library(lattice)', 'Detected: R / lattice'],
    ['a lattice function', 'densityplot(scores)', 'Detected: R / lattice'],
    ['plotly for R', 'plot_ly(df, x = ~dose, y = ~response)', 'Detected: R / plotly'],
    ['library()', 'library(scales)\nplot(time, score)', 'Detected: R / base graphics'],
    ['a pipe', 'df %>% summary()', 'Detected: R (checked as ggplot2)'],
    // Signals Python has and R does not.
    ['True, False or None', 'df["score"].hist(bins=20, grid=False)', 'Detected: Python / matplotlib'],
    ['a notebook magic', '%pylab inline\nplot(t, v)', 'Detected: Python / matplotlib'],
    ['an axes. method', 'axes.autoscale_view()', 'Detected: Python / matplotlib'],
    ['a block opened with a colon', 'for name in groups:\n    plot(t[name], v[name])', 'Detected: Python / matplotlib'],
    // pandas' plot method draws with matplotlib, but plotly has a scatter()
    // too: plotly's markers are read first.
    ['plotly\'s px.scatter()', 'import plotly.express as px\nfig = px.scatter(df, x="a", y="b")', 'Detected: Python / plotly'],
    ['an import', 'import numpy as np\nx = np.linspace(0, 1, 50)', 'Detected: Python (checked as matplotlib)'],
    ['a def', 'def scores(df):\n    return df.score', 'Detected: Python (checked as matplotlib)'],
    ['fig.savefig()', 'fig.savefig("out.png", dpi=300)', 'Detected: Python / matplotlib'],
    ['an import of everything', 'from pylab import *\nplot(t, v)', 'Detected: Python / matplotlib'],
    ['plotly in Python with no import', 'fig = px.line(df, x="t", y="v")', 'Detected: Python / plotly'],
    ['Altair with no import', 'alt.Chart(df).mark_point()', 'Detected: Python / Altair'],
    // ggplot2 named by its own words.
    ['qplot()', 'qplot(dose, response, data = df)', 'Detected: R / ggplot2'],
    // A package name alone is R, but names no plotting system (round 1:
    // library(tidyverse) then base hist() was scored as ggplot2).
    ['library(tidyverse)', 'library(tidyverse)', 'Detected: R (checked as ggplot2)'],
    ['a ggplot2 package loaded with require()', 'require(ggplot2)', 'Detected: R (checked as ggplot2)'],
    // plotnine is ggplot's grammar in Python. Imported, it is named.
    ['plotnine imported', 'from plotnine import *\np = ggplot(df, aes(x=time, y=score)) + geom_line()', 'Detected: Python / plotnine'],
    // Its other markers R can write too: with nothing only one language
    // has, the code cannot be placed (round 2; before it, these were named
    // plotnine, and so was R's ggplot2 inside print()).
    ['aes() given strings', '(ggplot(df, aes("group", "value")) + geom_boxplot())', 'Can’t tell R from Python. Pick one above.'],
    ['theme() with underscore names', 'p = ggplot(df, aes(condition, accuracy)) + geom_col()\np = p + theme(axis_title=element_text(size=9))', 'Can’t tell R from Python. Pick one above.'],
    ['a ggplot saved with .save()', 'p = ggplot(df, aes(dose, response)) + geom_point()\np.save("fig.png", width=6, height=4)', 'Can’t tell R from Python. Pick one above.'],
    // Inside plotnine's parentheses a line may end in +: only a + outside
    // every bracket is R's alone, and makes the code R.
    ['plotnine with a + ending a line inside its parentheses', 'p = (ggplot(df, aes("dose", "response")) +\n     geom_point())', 'Can’t tell R from Python. Pick one above.'],
    ['plotnine through its module name', 'import plotnine as p9\n(p9.ggplot(df, p9.aes("x", "y")) + p9.geom_point())', 'Detected: Python / plotnine'],
    // Not plotnine without a ggplot() call: geopandas' geom_type and PIL's
    // save() are not the grammar.
    ['matplotlib with geom_type and a .save()', 'fig, ax = plt.subplots()\nax.set_title(gdf.geom_type[0])\nimg.save("f.png")', 'Detected: Python / matplotlib'],
    // A name inside a longer name or an attribute is not the grammar's
    // (round 1: the anchors the first version left out, each with the
    // collision that flipped it).
    ['geopandas filtered on geom_type', 'import geopandas as gpd\nworld = gpd.read_file(path)\nworld[world.geom_type == "Polygon"].plot(column="pop_est", legend=True)', 'Detected: Python / matplotlib'],
    ['geopandas\' geom_equals() method', 'import geopandas as gpd\nsame = gdf.geometry.geom_equals(ref)\ngdf[same].plot(color="red")', 'Detected: Python / matplotlib'],
    ['a loop variable called geom_type', 'for geom_type in ["Point", "Polygon"]:\n    gdf[gdf.geom_type == geom_type].plot(legend=True)', 'Detected: Python / matplotlib'],
    // A grammar word with no ggplot() call does not make Python plotnine.
    ['a seaborn FacetGrid called facet_grid', 'facet_grid = sns.FacetGrid(tips, col="time")\nfacet_grid.map(plt.hist, "tip")\nfacet_grid.savefig("f.png")', 'Detected: Python / matplotlib'],
    ['a function whose name ends in ggplot', 'import mylib\nimg = mylib.render(myggplot(df))\nimg.save("f.png")', 'Detected: Python (checked as matplotlib)'],
    ['a variable whose name starts with theme_', 'df.plot(kind="bar", color=theme_colors, legend=False)', 'Detected: Python / matplotlib'],
    // A comparison is not an argument: Python's == after a dotted name or
    // after main.
    ['pandas filtered on a dotted name with ==', 'df[(df.year == 2020)].plot(x="month", y="sales", legend=True)', 'Detected: Python / matplotlib'],
    ['a variable called main compared with ==', 'data[(main == 1)].plot(kind="bar", legend=True)', 'Detected: Python / matplotlib'],
    // A hex colour's # is not a comment: the code after it still counts.
    ['a hex colour before main=', 'plot(dose, response, col = "#1b9e77", main = "Dose response")', 'Detected: R / base graphics'],
    // Neither R nor Python.
    ['Julia, whose savefig() is not a method', 'using Plots\nplot(t, v)\nsavefig("f.png")', 'Can’t tell R from Python. Pick one above.'],
    ['a bare plot(x, y)', 'plot(x, y)', 'Can’t tell R from Python. Pick one above.'],
    ['pandas with no import', PANDAS_BARE, 'Can’t tell R from Python. Pick one above.'],
    // Unchanged: the scripts the check was built for.
    ['ggplot2', R_CODE, 'Detected: R / ggplot2'],
    ['matplotlib', 'import matplotlib.pyplot as plt\nfig, ax = plt.subplots(figsize=(6, 4))\nax.plot(x, y)', 'Detected: Python / matplotlib'],
  ])('%s', (_name, code, label) => {
    renderPage();
    pasteCode(code);
    expect(checkLabel()).toBe(label);
  });

  it('reads ggplot code as plotnine when Python is picked by hand', () => {
    renderPage();
    pasteCode(R_CODE);
    pressLanguage('Python');
    expect(checkLabel()).toBe('Detected: Python / plotnine');
  });

  it('labels a hand pick on code with no plotting call as the system it is checked as', () => {
    renderPage();
    pressLanguage('R');
    pasteCode('x <- 1');
    expect(checkLabel()).toBe('Detected: R (checked as ggplot2)');
  });
});

// ──────────────────────────────────────────────────────────────────────
// Fix 15, round 1 of its review: one token does not decide the system.
// ──────────────────────────────────────────────────────────────────────
//
// The first version let a single token that another system shares name
// the system, ahead of the scores and of the user's hand pick: a string in
// R's aes() made ggplot2 plotnine, seaborn's stripplot() and heatmap() made
// Python lattice and base graphics, a package name made base R ggplot2,
// and subplots( inside plotly's make_subplots( made it matplotlib. Each
// script below is the round 1 reviewer's, or one written beside it.

const UNSUPPORTED_TAIL = 'The check reads R (ggplot2) and Python (matplotlib).';

describe('FigureReadabilityPage: R\'s aes() takes strings too (fix 15, round 1)', () => {
  it.each([
    ['a pie chart, aes(x = "")', [
      'library(ggplot2)',
      'df <- data.frame(group = c("A", "B", "C"), value = c(25, 25, 50))',
      'ggplot(df, aes(x = "", y = value, fill = group)) +',
      '  geom_bar(stat = "identity", width = 1) +',
      '  coord_polar("y", start = 0) +',
      '  theme_void(base_size = 11)',
      'ggsave("pie.png", width = 5, height = 5)',
    ]],
    // On one line: no line ends in +, but library() is R's alone.
    ['a pie chart on one line', [
      'library(ggplot2)',
      'ggplot(df, aes(x = "", y = value, fill = group)) + geom_col(width = 1) + coord_polar("y")',
    ]],
    ['one boxplot, aes(x = "", y = score)', [
      'library(ggplot2)',
      'ggplot(scores, aes(x = "", y = score)) +',
      '  geom_boxplot() +',
      '  labs(x = NULL, y = "Score") +',
      '  theme_classic(base_size = 12)',
      'ggsave("box.png", width = 3, height = 5)',
    ]],
    ['one stacked bar, with no library()', [
      'p <- ggplot(counts, aes(x = "All samples", y = n, fill = type)) +',
      '  geom_col() +',
      '  theme_minimal(base_size = 11)',
      'ggsave("bar.png", p, width = 4, height = 5)',
    ]],
    ['legend labels, aes(colour = "Observed", y = obs)', [
      'library(ggplot2)',
      'ggplot(df, aes(x = t)) +',
      '  geom_line(aes(colour = "Observed", y = obs)) +',
      '  geom_line(aes(colour = "Fitted", y = fit)) +',
      '  theme_bw(base_size = 11)',
    ]],
    // No library(), no <-: a line ending in + is the only thing Python
    // could not write.
    ['geom_point(aes(colour = "Observed")), with nothing else only R has', [
      'ggplot(df, aes(x, y)) +',
      '  geom_point(aes(colour = "Observed")) +',
      '  geom_line(aes(y = pred, colour = "Predicted")) +',
      '  theme_bw(base_size = 11)',
    ]],
    ['geom_hline(aes(linetype = "Threshold"))', [
      'library(ggplot2)',
      'ggplot(df, aes(dose, response)) + geom_point() +',
      '  geom_hline(aes(linetype = "Threshold", yintercept = 0.5)) +',
      '  theme_classic(base_size = 12)',
    ]],
  ])('checks %s as R / ggplot2', (_name, lines) => {
    renderPage();
    pasteCode(lines.join('\n'));
    expect(checkLabel()).toBe('Detected: R / ggplot2');
    clickCheck();
    expect(screen.getByText('Tick labels')).toBeInTheDocument();
    expect(checkLabel()).toBe('Detected: R / ggplot2');
  });

  it('checks ggplot code as R once R is picked, when its only plotnine hint is a string in aes()', () => {
    // With nothing only one language has, a string in aes() cannot place
    // the code (round 2); the user's pick of R checks it as ggplot2 (only
    // an import of plotnine keeps it plotnine: 'keeps plotnine unsupported
    // when R is picked').
    renderPage();
    pasteCode('(ggplot(df, aes("group", "value")) + geom_boxplot())');
    expect(checkLabel()).toBe('Can’t tell R from Python. Pick one above.');
    pressLanguage('R');
    expect(checkLabel()).toBe('Detected: R / ggplot2');
    clickCheck();
    expect(screen.getByText('Tick labels')).toBeInTheDocument();
  });
});

describe('FigureReadabilityPage: a package name is not a plotting call (fix 15, round 1)', () => {
  it.each([
    ['library(tidyverse), then hist()', 'library(tidyverse)\nscores <- read_csv("scores.csv")\nhist(scores$value, main = "Scores", xlab = "Score", cex.lab = 1.2)', 'base graphics', 'base R graphics'],
    ['library(ggplot2), then barplot()', 'library(ggplot2)\nbarplot(table(mtcars$cyl), main = "Cylinders", ylab = "Cars")', 'base graphics', 'base R graphics'],
    ['library(tidyverse), a png() device, plot() and dev.off()', [
      'library(tidyverse)',
      'df <- read_csv("data.csv") %>% filter(!is.na(y))',
      'png("fig.png", width = 6, height = 4, units = "in", res = 300)',
      'plot(df$x, df$y, pch = 19, main = "Response", xlab = "Dose", ylab = "Response")',
      'dev.off()',
    ].join('\n'), 'base graphics', 'base R graphics'],
    ['library(tidyverse) and xyplot()', 'library(tidyverse)\nlibrary(lattice)\nxyplot(mpg ~ wt | factor(cyl), data = mtcars, main = "Fuel use")', 'lattice', 'lattice'],
    ['lattice panels arranged with gridExtra', 'library(lattice)\nlibrary(gridExtra)\np1 <- xyplot(mpg ~ wt, data = mtcars)\np2 <- bwplot(mpg ~ factor(cyl), data = mtcars)\ngrid.arrange(p1, p2, ncol = 2)', 'lattice', 'lattice'],
    ['library(tidyverse) and plot_ly()', 'library(tidyverse)\nlibrary(plotly)\nmtcars %>% plot_ly(x = ~wt, y = ~mpg, type = "scatter", mode = "markers")', 'plotly', 'plotly'],
  ])('names %s as not supported, R picked or not', (_name, code, label, system) => {
    renderPage();
    pasteCode(code);
    expect(checkLabel()).toBe(`Detected: R / ${label}`);
    clickCheck();
    expect(checkLabel()).toBe(`Not supported yet: ${system}. ${UNSUPPORTED_TAIL}`);
    expect(screen.queryByRole('table')).toBeNull();
    pressLanguage('R');
    clickCheck();
    expect(checkLabel()).toBe(`Not supported yet: ${system}. ${UNSUPPORTED_TAIL}`);
    expect(screen.queryByRole('table')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\+\s*theme\(/);
  });
});

describe('FigureReadabilityPage: plotly\'s make_subplots() is not matplotlib (fix 15, round 1)', () => {
  it.each([
    ['imported', [
      'import plotly.graph_objects as go',
      'from plotly.subplots import make_subplots',
      '',
      'fig = make_subplots(rows=1, cols=2, subplot_titles=("A", "B"))',
      'fig.add_trace(go.Scatter(x=x, y=y), row=1, col=1)',
      'fig.update_layout(font=dict(size=14))',
      'fig.write_image("fig.png")',
    ].join('\n')],
    ['with no import', 'fig = make_subplots(rows=2, cols=1)\nfig.add_trace(go.Scatter(x=t, y=v), row=1, col=1)\nfig.show()'],
  ])('names plotly %s as not supported, Python picked or not', (_name, code) => {
    renderPage();
    pasteCode(code);
    expect(checkLabel()).toBe('Detected: Python / plotly');
    clickCheck();
    expect(checkLabel()).toBe(`Not supported yet: plotly. ${UNSUPPORTED_TAIL}`);
    pressLanguage('Python');
    clickCheck();
    expect(checkLabel()).toBe(`Not supported yet: plotly. ${UNSUPPORTED_TAIL}`);
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('FigureReadabilityPage: seaborn\'s names that lattice and base R share (fix 15, round 1)', () => {
  // seaborn 0.13.2 has barplot(), heatmap() and stripplot(); base R has the
  // first two and lattice the third. In Python they are seaborn, which
  // draws with matplotlib.
  it.each([
    ['stripplot()', 'stripplot(x="day", y="total_bill", data=tips, jitter=True)', 'Detected: Python (checked as matplotlib)'],
    ['heatmap()', 'heatmap(corr, annot=True, cmap="coolwarm")', 'Detected: Python (checked as matplotlib)'],
    ['barplot()', 'barplot(x="day", y="total_bill", hue="sex", data=tips)', 'Can’t tell R from Python. Pick one above.'],
  ])('checks a bare %s as Python, detected or picked', (_name, code, auto) => {
    renderPage();
    pasteCode(code);
    expect(checkLabel()).toBe(auto);
    pressLanguage('Python');
    expect(checkLabel()).toBe('Detected: Python (checked as matplotlib)');
    clickCheck();
    expect(screen.getByText('Tick labels')).toBeInTheDocument();
  });
});

describe('FigureReadabilityPage: the answer\'s live region (fix 15, round 1)', () => {
  it('is in the line beside Check before the first press, polite and read whole', () => {
    // A region inserted together with its text is one many screen readers
    // do not speak: it has to be there, empty, before anything is said.
    renderPage();
    const slot = screen.getByRole('button', { name: /check$/i }).previousElementSibling as HTMLElement;
    const region = slot.querySelector('[role="status"]');
    expect(region).not.toBeNull();
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-atomic', 'true');
    expect(region?.textContent).toBe('');
  });

  it('drops the could-not-tell answer when only the language button changes', () => {
    renderPage();
    pasteCode(PANDAS_BARE);
    clickCheck();
    expect(checkLabel()).toBe(CANNOT_TELL);
    pressLanguage('Python');
    expect(checkLabel()).toBe('Detected: Python / matplotlib');
    expect(announced()).not.toContain(CANNOT_TELL);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Fix 15, round 2 of its review: the production build, three browsers,
// the keyboard and the accessibility tree.
// ──────────────────────────────────────────────────────────────────────

describe('FigureReadabilityPage: a plotnine hint with nothing only one language has (fix 15, round 2)', () => {
  // An R chain inside print(), ggsave() or a for loop's braces ends no line
  // in + outside every bracket, so with a string in aes() nothing in it was
  // R's alone, and the hint named plotnine (round 2: 4 of the reviewer's 6
  // wrapped scripts refused in three browsers; main read them as R). Python
  // could write the same lines, so the code cannot tell: the could-not-tell
  // answer, and a pick decides.
  it.each([
    ['print() around a pie', [
      'print(',
      '  ggplot(df, aes(x = "", y = prop, fill = group)) +',
      '    geom_col(width = 1) +',
      '    coord_polar("y")',
      ')',
    ]],
    ['a for loop printing a pie per site', [
      'for (g in groups) {',
      '  print(ggplot(subset(df, site == g), aes(x = "", y = n, fill = cat)) +',
      '    geom_col(width = 1) +',
      '    coord_polar("y") +',
      '    ggtitle(g))',
      '}',
    ]],
    ['ggsave() with the plot inline', [
      'ggsave("pie.png", ggplot(df, aes(x = "", y = n, fill = g)) +',
      '  geom_col(width = 1) +',
      '  coord_polar("y"), width = 6, height = 6)',
    ]],
    ['print() around legend labels', [
      'print(ggplot(df, aes(x = t)) +',
      '  geom_point(aes(colour = "Observed", y = obs)) +',
      '  geom_line(aes(colour = "Model", y = fit)))',
    ]],
    ['a pie chart on one line, with no library()', [
      'ggplot(votes, aes(x = "", y = share, fill = party)) + geom_col(width = 1) + coord_polar("y")',
    ]],
  ])('cannot place R ggplot2 with %s, and checks it as ggplot2 once R is picked', (_name, lines) => {
    renderPage();
    pasteCode(lines.join('\n'));
    expect(checkLabel()).toBe('Can’t tell R from Python. Pick one above.');
    clickCheck();
    expect(checkLabel()).toBe(CANNOT_TELL);
    expect(screen.queryByRole('table')).toBeNull();
    pressLanguage('R');
    expect(checkLabel()).toBe('Detected: R / ggplot2');
    clickCheck();
    expect(screen.getByText('Tick labels')).toBeInTheDocument();
  });

  it('names plotnine with no import once Python is picked', () => {
    renderPage();
    pasteCode('(ggplot(df, aes("group", "value")) + geom_boxplot())');
    clickCheck();
    expect(checkLabel()).toBe(CANNOT_TELL);
    pressLanguage('Python');
    expect(checkLabel()).toBe('Detected: Python / plotnine');
    clickCheck();
    expect(checkLabel()).toBe(`Not supported yet: plotnine. ${UNSUPPORTED_TAIL}`);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('reads plotnine with no import as Python when the code has something only Python has', () => {
    // se=False: R writes FALSE. The hint says the grammar's words are no
    // evidence for R; Python's own signal then decides.
    renderPage();
    pasteCode('p = (ggplot(df, aes("dose", "response")) + geom_smooth(method="lm", se=False))');
    expect(checkLabel()).toBe('Detected: Python / plotnine');
  });
});

describe('FigureReadabilityPage: an import of everything is Python\'s only in Python\'s form (fix 15, round 2)', () => {
  it('cannot place JavaScript\'s import * as d3', () => {
    // Round 2: `import * as d3 from "d3"` read as Python and got a
    // matplotlib table and edited code; main could not place it.
    renderPage();
    pasteCode([
      'import * as d3 from "d3";',
      'const svg = d3.select("#chart").append("svg").attr("width", 600).attr("height", 400);',
      'svg.selectAll("circle").data(data).join("circle").attr("r", 4);',
    ].join('\n'));
    expect(checkLabel()).toBe('Can’t tell R from Python. Pick one above.');
    clickCheck();
    expect(checkLabel()).toBe(CANNOT_TELL);
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('FigureReadabilityPage: an answer is said once, for the press that gave it (fix 15, round 2)', () => {
  // Round 2: an answer hidden by an edit came back, re-inserted into the
  // live region and read out again, when the edit was undone, without a
  // press of Check.
  const smallFigure = () => fireEvent.click(screen.getByRole('button', { name: /^small figure/i }));
  const quarterPoster = () => fireEvent.click(screen.getByRole('button', { name: /quarter of a 48 × 36 poster/i }));

  it('does not say an answer again when the code is edited back to what was checked', () => {
    renderPage();
    pasteCode(PANDAS_BARE);
    clickCheck();
    expect(announced()).toContain(CANNOT_TELL);
    pasteCode(`${PANDAS_BARE}x`);
    pasteCode(PANDAS_BARE);
    expect(announced()).not.toContain(CANNOT_TELL);
    expect(checkLabel()).toBe('Can’t tell R from Python. Pick one above.');
  });

  it('does not say an answer again when the language is changed and changed back', () => {
    renderPage();
    pasteCode(PANDAS_BARE);
    clickCheck();
    pressLanguage('Python');
    pressLanguage('Auto');
    expect(announced()).not.toContain(CANNOT_TELL);
    expect(checkLabel()).toBe('Can’t tell R from Python. Pick one above.');
  });

  it('keeps the answer when the language already pressed is pressed again', () => {
    renderPage();
    pasteCode(PANDAS_BARE);
    clickCheck();
    pressLanguage('Auto');
    expect(checkLabel()).toBe(CANNOT_TELL);
  });

  it('does not say a result again when the print size goes back to the one it was checked at', () => {
    renderPage();
    pasteCode(R_CODE);
    clickCheck();
    expect(announced()).toMatch(/Checked as R \/ ggplot2/);
    quarterPoster();
    smallFigure();
    // The table computed at this size is shown again; its announcement is
    // not repeated without a press.
    expect(screen.getByText('Tick labels')).toBeInTheDocument();
    expect(announced()).not.toMatch(/Checked as/);
  });
});

describe('FigureReadabilityPage: a result hidden by a new print size is not hidden in silence (fix 15, round 2)', () => {
  const RESIZED = 'The print size changed: click Check again for a result at this size.';
  const smallFigure = () => fireEvent.click(screen.getByRole('button', { name: /^small figure/i }));
  const quarterPoster = () => fireEvent.click(screen.getByRole('button', { name: /quarter of a 48 × 36 poster/i }));

  it('says so beside Check, and to a screen reader, when the table is hidden', () => {
    renderPage();
    pasteCode(R_CODE);
    clickCheck();
    quarterPoster();
    expect(screen.queryByText('Tick labels')).toBeNull();
    expect(checkLabel()).toBe(RESIZED);
    expect(announced()).toContain(RESIZED);
  });

  it('says so too when the result was already out of date', () => {
    renderPage();
    pasteCode(R_CODE);
    clickCheck();
    pasteCode(`${R_CODE}\n`);
    quarterPoster();
    expect(screen.queryByText('Tick labels')).toBeNull();
    expect(checkLabel()).toBe(RESIZED);
  });

  it('drops the sentence when the size goes back and the result is shown again', () => {
    renderPage();
    pasteCode(R_CODE);
    clickCheck();
    quarterPoster();
    smallFigure();
    expect(screen.getByText('Tick labels')).toBeInTheDocument();
    expect(announced()).not.toContain(RESIZED);
    expect(checkLabel()).toBe('Detected: R / ggplot2');
  });

  it('keeps the answer about the code when one is on screen', () => {
    renderPage();
    pasteCode(R_CODE);
    clickCheck();
    pasteCode(PANDAS_BARE);
    clickCheck();
    quarterPoster();
    expect(checkLabel()).toBe(CANNOT_TELL);
  });

  it('says nothing when there was no result to hide', () => {
    renderPage();
    pasteCode(R_CODE);
    quarterPoster();
    expect(announced()).toBe('');
    expect(checkLabel()).toBe('Detected: R / ggplot2');
  });
});
