/**
 * Paper-to-talk waitlist — join / check.
 *
 * Captures interest in the deferred paper-to-talk feature. A signed-in
 * user joins with one row (owner-managed via RLS). The email is
 * denormalised from their account so the eventual notify query needs no
 * join. See supabase migration 20260728160000_talk_waitlist.sql and
 * docs/plans/2026-07-28-paper-to-talk.md.
 */
import { supabase } from '@/lib/supabase';

/** True if the current user has already joined the talk waitlist. */
export async function isOnTalkWaitlist(): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;
  const { data } = await supabase
    .from('talk_waitlist')
    .select('user_id' as never)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  return !!data;
}

/**
 * Join the talk waitlist. Idempotent — a second join is a no-op (the
 * primary key upsert keeps the original joined_at). Returns true on
 * success, false if there's no signed-in user to attach the row to.
 */
export async function joinTalkWaitlist(): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;
  const { error } = await supabase.from('talk_waitlist').upsert(
    {
      user_id: auth.user.id,
      email: auth.user.email ?? null,
    } as never,
    { onConflict: 'user_id', ignoreDuplicates: true },
  );
  return !error;
}
