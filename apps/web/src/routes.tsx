/**
 * App routes.
 *
 *   /                   → Landing (public)
 *   /about              → About (public, feature tour)
 *   /why-posters        → Why posters (public)
 *   /pricing            → Pricing (public)
 *   /tools/figure-readability → Plot checker — the standalone figure-readability check (public, no
 *                         session, code-split — the one live standalone
 *                         tool; the editor's Check tab as a page)
 *   /plot-checker       → redirect to /tools/figure-readability (alias)
 *   /chart-chooser      → redirect to / (standalone plot picker deactivated)
 *   /plot-picker        → redirect to / (alias of the deactivated picker)
 *   /gallery            → redirect to / (public gallery deactivated)
 *   /gallery/:entryId   → redirect to / (public gallery deactivated)
 *   /privacy            → Privacy Policy (public)
 *   /cookies            → Cookies Policy (public)
 *   /terms              → Terms of Service (public)
 *   /paper-to-poster    → redirect to / (paper-to-poster deactivated)
 *   /manuscript-to-poster → redirect to / (alias of the deactivated flow)
 *   /paper-to-slides    → redirect to / (paper-to-slides deactivated)
 *   /paper-to-present   → redirect to / (alias of the deactivated flow)
 *   /paper-to-presentation → redirect to / (alias of the deactivated flow)
 *   /presentation-checker → redirect to / (presentation checker deactivated)
 *   /auth               → Auth (sign in / sign up / guest)
 *   /dashboard          → My Posters (auth-gated)
 *   /p/:posterId        → Editor (anonymous-first, code-split — EnsureSession
 *                         creates a guest session instead of bouncing to /auth)
 *   /profile            → Profile (auth-gated)
 *   /admin/gallery      → Admin gallery moderation (admin-gated, code-split)
 *   /s/:slug            → Share (public read-only)
 *   /debug              → Diagnostics (development builds only)
 *   *                   → 404
 *
 * ── Public gallery: deactivated, not deleted ─────────────────────
 * The public gallery is switched off for now. Its routes redirect to
 * the landing page, but the page components (pages/Gallery.tsx,
 * pages/GalleryEntry.tsx), the data layer (data/gallery.ts), the
 * admin moderation page (/admin/gallery) and the database all remain
 * so it can be switched back on by restoring the two routes below.
 *
 * ── Manuscript pipelines + Presentation Checker: deactivated, not deleted ──
 * Switched off 2026-09-10 to keep the product to its core, the poster
 * editor. (The standalone plot picker followed the same day — its own
 * block is below.) Every route below redirects to the landing page;
 * nothing was deleted.
 *
 * Kept on disk (dormant, still unit-tested):
 *   - pages/PaperToPoster.tsx + manuscript/* (ingest, interviewer,
 *     mapper, buildPoster, ui/*)
 *   - pages/PaperToSlides.tsx + manuscript/slides/*, manuscript/deck/*,
 *     export/deck/*, export/pdf/deckPdf.ts, export/pptx/deckWriter.ts
 *   - pages/PresentationChecker.tsx + review/* (reviewApi, FindingCards,
 *     ingest/*) + poster/sidebar/ReviewTab.tsx (rail entry removed in
 *     poster/Sidebar.tsx; import/union/guard kept)
 *   - components/PricingSection.tsx TalkWaitlistCallout (no longer
 *     rendered) + data/talkWaitlist.ts + the talk_waitlist table
 *   - data/checkoutIntent.ts still types the review SKUs; VALID only
 *     accepts 'term' | 'pack' so /auth?plan=review_* shows plain auth
 *   - apps/api: createNarrativeRouter / createReviewRouter are not
 *     mounted unless FEATURE_MANUSCRIPT / FEATURE_REVIEW = 1; the review
 *     SKUs are refused by /billing/create-checkout while FEATURE_REVIEW
 *     is off; webhook fulfilment code + review/poster_reviews tables stay
 *
 * To restore (do every step, then re-run the contract tests —
 * src/__tests__/routes.test.tsx, components/__tests__/
 * toolDiscoverability.test.tsx, seo/__tests__/siteMeta.test.ts,
 * seo/__tests__/vercelRouting.test.ts — and flip their assertions):
 *   1. routes.tsx: re-add the three lazy imports and mount the pages at
 *      /paper-to-poster, /paper-to-slides, /presentation-checker; point
 *      the alias <Navigate>s back at their canonical route.
 *   2. vercel.json: retarget the alias 308s to the canonical routes,
 *      drop the /paper-to-poster + /paper-to-slides rewrites and their
 *      X-Robots-Tag blocks (the checker keeps its rewrite + noindex
 *      until its launch checklist flips it to a static record).
 *   3. seo/routes.json: restore the static '/paper-to-poster' and
 *      '/paper-to-slides' records (git history, commit before
 *      2026-09-10) and the app '/presentation-checker' record; switch
 *      pages/PaperToPoster.tsx + PaperToSlides.tsx back to
 *      STATIC_ROUTE_META lookups.
 *   4. components/PublicHeader.tsx TOOL_LINKS, PublicFooter.tsx Product
 *      column, pages/Landing.tsx ToolCard, pages/About.tsx
 *      'start-from-work' copy, components/NewPosterButton.tsx
 *      "Import manuscript" link, components/PricingSection.tsx
 *      <TalkWaitlistCallout /> mount — re-add the entries marked
 *      "deactivated — see routes.tsx header".
 *   5. poster/Sidebar.tsx: re-add the ['review', 'review'] rail tuple
 *      and the `tab === 'review'` branch.
 *   6. data/checkoutIntent.ts: widen VALID to the review SKUs.
 *   7. apps/api: set FEATURE_MANUSCRIPT=1 / FEATURE_REVIEW=1 (and the
 *      STRIPE_PRICE_REVIEW_* ids) in the Render env.
 *   8. scripts: apps/web/scripts/verify-prerender.sh route loop + alias
 *      checks, apps/web/scripts/mobile-audit.mjs ROUTES,
 *      scripts/text-audit/scrape.mts ROUTES; docs/feature-graph.md
 *      "Deactivated features" section.
 *
 * ── Standalone plot picker: deactivated, not deleted ─────────────
 * Switched off 2026-09-10, after the pass above, while the picker is
 * revamped in another worktree. The figure-readability check
 * (/tools/figure-readability, below) is the ONE standalone tool in the
 * nav; otherwise the poster editor is the whole public surface.
 * charts/* is NOT dormant: the same ChartChooser ladder stays live
 * inside the editor's Figure tab; only the page that wrapped it for
 * the public URL is off.
 *
 * Kept on disk (dormant, still unit-tested):
 *   - pages/ChartChooser.tsx — pages/__tests__/ChartChooser.test.tsx
 *     renders it directly and pins the h1 the deleted routes.json
 *     record carried
 *
 * To restore (do every step, then re-run the contract tests —
 * src/__tests__/routes.test.tsx, components/__tests__/
 * toolDiscoverability.test.tsx (TOOL_PATHS), seo/__tests__/
 * siteMeta.test.ts, seo/__tests__/vercelRouting.test.ts
 * (CLIENT_ROUTES / ALIAS_REDIRECTS / DEACTIVATED_ROUTES),
 * pages/__tests__/ChartChooser.test.tsx — and flip their assertions):
 *   1. routes.tsx: re-add the lazy import
 *      `const ChartChooserPage = lazy(() => import('@/pages/ChartChooser'));`
 *      and mount it at /chart-chooser; point the /plot-picker
 *      <Navigate> back at /chart-chooser.
 *   2. seo/routes.json: restore the static '/chart-chooser' record
 *      (git history, commit before 2026-09-10) so it prerenders and
 *      re-enters the sitemap; switch pages/ChartChooser.tsx back to
 *      the STATIC_ROUTE_META['/chart-chooser'] lookup and its test
 *      back to reading routes.json.
 *   3. vercel.json: retarget the /plot-picker 308 to /chart-chooser;
 *      drop the /chart-chooser rewrite and its X-Robots-Tag block
 *      (a prerendered file must not be shadowed by a rewrite).
 *   4. components/PublicHeader.tsx TOOL_LINKS ({ to: '/chart-chooser',
 *      label: 'Plot picker', blurb: 'Find the figure that fits your
 *      data' } — in FRONT of the Plot checker entry),
 *      components/PublicFooter.tsx Product column, pages/Landing.tsx
 *      "Tools you can use on their own" ToolCard (before the checker
 *      card; the section itself is back) and its small-screen note,
 *      pages/About.tsx 'figures' milestone copy.
 *   5. scripts: apps/web/scripts/verify-prerender.sh (prerendered
 *      loop, noindex/200 loops, check_alias /plot-picker),
 *      apps/web/scripts/mobile-audit.mjs ROUTES,
 *      scripts/text-audit/scrape.mts ROUTES; docs/feature-graph.md
 *      §6.10 + §10 "Deactivated features"; docs/manual-test-flows.md
 *      deactivated-features note.
 *
 * ── Standalone figure-readability check: LIVE ────────────────────
 * /tools/figure-readability (pages/FigureReadability.tsx, code-split)
 * is the editor's Figure › Check tab as a public page: paste R/Python
 * plotting code, type the printed size, get the point size of every
 * label and the base_size fix. Pure client-side; creates no Supabase
 * session. Nested under /tools so future standalone tools share the
 * prefix; the bare /tools is a real 404 (vercelRouting.test.ts
 * UNKNOWN_PATHS). Its alias /plot-checker 308s here (vercel.json) and
 * <Navigate>s here in-app. It is mirrored in PublicHeader TOOL_LINKS,
 * the PublicFooter Product column and the Landing tools section, and
 * pinned by src/__tests__/routes.test.tsx + toolDiscoverability.test.tsx
 * (TOOL_PATHS) + siteMeta.test.ts + vercelRouting.test.ts.
 *
 * ── Slug aliases: one canonical URL, permanent redirects ─────────
 * Each standalone tool has exactly ONE indexed URL. Alternate spellings
 * redirect rather than render, so no two URLs serve the same document.
 * With every other standalone tool deactivated, their aliases fall
 * through to the landing page in ONE hop rather than chaining through
 * a route that itself redirects.
 *
 *   /tools/figure-readability
 *     ← /plot-checker          (the product name, like /plot-picker for the picker)
 *
 *   /                          (every deactivated tool's alias)
 *     ← /plot-picker           (alias of /chart-chooser — the measured
 *                               slug, "chart chooser" 40/mo · KD 0; the
 *                               308 was deployed, so it is retargeted
 *                               rather than dropped and must not 404)
 *     ← /manuscript-to-poster  (the previously live URL — it was in the
 *                               production sitemap and must not 404)
 *     ← /paper-to-present      (a talk-intent spelling)
 *     ← /paper-to-presentation (the same intent, longer spelling)
 *
 * The <Navigate replace> entries below only cover in-app navigation.
 * A cold hit on an alias never reaches this router: vercel.json issues
 * a real 308 first, which is what crawlers need to consolidate link
 * equity onto the canonical. Both layers must be kept in sync — the
 * contract is locked by src/seo/__tests__/vercelRouting.test.ts.
 *
 * ── Code splitting ───────────────────────────────────────────────
 * The poster editor is by far the heaviest chunk in the app: it
 * pulls in the canvas renderer, block components, sidebar with
 * every tab, GSAP timelines, the palette designer, the Staples
 * print modal, etc. None of that is needed on the landing page,
 * profile, or legal pages.
 *
 * We lazy-load the Editor, Share (which also loads the canvas), and
 * AdminGallery routes so first-load on marketing / legal pages
 * stays small. The gzipped editor chunk loads in parallel
 * when the user hits /p/:posterId — almost always invisible because
 * it overlaps with the Supabase fetch for the poster doc.
 */
