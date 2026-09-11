/**
 * SubscriptionPanel — plan state + manage/upgrade, always shown on the
 * Profile page (free users see the plan state + a path to upgrade).
 * Managed Payments makes Link the merchant of record, so management
 * (cancel, update card, receipts) happens via the Stripe billing portal,
 * falling back to link.com.
 */
import { useState } from 'react';
import { Link } from 'react-router';
import type { PlanState } from '@/hooks/usePlan';
import { openBillingPortal, requestRefund } from '@/data/billing';

// ── SubscriptionPanel — plan state + manage/upgrade, always shown ──

export function SubscriptionPanel({ plan }: { plan: PlanState }) {
  const [opening, setOpening] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [refundMsg, setRefundMsg] = useState<string | null>(null);

  const handleManage = async () => {
    setOpening(true);
    // Prefer the Stripe portal (deep-links to their own subscription),
    // falling back to link.com — openBillingPortal never rejects.
    const url = await openBillingPortal();
    window.open(url, '_blank', 'noopener,noreferrer');
    setOpening(false);
  };

  // Request a refund. The server decides eligibility; we surface the
  // outcome. A generic message on failure per the house error rule, but the
  // specific 409 reasons are mapped to something actionable.
  const handleRefund = async (kind: 'term' | 'pack') => {
    setRefunding(true);
    setRefundMsg(null);
    try {
      const { amountCents, subscriptionCancelled } = await requestRefund(kind);
      const amount = `CA$${(amountCents / 100).toFixed(2)}`;
      setRefundMsg(
        subscriptionCancelled
          ? `Refunded ${amount} — it may take a few days to appear. Your term has been cancelled and PowerPoint/LaTeX export is locked again.`
          : `Refunded ${amount}. It may take a few days to appear.`,
      );
      // The server just changed the billing row (term → free, or fewer
      // credits): re-read so this panel drops to the matching state
      // instead of still offering "Request refund" on a cancelled term.
      await plan.refresh();
    } catch (err) {
      // Map known eligibility reasons; fall back to generic.
      const reason = (err as { body?: { error?: string } })?.body?.error;
      const map: Record<string, string> = {
        window_expired: 'The 14-day refund window has passed. You can cancel anytime to stop renewals.',
        already_used: 'This term isn’t refundable once you’ve taken a paid export.',
        no_unused_credits: 'You have no unused credits to refund.',
        no_pack_purchase: 'No refundable pack purchase found.',
      };
      setRefundMsg(reason && map[reason] ? map[reason] : 'We couldn’t process that refund. Please try again or contact support.');
    } finally {
      setRefunding(false);
    }
  };

  if (plan.loading) {
    return <p className="text-[14pt] text-[#8b8f99]">Loading your plan…</p>;
  }

  if (plan.hasActiveTerm) {
    return (
      <div className="space-y-3">
        <p className="text-[14pt] text-[#c8cad0]">
          Your term is active — PowerPoint and LaTeX export are unlocked, no
          watermark.
          {plan.subscriptionStatus === 'past_due' && (
            <span className="text-[#fbbf24]">
              {' '}There’s a payment issue on your latest renewal — update your
              card to keep your term.
            </span>
          )}
        </p>
        <p className="text-[14pt] text-[#8b8f99]">
          The term renews every 4 months. Manage it — update your card, see
          receipts, or cancel — through Stripe, which handles billing for Postr.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleManage}
            disabled={opening}
            className="rounded-md border border-[#2a2a3a] bg-[#111118] px-4 py-2 text-[14pt] font-medium text-[#c8cad0] hover:border-[#7c6aed] hover:text-[#fff] disabled:opacity-50"
          >
            {opening ? 'Opening…' : 'Manage subscription ↗'}
          </button>
          <button
            type="button"
            onClick={() => handleRefund('term')}
            disabled={refunding}
            className="rounded-md border border-[#2a2a3a] bg-transparent px-4 py-2 text-[14pt] font-medium text-[#9ca3af] hover:border-[#7c6aed] hover:text-[#fff] disabled:opacity-50"
          >
            {refunding ? 'Processing…' : 'Request refund'}
          </button>
        </div>
        <p className="text-[13pt] text-[#8b8f99]">
          Refundable in full within 14 days of your charge if you haven’t
          taken a paid export.
        </p>
        {refundMsg && <p className="text-[13pt] text-[#a3a7b3]">{refundMsg}</p>}
      </div>
    );
  }

  // No active term — the free state. Always show the export-credit balance
  // (0 if they never bought a pack, or the remaining count if they did —
  // credits never expire) and a "Get a subscription" CTA.
  const hasCredits = plan.credits > 0;
  return (
    <div className="space-y-3">
      <p className="text-[14pt] text-[#c8cad0]">
        You’re on the free plan — unlimited editing and print-ready PDF export,
        with a small “made with postr.sh” mark.
      </p>

      {/* Export-credit balance — shown even at 0 so the user always knows
          where they stand. Pack credits never expire. */}
      <div className="rounded-md border border-[#2a2a3a] bg-[#111118] px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[14pt] text-[#c8cad0]">Export credits</span>
          <span className="text-[18pt] font-bold text-[#e2e2e8]">
            {plan.credits}
          </span>
        </div>
        <p className="mt-1 text-[13pt] text-[#8b8f99]">
          {hasCredits
            ? `${plan.credits} PowerPoint or LaTeX export${plan.credits === 1 ? '' : 's'} left — credits never expire.`
            : 'From a $9.99 export pack. Credits never expire once purchased.'}
        </p>
        {refundMsg && !hasCredits && (
          <p className="mt-2 text-[13pt] text-[#a3a7b3]">{refundMsg}</p>
        )}
        {hasCredits && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => handleRefund('pack')}
              disabled={refunding}
              className="rounded-md border border-[#2a2a3a] bg-transparent px-3 py-1.5 text-[13pt] font-medium text-[#9ca3af] hover:border-[#7c6aed] hover:text-[#fff] disabled:opacity-50"
            >
              {refunding ? 'Processing…' : `Refund ${plan.credits} unused credit${plan.credits === 1 ? '' : 's'}`}
            </button>
            <p className="mt-1 text-[12pt] text-[#8b8f99]">
              CA$3.33 per unused credit. Refunding removes them from your account.
            </p>
            {refundMsg && <p className="mt-1 text-[13pt] text-[#a3a7b3]">{refundMsg}</p>}
          </div>
        )}
      </div>

      <p className="text-[14pt] text-[#8b8f99]">
        Unlock clean PowerPoint &amp; LaTeX export with the term, or a one-time
        export pack whose credits never expire.
      </p>
      <Link
        to="/pricing"
        className="inline-block rounded-md border border-[#7c6aed] bg-transparent px-4 py-2 text-[14pt] font-semibold text-[#7c6aed] no-underline hover:bg-[#5641b8] hover:text-white"
      >
        Get a subscription
      </Link>
    </div>
  );
}
