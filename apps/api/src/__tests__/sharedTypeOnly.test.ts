/**
 * @postr/shared ships TypeScript source (its `main` is src/index.ts). The
 * API runs as compiled JavaScript (`node dist/index.js`), which cannot load
 * it, so the API may import only TYPES from it: `import type` is erased by
 * the build. A value import passes typecheck, the tests and the build, and
 * then the server crashes on start. The diagnostics ingest did exactly that
 * (ERR_UNKNOWN_FILE_EXTENSION on Render, 2026-09-30). A value the API needs
 * gets a runtime copy pinned to the shared types, as extractStyle.ts and
 * diagnostics.ts do.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The API's shipped source files: everything under src but its tests. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') ? [path] : [];
  });
}

/** Every import, export or dynamic import of @postr/shared that is not type-only. */
function valueImportsOfShared(source: string): string[] {
  const statements = source.match(/\b(?:import|export)\b[^;]*?from\s*['"]@postr\/shared(?:\/[^'"]*)?['"]/g) ?? [];
  const dynamic = source.match(/\bimport\s*\(\s*['"]@postr\/shared(?:\/[^'"]*)?['"]\s*\)/g) ?? [];
  return [...statements.filter((s) => !/^(?:import|export)\s+type\b/.test(s)), ...dynamic];
}

describe('the API imports only types from @postr/shared', () => {
  it('recognises a value import and lets a type import through (control)', () => {
    expect(valueImportsOfShared("import { DIAGNOSTIC_BATCH_MAX } from '@postr/shared';")).toHaveLength(1);
    expect(valueImportsOfShared("import {\n  a,\n  b,\n} from '@postr/shared';")).toHaveLength(1);
    expect(valueImportsOfShared("const m = await import('@postr/shared');")).toHaveLength(1);
    expect(valueImportsOfShared("import type { DiagnosticEvent } from '@postr/shared';")).toHaveLength(0);
    expect(valueImportsOfShared("import type {\n  A,\n} from '@postr/shared/types/diagnostics';")).toHaveLength(0);
  });

  it('finds the source files', () => {
    expect(sourceFiles(SRC).length).toBeGreaterThan(10);
  });

  it('has no value import of @postr/shared in any shipped file', () => {
    const offenders = sourceFiles(SRC).flatMap((file) =>
      valueImportsOfShared(readFileSync(file, 'utf8')).map((s) => `${relative(SRC, file)}: ${s.replace(/\s+/g, ' ')}`),
    );
    expect(offenders).toEqual([]);
  });
});
