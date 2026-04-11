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
import { Link } from 'react-router-dom';
import { useFeedbackStore } from '@/stores/feedbackStore';

const CURRENT_YEAR = new Date().getFullYear();

export function PublicFooter() {
  const openFeedback = useFeedbackStore((s) => s.open);

  return (
    <footer className="border-t border-[#1f1f2e] bg-[#0a0a12] px-8 py-12 text-[#6b7280]">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-[1.2fr_1fr_1fr_1fr_1fr]">
          {/* Brand column */}
          <div className="col-span-2 sm:col-span-1">
            <Link to="/" className="flex items-center gap-3 no-underline">
              <svg width="28" height="28" viewBox="0 0 64 64" fill="none">
                <rect width="64" height="64" rx="12" fill="#7c6aed" />
                <path d="M14 14 C32 14, 32 50, 50 50" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.95" />
                <path d="M14 50 C32 50, 32 14, 50 14" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.55" />
                <circle cx="32" cy="32" r="5" fill="white" />
              </svg>
              <span className="text-lg font-bold text-[#c8cad0]">Postr</span>
            </Link>
            <p className="mt-3 max-w-xs text-[12px] leading-relaxed">
              Opinionated poster editor for students and researchers. Built with
              constraint as a feature.
            </p>
          </div>

          <FooterColumn title="Product">
            <FooterLink to="/">Home</FooterLink>
            <FooterLink to="/gallery">Gallery</FooterLink>
            <FooterLink to="/dashboard">My posters</FooterLink>
          </FooterColumn>

          <FooterColumn title="Learn">
            <FooterLink to="/about">About</FooterLink>
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

        <div className="mt-10 border-t border-[#1f1f2e] pt-6 text-[12px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>© {CURRENT_YEAR} Resila Technologies Inc.</span>
            <span className="text-[#555]">Built for researchers.</span>
          </div>
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
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#7c6aed]">
        {title}
      </h3>
      <ul className="flex flex-col gap-2 text-[13px]">{children}</ul>
    </div>
  );
}

function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <li>
      <Link to={to} className="text-[#9ca3af] no-underline hover:text-white">
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
        className="cursor-pointer border-0 bg-transparent p-0 text-left text-[13px] text-[#9ca3af] hover:text-white"
      >
        {children}
      </button>
    </li>
  );
}