import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router';
import { AuthGuard } from '@/components/AuthGuard';
import { EnsureSession } from '@/components/EnsureSession';
import { EditorErrorBoundary } from '@/components/EditorErrorBoundary';
import Landing from '@/pages/Landing';
import About from '@/pages/About';
import WhyPosters from '@/pages/WhyPosters';
import Pricing from '@/pages/Pricing';
import Privacy from '@/pages/Privacy';
import PrivacyFr from '@/pages/PrivacyFr';
import Cookies from '@/pages/Cookies';
import CookiesFr from '@/pages/CookiesFr';
import Terms from '@/pages/Terms';
import TermsFr from '@/pages/TermsFr';
import Debug from '@/pages/Debug';
import Auth from '@/pages/Auth';
import Home from '@/pages/Home';
import Profile from '@/pages/Profile';
import BillingResult from '@/pages/BillingResult';
import NotFound from '@/pages/NotFound';

// Lazy chunks — kept out of the initial bundle.
const Editor = lazy(() => import('@/pages/Editor'));
const Share = lazy(() => import('@/pages/Share'));
const AdminGallery = lazy(() => import('@/pages/AdminGallery'));
// The one live standalone tool. Code-split so the readability engine
// (ReadabilityPanel + readability.ts) stays out of the marketing
// pages' initial bundle; the editor already loads it in its own chunk.
const FigureReadabilityPage = lazy(() => import('@/pages/FigureReadability'));
// Deactivated — see the header. The lazy imports for
// pages/PaperToPoster, pages/PresentationChecker, pages/PaperToSlides
// and pages/ChartChooser are intentionally absent so their chunks leave
// the production build; restore them alongside the routes below. (The
// chart parsing/recommend/render stack still ships — the editor's
// Figure tab uses it — but no longer as a marketing-page chunk.)

