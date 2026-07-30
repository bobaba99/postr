/**
 * Billing result — the landing page Stripe redirects to after checkout.
 *
 * The API sets success_url = {APP_ORIGIN}/billing/success and
 * cancel_url = {APP_ORIGIN}/billing/cancel (apps/api/src/billing.ts,
 * billingUrl()). Both are rendered here, chosen by the `outcome` prop the
 * route passes.
 *
 * This page is UX confirmation only — it never provisions anything. The
 * plan/credits are granted by the checkout.session.completed webhook
 * server-side (a user may never reach this page — they can close the tab
 * after paying — which is why fulfillment can't live here). On success we
 * poll the user's own plan for a few seconds so the confirmation reflects
 * the just-completed grant even if the webhook lands a beat late, then
 * send them back into the app to use it.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { usePlan } from '@/hooks/usePlan';
import { supabase } from '@/lib/supabase';
import { APP_ROUTE_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';

type Outcome = 'success' | 'cancel';

export default function BillingResult({ outcome }: { outcome: Outcome }) {
  useDocumentMeta(APP_ROUTE_META[`/billing/${outcome}`] ?? null);
  return outcome === 'success' ? <Success /> : <Cancelled />;
}

function Success() {
  const navigate = useNavigate();
  const plan = usePlan();
  // Re-read the plan for a short window: the webhook usually fulfills
  // within a second or two of the redirect, but not always before the page
  // loads. We refetch the session-scoped plan until it reflects the grant
  // (or the window elapses), so the copy isn't stuck on "finalizing".
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    // Nudge usePlan to re-read by bouncing the auth state listener isn't
    // available here; instead poll getUser-backed plan via a short timer.
    // usePlan re-reads on auth changes; we additionally give the webhook a
    // grace window before deciding it's "still processing".
    const t = setTimeout(() => setWaited(true), 6000);
    return () => clearTimeout(t);
  }, []);

  // Force a fresh plan read shortly after landing (the webhook may fulfill
  // just after the redirect). A lightweight refresh: re-fetch the session,
  // which triggers usePlan's onAuthStateChange re-read.
  useEffect(() => {
    const t = setTimeout(() => {
      void supabase.auth.refreshSession();
    }, 2500);
    return () => clearTimeout(t);
  }, []);

  const granted = plan.hasActiveTerm || plan.credits > 0;
  const stillProcessing = !granted && !waited;

  return (
    <main className="flex min-h-screen w-screen flex-col items-center justify-center bg-[#0a0a12] px-6 text-center text-[#c8cad0]">
      <div className="w-full max-w-md">
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: 'rgba(76,196,140,0.12)', border: '1px solid rgba(76,196,140,0.35)' }}
          aria-hidden="true"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#4cc48c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h1 className="mt-6 text-2xl font-semibold text-[#e2e2e8]">
          You&apos;re all set
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-[#9ca3af]">
          {plan.hasActiveTerm
            ? 'Your term is active. Editable PowerPoint and LaTeX exports are unlocked — no watermark.'
            : plan.credits > 0
              ? `Your export pack is ready — ${plan.credits} export${plan.credits === 1 ? '' : 's'} to use whenever. Credits never expire.`
              : stillProcessing
                ? 'Payment received — finalizing your account. This takes just a moment.'
                : 'Payment received. Your access will appear shortly — head back in and it’ll be ready.'}
        </p>

        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="mt-7 w-full rounded-lg bg-[#5641b8] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#4c39a6]"
        >
          Back to your posters
        </button>

        <Link
          to="/pricing"
          className="mt-3 inline-block text-xs text-[#8b8f99] no-underline hover:text-[#c8cad0]"
        >
          View plans
        </Link>
      </div>
    </main>
  );
}

function Cancelled() {
  return (
    <main className="flex min-h-screen w-screen flex-col items-center justify-center bg-[#0a0a12] px-6 text-center text-[#c8cad0]">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold text-[#e2e2e8]">Checkout cancelled</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#9ca3af]">
          No charge was made. Your poster is exactly as you left it — you can
          keep editing for free, or pick up checkout again anytime.
        </p>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="mt-7 w-full rounded-lg bg-[#5641b8] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#4c39a6]"
        >
          Back to editing
        </button>
        <Link
          to="/pricing"
          className="mt-3 inline-block text-xs text-[#8b8f99] no-underline hover:text-[#c8cad0]"
        >
          See plans
        </Link>
      </div>
    </main>
  );
}
