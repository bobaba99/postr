/**
 * /tools/figure-readability — the standalone, no-auth figure-readability
 * check (alias /plot-checker → 308 here).
 *
 * The editor's Figure › Check tab (poster/ReadabilityPanel.tsx), full
 * width, with the printed size typed instead of dragged on a canvas.
 * Three properties are load-bearing and must not be quietly dropped:
 *
 * 1. NO Supabase session is created on load — not even anonymous. The
 *    whole check is client-side compute (parse the pasted R/Python →
 *    scale source canvas to print size → score → back-calculate
 *    base_size), so a LibGuide can link here without sending students
 *    through a signup wall. PublicHeader only *reads* an existing
 *    session; it never creates one.
 * 2. Crawler copy parity — the h1 and lede below mirror the
 *    routes.json entry the prerender script injects for non-JS
 *    crawlers. If you change one, change both (pinned by
 *    pages/__tests__/FigureReadability.test.tsx).
 * 3. The image-OCR scan path (Claude Vision via /api/import/extract)
 *    is never mounted here: `selectedBlock={null}` plus the panel's own
 *    `layout === 'page'` gate. Nothing the visitor pastes leaves the
 *    browser.
 *
 * Sibling of the deactivated pages/ChartChooser.tsx — same page shell,
 * same phone-first ergonomics (px-5 gutter, 44px targets, 16px inputs).
 */
import { useState } from 'react';
import { Link } from 'react-router';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { SITE_ORIGIN, STATIC_ROUTE_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';
import { PrintSizeFields } from '@/poster/PrintSizeFields';
import { DEFAULT_PRINT_SIZE, type PrintSize } from '@/poster/printSize';
import { ReadabilityPanel } from '@/poster/ReadabilityPanel';

const CHECKER_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Postr Plot Checker',
  url: `${SITE_ORIGIN}/tools/figure-readability`,
  applicationCategory: 'DesignApplication',
  operatingSystem: 'Any (web browser)',
  description:
    'Paste ggplot2 or matplotlib code and the size the figure will print at. See the printed point size of every label and copy the base_size fix.',
} as const;

export default function FigureReadabilityPage() {
  useDocumentMeta(STATIC_ROUTE_META['/tools/figure-readability'] ?? null, CHECKER_JSON_LD);
  const [size, setSize] = useState<PrintSize>(DEFAULT_PRINT_SIZE);

  return (
    <main className="flex min-h-screen w-screen flex-col bg-[#0a0a12] text-[#c8cad0]">
      <PublicHeader />

      {/* px-5 on a phone rather than px-8: 64px of a 375px viewport is
          a sixth of the line length, and the code editor and results
          table below are the widest things on the page. */}
      <section className="mx-auto w-full max-w-3xl flex-1 px-5 pb-24 pt-10 sm:px-8 sm:pt-14">
        <h1 className="text-3xl font-bold leading-[1.1] tracking-[-0.02em] text-white sm:text-4xl">
          Will your figure labels be readable at poster size?
        </h1>
        <p className="mt-4 max-w-[62ch] text-base leading-relaxed text-[#a3a7b3] sm:mt-5 sm:text-lg">
          Paste your R (ggplot2) or Python (matplotlib, seaborn) plotting code,
          type the size the figure will print at, and see the point size of
          every label on paper — axis titles need 18 pt, tick labels 14 pt,
          captions 12 pt. If anything falls short, copy the base_size fix. No
          account, and your code never leaves the browser.
        </p>

        {/* The printed size stands in for the editor's canvas overlay:
            the check scores the pasted code against whatever is typed
            here, and the panel's sizing note re-keys its pill on it. */}
        <div className="mt-8">
          <PrintSizeFields value={size} onChange={setSize} />
        </div>

        <div className="mt-8">
          <h2 className="sr-only">Check your code</h2>
          <ReadabilityPanel
            layout="page"
            selectedBlock={null}
            defaultFigureWidthIn={size.w}
            defaultFigureHeightIn={size.h}
          />
        </div>

        <section className="mt-14" aria-labelledby="how-it-works">
          <h2 id="how-it-works" className="text-lg font-semibold text-white">
            How the check works
          </h2>
          <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-[#a3a7b3]">
            The check scales your figure from its source canvas — the ggsave()
            or figsize your code sets, or the typed size when it sets none — to
            the printed size, then scores every element against poster
            thresholds: 18 pt for titles and axis titles, 14 pt for tick labels,
            legends and strips, 12 pt for captions.
          </p>
          <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-[#a3a7b3]">
            If anything falls short, it back-calculates the smallest base_size
            that makes every element pass and hands it to you as a one-line
            snippet or as your full script with the edit already made.
          </p>
        </section>

        {/* The editor upsell is the honest gate, not a signup wall: the
            check is complete here; the editor adds a canvas to size
            against. /p/new is the header's guest entry — a visitor lands
            in the editor on a silent anonymous session, no wall. */}
        <div className="mt-16 rounded-xl border border-[#1e1e2e] bg-[#0f0f17] px-6 py-6">
          <h2 className="text-lg font-semibold text-white">
            Need this check while you build the poster?
          </h2>
          <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-[#a3a7b3]">
            Postr is a free academic poster editor with this same check in its
            Figure tab — drag a figure box on the canvas and the check sizes
            against it, or select an image block to use its exact print
            dimensions.
          </p>
          <Link
            to="/p/new"
            className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[#5641b8] px-6 text-[15px] font-semibold text-white no-underline transition-colors duration-base ease-smooth hover:bg-[#4c39a6]"
          >
            Open the editor
          </Link>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
