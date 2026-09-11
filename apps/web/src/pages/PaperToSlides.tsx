/**
 * /paper-to-slides — the standalone talk flow (public, code-split).
 *
 * Sibling of /paper-to-poster: same manuscript ingest and pipeline engine,
 * a different output shape — an ordered, editable slide deck rather than a
 * poster (spec §0). Upload a manuscript in, a black-and-white editable
 * `.pptx` (plus a free PDF) out, all inside one chat-style wizard surface.
 *
 * This page is the public shell only — header, the crawler-visible H1/intro,
 * and footer — around <SlidesWizard/>, which owns the whole flow. It mirrors
 * PaperToPoster.tsx: lazy-loaded from routes.tsx (the wizard pulls the deck
 * builder and the lazy pptx writer, none of which belongs in the marketing
 * bundle), and sets its document meta from the shared SEO source.
 *
 * Slug: /paper-to-slides is canonical; /paper-to-present and
 * /paper-to-presentation are its alias spellings.
 *
 * DEACTIVATED 2026-09-10 — not deleted. This page is no longer mounted:
 * routes.tsx redirects the canonical route and both aliases to /, and
 * the routes.json static record (prerender + sitemap) was removed, so
 * `metaFor()` below resolves to null. The component, <SlidesWizard/>,
 * the deck model and the deck exporters stay on disk and unit-tested.
 * Restore recipe: routes.tsx header.
 */
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { SlidesWizard } from '@/manuscript/slides/SlidesWizard';
import { metaFor } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';

export default function PaperToSlides() {
  // Null while deactivated (no routes.json record) — see the header.
  useDocumentMeta(metaFor('/paper-to-slides'));

  return (
    <main className="flex min-h-screen w-screen flex-col bg-[#0a0a12] text-[#c8cad0]">
      <PublicHeader />
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-8 pt-6">
        {/* On reactivation this must match routes.json
            "/paper-to-slides".h1 again — the prerender script injects
            that string for non-JS crawlers, and a live heading that
            disagrees with the crawled one is the drift siteMeta.ts
            warns about. Change both together. */}
        <h1 className="text-2xl font-bold text-white">From paper to slides</h1>
        <p className="mt-1 text-sm text-[#8b8f99]">
          Paste your manuscript, answer a few short questions, and build an
          ordered slide deck — one finding per slide, with speaker notes drawn
          from your paper. Download a free PDF, or an editable PowerPoint.
        </p>

        <div className="mt-5 flex min-h-0 flex-1 flex-col lg:h-[calc(100vh-220px)] lg:min-h-[480px]">
          <SlidesWizard />
        </div>
      </div>
      <PublicFooter />
    </main>
  );
}
