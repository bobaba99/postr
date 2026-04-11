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
 *   /p/:posterId        → Editor (auth-gated)
 *   /profile            → Profile (auth-gated)
 *   /admin/gallery      → Admin gallery moderation (admin-gated)
 *   /s/:slug            → Share (public read-only)
 *   *                   → 404
 */
import { Routes, Route } from 'react-router-dom';
import { AuthGuard } from '@/components/AuthGuard';
import Landing from '@/pages/Landing';
import About from '@/pages/About';
import Gallery from '@/pages/Gallery';
import GalleryEntryPage from '@/pages/GalleryEntry';
import AdminGallery from '@/pages/AdminGallery';
import Privacy from '@/pages/Privacy';
import Cookies from '@/pages/Cookies';
import Terms from '@/pages/Terms';
import Auth from '@/pages/Auth';
import Home from '@/pages/Home';
import Editor from '@/pages/Editor';
import Profile from '@/pages/Profile';
import Share from '@/pages/Share';
import NotFound from '@/pages/NotFound';

export function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Landing />} />
      <Route path="/about" element={<About />} />
      <Route path="/gallery" element={<Gallery />} />
      <Route path="/gallery/:entryId" element={<GalleryEntryPage />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/cookies" element={<Cookies />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/s/:slug" element={<Share />} />

      {/* Protected routes */}
      <Route path="/dashboard" element={<AuthGuard><Home /></AuthGuard>} />
      <Route path="/p/:posterId" element={<AuthGuard><Editor /></AuthGuard>} />
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
  );
}
