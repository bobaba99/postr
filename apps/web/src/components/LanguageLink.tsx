/**
 * The link to the page being shown, in the other language (fix 26):
 * « Français » on an English page, "English" on a French one. It keeps
 * the query and the hash (`/auth?plan=term` ↔ `/auth/fr?plan=term`), so
 * the visitor stays on the same page. Renders nothing on a page that has
 * no counterpart (the dashboard, the profile), unless `to` names one (the
 * not-found page names the other language's not-found address).
 *
 * The link text is in the language it leads to, so it carries that `lang`
 * (a screen reader says it in that language) and `hrefLang`.
 */
import { Link, useLocation } from 'react-router';
import { CHROME_COPY } from '@/i18n/chrome';
import { HTML_LANG, counterpartPath, langFromPath } from '@/i18n/lang';

interface Props {
  className?: string;
  onClick?: () => void;
  /** Where it leads, when the page is not one of the bilingual pages. */
  to?: string;
}

export function LanguageLink({ className, onClick, to }: Props) {
  const { pathname, search, hash } = useLocation();
  const target = to ?? counterpartPath(pathname, search, hash);
  if (!target) return null;
  const other = langFromPath(pathname) === 'fr' ? 'en' : 'fr';
  return (
    <Link
      to={target}
      lang={HTML_LANG[other]}
      hrefLang={HTML_LANG[other]}
      className={className}
      onClick={onClick}
    >
      {CHROME_COPY[other].languageName}
    </Link>
  );
}
