/**
 * Shared site footer — 4-column sitemap used across every page that
 * isn't full-bleed (the poster editor is the only opt-out).
 *
 * Columns: Product · Learn · Account · Legal. Collapses to a 2-column
 * grid on small screens and stacks at the narrowest widths. The
 * "Feedback" link opens the global FeedbackModal instead of
 * navigating, so visitors can send feedback from any page without
 * losing their place.
 *
 * In French on a French page (fix 26): labels from i18n/chrome.ts, links
 * to the French pages (the legal ones too: /privacy/fr …), and the link
 * to the page in the other language beside the copyright line, the one
 * place every public page with this footer shows it at every width.
 * Profile stays English (it has no French page).
 */
import { Link, useLocation } from 'react-router';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { CHROME_COPY } from '@/i18n/chrome';
import { counterpartPath, localizedPath, useLang } from '@/i18n/lang';
import { LanguageLink } from '@/components/LanguageLink';

const CURRENT_YEAR = new Date().getFullYear();

export function PublicFooter() {
  const openFeedback = useFeedbackStore((s) => s.open);
  const lang = useLang();
  const c = CHROME_COPY[lang].footer;
  const to = (path: string) => localizedPath(path, lang);
  // No language landmark on a page with no other language (the profile).
  const hasCounterpart = counterpartPath(useLocation().pathname) !== null;

  return (
    <footer className="border-t border-[#1f1f2e] bg-[#0a0a12] px-8 py-12 text-[#8b8f99]">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-[1.2fr_1fr_1fr_1fr_1fr]">
          {/* Brand column */}
          <div className="col-span-2 sm:col-span-1">
            <Link to={to('/')} className="flex min-h-11 items-center gap-3 no-underline">
              <svg width="32" height="32" viewBox="0 0 64 64" fill="none">
                <rect width="64" height="64" rx="12" fill="#7c6aed" />
                <path d="M12 52 C30 52, 34 12, 52 12" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.95" />
                <path d="M12 12 C30 12, 34 52, 52 52" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.55" />
                <circle cx="32" cy="32" r="6" fill="white" />
              </svg>
              <span className="text-[18pt] font-medium text-[#c8cad0]">Postr</span>
            </Link>
            {/* "Built by researchers" was dropped: nothing in the code or
                the docs says who builds Postr, so only the audience half
                of the line can be checked. */}
            <p className="mt-3 max-w-xs text-[14pt] leading-relaxed">
              {c.tagline}
            </p>
          </div>

          {/* The standalone tools live here as well as in the header's
              overflow menu: the flat header nav is `xl:`-gated, so on
              phones this column is the redundant route to them. Only
              "Plot checker" is live — "Plot picker"
              (/chart-chooser), "Paper to poster" and "Paper to slides"
              were removed here: deactivated — see routes.tsx header.
              Re-add them after "Pricing", picker first, in front of
              the checker. Mirrors PublicHeader TOOL_LINKS. */}
          <FooterColumn title={c.product}>
            <FooterLink to={to('/')}>{c.home}</FooterLink>
            <FooterLink to={to('/pricing')}>{c.pricing}</FooterLink>
            <FooterLink to={to('/tools/figure-readability')}>{c.plotChecker}</FooterLink>
          </FooterColumn>

          <FooterColumn title={c.learn}>
            <FooterLink to={to('/about')}>{c.about}</FooterLink>
            <FooterLink to={to('/why-posters')}>{c.whyPosters}</FooterLink>
            <FooterButton onClick={() => openFeedback('other')}>
              {c.sendFeedback}
            </FooterButton>
          </FooterColumn>

          <FooterColumn title={c.account}>
            <FooterLink to={to('/auth')}>{c.signIn}</FooterLink>
            <FooterLink to="/profile">{c.profile}</FooterLink>
          </FooterColumn>

          <FooterColumn title={c.legal}>
            <FooterLink to={to('/privacy')}>{c.privacy}</FooterLink>
            <FooterLink to={to('/cookies')}>{c.cookies}</FooterLink>
            <FooterLink to={to('/terms')}>{c.terms}</FooterLink>
          </FooterColumn>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-[#1f1f2e] pt-6 text-[14pt]">
          <span>© {CURRENT_YEAR} Resila Technologies Inc.</span>
          {hasCounterpart && (
            <nav aria-label={c.languageNav}>
              <LanguageLink className="-my-2.5 inline-block py-2.5 text-[14pt] text-[#9ca3af] underline-offset-4 hover:text-white hover:underline" />
            </nav>
          )}
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-3 text-[12pt] font-semibold uppercase tracking-[0.15em] text-[#7c6aed]">
        {title}
      </h2>
      <ul className="flex flex-col gap-2 text-[14pt]">{children}</ul>
    </div>
  );
}

function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <li>
      {/*
        `py-2.5` gives the link a 44px-tall hit area on a phone without
        changing how the footer looks: the text stays put, the padding
        is invisible, and the list already has enough gap to absorb it.
        Measured at 22px before — half the WCAG 2.5.5 / iOS target floor.
      */}
      <Link
        to={to}
        className="-my-2.5 inline-block py-2.5 text-[14pt] text-[#9ca3af] no-underline hover:text-white"
      >
        {children}
      </Link>
    </li>
  );
}

function FooterButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="-my-2.5 cursor-pointer border-0 bg-transparent px-0 py-2.5 text-left text-[14pt] text-[#9ca3af] hover:text-white"
      >
        {children}
      </button>
    </li>
  );
}
