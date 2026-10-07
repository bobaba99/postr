import { Link, useLocation } from 'react-router';
import { LanguageLink } from '@/components/LanguageLink';
import { NOT_FOUND_COPY } from '@/i18n/notFound';
import { englishPath, langFromPath } from '@/i18n/lang';
import { notFoundMeta } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';

/**
 * The not-found address in the other language: `/x` ↔ `/x/fr`. Not one of
 * the bilingual pages, so LanguageLink is told where to go (fix 26).
 */
function otherLanguageAddress(pathname: string): string {
  if (langFromPath(pathname) === 'fr') return englishPath(pathname);
  const english = englishPath(pathname);
  return english === '/' ? '/fr' : `${english}/fr`;
}

export default function NotFound() {
  const { pathname } = useLocation();
  const lang = langFromPath(pathname);
  const c = NOT_FOUND_COPY[lang];
  useDocumentMeta(notFoundMeta(lang));

  return (
    <main className="flex h-screen w-screen flex-col items-center justify-center bg-[#0a0a12] text-[#c8cad0]">
      <h1 className="text-3xl font-semibold">404</h1>
      <p className="mt-2 text-sm text-[#888]">{c.notFound}</p>
      {/* The link goes to the poster list (/dashboard), not the home
          page (/); a visitor with no session meets the sign-in page
          first (AuthGuard). The label names where it goes. */}
      <Link
        to="/dashboard"
        className="mt-4 rounded-md border border-[#2a2a3a] bg-[#1a1a26] px-4 py-2 text-sm hover:border-[#7c6aed]"
      >
        {c.toPosters}
      </Link>
      <LanguageLink
        to={otherLanguageAddress(pathname)}
        className="mt-4 text-xs text-[#8b8f99] underline-offset-4 hover:text-[#c8cad0] hover:underline"
      />
    </main>
  );
}
