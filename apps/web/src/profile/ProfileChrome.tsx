/**
 * Profile page chrome — the sticky header and the titled card section
 * every settings block sits in. Split out of Profile.tsx so the page
 * stays under the file-size ceiling.
 */
import { Link } from 'react-router';

export function ProfileHeader() {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[#1f1f2e] bg-[#0a0a12]/95 px-8 py-5 backdrop-blur">
      <Link to="/dashboard" className="flex items-center gap-3 text-xl font-semibold tracking-tight text-[#c8cad0] no-underline hover:text-white">
        <svg width="28" height="28" viewBox="0 0 64 64" fill="none">
          <rect width="64" height="64" rx="12" fill="#7c6aed" />
          <path d="M12 52 C30 52, 34 12, 52 12" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.95" />
          <path d="M12 12 C30 12, 34 52, 52 52" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.55" />
          <circle cx="32" cy="32" r="6" fill="white" />
        </svg>
        Postr
      </Link>
      <Link to="/dashboard" className="text-sm text-[#8b8f99] no-underline hover:text-[#c8cad0]">
        ← Back to posters
      </Link>
    </header>
  );
}

export function Section({
  title,
  children,
  danger,
}: {
  title: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <section className="flex flex-col">
      <h2
        className={`mb-3 text-[12pt] font-semibold uppercase tracking-widest ${
          danger ? 'text-[#f87171]' : 'text-[#8b8f99]'
        }`}
      >
        {title}
      </h2>
      <div
        className={`flex-1 rounded-xl border ${
          danger ? 'border-[#f87171]/30' : 'border-[#1f1f2e]'
        } bg-[#111118] p-5`}
      >
        {children}
      </div>
    </section>
  );
}
