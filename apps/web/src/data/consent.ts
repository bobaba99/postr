/**
 * Signup consent — research + marketing opt-in, captured at account
 * creation and manageable later in Profile.
 *
 * Both consents are USER-OWNED state (GDPR Art. 6(1)(a)): the owner's own
 * `users_update_own` RLS policy writes them, unlike `plan` (webhook-only).
 * Opting in stamps a timestamp; withdrawing sets it to null. null = no
 * consent = the default (the columns have no DB default), so a fresh
 * account is opted OUT of both.
 *
 * Defaults are UNCHECKED for everyone — a set timestamp is therefore a
 * positive, affirmative opt-in, which is what GDPR (valid consent, per
 * Planet49) and CASL (express consent, sender bears the burden of proof)
 * require. We deliberately do NOT pre-tick or geo-detect: pre-ticked boxes
 * are invalid consent, and client-side geo is too unreliable to bet
 * compliance on.
 *
 * The columns are newer than the generated `Database` type, so names and
 * results are cast narrowly (`as never`) — the same pattern as
 * researchConsent.ts. Regenerate types after the migrations apply and the
 * casts can be dropped.
 */
import { supabase } from '@/lib/supabase';

/** The two consent purposes captured at signup. */
export interface ConsentChoice {
  research: boolean;
  marketing: boolean;
}

/** Both consents start OFF — nobody is opted in by default. */
export const NO_CONSENT: ConsentChoice = { research: false, marketing: false };

const STORAGE_KEY = 'postr.signupConsent';

/**
 * Stash the signup consent choice across an OAuth round-trip (the Google
 * redirect drops React state). Only meaningful when the user opted INTO
 * something — if they leave both unchecked, an absent stash correctly
 * reads back as no consent, so a lost stash can never fabricate consent.
 */
export function stashSignupConsent(choice: ConsentChoice): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // Storage unavailable — worst case the opt-in isn't recorded, which is
    // the safe failure (never records consent the user didn't give).
  }
}

/** Read a stashed choice; defaults to NO_CONSENT when absent/unparseable. */
export function readStashedSignupConsent(): ConsentChoice {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return NO_CONSENT;
    const parsed = JSON.parse(raw) as Partial<ConsentChoice>;
    return {
      research: parsed.research === true,
      marketing: parsed.marketing === true,
    };
  } catch {
    return NO_CONSENT;
  }
}

/** Clear the stash once consumed (or on abandonment). */
export function clearStashedSignupConsent(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

interface ConsentRow {
  research_consent_at?: string | null;
  marketing_consent_at?: string | null;
}

/** Read a user's current consent state. Any read failure reads as no
 *  consent (a flaky read must never look like consent). */
export async function getConsent(userId: string): Promise<ConsentChoice> {
  const { data } = await supabase
    .from('users')
    .select('research_consent_at, marketing_consent_at' as never)
    .eq('id', userId)
    .maybeSingle();
  const row = data as ConsentRow | null;
  return {
    research: !!row?.research_consent_at,
    marketing: !!row?.marketing_consent_at,
  };
}

/**
 * Write a NEW account's signup consent — sets the timestamp for each
 * purpose the user opted into, leaves the other null. ONLY writes columns
 * whose desired state differs from what's stored, so it never disturbs a
 * value already set (and re-running is a no-op). Never call this to
 * "reset" a returning user — it's for the new-account write and the
 * Profile toggles, both of which pass the user's actual choice.
 *
 * @param nowIso injectable for deterministic tests.
 * @returns true on success (or nothing to write), false on a write error.
 */
export async function writeConsent(
  userId: string,
  desired: ConsentChoice,
  nowIso: string = new Date().toISOString(),
): Promise<boolean> {
  const current = await getConsent(userId);
  const patch: ConsentRow = {};
  if (desired.research !== current.research) {
    patch.research_consent_at = desired.research ? nowIso : null;
  }
  if (desired.marketing !== current.marketing) {
    patch.marketing_consent_at = desired.marketing ? nowIso : null;
  }
  // Nothing changed — no write needed.
  if (Object.keys(patch).length === 0) return true;

  const { error } = await supabase
    .from('users')
    .update(patch as never)
    .eq('id', userId);
  return !error;
}
