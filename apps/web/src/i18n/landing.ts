/**
 * The landing page's copy (pages/Landing.tsx), English and French. Every
 * claim's source in the code is noted in Landing.tsx beside where it is
 * shown; the French says what the English says, nothing more.
 */
import type { Bilingual } from './lang';

const en = {
  badge: 'Built for researchers',
  titleLead: 'Academic posters,',
  titleAccent: 'without the hassle.',
  heroLead: 'A poster editor that handles',
  /** The hero's rotating slot: frictions removed (see Landing.tsx). */
  frictions: [
    'the fiddly block nudging',
    'the text reflowing on you',
    'the BibTeX reference formatting',
    'the authors and affiliations',
    'the figure font-size math',
  ],
  heroTail: 'so you can work on the science.',
  getStarted: 'Get started',
  tryAsGuest: 'Try as guest',
  phoneNoteLead: 'Best on a laptop.',
  phoneNoteBody: 'The editor needs a bigger screen to drag blocks and see your poster at full size.',
  coreTools: 'Core poster tools',
  templatesTitle: 'Poster templates',
  templatesBody: 'Four layouts and a blank start, with disciplinary palettes and standard academic size presets.',
  figureTitle: 'Figure readability',
  figureBody: 'Check chart labels at print size and copy the fix.',
  figureLink: 'Try it standalone.',
  writingTitle: 'Writing guide',
  writingBody: 'Each template section opens with a short prompt that never prints.',
  exportsTitle: 'Editable exports',
  exportsBody: 'Export an editable PowerPoint file. PowerPoint exports are paid.',
  toolsTitle: 'A tool you can use on its own',
  toolsIntro: 'The part of the poster workflow that works without an account, and without opening the editor.',
  checkerTitle: 'Plot checker',
  checkerBody:
    'Paste your R or Python plotting code and the size it will print at. See which labels fall below poster minimums and copy your script with the sizes they need added.',
  checkerCta: 'Check your figure',
  jsonLdDescription: 'A web app for making academic conference posters, built for researchers and students.',
};

export type LandingCopy = typeof en;

const fr: LandingCopy = {
  badge: 'Conçu pour les chercheurs',
  titleLead: 'Des affiches scientifiques,',
  titleAccent: 'sans les tracas.',
  heroLead: 'Un éditeur d’affiches qui s’occupe',
  frictions: [
    'du déplacement minutieux des blocs',
    'du texte qui se replace tout seul',
    'de la mise en forme des références BibTeX',
    'des auteurs et des affiliations',
    'du calcul de la taille du texte des figures',
  ],
  heroTail: 'pour que vous puissiez vous consacrer à la science.',
  getStarted: 'Commencer',
  tryAsGuest: 'Essayer en tant qu’invité',
  phoneNoteLead: 'Idéal sur un ordinateur portable.',
  phoneNoteBody:
    'L’éditeur a besoin d’un plus grand écran pour déplacer les blocs et voir votre affiche en taille réelle.',
  coreTools: 'Les outils de base pour vos affiches',
  templatesTitle: 'Modèles d’affiches',
  templatesBody:
    'Quatre mises en page et un départ vierge, avec des palettes par discipline et des formats d’affiche universitaires standard.',
  figureTitle: 'Lisibilité des figures',
  figureBody: 'Vérifiez les étiquettes des graphiques à la taille d’impression et copiez la correction.',
  figureLink: 'Essayez-le séparément.',
  writingTitle: 'Guide de rédaction',
  writingBody: 'Chaque section des modèles s’ouvre sur une courte consigne qui ne s’imprime jamais.',
  exportsTitle: 'Exportations modifiables',
  exportsBody: 'Exportez un fichier PowerPoint modifiable. Les exportations PowerPoint sont payantes.',
  toolsTitle: 'Un outil à utiliser séparément',
  toolsIntro: 'La partie du travail sur l’affiche qui fonctionne sans compte et sans ouvrir l’éditeur.',
  checkerTitle: 'Vérificateur de graphiques',
  checkerBody:
    'Collez votre code de tracé R ou Python et la taille à laquelle il sera imprimé. Voyez quelles étiquettes sont sous les minimums d’une affiche et copiez votre script avec les tailles nécessaires ajoutées.',
  checkerCta: 'Vérifier votre figure',
  jsonLdDescription:
    'Une application Web pour créer des affiches de congrès scientifiques, conçue pour les chercheurs et les étudiants.',
};

export const LANDING_COPY: Bilingual<LandingCopy> = { en, fr };
