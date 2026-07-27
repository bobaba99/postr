/**
 * /chart-chooser — the standalone, no-auth chart chooser (plot-picker
 * v2 plan §2).
 *
 * The identical ladder the editor's Figure tab uses, full width, with
 * downloads instead of insert. Two properties are load-bearing and
 * must not be quietly dropped:
 *
 * 1. NO Supabase session is created on load — not even anonymous.
 *    The create path is pure client-side compute (parse → infer →
 *    recommend → render), so a LibGuide can link here without
 *    sending students through a signup wall. PublicHeader only
 *    *reads* an existing session; it never creates one. Checking an
 *    existing chart image (the critique path) needs auth + rate
 *    limiting, so it stays behind "Start a poster".
 * 2. Crawler copy parity — the h1 and lede below mirror the
 *    routes.json entry the prerender script injects for non-JS
 *    crawlers. If you change one, change both.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { Palette } from '@postr/shared';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { SITE_ORIGIN, STATIC_ROUTE_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { FONTS, PALETTES } from '@/poster/constants';
import { ChartChooser } from '@/charts/ladder/ChartChooser';
import type { SelectedFigure } from '@/charts/ladder/PreviewStep';
import { downloadChartPng, downloadChartSvg, downloadChartsZip } from '@/charts/download';

const CHOOSER_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Postr Chart Chooser',
  url: `${SITE_ORIGIN}/chart-chooser`,
  applicationCategory: 'DesignApplication',
  operatingSystem: 'Any (web browser)',
  description:
    'Paste a table or answer three short questions and get ranked, journal-style chart suggestions with captions. Download SVG or PNG.',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  isAccessibleForFree: true,
} as const;

/** Serif poster type for the figure panels — previews read as print. */
const PREVIEW_FONT = FONTS['Charter']?.css ?? 'serif';

function fileSlug(formName: string): string {
  return (
    formName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'chart'
  );
}

export default function ChartChooserPage() {
  useDocumentMeta(STATIC_ROUTE_META['/chart-chooser'] ?? null, CHOOSER_JSON_LD);
  const openFeedback = useFeedbackStore((s) => s.open);
  const [paletteName, setPaletteName] = useState(PALETTES[0]!.name);
  const [downloadFailed, setDownloadFailed] = useState(false);

  const palette = useMemo<Palette>(() => {
    const named = PALETTES.find((p) => p.name === paletteName) ?? PALETTES[0]!;
    const { name: _name, ...rest } = named;
    return rest;
  }, [paletteName]);

  const download = async (kind: 'svg' | 'png', selection: readonly SelectedFigure[]) => {
    try {
      setDownloadFailed(false);
      const only = selection.length === 1 ? selection[0] : null;
      if (only) {
        // One figure stays one file — zipping a single chart would be
        // a worse result for the common case.
        const filename = `${fileSlug(only.formName)}.${kind}`;
        if (kind === 'svg') {
          await downloadChartSvg(only.spec, palette, PREVIEW_FONT, filename);
        } else {
          await downloadChartPng(only.spec, palette, PREVIEW_FONT, filename);
        }
        return;
      }
      await downloadChartsZip(
        selection.map((figure) => ({
          spec: figure.spec,
          filename: `figure-${figure.letter}-${fileSlug(figure.formName)}.${kind}`,
        })),
        palette,
        PREVIEW_FONT,
        kind,
        `figures-${kind}.zip`,
      );
    } catch (error) {
      setDownloadFailed(true);
      // Re-thrown so the panel withholds its success confirmation —
      // the banner above is the single user-facing message.
      throw error;
    }
  };

  return (
    <main className="flex min-h-screen w-screen flex-col bg-[#0a0a12] text-[#c8cad0]">
      <PublicHeader />

      <section className="mx-auto w-full max-w-5xl flex-1 px-8 pb-24 pt-14">
        <h1 className="text-4xl font-bold leading-[1.1] tracking-[-0.02em] text-white">
          Which chart fits your data?
        </h1>
        <p className="mt-5 max-w-[62ch] text-lg leading-relaxed text-[#a3a7b3]">
          Paste a table, upload a CSV or Excel file, or answer three short
          questions — the chooser ranks the figures that fit your data, drawn
          as journal-style panels with captions. Download any panel as SVG or
          PNG. Free, no account, and your data never leaves the browser.
        </p>

        {/* Palette switcher — the standalone page has no poster to
            inherit a theme from, so the eight curated academic
            palettes stand in. */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <span className="text-[13px] font-bold uppercase tracking-[1.2px] text-[#9ca3af]">
            Palette
          </span>
          <div role="group" aria-label="Chart palette" className="flex flex-wrap gap-2">
            {PALETTES.map((p) => {
              const active = p.name === paletteName;
              return (
                <button
                  key={p.name}
                  type="button"
                  title={p.name}
                  aria-pressed={active}
                  onClick={() => setPaletteName(p.name)}
                  className="flex items-center gap-1 rounded-full p-1"
                  style={{
                    border: `2px solid ${active ? '#7c6aed' : '#2a2a3a'}`,
                    background: '#14141f',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: p.accent,
                      display: 'inline-block',
                    }}
                  />
                  <span
                    aria-hidden="true"
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: p.accent2,
                      display: 'inline-block',
                    }}
                  />
                  <span className="sr-only">{p.name}</span>
                </button>
              );
            })}
          </div>
          <span className="text-sm text-[#6b7280]">
            {paletteName}
          </span>
        </div>

        {downloadFailed && (
          <div
            role="alert"
            className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-[#3a2f2f] bg-[#f38ba8]/10 px-4 py-3 text-sm text-[#e8b4c0]"
          >
            <span>Something went wrong preparing that download.</span>
            <button
              type="button"
              onClick={() => openFeedback('bug')}
              className="rounded-md border border-[#7c6aed] px-3 py-1 text-[#d6cfff]"
              style={{ background: 'transparent', cursor: 'pointer' }}
            >
              Send feedback
            </button>
          </div>
        )}

        <div className="mt-10">
          <ChartChooser
            layout="page"
            palette={palette}
            fontFamily={PREVIEW_FONT}
            actions={[
              {
                label: 'Download SVG',
                primary: true,
                run: (selection) => download('svg', selection),
                busyLabel: (n) =>
                  n > 1 ? `Zipping ${n} figures…` : 'Drawing your figure…',
              },
              {
                label: 'Download PNG',
                run: (selection) => download('png', selection),
                busyLabel: (n) =>
                  n > 1 ? `Zipping ${n} figures…` : 'Rendering the image…',
              },
            ]}
            confirmation="Saved — vector SVG scales to any print size"
          />
        </div>

        {/* The critique path (checking an existing chart image) needs
            auth + rate limiting, so it lives in the poster editor —
            this CTA is the honest gate, not a signup wall. */}
        <div className="mt-16 rounded-xl border border-[#1e1e2e] bg-[#0f0f17] px-6 py-6">
          <h2 className="text-lg font-semibold text-white">
            Need the figure on a conference poster?
          </h2>
          <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-[#a3a7b3]">
            Postr is a free academic poster editor with this same chart engine
            built in — plus a print-readability check for figures you already
            have.
          </p>
          <Link
            to="/auth"
            className="mt-4 inline-block rounded-lg bg-[#7c6aed] px-6 py-2.5 text-[15px] font-semibold text-white no-underline transition-colors hover:bg-[#6c5ce7]"
          >
            Start a poster
          </Link>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
