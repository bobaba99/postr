/**
 * The plot checker engine's own words in the page's language (fix 26).
 *
 * poster/readability.ts names its table rows ("Axis titles") and writes
 * its warnings in English, and the editor shows them as they are. The
 * French page shows them in French: each row name from a table, and each
 * warning by the shape of its English sentence (`WARNINGS`), its numbers
 * in French style (6.4 → 6,4; 10.0"×7.0" → 10,0 po × 7,0 po). A warning
 * whose shape is not listed is shown in English, which
 * __tests__/readabilityWarnings.test.ts makes a failing test: it triggers
 * every warning the engine writes and asks for a French one.
 */
import type { Lang } from './lang';

/** The engine's row names (readability.ts R_ELEMENTS, PY_ELEMENTS), in French. */
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

/** The engine's size labels for "No ggsave() found — using …" (readability.ts DEFAULT_SIZE_LABEL, the page's token). */
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
  [
    /^No font\.size found — assuming matplotlib default font\.size = ([\d.]+)pt\.$/,
    (m) => `Aucun font.size trouvé — font.size par défaut de matplotlib utilisé${N}: ${num(m[1]!)}${N}pt.`,
  ],
  [
    /^No canvas size found — assuming matplotlib default ([\d.]+)"×([\d.]+)"\.$/,
    (m) =>
      `Aucune taille de canevas trouvée — taille par défaut de matplotlib utilisée${N}: ${inches(m[1]!)} × ${inches(m[2]!)}.`,
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
