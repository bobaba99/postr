/**
 * convertGuest — turn the current ANONYMOUS session into a permanent
 * account IN PLACE, so the guest's posters carry over.
 *
 * Google → linkIdentity (instant on return, no email gap).
 * Email  → updateUser (email_change; the user stays anonymous until
 *          they click the confirmation link → pendingConfirmation).
 *
 * NEVER signUp / signInWithOAuth for a guest: those start a new user
 * and orphan the guest's work. Both helpers re-read the session and
 * refuse if it is not anonymous — the authoritative guard, unbeatable
 * by state-ordering races (mirrors Auth.tsx).
 */
import { supabase } from '@/lib/supabase';

async function assertAnonymous(): Promise<Error | null> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user.is_anonymous === true) return null;
  return new Error('convertGuest called without an anonymous session');
}

export async function convertGuestWithGoogle(
  redirectTo: string,
): Promise<{ error: Error | null }> {
  const guard = await assertAnonymous();
  if (guard) return { error: guard };
  const { error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: { redirectTo },
  });
  return { error: error ?? null };
}

export async function convertGuestWithEmail(
  email: string,
  password: string,
  emailRedirectTo: string,
): Promise<{ pendingConfirmation: boolean; error: Error | null }> {
  const guard = await assertAnonymous();
  if (guard) return { pendingConfirmation: false, error: guard };
  const { data, error } = await supabase.auth.updateUser(
    { email: email.trim(), password },
    { emailRedirectTo },
  );
  if (error) return { pendingConfirmation: false, error };
  // updateUser returns { user }; still-anonymous means confirmation pending.
  const stillAnon = data?.user?.is_anonymous !== false;
  return { pendingConfirmation: stillAnon, error: null };
}
