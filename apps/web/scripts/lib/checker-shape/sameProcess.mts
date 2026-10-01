/**
 * Scripts run one after another in ONE Python (`%run` twice, notebook
 * cells, a runpy driver), for checker-shape-check.mts (fix 13, rounds 4 to
 * 6). The scenarios are fixtures/checker-shapes/same-process/scenarios.json:
 * each a chain of scripts, each fixed at its own print size (the copy
 * button's code), fixed with a need given outright, or left unfixed.
 *
 * Each chain runs in truth/same_process_truth.py fixed, unfixed (every
 * original), and each later fixed script alone, fixed and unfixed. A
 * DEFECT, for a later script of the chain (round 6):
 *   BELOW NEED   a class in its need drawn below the need at a save
 *   LOWER        a text drawn smaller than the unfixed chain draws it
 *   ALONE LOWER / ALONE HIGHER (v6.1)  the script's printed sizes in the
 *                fixed chain against the same script fixed and run alone,
 *                per class (the smallest over its saves, × the print scale;
 *                × 1 for a need given outright): lower at all, or more than
 *                ALONE_SLACK_PT higher. A class the chain itself moves (the
 *                unfixed chain draws it lower, or higher, than the script
 *                unfixed alone) is the earlier script's doing, not the fix's:
 *                then ALONE LOWER is left to BELOW NEED and LOWER, and ALONE
 *                HIGHER is judged against the higher of the two (alone fixed,
 *                unfixed chain). A second fix that keeps the first one's
 *                bigger need (R4-08, falling need) is ALONE HIGHER.
 * and after each script:
 *   RC BELOW     one of the six rc keys Postr sets (axes.titlesize,
 *                axes.labelsize, x/ytick.labelsize, legend.fontsize,
 *                legend.title_fontsize), resolved to points, below its value
 *                after the unfixed chain's same script
 *   RC NOT OWN   (a scenario marked keepsOwn: a script that sets a key itself
 *                after a figure) any of the six not at the unfixed value
 * Printed beside them: each later script's sizes fixed in the chain, fixed
 * alone, and unfixed in the chain, drawn and printed (× the print scale).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Found } from './known.mts';
import { runTruth } from './python.mts';

const CLASSES = ['plotTitle', 'axisTitle', 'axisText', 'legendText', 'caption', 'legendTitle'];
const EPS = 1e-6;
/** Printed points a later script may draw above the same script fixed alone (v6.1). */
export const ALONE_SLACK_PT = 1;

type Step = { file: string; size?: string; need?: Record<string, number>; fixed?: boolean };
type Scenario = { name: string; origin: string; why: string; keepsOwn?: boolean; steps: Step[] };
type ScriptRun = { script: string; error: string | null; saves: Array<Record<string, number>>; rc: Record<string, unknown>; rc_pt: Record<string, number> };
type ChainRun = { error: string | null; scripts: ScriptRun[] };

export type Maker = {
  /** The copy button's code for `code` at w × h in: the fix, its need and the print scale. */
  page: (code: string, w: number, h: number) => { fix: string; need: Record<string, number>; scale: number };
  /** The copy button's code with a need given outright (a need literal, as the panel hands it on). */
  forced: (code: string, need: Record<string, number>) => string;
};

export type ScenarioResult = { name: string; found: Found[]; lines: string[] };

const pyLiteral = (need: Record<string, number>) => `{${Object.entries(need).map(([k, v]) => `'${k}': ${v}`).join(', ')}}`;
export { pyLiteral };

const fmt = (sizes: Record<string, number> | undefined) => (sizes ? CLASSES.filter((c) => sizes[c] !== undefined).map((c) => `${c} ${sizes[c]}`).join(', ') : '-');

function minOver(saves: Array<Record<string, number>>) {
  const out: Record<string, number> = {};
  for (const s of saves) for (const [k, v] of Object.entries(s)) out[k] = Math.min(out[k] ?? Infinity, v);
  return out;
}

