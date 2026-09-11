/**
 * Billing client — typed errors for the paid-path guards.
 *
 * P0-2: `POST /billing/create-checkout` refuses a second term with
 * `409 already_subscribed`; the client turns that into a typed
 * AlreadySubscribedError so every checkout surface can show "You already
 * have an active term" instead of the generic failure.
 * H-8: `POST /billing/consume-credit` answers `409 no_credit` when the
 * balance is already zero; the client turns that into NoExportCreditError
 * so the Export tab can zero its local balance and raise the paywall.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ApiError } from '@/lib/apiClient';

const postJson = vi.hoisted(() => vi.fn());
vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>();
  return { ...actual, postJson };
});

import {
  AlreadySubscribedError,
  NoExportCreditError,
  consumeExportCredit,
  createCheckout,
  isAlreadySubscribedError,
  requestRefund,
} from '../billing';

beforeEach(() => {
  postJson.mockReset();
});

describe('createCheckout', () => {
  it('returns the hosted URL on success', async () => {
    postJson.mockResolvedValue({ url: 'https://checkout.stripe.com/c/x' });
    await expect(createCheckout('term')).resolves.toBe('https://checkout.stripe.com/c/x');
    expect(postJson).toHaveBeenCalledWith(
      '/billing/create-checkout',
      { sku: 'term' },
      { auth: true },
    );
  });

  it('maps 409 already_subscribed to AlreadySubscribedError', async () => {
    postJson.mockRejectedValue(
      new ApiError('already_subscribed', 409, { error: 'already_subscribed' }),
    );
    const err = await createCheckout('term').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AlreadySubscribedError);
    expect(isAlreadySubscribedError(err)).toBe(true);
  });

  it('passes other ApiErrors through unchanged', async () => {
    const original = new ApiError('checkout_failed', 500, { error: 'checkout_failed' });
    postJson.mockRejectedValue(original);
    const err = await createCheckout('pack').catch((e: unknown) => e);
    expect(err).toBe(original);
    expect(isAlreadySubscribedError(err)).toBe(false);
  });

  it('a 409 with a different code is NOT an already-subscribed error', async () => {
    postJson.mockRejectedValue(new ApiError('conflict', 409, { error: 'something_else' }));
    const err = await createCheckout('term').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(isAlreadySubscribedError(err)).toBe(false);
  });
});

describe('consumeExportCredit', () => {
  it('returns the remaining balance', async () => {
    postJson.mockResolvedValue({ ok: true, credits: 2 });
    await expect(consumeExportCredit()).resolves.toBe(2);
  });

  it('maps 409 no_credit to NoExportCreditError', async () => {
    postJson.mockRejectedValue(
      new ApiError('no_credit', 409, { error: 'no_credit', credits: 0 }),
    );
    const err = await consumeExportCredit().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NoExportCreditError);
  });

  it('passes a server failure through unchanged', async () => {
    const original = new ApiError('consume_failed', 500, { error: 'consume_failed' });
    postJson.mockRejectedValue(original);
    const err = await consumeExportCredit().catch((e: unknown) => e);
    expect(err).toBe(original);
  });
});

describe('requestRefund', () => {
  it('reads subscription_cancelled so the panel can say the term ended (P0-1)', async () => {
    postJson.mockResolvedValue({ ok: true, amount_cents: 1899, subscription_cancelled: true });
    await expect(requestRefund('term')).resolves.toEqual({
      amountCents: 1899,
      subscriptionCancelled: true,
    });
    expect(postJson).toHaveBeenCalledWith('/billing/refund', { kind: 'term' }, { auth: true });
  });

  it('a pack refund (no subscription_cancelled field) reports subscriptionCancelled=false', async () => {
    postJson.mockResolvedValue({ ok: true, amount_cents: 666 });
    await expect(requestRefund('pack')).resolves.toEqual({
      amountCents: 666,
      subscriptionCancelled: false,
    });
  });

  it('passes an eligibility ApiError through unchanged', async () => {
    const err = new ApiError('window_expired', 409, { error: 'window_expired' });
    postJson.mockRejectedValue(err);
    await expect(requestRefund('term')).rejects.toBe(err);
  });
});
