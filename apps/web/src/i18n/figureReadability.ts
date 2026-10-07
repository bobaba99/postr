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
  lede: 'Paste your R (ggplot2) or Python (matplotlib) plotting code and type the size the figure will print at. The check scores its titles, axis labels, tick labels, legend and caption at that size against minimums of 18 pt for axis titles, 14 pt for tick labels and 12 pt for captions. If anything falls short, it sets the size each element needs in a copy of your script. No account, and your code never leaves the browser.',
  checkHeading: 'Check your code',
  howHeading: 'How the check works',
  howCanvas:
    'The check scales your figure from its source canvas to the printed size. In R the canvas is the ggsave() width and height, with its units and scale, the size of a png() or pdf() device the plot is printed to, or the size you typed when there is neither. In Python it is the figsize or set_size_inches() your code sets, or matplotlib’s default of 6.4 × 4.8 in. A seaborn grid that sizes itself from its facets and legend, or a save cropped with bbox_inches="tight", prints at a scale the code does not give: the check marks the scale, and the copy of your script saves the figure at the size checked, keeping what the crop kept when that fits the canvas at the sizes needed. It then scores each text element against a minimum: 18 pt for titles and axis titles, 14 pt for tick labels, legends and strips, 12 pt for captions.',
  howReads:
    'It reads the settings that decide text size in the order your code sets them, the last one winning. In R: base_size (named or not), the sizes theme() sets for text, title and each element, with rel(), theme_set() and theme_update(), the sizes a legend’s own guide sets, and each plot of a figure that combines plots (cowplot, gridExtra). In Python: font.size and each element’s own size in rcParams (in plt.rc() and rc_context() too), seaborn’s set_theme() and set_context(), matplotlib’s built-in style sheets, and the sizes your code gives titles, axis labels, tick labels, legends, colorbars and captions, in a loop over the Axes too. A size your code does not set, or sets in a way the check cannot read, is marked, and the default is assumed.',
  howFix:
    'If anything falls short, or a size or the canvas is assumed, it gives you your script back with plain edits, to use in place of yours: each size changed where your code sets it, the ones your code leaves out set, and the figure saved at the size checked, with any text a cropped save keeps outside the plots still in it when it fits the canvas. It never writes a size below the one the table shows, and a size your code sets in a way the check cannot read is raised to at least the size needed, read when the script runs, never below what your code sets. A figure that combines plots gets the sizes in each plot, before they are combined. When elements that fall short follow base_size (font.size in Python), it also gives the base_size at which they meet their minimums, as a one-line snippet, never below your own. It leaves that number out when they follow different settings, when the theme is not one of ggplot2’s, when the figure combines plots, or when the printed scale depends on something your code does not give, such as a seaborn grid or a cropped save.',
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
  lede: 'Collez votre code de tracé R (ggplot2) ou Python (matplotlib) et entrez la taille à laquelle la figure sera imprimée. La vérification évalue ses titres, ses titres d’axes, ses étiquettes de graduation, sa légende et sa note à cette taille, par rapport à des minimums de 18\u00a0pt pour les titres d’axes, de 14\u00a0pt pour les étiquettes de graduation et de 12\u00a0pt pour les notes. Si un élément est trop petit, elle fixe la taille dont il a besoin dans une copie de votre script. Aucun compte requis, et votre code ne quitte jamais le navigateur.',
  checkHeading: 'Vérifiez votre code',
  howHeading: 'Comment fonctionne la vérification',
  howCanvas:
    'La vérification met votre figure à l’échelle, de son canevas source à la taille imprimée. En R, le canevas est la largeur et la hauteur de ggsave(), avec ses unités et son facteur scale, la taille du périphérique png() ou pdf() où le graphique est imprimé, ou la taille que vous avez saisie s’il n’y a ni l’un ni l’autre. En Python, c’est le figsize ou le set_size_inches() que votre code fixe, ou la taille par défaut de matplotlib, soit 6,4 × 4,8\u00a0po. Une grille seaborn qui se dimensionne d’après ses facettes et sa légende, ou un enregistrement rogné par bbox_inches="tight", s’imprime à une échelle que le code ne donne pas\u00a0: la vérification marque l’échelle, et la copie de votre script enregistre la figure à la taille vérifiée, en gardant ce que le rognage gardait quand cela tient dans le canevas aux tailles nécessaires. Elle évalue ensuite chaque élément de texte par rapport à un minimum\u00a0: 18\u00a0pt pour les titres et les titres d’axes, 14\u00a0pt pour les étiquettes de graduation, les légendes et les bandeaux, 12\u00a0pt pour les notes.',
  howReads:
    'Elle lit les réglages qui fixent la taille du texte dans l’ordre où votre code les fixe, le dernier l’emportant. En R\u00a0: base_size (nommé ou non), les tailles que theme() fixe pour text, title et chaque élément, avec rel(), theme_set() et theme_update(), les tailles que fixe le guide propre d’une légende, et chaque graphique d’une figure qui en assemble plusieurs (cowplot, gridExtra). En Python\u00a0: font.size et la taille propre à chaque élément dans rcParams (aussi dans plt.rc() et rc_context()), set_theme() et set_context() de seaborn, les feuilles de style intégrées de matplotlib, et les tailles que votre code donne aux titres, aux titres d’axes, aux étiquettes de graduation, aux légendes, aux barres de couleurs et aux notes, aussi dans une boucle sur les axes. Une taille que votre code ne fixe pas, ou fixe d’une façon que la vérification ne sait pas lire, est marquée, et la valeur par défaut est supposée.',
  howFix:
    'Si un élément est trop petit, ou si une taille ou le canevas est supposé, elle vous rend votre script avec de simples modifications, à utiliser à la place du vôtre\u00a0: chaque taille changée là où votre code la fixe, celles que votre code omet fixées, et la figure enregistrée à la taille vérifiée, avec le texte hors des graphiques qu’un enregistrement rogné garde toujours dans l’image quand il tient dans le canevas. Elle n’écrit jamais une taille inférieure à celle qu’affiche le tableau, et une taille que votre code fixe d’une façon que la vérification ne sait pas lire est relevée au moins à la taille nécessaire, lue à l’exécution du script, jamais sous ce que fixe votre code. Une figure qui assemble plusieurs graphiques reçoit les tailles dans chacun d’eux, avant leur assemblage. Quand des éléments trop petits suivent base_size (font.size en Python), elle donne aussi le base_size auquel ils atteignent leurs minimums, sous forme d’extrait d’une ligne, jamais inférieur au vôtre. Elle omet ce nombre quand ils suivent des réglages différents, quand le thème n’est pas l’un de ceux de ggplot2, quand la figure assemble plusieurs graphiques, ou quand l’échelle d’impression dépend d’un élément que votre code ne donne pas, comme une grille seaborn ou un enregistrement rogné.',
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
