/**
 * The pricing page's copy (pages/Pricing.tsx and the tier cards in
 * components/PricingSection.tsx), English and French.
 *
 * Copy rules (fix 25, held in both languages by src/__tests__/
 * copyInventory.test.ts and src/components/__tests__/pricesTax.test.tsx):
 * every price is followed by its tax note, after its billing period
 * ("CA$18.99 every 4 months + applicable taxes"; « 18,99 $ CA tous les
 * 4 mois + taxes applicables »); no LaTeX while the export is hidden. The
 * card prices are printed bare and large, their tax note right under them
 * (`taxNote`): the inventory lists them in BARE_PRICES. French prices as
 * the French legal pages write them: « 18,99 $ CA », no-break spaces.
 *
 * The refund lines come from data/refundCopy.ts (shared with the editor's
 * paywall and /auth).
 */
import type { Bilingual } from './lang';

const en = {
  eyebrow: 'Pricing',
  titleLead: 'Free to build.',
  titleAccent: 'Pay only to take it further.',
  lead: 'Build and print free. Pay only for editable PowerPoint exports.',
  sectionTitle: 'Choose your export access',
  recommended: 'Recommended',
  alreadyOwned: 'You already have an active term.',
  manageIt: 'Manage it',
  whatsIncluded: 'What’s included',
  refundLead:
    'A term is refundable in full within 14 days of a charge if you haven’t taken a paid export. A pack is refundable in full until you use an export credit. Full details in the',
  refundLink: 'refund terms',
  refundTail: '.',
  free: {
    name: 'Free',
    price: '$0',
    cadence: 'always',
    cta: 'Start free',
    forWho: 'For posters you print or present.',
    condition: 'Includes a “made with postr.sh” credit.',
    features: ['Unlimited editing and every design tool.', 'Print-ready PDF, saved from your browser.'] as readonly [
      string,
      string,
    ],
  },
  term: {
    name: 'Term',
    price: 'CA$18.99',
    cadence: 'every 4 months',
    taxNote: '+ applicable taxes',
    cta: 'Get the term',
    forWho: 'For unlimited editable exports while your term runs.',
    condition: 'Renews every four months. Cancel anytime.',
    features: ['PowerPoint exports with no watermark.', 'No export limit while your term is active.'] as readonly [
      string,
      string,
    ],
  },
  pack: {
    name: 'Export pack',
    price: 'CA$9.99',
    cadence: 'one-time · 3 exports',
    taxNote: '+ applicable taxes',
    cta: 'Get the pack',
    forWho: 'For a few editable exports without a subscription.',
    condition: 'One-time purchase. Credits never expire.',
    features: ['Three PowerPoint exports.', 'Purchased exports have no watermark.'] as readonly [string, string],
  },
};

export type PricingCopy = typeof en;

const fr: PricingCopy = {
  eyebrow: 'Tarifs',
  titleLead: 'Gratuit pour créer.',
  titleAccent: 'Payez seulement pour aller plus loin.',
  lead: 'Créez et imprimez gratuitement. Payez seulement les exportations PowerPoint modifiables.',
  sectionTitle: 'Choisissez votre accès à l’exportation',
  recommended: 'Recommandé',
  alreadyOwned: 'Vous avez déjà un forfait à terme actif.',
  manageIt: 'Le gérer',
  whatsIncluded: 'Ce qui est inclus',
  refundLead:
    'Un forfait à terme est remboursable intégralement dans les 14\u00a0jours suivant une facturation si vous n’avez fait aucune exportation payante. Un lot est remboursable intégralement jusqu’à ce que vous utilisiez un crédit d’exportation. Tous les détails se trouvent dans les',
  refundLink: 'conditions de remboursement',
  refundTail: '.',
  free: {
    name: 'Gratuit',
    price: '0\u00a0$',
    cadence: 'toujours',
    cta: 'Commencer gratuitement',
    forWho: 'Pour les affiches que vous imprimez ou présentez.',
    condition: 'Comprend la mention «\u00a0made with postr.sh\u00a0».',
    features: [
      'Modification illimitée et tous les outils de conception.',
      'PDF prêt à imprimer, enregistré depuis votre navigateur.',
    ],
  },
  term: {
    name: 'Forfait à terme',
    price: '18,99\u00a0$\u00a0CA',
    cadence: 'tous les 4\u00a0mois',
    taxNote: '+ taxes applicables',
    cta: 'Obtenir le forfait à terme',
    forWho: 'Pour des exportations modifiables illimitées pendant votre forfait à terme.',
    condition: 'Se renouvelle tous les quatre mois. Annulable en tout temps.',
    features: [
      'Exportations PowerPoint sans filigrane.',
      'Aucune limite d’exportation tant que votre forfait à terme est actif.',
    ],
  },
  pack: {
    name: 'Lot d’exportation',
    price: '9,99\u00a0$\u00a0CA',
    cadence: 'achat unique · 3\u00a0exportations',
    taxNote: '+ taxes applicables',
    cta: 'Obtenir le lot',
    forWho: 'Pour quelques exportations modifiables sans abonnement.',
    condition: 'Achat unique. Les crédits n’expirent jamais.',
    features: ['Trois exportations PowerPoint.', 'Les exportations achetées n’ont pas de filigrane.'],
  },
};

export const PRICING_COPY: Bilingual<PricingCopy> = { en, fr };
