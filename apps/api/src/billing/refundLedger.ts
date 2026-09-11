/**
 * The billing_refunds ledger — the single idempotency gate for applying a
 * refund's side effects (revoke term access / remove credits).
 *
 * UNIQUE(stripe_refund_id): if the ledger already has this refund (the
 * charge.refunded / refund.* webhook beat the self-serve button, or vice
 * versa), the write is a no-op — no double-revoke. Shared by billing.ts
 * (self-serve refunds) and billing/refundReconcile.ts (external refunds).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RefundKind } from './constants.js';

export interface RefundRecord {
  userId: string;
  kind: RefundKind;
  refundId: string;
  amountCents: number;
  creditsRevoked: number;
  sessionId: string | null;
}

/**
 * Record a refund and apply its side effects EXACTLY ONCE.
 *
 * TERM: plan='free', plan_expires_at=now AND subscription_status=
 * 'canceled' in the SAME update (the caller has already cancelled the
 * Stripe subscription — see billing/termCancel.ts), keeping
 * stripe_subscription_id so later events for that sub still reconcile
 * (and are refused by the terminal-status guard).
 * PACK: the refunded credits are removed atomically by the RPC.
 *
 * Returns true when the side effects were applied, false when the refund
 * was already in the ledger.
 */
export async function recordRefundAndRevoke(
  supabase: SupabaseClient,
  r: RefundRecord,
): Promise<boolean> {
  const { error: insErr } = await supabase.from('billing_refunds').insert({
    user_id: r.userId,
    kind: r.kind,
    stripe_refund_id: r.refundId,
    amount_cents: r.amountCents,
    credits_revoked: r.creditsRevoked,
    session_id: r.sessionId,
  });
  if (insErr) {
    if (/duplicate key|unique/i.test(insErr.message)) return false; // already applied
    throw new Error(`refund ledger insert: ${insErr.message}`);
  }

  if (r.kind === 'term') {
    const { error } = await supabase
      .from('users')
      .update({
        plan: 'free',
        plan_expires_at: new Date().toISOString(),
        subscription_status: 'canceled',
      })
      .eq('id', r.userId);
    if (error) throw new Error(`term refund revoke: ${error.message}`);
    return true;
  }

  if (r.creditsRevoked > 0) {
    const { error } = await supabase.rpc(
      'revoke_export_credits' as never,
      { p_user_id: r.userId, p_amount: r.creditsRevoked } as never,
    );
    if (error) throw new Error(`pack refund revoke: ${error.message}`);
  }
  return true;
}
