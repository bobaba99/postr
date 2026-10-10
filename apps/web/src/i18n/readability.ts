/**
 * The plot checker panel's copy (poster/ReadabilityPanel.tsx and its
 * pieces: ReadabilitySizingNote, ReadabilityCodeView's copy button,
 * FullCodeModal), English and French. The editor's Figure › Check tab
 * passes no language and stays English; the public page's French twin
 * (/tools/figure-readability/fr) passes 'fr'.
 *
 * The engine (poster/readability.ts) writes its element names and
 * warnings in English; readabilityWarnings.ts puts them in French for the
 * French page. Code (base_size, theme(), plt.rcParams) is never
 * translated.
 *
 * The comments in ReadabilityPanel.tsx say what each claim rests on in the
 * engine; the French says what the English says.
 */
import type { Bilingual } from './lang';

const en = {
  heading: 'Code Readability Check',
  introLead: '🔎 Paste your R or Python plotting code, then click',
  introCheck: 'Check',
  introTail: 'to see how large its titles, labels and legend will print on the poster.',
  sizing: {
    image: 'Using selected image block',
    pageLead: 'Sizing against the print size you entered above',
    pageMiddle: '. Change the width or height and click',
    pageTail: ' again.',
    panelLead: 'Sizing against the gray',
    panelPreview: 'figure preview',
    panelMiddle: 'on the canvas',
    panelTail:
      '— drag or resize it to match your real figure, or click an existing image block to use its exact dimensions.',
  },
  languages: { auto: 'Auto', r: 'R', python: 'Python' },
  editorLabel: 'Your R or Python plotting code',
  editorPlaceholder: '# Paste your ggplot / matplotlib code here...',
  detected: (label: string) => `Detected: ${label}`,
  assumedLabel: (language: string, system: string) => `${language} (checked as ${system})`,
  systemNames: { base: 'base graphics', baseR: 'base R graphics' },
  cantTellIdle: 'Can’t tell R from Python. Pick one above.',
  waiting: 'Auto-detect waiting for code…',
  cannotTell: 'Couldn’t tell R from Python — pick R (ggplot2) or Python (matplotlib).',
  unsupported: (name: string) => `Not supported yet: ${name}. The check reads R (ggplot2) and Python (matplotlib).`,
  resized: 'The print size changed: click Check again for a result at this size.',
  checkedAs: (label: string) => `Checked as ${label}: `,
  belowCount: (below: number, total: number) =>
    below === 0
      ? 'every text element meets its minimum.'
      : `${below} of ${total} text elements are below the minimum.`,
  check: '▶ Check',
  copiedLead: '✓ Copied to clipboard —',
  copiedTail: {
    panel: 'paste it into your editor, re-run, and re-upload the image.',
    page: 'paste it into your script, re-run, and print at this size.',
  },
  outOfDate: 'Out of date: this result is from your last check, before the code or the language changed.',
  scale: (factor: string) => `Scale factor: ${factor}x`,
  scaleSuffix: {
    panel: ' (default block size)',
    page: ' (source canvas → printed size)',
  },
  table: {
    element: 'Element',
    source: 'Source',
    sourceTitle: 'The size the check read from your code',
    print: 'Print',
    printTitle: 'What it measures once the figure is scaled onto the poster',
    min: 'Min',
    minTitle: 'Postr’s minimum for this element on a poster',
    verdict: 'Verdict',
  },
  legend: {
    title: 'What the flags mean',
    passLead: 'At or above the minimum.',
    passBody: 'Nothing to change.',
    warnLead: 'Up to 15% below the minimum.',
    warnBody:
      'Legible close up, hard to read from the back of the room — and one small change to the figure size drops it into red. Worth fixing, not safe to ignore.',
    failLead: 'More than 15% below.',
    failBody: 'Raise it before you print.',
    sourceWord: 'Source',
    sourceText: 'is the size the check read from your code.',
    printWord: 'Print',
    printText: 'is what it measures on the poster after the figure is scaled to fit the block, and it is the number compared against',
    minWord: 'Min',
    minTail: '.',
    readsPython:
      'It reads the figure size, font.size and each element’s own size in rcParams (in plt.rc() and rc_context() too), seaborn’s set_theme() and set_context(), matplotlib’s built-in style sheets, and the sizes your code gives titles, axis labels, tick labels, legends, colorbars and captions, in the order your code sets them.',
    readsR:
      'It reads base_size (named or not), the sizes theme() sets, text and title included, theme_set() and theme_update(), the sizes a legend’s own guide sets, each plot of a figure that combines plots (cowplot, gridExtra), and the size of ggsave() with its units and scale, or of a png(), pdf() or ragg device, and a theme held in a name or a function where it is used, in the order ggplot2 applies them.',
    assumedLead: 'Not in your code.',
    assumedBody: 'The size shown is the default the check assumed. The edited script below sets it, so the figure prints as shown.',
    assumedBodySome:
      'The size shown is the default the check assumed. The edited script below sets it, except a size in a plot the check cannot find by name, such as one made inside the call that combines plots: check that one yourself.',
    assumedBodyKept:
      'The size shown is the default the check assumed. It is in a plot the check cannot find by name, such as one made inside the call that combines plots, so the edited script cannot set it: check it yourself.',
    assumedRow: 'Your code does not set this size: the default is assumed.',
    unreadLead: 'Not read from your code.',
    unreadBody:
      'Your code sets this size in a way the check cannot read, such as a value from a configuration or a theme that is not ggplot2’s, so the size shown is the default it assumed. The edited script raises it to at least the size needed, read when the script runs, so never below what your code sets.',
    unreadBodyKept:
      'Your code sets this size in a way the check cannot read, so the size shown is the default it assumed. The edited script raises it to at least the size needed, read when the script runs, so never below what your code sets; a size in a FontProperties without a size, or in a ** or a fontdict= it cannot see into, can be left as written: check that one yourself.',
    unreadRow: 'Your code sets this size in a way the check cannot read: the default is assumed.',
    assumedScale: 'Your code does not fix the figure’s size, or saves it cropped: the edited script sets it.',
  },
  fix: {
    title: 'Raise these text elements',
    titleAssumed: 'Set the sizes your code leaves out',
    copyEdited: 'Copy edited code',
    youSetThis: ' (you set this)',
    openFull: 'Open full edited code →',
    yourScript: 'Replace your code with this version: your script with the sizes above set, and the figure saved at the size checked.',
    whereR:
      'One theme() goes into the plot your ggsave() saves or your device draws (print(p), or the plot on a line of its own, which the edited script prints), after every theme of yours, so ggplot2 applies it last; a figure that combines plots gets one in each plot, before they are combined. It sets the sizes listed, never below the size the table shows, raises a size the check cannot read to at least the size needed, read when the script runs, raises a size a legend’s own guide sets where it is written, and sets the base text size when your code sets none and its theme is one of ggplot2’s. When the check finds no ggsave() and no plot drawn to a device, a ggsave() is added at the size checked, saving poster_figure.png.',
    wherePython:
      'Each size is changed where your code sets it, and a size your code does not set is set before the text it sizes is made, so your layout calls make room for it. No size is set below the one the table shows, and a size your code sets in a way the check cannot read is raised to at least the size needed, read when the script runs, never below what your code sets. The figure is saved at the size checked; a save cropped with bbox_inches="tight" keeps what its crop kept when that fits the canvas at the sizes needed, so text outside the plots stays in the image.',
    orChangeOne: (setting: string, size: number) => `Or change one number: ${setting} = ${size}`,
    simplerToPaste: (setting: string) =>
      `Simpler to paste. It moves every text size that follows ${setting}, including the ones already large enough, and leaves the sizes your code sets directly as they are.`,
    copySnippet: 'Copy snippet',
  },
  allPass: 'Every element in the table meets its minimum at this poster size.',
  allPassAssumed:
    'Every element in the table meets its minimum, with the sizes marked * assumed. Replace your code with the version below so the figure prints this way.',
  allPassAssumedKept: 'Every element in the table meets its minimum, with the sizes marked * assumed: check those yourself.',
  copied: '✓ Copied',
  modal: {
    title: 'Full edited code',
    close: 'Close',
    closeTitle: 'Close (Esc)',
    copyFull: 'Copy full code',
  },
};

