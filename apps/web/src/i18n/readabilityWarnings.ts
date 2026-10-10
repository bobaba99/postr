/**
 * The plot checker engine's own words in the page's language (fix 26).
 *
 * poster/readability.ts names its table rows ("Axis titles") and its readers
 * (readabilityPyModel.ts, readabilityRModel.ts) write their warnings in English, and the editor shows them as they are. The
 * French page shows them in French: each row name from a table, and each
 * warning by the shape of its English sentence (`WARNINGS`), its numbers
 * in French style (6.4 → 6,4; 10.0"×7.0" → 10,0 po × 7,0 po). A warning
 * whose shape is not listed is shown in English, which
 * __tests__/readabilityWarnings.test.ts makes a failing test: it triggers
 * every warning the engine writes and asks for a French one.
 */
import type { Lang } from './lang';

/** The engine's row names (readabilityTypes.ts R_ELEMENTS, PY_ELEMENTS), in French. */
const ELEMENT_NAMES_FR: Readonly<Record<string, string>> = {
  'Plot title': 'Titre du graphique',
  'Axis titles': 'Titres des axes',
  'Tick labels': 'Étiquettes des graduations',
  'Legend text': 'Texte de la légende',
  'Legend title': 'Titre de la légende',
  'Strip text': 'Texte des bandeaux',
  Caption: 'Note',
};

/** The English names the engine can give a row (the test checks it gives no other). */
export const ENGINE_ELEMENT_NAMES: readonly string[] = Object.keys(ELEMENT_NAMES_FR);

/** A row's name in the page's language. */
export function elementName(name: string, lang: Lang): string {
  return lang === 'fr' ? (ELEMENT_NAMES_FR[name] ?? name) : name;
}

const N = '\u00a0';
/** "6.4" → "6,4". */
const num = (s: string) => s.replace('.', ',');
/** `10.0"` → `10,0 po`. */
const inches = (s: string) => `${num(s)}${N}po`;

/** The engine's size labels for "No ggsave() found — using …" and "— assuming …" (readabilityTypes.ts DEFAULT_SIZE_LABEL, the page's token). */
const SIZE_LABELS_FR: Readonly<Record<string, string>> = {
  'the print size you entered,': 'la taille d’impression que vous avez saisie,',
  'figure preview size': 'la taille de l’aperçu de la figure,',
};

