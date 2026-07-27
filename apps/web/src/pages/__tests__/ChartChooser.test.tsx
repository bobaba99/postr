/**
 * Standalone /chart-chooser page tests.
 *
 * The page's two load-bearing properties (v2 plan §2):
 * 1. No Supabase session is created on load — not even anonymous.
 * 2. Crawler copy parity — the live h1 must match the routes.json
 *    entry the prerender script injects for non-JS crawlers.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

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

const downloadSpies = vi.hoisted(() => ({
  downloadChartSvg: vi.fn(async () => {}),
  downloadChartPng: vi.fn(async () => {}),
}));

// Partial mock — the module also exports PREVIEW_THEME_BASE, which
// ChartPreview needs to render the panels this test clicks through.
vi.mock('@/charts/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/charts/download')>()),
  ...downloadSpies,
}));

import ChartChooserPage from '../ChartChooser';
import routesJson from '../../seo/routes.json';

const TSV = 'Condition\tMean reaction time (ms)\nControl\t512\nPlacebo\t498\nHigh dose\t428';

/** ⌘V into the ladder's textarea — typing deliberately does not parse. */
function pasteTable(text: string) {
  fireEvent.paste(screen.getByLabelText('Paste your table'), {
    clipboardData: { getData: () => text },
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/chart-chooser']}>
      <ChartChooserPage />
    </MemoryRouter>,
  );
}

describe('ChartChooserPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    downloadSpies.downloadChartSvg.mockResolvedValue(undefined);
    downloadSpies.downloadChartPng.mockResolvedValue(undefined);
  });

  it('renders the h1 the prerender script injects for crawlers', () => {
    renderPage();
    const record = (routesJson.static as Record<string, { h1: string }>)['/chart-chooser']!;
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(record.h1);
  });

  it('creates no Supabase session on load', () => {
    renderPage();
    // Reading an existing session (PublicHeader) is allowed;
    // creating one is not.
    expect(authSpies.signInAnonymously).not.toHaveBeenCalled();
    expect(authSpies.signUp).not.toHaveBeenCalled();
    expect(authSpies.signInWithPassword).not.toHaveBeenCalled();
  });

  it('starts the ladder at the data step with download actions downstream', async () => {
    renderPage();
    expect(screen.getByLabelText('Paste your table')).toBeInTheDocument();
    pasteTable(TSV);
    expect(await screen.findByText('Pick your figure')).toBeInTheDocument();
    expect((await screen.findAllByText('Download SVG')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Download PNG').length).toBeGreaterThan(0);
    // The editor-only insert action must not leak onto the public page.
    expect(screen.queryByText('Insert this figure')).not.toBeInTheDocument();
  });

  it('switches the preview palette from the swatch row', async () => {
    renderPage();
    pasteTable(TSV);
    await screen.findByText('Pick your figure');
    const natureSwatch = screen.getByRole('button', { name: 'Nature / Biology' });
    fireEvent.click(natureSwatch);
    expect(natureSwatch).toHaveAttribute('aria-pressed', 'true');
    // The previews are still up after the re-theme.
    expect(screen.getByText('Pick your figure')).toBeInTheDocument();
  });

  it('never shows the saved confirmation next to a download error', async () => {
    downloadSpies.downloadChartSvg.mockRejectedValue(new Error('render failed'));
    renderPage();
    pasteTable(TSV);
    const download = (await screen.findAllByText('Download SVG'))[0]!;
    fireEvent.click(download);
    // The generic error banner is the single message the user gets…
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong preparing that download.',
    );
    // …never contradicted by a success line under the panel.
    expect(screen.queryByText(/Saved — vector SVG/)).not.toBeInTheDocument();
  });

  it('confirms the save only when the download actually succeeds', async () => {
    renderPage();
    pasteTable(TSV);
    const download = (await screen.findAllByText('Download SVG'))[0]!;
    fireEvent.click(download);
    expect(await screen.findByText(/Saved — vector SVG/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('gates poster-editor work behind an explicit Start a poster link', () => {
    renderPage();
    const cta = screen.getByRole('link', { name: 'Start a poster' });
    expect(cta).toHaveAttribute('href', '/auth');
  });
});
