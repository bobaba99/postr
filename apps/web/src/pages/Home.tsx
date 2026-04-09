/**
 * Home page (placeholder).
 *
 * Phase 4 (My Posters) will replace this with a thumbnail grid of the
 * user's posters. For now it serves as a routable landing page after
 * AuthBootstrap mounts the anonymous session.
 */
import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <main className="flex h-screen w-screen items-center justify-center bg-[#0a0a12] text-[#c8cad0]">
      <div className="space-y-4 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Postr</h1>
        <p className="text-sm text-[#888]">My posters — coming in Phase 4.</p>
        <Link
          to="/p/new"
          className="inline-block rounded-md border border-[#2a2a3a] bg-[#1a1a26] px-4 py-2 text-sm hover:border-[#7c6aed]"
        >
          Open editor
        </Link>
      </div>
    </main>
  );
}
