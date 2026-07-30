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
  name: 'Postr Plot Picker',
  url: `${SITE_ORIGIN}/chart-chooser`,
  applicationCategory: 'DesignApplication',
  operatingSystem: 'Any (web browser)',
  description:
    'Paste a table or answer three short questions and get ranked, journal-style chart suggestions with captions. Download SVG or PNG.',
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

      {/* px-5 on a phone rather than px-8: 64px of a 375px viewport is
          a sixth of the line length, and the figure panels below are
          the widest thing on the page. */}
      <section className="mx-auto w-full max-w-5xl flex-1 px-5 pb-24 pt-10 sm:px-8 sm:pt-14">
        <h1 className="text-3xl font-bold leading-[1.1] tracking-[-0.02em] text-white sm:text-4xl">
          Which chart fits your data?
        </h1>
        <p className="mt-4 max-w-[62ch] text-base leading-relaxed text-[#a3a7b3] sm:mt-5 sm:text-lg">
          Paste a table, upload a CSV or Excel file, or answer three short
          questions — the picker ranks the figures that fit your data, drawn
          as journal-style panels with captions. Download any panel as SVG or
          PNG. No account, and your data never leaves the browser.
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
                  // Eight swatches sit side by side, so an undersized
                  // target here is a mis-tap, not just a near miss.
                  // min-h-11 (44px) is the floor rather than py-3,
                  // which measured 42px once the border was counted.
                  className="flex min-h-11 items-center gap-1 rounded-full px-2 py-3"
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
          <span className="text-sm text-[#8b8f99]">
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
          <h2 className="sr-only">Build your chart</h2>
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
            className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[#5641b8] px-6 text-[15px] font-semibold text-white no-underline transition-colors hover:bg-[#4c39a6]"
          >
            Start a poster
          </Link>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