/** Each English warning shape the engine writes, and its French. */
const WARNINGS: ReadonlyArray<readonly [RegExp, (m: RegExpMatchArray) => string]> = [
  [
    /^No base_size found — assuming ggplot2 default base_size = ([\d.]+)pt\.$/,
    (m) => `Aucun base_size trouvé — base_size par défaut de ggplot2 utilisé${N}: ${num(m[1]!)}${N}pt.`,
  ],
  [
    /^base_size is set from a variable, not a number — scoring against the ggplot2 default ([\d.]+)pt instead\. Put the real value in to check it\.$/,
    (m) =>
      `base_size est fixé par une variable et non par un nombre — l’évaluation utilise plutôt la valeur par défaut de ggplot2, ${num(m[1]!)}${N}pt. Inscrivez la vraie valeur pour la vérifier.`,
  ],
  [
    /^(\S+)\(\) sets in-panel text at size ([\d.]+) \(([\d.]+)pt — ggplot sizes these in mm\)\. In-panel labels are not theme elements, so they are not in the table below; check them yourself\.$/,
    (m) =>
      `${m[1]}() fixe le texte dans le panneau à la taille ${num(m[2]!)} (${num(m[3]!)}${N}pt — ggplot exprime ces tailles en mm). Les étiquettes dans le panneau ne sont pas des éléments du thème; elles ne figurent donc pas dans le tableau ci-dessous. Vérifiez-les vous-même.`,
  ],
  [
    /^(\S+)\(\) draws in-panel text at the theme's default size \(base_size ([\d.]+)\) \(([\d.]+)pt — ggplot sizes these in mm\)\. In-panel labels are not theme elements, so they are not in the table below; check them yourself\.$/,
    (m) =>
      `${m[1]}() dessine le texte dans le panneau à la taille par défaut du thème (base_size ${num(m[2]!)}) (${num(m[3]!)}${N}pt — ggplot exprime ces tailles en mm). Les étiquettes dans le panneau ne sont pas des éléments du thème; elles ne figurent donc pas dans le tableau ci-dessous. Vérifiez-les vous-même.`,
  ],
  [
    /^Found ggsave\(\) but could not read its width\/height — using ([\d.]+)"×([\d.]+)" instead\. Check the call\.$/,
    (m) =>
      `ggsave() trouvé, mais sa largeur ou sa hauteur est illisible — ${inches(m[1]!)} × ${inches(m[2]!)} est utilisé à la place. Vérifiez l’appel.`,
  ],
  [
    /^Unrecognised units = "([^"]*)" in ggsave\(\) — treating the canvas as inches\.$/,
    (m) => `Unité units = "${m[1]}" non reconnue dans ggsave() — le canevas est traité en pouces.`,
  ],
  [
    /^No ggsave\(\) found — using (.+?) ([\d.]+)"×([\d.]+)" as the source canvas\.$/,
    (m) =>
      `Aucun ggsave() trouvé — ${SIZE_LABELS_FR[m[1]!] ?? `${m[1]!},`} ${inches(m[2]!)} × ${inches(m[3]!)}, sert de canevas source.`,
  ],
  [
    /^No canvas size found — assuming R default ([\d.]+)"×([\d.]+)" \(ggsave\)\.$/,
    (m) =>
      `Aucune taille de canevas trouvée — taille par défaut de R utilisée${N}: ${inches(m[1]!)} × ${inches(m[2]!)} (ggsave).`,
  ],
  // Fix 13b: the Python rule table's warnings (readabilityPyModel.ts) and the R one's new shape (readabilityRModel.ts).
  [
    /^No font size found for some text — matplotlib’s defaults are assumed \(marked \*\); the edited script sets them\.$/,
    () => `Aucune taille de police trouvée pour une partie du texte — les valeurs par défaut de matplotlib sont supposées (marquées *); le script modifié les fixe.`,
  ],
  [
    /^A text size in your code could not be read — the rows marked \* assume matplotlib’s default; the edited script raises each one it can reach to at least the size needed, never below what your code sets\.$/,
    () => `Une taille de texte de votre code est illisible — les lignes marquées * supposent la valeur par défaut de matplotlib; le script modifié relève chacune de celles qu’il peut atteindre au moins à la taille nécessaire, jamais sous ce que fixe votre code.`,
  ],
  [
    /^A style sheet the check does not know \((.*)\) may set text sizes — the sizes below are what matplotlib draws without it\.$/,
    (m) => `Une feuille de style que la vérification ne connaît pas (${m[1]}) peut fixer des tailles de texte — les tailles ci-dessous sont celles que matplotlib dessine sans elle.`,
  ],
  [
    /^No canvas size found — assuming matplotlib default ([\d.]+)"×([\d.]+)"; the edited script sets it\.$/,
    (m) => `Aucune taille de canevas trouvée — taille par défaut de matplotlib supposée${N}: ${inches(m[1]!)} × ${inches(m[2]!)}; le script modifié la fixe.`,
  ],
  [
    /^Could not read the figure size in your code — assuming (.+?) ([\d.]+)"×([\d.]+)"; the edited script sets it\.$/,
    (m) => `La taille de la figure dans votre code est illisible — ${SIZE_LABELS_FR[m[1]!] ?? `${m[1]!},`} ${inches(m[2]!)} × ${inches(m[3]!)}, est supposée; le script modifié la fixe.`,
  ],
  [
    /^seaborn sizes this grid from its facets and legend, which the code does not give — assuming (.+?) ([\d.]+)"×([\d.]+)"; the edited script sets the figure to it\.$/,
    (m) => `seaborn dimensionne cette grille d’après ses facettes et sa légende, que le code ne donne pas — ${SIZE_LABELS_FR[m[1]!] ?? `${m[1]!},`} ${inches(m[2]!)} × ${inches(m[3]!)}, est supposée; le script modifié donne cette taille à la figure.`,
  ],
  [
    /^Saved with bbox_inches="tight", which crops the image to another size than the ([\d.]+)"×([\d.]+)" figure, so the print sizes below may be off; the edited script saves at the figure’s size\.$/,
    (m) => `Enregistrée avec bbox_inches="tight", qui rogne l’image à une autre taille que la figure de ${inches(m[1]!)} × ${inches(m[2]!)}${N}: les tailles imprimées ci-dessous peuvent être fausses; le script modifié l’enregistre à la taille de la figure.`,
  ],
  [
    /^Shown in a notebook, which crops the image to another size than the ([\d.]+)"×([\d.]+)" figure, so the print sizes below may be off; the edited script saves at the figure’s size\.$/,
    (m) => `Affichée dans un notebook, qui rogne l’image à une autre taille que la figure de ${inches(m[1]!)} × ${inches(m[2]!)}${N}: les tailles imprimées ci-dessous peuvent être fausses; le script modifié l’enregistre à la taille de la figure.`,
  ],
  [
    /^(\S+)\(\) is not one of ggplot2's themes — its sizes are assumed to follow ggplot2's\.$/,
    (m) => `${m[1]}() n’est pas un thème de ggplot2 — ses tailles sont supposées suivre celles de ggplot2.`,
  ],
  // Fix 13b, review round 2 (readabilityRModel.ts): a device whose size cannot be read, and a figure combining plots the check cannot name.
  [
    /^Found (\S+)\(\) but could not read its width\/height — using ([\d.]+)"×([\d.]+)" instead\. Check the call\.$/,
    (m) =>
      `${m[1]}() trouvé, mais sa largeur ou sa hauteur est illisible — ${inches(m[2]!)} × ${inches(m[3]!)} est utilisé à la place. Vérifiez l’appel.`,
  ],
  // Review round 3 (P13B-R3-04): a device whose plot the check cannot find.
  [
    /^Found (\S+)\(\) but not the plot it draws \(print\(p\), or the plot on a line of its own\) — the edited script saves the plot with ggsave\(\) as poster_figure\.png\.$/,
    (m) =>
      `${m[1]}() trouvé, mais pas le graphique qu’il dessine (print(p), ou le graphique seul sur sa ligne) — le script modifié enregistre le graphique avec ggsave() dans poster_figure.png.`,
  ],
  [
    /^(\S+)\(\) combines plots the check cannot find by name — the sizes below are read from the whole script and marked \*, and the edited script does not set them: give each plot a name \(p1 <- ggplot\(\.\.\.\)\) and combine the names\.$/,
    (m) =>
      `${m[1]}() assemble des graphiques que la vérification ne trouve pas par leur nom — les tailles ci-dessous sont lues dans tout le script et marquées *, et le script modifié ne les fixe pas${N}: donnez un nom à chaque graphique (p1 <- ggplot(...)) et assemblez les noms.`,
  ],
];

/** A warning in the page's language; English as written when its shape is unknown. */
export function engineWarning(text: string, lang: Lang): string {
  if (lang === 'en') return text;
  for (const [shape, french] of WARNINGS) {
    const m = text.match(shape);
    if (m) return french(m);
  }
  return text;
}
