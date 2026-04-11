/**
 * Landing page — public, no auth required.
 * Explains what Postr is and directs to /auth.
 */
import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <main className="min-h-screen w-screen bg-[#0a0a12] text-[#c8cad0]">
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-3">
          <svg width="32" height="32" viewBox="0 0 64 64" fill="none">
            <rect width="64" height="64" rx="12" fill="#7c6aed" />
            <path d="M14 14 C32 14, 32 50, 50 50" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.95" />
            <path d="M14 50 C32 50, 32 14, 50 14" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.55" />
            <circle cx="32" cy="32" r="5" fill="white" />
          </svg>
          <span className="text-xl font-bold">Postr</span>
        </div>
        <div className="flex items-center gap-6">
          <Link
            to="/about"
            className="text-sm text-[#6b7280] no-underline hover:text-[#c8cad0]"
          >
            About
          </Link>
          <Link
            to="/auth"
            className="rounded-lg border border-[#7c6aed] px-5 py-2 text-sm font-semibold text-[#7c6aed] no-underline hover:bg-[#7c6aed] hover:text-white transition-colors"
          >
            Sign in
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-8 py-24 text-center">
        <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl">
          Conference posters,<br />
          <span className="text-[#7c6aed]">without the pain.</span>
        </h1>
        <p className="mt-6 text-lg text-[#9ca3af] leading-relaxed max-w-xl mx-auto">
          Postr is a free poster editor built for researchers. Pick a template,
          write with guidance, check your figures, and export — all in one place.
          No design skills needed.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            to="/auth"
            className="rounded-lg bg-[#7c6aed] px-8 py-3 text-base font-semibold text-white no-underline hover:bg-[#6c5ce7] transition-colors"
          >
            Get started free
          </Link>
          <Link
            to="/auth?guest=1"
            className="rounded-lg border border-[#2a2a3a] bg-[#1a1a26] px-8 py-3 text-base font-semibold text-[#c8cad0] no-underline hover:border-[#7c6aed] transition-colors"
          >
            Try as guest
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-8 pb-24">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="rounded-xl border border-[#1f1f2e] bg-[#111118] p-6">
            <div className="text-2xl mb-3">📐</div>
            <h3 className="text-base font-bold text-[#e2e2e8] mb-2">Smart templates</h3>
            <p className="text-sm text-[#6b7280] leading-relaxed">
              5 conference-ready layouts with discipline-specific palettes.
              APA, SfN, ECNP size presets built in.
            </p>
          </div>
          <div className="rounded-xl border border-[#1f1f2e] bg-[#111118] p-6">
            <div className="text-2xl mb-3">📊</div>
            <h3 className="text-base font-bold text-[#e2e2e8] mb-2">Figure readability</h3>
            <p className="text-sm text-[#6b7280] leading-relaxed">
              Paste your R or Python code. See if axis labels will be readable
              at print size. Get a copy-ready fix.
            </p>
          </div>
          <div className="rounded-xl border border-[#1f1f2e] bg-[#111118] p-6">
            <div className="text-2xl mb-3">✍️</div>
            <h3 className="text-base font-bold text-[#e2e2e8] mb-2">Writing guide</h3>
            <p className="text-sm text-[#6b7280] leading-relaxed">
              Section-by-section tips, word count targets, and a checklist
              to follow from intro to conclusion.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#1f1f2e] px-8 py-6 text-center text-sm text-[#555]">
        <div className="mb-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <Link to="/about" className="no-underline text-[#6b7280] hover:text-[#c8cad0]">
            About
          </Link>
          <Link to="/privacy" className="no-underline text-[#6b7280] hover:text-[#c8cad0]">
            Privacy
          </Link>
          <Link to="/terms" className="no-underline text-[#6b7280] hover:text-[#c8cad0]">
            Terms
          </Link>
          <Link to="/auth" className="no-underline text-[#6b7280] hover:text-[#c8cad0]">
            Sign in
          </Link>
        </div>
        Built for students and researchers.
      </footer>
    </main>
  );
}
