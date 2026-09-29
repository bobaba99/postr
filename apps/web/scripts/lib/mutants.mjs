/**
 * Mutant specs (docs/fixes/NN-slug[.part].mutants.json), shared by
 * mutation-check.mjs (vitest) and editorHarness.mjs (the browser). A mutant
 * is a list of exact text edits that undo one part of a fix; the repo is
 * never written, the edited source is served through a Vite `load` hook.
 */
import fs from 'node:fs';
import path from 'node:path';

export function loadSpec(specPath) {
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  if (!Array.isArray(spec.tests) || spec.tests.length === 0) throw new Error('spec.tests must list test files');
  if (!spec.mutants || typeof spec.mutants !== 'object') throw new Error('spec.mutants is required');
  return spec;
}

/**
 * Apply a mutant's edits in memory. Returns Map<absPath, mutatedSource>.
 * Each edit's text must occur exactly as often as its optional 4th element
 * says (default 1): a pattern that matches nothing would report a mutant as
 * surviving for the wrong reason.
 */
export function mutate(web, mutant) {
  const byFile = new Map();
  for (const [rel, from, to, times = 1] of mutant.edits) {
    const abs = path.join(web, rel);
    const src = byFile.get(abs) ?? fs.readFileSync(abs, 'utf8');
    const found = src.split(from).length - 1;
    if (found !== times) {
      throw new Error(`pattern found ${found}× (expected ${times}) in ${rel}: ${JSON.stringify(from.slice(0, 80))}`);
    }
    byFile.set(abs, src.split(from).join(to));
  }
  return byFile;
}

/** A Vite plugin that serves the mutated sources in place of the files. */
export function mutantPlugin(byFile) {
  return {
    name: 'mutant-loader',
    enforce: 'pre',
    load(id) {
      return byFile.get(id.split('?')[0]) ?? null;
    },
  };
}