function LazyFallback() {
  return (
    <main className="flex min-h-screen w-screen items-center justify-center bg-[#0a0a12] text-[#8b8f99]">
      <div className="text-[14pt]">Loading…</div>
    </main>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<LazyFallback />}>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Landing />} />
        <Route path="/about" element={<About />} />
        <Route path="/why-posters" element={<WhyPosters />} />
        <Route path="/pricing" element={<Pricing />} />
        {/* Public gallery is deactivated — see the header comment. */}
        <Route path="/gallery" element={<Navigate to="/" replace />} />
        <Route path="/gallery/:entryId" element={<Navigate to="/" replace />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/privacy/fr" element={<PrivacyFr />} />
        <Route path="/cookies" element={<Cookies />} />
        <Route path="/cookies/fr" element={<CookiesFr />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/terms/fr" element={<TermsFr />} />
        {/* Standalone figure-readability check — public, creates no
            Supabase session (pages/FigureReadability.tsx header). */}
        <Route path="/tools/figure-readability" element={<FigureReadabilityPage />} />
        <Route
          path="/plot-checker"
          element={<Navigate to="/tools/figure-readability" replace />}
        />
        {/* Standalone plot picker is deactivated — see the header
            comment. Its canonical route and its alias both land on the
            landing page in one hop. */}
        <Route path="/chart-chooser" element={<Navigate to="/" replace />} />
        {/* Manuscript pipelines + Presentation Checker are deactivated —
            see the header comment. Canonical routes AND their aliases
            all land on the landing page in one hop. */}
        <Route path="/paper-to-poster" element={<Navigate to="/" replace />} />
        <Route path="/presentation-checker" element={<Navigate to="/" replace />} />
        <Route path="/paper-to-slides" element={<Navigate to="/" replace />} />
        {/* Alias redirects — see the "Slug aliases" note in the header. */}
        <Route path="/plot-picker" element={<Navigate to="/" replace />} />
        <Route path="/manuscript-to-poster" element={<Navigate to="/" replace />} />
        <Route path="/paper-to-present" element={<Navigate to="/" replace />} />
        <Route path="/paper-to-presentation" element={<Navigate to="/" replace />} />
        {/*
          Dev only. This was publicly routable with no guard, which put
          a diagnostics page in the crawlable URL space and shipped it
          to every visitor. Gating on import.meta.env.DEV also lets the
          bundler drop the Debug chunk from production builds entirely.
        */}
        {import.meta.env.DEV && <Route path="/debug" element={<Debug />} />}
        <Route path="/auth" element={<Auth />} />
        {/* Stripe checkout redirect landings (apps/api billingUrl()). */}
        <Route path="/billing/success" element={<BillingResult outcome="success" />} />
        <Route path="/billing/cancel" element={<BillingResult outcome="cancel" />} />
        <Route path="/s/:slug" element={<Share />} />

        {/* Protected routes */}
        <Route path="/dashboard" element={<AuthGuard><Home /></AuthGuard>} />
        <Route
          path="/p/:posterId"
          element={
            <EnsureSession>
              <EditorErrorBoundary>
                <Editor />
              </EditorErrorBoundary>
            </EnsureSession>
          }
        />
        <Route path="/profile" element={<AuthGuard><Profile /></AuthGuard>} />
        <Route
          path="/admin/gallery"
          element={
            <AuthGuard>
              <AdminGallery />
            </AuthGuard>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
