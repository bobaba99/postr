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
      'It reads font.size in plt.rcParams, seaborn’s context and font_scale, and the sizes given to set_xlabel(), set_ylabel(), set_title() and tick_params(). Check sizes set any other way yourself.',
    readsR:
      'It reads base_size and the sizes theme() sets for the elements in this table. Check sizes set any other way, such as on text or title, yourself.',
  },
  fix: {
    title: 'Raise these text elements',
    copyEdited: 'Copy edited code',
    youSetThis: ' (you set this)',
    openFull: 'Open full edited code →',
    yourScript: 'Your script with the sizes above added. Copy it whole and run it.',
    whereR:
      'The new theme() goes right after your theme_*() call, or at the end of the plot when there is none, and sets only the sizes listed. ggplot applies theme calls in order and the last one wins, so if a theme() of your own comes later and sets one of these sizes, change the number there.',
    wherePython:
      'A small function raises these elements to at least the sizes listed when the figure is saved, so settings earlier in your script cannot undo it.',
    orChangeOne: (setting: string, size: number) => `Or change one number: ${setting} = ${size}`,
    simplerToPaste: (setting: string) =>
      `Simpler to paste. It moves every text size that follows ${setting}, including the ones already large enough, and leaves the sizes your code sets directly as they are.`,
    copySnippet: 'Copy snippet',
  },
  allPass: 'Every element in the table meets its minimum at this poster size.',
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
      'Elle lit font.size dans plt.rcParams, le contexte et le font_scale de seaborn, et les tailles données à set_xlabel(), set_ylabel(), set_title() et tick_params(). Vérifiez vous-même les tailles fixées autrement.',
    readsR:
      'Elle lit base_size et les tailles que theme() fixe pour les éléments de ce tableau. Vérifiez vous-même les tailles fixées autrement, par exemple sur text ou title.',
  },
  fix: {
    title: 'Augmentez ces éléments de texte',
    copyEdited: 'Copier le code modifié',
    youSetThis: ' (vous l’avez fixé)',
    openFull: 'Ouvrir le code modifié complet →',
    yourScript: 'Votre script, avec les tailles ci-dessus ajoutées. Copiez-le en entier et exécutez-le.',
    whereR:
      'Le nouveau theme() est placé juste après votre appel theme_*(), ou à la fin du graphique s’il n’y en a pas, et ne fixe que les tailles indiquées. ggplot applique les appels theme dans l’ordre et le dernier l’emporte\u00a0: si un theme() à vous vient plus loin et fixe l’une de ces tailles, changez le nombre à cet endroit.',
    wherePython:
      'Une petite fonction porte ces éléments au moins aux tailles indiquées au moment d’enregistrer la figure, de sorte que des réglages plus tôt dans votre script ne peuvent pas l’annuler.',
    orChangeOne: (setting: string, size: number) => `Ou changez un seul nombre\u00a0: ${setting} = ${size}`,
    simplerToPaste: (setting: string) =>
      `Plus simple à coller. Ce changement modifie toutes les tailles de texte qui suivent ${setting}, y compris celles qui sont déjà assez grandes, et laisse telles quelles les tailles que votre code fixe directement.`,
    copySnippet: 'Copier l’extrait',
  },
  allPass: 'Chaque élément du tableau atteint son minimum à cette taille d’affiche.',
  copied: '✓ Copié',
  modal: {
    title: 'Code modifié complet',
    close: 'Fermer',
    closeTitle: 'Fermer (Échap)',
    copyFull: 'Copier tout le code',
  },
};

export const READABILITY_COPY: Bilingual<ReadabilityCopy> = { en, fr };
