/**
 * One-shot welcome-poster seeder.
 *
 * Every brand-new account (anonymous guest OR permanent signup)
 * lands on /dashboard with zero posters. Researchers without a
 * starting point often bounce — staring at "+ New blank poster"
 * with no example to riff on is a dead end. Seeding a playful
 * cat-themed sample poster gives them a complete poster they can
 * inspect, duplicate, gut, or just smile at.
 *
 * Mechanism:
 *   1. The .postr bundle lives at /seeds/welcome-cat-poster.postr
 *      (copied into apps/web/public/seeds/ at build time so it's
 *      served from the same CDN edge as index.html).
 *   2. On dashboard mount, after `listPosters()` returns, we
 *      check: did this user ever get seeded? Tracked via a
 *      localStorage flag keyed by userId so a deleted-everything
 *      user doesn't get re-seeded on their next visit.
 *   3. Mint a fresh posterId via `createPoster()`, then run the
 *      existing `importPostr()` flow against the bundle —
 *      uploads each asset to the user's storage prefix, rewrites
 *      bundle:// → storage:// in the doc, and returns the doc.
 *   4. `upsertPoster(posterId, ...)` writes the doc to the row.
 *   5. Set the flag.
 *
 * Failures are intentionally silent — the worst outcome is the
 * user sees their dashboard with one fewer poster than expected,
 * which is the exact pre-seed state. We never want a broken seed
 * to block a real signup.
 */
import { supabase } from '@/lib/supabase';
import { createPoster, upsertPoster } from './posters';
import { importPostr } from '@/import/postrFile';

const SEED_URL = '/seeds/welcome-cat-poster.postr';
const SEEDED_FLAG_PREFIX = 'postr.welcome-seeded:';

function readSeededFlag(userId: string): boolean {
  try {
    return localStorage.getItem(SEEDED_FLAG_PREFIX + userId) === '1';
  } catch {
    // Private mode — assume not seeded; we'll attempt and the
    // localStorage write at the end will silently fail. Safe.
    return false;
  }
}

function writeSeededFlag(userId: string): void {
  try {
    localStorage.setItem(SEEDED_FLAG_PREFIX + userId, '1');
  } catch {
    // best-effort — private mode users will simply re-seed if
    // they ever delete everything and revisit. Acceptable.
  }
}

interface SeedResult {
  posterId: string;
  title: string;
}

/**
 * Returns the new poster's row when seeding ran, or null when
 * skipped (already seeded for this user OR fetch / import
 * failed). Idempotent; safe to call on every mount.
 */
export async function seedWelcomePosterIfNeeded(
  existingPosterCount: number,
): Promise<SeedResult | null> {
  if (existingPosterCount > 0) return null;

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (userErr || !userId) return null;

  if (readSeededFlag(userId)) return null;

  try {
    const res = await fetch(SEED_URL, { cache: 'force-cache' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const file = new File([blob], 'welcome-cat-poster.postr', {
      type: 'application/zip',
    });

    const row = await createPoster();
    const result = await importPostr(file, row.id, userId);
    const title = result.title ?? 'Welcome — sample poster';
    await upsertPoster(row.id, {
      title,
      widthIn: result.doc.widthIn,
      heightIn: result.doc.heightIn,
      data: result.doc,
    });
    writeSeededFlag(userId);
    return { posterId: row.id, title };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[seedWelcomePoster] failed (non-fatal):', err);
    return null;
  }
}
