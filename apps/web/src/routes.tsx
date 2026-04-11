/**
 * App routes.
 *
 *   /                   → Landing (public)
 *   /about              → About (public, feature tour)
 *   /gallery            → Gallery grid (public)
 *   /gallery/:entryId   → Gallery entry detail (public)
 *   /privacy            → Privacy Policy (public)
 *   /cookies            → Cookies Policy (public)
 *   /terms              → Terms of Service (public)
 *   /auth               → Auth (sign in / sign up / guest)
 *   /dashboard          → My Posters (auth-gated)
 *   /p/:posterId        → Editor (auth-gated, code-split)
 *   /profile            → Profile (auth-gated)
 *   /admin/gallery      → Admin gallery moderation (admin-gated, code-split)
 *   /s/:slug            → Share (public read-only)
 *   *                   → 404
 *
 * ── Code splitting ───────────────────────────────────────────────
 * The poster editor is by far the heaviest chunk in the app: it
 * pulls in the canvas renderer, block components, sidebar with
 * every tab, GSAP timelines, the palette designer, the Staples
 * print modal, etc. None of that is needed on the landing page,
 * gallery, profile, or legal pages.
 *
 * We lazy-load the Editor, Share (which also loads the canvas), and
 * AdminGallery routes so first-load on marketing / gallery / legal
 * pages stays small. The gzipped editor chunk loads in parallel
 * when the user hits /p/:posterId — almost always invisible because
 * it overlaps with the Supabase fetch for the poster doc.
 */
import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthGuard } from '@/components/AuthGuard';
import { EditorErrorBoundary } from '@/components/EditorErrorBoundary';
import Landing from '@/pages/Landing';
import About from '@/pages/About';
import Gallery from '@/pages/Gallery';
import GalleryEntryPage from '@/pages/GalleryEntry';
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
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/gallery/:entryId" element={<GalleryEntryPage />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/cookies" element={<Cookies />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/debug" element={<Debug />} />
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
