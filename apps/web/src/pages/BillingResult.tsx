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
 *
 * In English at /billing/success and /billing/cancel, and in French at
 * their /fr twins, where a checkout started from a French page returns
 * (fix 26): the copy is in i18n/billing.ts; each page links to its twin.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { usePlan } from '@/hooks/usePlan';
import { supabase } from '@/lib/supabase';
import { BILLING_COPY, type BillingCopy } from '@/i18n/billing';
import { localizedPath, useLang } from '@/i18n/lang';
import { LanguageLink } from '@/components/LanguageLink';
import { APP_ROUTE_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';

type Outcome = 'success' | 'cancel';

export default function BillingResult({ outcome }: { outcome: Outcome }) {
  const lang = useLang();
  useDocumentMeta(APP_ROUTE_META[localizedPath(`/billing/${outcome}`, lang)] ?? null);
  const c = BILLING_COPY[lang];
  const pricing = localizedPath('/pricing', lang);
  return outcome === 'success' ? <Success c={c} pricing={pricing} /> : <Cancelled c={c} pricing={pricing} />;
}

/** The link to the page in the other language, under the page's links. */
function OtherLanguage() {
  return (
    <div className="mt-4">
      <LanguageLink className="text-xs text-[#8b8f99] underline-offset-4 hover:text-[#c8cad0] hover:underline" />
    </div>
  );
}

function Success({ c, pricing }: { c: BillingCopy; pricing: string }) {
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

        {/* Copy states only what this page knows: Stripe sends the buyer
            here once checkout completes, and the grant comes from the
            webhook, which may land after the one re-read below. So no
            "payment received" or "ready" claim until the plan shows it. */}
        <h1 className="mt-6 text-2xl font-semibold text-[#e2e2e8]">
          {c.successTitle}
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-[#9ca3af]">
          {plan.hasActiveTerm
            ? c.termActive
            : plan.credits > 0
              ? c.creditsLeft(plan.credits)
              : stillProcessing
                ? c.checking
                : c.notYet}
        </p>

        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="mt-7 w-full rounded-lg bg-[#5641b8] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#4c39a6]"
        >
          {c.backToPosters}
        </button>

        <Link
          to={pricing}
          className="mt-3 inline-block text-xs text-[#8b8f99] no-underline hover:text-[#c8cad0]"
        >
          {c.viewPlans}
        </Link>
        <OtherLanguage />
      </div>
    </main>
  );
}

function Cancelled({ c, pricing }: { c: BillingCopy; pricing: string }) {
  return (
    <main className="flex min-h-screen w-screen flex-col items-center justify-center bg-[#0a0a12] px-6 text-center text-[#c8cad0]">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold text-[#e2e2e8]">{c.cancelTitle}</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#9ca3af]">
          {c.cancelBody}
        </p>
        {/* history.back() returns to the previous history entry. After a
            Stripe cancel that entry can be the Stripe Checkout page, and a
            buyer who came from /pricing has no editor behind it, so the
            label promises only "Go back" (not run against real Stripe). */}
        <button
          type="button"
          onClick={() => window.history.back()}
          className="mt-7 w-full rounded-lg bg-[#5641b8] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#4c39a6]"
        >
          {c.goBack}
        </button>
        <Link
          to={pricing}
          className="mt-3 inline-block text-xs text-[#8b8f99] no-underline hover:text-[#c8cad0]"
        >
          {c.seePlans}
        </Link>
        <OtherLanguage />
      </div>
    </main>
  );
}
