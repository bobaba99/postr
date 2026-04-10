/**
 * App routes.
 *
 *   /              → Home (My Posters)            [auth-gated by AuthBootstrap in main.tsx]
 *   /p/:posterId   → Editor                       [auth-gated]
 *   /s/:slug       → Share (public read-only)     [auth-gated for now; Phase 8 lifts this gate]
 *   *              → 404
 *
 * Note: Phase 8 will move the /s/:slug route OUT from under AuthBootstrap
 * so anonymous visitors don't need a session at all to view a shared
 * poster — but for the placeholder shells we keep the simple gate.
 */
import { Routes, Route } from 'react-router-dom';
import Home from '@/pages/Home';
import Editor from '@/pages/Editor';
import Profile from '@/pages/Profile';
import Share from '@/pages/Share';
import NotFound from '@/pages/NotFound';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/p/:posterId" element={<Editor />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/s/:slug" element={<Share />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