export function loadScenarios(dir: string): Scenario[] {
  const file = path.join(dir, 'scenarios.json');
  return (JSON.parse(fs.readFileSync(file, 'utf8')) as { scenarios: Scenario[] }).scenarios;
}

export async function checkScenario(sc: Scenario, dir: string, outDir: string, out: string, truthPy: string, make: Maker,
  fail: (why: string) => never): Promise<ScenarioResult> {
  const root = path.join(outDir, sc.name);
  fs.mkdirSync(root, { recursive: true });
  const built = sc.steps.map((step, j) => {
    const src = path.join(dir, step.file);
    const code = fs.readFileSync(src, 'utf8');
    let fix = code;
    let need: Record<string, number> = {};
    let scale: number | null = null;
    if (step.fixed !== false && step.need) {
      need = step.need;
      fix = make.forced(code, step.need);
    } else if (step.fixed !== false) {
      const [w, h] = (step.size ?? '6x4.5').split('x').map(Number);
      const got = make.page(code, w!, h!);
      ({ fix, need, scale } = got);
    }
    const fixedPath = path.join(root, `${j}-${step.file.replace(/\.py$/, '')}${step.fixed === false ? '' : '.fixed'}.py`);
    fs.writeFileSync(fixedPath, fix);
    return { step, src, fixedPath, need, scale, fixed: step.fixed !== false };
  });
  const chain = (paths: string[]) => runTruth<ChainRun>([truthPy, ...paths], out);
  const later = built.slice(1);
  const [fixedRun, unfixedRun, ...rest] = await Promise.all([
    chain(built.map((b) => b.fixedPath)),
    chain(built.map((b) => b.src)),
    ...later.map((b) => (b.fixed ? chain([b.fixedPath]) : Promise.resolve(null))),
    ...later.map((b) => (b.fixed ? chain([b.src]) : Promise.resolve(null))),
  ]);
  const alone = rest.slice(0, later.length);
  const aloneUnfixed = rest.slice(later.length);
  if (!unfixedRun || unfixedRun.error) fail(`the unfixed chain ${sc.name} does not run: ${unfixedRun?.error ?? 'no output'}`);
  const found: Found[] = [];
  const lines: string[] = [];
  if (!fixedRun || fixedRun.error) {
    return { name: sc.name, found: [{ judgement: 'same-process', tag: 'CRASH', text: `CRASH ${fixedRun?.error ?? 'no output'}` }], lines };
  }
  built.forEach((b, j) => {
    const f = fixedRun.scripts[j]!;
    const u = unfixedRun.scripts[j]!;
    // After each script: the six rc keys, fixed against unfixed.
    for (const [key, pt] of Object.entries(f.rc_pt)) {
      if (key === 'font.size') continue;
      const want = u.rc_pt[key]!;
      if (pt < want - EPS) {
        found.push({ judgement: 'same-process', tag: `RC BELOW ${j} ${key}`, value: pt,
          text: `RC BELOW after ${b.step.file}: ${key} ${JSON.stringify(f.rc[key])} (${pt} pt), unfixed ${JSON.stringify(u.rc[key])} (${want} pt)` });
      } else if (sc.keepsOwn && j === 0 && Math.abs(pt - want) > EPS) {
        found.push({ judgement: 'same-process', tag: `RC NOT OWN ${j} ${key}`, value: pt,
          text: `RC NOT OWN after ${b.step.file}: ${key} ${JSON.stringify(f.rc[key])} (${pt} pt), the script's own ${JSON.stringify(u.rc[key])} (${want} pt)` });
      }
    }
    if (j === 0) return;
    const aligned = f.saves.length === u.saves.length;
    f.saves.forEach((s, k) => {
      const ref = aligned ? u.saves[k]! : minOver(u.saves);
      for (const cls of CLASSES) {
        if (s[cls] !== undefined && ref[cls] !== undefined && s[cls]! < ref[cls]! - EPS) {
          found.push({ judgement: 'same-process', tag: `LOWER ${j} save${k}:${cls}`, value: ref[cls]! - s[cls]!,
            text: `LOWER ${b.step.file} save${k}: ${cls} ${s[cls]} where the unfixed chain draws ${ref[cls]}` });
        }
      }
      if (!b.fixed) return;
      for (const [cls, pt] of Object.entries(b.need)) {
        if (s[cls] !== undefined && s[cls]! < pt - EPS) {
          found.push({ judgement: 'same-process', tag: `BELOW NEED ${j} save${k}:${cls}`, value: pt - s[cls]!,
            text: `BELOW NEED ${b.step.file} save${k}: ${cls} ${s[cls]} < ${pt}` });
        }
      }
    });
    const a = alone[j - 1];
    const au = aloneUnfixed[j - 1];
    const printed = (s: Record<string, number>) => (b.scale ? ` (printed ${CLASSES.filter((c) => s[c] !== undefined).map((c) => `${c} ${(s[c]! * b.scale!).toFixed(1)}`).join(', ')})` : '');
    const mf = minOver(f.saves);
    lines.push(`${b.step.file}${b.fixed ? ` need ${JSON.stringify(b.need)}` : ' (unfixed)'}: in the chain ${fmt(mf)}${printed(mf)}; alone ${a ? fmt(minOver(a.scripts[0]!.saves)) : '-'}; unfixed chain ${fmt(minOver(u.saves))}; unfixed alone ${au ? fmt(minOver(au.scripts[0]!.saves)) : '-'}`);
    // The fixed chain against the same script fixed and run alone (v6.1).
    if (!b.fixed) return;
    if (!a || a.error || !au || au.error) {
      found.push({ judgement: 'same-process', tag: `ALONE CRASH ${j}`, text: `ALONE ${b.step.file} does not run alone: ${a?.error ?? au?.error ?? 'no output'}` });
      return;
    }
    const scale = b.scale ?? 1;
    const ma = minOver(a.scripts[0]!.saves);
    const mau = minOver(au.scripts[0]!.saves);
    const mu = minOver(u.saves);
    for (const cls of CLASSES) {
      if (mf[cls] === undefined || ma[cls] === undefined) continue;
      const chainLowers = mu[cls] !== undefined && mau[cls] !== undefined && mu[cls]! < mau[cls]! - EPS;
      const chainRaises = mu[cls] !== undefined && mau[cls] !== undefined && mu[cls]! > mau[cls]! + EPS;
      const inChain = mf[cls]! * scale;
      const byItself = ma[cls]! * scale;
      if (!chainLowers && inChain < byItself - EPS) {
        found.push({ judgement: 'same-process', tag: `ALONE LOWER ${j} ${cls}`, value: byItself - inChain,
          text: `ALONE LOWER ${b.step.file}: ${cls} printed ${inChain.toFixed(2)} pt in the chain, ${byItself.toFixed(2)} pt fixed alone` });
      }
      const ceiling = chainRaises ? Math.max(byItself, mu[cls]! * scale) : byItself;
      if (inChain > ceiling + ALONE_SLACK_PT) {
        found.push({ judgement: 'same-process', tag: `ALONE HIGHER ${j} ${cls}`, value: inChain - ceiling,
          text: `ALONE HIGHER ${b.step.file}: ${cls} printed ${inChain.toFixed(2)} pt in the chain, ${byItself.toFixed(2)} pt fixed alone${chainRaises ? ` (the unfixed chain ${(mu[cls]! * scale).toFixed(2)})` : ''}, more than ${ALONE_SLACK_PT} pt higher` });
      }
    }
  });
  lines.push(`rc after each script, fixed | unfixed: ${fixedRun.scripts.map((s, j) => `${JSON.stringify(s.rc)} | ${JSON.stringify(unfixedRun.scripts[j]!.rc)}`).join(' ; ')}`);
  return { name: sc.name, found, lines };
}
