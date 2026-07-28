/**
 * Product-research email consent — read and write the user's opt-in.
 *
 * Consent is USER-OWNED state (GDPR Art. 6(1)(a)): the owner's own
 * `users_update_own` RLS policy writes it, unlike `plan`, which is
 * webhook-only. Opting in stamps a timestamp; withdrawing sets it back
 * to null. null = no consent = the default (the column has no DB
 * default), so a fresh account is opted OUT.
 *
 * The outreach itself (sending the email) is a separate, unbuilt
 * feature; it must select only rows where `research_consent_at` is set.
 *
 * `research_consent_at` is newer than the generated `Database` type, so
 * the column name and results are cast narrowly — the same `as never`
 * pattern the RPC calls in Profile use. Regenerate the types after the
 * migration applies and these casts can be dropped.
 */
import { supabase } from '@/lib/supabase';

/** Read the current consent state for a user. Returns false on any
 *  read failure (a flaky read must not look like consent). */
export async function getResearchConsent(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('users')
    .select('research_consent_at' as never)
    .eq('id', userId)
    .maybeSingle();
  const at = (data as { research_consent_at?: string | null } | null)
    ?.research_consent_at;
  return !!at;
}

/**
 * Set or clear consent. `on` → stamp now; `off` → null.
 *
 * @param nowIso injectable timestamp so tests are deterministic;
 *   defaults to the real current time.
 * @returns true on success, false if the write failed (caller reverts).
 */
export async function setResearchConsent(
  userId: string,
  on: boolean,
  nowIso: string = new Date().toISOString(),
): Promise<boolean> {
  const { error } = await supabase
    .from('users')
    .update({ research_consent_at: on ? nowIso : null } as never)
    .eq('id', userId);
  return !error;
}
