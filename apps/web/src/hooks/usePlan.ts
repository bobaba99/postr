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
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface PlanState {
  loading: boolean;
  /** True while a paid term is active. */
  hasActiveTerm: boolean;
  /** Remaining consumable export credits from the pack. */
  credits: number;
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
}

const INITIAL: PlanState = {
  loading: true,
  hasActiveTerm: false,
  credits: 0,
  canExport: false,
  isGuest: true,
  subscriptionStatus: null,
};

interface BillingRow {
  plan?: string | null;
  plan_expires_at?: string | null;
  export_credits?: number | null;
  subscription_status?: string | null;
}

/** The billing-derived slice of PlanState (everything except loading/isGuest,
 *  which come from the auth check, not the billing row). */
type BillingDerived = Pick<
  PlanState,
  'hasActiveTerm' | 'credits' | 'canExport' | 'subscriptionStatus'
>;

function derive(row: BillingRow | null): BillingDerived {
  const expires = row?.plan_expires_at ? new Date(row.plan_expires_at) : null;
  const hasActiveTerm =
    row?.plan === 'term' && expires !== null && expires.getTime() > Date.now();
  const credits = row?.export_credits ?? 0;
  return {
    hasActiveTerm,
    credits,
    canExport: hasActiveTerm || credits > 0,
    subscriptionStatus: row?.subscription_status ?? null,
  };
}

export function usePlan(): PlanState {
  const [state, setState] = useState<PlanState>(INITIAL);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        // No session at all — treated as a guest for paywall routing.
        if (!cancelled) setState({ ...INITIAL, loading: false, isGuest: true });
        return;
      }
      const isGuest = auth.user.is_anonymous === true;
      // `plan` / `plan_expires_at` / `export_credits` are newer than the
      // generated Database type in some builds; cast the projection.
      const { data } = await supabase
        .from('users')
        .select('plan, plan_expires_at, export_credits, subscription_status' as never)
        .eq('id', auth.user.id)
        .maybeSingle();
      if (cancelled) return;
      setState({
        loading: false,
        ...derive(data as BillingRow | null),
        isGuest,
      });
    }

    void load();

    // Re-read on auth changes (sign-in after checkout, guest→permanent).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void load();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}
