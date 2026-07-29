/**
 * App routes.
 *
 *   /                   → Landing (public)
 *   /about              → About (public, feature tour)
 *   /chart-chooser      → Plot picker (public, no session, code-split)
 *                         URL keeps the measured slug; label is the product name.
 *   /plot-picker        → redirect to /chart-chooser (alias)
 *   /gallery            → redirect to / (public gallery deactivated)
 *   /gallery/:entryId   → redirect to / (public gallery deactivated)
 *   /privacy            → Privacy Policy (public)
 *   /cookies            → Cookies Policy (public)
 *   /terms              → Terms of Service (public)
 *   /paper-to-poster    → Paper→poster standalone flow (public, code-split)
 *   /presentation-checker → Presentation Checker review flow (public,
 *                           code-split, noindex; registered but not
 *                           linked from nav — D12)
 *   /manuscript-to-poster → redirect to /paper-to-poster (old live URL)
 *   /paper-to-present   → redirect to /paper-to-poster (reserved alias)
 *   /auth               → Auth (sign in / sign up / guest)
 *   /dashboard          → My Posters (auth-gated)
 *   /p/:posterId        → Editor (auth-gated, code-split)
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
 * ── Slug aliases: one canonical URL, permanent redirects ─────────
 * Each standalone tool has exactly ONE indexed URL. Alternate spellings
 * redirect rather than render, so no two URLs serve the same document.
 *
 *   /chart-chooser  canonical  ("chart chooser" 40/mo · KD 0)
 *     ← /plot-picker           (our internal name; no measured volume,
 *                               but the owner asked for the URL)
 *   /paper-to-poster canonical ("paper to poster" 140/mo · KD 0)
 *     ← /manuscript-to-poster  (the previously live URL — it is in the
 *                               production sitemap and must not 404)
 *     ← /paper-to-present      (reserved; note this flow outputs a
 *                               poster draft, never slides)
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
// The chart chooser pulls the parsing/recommend/render stack (and
// lazily Observable Plot beyond that), none of which belongs in the
// marketing-page bundle.
const ChartChooserPage = lazy(() => import('@/pages/ChartChooser'));
// Standalone paper→poster flow — pulls in the ingest parsers and
// block renderers, so it loads on demand like the editor.
const PaperToPoster = lazy(() => import('@/pages/PaperToPoster'));
// Presentation Checker — the review upload surface. Kept out of the
// initial bundle for the same reason as the other standalone tools.
const PresentationChecker = lazy(() => import('@/pages/PresentationChecker'));

function LazyFallback() {
  return (
    <main className="flex min-h-screen w-screen items-center justify-center bg-[#0a0a12] text-[#6b7280]">
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
        {/* Standalone chart chooser — public, indexable, and creates
            no Supabase session (not even anonymous) on load. */}
        <Route path="/chart-chooser" element={<ChartChooserPage />} />
        <Route path="/paper-to-poster" element={<PaperToPoster />} />
        {/* Presentation Checker — public but noindex (D12): registered
            now, deliberately NOT linked from nav; the indexed static
            record + nav links are the Milestone-6 launch checklist. */}
        <Route path="/presentation-checker" element={<PresentationChecker />} />
        {/* Alias redirects — see the "Slug aliases" note in the header. */}
        <Route path="/plot-picker" element={<Navigate to="/chart-chooser" replace />} />
        <Route
          path="/manuscript-to-poster"
          element={<Navigate to="/paper-to-poster" replace />}
        />
        <Route
          path="/paper-to-present"
          element={<Navigate to="/paper-to-poster" replace />}
        />
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
            <AuthGuard>
              <EditorErrorBoundary>
                <Editor />
              </EditorErrorBoundary>
            </AuthGuard>
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
