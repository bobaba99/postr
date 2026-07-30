import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, isAbsolute, join } from 'node:path';
import {
  checklistPrf,
  seededCatchRate,
  spearmanRho,
  weightedKappa,
  type ChecklistVerdict,
} from '../../../../../apps/api/src/review/agreement.ts';

const DIMENSIONS = ['narrative', 'design', 'content'] as const;

export interface AnalysisManifestItem {
  id: string;
  seededIssue: string | null;
}

export interface AnalysisRating {
  posterId: string;
  dimensionScores: Record<(typeof DIMENSIONS)[number], number>;
  checklist: ChecklistVerdict;
  comments: string;
}

export interface AnalysisResult {
  posterId: string;
  critique: {
    dimensionScores: Record<(typeof DIMENSIONS)[number], number>;
    findings: Array<{
      category: string;
      problem: string;
      fix: string;
      severity: string;
    }>;
  };
}

export interface AnalysisInputs {
  manifest: AnalysisManifestItem[];
  gavin: AnalysisRating[];
  checker: AnalysisResult[];
}

export interface LoadAnalysisInputsOptions {
  root: string;
  resultsDir: string;
  categories: readonly string[];
}

export interface RunAnalysisOptions extends LoadAnalysisInputsOptions {
  outFile: string;
}

interface LoadedFile {
  filename: string;
  posterId: string;
  raw: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJson(path: string, label: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function parseManifest(
  root: string,
  categories: ReadonlySet<string>,
): AnalysisManifestItem[] {
  const raw = readJson(
    join(root, 'corpus', 'manifest.json'),
    'corpus manifest',
  );
  if (!isRecord(raw) || !Array.isArray(raw.items)) {
    throw new Error('corpus manifest must contain an items array');
  }

  const seen = new Set<string>();
  return raw.items.map((value, index) => {
    if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()) {
      throw new Error(`corpus manifest item ${index + 1} must have a poster id`);
    }
    if (seen.has(value.id)) {
      throw new Error(`corpus manifest has duplicate poster id "${value.id}"`);
    }
    seen.add(value.id);

    const rawSeededIssue = value.seededIssue;
    let seededIssue: string | null;
    if (rawSeededIssue === null) {
      seededIssue = null;
    } else if (
      typeof rawSeededIssue === 'string' &&
      categories.has(rawSeededIssue)
    ) {
      seededIssue = rawSeededIssue;
    } else {
      throw new Error(
        `corpus manifest item ${value.id} has unknown seeded issue "${String(rawSeededIssue)}"`,
      );
    }
    return { id: value.id, seededIssue };
  });
}

function analysisDirectory(root: string, configured: string): string {
  return isAbsolute(configured) ? configured : join(root, configured);
}

function loadPosterFiles(
  directory: string,
  kind: 'rating' | 'result',
  expectedIds: readonly string[],
): Map<string, LoadedFile> {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    throw new Error(`${kind} directory does not exist: ${directory}`);
  }

  const files = readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        extname(entry.name).toLowerCase() === '.json' &&
        !(kind === 'result' && entry.name === 'run-metadata.json'),
    )
    .map((entry) => {
      const raw = readJson(
        join(directory, entry.name),
        `${kind} file ${entry.name}`,
      );
      if (
        !isRecord(raw) ||
        typeof raw.posterId !== 'string' ||
        !raw.posterId.trim()
      ) {
        throw new Error(
          `${kind} file ${entry.name} must contain a non-empty posterId`,
        );
      }
      return {
        filename: entry.name,
        posterId: raw.posterId,
        raw,
      };
    });

  const grouped = new Map<string, LoadedFile[]>();
  for (const file of files) {
    const group = grouped.get(file.posterId) ?? [];
    group.push(file);
    grouped.set(file.posterId, group);
  }
  for (const [posterId, group] of grouped) {
    if (group.length > 1) {
      throw new Error(
        `duplicate ${kind} files for ${posterId}: ${group
          .map((file) => file.filename)
          .join(', ')}`,
      );
    }
  }

  const expected = new Set(expectedIds);
  const byPosterId = new Map<string, LoadedFile>();
  for (const file of files) {
    const filePosterId = basename(file.filename, extname(file.filename));
    if (filePosterId !== file.posterId) {
      throw new Error(
        `${kind} file ${file.filename} has posterId "${file.posterId}"`,
      );
    }
    if (!expected.has(file.posterId)) {
      throw new Error(
        `${kind} file ${file.filename} has unexpected posterId "${file.posterId}"`,
      );
    }
    byPosterId.set(file.posterId, file);
  }

  for (const posterId of expectedIds) {
    if (!byPosterId.has(posterId)) {
      throw new Error(`missing ${kind} file for ${posterId}`);
    }
  }
  return byPosterId;
}

