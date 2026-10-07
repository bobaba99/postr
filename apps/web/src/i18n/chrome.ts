/**
 * The public pages' shared chrome: the header (components/PublicHeader),
 * the footer (components/PublicFooter), the phone notice
 * (components/MobileNotice) and the language link
 * (components/LanguageLink). See lang.ts for how a page's language is
 * chosen. Quebec French, the legal pages' vocabulary (« rétroaction »).
 */
import type { Bilingual } from './lang';

const en = {
  /**
   * The language's name in itself: the other language's pages show it on
   * the link that leads here (« Français » on an English page, "English"
   * on a French one).
   */
  languageName: 'English',
  header: {
    editor: 'Editor',
    myPosters: 'My posters',
    plotChecker: 'Plot checker',
    plotCheckerBlurb: 'Check figure text at poster print size',
    pricing: 'Pricing',
    whyPosters: 'Why posters',
    about: 'About',
    feedback: 'Feedback',
    feedbackTitle: 'Send feedback',
    sendFeedback: 'Send feedback',
    profileTitle: 'Profile & Settings',
    signIn: 'Sign in',
    menu: 'Menu',
  },
  footer: {
    tagline: 'A poster editor built for researchers.',
    product: 'Product',
    home: 'Home',
    pricing: 'Pricing',
    plotChecker: 'Plot checker',
    learn: 'Learn',
    about: 'About',
    whyPosters: 'Why poster sessions',
    sendFeedback: 'Send feedback',
    account: 'Account',
    signIn: 'Sign in',
    profile: 'Profile',
    legal: 'Legal',
    privacy: 'Privacy Policy',
    cookies: 'Cookies Policy',
    terms: 'Terms of Service',
    languageNav: 'Language',
  },
  mobileNotice: {
    regionLabel: 'The editor is not optimised for phones',
    lead: 'The editor is not optimised for phones.',
    body: 'Open Postr on a laptop or desktop computer to make and edit posters.',
    dismiss: 'Dismiss',
  },
};

export type ChromeCopy = typeof en;

const fr: ChromeCopy = {
  languageName: 'Français',
  header: {
    editor: 'Éditeur',
    myPosters: 'Mes affiches',
    plotChecker: 'Vérificateur de graphiques',
    plotCheckerBlurb: 'Vérifiez le texte des figures à la taille d’impression de l’affiche',
    pricing: 'Tarifs',
    whyPosters: 'Pourquoi des affiches',
    about: 'À propos',
    feedback: 'Rétroaction',
    feedbackTitle: 'Envoyer une rétroaction',
    sendFeedback: 'Envoyer une rétroaction',
    profileTitle: 'Profil et paramètres',
    signIn: 'Connexion',
    menu: 'Menu',
  },
  footer: {
    tagline: 'Un éditeur d’affiches conçu pour les chercheurs.',
    product: 'Produit',
    home: 'Accueil',
    pricing: 'Tarifs',
    plotChecker: 'Vérificateur de graphiques',
    learn: 'En savoir plus',
    about: 'À propos',
    whyPosters: 'Pourquoi les séances d’affiches',
    sendFeedback: 'Envoyer une rétroaction',
    account: 'Compte',
    signIn: 'Connexion',
    profile: 'Profil',
    legal: 'Juridique',
    privacy: 'Politique de confidentialité',
    cookies: 'Politique relative aux témoins',
    terms: 'Conditions d’utilisation',
    languageNav: 'Langue',
  },
  mobileNotice: {
    regionLabel: 'L’éditeur n’est pas optimisé pour les téléphones',
    lead: 'L’éditeur n’est pas optimisé pour les téléphones.',
    body: 'Ouvrez Postr sur un ordinateur portable ou de bureau pour créer et modifier des affiches.',
    dismiss: 'Fermer',
  },
};

export const CHROME_COPY: Bilingual<ChromeCopy> = { en, fr };
