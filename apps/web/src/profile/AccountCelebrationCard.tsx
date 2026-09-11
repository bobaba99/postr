/**
 * AccountCelebrationCard — the stats-style intro card at the top of the
 * Profile page. Also the one place that shows a PENDING email change:
 * a guest who converted by email stays anonymous until they click the
 * confirmation link, and Supabase parks the address in `user.new_email`
 * meanwhile (H-6) — surfaced here as "Confirmation pending".
 */
import type { User } from '@supabase/supabase-js';

export function AccountCelebrationCard({
  email,
  createdAt,
  posterCount,
  user,
}: {
  email: string | null;
  createdAt: string;
  posterCount: number;
  user: User | null;
}) {
  // Days since the account was created — used for the supporting
  // "crafting for N days" line. Guests usually see 0 or 1.
  const daysActive = (() => {
    if (!user?.created_at) return 0;
    const ms = Date.now() - new Date(user.created_at).getTime();
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  })();

  const message = (() => {
    if (posterCount === 0)
      return 'Your canvas is waiting — start your first poster! ✨';
    if (posterCount === 1) return 'Welcome to the club! 🎉';
    if (posterCount <= 3) return "You're getting the hang of it! 🌱";
    if (posterCount <= 7) return "You're on a roll! 🚀";
    if (posterCount <= 15) return 'Power user in training ⚡';
    return 'Certified poster pro 🏆';
  })();

  const label = posterCount === 1 ? 'poster crafted' : 'posters crafted';
  const pendingEmail = user?.new_email ?? null;

  return (
    <section className="flex flex-col">
      <h2 className="mb-3 text-[12pt] font-semibold uppercase tracking-widest text-[#8b8f99]">
        Account
      </h2>
      <div
        className="relative flex-1 overflow-hidden rounded-xl border border-[#7c6aed]/30 bg-gradient-to-br from-[#1a1530] via-[#15131f] to-[#111118] p-6"
      >
        {/* Decorative sparkle blobs in the background */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(124,106,237,0.25) 0%, rgba(124,106,237,0) 70%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(162,89,247,0.18) 0%, rgba(162,89,247,0) 70%)',
          }}
        />

        <div className="relative flex items-baseline gap-3">
          <span
            className="font-bold leading-none text-[#c9bfff]"
            style={{ fontSize: '72px', letterSpacing: '-0.02em' }}
          >
            {posterCount}
          </span>
          <span className="text-[14pt] text-[#c8cad0]">{label}</span>
        </div>

        <div className="relative mt-3 text-[14pt] font-medium text-[#e2e2e8]">
          {message}
        </div>

        <div className="relative mt-5 space-y-1.5 text-[14pt] leading-relaxed text-[#9ca3af]">
          <div>
            <span className="text-[#8b8f99]">📧 </span>
            {email ?? 'Guest (no email linked yet)'}
          </div>
          {pendingEmail && (
            <div>
              <span className="text-[#8b8f99]">⏳ </span>
              <span className="text-[#fbbf24]">Confirmation pending</span>
              <span className="text-[#8b8f99]"> · {pendingEmail}</span>
            </div>
          )}
          <div>
            <span className="text-[#8b8f99]">📅 </span>
            Member since {createdAt}
            {daysActive > 0 && (
              <span className="text-[#8b8f99]"> · {daysActive}d</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
