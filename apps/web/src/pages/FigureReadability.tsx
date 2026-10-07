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
 * 4. The script, its language, the last check and the typed size are
 *    kept in sessionStorage (poster/figureScriptDraft.ts): a reload keeps
 *    them, closing the tab forgets them. Not localStorage: library guides
 *    send students here from shared computers (owner decision, 2026-10-06;
 *    plan item 7).
 *
 * Sibling of the deactivated pages/ChartChooser.tsx — same page shell,
 * same phone-first ergonomics (px-5 gutter, 44px targets, 16px inputs).
 *
 * In English here and in French at /tools/figure-readability/fr (fix 26):
 * the page's copy is in i18n/figureReadability.ts and the panel's in
 * i18n/readability.ts (the panel takes `lang`; the editor's stays
 * English). The script draft is the tab's either way, so a switch of
 * language keeps it.
 */
import { useState } from 'react';
import { Link } from 'react-router';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { FIGURE_READABILITY_COPY } from '@/i18n/figureReadability';
import { HTML_LANG, localizedPath, useLang, type Lang } from '@/i18n/lang';
import { SITE_ORIGIN, STATIC_ROUTE_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';
import { PrintSizeFields } from '@/poster/PrintSizeFields';
import { DEFAULT_PRINT_SIZE, type PrintSize } from '@/poster/printSize';
import { ReadabilityPanel } from '@/poster/ReadabilityPanel';
import { PAGE_SCRIPT_SLOT, readPageSize, writePageSize } from '@/poster/figureScriptDraft';

function checkerJsonLd(lang: Lang) {
  const c = FIGURE_READABILITY_COPY[lang];
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: c.jsonLdName,
    url: `${SITE_ORIGIN}${localizedPath('/tools/figure-readability', lang)}`,
    applicationCategory: 'DesignApplication',
    operatingSystem: 'Any (web browser)',
    inLanguage: HTML_LANG[lang],
    description: c.jsonLdDescription,
  } as const;
}

export default function FigureReadabilityPage() {
  const lang = useLang();
  const c = FIGURE_READABILITY_COPY[lang];
  useDocumentMeta(
    STATIC_ROUTE_META[localizedPath('/tools/figure-readability', lang)] ?? null,
    checkerJsonLd(lang),
  );
  const [size, setSize] = useState<PrintSize>(() => readPageSize() ?? DEFAULT_PRINT_SIZE);
  const changeSize = (next: PrintSize) => {
    writePageSize(next);
    setSize(next);
  };

  return (
    <main className="flex min-h-screen w-screen flex-col bg-[#0a0a12] text-[#c8cad0]">
      <PublicHeader />

      {/* px-5 on a phone rather than px-8: 64px of a 375px viewport is
          a sixth of the line length, and the code editor and results
          table below are the widest things on the page. */}
      <section className="mx-auto w-full max-w-3xl flex-1 px-5 pb-24 pt-10 sm:px-8 sm:pt-14">
        <h1 className="text-3xl font-bold leading-[1.1] tracking-[-0.02em] text-white sm:text-4xl">
          {c.title}
        </h1>
        <p className="mt-4 max-w-[62ch] text-base leading-relaxed text-[#a3a7b3] sm:mt-5 sm:text-lg">
          {c.lede}
        </p>

        {/* The printed size stands in for the editor's canvas overlay:
            the check scores the pasted code against whatever is typed
            here, and the panel's sizing note re-keys its pill on it. */}
        <div className="mt-8">
          <PrintSizeFields value={size} onChange={changeSize} lang={lang} />
        </div>

        <div className="mt-8">
          <h2 className="sr-only">{c.checkHeading}</h2>
          {/* Keyed by language: a switch of language mounts it afresh, so an
              answer said in the other language goes; the script and its
              last Check are the tab's draft and come back, in this one. */}
          <ReadabilityPanel
            key={lang}
            layout="page"
            lang={lang}
            selectedBlock={null}
            defaultFigureWidthIn={size.w}
            defaultFigureHeightIn={size.h}
            draftSlot={PAGE_SCRIPT_SLOT}
          />
        </div>

        <section className="mt-14" aria-labelledby="how-it-works">
          <h2 id="how-it-works" className="text-lg font-semibold text-white">
            {c.howHeading}
          </h2>
          {/* Canvas: parseRCode falls back to the typed size; parsePythonCode
              does not (fix 13): it reads figsize / set_size_inches /
              rcParams['figure.figsize'], else matplotlib's 6.4 × 4.8 in. */}
          <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-[#a3a7b3]">
            {c.howCanvas}
          </p>
          {/* What the parsers read. A size set any other way is scored at
              the inherited size, which can pass a 6 pt label (measured:
              R theme(text = element_text(size = 6)), Python
              plt.xlabel(fontsize=6)). */}
          <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-[#a3a7b3]">
            {c.howReads}
          </p>
          <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-[#a3a7b3]">
            {c.howFix}
          </p>
        </section>

        {/* The editor upsell is the honest gate, not a signup wall: the
            check is complete here; the editor adds a canvas to size
            against. /p/new is the header's guest entry — a visitor lands
            in the editor on a silent anonymous session, no wall. */}
        <div className="mt-16 rounded-xl border border-[#1e1e2e] bg-[#0f0f17] px-6 py-6">
          <h2 className="text-lg font-semibold text-white">
            {c.editorTitle}
          </h2>
          <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-[#a3a7b3]">
            {c.editorBody}
          </p>
          <Link
            to="/p/new"
            className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[#5641b8] px-6 text-[15px] font-semibold text-white no-underline transition-colors duration-base ease-smooth hover:bg-[#4c39a6]"
          >
            {c.openEditor}
          </Link>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
