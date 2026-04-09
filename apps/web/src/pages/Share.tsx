/**
 * Share page — public read-only poster viewer (placeholder).
 *
 * Phase 8 will resolve `slug` to a poster row via the public-read RLS
 * policy and render the canvas without sidebar or chrome.
 *
 * Note: this route renders OUTSIDE the AuthBootstrap gate so anonymous
 * visitors can land here without sign-in. See routes.tsx.
 */
import { useParams } from 'react-router-dom';

export default function Share() {
  const { slug } = useParams<{ slug: string }>();

  return (
    <main className="flex h-screen w-screen flex-col items-center justify-center bg-white text-slate-900">
      <h1 className="text-2xl font-semibold">Shared poster</h1>
      <p className="mt-2 text-sm text-slate-600">
        Slug: <span className="font-mono">{slug ?? 'unknown'}</span>
      </p>
      <p className="mt-1 text-xs text-slate-400">Phase 8 will mount the read-only canvas here.</p>
    </main>
  );
}
