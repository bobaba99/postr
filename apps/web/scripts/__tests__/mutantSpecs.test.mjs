/**
 * Every committed mutant spec (docs/fixes/*.mutants.json) still applies to
 * the code. A spec with a pattern that no longer matches cannot run at all:
 * mutation-check.mjs stops at "bad spec", so every part of the fix it
 * guards is silently unguarded. Fix 03 rewrote the fit code and left fix
 * 02's sheet spec that way. In the suite, the change that stales a spec
 * fails here, and the spec is ported in the same commit.
 *
 * It never runs the mutants: a pattern that still matches, but in code that
 * now means something else, passes here. Only mutation-check.mjs shows that
 * a mutant is still killed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadSpec, mutate } from '../lib/mutants.mjs';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXES = path.resolve(WEB, '../../docs/fixes');
const specs = fs.readdirSync(FIXES).filter((f) => f.endsWith('.mutants.json')).sort();

/** Everything wrong with one spec, so a stale spec names every stale mutant at once. */
function problems(name) {
  const spec = loadSpec(path.join(FIXES, name));
  const found = [];
  if (Object.keys(spec.mutants).length === 0) found.push('lists no mutant');
  for (const test of spec.tests) if (!fs.existsSync(path.join(WEB, test))) found.push(`test file not found: ${test}`);
  for (const [id, mutant] of Object.entries(spec.mutants)) {
    if ((mutant.edits ?? []).some(([, from, to]) => from === to)) found.push(`${id}: an edit changes nothing`);
    const harness = mutant.browser?.harness;
    if (harness && !fs.existsSync(path.join(WEB, harness))) found.push(`${id}: browser harness not found: ${harness}`);
    try {
      mutate(WEB, mutant);
    } catch (e) {
      found.push(`${id}: ${e.message}`);
    }
  }
  return found;
}

describe('committed mutant specs', () => {
  it('finds them', () => {
    expect(specs.length).toBeGreaterThan(0);
  });

  it.each(specs)('%s loads, names files that exist, and every mutant applies and changes something', (name) => {
    expect(problems(name)).toEqual([]);
  });
});
