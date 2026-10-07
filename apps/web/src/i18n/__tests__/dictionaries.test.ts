/**
 * Fix 26 — the dictionaries behind the public pages, English and French.
 *
 *   D1  every dictionary file in src/i18n is registered (so D2–D5 read it);
 *   D2  every English key has a French key and the reverse, at every depth,
 *       and every list has as many French entries as English ones (tsc
 *       catches most of this through the shared type; this catches the rest,
 *       list lengths and anything typed loosely);
 *   D3  no French string is the English one unchanged, unless it has no
 *       letters or is a name SAME_IN_BOTH lists; each function gives a
 *       different French string for the same arguments (FUNCTION_SAMPLES
 *       must cover every function);
 *   D4  French typography as the French legal pages write it: curly
 *       apostrophes, a no-break space before « : » and inside « », and
 *       before $ and %; Quebec terms (« courriel », « témoins »,
 *       « téléverser »);
 *   D5  the marketing rules hold in both languages: no AI (« IA »), no
 *       model provider.
 *   D6  each French string carries the same numbers and product names as its
 *       English one (digits with either decimal mark, the number words two
 *       to ten, ggplot2, matplotlib, PowerPoint …), and so does each French
 *       record of seo/routes.json against its English twin: a price, a
 *       refund window, a limit or a named tool cannot drift in one language
 *       only (review round 1, R1-02 and R1-04: « 30 jours » for "14 days"
 *       and a checker title without matplotlib passed D1–D5). It does not
 *       read meaning beyond these tokens; that stays a reader's check.
 *
 * Re-run: npx vitest run src/i18n/__tests__/dictionaries.test.ts
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import routes from '@/seo/routes.json';
import { DICTIONARIES } from '../dictionaries';

/** Files in src/i18n that hold no dictionary. */
const NOT_DICTIONARIES = new Set(['lang.ts', 'dictionaries.ts', 'readabilityWarnings.ts']);

/** The same in both languages, each for a reason. */
const SAME_IN_BOTH = new Set([
  'Postr',
  'PowerPoint',
  'R',
  'Python',
  // Words French shares with English.
  'Menu',
  'Auto',
  'Source',
  'Min',
]);

type Leaf = { path: string; en: unknown; fr: unknown };

function leaves(en: unknown, fr: unknown, path: string, out: Leaf[], problems: string[]): void {
  if (Array.isArray(en) || Array.isArray(fr)) {
    if (!Array.isArray(en) || !Array.isArray(fr)) {
      problems.push(`${path}: a list in one language only`);
      return;
    }
    if (en.length !== fr.length) problems.push(`${path}: ${en.length} English entries, ${fr.length} French`);
    en.forEach((v, i) => leaves(v, fr[i], `${path}[${i}]`, out, problems));
    return;
  }
  if (en && typeof en === 'object' && fr && typeof fr === 'object') {
    const ek = Object.keys(en as object).sort();
    const fk = Object.keys(fr as object).sort();
    for (const k of ek.filter((k) => !fk.includes(k))) problems.push(`${path}.${k}: no French`);
    for (const k of fk.filter((k) => !ek.includes(k))) problems.push(`${path}.${k}: no English`);
    for (const k of ek.filter((k) => fk.includes(k))) {
      leaves((en as Record<string, unknown>)[k], (fr as Record<string, unknown>)[k], `${path}.${k}`, out, problems);
    }
    return;
  }
  if (typeof en !== typeof fr) problems.push(`${path}: ${typeof en} in English, ${typeof fr} in French`);
  out.push({ path, en, fr });
}

const allLeaves: Leaf[] = [];
const shapeProblems: string[] = [];
for (const [name, dict] of Object.entries(DICTIONARIES)) {
  leaves(dict.en, dict.fr, name, allLeaves, shapeProblems);
}

/** Arguments to call each function leaf with, by its path. */
const FUNCTION_SAMPLES: Record<string, unknown[][]> = {
  'billing.creditsLeft': [[1], [3]],
  'auth.passwordMet': [[1, 5], [3, 5]],
  'auth.resetSent': [['jean.tremblay@example.com']],
  'readability.detected': [['R / ggplot2']],
  'readability.checkedAs': [['R / ggplot2']],
  'readability.assumedLabel': [['R', 'ggplot2']],
  'readability.unsupported': [['lattice']],
  'readability.belowCount': [[0, 7], [1, 7], [3, 7]],
  'readability.scale': [['1,40']],
  'readability.fix.orChangeOne': [['base_size', 18]],
  'readability.fix.simplerToPaste': [['font.size']],
};

