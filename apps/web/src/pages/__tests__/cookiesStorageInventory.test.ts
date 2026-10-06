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
 * below, each WRITERS key must be written by its file, and both policy
 * pages must list each key in a row whose "Stored where" cell names the
 * same area. In the other direction, every postr key either page names
 * must be one of these. A new writer fails here until the policy lists it.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHARING_ENABLED } from '@/config/features';

type Area = 'localStorage' | 'sessionStorage';

interface Writer {
  /** The key as the code writes it; a prefix for keys with an id suffix. */
  stored: string;
  area: Area;
  /** File under src that writes it. */
  file: string;
}

const WRITERS: readonly Writer[] = [
  { stored: 'postr.onboarding-done', area: 'localStorage', file: 'components/OnboardingTour.tsx' },
  { stored: 'postr.style-presets', area: 'localStorage', file: 'poster/PosterEditor.tsx' },
  { stored: 'postr.style-presets', area: 'localStorage', file: 'components/PresetEditModal.tsx' },
  { stored: 'postr.custom-palettes', area: 'localStorage', file: 'poster/customPalettes.ts' },
  { stored: 'postr.cb-random-pref', area: 'localStorage', file: 'components/PaletteDesigner.tsx' },
  { stored: 'postr.checklist-templates', area: 'localStorage', file: 'poster/GuidelinesPanel.tsx' },
  { stored: 'postr.scratch-pad', area: 'localStorage', file: 'poster/GuidelinesPanel.tsx' },
  { stored: 'postr.scratch-note', area: 'localStorage', file: 'poster/GuidelinesPanel.tsx' },
  { stored: 'postr.profile', area: 'localStorage', file: 'profile/ProfileFields.tsx' },
  { stored: 'postr.welcome-seeded:', area: 'localStorage', file: 'data/seedWelcomePoster.ts' },
  { stored: 'postr.active-editor.', area: 'localStorage', file: 'hooks/useTwoTabGuard.ts' },
  { stored: 'postr.figure-script.', area: 'localStorage', file: 'poster/figureScriptDraft.ts' },
  { stored: 'postr.figure-script-page', area: 'sessionStorage', file: 'poster/figureScriptDraft.ts' },
  { stored: 'postr.figure-size-page', area: 'sessionStorage', file: 'poster/figureScriptDraft.ts' },
  { stored: 'postr.tab-id', area: 'sessionStorage', file: 'hooks/useTwoTabGuard.ts' },
  { stored: 'postr.signupConsent', area: 'sessionStorage', file: 'data/consent.ts' },
  { stored: 'postr.checkoutIntent', area: 'sessionStorage', file: 'data/checkoutIntent.ts' },
  { stored: 'postr.autoArrangeOnLoad', area: 'sessionStorage', file: 'components/ImportPosterModal.tsx' },
  { stored: 'postr-just-refreshed', area: 'sessionStorage', file: 'components/UpdateAvailableToast.tsx' },
  { stored: 'postr-acknowledged-build', area: 'sessionStorage', file: 'components/UpdateAvailableToast.tsx' },
  { stored: 'postr.mobile-notice-dismissed', area: 'sessionStorage', file: 'components/MobileNotice.tsx' },
];

/**
 * Writers the page may leave out, with the reason. The guest commenter
 * name is written only by the comments panel, which is not rendered
 * while sharing and comments are switched off (config/features.ts).
 */
const UNREACHABLE_WRITERS: readonly Writer[] = SHARING_ENABLED
  ? []
  : [{ stored: 'postr.comment-name', area: 'localStorage', file: 'hooks/useComments.ts' }];

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

  it.each(POLICY_PAGES)('%s does not claim to honour DNT or GPC while no code reads them', (page) => {
    const readers = sourceFiles(srcRoot)
      .filter((path) => !POLICY_PAGES.some((p) => path.endsWith(p)))
      .filter((path) => /doNotTrack|globalPrivacyControl|Sec-GPC/.test(readFileSync(path, 'utf8')));
    if (readers.length > 0) return;

    const source = sourceOf(page);
    expect(source).not.toMatch(/We respect “Do Not Track”|Nous respectons les en-têtes/);
  });
});
