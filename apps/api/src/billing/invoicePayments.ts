/**
 * Basil-era invoice navigation (H-10 / H-11).
 *
 * Stripe API 2025-03-31.basil (live on our pinned 2026-02-25.preview)
 * REMOVED `Invoice.payment_intent`, `Invoice.subscription` and
 * `Charge.invoice`. The replacements:
 *   - invoice → PaymentIntent: `invoice.payments.data[].payment.
 *     payment_intent` (expand `latest_invoice.payments` on the
 *     subscription retrieve — the PI arrives as an id string; expanding
 *     further, `…payments.data.payment.payment_intent`, is 5 levels and
 *     the API refuses it with property_expansion_max_depth — verified in
 *     the sandbox 2026-09-11). `stripe.invoicePayments.list({ invoice })`
 *     is the second chance when the embedded list is missing.
 *   - PaymentIntent → invoice: `GET /v1/invoice_payments?payment[type]=
 *     payment_intent&payment[payment_intent]=pi_…` (stripe.invoicePayments
 *     .list), expanding `data.invoice`.
 *   - invoice → subscription: `invoice.parent.subscription_details.
 *     subscription`.
 * Each reader keeps a defensive fallback to the legacy field so an older
 * endpoint version (or a fixture) still resolves.
 */
import type Stripe from 'stripe';

/**
 * The expand path refundTerm asks for on subscriptions.retrieve: the
 * latest invoice WITH its payments list (2 levels — the deepest Stripe
 * allows here that still yields the PaymentIntent id).
 */
export const LATEST_INVOICE_PAYMENT_INTENT_EXPAND = 'latest_invoice.payments';

function idOf(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id;
  }
  return null;
}

/**
 * The PaymentIntent id that paid `invoice`: the first `payment_intent`-
 * typed entry in `invoice.payments` (object or id), else the legacy
 * top-level `payment_intent`. Null when neither is present.
 */
export function paymentIntentIdFromInvoice(
  invoice: Stripe.Invoice | null | undefined,
): string | null {
  if (!invoice) return null;
  const payments = (invoice as { payments?: { data?: unknown } }).payments?.data;
  if (Array.isArray(payments)) {
    for (const entry of payments) {
      const payment = (entry as { payment?: { type?: string; payment_intent?: unknown } })?.payment;
      if (!payment) continue;
      if (payment.type && payment.type !== 'payment_intent') continue;
      const id = idOf(payment.payment_intent);
      if (id) return id;
    }
  }
  return idOf((invoice as { payment_intent?: unknown }).payment_intent);
}

/**
 * The subscription id that generated `invoice`: Basil
 * `parent.subscription_details.subscription` (object or id), else the
 * legacy top-level `subscription`. Null for a one-time (pack) invoice.
 */
export function subscriptionIdFromInvoice(
  invoice: Stripe.Invoice | null | undefined,
): string | null {
  if (!invoice) return null;
  const details = (invoice as { parent?: { subscription_details?: { subscription?: unknown } | null } | null })
    .parent?.subscription_details;
  return idOf(details?.subscription) ?? idOf((invoice as { subscription?: unknown }).subscription);
}

/**
 * The PaymentIntent id that paid `invoice`: from the invoice's embedded
 * `payments` (or legacy field) first, else by listing the invoice's
 * InvoicePayments — so a retrieve whose `payments` expansion was dropped
 * still resolves. Null when the invoice has no PaymentIntent payment.
 */
export async function findPaymentIntentIdForInvoice(
  stripe: Stripe,
  invoice: Stripe.Invoice,
): Promise<string | null> {
  const embedded = paymentIntentIdFromInvoice(invoice);
  if (embedded) return embedded;
  const { data } = await stripe.invoicePayments.list({ invoice: invoice.id, limit: 10 });
  return paymentIntentIdFromInvoice({ payments: { data } } as unknown as Stripe.Invoice);
}

/**
 * The invoice a PaymentIntent paid, via the InvoicePayment resource. Null
 * when the PaymentIntent paid no invoice (a one-time Checkout payment —
 * i.e. a pack — has no invoice).
 */
export async function findInvoiceForPaymentIntent(
  stripe: Stripe,
  paymentIntentId: string,
): Promise<Stripe.Invoice | null> {
  const { data } = await stripe.invoicePayments.list({
    payment: { type: 'payment_intent', payment_intent: paymentIntentId },
    expand: ['data.invoice'],
    limit: 1,
  });
  const invoice = data[0]?.invoice;
  if (!invoice) return null;
  if (typeof invoice === 'string') return stripe.invoices.retrieve(invoice);
  if ((invoice as { deleted?: boolean }).deleted) return null;
  return invoice as Stripe.Invoice;
}
