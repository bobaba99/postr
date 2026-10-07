/**
 * The public plot checker page's copy (pages/FigureReadability.tsx) and
 * its size fields (poster/PrintSizeFields.tsx, the preset names of
 * poster/printSize.ts), English and French. The checker panel's own
 * strings are in readability.ts.
 *
 * The h1, the lede, the three "How the check works" paragraphs and the
 * editor paragraph are the routes.json crawler copy of the page, word for
 * word, in each language (pinned by pages/__tests__/FigureReadability
 * tests). The code behind each claim is noted in FigureReadability.tsx.
 */
import type { Bilingual } from './lang';

const en = {
  title: 'Will your figure labels be readable at poster size?',
  lede: 'Paste your R (ggplot2) or Python (matplotlib) plotting code and type the size the figure will print at. The check scores its titles, axis labels, tick labels, legend and caption at that size against minimums of 18 pt for axis titles, 14 pt for tick labels and 12 pt for captions. If anything falls short, it adds the size each element needs to a copy of your script. No account, and your code never leaves the browser.',
  checkHeading: 'Check your code',
  howHeading: 'How the check works',
  howCanvas:
    'The check scales your figure from its source canvas to the printed size. In R the canvas is the ggsave() width and height, or the size you typed when there is no ggsave(). In Python it is the figsize or set_size_inches() your code sets, or matplotlib’s default of 6.4 × 4.8 in. It then scores each text element against a minimum: 18 pt for titles and axis titles, 14 pt for tick labels, legends and strips, 12 pt for captions.',
  howReads:
    'In R it reads base_size and the sizes theme() sets for the elements it scores. It does not read a size set on text or title. In Python it reads font.size in plt.rcParams, seaborn’s context and font_scale, and the sizes given to set_xlabel(), set_ylabel(), set_title() and tick_params(). Check sizes set any other way yourself.',
  howFix:
    'If anything falls short, it lists the size each element needs and adds those sizes to a copy of your script. When some sizes still follow base_size (font.size in Python), it also gives the smallest base_size at which they meet their minimums, as a one-line snippet.',
  editorTitle: 'Need this check while you build the poster?',
  editorBody:
    'Postr is a free academic poster editor with this same check in its Figure tab: drag a figure box on the canvas and the check sizes against it, or select an image block to use its exact print dimensions.',
  openEditor: 'Open the editor',
  jsonLdName: 'Postr Plot Checker',
  jsonLdDescription:
    'Paste ggplot2 or matplotlib code and the size the figure will print at. The check scores its titles, axis labels, tick labels and legend against poster minimums and adds the sizes they need to a copy of your script.',
  size: {
    legend: 'Printed figure size',
    width: 'Width',
    height: 'Height',
    unit: 'in',
    presetsLabel: 'Print size presets',
    presets: {
      small: 'Small figure',
      'quarter-48x36': 'Quarter of a 48 × 36 poster',
      'quarter-a0-landscape': 'Quarter of an A0 landscape',
      'column-36x48': 'One column of a 36 × 48 portrait',
    },
    note: 'Measure the space the figure will fill on the printed poster, not the image file. If your code sets its canvas (ggsave() in R, figsize in Python), the check scales from that canvas to this size. Without one, it assumes R code renders at this size and Python code at matplotlib’s default of 6.4 × 4.8 in.',
  },
};

export type FigureReadabilityCopy = typeof en;

const fr: FigureReadabilityCopy = {
  title: 'Les étiquettes de votre figure seront-elles lisibles à la taille de l’affiche?',
  lede: 'Collez votre code de tracé R (ggplot2) ou Python (matplotlib) et entrez la taille à laquelle la figure sera imprimée. La vérification évalue ses titres, ses titres d’axes, ses étiquettes de graduation, sa légende et sa note à cette taille, par rapport à des minimums de 18\u00a0pt pour les titres d’axes, de 14\u00a0pt pour les étiquettes de graduation et de 12\u00a0pt pour les notes. Si un élément est trop petit, elle ajoute la taille dont il a besoin dans une copie de votre script. Aucun compte requis, et votre code ne quitte jamais le navigateur.',
  checkHeading: 'Vérifiez votre code',
  howHeading: 'Comment fonctionne la vérification',
  howCanvas:
    'La vérification met votre figure à l’échelle, de son canevas source à la taille imprimée. En R, le canevas est la largeur et la hauteur de ggsave(), ou la taille que vous avez saisie s’il n’y a pas de ggsave(). En Python, c’est le figsize ou le set_size_inches() que votre code fixe, ou la taille par défaut de matplotlib, soit 6,4 × 4,8\u00a0po. Elle évalue ensuite chaque élément de texte par rapport à un minimum\u00a0: 18\u00a0pt pour les titres et les titres d’axes, 14\u00a0pt pour les étiquettes de graduation, les légendes et les bandeaux, 12\u00a0pt pour les notes.',
  howReads:
    'En R, elle lit base_size et les tailles que theme() fixe pour les éléments qu’elle évalue. Elle ne lit pas une taille fixée sur text ou title. En Python, elle lit font.size dans plt.rcParams, le contexte et le font_scale de seaborn, et les tailles données à set_xlabel(), set_ylabel(), set_title() et tick_params(). Vérifiez vous-même les tailles fixées autrement.',
  howFix:
    'Si un élément est trop petit, elle indique la taille dont chaque élément a besoin et ajoute ces tailles à une copie de votre script. Quand certaines tailles suivent encore base_size (font.size en Python), elle donne aussi le plus petit base_size auquel elles atteignent leurs minimums, sous forme d’extrait d’une ligne.',
  editorTitle: 'Besoin de cette vérification pendant que vous créez l’affiche?',
  editorBody:
    'Postr est un éditeur d’affiches scientifiques gratuit qui offre cette même vérification dans son onglet Figure\u00a0: faites glisser un cadre de figure sur le canevas et la vérification se règle sur sa taille, ou sélectionnez un bloc d’image pour utiliser ses dimensions d’impression exactes.',
  openEditor: 'Ouvrir l’éditeur',
  jsonLdName: 'Vérificateur de graphiques Postr',
  jsonLdDescription:
    'Collez du code ggplot2 ou matplotlib et la taille à laquelle la figure sera imprimée. La vérification évalue ses titres, étiquettes d’axes, étiquettes de graduation et légende par rapport aux minimums d’une affiche et ajoute les tailles nécessaires à une copie de votre script.',
  size: {
    legend: 'Taille de la figure imprimée',
    width: 'Largeur',
    height: 'Hauteur',
    unit: 'po',
    presetsLabel: 'Tailles d’impression prédéfinies',
    presets: {
      small: 'Petite figure',
      'quarter-48x36': 'Quart d’une affiche de 48 × 36',
      'quarter-a0-landscape': 'Quart d’une A0 paysage',
      'column-36x48': 'Une colonne d’une affiche portrait de 36 × 48',
    },
    note: 'Mesurez l’espace que la figure occupera sur l’affiche imprimée, pas le fichier image. Si votre code fixe son canevas (ggsave() en R, figsize en Python), la vérification passe de ce canevas à cette taille. Sans canevas, elle suppose que le code R est rendu à cette taille et le code Python à la taille par défaut de matplotlib, soit 6,4 × 4,8\u00a0po.',
  },
};

export const FIGURE_READABILITY_COPY: Bilingual<FigureReadabilityCopy> = { en, fr };