const isFunction = (l: Leaf) => typeof l.en === 'function';
/** A list entry's `id`: a React key, never shown. */
const isId = (l: { path: string }) => /\]\.id$/.test(l.path);
const strings = allLeaves.filter((l) => typeof l.en === 'string') as Array<{ path: string; en: string; fr: string }>;
const frenchTexts = [
  ...strings.filter((l) => !isId(l)).map((l) => ({ path: l.path, text: l.fr })),
  ...allLeaves.filter(isFunction).flatMap((l) =>
    (FUNCTION_SAMPLES[l.path] ?? []).map((args, i) => ({
      path: `${l.path}(${i})`,
      text: String((l.fr as (...a: unknown[]) => unknown)(...args)),
    })),
  ),
];

describe('D1 — every dictionary is registered', () => {
  it('each file in src/i18n with a dictionary is in DICTIONARIES', () => {
    const files = readdirSync(join(process.cwd(), 'src/i18n')).filter(
      (f) => f.endsWith('.ts') && !NOT_DICTIONARIES.has(f),
    );
    const registered = Object.keys(DICTIONARIES);
    for (const f of files) expect(registered, f).toContain(f.replace(/\.ts$/, ''));
    expect(registered.length).toBeGreaterThanOrEqual(10);
  });
});

describe('D2 — same keys both ways', () => {
  it('no key, list entry or kind is missing in either language', () => {
    expect(shapeProblems).toEqual([]);
    expect(strings.length).toBeGreaterThan(200);
  });
});

describe('D3 — nothing left in English', () => {
  it('no French string equals its English one, names aside', () => {
    const same = strings.filter(
      (l) => !isId(l) && l.en === l.fr && /[A-Za-z]/.test(l.en) && !SAME_IN_BOTH.has(l.en),
    );
    expect(same.map((l) => `${l.path}: ${l.en}`)).toEqual([]);
  });

  it('ids (keys, never shown) are the same in both languages', () => {
    const ids = strings.filter(isId);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((l) => l.en !== l.fr).map((l) => l.path)).toEqual([]);
  });

  it('every function has samples, and gives a different French string for each', () => {
    const fns = allLeaves.filter(isFunction);
    expect(fns.map((l) => l.path).filter((p) => !FUNCTION_SAMPLES[p])).toEqual([]);
    for (const l of fns) {
      for (const args of FUNCTION_SAMPLES[l.path] ?? []) {
        const en = (l.en as (...a: unknown[]) => unknown)(...args);
        const fr = (l.fr as (...a: unknown[]) => unknown)(...args);
        expect(typeof fr, l.path).toBe('string');
        expect(fr, `${l.path}(${JSON.stringify(args)})`).not.toBe(en);
      }
    }
  });
});

