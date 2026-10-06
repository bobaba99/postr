import { Link } from 'react-router';
import { NOT_FOUND_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';

export default function NotFound() {
  useDocumentMeta(NOT_FOUND_META);

  return (
    <main className="flex h-screen w-screen flex-col items-center justify-center bg-[#0a0a12] text-[#c8cad0]">
      <h1 className="text-3xl font-semibold">404</h1>
      <p className="mt-2 text-sm text-[#888]">Page not found.</p>
      {/* The link goes to the poster list (/dashboard), not the home
          page (/); a visitor with no session meets the sign-in page
          first (AuthGuard). The label names where it goes. */}
      <Link
        to="/dashboard"
        className="mt-4 rounded-md border border-[#2a2a3a] bg-[#1a1a26] px-4 py-2 text-sm hover:border-[#7c6aed]"
      >
        Go to your posters
      </Link>
    </main>
  );
}
