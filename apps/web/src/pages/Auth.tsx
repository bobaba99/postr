/**
 * Auth page — sign up, sign in, or continue as guest.
 *
 * Three paths:
 *   1. Sign in with Google (OAuth)
 *   2. Sign up with email + password
 *   3. Continue as guest (anonymous Supabase session)
 *
 * After auth it redirects to /dashboard — UNLESS a paid checkout intent
 * is present (?plan=term|pack, from a pricing CTA). In that case this is
 * the account-first checkout flow: the user gets a REAL account (guest is
 * suppressed — a paid entitlement must not hang off a throwaway anonymous
 * session) and is then handed straight to Stripe for the chosen plan. The
 * intent survives the Google OAuth round-trip via sessionStorage (see
 * data/checkoutIntent.ts). Guest accounts can be linked later from the
 * Profile page — Supabase auto-merges data when identities are linked.
 *
 * Duplicate-term guard (P0-2): the term is a recurring subscription. A
 * signed-in user who already holds an ACTIVE term must not be handed to
 * Stripe for a second one — the auto-checkout waits for usePlan, skips
 * when hasActiveTerm, and the banner says so. If the API still answers
 * 409 already_subscribed (a stale client), the same friendly message is
 * shown rather than the generic checkout failure.
 *
 * In English at /auth and in French at /auth/fr, query kept (fix 26):
 * the copy is in i18n/auth.ts. A French visitor's checkout opens in French
 * (createCheckout's `lang`). Supabase sends a French e-mail sign-up's
 * confirmation back to /auth/fr (with ?plan= when there is one); a French
 * Google sign-in comes back to /auth/fr?plan= only when a plan is being
 * bought, and to /dashboard otherwise, as the English page does.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { supabase } from '@/lib/supabase';
import { PasswordStrength, isPasswordValid } from '@/components/PasswordStrength';
import { APP_ROUTE_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';
import {
  resolveCheckoutPlan,
  parseCheckoutPlan,
  stashCheckoutIntent,
  clearCheckoutIntent,
  startCheckoutForPlan,
  type CheckoutPlan,
} from '@/data/checkoutIntent';
import {
  writeConsent,
  stashSignupConsent,
  readStashedSignupConsent,
  clearStashedSignupConsent,
  type ConsentChoice,
} from '@/data/consent';
import { isAlreadySubscribedError } from '@/data/billing';
import { refundLineFor } from '@/data/refundCopy';
import { usePlan } from '@/hooks/usePlan';
import { AUTH_COPY } from '@/i18n/auth';
import { HTML_LANG, localizedPath, useLang, type Lang } from '@/i18n/lang';
import { LanguageLink } from '@/components/LanguageLink';

type Mode = 'signin' | 'signup';

/**
 * A Supabase auth error as the page shows it. English: Supabase's own
 * message, as before. French: Supabase writes only English, so a code the
 * French copy knows gets its French line and any other the generic one.
 */
function authErrorMessage(err: { message: string; code?: string }, lang: Lang): string {
  if (lang === 'en') return err.message;
  const errors = AUTH_COPY.fr.authErrors;
  return err.code && err.code in errors ? errors[err.code as keyof typeof errors] : errors.generic;
}

