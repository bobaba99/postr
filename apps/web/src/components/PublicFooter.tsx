/**
 * Shared site footer — 4-column sitemap used across every page that
 * isn't full-bleed (the poster editor is the only opt-out).
 *
 * Columns: Product · Learn · Account · Legal. Collapses to a 2-column
 * grid on small screens and stacks at the narrowest widths. The
 * "Feedback" link opens the global FeedbackModal instead of
 * navigating, so visitors can send feedback from any page without
 * losing their place.
 */
import { Link } from 'react-router';
import { useFeedbackStore } from '@/stores/feedbackStore';

const CURRENT_YEAR = new Date().getFullYear();

export function PublicFooter() {
  const openFeedback = useFeedbackStore((s) => s.open);

  return (
    <footer className="border-t border-[#1f1f2e] bg-[#0a0a12] px-8 py-12 text-[#8b8f99]">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-[1.2fr_1fr_1fr_1fr_1fr]">
          {/* Brand column */}
          <div className="col-span-2 sm:col-span-1">
            <Link to="/" className="flex items-center gap-3 no-underline">
              <svg width="32" height="32" viewBox="0 0 64 64" fill="none">
                <rect width="64" height="64" rx="12" fill="#7c6aed" />
                <path d="M14 14 C32 14, 32 50, 50 50" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.95" />
                <path d="M14 50 C32 50, 32 14, 50 14" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.55" />
                <circle cx="32" cy="32" r="5" fill="white" />
              </svg>
              <span className="text-[18pt] font-medium text-[#c8cad0]">Postr</span>
            </Link>
            <p className="mt-3 max-w-xs text-[14pt] leading-relaxed">
              Built by researchers. Built for researchers.
            </p>
          </div>

          {/* The two standalone tools live here as well as in the
              header's overflow menu. The flat header nav is `xl:`-gated, so
              on phones this column is the only route to them. */}
          <FooterColumn title="Product">
            <FooterLink to="/">Home</FooterLink>
            <FooterLink to="/pricing">Pricing</FooterLink>
            <FooterLink to="/paper-to-poster">Paper to poster</FooterLink>
            <FooterLink to="/paper-to-slides">Paper to slides</FooterLink>
            <FooterLink to="/chart-chooser">Plot picker</FooterLink>
          </FooterColumn>

          <FooterColumn title="Learn">
            <FooterLink to="/about">About</FooterLink>
            <FooterLink to="/why-posters">Why poster sessions</FooterLink>
            <FooterButton onClick={() => openFeedback('other')}>
              Send feedback
            </FooterButton>
          </FooterColumn>

          <FooterColumn title="Account">
            <FooterLink to="/auth">Sign in</FooterLink>
            <FooterLink to="/profile">Profile</FooterLink>
          </FooterColumn>

          <FooterColumn title="Legal">
            <FooterLink to="/privacy">Privacy Policy</FooterLink>
            <FooterLink to="/cookies">Cookies Policy</FooterLink>
            <FooterLink to="/terms">Terms of Service</FooterLink>
          </FooterColumn>
        </div>

        <div className="mt-10 border-t border-[#1f1f2e] pt-6 text-[14pt]">
          <span>© {CURRENT_YEAR} Resila Technologies Inc.</span>
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
