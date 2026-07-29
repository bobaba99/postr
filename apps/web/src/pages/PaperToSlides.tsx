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
 * Slug: /paper-to-slides is canonical. /paper-to-present and
 * /paper-to-presentation 308 here (see vercel.json + routes.tsx).
 */
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { SlidesWizard } from '@/manuscript/slides/SlidesWizard';
import { STATIC_ROUTE_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';

export default function PaperToSlides() {
  useDocumentMeta(STATIC_ROUTE_META['/paper-to-slides'] ?? null);

  return (
    <main className="flex min-h-screen w-screen flex-col bg-[#0a0a12] text-[#c8cad0]">
      <PublicHeader />
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-8 pt-6">
        {/* Must match routes.json "/paper-to-slides".h1 — the prerender
            script injects that string for non-JS crawlers, and a live
            heading that disagrees with the crawled one is the drift
            siteMeta.ts warns about. Change both together. */}
        <h1 className="text-2xl font-bold text-white">From paper to slides</h1>
        <p className="mt-1 text-sm text-[#6b7280]">
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
