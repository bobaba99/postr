/**
 * The sign-in page's copy (pages/Auth.tsx and the password rules of
 * components/PasswordStrength.tsx), English and French.
 *
 * The plan labels follow fix 25's rules in both languages: the tax note
 * after the price and after its billing period. The Terms consent line
 * (record 24) names both languages' Terms and Privacy Policy: each page
 * shows its own language's sentence, then the other language's
 * `inThisLanguage` lead and link names, in a span marked with that
 * language. Errors stay generic (`authError` maps Supabase's English
 * messages for the French page).
 */
import type { Bilingual } from './lang';

const en = {
  alreadySubscribed: 'You already have an active term — PowerPoint export is unlocked.',
  checkoutFailed: 'We couldn’t start checkout. Please try again.',
  enterEmailFirst: 'Enter your email address first.',
  planLabels: {
    term: 'Term · CA$18.99 every 4 months + applicable taxes',
    pack: 'Export pack · CA$9.99 + applicable taxes',
    review_pack: 'Review pack · credits never expire',
    review_addon: 'Review add-on · weekly reviews',
  },
  continuingToSecureCheckout: 'Continuing to secure checkout…',
  createToContinue: 'Create your account to continue.',
  goToProfile: 'Go to your profile',
  changePlan: 'Change plan',
  loading: 'Loading…',
  startAsGuest: 'Start creating — no account needed',
  guestNote:
    'Go straight to your dashboard as a guest. Guest posters may be deleted after 14 days. Create an account to keep them on any device.',
  titleSignIn: 'Sign in',
  titleCreate: 'Create your account',
  titleOrCreate: 'Or create an account',
  subSignIn: 'Access your posters from any device.',
  subSignUp: 'Save posters and continue on any device.',
  checkInbox: 'Check your inbox',
  confirmSentLead: 'We sent a confirmation link to',
  confirmClick: 'Click it to finish setting up your account',
  confirmPostersStay: ' — your posters stay with you',
  confirmThenCheckout: ' Then come back here and we’ll continue to checkout.',
  confirmThenSignIn: ' Then come back to sign in.',
  noEmailSeen: 'Don’t see it? Check your spam folder.',
  continueWithGoogle: 'Continue with Google',
  termsLead: 'By continuing, you agree to the',
  termsLink: 'Terms of Service',
  privacyLead: '. The',
  privacyLink: 'Privacy Policy',
  privacyTail: 'explains how we handle your information.',
  /** Shown on the other language's page, before this language's links. */
  inThisLanguage: 'In English:',
  and: 'and',
  orUseEmail: 'or use email',
  emailPlaceholder: 'Email address',
  createPassword: 'Create password',
  password: 'Password',
  resetSent: (email: string) => `If ${email} has an account, we emailed it a sign-in link.`,
  forgotPassword: 'Forgot password?',
  emailPreferences: 'Email preferences (optional)',
  researchOptIn: 'Invite me to research interviews or surveys.',
  marketingOptIn: 'Email me product updates and new features.',
  continuingToCheckout: 'Continuing to checkout…',
  submitSignIn: 'Sign in',
  submitCreateContinue: 'Create account & continue',
  submitCreate: 'Create account',
  noAccount: "Don't have an account?",
  signUp: 'Sign up',
  haveAccount: 'Already have an account?',
  signIn: 'Sign in',
  legalNav: 'Legal',
  legalPrivacy: 'Privacy',
  legalTerms: 'Terms',
  legalCookies: 'Cookies',
  passwordMet: (passed: number, total: number) => `${passed} of ${total} met`,
  passwordRules: {
    length: 'At least 8 characters',
    upper: 'Uppercase letter (A-Z)',
    lower: 'Lowercase letter (a-z)',
    digit: 'Number (0-9)',
    symbol: 'Symbol (!@#$...)',
  },
  /**
   * What each French line answers. The English page shows Supabase's own
   * message, as before; Supabase writes only English, so the French page
   * shows the French line for a code it knows and the generic one
   * otherwise (pages/Auth.tsx authErrorMessage).
   */
  authErrors: {
    invalid_credentials: 'Invalid login credentials',
    user_already_exists: 'User already registered',
    weak_password: 'Password is too weak',
    email_address_invalid: 'Email address is invalid',
    over_email_send_rate_limit: 'Too many emails sent. Try again later.',
    over_request_rate_limit: 'Too many requests. Try again later.',
    generic: 'Something went wrong. Please try again.',
  },
};

export type AuthCopy = typeof en;