function validateScores(
  value: unknown,
  label: string,
): Record<(typeof DIMENSIONS)[number], number> {
  if (!isRecord(value)) {
    throw new Error(`${label} dimensionScores must be an object`);
  }
  const scores = {} as Record<(typeof DIMENSIONS)[number], number>;
  for (const dimension of DIMENSIONS) {
    const score = value[dimension];
    if (
      typeof score !== 'number' ||
      !Number.isInteger(score) ||
      score < 1 ||
      score > 5
    ) {
      throw new Error(
        `${label} ${dimension} score must be an integer from 1 to 5`,
      );
    }
    scores[dimension] = score;
  }
  return scores;
}

function validateChecklist(
  value: unknown,
  posterId: string,
  categories: readonly string[],
): ChecklistVerdict {
  if (!isRecord(value)) {
    throw new Error(`rating ${posterId} checklist must be an object`);
  }
  const categorySet = new Set(categories);
  for (const key of Object.keys(value)) {
    if (!categorySet.has(key)) {
      throw new Error(
        `rating ${posterId} checklist has unknown key "${key}"`,
      );
    }
  }
  for (const category of categories) {
    if (!(category in value)) {
      throw new Error(
        `rating ${posterId} checklist is missing key "${category}"`,
      );
    }
    if (typeof value[category] !== 'boolean') {
      throw new Error(
        `rating ${posterId} checklist key "${category}" must be boolean`,
      );
    }
  }
  return Object.fromEntries(
    categories.map((category) => [category, value[category] as boolean]),
  );
}

function parseRating(
  file: LoadedFile,
  categories: readonly string[],
): AnalysisRating {
  const raw = file.raw as Record<string, unknown>;
  if (typeof raw.comments !== 'string') {
    throw new Error(`rating ${file.posterId} comments must be a string`);
  }
  return {
    posterId: file.posterId,
    dimensionScores: validateScores(
      raw.dimensionScores,
      `rating ${file.posterId}`,
    ),
    checklist: validateChecklist(
      raw.checklist,
      file.posterId,
      categories,
    ),
    comments: raw.comments,
  };
}

function parseResult(
  file: LoadedFile,
  categories: ReadonlySet<string>,
): AnalysisResult {
  const raw = file.raw as Record<string, unknown>;
  if (!isRecord(raw.critique)) {
    throw new Error(`result ${file.posterId} critique must be an object`);
  }
  const findingsRaw = raw.critique.findings;
  if (!Array.isArray(findingsRaw)) {
    throw new Error(`result ${file.posterId} findings must be an array`);
  }
  const findings = findingsRaw.map((finding, index) => {
    if (!isRecord(finding)) {
      throw new Error(
        `result ${file.posterId} finding ${index + 1} must be an object`,
      );
    }
    if (
      typeof finding.category !== 'string' ||
      !categories.has(finding.category)
    ) {
      throw new Error(
        `result ${file.posterId} finding ${index + 1} has unknown category "${String(finding.category)}"`,
      );
    }
    const { problem, fix, severity } = finding;
    if (typeof problem !== 'string') {
      throw new Error(
        `result ${file.posterId} finding ${index + 1} problem must be a string`,
      );
    }
    if (typeof fix !== 'string') {
      throw new Error(
        `result ${file.posterId} finding ${index + 1} fix must be a string`,
      );
    }
    if (typeof severity !== 'string') {
      throw new Error(
        `result ${file.posterId} finding ${index + 1} severity must be a string`,
      );
    }
    return {
      category: finding.category,
      problem,
      fix,
      severity,
    };
  });
  return {
    posterId: file.posterId,
    critique: {
      dimensionScores: validateScores(
        raw.critique.dimensionScores,
        `result ${file.posterId}`,
      ),
      findings,
    },
  };
}

