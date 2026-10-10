/**
 * The About page's copy (pages/About.tsx), English and French. The code
 * behind each milestone's claims is noted on its English entry below; the
 * French says what the English says, nothing more.
 */
import type { Bilingual } from './lang';
import { ADJUSTMENTS_ENABLED, IMPORT_ENABLED } from '@/config/features';

export interface Milestone {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

const en = {
  eyebrow: 'Postr by Resila',
  titleLead: 'Everything you need',
  titleAccent: 'to ship a great poster.',
  intro:
    'Postr is an opinionated poster editor built around one idea: constraint is a feature. The defaults are set for print. A new poster starts on a 48 × 36 inch sheet with 36 pt body text, and you fill in the science.',
  makerLead: 'Built and maintained by',
  makerMiddle: 'in Quebec, Canada. Questions or bug reports land at',
  makerTail: '.',
  milestonesHeading: 'Postr milestones',
  milestones: [
    {
      id: 'anonymous',
      title: 'Start anywhere, save nothing',
      body: "Anonymous session on first click — no sign-up wall. Every keystroke autosaves from before you've even named the poster. When you sign up later, your drafts follow you across devices without a single \"export and re-import\".",
    },
    {
      // Layouts: poster/templates.ts LAYOUT_TEMPLATES (the fifth is Blank).
      // Palettes: poster/constants.ts PALETTES (8, six named by discipline).
      // The custom palette designer and the guidelines panel's board sizes
      // are hidden (ADJUSTMENTS_ENABLED, EDITOR_EXTRAS_ENABLED; record 29),
      // so the card names neither. Custom sizes run
      // SHEET_MIN_IN..SHEET_MAX_IN (poster/resizeSheet.ts).
      id: 'templates',
      title: 'Templates built for conference posters',
      body: 'Five layouts: three-column classic, two-column wide figure, billboard, sidebar + focus, and a blank start. Eight palettes, six of them named for a discipline, and the sheet takes any size from 10 to 100 inches.',
    },
    {
      // Prompts: each template text block's `prompt` (poster/templates.ts),
      // drawn grey by index.css and never printed (record 29). The
      // checklist and its word targets were the guidelines panel's, hidden
      // (EDITOR_EXTRAS_ENABLED). References: typed and imported ones are
      // set in APA 7, the style menu hidden (ADJUSTMENTS_ENABLED).
      id: 'writing',
      title: 'Writing guidance, not a blank page',
      body: 'Template sections open with short prompts that never print. Rich text for emphasis, Greek-symbol shortcuts for STEM, and a reference manager that sets the references you import or type in APA 7.',
    },
    {
      // The check compares each label's printed point size with the
      // minimums in poster/readability.ts. It runs when the user runs it.
      id: 'readability',
      title: 'Figure text checked at print size',
      body: 'Paste your R or Python plotting code and Postr checks whether axis labels will actually be legible at print size. Out-of-bounds warnings catch layout slips. Run the check before you print, while small labels are still easy to fix.',
    },
    // Hidden with import (IMPORT_ENABLED, record 29).
    ...(IMPORT_ENABLED
      ? [
        {
          // The manuscript sentence this card used to open with was removed:
          // paper-to-poster is deactivated — see routes.tsx header. The id is
          // kept so the timeline outline and its tests stay stable.
          //
          // Every import is auto-arranged into columns after it lands
          // (ImportPosterModal.tsx sets postr.autoArrangeOnLoad; PosterEditor
          // runs onAutoLayout), so blocks do not keep their original places.
          // Image imports, and PDFs with no text layer (pdfImport.ts
          // rasterizes those), are text-only (import/imageImport.ts). A text-layer
          // PDF brings only embedded raster images (paintImageXObject), and a
          // PowerPoint import skips native charts (import/pptx/shapes.ts
          // unsupportedLabel), so the card says charts stay behind.
          id: 'start-from-work',
          title: 'Start from the poster you already have',
          body: 'Already have a poster in PowerPoint, as a PDF, or as an image? Import it and keep editing. The title, headings and body text come in as blocks you can move and rewrite, and Postr arranges them into columns. Imports from PowerPoint and text-based PDFs also bring in images. Charts built in PowerPoint, and charts a PDF draws as vector graphics, stay behind. From an image or a scanned PDF, you add figures yourself.',
        },
        ]
      : []),
    {
      // Describes the editor's Figure tab. The same ladder used to have a
      // standalone page (/chart-chooser) this copy also covered; that page
      // is deactivated — see routes.tsx header — so the sentence no longer
      // promises downloads outside the editor.
      id: 'figures',
      title: 'The right figure, drawn for print',
      body: 'Paste a table or answer three questions in the Figure tab and Postr ranks the chart forms that actually fit your data, drawn as journal-style panels with captions in methods voice. Pick several at once and insert them straight onto the poster.',
    },
    // Hidden with Copy a design (ADJUSTMENTS_ENABLED, record 29).
    ...(ADJUSTMENTS_ENABLED
      ? [
        {
          // Only a palette and one of the curated fonts come back
          // (apps/api/src/extractStyle.ts schema); clampPrintSafe
          // (poster/styleExtraction.ts) lifts very dark backgrounds and caps
          // saturation. It does not check contrast, so the card does not
          // promise legibility.
          id: 'design',
          title: 'Borrow a look you like',
          body: 'Upload a poster you admire and Postr applies its colours and the closest built-in font to yours. It copies no text or images. Very dark backgrounds are lifted slightly and neon colours are toned down for print.',
        },
        ]
      : []),
    {
      // Share links are deactivated with comments (config/features.ts), so the
      // card no longer offers them (fix 23).
      //
      // Undo keeps UNDO_HISTORY_LIMIT (100) steps (stores/posterStore.ts;
      // fix 12, docs/fixes/12-one-undo-history.md). PowerPoint needs a term
      // or a pack credit (usePlan canExport). The PPTX writer has no case
      // for chart blocks, so the card names what it does carry.
      // The LaTeX export is hidden (config/features.ts LATEX_EXPORT_ENABLED,
      // fix 25), so the card does not name it.
      id: 'ship',
      title: 'Iterate, export, print',
      body: 'Undo and redo up to 100 steps. Save a PDF for free. PowerPoint exports are paid, and keep text, images and tables editable. Charts made in Postr are not included.',
    },
  ] as readonly Milestone[],
  feedbackEyebrow: 'Shape what ships next',
  feedbackTitle: "Tell us what's missing.",
  feedbackBody:
    "Every bug report and feature request lands in the developer's queue. If something's broken, missing, or could be better, say so.",
  reportBug: 'Report a bug',
  suggestFeature: 'Suggest a feature',
  sayHi: 'Just say hi',
};

export type AboutCopy = typeof en;

const fr: AboutCopy = {
  eyebrow: 'Postr par Resila',
  titleLead: 'Tout ce qu’il faut',
  titleAccent: 'pour livrer une excellente affiche.',
  intro:
    'Postr est un éditeur d’affiches qui assume ses choix, bâti autour d’une idée\u00a0: la contrainte est un atout. Les réglages par défaut sont pensés pour l’impression. Une nouvelle affiche commence sur une feuille de 48 × 36\u00a0pouces avec un texte courant de 36\u00a0pt, et vous y ajoutez la science.',
  makerLead: 'Conçu et maintenu par',
  makerMiddle: 'au Québec, au Canada. Les questions et les signalements de bogues arrivent à',
  makerTail: '.',
  milestonesHeading: 'Les étapes de Postr',
  milestones: [
    {
      id: 'anonymous',
      title: 'Commencez n’importe où, sans rien avoir à enregistrer',
      body: 'Une session anonyme dès le premier clic, sans obligation de vous inscrire. Chaque frappe est enregistrée automatiquement, avant même que vous ayez nommé l’affiche. Si vous vous inscrivez plus tard, vos brouillons vous suivent d’un appareil à l’autre, sans aucun «\u00a0exporter puis réimporter\u00a0».',
    },
    {
      id: 'templates',
      title: 'Des modèles conçus pour les affiches de congrès',
      body: 'Cinq mises en page\u00a0: classique à trois colonnes, deux colonnes avec une grande figure, panneau-réclame, barre latérale et zone principale, et un départ vierge. Huit palettes, dont six portent le nom d’une discipline, et la feuille accepte toute taille de 10 à 100\u00a0pouces.',
    },
    {
      id: 'writing',
      title: 'Des conseils de rédaction, pas une page blanche',
      body: 'Les sections des modèles s’ouvrent sur de courtes consignes qui ne s’impriment jamais. Du texte enrichi pour la mise en relief, des raccourcis de lettres grecques pour les STIM, et un gestionnaire de références qui met en forme selon le style APA\u00a07 les références que vous importez ou tapez.',
    },
    {
      id: 'readability',
      title: 'Le texte des figures vérifié à la taille d’impression',
      body: 'Collez votre code de tracé R ou Python et Postr vérifie si les étiquettes des axes seront vraiment lisibles à la taille d’impression. Des avertissements de dépassement repèrent les erreurs de mise en page. Lancez la vérification avant d’imprimer, tant que les petites étiquettes sont encore faciles à corriger.',
    },
    // Hidden with import (IMPORT_ENABLED, record 29).
    ...(IMPORT_ENABLED
      ? [
        {
          id: 'start-from-work',
          title: 'Partez de l’affiche que vous avez déjà',
          body: 'Vous avez déjà une affiche en PowerPoint, en PDF ou en image? Importez-la et continuez à la modifier. Le titre, les intertitres et le texte courant arrivent en blocs que vous pouvez déplacer et réécrire, et Postr les dispose en colonnes. Les importations depuis PowerPoint et depuis les PDF qui contiennent du texte apportent aussi les images. Les graphiques créés dans PowerPoint, et ceux qu’un PDF dessine en graphiques vectoriels, ne sont pas importés. Depuis une image ou un PDF numérisé, vous ajoutez les figures vous-même.',
        },
        ]
      : []),
    {
      id: 'figures',
      title: 'La bonne figure, dessinée pour l’impression',
      body: 'Collez un tableau ou répondez à trois questions dans l’onglet Figure, et Postr classe les types de graphiques qui conviennent vraiment à vos données, dessinés comme des panneaux de revue scientifique, avec des légendes rédigées comme une section Méthodes. Choisissez-en plusieurs à la fois et insérez-les directement sur l’affiche.',
    },
    // Hidden with Copy a design (ADJUSTMENTS_ENABLED, record 29).
    ...(ADJUSTMENTS_ENABLED
      ? [
        {
          id: 'design',
          title: 'Empruntez un style qui vous plaît',
          body: 'Téléversez une affiche que vous admirez et Postr applique à la vôtre ses couleurs et la police intégrée la plus proche. Il ne copie aucun texte ni aucune image. Les fonds très foncés sont légèrement éclaircis et les couleurs fluo sont atténuées pour l’impression.',
        },
        ]
      : []),
    {
      id: 'ship',
      title: 'Itérer, exporter, imprimer',
      body: 'Annulez et rétablissez jusqu’à 100\u00a0étapes. Enregistrez un PDF gratuitement. Les exportations PowerPoint sont payantes et gardent le texte, les images et les tableaux modifiables. Les graphiques créés dans Postr n’y sont pas inclus.',
    },
  ],
  feedbackEyebrow: 'Influencez la suite',
  feedbackTitle: 'Dites-nous ce qui manque.',
  feedbackBody:
    'Chaque signalement de bogue et chaque demande de fonctionnalité arrivent dans la file du développeur. Si quelque chose est brisé, manque ou pourrait être mieux, dites-le.',
  reportBug: 'Signaler un bogue',
  suggestFeature: 'Suggérer une fonctionnalité',
  sayHi: 'Simplement dire bonjour',
};

export const ABOUT_COPY: Bilingual<AboutCopy> = { en, fr };
