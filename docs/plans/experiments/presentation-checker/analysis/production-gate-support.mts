import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';

export interface GateArgs {
  only: string[] | null;
  limit: number | null;
}

export interface GateManifestItem {
  id: string;
  pages: string[];
}

interface GateManifest {
  frozenAt?: unknown;
  items?: unknown;
}

interface GateLimits {
  maxPages: number;
  maxImageBytes: number;
}

export interface GateRunMetadata {
  fingerprint: string;
  frozenAt: string;
  model: string;
  rubricVersion: string;
}

const SAFE_POSTER_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DEFAULT_LIMITS: GateLimits = {
  maxPages: 24,
  maxImageBytes: 5 * 1024 * 1024,
};
const RUN_METADATA_FILE = 'run-metadata.json';

export function parseGateArgs(args: string[]): GateArgs {
  let only: string[] | null = null;
  let limit: number | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    const value = args[index + 1];

    if (arg === '--only') {
      if (only !== null) throw new Error('--only may only be provided once');
      if (!value || value.startsWith('--')) {
        throw new Error('--only requires a comma-separated list of poster ids');
      }
      const ids = value.split(',').map((id) => id.trim());
      if (ids.some((id) => id.length === 0)) {
        throw new Error('--only requires non-empty poster ids');
      }
      only = ids;
      index += 1;
      continue;
    }

    if (arg === '--limit') {
      if (limit !== null) throw new Error('--limit may only be provided once');
      if (!value || value.startsWith('--')) {
        throw new Error('--limit requires a positive integer');
      }
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error('--limit must be a positive integer');
      }
      limit = parsed;
      index += 1;
      continue;
    }

    throw new Error(`unknown argument ${arg}`);
  }

  return { only, limit };
}

export function validateGateManifest(
  manifest: GateManifest,
  corpusDir: string,
  limits: GateLimits = DEFAULT_LIMITS,
): GateManifestItem[] {
  if (
    typeof manifest.frozenAt !== 'string' ||
    manifest.frozenAt.trim().length === 0 ||
    Number.isNaN(Date.parse(manifest.frozenAt))
  ) {
    throw new Error('manifest frozenAt must be set to a valid timestamp');
  }
  if (!Array.isArray(manifest.items) || manifest.items.length !== 20) {
    throw new Error('manifest must contain exactly 20 items');
  }

  const items = manifest.items as GateManifestItem[];
  const ids = new Set<string>();
  const corpusRoot = `${realpathSync(corpusDir)}${sep}`;

  for (const item of items) {
    if (!item || typeof item.id !== 'string' || item.id.trim().length === 0) {
      throw new Error('every manifest item must have a non-empty id');
    }
    if (!SAFE_POSTER_ID.test(item.id)) {
      throw new Error(`manifest item id is unsafe: ${item.id}`);
    }
    if (ids.has(item.id)) throw new Error('manifest item ids must be unique');
    ids.add(item.id);

    if (!Array.isArray(item.pages) || item.pages.length === 0) {
      throw new Error(`${item.id} must reference at least one page`);
    }
    if (item.pages.length > limits.maxPages) {
      throw new Error(
        `${item.id} exceeds the production page limit of ${limits.maxPages}`,
      );
    }
    for (const page of item.pages) {
      if (typeof page !== 'string' || page.trim().length === 0) {
        throw new Error(`${item.id} contains an invalid page reference`);
      }
      const declaredPagePath = resolve(corpusDir, page);
      if (!declaredPagePath.startsWith(`${resolve(corpusDir)}${sep}`)) {
        throw new Error(`${item.id} page must stay inside the corpus: ${page}`);
      }
      if (!['.png', '.jpg', '.jpeg'].includes(extname(page).toLowerCase())) {
        throw new Error(`${item.id} page has unsupported image type: ${page}`);
      }
      if (!existsSync(declaredPagePath) || !statSync(declaredPagePath).isFile()) {
        throw new Error(`${item.id} page does not exist: ${page}`);
      }
      if (statSync(declaredPagePath).size > limits.maxImageBytes) {
        throw new Error(
          `${item.id} page exceeds the production byte limit of ${limits.maxImageBytes}: ${page}`,
        );
      }
      const pagePath = realpathSync(declaredPagePath);
      if (!pagePath.startsWith(corpusRoot)) {
        throw new Error(`${item.id} page must stay inside the corpus: ${page}`);
      }
    }
  }

  return items;
}

export function selectGateItems(
  items: GateManifestItem[],
  args: GateArgs,
): GateManifestItem[] {
  let selected = items;

  if (args.only !== null) {
    if (args.only.length === 0) throw new Error('--only must select at least one poster id');
    const requested = new Set(args.only);
    if (requested.size !== args.only.length) {
      throw new Error('--only poster ids must be unique');
    }
    const known = new Set(items.map((item) => item.id));
    const unknown = args.only.find((id) => !known.has(id));
    if (unknown) throw new Error(`unknown poster id: ${unknown}`);
    selected = items.filter((item) => requested.has(item.id));
  }

  if (args.limit !== null) selected = selected.slice(0, args.limit);
  if (selected.length === 0) throw new Error('gate selection must contain at least one poster');
  return selected;
}

