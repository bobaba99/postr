/**
 * The checkout result pages' copy (pages/BillingResult.tsx), English and
 * French: where Stripe sends the buyer back (apps/api/src/billing.ts
 * billingUrl; a checkout started from a French page returns to /fr).
 *
 * The success page says only what it knows: Stripe sent the buyer back
 * once checkout completed, and the purchase reaches the account through
 * the webhook. So « Étape de paiement terminée », not « paiement reçu ».
 */
import type { Bilingual } from './lang';

const en = {
  successTitle: 'Checkout complete',
  termActive: 'Your term is active. Editable PowerPoint exports are unlocked — no watermark.',
  creditsLeft: (n: number) => `You have ${n} export credit${n === 1 ? '' : 's'} to use whenever. Credits never expire.`,
  checking: 'Checking your account for the purchase.',
  notYet:
    'Your purchase hasn’t reached your account yet. It appears once Stripe confirms the payment. Check your profile page to see it.',
  backToPosters: 'Back to your posters',
  viewPlans: 'View plans',
  cancelTitle: 'Checkout cancelled',
  cancelBody:
    'No charge was made. Your poster is exactly as you left it — you can keep editing for free, or pick up checkout again anytime.',
  goBack: 'Go back',
  seePlans: 'See plans',
};

export type BillingCopy = typeof en;

const fr: BillingCopy = {
  successTitle: 'Étape de paiement terminée',
  termActive:
    'Votre forfait à terme est actif. Les exportations PowerPoint modifiables sont débloquées — sans filigrane.',
  creditsLeft: (n: number) =>
    `Vous avez ${n}\u00a0crédit${n > 1 ? 's' : ''} d’exportation à utiliser quand vous voulez. Les crédits n’expirent jamais.`,
  checking: 'Nous cherchons l’achat dans votre compte.',
  notYet:
    'Votre achat n’est pas encore arrivé dans votre compte. Il apparaîtra dès que Stripe aura confirmé le paiement. Consultez votre page de profil pour le voir.',
  backToPosters: 'Retour à vos affiches',
  viewPlans: 'Voir les forfaits',
  cancelTitle: 'Paiement annulé',
  cancelBody:
    'Rien ne vous a été facturé. Votre affiche est exactement comme vous l’avez laissée — vous pouvez continuer à la modifier gratuitement, ou reprendre le paiement en tout temps.',
  goBack: 'Revenir en arrière',
  seePlans: 'Consulter les forfaits',
};

export const BILLING_COPY: Bilingual<BillingCopy> = { en, fr };