export type ReadabilityCopy = typeof en;

const fr: ReadabilityCopy = {
  heading: 'Vérification de la lisibilité du code',
  introLead: '🔎 Collez votre code de tracé R ou Python, puis cliquez sur',
  introCheck: 'Vérifier',
  introTail: 'pour voir à quelle taille ses titres, ses étiquettes et sa légende seront imprimés sur l’affiche.',
  sizing: {
    image: 'Taille du bloc d’image sélectionné',
    pageLead: 'Taille de référence\u00a0: la taille d’impression saisie ci-dessus',
    pageMiddle: '. Modifiez la largeur ou la hauteur et cliquez de nouveau sur',
    pageTail: '.',
    panelLead: 'Taille de référence\u00a0: le',
    panelPreview: 'cadre gris d’aperçu de la figure',
    panelMiddle: 'sur le canevas',
    panelTail:
      '— faites-le glisser ou redimensionnez-le pour qu’il corresponde à votre vraie figure, ou cliquez sur un bloc d’image existant pour utiliser ses dimensions exactes.',
  },
  languages: { auto: 'Auto', r: 'R', python: 'Python' },
  editorLabel: 'Votre code de tracé R ou Python',
  editorPlaceholder: '# Collez votre code ggplot / matplotlib ici…',
  detected: (label: string) => `Détecté\u00a0: ${label}`,
  assumedLabel: (language: string, system: string) => `${language} (vérifié comme ${system})`,
  systemNames: { base: 'graphiques de base', baseR: 'graphiques de base de R' },
  cantTellIdle: 'Impossible de distinguer R de Python. Choisissez-en un ci-dessus.',
  waiting: 'La détection automatique attend du code…',
  cannotTell: 'Impossible de distinguer R de Python — choisissez R (ggplot2) ou Python (matplotlib).',
  unsupported: (name: string) =>
    `Pas encore pris en charge\u00a0: ${name}. La vérification lit R (ggplot2) et Python (matplotlib).`,
  resized: 'La taille d’impression a changé\u00a0: cliquez de nouveau sur Vérifier pour obtenir un résultat à cette taille.',
  checkedAs: (label: string) => `Vérifié comme ${label}\u00a0: `,
  belowCount: (below: number, total: number) =>
    below === 0
      ? 'chaque élément de texte atteint son minimum.'
      : below === 1
        ? `1\u00a0élément de texte sur ${total} est sous le minimum.`
        : `${below}\u00a0éléments de texte sur ${total} sont sous le minimum.`,
  check: '▶ Vérifier',
  copiedLead: '✓ Copié dans le presse-papiers —',
  copiedTail: {
    panel: 'collez-le dans votre éditeur, exécutez-le de nouveau et téléversez de nouveau l’image.',
    page: 'collez-le dans votre script, exécutez-le de nouveau et imprimez à cette taille.',
  },
  outOfDate:
    'Périmé\u00a0: ce résultat vient de votre dernière vérification, avant que le code ou le langage ne change.',
  scale: (factor: string) => `Facteur d’échelle\u00a0: ${factor}\u00a0×`,
  scaleSuffix: {
    panel: ' (taille de bloc par défaut)',
    page: ' (canevas source → taille imprimée)',
  },
  table: {
    element: 'Élément',
    source: 'Source',
    sourceTitle: 'La taille que la vérification a lue dans votre code',
    print: 'Impression',
    printTitle: 'Ce qu’elle mesure une fois la figure mise à l’échelle sur l’affiche',
    min: 'Min.',
    minTitle: 'Le minimum de Postr pour cet élément sur une affiche',
    verdict: 'Résultat',
  },
  legend: {
    title: 'Ce que signifient les indicateurs',
    passLead: 'Au minimum ou au-dessus.',
    passBody: 'Rien à changer.',
    warnLead: 'Jusqu’à 15\u00a0% sous le minimum.',
    warnBody:
      'Lisible de près, difficile à lire du fond de la salle — et un petit changement de la taille de la figure le fait passer au rouge. À corriger, pas à ignorer.',
    failLead: 'Plus de 15\u00a0% sous le minimum.',
    failBody: 'Augmentez-le avant d’imprimer.',
    sourceWord: 'Source',
    sourceText: 'est la taille que la vérification a lue dans votre code.',
    printWord: 'Impression',
    printText:
      'est ce qu’elle mesure sur l’affiche une fois la figure mise à l’échelle du bloc, et c’est ce nombre qui est comparé au',
    minWord: 'Min.',
    minTail: '',
    readsPython:
      'Elle lit la taille de la figure, font.size et la taille propre à chaque élément dans rcParams (aussi dans plt.rc() et rc_context()), set_theme() et set_context() de seaborn, les feuilles de style intégrées de matplotlib, et les tailles que votre code donne aux titres, aux titres d’axes, aux étiquettes de graduation, aux légendes, aux barres de couleurs et aux notes, dans l’ordre où votre code les fixe.',
    readsR:
      'Elle lit base_size (nommé ou non), les tailles que theme() fixe, text et title compris, theme_set() et theme_update(), les tailles que fixe le guide propre d’une légende, chaque graphique d’une figure qui en assemble plusieurs (cowplot, gridExtra), et la taille de ggsave() avec ses unités et son facteur scale, ou d’un périphérique png(), pdf() ou ragg, et un thème rangé dans un nom ou une fonction là où il est utilisé, dans l’ordre où ggplot2 les applique.',
    assumedLead: 'Absente de votre code.',
    assumedBody:
      'La taille affichée est la valeur par défaut que la vérification suppose. Le script modifié ci-dessous la fixe, pour que la figure s’imprime comme indiqué.',
    assumedBodySome:
      'La taille affichée est la valeur par défaut que la vérification suppose. Le script modifié ci-dessous la fixe, sauf une taille d’un graphique que la vérification ne trouve pas par son nom, par exemple un graphique créé dans l’appel qui assemble les graphiques\u00a0: vérifiez celle-là vous-même.',
    assumedBodyKept:
      'La taille affichée est la valeur par défaut que la vérification suppose. Elle appartient à un graphique que la vérification ne trouve pas par son nom, par exemple un graphique créé dans l’appel qui assemble les graphiques, et le script modifié ne peut donc pas la fixer\u00a0: vérifiez-la vous-même.',
    assumedRow: 'Votre code ne fixe pas cette taille\u00a0: la valeur par défaut est supposée.',
    unreadLead: 'Non lue dans votre code.',
    unreadBody:
      'Votre code fixe cette taille d’une façon que la vérification ne sait pas lire, par exemple une valeur tirée d’une configuration ou un thème qui n’est pas l’un de ceux de ggplot2\u00a0: la taille affichée est la valeur par défaut supposée. Le script modifié la relève au moins à la taille nécessaire, lue à l’exécution du script, donc jamais sous ce que fixe votre code.',
    unreadBodyKept:
      'Votre code fixe cette taille d’une façon que la vérification ne sait pas lire\u00a0: la taille affichée est la valeur par défaut supposée. Le script modifié la relève au moins à la taille nécessaire, lue à l’exécution du script, donc jamais sous ce que fixe votre code\u00a0; une taille rangée dans un FontProperties sans taille, ou dans un ** ou un fontdict= dont il ne voit pas le contenu, peut rester telle qu’écrite\u00a0: vérifiez celle-là vous-même.',
    unreadRow: 'Votre code fixe cette taille d’une façon que la vérification ne sait pas lire\u00a0: la valeur par défaut est supposée.',
    assumedScale: 'Votre code ne fixe pas la taille de la figure, ou l’enregistre rognée\u00a0: le script modifié la fixe.',
  },
  fix: {
    title: 'Augmentez ces éléments de texte',
    titleAssumed: 'Fixez les tailles que votre code omet',
    copyEdited: 'Copier le code modifié',
    youSetThis: ' (vous l’avez fixé)',
    openFull: 'Ouvrir le code modifié complet →',
    yourScript:
      'Remplacez votre code par cette version\u00a0: votre script, avec les tailles ci-dessus fixées et la figure enregistrée à la taille vérifiée.',
    whereR:
      'Un theme() est placé dans le graphique qu’enregistre votre ggsave() ou que dessine votre périphérique (print(p), ou le graphique seul sur sa ligne, que le script modifié imprime), après chacun de vos thèmes, pour que ggplot2 l’applique en dernier\u00a0; une figure qui assemble plusieurs graphiques en reçoit un dans chacun d’eux, avant leur assemblage. Il fixe les tailles indiquées, jamais sous la taille qu’affiche le tableau, relève une taille que la vérification ne sait pas lire au moins à la taille nécessaire, lue à l’exécution du script, relève là où elle est écrite une taille que fixe le guide propre d’une légende, et fixe la taille de base du texte quand votre code n’en fixe pas et que son thème est l’un de ceux de ggplot2. Quand la vérification ne trouve ni ggsave() ni graphique dessiné dans un périphérique, un ggsave() est ajouté à la taille vérifiée, qui enregistre poster_figure.png.',
    wherePython:
      'Chaque taille est modifiée là où votre code la fixe, et une taille que votre code ne fixe pas est fixée avant la création du texte qu’elle règle, pour que vos appels de mise en page lui fassent de la place. Aucune taille n’est fixée sous celle qu’affiche le tableau, et une taille que votre code fixe d’une façon que la vérification ne sait pas lire est relevée au moins à la taille nécessaire, lue à l’exécution du script, jamais sous ce que fixe votre code. La figure est enregistrée à la taille vérifiée; un enregistrement rogné par bbox_inches="tight" garde ce que son rognage gardait quand cela tient dans le canevas aux tailles nécessaires, pour que le texte hors des graphiques reste dans l’image.',
    orChangeOne: (setting: string, size: number) => `Ou changez un seul nombre\u00a0: ${setting} = ${size}`,
    simplerToPaste: (setting: string) =>
      `Plus simple à coller. Ce changement modifie toutes les tailles de texte qui suivent ${setting}, y compris celles qui sont déjà assez grandes, et laisse telles quelles les tailles que votre code fixe directement.`,
    copySnippet: 'Copier l’extrait',
  },
  allPass: 'Chaque élément du tableau atteint son minimum à cette taille d’affiche.',
  allPassAssumed:
    'Chaque élément du tableau atteint son minimum, avec les tailles marquées * supposées. Remplacez votre code par la version ci-dessous pour que la figure s’imprime ainsi.',
  allPassAssumedKept: 'Chaque élément du tableau atteint son minimum, avec les tailles marquées * supposées\u00a0: vérifiez-les vous-même.',
  copied: '✓ Copié',
  modal: {
    title: 'Code modifié complet',
    close: 'Fermer',
    closeTitle: 'Fermer (Échap)',
    copyFull: 'Copier tout le code',
  },
};

export const READABILITY_COPY: Bilingual<ReadabilityCopy> = { en, fr };
