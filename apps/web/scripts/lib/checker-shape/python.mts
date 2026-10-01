/**
 * The shape harness's Python runs (checker-shape-check.mts, fix 13): each
 * instrument in its own process, at most JOBS at once, the result read from
 * the `@@TRUTH@@` line the instruments print. The instruments chdir to a
 * temporary folder, so a script's own saves never land in a tree.
 *
 * v6.1:
 *   - TIMEOUT. A run still going after PY_TIMEOUT_MS is killed and the whole
 *     check stops as an instrument error (exit 2), never a CRASH defect: a
 *     slow machine is not a broken fix. `onTimeout` sets what is printed.
 *   - Temporary folders. Every Python run gets TMPDIR = one folder of this
 *     run (`<os tmp>/postr-shape-run-XXXXXX`), so the instruments' own
 *     folders (postr_shape_truth_*, postr_layout_truth_*,
 *     postr_same_process_*) and any a script makes land there; the
 *     instruments remove theirs at exit, and `cleanUp` removes the run's
 *     folder at the end of the check, on failure and on SIGINT / SIGTERM
 *     too, after killing any Python still running.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

export const PY = process.env.PY ?? 'python3';
const JOBS = Math.max(1, Number(process.env.JOBS ?? Math.max(2, os.cpus().length - 2)));
export const TIMEOUT_MS = Number(process.env.PY_TIMEOUT_MS ?? 180000);

/** The run's own temporary folder, made on first use, removed by cleanUp. */
let runTmp: string | null = null;
const live = new Set<ChildProcess>();

function tmpRoot(): string {
  if (!runTmp) runTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'postr-shape-run-'));
  return runTmp;
}

/** Kill every Python still running and remove the run's temporary folder. */
export function cleanUp(): void {
  for (const child of live) child.kill('SIGKILL');
  live.clear();
  if (runTmp) {
    fs.rmSync(runTmp, { recursive: true, force: true });
    runTmp = null;
  }
}

let timeoutHandler = (what: string): never => {
  console.error(`[shape-check] instrument error: TIMEOUT ${what}`);
  cleanUp();
  process.exit(2);
};
/** What happens when a run is killed at the timeout (it must end the check). */
export function onTimeout(handler: (what: string) => never): void {
  timeoutHandler = handler;
}

let running = 0;
const waiting: Array<() => void> = [];

/** Run `work` in one of JOBS slots; a finished run hands its slot straight to the next in line. */
async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (running >= JOBS) await new Promise<void>((resolve) => waiting.push(resolve));
  else running += 1;
  try {
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else running -= 1;
  }
}

export function pythonEnv(out: string): NodeJS.ProcessEnv {
  return { ...process.env, PYTHONDONTWRITEBYTECODE: '1', MPLCONFIGDIR: path.join(out, 'mplconfig'), TMPDIR: tmpRoot() };
}

/** Run `python3 <args>`; resolves with its stdout, stderr and exit code (never rejects). A run killed at the timeout ends the check. */
export function runProcess(args: string[], out: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return slot(() => new Promise((resolve) => {
    const child = spawn(PY, args, { env: pythonEnv(out) });
    live.add(child);
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, TIMEOUT_MS);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      clearTimeout(timer);
      live.delete(child);
      if (timedOut) {
        timeoutHandler(`python3 ${args.map((a) => path.basename(a)).join(' ')} was killed after ${TIMEOUT_MS / 1000} s (PY_TIMEOUT_MS); nothing was judged`);
      }
      resolve({ code, stdout, stderr });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      live.delete(child);
      resolve({ code: -1, stdout, stderr: String(error) });
    });
  }));
}

/** An instrument's JSON result (the text after its last `@@TRUTH@@`), or null. */
export async function runTruth<T>(args: string[], out: string): Promise<T | null> {
  const { stdout } = await runProcess(args, out);
  const at = stdout.lastIndexOf('@@TRUTH@@');
  if (at < 0) return null;
  try {
    return JSON.parse(stdout.slice(at + 9)) as T;
  } catch {
    return null;
  }
}