const fr: AuthCopy = {
  alreadySubscribed: 'Vous avez déjà un forfait à terme actif — l’exportation PowerPoint est débloquée.',
  checkoutFailed: 'Nous n’avons pas pu lancer le paiement. Veuillez réessayer.',
  enterEmailFirst: 'Entrez d’abord votre adresse courriel.',
  planLabels: {
    term: 'Forfait à terme · 18,99\u00a0$\u00a0CA tous les 4\u00a0mois + taxes applicables',
    pack: 'Lot d’exportation · 9,99\u00a0$\u00a0CA + taxes applicables',
    review_pack: 'Lot de révisions · les crédits n’expirent jamais',
    review_addon: 'Option de révision · révisions hebdomadaires',
  },
  continuingToSecureCheckout: 'Passage au paiement sécurisé…',
  createToContinue: 'Créez votre compte pour continuer.',
  goToProfile: 'Aller à votre profil',
  changePlan: 'Changer de forfait',
  loading: 'Chargement…',
  startAsGuest: 'Commencer à créer — aucun compte requis',
  guestNote:
    'Allez directement à votre tableau de bord en tant qu’invité. Les affiches d’invité peuvent être supprimées après 14\u00a0jours. Créez un compte pour les garder sur tous vos appareils.',
  titleSignIn: 'Connexion',
  titleCreate: 'Créez votre compte',
  titleOrCreate: 'Ou créez un compte',
  subSignIn: 'Accédez à vos affiches depuis n’importe quel appareil.',
  subSignUp: 'Enregistrez vos affiches et continuez sur n’importe quel appareil.',
  checkInbox: 'Vérifiez votre boîte de réception',
  confirmSentLead: 'Nous avons envoyé un lien de confirmation à',
  confirmClick: 'Cliquez dessus pour terminer la création de votre compte',
  confirmPostersStay: ' — vos affiches restent avec vous',
  confirmThenCheckout: ' Revenez ensuite ici et nous passerons au paiement.',
  confirmThenSignIn: ' Revenez ensuite pour vous connecter.',
  noEmailSeen: 'Vous ne le voyez pas? Vérifiez votre dossier de courrier indésirable.',
  continueWithGoogle: 'Continuer avec Google',
  termsLead: 'En continuant, vous acceptez les',
  termsLink: 'Conditions d’utilisation',
  privacyLead: '. La',
  privacyLink: 'Politique de confidentialité',
  privacyTail: 'explique comment nous traitons vos renseignements.',
  inThisLanguage: 'En français\u00a0:',
  and: 'et',
  orUseEmail: 'ou utilisez votre courriel',
  emailPlaceholder: 'Adresse courriel',
  createPassword: 'Créer un mot de passe',
  password: 'Mot de passe',
  resetSent: (email: string) =>
    `Si ${email} correspond à un compte, nous y avons envoyé un lien de connexion par courriel.`,
  forgotPassword: 'Mot de passe oublié?',
  emailPreferences: 'Préférences de courriel (facultatif)',
  researchOptIn: 'Invitez-moi à des entrevues ou à des sondages de recherche.',
  marketingOptIn: 'Envoyez-moi par courriel les nouveautés du produit et les nouvelles fonctionnalités.',
  continuingToCheckout: 'Passage au paiement…',
  submitSignIn: 'Se connecter',
  submitCreateContinue: 'Créer le compte et continuer',
  submitCreate: 'Créer le compte',
  noAccount: 'Vous n’avez pas de compte?',
  signUp: 'S’inscrire',
  haveAccount: 'Vous avez déjà un compte?',
  signIn: 'Se connecter',
  legalNav: 'Juridique',
  legalPrivacy: 'Confidentialité',
  legalTerms: 'Conditions',
  legalCookies: 'Témoins',
  passwordMet: (passed: number, total: number) =>
    `${passed}\u00a0critère${passed > 1 ? 's' : ''} sur ${total} respecté${passed > 1 ? 's' : ''}`,
  passwordRules: {
    length: 'Au moins 8\u00a0caractères',
    upper: 'Lettre majuscule (A-Z)',
    lower: 'Lettre minuscule (a-z)',
    digit: 'Chiffre (0-9)',
    symbol: 'Symbole (!@#$…)',
  },
  authErrors: {
    invalid_credentials: 'Adresse courriel ou mot de passe incorrect.',
    user_already_exists: 'Un compte existe déjà avec cette adresse courriel.',
    weak_password: 'Ce mot de passe est trop faible.',
    email_address_invalid: 'Cette adresse courriel n’est pas valide.',
    over_email_send_rate_limit: 'Trop de courriels envoyés. Réessayez plus tard.',
    over_request_rate_limit: 'Trop de demandes. Réessayez plus tard.',
    generic: 'Une erreur s’est produite. Veuillez réessayer.',
  },
};

export const AUTH_COPY: Bilingual<AuthCopy> = { en, fr };