describe('D4 — French typography and Quebec terms', () => {
  it('curly apostrophes only', () => {
    expect(frenchTexts.filter((t) => /[A-Za-zÀ-ÿ]'[A-Za-zÀ-ÿ]/.test(t.text))).toEqual([]);
  });

  it('a no-break space before a colon, and none missing', () => {
    expect(frenchTexts.filter((t) => / :|[^\s\u00a0]:(\s|$)/.test(t.text))).toEqual([]);
  });

  it('no-break spaces inside « » and before $ and %', () => {
    expect(
      frenchTexts.filter((t) => /«(?!\u00a0)|(?<!\u00a0)»| [$%]|\d\$/.test(t.text)),
    ).toEqual([]);
  });

  it('« courriel », « témoins », « téléverser »', () => {
    expect(frenchTexts.filter((t) => /\be-?mail\b|\bcookies?\b|\buploade?r?\b|\btélécharger vers\b/i.test(t.text))).toEqual(
      [],
    );
  });
});

describe('D5 — the marketing rules, in both languages', () => {
  it('no AI, no « IA », no model provider', () => {
    const all = [...strings.map((l) => ({ path: l.path, text: l.en })), ...frenchTexts];
    expect(
      all.filter((t) => /\bAI\b|\bIA\b|intelligence artificielle|\bClaude\b|Anthropic|OpenAI|\bGPT|Gemini/i.test(t.text)),
    ).toEqual([]);
  });
});

/** Names a sentence keeps in both languages; read before the digits, so ggplot2's 2 is not a number. */
const NAMES = ['ggplot2', 'matplotlib', 'PowerPoint', 'Python', 'BibTeX', 'Stripe', 'Google', 'LaTeX', 'Overleaf', 'PDF'];
const NUMBER_WORDS: Record<'en' | 'fr', Record<string, number>> = {
  en: { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 },
  fr: { deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10 },
};

/** The numbers and names in `text`, sorted: "CA$18.99 every 4 months" → ['18.99', '4']. */
function tokens(text: string, lang: 'en' | 'fr'): string[] {
  const out: string[] = [];
  let rest = text;
  for (const name of NAMES) {
    // A plural English name ("text-based PDFs") is the same name.
    const re = new RegExp(`\\b${name}s?\\b`, 'g');
    out.push(...(rest.match(re) ?? []).map(() => name));
    rest = rest.replace(re, ' ');
  }
  for (const m of rest.matchAll(/\d+(?:[.,]\d+)?/g)) out.push(m[0].replace(',', '.'));
  for (const m of rest.toLowerCase().matchAll(/[a-zà-ÿ]+/g)) {
    const n = NUMBER_WORDS[lang][m[0]];
    if (n !== undefined) out.push(String(n));
  }
  return out.sort();
}

/**
 * Pairs whose tokens differ on purpose: « aux deux » is "both" (the English
 * names no number).
 */
const TOKENS_DIFFER = new Set(['whyPosters.skills[2].atTheSession']);

/** Every string pair: the dictionaries' strings and sampled functions, then the French routes.json records against their twins. */
function tokenPairs(): Array<{ path: string; en: string; fr: string }> {
  const pairs = strings.filter((l) => !isId(l)).map((l) => ({ path: l.path, en: l.en, fr: l.fr }));
  for (const l of allLeaves.filter(isFunction)) {
    (FUNCTION_SAMPLES[l.path] ?? []).forEach((args, i) =>
      pairs.push({
        path: `${l.path}(${i})`,
        en: String((l.en as (...a: unknown[]) => unknown)(...args)),
        fr: String((l.fr as (...a: unknown[]) => unknown)(...args)),
      }),
    );
  }
  type Rec = { language?: string; title?: string; description?: string; h1?: string; copy?: string[] };
  for (const group of ['static', 'app'] as const) {
    const records = routes[group] as Record<string, Rec>;
    for (const [path, fr] of Object.entries(records)) {
      if (fr.language !== 'fr-CA' || /^\/(privacy|cookies|terms)\//.test(path)) continue;
      const en = records[path === '/fr' ? '/' : path.replace(/\/fr$/, '')];
      if (!en) continue;
      for (const field of ['title', 'description', 'h1'] as const) {
        pairs.push({ path: `routes ${path} ${field}`, en: en[field] ?? '', fr: fr[field] ?? '' });
      }
      pairs.push({ path: `routes ${path} copy`, en: (en.copy ?? []).join(' '), fr: (fr.copy ?? []).join(' ') });
    }
  }
  return pairs;
}

describe('D6 — the same numbers and names in both languages', () => {
  const pairs = tokenPairs();

  it('reads the dictionaries and the French records of routes.json', () => {
    expect(pairs.length).toBeGreaterThan(350);
    expect(pairs.filter((p) => p.path.startsWith('routes ')).length).toBeGreaterThanOrEqual(30);
  });

  it('each French string has the numbers and names of its English one', () => {
    const differ = pairs
      .filter((p) => !TOKENS_DIFFER.has(p.path))
      .map((p) => ({ path: p.path, en: tokens(p.en, 'en'), fr: tokens(p.fr, 'fr') }))
      .filter((p) => p.en.join('|') !== p.fr.join('|'))
      .map((p) => `${p.path}: English [${p.en.join(', ')}], French [${p.fr.join(', ')}]`);
    expect(differ).toEqual([]);
  });

  it('the allow-listed pairs still exist and still differ (a stale entry fails)', () => {
    for (const path of TOKENS_DIFFER) {
      const p = pairs.find((x) => x.path === path);
      expect(p, path).toBeDefined();
      expect(tokens(p!.en, 'en')).not.toEqual(tokens(p!.fr, 'fr'));
    }
  });

  it('the counter reads digits, both decimal marks, number words and names', () => {
    expect(tokens('CA$18.99 every 4 months, three exports, ggplot2', 'en')).toEqual(['18.99', '3', '4', 'ggplot2']);
    expect(tokens('18,99 $ CA tous les 4 mois, trois exportations, ggplot2', 'fr')).toEqual(['18.99', '3', '4', 'ggplot2']);
    expect(tokens('la deuxième exportation', 'fr')).toEqual([]);
    expect(tokens('text-based PDFs and a PDF', 'en')).toEqual(['PDF', 'PDF']);
  });
});
