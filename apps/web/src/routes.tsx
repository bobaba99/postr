/**
 * App routes.
 *
 *   /              → Landing (public)
 *   /auth          → Auth (sign in / sign up / guest)
 *   /dashboard     → My Posters (auth-gated)
 *   /p/:posterId   → Editor (auth-gated)
 *   /profile       → Profile (auth-gated)
 *   /s/:slug       → Share (public read-only)
 *   *              → 404
 */
import { Routes, Route } from 'react-router-dom';
import { AuthGuard } from '@/components/AuthGuard';
import Landing from '@/pages/Landing';
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
      <Route path="/auth" element={<Auth />} />
      <Route path="/s/:slug" element={<Share />} />

      {/* Protected routes */}
      <Route path="/dashboard" element={<AuthGuard><Home /></AuthGuard>} />
      <Route path="/p/:posterId" element={<AuthGuard><Editor /></AuthGuard>} />
      <Route path="/profile" element={<AuthGuard><Profile /></AuthGuard>} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
