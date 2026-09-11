/**
 * Self-serve PACK refund — the owner's rule (2026-09-11): a pack is
 * refundable ONLY while none of its credits has been consumed. One paid
 * export → no refund, not even of the untouched credits. (A per-credit
 * proration would let a buyer take one CA$3.33 export and refund the
 * rest, so the rule is all-or-nothing, exactly like the term's.)
 *
 * Credits are one pooled counter (users.export_credits) — a consumed
 * credit cannot be attributed to a particular pack — so "nothing
 * consumed" means the balance still covers every credit the buyer's
 * not-yet-refunded packs granted. When it does, the MOST RECENT
 * unrefunded pack is refunded in full (no `amount` → Stripe refunds the
 * whole charge, so tax collected under Managed Payments goes back too)
 * and exactly that pack's credits are revoked. One pack per request: a
 * buyer holding two untouched packs asks twice.
 *
 * Externally initiated refunds (Stripe dashboard / Link) are NOT gated
 * here — billing/refundReconcile.ts reconciles whatever Stripe did.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { PACK_PRICE_CENTS, finiteCents, type RefundResult } from './constants.js';
import { recordRefundAndRevoke } from './refundLedger.js';

interface PackSession {
  session_id: string;
  credits_granted: number;
}

/**
 * Pure eligibility test. `grantedCredits` is the sum of credits_granted
 * over the buyer's unrefunded pack sessions; `remainingCredits` is
 * users.export_credits. Eligible iff nothing has been consumed, i.e. the
 * balance still covers everything granted (a surplus from an out-of-band
 * grant is never counted as usage). Exported for tests.
 */
export function packRefundEligible(args: {
  remainingCredits: number;
  grantedCredits: number;
}): { ok: true } | { ok: false; reason: string } {
  if (args.grantedCredits <= 0) return { ok: false, reason: 'no_pack_purchase' };
  if (args.remainingCredits < args.grantedCredits) return { ok: false, reason: 'already_used' };
  return { ok: true };
}

/**
 * Refund the buyer's most recent unrefunded pack in full, if — and only
 * if — no credit has been consumed from any of their packs.
 *
 * Idempotency keyed on the SESSION → one pack can only be refunded once
 * across double-clicks or a button-vs-webhook race (Stripe returns the
 * same refund for the same key); the ledger's UNIQUE(stripe_refund_id)
 * then dedups the revoke.
 */
export async function refundPack(
  supabase: SupabaseClient,
  stripe: Stripe,
  userId: string,
): Promise<RefundResult> {
  const remaining = await readRemainingCredits(supabase, userId);
  const packs = await listUnrefundedPacks(supabase, userId);
  const granted = packs.reduce((sum, p) => sum + p.credits_granted, 0);

  const eligible = packRefundEligible({ remainingCredits: remaining, grantedCredits: granted });
  if (!eligible.ok) return eligible;

  const pack = packs[0]!; // newest first
  const checkout = await stripe.checkout.sessions.retrieve(pack.session_id);
  const paymentIntentId =
    typeof checkout.payment_intent === 'string'
      ? checkout.payment_intent
      : checkout.payment_intent?.id;
  if (!paymentIntentId) return { ok: false, reason: 'no_payment' };

  const refund = await stripe.refunds.create(
    { payment_intent: paymentIntentId },
    { idempotencyKey: `pack-refund:${pack.session_id}` },
  );
  // Never a NaN/null amount in the ledger: what Stripe refunded, else what
  // the session charged, else the list price.
  const amountCents = finiteCents(refund.amount, checkout.amount_total, PACK_PRICE_CENTS);

  await recordRefundAndRevoke(supabase, {
    userId,
    kind: 'pack',
    refundId: refund.id,
    amountCents,
    creditsRevoked: pack.credits_granted,
    sessionId: pack.session_id,
  });
  return { ok: true, amountCents };
}

/** users.export_credits for the buyer (0 when the row is missing). */
async function readRemainingCredits(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('users')
    .select('export_credits')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(`pack refund: users read: ${error.message}`);
  const credits = (data as { export_credits?: number | null } | null)?.export_credits;
  return typeof credits === 'number' && Number.isFinite(credits) ? credits : 0;
}

/**
 * THIS user's pack sessions (credits_granted > 0 excludes term and
 * review rows), newest first, minus any already in the refund ledger.
 * Scoping to user_id is critical — without it this would pick the
 * globally-newest session of ANY user and refund the wrong person.
 */
async function listUnrefundedPacks(supabase: SupabaseClient, userId: string): Promise<PackSession[]> {
  const { data: refundedRows, error: refundedErr } = await supabase
    .from('billing_refunds')
    .select('session_id')
    .eq('user_id', userId)
    .not('session_id', 'is', null);
  if (refundedErr) throw new Error(`pack refund: ledger read: ${refundedErr.message}`);
  const refundedSessionIds = new Set(
    ((refundedRows as Array<{ session_id?: string | null }> | null) ?? [])
      .map((r) => r.session_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  );

  const { data: sessionRows, error: sessionsErr } = await supabase
    .from('billing_fulfilled_sessions')
    .select('session_id, credits_granted')
    .eq('user_id', userId)
    .gt('credits_granted', 0)
    .order('fulfilled_at', { ascending: false });
  if (sessionsErr) throw new Error(`pack refund: sessions read: ${sessionsErr.message}`);

  return ((sessionRows as Array<{ session_id?: string | null; credits_granted?: number | null }> | null) ?? [])
    .filter((s): s is { session_id: string; credits_granted: number } =>
      typeof s.session_id === 'string' && s.session_id.length > 0 && typeof s.credits_granted === 'number',
    )
    .filter((s) => !refundedSessionIds.has(s.session_id))
    .map((s) => ({ session_id: s.session_id, credits_granted: s.credits_granted }));
}
