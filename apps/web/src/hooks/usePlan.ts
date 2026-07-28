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
}

const INITIAL: PlanState = {
  loading: true,
  hasActiveTerm: false,
  credits: 0,
  canExport: false,
};

interface BillingRow {
  plan?: string | null;
  plan_expires_at?: string | null;
  export_credits?: number | null;
}

function derive(row: BillingRow | null): Omit<PlanState, 'loading'> {
  const expires = row?.plan_expires_at ? new Date(row.plan_expires_at) : null;
  const hasActiveTerm =
    row?.plan === 'term' && expires !== null && expires.getTime() > Date.now();
  const credits = row?.export_credits ?? 0;
  return { hasActiveTerm, credits, canExport: hasActiveTerm || credits > 0 };
}

export function usePlan(): PlanState {
  const [state, setState] = useState<PlanState>(INITIAL);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        if (!cancelled) setState({ ...INITIAL, loading: false });
        return;
      }
      // `plan` / `plan_expires_at` / `export_credits` are newer than the
      // generated Database type in some builds; cast the projection.
      const { data } = await supabase
        .from('users')
        .select('plan, plan_expires_at, export_credits' as never)
        .eq('id', auth.user.id)
        .maybeSingle();
      if (cancelled) return;
      setState({ loading: false, ...derive(data as BillingRow | null) });
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
