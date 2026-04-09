/**
 * Editor page (placeholder).
 *
 * Phase 3 (port the prototype) replaces this with the full sidebar +
 * canvas editor. For now it just confirms routing + the URL param.
 */
import { useParams } from 'react-router-dom';

export default function Editor() {
  const { posterId } = useParams<{ posterId: string }>();

  return (
    <main className="flex h-screen w-screen flex-col items-center justify-center bg-[#0a0a12] text-[#c8cad0]">
      <h1 className="text-2xl font-semibold">Editor</h1>
      <p className="mt-2 text-sm text-[#888]">
        Poster id: <span className="font-mono">{posterId ?? 'unknown'}</span>
      </p>
      <p className="mt-1 text-xs text-[#555]">Phase 3 will mount the canvas here.</p>
    </main>
  );
}
