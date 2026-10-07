/**
 * The Cookies Policy table must list every browser-storage key the app
 * writes, under the right storage area, and nothing it does not write.
 *
 * Why: the claims audit of 2026-09-29 found the English and French tables
 * naming two keys that never existed (postr-onboarding-*, postr-templates),
 * a sessionStorage entry the Supabase client never writes, and about
 * sixteen real keys missing. A table kept by hand drifts; this test reads
 * the code instead.
 *
 * How: every non-test source file under src that calls
 * localStorage.setItem or sessionStorage.setItem must appear in WRITERS
 * (storageWriters.ts, which the account-deletion test shares), each
 * WRITERS key must be written by its file, and both policy
 * pages must list each key in a row whose "Stored where" cell names the
 * same area. In the other direction, every postr key either page names
 * must be one of these. A new writer fails here until the policy lists it.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Area, UNREACHABLE_WRITERS, WRITERS } from './storageWriters';

const SUPABASE_SESSION_KEY = 'sb-<project-ref>-auth-token';
const POLICY_PAGES = ['pages/Cookies.tsx', 'pages/CookiesFr.tsx'] as const;

const srcRoot = join(process.cwd(), 'src');

function sourceOf(relativePath: string): string {
  return readFileSync(join(srcRoot, relativePath), 'utf8');
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === '__tests__' ? [] : sourceFiles(path);
    }
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** [entry cell, stored-where cell] for every row of the page's table. */
function tableRows(pageSource: string): Array<{ entry: string; area: string }> {
  const rows: Array<{ entry: string; area: string }> = [];
  for (const match of pageSource.matchAll(/\[\s*'([^']+)',\s*'(localStorage|sessionStorage)',/g)) {
    rows.push({ entry: match[1] ?? '', area: match[2] ?? '' });
  }
  return rows;
}

describe('Cookies Policy storage inventory', () => {
  it('knows every file that writes browser storage', () => {
    const known = new Set([...WRITERS, ...UNREACHABLE_WRITERS].map((w) => w.file));
    const writing = sourceFiles(srcRoot)
      .filter((path) => /\b(localStorage|sessionStorage)\.setItem\(/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(srcRoot, path))
      .filter((file) => !file.startsWith('pages/Debug.tsx'));

    expect(writing.filter((file) => !known.has(file)).sort()).toEqual([]);
  });

  it.each(WRITERS.map((w) => [w.stored, w.file, w.area] as const))(
    '%s is written by %s to %s',
    (stored, file, area) => {
      const source = sourceOf(file);
      expect(source).toContain(stored);
      expect(source).toMatch(new RegExp(`\\b${area}\\.setItem\\(`));
    },
  );

  it('keeps the Supabase session in its default localStorage key', () => {
    const client = sourceOf('lib/supabase.ts');
    expect(client).toMatch(/persistSession:\s*true/);
    expect(client).not.toMatch(/\bstorage(Key)?\s*:/);
  });

  it.each(POLICY_PAGES)('%s lists every written key under its storage area', (page) => {
    const rows = tableRows(sourceOf(page));
    const expected = [
      { stored: SUPABASE_SESSION_KEY, area: 'localStorage' as Area },
      ...WRITERS,
    ];
    const missing = expected
      .filter(({ stored, area }) => !rows.some((row) => row.entry.includes(stored) && row.area === area))
      .map(({ stored, area }) => `${stored} (${area})`);

    expect(missing).toEqual([]);
  });

  it.each(POLICY_PAGES)('%s names no storage key the code does not write', (page) => {
    const source = sourceOf(page);
    const known = new Set(WRITERS.map((w) => w.stored));
    const named = [...source.matchAll(/\bpostr[.-][A-Za-z][\w.:-]*/g)]
      .map((match) => match[0])
      .filter((token) => !token.startsWith('postr.sh'));

    expect([...new Set(named)].filter((token) => !known.has(token)).sort()).toEqual([]);
    expect([...source.matchAll(/\bsb-[^\s'"]*/g)].map((match) => match[0])).toEqual(
      expect.arrayContaining([SUPABASE_SESSION_KEY]),
    );
    expect(tableRows(source).some((row) => /Supabase .*timer|Minuteries/i.test(row.entry))).toBe(false);
  });

  /** Non-policy source files whose text matches `pattern`. */
  const codeReading = (pattern: RegExp) =>
    sourceFiles(srcRoot)
      .filter((path) => !POLICY_PAGES.some((p) => path.endsWith(p)))
      .filter((path) => pattern.test(readFileSync(path, 'utf8')));

  it.each(POLICY_PAGES)('%s does not claim to honour Do Not Track while no code reads it', (page) => {
    if (codeReading(/doNotTrack/).length > 0) return;
    const source = sourceOf(page);
    expect(source).not.toMatch(/We respect “Do Not Track”|Nous respectons les en-têtes|honou?rs? .{0,20}Do Not Track|respecte .{0,30}Do Not Track/);
  });

  it.each(POLICY_PAGES)('%s claims to honour Global Privacy Control only while the code reads it', (page) => {
    // Record 24: App.tsx does not mount Vercel Web Analytics when
    // navigator.globalPrivacyControl is true (analytics/globalPrivacyControl.ts).
    const reads = codeReading(/navigator[^;]{0,80}globalPrivacyControl/).length > 0;
    const claims = /Postr honours <em>Global Privacy Control|Postr respecte le signal <em>Global Privacy Control/.test(sourceOf(page));
    expect(claims).toBe(reads);
  });
});
