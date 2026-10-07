/**
 * Fix 25 — the copy a user or a crawler can be shown, checked against two
 * owner decisions of 2026-10-06 (docs/fixes/25-latex-hidden-prices.md):
 *
 *   1. The LaTeX export is hidden ("unnecessary for now";
 *      config/features.ts LATEX_EXPORT_ENABLED). While it is off, no copy
 *      may claim it: not LaTeX, XeLaTeX, Overleaf or poster.tex.
 *   2. Stripe prices are before tax. Every price shown says tax is extra,
 *      right beside it: a tax note within 40 characters after the price
 *      (copyScan.ts pricesWithTax), in the same string, and never between
 *      the price and its billing period (copyScan.ts TAX_BEFORE_PERIOD:
 *      "+ applicable taxes / 4 months" reads as taxes per 4 months).
 *
 * And "registered in Quebec" is not said anywhere: Resila Technologies Inc.
 * is incorporated there.
 *
 * Where: every non-test source file of the web app (src, and the edge
 * shells in api/), of the API (apps/api/src) and of packages/shared; the
 * crawler copy (src/seo/routes.json); index.html; and the text files in
 * public/. Left out, with the reason:
 *   - the legal pages (Privacy, Cookies, Terms and their French versions,
 *     and their routes.json entries): stream A of the 2026-10-06 work
 *     rewrites them; the inventory widens to them once that merges;
 *   - src/export/latex/: the LaTeX writer (its README, warnings and .tex
 *     comments), which only the switched-off export button runs. That it
 *     stays unreachable is checked here: nothing may import it outside
 *     the switch.
 * A string inside `LATEX_EXPORT_ENABLED && …` (and the other guards
 * src/test/copyScan.ts lists) is reachable only with the export on, so it
 * may name LaTeX: that is the kept code of the hidden button.
 *
 * A bare price is allowed only where BARE_PRICES lists it, each with the
 * rendered test that shows its tax note next to it.
 *
 * The French public pages (fix 26) keep their copy in src/i18n/, which
 * the inventory reads like any source file: the same rules hold in French
 * (the patterns read « 18,99 $ CA », « taxes » and « / 4 mois »).
 *
 * Re-run: npx vitest run src/__tests__/copyInventory.test.ts
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LATEX_EXPORT_ENABLED } from '@/config/features';
import routes from '@/seo/routes.json';
import {
  LATEX_CLAIM,
  TAX_BEFORE_PERIOD,
  hasUntaxedPrice,
  readSource,
  scanSource,
  type CopyText,
} from '@/test/copyScan';

const WEB = process.cwd();
const REPO = join(WEB, '../..');

const LEGAL_PAGE = /^apps\/web\/src\/pages\/(Privacy|Cookies|Terms)(Fr)?\.tsx$/;
const LEGAL_ROUTE = /^\/(privacy|cookies|terms)(\/fr)?$/;
const LATEX_WRITER = /^apps\/web\/src\/export\/latex\//;
const NOT_SHIPPED = /(^|\/)(__tests__|__spikes__)\/|\.(test|spec)\.tsx?$|\.d\.ts$|^apps\/web\/src\/test\//;

/** Bare prices (no tax note in the same string), and what shows their tax. */
const BARE_PRICES: Readonly<Record<string, readonly string[]>> = {
  // The pricing cards print the amount large and "+ applicable taxes"
  // (« + taxes applicables ») right under it, in English and in French
  // (fix 26 moved the card copy to i18n/pricing.ts):
  // src/components/__tests__/pricesTax.test.tsx.
  'apps/web/src/i18n/pricing.ts': ['CA$18.99', 'CA$9.99', '18,99\u00a0$\u00a0CA', '9,99\u00a0$\u00a0CA'],
};

const REGISTERED_IN_QUEBEC = /registered in (the province of )?qu[eé]bec/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

interface Found extends CopyText {
  readonly file: string;
}

const SCANNED_ROOTS = ['apps/web/src', 'apps/web/api', 'apps/api/src', 'packages/shared/src'];

const scanned: readonly Found[] = SCANNED_ROOTS.flatMap((root) => sourceFiles(join(REPO, root)))
  .map((abs) => relative(REPO, abs))
  .filter((file) => !NOT_SHIPPED.test(file) && !LEGAL_PAGE.test(file))
  .flatMap((file) =>
    scanSource(file, readSource(join(REPO, file))).map((t) => ({ ...t, file })),
  );