export default function Auth() {
  const lang = useLang();
  const c = AUTH_COPY[lang];
  // The page's own address in its language: where Supabase sends an e-mail
  // sign-up's confirmation, and a Google sign-in that is buying a plan, so
  // it lands in French (a Google sign-in with no plan goes to /dashboard).
  const authPath = localizedPath('/auth', lang);
  useDocumentMeta(APP_ROUTE_META[authPath] ?? null);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // A paid checkout intent (from a pricing CTA) turns this page into the
  // account-first checkout step: URL ?plan= wins, else a stash left before
  // an OAuth round-trip. When set, guest is suppressed and signup leads.
  // Memoised so it's a stable value across renders (resolveCheckoutPlan
  // touches sessionStorage) and safe to read from effects.
  const planParam = searchParams.get('plan');
  const checkoutPlan = useMemo(
    () => resolveCheckoutPlan(planParam),
    [planParam],
  );
  // Whether the intent came from the URL this visit — used to decide if a
  // failed/abandoned checkout should clear the stash (a stash with no URL
  // param backing it, e.g. the email-confirm return, must be preserved).
  const intentFromUrl = parseCheckoutPlan(planParam) !== null;

  const [mode, setMode] = useState<Mode>(checkoutPlan ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState(false);
  // Whether the current session is an anonymous GUEST. When true, the signup
  // path must CONVERT the guest in place (updateUser / linkIdentity) so their
  // posters carry over — NOT signUp, which would create a separate new user
  // and orphan the guest's work. See project_guest_to_permanent_conversion.
  const [isAnonGuest, setIsAnonGuest] = useState(false);
  // Signup consent — both OFF by default (affirmative opt-in only, valid
  // under GDPR + CASL; we never pre-tick). Captured on any new-account
  // path; a returning sign-in never touches consent.
  const [researchOptIn, setResearchOptIn] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  // True while we're minting a Stripe session and redirecting off-site, so
  // the UI shows "Continuing to checkout…" rather than looking idle.
  const [checkingOut, setCheckingOut] = useState(false);
  // Guards checkout kickoff to exactly once. The already-authenticated
  // effect can run more than once (StrictMode double-invoke, or a re-render
  // before the redirect commits); without this, a signed-in user could mint
  // two Stripe sessions and race two redirects.
  const checkoutStartedRef = useRef(false);
  // Whether the visitor arrived already holding a PERMANENT session (null
  // until the session check resolves). Feeds the auto-checkout effect,
  // which also has to wait for the plan read below.
  const [permanentSession, setPermanentSession] = useState<boolean | null>(null);
  // The signed-in user's entitlement — gates the term intent (P0-2).
  const plan = usePlan();
  const termAlreadyActive =
    checkoutPlan === 'term' && !plan.loading && plan.hasActiveTerm;
  // The refund rule for the plan about to be sold, under the plan label —
  // in front of the buyer BEFORE checkout (owner rule, 2026-09-11).
  const refundLine = checkoutPlan ? refundLineFor(checkoutPlan, lang) : null;

  /**
   * Record a NEW account's signup consent from the given choice. Best-
   * effort: consent capture must never block or fail the signup — a write
   * error is logged, not surfaced. writeConsent only sets the opted-in
   * columns (both default OFF), so this can't fabricate consent. Reads the
   * live session for the user id so it works on whichever path just created
   * the account.
   */
  const recordSignupConsent = useCallback(async (choice: ConsentChoice) => {
    // No opt-in at all → nothing to write, skip the round-trip.
    if (!choice.research && !choice.marketing) return;
    try {
      const { data } = await supabase.auth.getUser();
      if (data.user) await writeConsent(data.user.id, choice);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[consent] failed to record signup consent:', err);
    }
  }, []);

  /**
   * Hand a signed-in user off to Stripe for the chosen plan. Fires at most
   * once (ref-guarded). On failure, surface an error and stay put — the
   * account already exists, so they can retry without re-registering; the
   * guard is released so a retry is possible. Returns true when the caller
   * should stay on this page (a checkout was started, or the term is
   * already owned and the notice is showing) — NOT also navigate to
   * /dashboard.
   */
  const proceedToCheckout = useCallback(
    // `sku`, not `plan`: the hook value `plan` (usePlan) is read below.
    async (sku: CheckoutPlan): Promise<boolean> => {
      if (checkoutStartedRef.current) return true;
      checkoutStartedRef.current = true;
      setCheckingOut(true);
      setError(null);
      try {
        await startCheckoutForPlan(sku, lang); // full-page redirect to Stripe
        return true;
      } catch (err) {
        // The server refused a second term (P0-2). Confirm against a fresh
        // plan read before saying so: if the row agrees they own the term,
        // nothing went wrong — say it plainly and drop the intent (there
        // is nothing to retry). If the row does NOT agree (a stuck
        // subscription status the server guards on), never tell them they
        // own a term the app can see they cannot use — fall through to the
        // generic failure so they retry or reach support.
        if (isAlreadySubscribedError(err)) {
          const fresh = await plan.refresh().catch(() => null);
          if (fresh?.hasActiveTerm) {
            clearCheckoutIntent();
            setCheckingOut(false);
            setError(c.alreadySubscribed);
            return true;
          }
        }
        // Log for observability; the user sees only a generic message.
        // eslint-disable-next-line no-console
        console.error('[checkout] failed to start Stripe session:', err);
        checkoutStartedRef.current = false; // allow a retry
        // If the intent isn't backed by a URL ?plan= this visit, an
        // abandoned/failed attempt would otherwise resurrect on the next
        // plain /auth visit in this tab — clear it. When ?plan= IS present
        // (pricing CTA / OAuth return), retry still works from the URL, and
        // the email-confirm-return path (stash only, no URL) is preserved.
        if (!intentFromUrl) clearCheckoutIntent();
        setCheckingOut(false);
        setError(c.checkoutFailed);
        return false;
      }
    },
    [intentFromUrl, plan, lang, c],
  );

  // If ?guest=1, auto-trigger guest login — but NEVER when a paid checkout
  // intent is present (a paid plan must not land in a guest session).
  useEffect(() => {
    if (searchParams.get('guest') === '1' && !checkoutPlan) {
      handleGuest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Already authenticated? A signed-in visitor with a paid intent goes
  // straight to checkout (skip the form); otherwise to the dashboard. An
  // anonymous (guest) session does NOT satisfy a paid intent — the
  // create-checkout route requires a permanent account — so fall through
  // to the form so they can register/sign in for real.
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      const permanent = data.session.user.is_anonymous !== true;
      // Remember whether we're sitting on an anonymous guest session so the
      // signup path converts in place instead of creating a new user.
      setIsAnonGuest(!permanent);

      // Returning signed-in-and-permanent with a stashed signup consent —
      // this is the OAuth round-trip return or the email-confirm return.
      // Write it now (best-effort) and clear the stash so it can't leak to a
      // later session on a shared machine. writeConsent only sets opted-in
      // columns and is a no-op if nothing changed, so re-running is safe and
      // it never overwrites a returning user's prior choice with a default.
      if (permanent) {
        const stashed = readStashedSignupConsent();
        if (stashed.research || stashed.marketing) {
          void writeConsent(data.session.user.id, stashed);
        }
        clearStashedSignupConsent();
      }

      setPermanentSession(permanent);
      // A permanent user WITH a checkout intent is handled by the effect
      // below once the plan has loaded (P0-2: it must not start a second
      // term). A permanent user with no intent goes to the dashboard. A
      // GUEST does NOT get redirected — they stay on this page so they can
      // convert their account (with or without a checkout intent).
      if (!checkoutPlan && permanent) navigate('/dashboard', { replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // Auto-checkout for a signed-in permanent visitor with a paid intent —
  // deferred until the plan read settles so an active term holder is
  // never sent to Stripe for a second subscription. proceedToCheckout is
  // ref-guarded, so re-runs of this effect cannot mint two sessions.
  useEffect(() => {
    if (!checkoutPlan || permanentSession !== true || plan.loading) return;
    if (checkoutPlan === 'term' && plan.hasActiveTerm) return;
    void proceedToCheckout(checkoutPlan);
  }, [checkoutPlan, permanentSession, plan.loading, plan.hasActiveTerm, proceedToCheckout]);

  const handleGuest = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Defensive check: if a session already exists, NEVER call
    // signInAnonymously() — that would replace the user's existing
    // anonymous account with a fresh one and orphan all of their
    // posters. This was the root cause of the 2026-04-11 audit's
    // "I had to create a second guest" report: a signed-in guest
    // who clicked the Postr logo on /gallery → / → "Try as guest"
    // landed back on /auth?guest=1, which triggered handleGuest in
    // a useEffect that raced the existing-session redirect below.
    const { data: existing } = await supabase.auth.getSession();
    if (existing.session) {
      navigate('/dashboard', { replace: true });
      return;
    }
    const { error: err } = await supabase.auth.signInAnonymously();
    if (err) {
      setError(authErrorMessage(err, lang));
      setLoading(false);
      return;
    }
    navigate('/dashboard', { replace: true });
  }, [navigate, lang]);

  const handleEmailAuth = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);

    if (mode === 'signup') {
      // Send the confirmation link back to /auth (carrying the checkout
      // plan if any) so clicking it returns the user into our flow — resume
      // checkout, or sign in — instead of a bare app root that reads as a
      // dead-end "headless" landing.
      const emailRedirectTo = checkoutPlan
        ? `${window.location.origin}${authPath}?plan=${checkoutPlan}`
        : `${window.location.origin}${authPath}`;
      // Read the session FRESH here rather than trusting isAnonGuest state:
      // that state is set by an async effect, and a fast submit (password-
      // manager autofill) can fire before it resolves. Reading now is
      // authoritative and can't be defeated by ordering — the same defense
      // handleGuest uses. Converting the wrong way orphans the guest's
      // posters, so this must be exact.
      const { data: cur } = await supabase.auth.getSession();
      const convertInPlace = cur.session?.user.is_anonymous === true;
      // Convert a signed-in GUEST in place (updateUser links the email to
      // their existing anonymous user, so their posters carry over), vs. a
      // brand-new signUp for a visitor with no session. Using signUp on a
      // guest would create a SEPARATE user and orphan their work.
      const { data, error: err } = convertInPlace
        ? await supabase.auth.updateUser(
            { email: email.trim(), password },
            { emailRedirectTo },
          )
        : await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { emailRedirectTo },
          });
      if (err) {
        setError(authErrorMessage(err, lang));
        setLoading(false);
        return;
      }
      setLoading(false);
      // `signUp` returns `{ session }`; `updateUser` returns `{ user }` with
      // no session field. In both cases, if email confirmation is required
      // the account is NOT yet permanent until the user clicks the link —
      // updateUser triggers an email_change that keeps them anonymous until
      // confirmed. Detect "not yet fully signed-in-as-permanent": no fresh
      // session (signUp) OR still-anonymous user (updateUser pending confirm).
      const sessionNow = (data as { session?: unknown }).session ?? null;
      const userNow = (data as { user?: { is_anonymous?: boolean } | null }).user ?? null;
      const nowPermanent = !!sessionNow || (userNow != null && userNow.is_anonymous === false);
      const consent: ConsentChoice = { research: researchOptIn, marketing: marketingOptIn };
      if (!nowPermanent) {
        // Email confirmation pending. Stash the checkout intent AND the
        // consent choice so both resume after the user confirms and returns
        // signed-in (the session-check effect writes the stashed consent).
        if (checkoutPlan) stashCheckoutIntent(checkoutPlan);
        stashSignupConsent(consent);
        setConfirmEmail(true);
        return;
      }
      // Permanent now — record consent for the new account (best-effort,
      // never blocks the flow).
      await recordSignupConsent(consent);
      if (checkoutPlan && (await proceedToCheckout(checkoutPlan))) return;
      navigate('/dashboard', { replace: true });
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) {
        setError(authErrorMessage(err, lang));
        setLoading(false);
        return;
      }
      setLoading(false);
      if (checkoutPlan && (await proceedToCheckout(checkoutPlan))) return;
      navigate('/dashboard', { replace: true });
    }
  }, [email, password, mode, navigate, checkoutPlan, proceedToCheckout, researchOptIn, marketingOptIn, recordSignupConsent, authPath, lang]);

  const handleForgotPassword = useCallback(async () => {
    if (!email.trim()) {
      setError(c.enterEmailFirst);
      return;
    }
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
    );
    if (err) {
      setError(authErrorMessage(err, lang));
      return;
    }
    setResetSent(true);
  }, [email, c, lang]);

  const handleGoogle = useCallback(async () => {
    setError(null);
    // With a paid intent, return to /auth?plan=… so this page resumes
    // checkout on the OAuth bounce-back. Also mirror the plan to
    // sessionStorage — the round-trip through Google does not preserve our
    // query string reliably, and the stash is the fallback. Without an
    // intent, land on the dashboard as before.
    if (checkoutPlan) stashCheckoutIntent(checkoutPlan);
    // Stash the signup consent so it survives the OAuth round-trip and is
    // written on return. Only in signup mode (a returning user signing in
    // must not have consent recorded) and only when they opted into
    // something — an empty stash correctly reads back as no consent.
    if (mode === 'signup' && (researchOptIn || marketingOptIn)) {
      stashSignupConsent({ research: researchOptIn, marketing: marketingOptIn });
    }
    const redirectTo = checkoutPlan
      ? `${window.location.origin}${authPath}?plan=${checkoutPlan}`
      : `${window.location.origin}/dashboard`;
    // Read the session FRESH (not the async isAnonGuest state) — a fast
    // click can beat the effect that sets it, and converting the wrong way
    // orphans the guest's posters.
    const { data: cur } = await supabase.auth.getSession();
    const convertInPlace = cur.session?.user.is_anonymous === true;
    // A signed-in GUEST links Google to their existing anonymous user
    // (linkIdentity → converts in place, posters carry over). Everyone else
    // does a normal OAuth sign-in. Using signInWithOAuth on a guest would
    // start a fresh session and orphan their work. linkIdentity is instant
    // on return — no email-confirmation gap — so it's the smooth path.
    const { error: err } = convertInPlace
      ? await supabase.auth.linkIdentity({
          provider: 'google',
          options: { redirectTo },
        })
      : await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo },
        });
    if (err) {
      setError(authErrorMessage(err, lang));
    }
  }, [checkoutPlan, mode, researchOptIn, marketingOptIn, authPath, lang]);

  return (
    <main className="flex min-h-screen w-screen flex-col bg-[#0a0a12] text-[#c8cad0]">
      <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <Link to={localizedPath('/', lang)} className="flex items-center justify-center gap-3 mb-8 no-underline">
          <svg width="40" height="40" viewBox="0 0 64 64" fill="none">
            <rect width="64" height="64" rx="12" fill="#7c6aed" />
            <path d="M12 52 C30 52, 34 12, 52 12" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.95" />
            <path d="M12 12 C30 12, 34 52, 52 52" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.55" />
            <circle cx="32" cy="32" r="6" fill="white" />
          </svg>
          <span className="text-2xl font-bold text-white">Postr</span>
        </Link>

        {/* Paid-intent banner replaces the guest pitch: a paid plan needs a
            real account, so we lead with "create an account to continue to
            checkout", not "no account needed". The review_* labels below
            are unreachable while the Presentation Checker is deactivated
            (checkoutIntent.ts VALID rejects those plans — see routes.tsx
            header); they stay so the Record<CheckoutPlan, string> remains
            exhaustive. */}
        {checkoutPlan ? (
          <div className="mb-4 rounded-xl border border-[#7c6aed]/40 bg-[#14121e] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#9b8cf0]">
                  {(c.planLabels as Record<CheckoutPlan, string>)[checkoutPlan]}
                </div>
                {refundLine && (
                  <p className="mt-1 text-[12px] leading-relaxed text-[#a3a7b3]">
                    {refundLine}
                  </p>
                )}
                <p className="mt-2 text-sm leading-relaxed text-[#c8cad0]">
                  {termAlreadyActive
                    ? c.alreadySubscribed
                    : checkingOut
                      ? c.continuingToSecureCheckout
                      : c.createToContinue}
                </p>
                {termAlreadyActive && (
                  <Link
                    to="/profile"
                    className="mt-2 inline-block text-sm font-semibold text-[#b4a9f5] underline decoration-[#7c6aed] underline-offset-4"
                  >
                    {c.goToProfile}
                  </Link>
                )}
              </div>
              <Link
                to={localizedPath('/pricing', lang)}
                className="shrink-0 text-sm font-semibold text-[#b4a9f5] underline decoration-[#7c6aed] underline-offset-4"
              >
                {c.changePlan}
              </Link>
            </div>
          </div>
        ) : (
        <div className="rounded-xl border border-[#1f1f2e] bg-[#111118] p-6 mb-4">
          <button
            onClick={handleGuest}
            disabled={loading}
            className="w-full rounded-lg bg-[#5641b8] px-4 py-3.5 text-base font-semibold text-white hover:bg-[#4c39a6] transition-colors disabled:opacity-50"
          >
            {loading ? c.loading : c.startAsGuest}
          </button>
          {/* handleGuest lands on /dashboard, guest posters are stored on
              Postr's servers under the anonymous session, and the weekly
              cron deletes guests 14 days after their last sign-in
              (apps/api/src/cron.ts STALE_GUEST_DAYS). "May" because the
              deletion runs weekly, so it can come later than day 14. */}
          <p className="mt-3 text-center text-[14pt] leading-relaxed text-[#8b8f99]">
            {c.guestNote}
          </p>
        </div>
        )}

        {/* Sign in / Sign up card */}
        <div className="rounded-xl border border-[#1f1f2e] bg-[#111118] p-6">
          <h1 className="mb-1 text-base font-bold text-[#e2e2e8]">
            {mode === 'signin'
              ? c.titleSignIn
              : checkoutPlan
                ? c.titleCreate
                : c.titleOrCreate}
          </h1>
          <p className="mb-5 text-[14pt] text-[#8b8f99]">
            {mode === 'signin' ? c.subSignIn : c.subSignUp}
          </p>

          {confirmEmail && (
            <div className="mb-4 rounded-md border border-[#34d399]/40 bg-[#34d399]/10 px-4 py-3 text-[13px] text-[#a7f3d0]">
              <div className="font-semibold text-[#34d399]">{c.checkInbox}</div>
              <p className="mt-1 leading-relaxed">
                {c.confirmSentLead}{' '}
                <span className="font-medium text-[#d1fae5]">{email.trim()}</span>.{' '}
                {c.confirmClick}
                {isAnonGuest ? c.confirmPostersStay : ''}.
                {checkoutPlan ? c.confirmThenCheckout : c.confirmThenSignIn}
              </p>
              <p className="mt-2 text-[12px] text-[#6ee7b7]/70">
                {c.noEmailSeen}
              </p>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-md border border-[#f87171]/40 bg-[#f87171]/10 px-3 py-2 text-[13px] text-[#f87171]">
              {error}
            </div>
          )}

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={loading || checkingOut}
            className="w-full rounded-lg border border-[#2a2a3a] bg-[#1a1a26] px-4 py-3 text-sm font-semibold text-[#c8cad0] hover:border-[#7c6aed] transition-colors disabled:opacity-50 flex items-center justify-center gap-3"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {c.continueWithGoogle}
          </button>

          {/* Continuing here is accepting the Terms (Terms §1: creating an
              account or signing in), so this line sits right under the
              Google button, in both modes: "Continue with Google" creates an
              account for a Google user Postr has never seen, whatever the
              mode, and the page opens in sign-in mode (record 24, review
              round 2). It comes before the email form, so it is read before
              either way of continuing. Both languages are linked (owner
              decision 2026-10-06, Bill 96). The Privacy Policy is
              information, not something the user agrees to (Law 25 s. 14
              asks for consent separately from other information; record 24,
              review round 1). */}
          <TermsLine lang={lang} />

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-[#2a2a3a]" />
            <span className="text-[13px] text-[#8b8f99]">{c.orUseEmail}</span>
            <div className="h-px flex-1 bg-[#2a2a3a]" />
          </div>

          {/* Email form */}
          <form onSubmit={handleEmailAuth} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={c.emailPlaceholder}
              aria-label={c.emailPlaceholder}
              required
              className="w-full rounded-lg border border-[#2a2a3a] bg-[#1a1a26] px-4 py-3 text-sm text-[#e2e2e8] outline-none focus:border-[#7c6aed] placeholder:text-[#8b8f99]"
            />
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? c.createPassword : c.password}
                aria-label={mode === 'signup' ? c.createPassword : c.password}
                required
                minLength={8}
                className="w-full rounded-lg border border-[#2a2a3a] bg-[#1a1a26] px-4 py-3 text-sm text-[#e2e2e8] outline-none focus:border-[#7c6aed] placeholder:text-[#8b8f99]"
              />
              {mode === 'signup' && <PasswordStrength password={password} lang={lang} />}
              {mode === 'signin' && (
                <div className="mt-1.5 text-right">
                  {/* The recovery link signs the user in; the app has no
                      screen to set a new password (no PASSWORD_RECOVERY
                      handler), so this must not promise a reset. Supabase
                      sends nothing to an address with no account. */}
                  {resetSent ? (
                    <span className="text-[13px] text-[#34d399]">
                      {c.resetSent(email)}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="text-[13px] text-[#7c6aed] bg-transparent border-none cursor-pointer hover:underline"
                    >
                      {c.forgotPassword}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Optional consent — shown only for a new account (signup mode).
                Both UNCHECKED by default: an affirmative tick is the only
                valid consent under GDPR (no pre-ticking) and CASL (express
                opt-in). Governs whichever signup method the user picks. */}
            {mode === 'signup' && (
              <details className="rounded-lg border border-[#2a2a3a] bg-[#0f0f18] px-3 py-2.5">
                <summary className="cursor-pointer text-[13px] font-semibold text-[#c8cad0]">
                  {c.emailPreferences}
                </summary>
                <div className="mt-2 space-y-1">
                  <label htmlFor="consent-research" className="flex cursor-pointer items-start gap-2.5 py-1">
                    <input
                      id="consent-research"
                      type="checkbox"
                      checked={researchOptIn}
                      onChange={(e) => setResearchOptIn(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[#7c6aed]"
                    />
                    <span className="text-[13px] leading-snug text-[#c8cad0]">
                      {c.researchOptIn}
                    </span>
                  </label>
                  <label htmlFor="consent-marketing" className="flex cursor-pointer items-start gap-2.5 py-1">
                    <input
                      id="consent-marketing"
                      type="checkbox"
                      checked={marketingOptIn}
                      onChange={(e) => setMarketingOptIn(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[#7c6aed]"
                    />
                    <span className="text-[13px] leading-snug text-[#c8cad0]">
                      {c.marketingOptIn}
                    </span>
                  </label>
                </div>
              </details>
            )}

            <button
              type="submit"
              disabled={loading || checkingOut || !email.trim() || !password || (mode === 'signup' && !isPasswordValid(password))}
              className="w-full rounded-lg border border-[#7c6aed] bg-transparent px-4 py-3 text-sm font-semibold text-[#7c6aed] hover:bg-[#5641b8] hover:text-white transition-colors disabled:opacity-50"
            >
              {checkingOut
                ? c.continuingToCheckout
                : loading
                  ? c.loading
                  : mode === 'signin'
                    ? c.submitSignIn
                    : checkoutPlan
                      ? c.submitCreateContinue
                      : c.submitCreate}
            </button>
          </form>

          <div className="mt-4 text-center text-[14pt] text-[#8b8f99]">
            {mode === 'signin' ? (
              <>
                {c.noAccount}{' '}
                <button onClick={() => { setMode('signup'); setResetSent(false); setConfirmEmail(false); setError(null); }} className="text-[#7c6aed] font-semibold bg-transparent border-none cursor-pointer">
                  {c.signUp}
                </button>
              </>
            ) : (
              <>
                {c.haveAccount}{' '}
                <button onClick={() => { setMode('signin'); setResetSent(false); setConfirmEmail(false); setError(null); }} className="text-[#7c6aed] font-semibold bg-transparent border-none cursor-pointer">
                  {c.signIn}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      </div>

      <AuthLegalFooter lang={lang} />
    </main>
  );
}

/**
 * The Terms consent line (record 24): this language's Terms and Privacy
 * Policy, then the other language's, in a span marked with that language.
 */
function TermsLine({ lang }: { lang: Lang }) {
  const c = AUTH_COPY[lang];
  const other: Lang = lang === 'fr' ? 'en' : 'fr';
  const o = AUTH_COPY[other];
  const link = 'text-[#9ca3af] underline underline-offset-4';
  return (
    <p data-testid="auth-terms-line" className="mt-3 text-[13px] leading-relaxed text-[#8b8f99]">
      {c.termsLead}{' '}
      <Link className={link} to={localizedPath('/terms', lang)}>
        {c.termsLink}
      </Link>
      {c.privacyLead}{' '}
      <Link className={link} to={localizedPath('/privacy', lang)}>
        {c.privacyLink}
      </Link>{' '}
      {c.privacyTail} <span lang={HTML_LANG[other]}>{o.inThisLanguage}{' '}
      <Link className={link} to={localizedPath('/terms', other)}>
        {o.termsLink}
      </Link>{' '}
      {o.and}{' '}
      <Link className={link} to={localizedPath('/privacy', other)}>
        {o.privacyLink}
      </Link>
      .</span>
    </p>
  );
}

function AuthLegalFooter({ lang }: { lang: Lang }) {
  const c = AUTH_COPY[lang];
  const link = 'text-[#9ca3af] underline-offset-4 hover:underline';
  return (
    <footer className="border-t border-[#1f1f2e] px-4 py-5 text-sm text-[#8b8f99]">
      <nav aria-label={c.legalNav} className="mx-auto max-w-sm">
        <ul className="flex list-none flex-wrap justify-center gap-x-5 gap-y-2">
          <li>
            <Link className={link} to={localizedPath('/privacy', lang)}>
              {c.legalPrivacy}
            </Link>
          </li>
          <li>
            <Link className={link} to={localizedPath('/terms', lang)}>
              {c.legalTerms}
            </Link>
          </li>
          <li>
            <Link className={link} to={localizedPath('/cookies', lang)}>
              {c.legalCookies}
            </Link>
          </li>
          {/* The page in the other language (fix 26), plan kept. */}
          <li>
            <LanguageLink className={link} />
          </li>
        </ul>
      </nav>
    </footer>
  );
}
