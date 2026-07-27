/**
 * App routes.
 *
 *   /                   → Landing (public)
 *   /about              → About (public, feature tour)
 *   /chart-chooser      → Chart chooser (public, no session, code-split)
 *   /gallery            → redirect to / (public gallery deactivated)
 *   /gallery/:entryId   → redirect to / (public gallery deactivated)
 *   /privacy            → Privacy Policy (public)
 *   /cookies            → Cookies Policy (public)
 *   /terms              → Terms of Service (public)
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
import Privacy from '@/pages/Privacy';
import Cookies from '@/pages/Cookies';
import Terms from '@/pages/Terms';
import Debug from '@/pages/Debug';
import Auth from '@/pages/Auth';
import Home from '@/pages/Home';
import Profile from '@/pages/Profile';
import NotFound from '@/pages/NotFound';

// Lazy chunks — kept out of the initial bundle.
const Editor = lazy(() => import('@/pages/Editor'));
const Share = lazy(() => import('@/pages/Share'));
const AdminGallery = lazy(() => import('@/pages/AdminGallery'));
// The chart chooser pulls the parsing/recommend/render stack (and
// lazily Observable Plot beyond that), none of which belongs in the
// marketing-page bundle.
const ChartChooserPage = lazy(() => import('@/pages/ChartChooser'));

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
        {/* Public gallery is deactivated — see the header comment. */}
        <Route path="/gallery" element={<Navigate to="/" replace />} />
        <Route path="/gallery/:entryId" element={<Navigate to="/" replace />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/cookies" element={<Cookies />} />
        <Route path="/terms" element={<Terms />} />
        {/* Standalone chart chooser — public, indexable, and creates
            no Supabase session (not even anonymous) on load. */}
        <Route path="/chart-chooser" element={<ChartChooserPage />} />
        {/*
          Dev only. This was publicly routable with no guard, which put
          a diagnostics page in the crawlable URL space and shipped it
          to every visitor. Gating on import.meta.env.DEV also lets the
          bundler drop the Debug chunk from production builds entirely.
        */}
        {import.meta.env.DEV && <Route path="/debug" element={<Debug />} />}
        <Route path="/auth" element={<Auth />} />
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
