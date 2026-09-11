/**
 * Pure term-subscription guards (P0-1 / P0-2).
 *
 * The users row stores ONE term subscription (stripe_subscription_id +
 * subscription_status). Stripe delivers lifecycle events out of order and
 * redelivers them, and a refund cancels a subscription that Stripe may
 * still emit "active" events for. These predicates decide, from the
 * stored row and the event's subscription id alone, whether an event may
 * advance or revoke access — so a stale event for an OLD subscription
 * can never clobber a NEWER one, and a cancelled subscription can never
 * be re-activated by a late event.
 */

/** Statuses under which the user KEEPS term access (past_due = dunning). */
export const TERM_ACTIVE_STATUSES: ReadonlySet<string> = new Set([
  'active',
  'trialing',
  'past_due',
]);

/**
 * IRREVERSIBLY terminal statuses — the subscription is over and can never
 * re-grant. `unpaid` is deliberately NOT here: Stripe parks a subscription
 * at `unpaid` when dunning is exhausted, but paying the open invoice
 * (from Link's hosted invoice page) moves it back to `active`. It still
 * revokes access on entry (it is not in TERM_ACTIVE_STATUSES), but the
 * same subscription must be allowed to re-grant when the customer pays.
 */
export const TERM_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'canceled',
  'incomplete_expired',
]);

export function isTerminalSubscriptionStatus(
  status: string | null | undefined,
): boolean {
  return !!status && TERM_TERMINAL_STATUSES.has(status);
}

/** The subset of a users row the guards read. */
export interface TermRow {
  plan?: string | null;
  plan_expires_at?: string | null;
  stripe_subscription_id?: string | null;
  subscription_status?: string | null;
}

/**
 * Does this row currently hold a live term? Used by create-checkout to
 * refuse a second term (409 already_subscribed). True when the plan
 * columns say so (plan='term' with a future expiry) OR the subscription
 * status is live (active / trialing / past_due) AND the stored expiry is
 * absent or still in the future — the status alone counts so a row whose
 * plan columns lag a webhook by seconds still refuses, but a status that
 * outlived its period (a missed terminal webhook) does NOT: usePlan on
 * the client already shows such a row as unpaid, so refusing here would
 * dead-end the user with "you already have a term" and no way to buy
 * one. That stuck state is logged for the operator instead.
 */
export function hasActiveTerm(
  row: TermRow | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!row) return false;
  const expiresMs = row.plan_expires_at
    ? new Date(row.plan_expires_at).getTime()
    : NaN;
  const expiryLapsed = Number.isFinite(expiresMs) && expiresMs <= nowMs;
  const planLive = row.plan === 'term' && Number.isFinite(expiresMs) && expiresMs > nowMs;
  const statusIsLive =
    !!row.subscription_status && TERM_ACTIVE_STATUSES.has(row.subscription_status);
  if (statusIsLive && expiryLapsed) {
    // eslint-disable-next-line no-console
    console.error(
      `[billing] subscription_status '${row.subscription_status}' is stuck past a lapsed plan_expires_at for subscription ${row.stripe_subscription_id ?? 'unknown'} — a terminal webhook was probably missed; reconcile against Stripe`,
      { row },
    );
  }
  return planLive || (statusIsLive && !expiryLapsed);
}

export type TermAdvanceDecision =
  | 'advance'
  /** Same subscription id, but its stored status is terminal (refunded / cancelled) — never re-grant. */
  | 'skip_terminal'
  /** A different subscription while the stored one is still live — a duplicate term (operator-visible). */
  | 'skip_other_live';

/**
 * May an "active"-family event for `eventSubscriptionId` (re)grant the
 * term? Advance when nothing is stored, when it is the SAME subscription
 * and its stored status is not terminal, or when the stored subscription
 * is terminal (a successor takes over). Refuse otherwise.
 */
export function termAdvanceDecision(
  row: TermRow | null | undefined,
  eventSubscriptionId: string,
): TermAdvanceDecision {
  const storedId = row?.stripe_subscription_id ?? null;
  if (!storedId) return 'advance';
  const storedTerminal = isTerminalSubscriptionStatus(row?.subscription_status);
  if (storedId === eventSubscriptionId) {
    return storedTerminal ? 'skip_terminal' : 'advance';
  }
  return storedTerminal ? 'advance' : 'skip_other_live';
}

/**
 * May a terminal event for `eventSubscriptionId` revoke the term? Only
 * when it IS the stored subscription (mirrors the review add-on guard).
 */
export function canRevokeTerm(
  row: TermRow | null | undefined,
  eventSubscriptionId: string,
): boolean {
  return !!row?.stripe_subscription_id && row.stripe_subscription_id === eventSubscriptionId;
}
