/**
 * Fix 26 — the plot checker on its French page speaks French: the page's
 * own copy, the size fields and presets, and the checker panel's strings
 * (its sizing note, Check and its answers, the table, the engine's
 * warnings and element names, the legend, the fix box, the copy buttons
 * and the full-code dialog). The editor's panel stays English.
 *
 * Entered where a visitor enters: the router at /tools/figure-readability/fr
 * (and its English twin), code typed into the editor, a click on Check, a
 * click on "Open full edited code".
 *
 * Re-run: npx vitest run src/pages/__tests__/FigureReadability.french.test.tsx
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authSpies = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: authSpies } }));

import { AppRoutes } from '../../routes';
import { ReadabilityPanel } from '../../poster/ReadabilityPanel';
import routesJson from '../../seo/routes.json';

/** R with no ggsave() and a small base_size: warnings, failing rows, a fix. */
const R_SCRIPT = [
  'library(ggplot2)',
  'p <- ggplot(df, aes(x = dose, y = response, colour = group)) +',
  '  geom_point() +',
  '  labs(caption = "n = 12") +',
  '  facet_wrap(~ site) +',
  '  theme_minimal(base_size = 6)',
].join('\n');

/** Python with no figsize and no font.size: the other engine warnings. */
const PY_SCRIPT = [
  'import matplotlib.pyplot as plt',
  'fig, ax = plt.subplots()',
  'ax.plot([1, 2, 3], [4, 5, 6], label="a")',
  'ax.set_xlabel("Dose")',
  'ax.legend()',
  "fig.savefig('figure.png')",
].join('\n');

/** Code, numbers and names: the same in both languages. */
const SAME_IN_BOTH = new Set([
  'Postr',
  'PowerPoint',
  'Python',
  'ggplot2',
  'matplotlib',
  'Menu',
  'Auto',
  'R',
  // The same word in French: the size the check read from the code.
  'Source',
  'base_size',
  'font.size',
  'Resila Technologies Inc.',
]);

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

function shownStrings(root: HTMLElement): Set<string> {
  const out = new Set<string>();
  const add = (raw: string | null) => {
    const text = (raw ?? '').replace(/\s+/g, ' ').trim();
    if (/[A-Za-zÀ-ÿ]{2,}/.test(text)) out.add(text);
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    // The user's own code and the edited copy of it are not copy.
    if (node.parentElement?.closest('pre, textarea')) continue;
    add(node.nodeValue);
  }
  for (const el of root.querySelectorAll('[aria-label],[placeholder],[title],[alt]')) {
    for (const attr of ['aria-label', 'placeholder', 'title', 'alt']) add(el.getAttribute(attr));
  }
  return out;
}

async function checkScript(script: string, checkLabel: RegExp, openLabel?: RegExp) {
  await screen.findAllByRole('heading', { level: 1 });
  const editor = screen.getByRole('textbox', { name: /R|Python/ });
  fireEvent.change(editor, { target: { value: script } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: checkLabel }));
  });
  if (!openLabel) return;
  fireEvent.click(screen.getByRole('button', { name: openLabel }));
}

beforeEach(() => {
  sessionStorage.clear();
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
});
afterEach(() => cleanup());

describe('the checker on /tools/figure-readability/fr', () => {
  it('shows the crawler copy routes.json promises for it, word for word', async () => {
    const record = (routesJson.static as Record<string, { h1: string; copy: string[] }>)['/tools/figure-readability/fr'];
    expect(record).toBeDefined();
    renderAt('/tools/figure-readability/fr');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(record!.h1);
    const paragraphs = [...document.querySelectorAll('p')].map((p) => p.textContent);
    for (const copy of record!.copy) expect(paragraphs).toContain(copy);
  });

  it.each([
    ['R', R_SCRIPT],
    ['Python', PY_SCRIPT],
  ])('a %s check shows no English string the English page shows', async (_lang, script) => {
    const english = renderAt('/tools/figure-readability');
    await checkScript(script, /Check/, /Open full edited code/);
    const enStrings = shownStrings(english.container);
    expect(screen.getByRole('table')).toBeInTheDocument();
    cleanup();
    sessionStorage.clear();

    const french = renderAt('/tools/figure-readability/fr');
    await checkScript(script, /Vérifier/, /Ouvrir le code modifié complet/);
    const frStrings = shownStrings(french.container);
    expect(screen.getByRole('table')).toBeInTheDocument();

    const shared = [...frStrings].filter((s) => enStrings.has(s) && !SAME_IN_BOTH.has(s));
    expect(shared).toEqual([]);
  });

  it('names the columns, the rows and the warnings in French', async () => {
    renderAt('/tools/figure-readability/fr');
    await checkScript(R_SCRIPT, /Vérifier/);
    const table = screen.getByRole('table');
    const headers = within(table).getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers.slice(0, 4)).toEqual(['Élément', 'Source', 'Impression', 'Min.']);
    const rows = within(table).getAllByRole('row').slice(1).map((tr) => tr.querySelector('td')?.textContent);
    expect(rows).toContain('Titres des axes');
    expect(rows).toContain('Étiquettes des graduations');
    // Engine warnings, translated: the canvas the check used, in French
    // number style.
    expect(screen.getByText(/Aucun ggsave\(\) trouvé — la taille d’impression que vous avez saisie, 10,0\spo × 7,0\spo, sert de canevas source\./)).toBeInTheDocument();
    // Point sizes in French style: "4,8 pt", not "4.8pt".
    expect(within(table).getAllByText(/^\d+(,\d)?\spt$/).length).toBeGreaterThan(0);
  });

  it('answers code it cannot place in French', async () => {
    renderAt('/tools/figure-readability/fr');
    await screen.findAllByRole('heading', { level: 1 });
    fireEvent.change(screen.getByRole('textbox', { name: /R|Python/ }), { target: { value: 'x = 1' } });
    fireEvent.click(screen.getByRole('button', { name: /Vérifier/ }));
    expect(await screen.findByText(/Impossible de distinguer R de Python/)).toBeInTheDocument();
  });
});

describe('the editor’s panel', () => {
  it('stays English (no lang prop: the editor is English for now)', async () => {
    render(<ReadabilityPanel selectedBlock={null} />);
    fireEvent.change(screen.getByRole('textbox', { name: /R or Python/ }), { target: { value: R_SCRIPT } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Check/ }));
    });
    const headers = within(screen.getByRole('table')).getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers.slice(0, 4)).toEqual(['Element', 'Source', 'Print', 'Min']);
    expect(screen.getByText(/Code Readability Check/)).toBeInTheDocument();
  });
});
