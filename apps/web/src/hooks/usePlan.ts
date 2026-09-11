/**
 * usePlan — the signed-in user's billing entitlement.
 *
 * Reads the server-owned billing columns from the user's own row (RLS
 * lets them SELECT their own row; the DB trigger prevents them WRITING
 * these columns — only the Stripe webhook does). The client trusts this
 * for the UI, but enforcement that actually matters (the paywall) is a
 * decision the export code makes; a user flipping this in devtools only
 * fools their own browser, and the exports run client-side anyway — the
 * accepted launch posture (docs/plans/2026-07-28-payment-and-paywall.md
 * §3.1: UI-gate now, server-gate only if leakage is ever observed).
 *
 * Entitlement:
 *   - `term`   active while `plan_expires_at` is in the future.
 *   - `credits` a consumable count from the $9.99 pack.
 *   - `canExport` = active term OR credits > 0 → editable exports unlock
 *     and the watermark drops.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface PlanState {
  loading: boolean;
  /** True while a paid term is active. */
  hasActiveTerm: boolean;
  /** Remaining consumable export credits from the pack. */
  credits: number;
  /** Remaining review credits from the review pack. Never expire (§5.3). */
  reviewCredits: number;
  /** Whether the weekly review add-on rides on the user's subscription. */
  hasReviewAddon: boolean;
  /**
   * True if the user may run a review right now (mirrors D4's
   * server-side resolution): an active term WITH the review add-on
   * (weekly window), or at least one review credit. The follow-up is
   * included in the initial credit — it never needs a second one.
   */
  canReview: boolean;
  /**
   * True if the user may take a clean editable export right now — an
   * active term (unlimited) or at least one credit. Drives both the
   * export-button unlock and watermark removal.
   */
  canExport: boolean;
  /**
   * True when there is no session at all, OR the session is anonymous
   * (a guest). A guest CANNOT check out — the create-checkout route
   * requires a permanent account — so the paywall must route them to
   * account creation first, not straight to Stripe.
   */
  isGuest: boolean;
  /**
   * Mirror of the Stripe subscription status for the recurring term
   * (active | trialing | past_due | canceled | ... | null). Access is
   * gated on hasActiveTerm (which already reflects plan + expiry, forced
   * to free by the webhook when the sub goes terminal); this is exposed
   * for copy that distinguishes states (e.g. "renews soon", "payment
   * issue"). Null when the user never subscribed.
   */
  subscriptionStatus: string | null;
  /**
   * Re-read the billing row on demand (after a checkout return, a
   * refund, or any time the caller knows the server changed it).
   * Resolves with the fresh snapshot so a handler that already holds a
   * stale `plan` in its closure can decide on the new state at once.
   */
  refresh: () => Promise<PlanSnapshot>;
  /**
   * Fold a server-returned credit balance into local state without a
   * round-trip — the consume-credit route answers with the remaining
   * count, so the Export tab can decrement immediately (H-8). Clamped at
   * zero; canExport is re-derived so the paywall rises at 0.
   */
  applyCredits: (credits: number) => void;
}

/** The data half of PlanState — everything the hook derives, minus the
 *  two stable callbacks it returns alongside. */
/** The data half of PlanState — what `refresh()` resolves with. */
export type PlanSnapshot = Omit<PlanState, 'refresh' | 'applyCredits'>;
type PlanData = PlanSnapshot;

const INITIAL: PlanData = {
  loading: true,
  hasActiveTerm: false,
  credits: 0,
  reviewCredits: 0,
  hasReviewAddon: false,
  canReview: false,
  canExport: false,
  isGuest: true,
  subscriptionStatus: null,
};

interface BillingRow {
  plan?: string | null;
  plan_expires_at?: string | null;
  export_credits?: number | null;
  review_credits?: number | null;
  review_addon?: boolean | null;
  subscription_status?: string | null;
}

/** The billing-derived slice of PlanState (everything except loading/isGuest,
 *  which come from the auth check, not the billing row). */
type BillingDerived = Pick<
  PlanState,
  | 'hasActiveTerm'
  | 'credits'
  | 'reviewCredits'
  | 'hasReviewAddon'
  | 'canReview'
  | 'canExport'
  | 'subscriptionStatus'
>;

function derive(row: BillingRow | null): BillingDerived {
  const expires = row?.plan_expires_at ? new Date(row.plan_expires_at) : null;
  const hasActiveTerm =
    row?.plan === 'term' && expires !== null && expires.getTime() > Date.now();
  const credits = row?.export_credits ?? 0;
  const reviewCredits = row?.review_credits ?? 0;
  const hasReviewAddon = row?.review_addon === true;
  return {
    hasActiveTerm,
    credits,
    reviewCredits,
    hasReviewAddon,
    // D4 client mirror: add-on path needs the term active; the pack path
    // needs a credit. The server re-resolves this authoritatively.
    canReview: (hasReviewAddon && hasActiveTerm) || reviewCredits > 0,
    canExport: hasActiveTerm || credits > 0,
    subscriptionStatus: row?.subscription_status ?? null,
  };
}

/** Read the signed-in user's billing row and derive the plan data. */
async function fetchPlan(): Promise<PlanData> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    // No session at all — treated as a guest for paywall routing.
    return { ...INITIAL, loading: false, isGuest: true };
  }
  const isGuest = auth.user.is_anonymous === true;
  // `plan` / `plan_expires_at` / `export_credits` are newer than the
  // generated Database type in some builds; cast the projection.
  const { data } = await supabase
    .from('users')
    .select(
      'plan, plan_expires_at, export_credits, review_credits, review_addon, subscription_status' as never,
    )
    .eq('id', auth.user.id)
    .maybeSingle();
  return {
    loading: false,
    ...derive(data as BillingRow | null),
    isGuest,
  };
}

export function usePlan(): PlanState {
  const [data, setData] = useState<PlanData>(INITIAL);
  // Guards state writes from a fetch that resolves after unmount.
  const alive = useRef(true);

  const refresh = useCallback(async (): Promise<PlanSnapshot> => {
    const next = await fetchPlan();
    if (alive.current) setData(next);
    return next;
  }, []);

  const applyCredits = useCallback((credits: number) => {
    const clamped = Math.max(0, Math.floor(credits));
    setData((prev) => ({
      ...prev,
      credits: clamped,
      canExport: prev.hasActiveTerm || clamped > 0,
    }));
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();

    // Re-read on auth changes (sign-in after checkout, guest→permanent).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });

    return () => {
      alive.current = false;
      subscription.unsubscribe();
    };
  }, [refresh]);

  return useMemo(
    () => ({ ...data, refresh, applyCredits }),
    [data, refresh, applyCredits],
  );
}