export function loadAnalysisInputs(
  options: LoadAnalysisInputsOptions,
): AnalysisInputs {
  const categorySet = new Set(options.categories);
  const manifest = parseManifest(options.root, categorySet);
  const expectedIds = manifest.map((item) => item.id);
  const ratings = loadPosterFiles(
    join(options.root, 'ratings', 'gavin'),
    'rating',
    expectedIds,
  );
  const results = loadPosterFiles(
    analysisDirectory(options.root, options.resultsDir),
    'result',
    expectedIds,
  );

  return {
    manifest,
    gavin: expectedIds.map((id) =>
      parseRating(ratings.get(id)!, options.categories),
    ),
    checker: expectedIds.map((id) =>
      parseResult(results.get(id)!, categorySet),
    ),
  };
}

function renderAnalysisReport(
  inputs: AnalysisInputs,
  categories: readonly string[],
): string {
  const lines: string[] = [];
  const push = (line = '') => lines.push(line);

  push('# Presentation Checker — agreement report (§7.4)');
  push('');
  push('## 1. Dimension scores — do we rank the same?');
  push('');
  push('| dimension | weighted kappa | spearman rho |');
  push('|---|---|---|');
  for (const dimension of DIMENSIONS) {
    const gavinScores = inputs.gavin.map(
      (rating) => rating.dimensionScores[dimension],
    );
    const checkerScores = inputs.checker.map(
      (result) => result.critique.dimensionScores[dimension],
    );
    push(
      `| ${dimension} | ${weightedKappa(gavinScores, checkerScores, 5).toFixed(3)} | ${spearmanRho(gavinScores, checkerScores).toFixed(3)} |`,
    );
  }
  push('');

  const checkerChecklists: ChecklistVerdict[] = inputs.checker.map(
    (result) => {
      const verdict: ChecklistVerdict = {};
      for (const finding of result.critique.findings) {
        verdict[finding.category] = true;
      }
      return verdict;
    },
  );
  const prf = checklistPrf(
    inputs.gavin.map((rating) => rating.checklist),
    checkerChecklists,
    categories,
  );
  const catchRate = seededCatchRate(
    inputs.manifest.map((item) => item.seededIssue),
    checkerChecklists,
  );
  push('## 2. Issue checklist — same specific problems?');
  push('');
  push(
    `- micro precision ${prf.precision.toFixed(3)} · recall ${prf.recall.toFixed(3)} · F1 ${prf.f1.toFixed(3)} (tp ${prf.tp}, fp ${prf.fp}, fn ${prf.fn})`,
  );
  push(
    `- **seeded ground-truth caught: ${catchRate.caught}/${catchRate.total} (${(catchRate.rate * 100).toFixed(0)}%)**`,
  );
  push('');

  push('## 3. Comments ↔ findings (qualitative reconciliation)');
  push('');
  for (let index = 0; index < inputs.manifest.length; index++) {
    const item = inputs.manifest[index]!;
    const rating = inputs.gavin[index]!;
    const result = inputs.checker[index]!;
    push(
      `### ${item.id}${item.seededIssue ? ` (seeded: ${item.seededIssue})` : ' (strong)'}`,
    );
    push('');
    push(`Gavin: ${rating.comments || '_(no comment)_'}`);
    push('');
    push('Checker findings:');
    for (const finding of result.critique.findings) {
      push(
        `- [${finding.severity}/${finding.category}] ${finding.problem} → ${finding.fix}`,
      );
    }
    push('');
  }
  return `${lines.join('\n')}\n`;
}

export function runAnalysis(options: RunAnalysisOptions): void {
  const inputs = loadAnalysisInputs(options);
  const report = renderAnalysisReport(inputs, options.categories);
  mkdirSync(dirname(options.outFile), { recursive: true });
  writeFileSync(options.outFile, report);
}