/** Every string in the crawler copy outside the legal pages, with its JSON path. */
function routeStrings(): Array<{ where: string; text: string }> {
  const out: Array<{ where: string; text: string }> = [];
  const walk = (value: unknown, where: string) => {
    if (typeof value === 'string') out.push({ where, text: value });
    else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${where}[${i}]`));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (!LEGAL_ROUTE.test(k)) walk(v, `${where}.${k}`);
      }
    }
  };
  walk(routes, 'routes.json');
  return out;
}

const PUBLIC_TEXT = readdirSync(join(WEB, 'public'))
  .filter((name) => /\.(txt|xml|webmanifest|json)$/.test(name) && name !== 'version.json')
  .map((name) => `apps/web/public/${name}`);
const RAW_FILES = ['apps/web/index.html', ...PUBLIC_TEXT];

/**
 * Each line of index.html and the public text files, comments included:
 * index.html's comments ship in every prerendered page's source.
 */
const rawLines = RAW_FILES.flatMap((file) =>
  readSource(join(REPO, file))
    .split('\n')
    .map((text, i) => ({ where: `${file}:${i + 1}`, text })),
);

const at = (t: Found) => `${t.file}:${t.line}  ${JSON.stringify(t.text.slice(0, 140))}`;

describe('the inventory reads what it should', () => {
  it('reads the surfaces the decisions name, and not the legal pages', () => {
    const files = new Set(scanned.map((t) => t.file));
    for (const f of [
      'apps/web/src/pages/Landing.tsx',
      'apps/web/src/pages/About.tsx',
      'apps/web/src/pages/WhyPosters.tsx',
      'apps/web/src/pages/Pricing.tsx',
      'apps/web/src/components/PricingSection.tsx',
      'apps/web/src/poster/sidebar/EditableExportButtons.tsx',
      'apps/web/src/profile/SubscriptionPanel.tsx',
      'apps/web/src/pages/Auth.tsx',
      'apps/api/src/billing.ts',
      'apps/web/api/shell/_lib.ts',
      // Fix 26: the dictionaries of the public pages, English and French.
      'apps/web/src/i18n/landing.ts',
      'apps/web/src/i18n/pricing.ts',
      'apps/web/src/i18n/auth.ts',
      'apps/web/src/i18n/billing.ts',
      'apps/web/src/i18n/readability.ts',
      'apps/web/src/data/refundCopy.ts',
    ]) {
      expect(files.has(f), f).toBe(true);
    }
    expect([...files].filter((f) => LEGAL_PAGE.test(f))).toEqual([]);
    expect(rawLines.some((l) => l.where.startsWith('apps/web/public/robots.txt'))).toBe(true);
    expect(routeStrings().some((s) => s.where.startsWith('routes.json.static./pricing'))).toBe(true);
    expect(routeStrings().some((s) => s.where.includes('./privacy'))).toBe(false);
  });

  it('reads the French prices (fix 26): the cards, the /auth/fr labels and the crawler copy', () => {
    const FRENCH_PRICE = /\d+,\d{2}\s\$/;
    const frenchSource = scanned.filter((t) => t.kind !== 'module' && FRENCH_PRICE.test(t.text));
    expect(frenchSource.map((t) => t.file)).toEqual(
      expect.arrayContaining(['apps/web/src/i18n/pricing.ts', 'apps/web/src/i18n/auth.ts']),
    );
    expect(frenchSource.length).toBeGreaterThanOrEqual(4);
    expect(routeStrings().some((s) => s.where.startsWith('routes.json.static./pricing/fr') && FRENCH_PRICE.test(s.text))).toBe(true);
  });
});

describe.runIf(!LATEX_EXPORT_ENABLED)('no copy claims the hidden LaTeX export', () => {
  it('no source string outside the switch names it', () => {
    const hits = scanned.filter(
      (t) =>
        t.kind !== 'module' &&
        !t.guarded &&
        !LATEX_WRITER.test(t.file) &&
        // The export kind's name in code ('latex' | 'pptx'), never shown.
        t.text !== 'latex' &&
        LATEX_CLAIM.test(t.text),
    );
    expect(hits.map(at)).toEqual([]);
  });

  it('nothing imports the LaTeX writer outside the switch', () => {
    const hits = scanned.filter(
      (t) => t.kind === 'module' && !t.guarded && !LATEX_WRITER.test(t.file) && /export\/latex|\/latex\//.test(t.text),
    );
    expect(hits.map(at)).toEqual([]);
  });

  it('the crawler copy does not name it', () => {
    expect(routeStrings().filter((s) => LATEX_CLAIM.test(s.text))).toEqual([]);
  });

  it('index.html and the public text files do not name it', () => {
    expect(rawLines.filter((l) => LATEX_CLAIM.test(l.text))).toEqual([]);
  });
});

describe('every price shown says tax is extra', () => {
  it('every price in a source string has its tax note beside it, or is a listed bare price', () => {
    const hits = scanned.filter(
      (t) =>
        t.kind !== 'module' &&
        hasUntaxedPrice(t.text) &&
        !(BARE_PRICES[t.file] ?? []).includes(t.text),
    );
    expect(hits.map(at)).toEqual([]);
  });

  it('each listed bare price is still where the list says', () => {
    for (const [file, prices] of Object.entries(BARE_PRICES)) {
      const there = scanned.filter((t) => t.file === file).map((t) => t.text);
      for (const p of prices) expect(there, `${file} ${p}`).toContain(p);
    }
  });

  it('every price in the crawler copy has its tax note beside it', () => {
    expect(routeStrings().filter((s) => hasUntaxedPrice(s.text))).toEqual([]);
  });

  it('every price in index.html and the public text files has its tax note beside it', () => {
    expect(rawLines.filter((l) => hasUntaxedPrice(l.text))).toEqual([]);
  });

  // Review round 1, B-R1-03: "CA$18.99 + applicable taxes / 4 months" reads
  // as taxes per 4 months. The period goes before the tax note.
  it('no tax note sits between a price and its billing period', () => {
    expect(scanned.filter((t) => t.kind !== 'module' && TAX_BEFORE_PERIOD.test(t.text)).map(at)).toEqual([]);
    expect(routeStrings().filter((s) => TAX_BEFORE_PERIOD.test(s.text))).toEqual([]);
    expect(rawLines.filter((l) => TAX_BEFORE_PERIOD.test(l.text))).toEqual([]);
  });
});

describe('Resila is incorporated in Quebec, not "registered"', () => {
  it('no copy outside the legal pages says "registered in Quebec"', () => {
    expect(scanned.filter((t) => REGISTERED_IN_QUEBEC.test(t.text)).map(at)).toEqual([]);
    expect(routeStrings().filter((s) => REGISTERED_IN_QUEBEC.test(s.text))).toEqual([]);
    expect(rawLines.filter((l) => REGISTERED_IN_QUEBEC.test(l.text))).toEqual([]);
  });
});