function selectedResultPath(outDir: string, id: string): string {
  if (!SAFE_POSTER_ID.test(id)) throw new Error(`unsafe poster id: ${id}`);
  const outRoot = `${resolve(outDir)}${sep}`;
  const resultPath = resolve(outDir, `${id}.json`);
  if (!resultPath.startsWith(outRoot)) throw new Error(`unsafe poster id: ${id}`);
  return resultPath;
}

function assertSafeOutputDirectory(outDir: string): void {
  if (!existsSync(outDir)) return;
  const entry = lstatSync(outDir);
  if (entry.isSymbolicLink()) {
    throw new Error('gate output directory must not be a symbolic link');
  }
  if (!entry.isDirectory()) {
    throw new Error('gate output path must be a directory');
  }
}

export function assertCompatibleGateRun(
  outDir: string,
  fingerprint: string,
  fullRun: boolean,
): void {
  assertSafeOutputDirectory(outDir);
  if (fullRun || !existsSync(outDir)) return;

  const metadataPath = join(outDir, RUN_METADATA_FILE);
  if (!existsSync(metadataPath)) {
    const staleArtifacts = readdirSync(outDir).some(
      (name) => name.endsWith('.json') || name === 'costs.jsonl',
    );
    if (staleArtifacts) {
      throw new Error(
        'partial gate run found artifacts without run metadata; start with a full run',
      );
    }
    return;
  }

  let metadata: unknown;
  try {
    metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
  } catch {
    throw new Error('gate run metadata is invalid; start with a full run');
  }
  if (
    !metadata ||
    typeof metadata !== 'object' ||
    !('fingerprint' in metadata) ||
    typeof metadata.fingerprint !== 'string'
  ) {
    throw new Error('gate run metadata is invalid; start with a full run');
  }
  if (metadata.fingerprint !== fingerprint) {
    throw new Error(
      'partial gate run does not match the existing corpus/model/prompt pipeline; start with a full run',
    );
  }
}

export function writeGateRunMetadata(
  outDir: string,
  metadata: GateRunMetadata,
): void {
  assertSafeOutputDirectory(outDir);
  mkdirSync(outDir, { recursive: true });
  const metadataPath = join(outDir, RUN_METADATA_FILE);
  const tempPath = join(
    outDir,
    `.run-metadata.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    writeFileSync(tempPath, `${JSON.stringify(metadata, null, 2)}\n`);
    renameSync(tempPath, metadataPath);
  } finally {
    rmSync(tempPath, { force: true });
  }
}

export function prepareGateOutputs(
  outDir: string,
  selectedIds: string[],
  fullRun: boolean,
): void {
  const resultPaths = selectedIds.map((id) => selectedResultPath(outDir, id));
  assertSafeOutputDirectory(outDir);
  mkdirSync(outDir, { recursive: true });

  if (fullRun) {
    for (const entry of readdirSync(outDir, { withFileTypes: true })) {
      if (
        (entry.isFile() || entry.isSymbolicLink()) &&
        (entry.name.endsWith('.json') || entry.name === 'costs.jsonl')
      ) {
        rmSync(join(outDir, entry.name));
      }
    }
    return;
  }

  const selected = new Set(selectedIds);
  const costsPath = join(outDir, 'costs.jsonl');
  let retainedLines: string[] | null = null;

  if (existsSync(costsPath)) {
    retainedLines = [];
    const lines = readFileSync(costsPath, 'utf8').split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]!;
      if (line.trim().length === 0) continue;
      let row: unknown;
      try {
        row = JSON.parse(line);
      } catch {
        throw new Error(`invalid costs.jsonl row ${index + 1}`);
      }
      if (
        !row ||
        typeof row !== 'object' ||
        !('posterId' in row) ||
        typeof row.posterId !== 'string'
      ) {
        throw new Error(`invalid costs.jsonl row ${index + 1}`);
      }
      if (!selected.has(row.posterId)) retainedLines.push(line);
    }
  }

  let tempCostsPath: string | null = null;
  try {
    if (retainedLines && retainedLines.length > 0) {
      tempCostsPath = join(
        outDir,
        `.costs.jsonl.${process.pid}.${Date.now()}.tmp`,
      );
      writeFileSync(tempCostsPath, `${retainedLines.join('\n')}\n`);
    }

    for (const resultPath of resultPaths) rmSync(resultPath, { force: true });

    if (retainedLines) {
      if (tempCostsPath) {
        renameSync(tempCostsPath, costsPath);
        tempCostsPath = null;
      } else {
        rmSync(costsPath, { force: true });
      }
    }
  } finally {
    if (tempCostsPath) rmSync(tempCostsPath, { force: true });
  }
}
