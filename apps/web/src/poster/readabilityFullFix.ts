/**
 * "Full edited code" — the script the page asks the user to use in place of
 * theirs (fix 13b, the owner's design of 2026-10-07): their own script with
 * plain edits that set every text size below its minimum, every size and
 * canvas the code leaves out, and a save at the size the check scored.
 *
 * Python: readabilityPyFix.ts (values replaced where they are written, the
 * missing ones set before the figure is made, the canvas fixed, the save
 * uncropped). R: readabilityRFix.ts (one final theme() in the plot ggsave()
 * saves, and a ggsave() with the size).
 *
 * The canvas a script is given when its own cannot be read is the size the
 * check was SCORED against (`options`: the typed print size on the public
 * page, the figure preview or the image's printed box in the editor), so the
 * script prints at the scale the table shows.
 *
 * Part 1's base_size rewriter (generateFullFix) was unreachable from the
 * panel (record 13b, the reproducer's H-D-alt) and is gone.
 */
import { fixPythonScript } from './readabilityPyFix';
import { fixRScript } from './readabilityRFix';
import { PY_ELEMENTS, R_ELEMENTS } from './readabilityTypes';
import type { FigureParams, ParseOptions, ReadabilityResult } from './readability';

/** The page offers the script when a row falls short, or a size or the canvas is assumed. */
export function offersScript(result: ReadabilityResult): boolean {
  return result.canvasAssumed || result.elements.some((e) => e.status !== 'pass' || e.assumed);
}

/**
 * The edited script, or '' when there is nothing to set. This is what the
 * copy button hands over: a theme() fragment or an rcParams line would
 * leave the user to work out where it goes, and pasting it in the wrong
 * place produces code that runs and changes nothing.
 */
export function generateTargetedFullFix(
  code: string,
  params: FigureParams,
  result: ReadabilityResult,
  options: ParseOptions = {},
): string {
  if (!offersScript(result)) return '';
  const needs = result.fontFixes.map((f) => ({ key: f.key, neededPt: f.neededPt }));
  // The size every class needs at this print size (the rule fontFixes use): a size the check
  // cannot read is floored there whether or not it falls short (P13B-R3-03).
  const floors = (params.language === 'r' ? R_ELEMENTS : PY_ELEMENTS).map((s) => ({ key: s.key, neededPt: Math.ceil(s.minPt / result.scale) }));
  const out = params.language === 'r' ? fixRScript(code, needs, options, floors) : fixPythonScript(code, needs, options, floors);
  // Nothing the script may set (a size marked * that rests on a theme or a
  // value the check must not overwrite): no script, rather than the user's own.
  return out === code ? '' : out;
}
