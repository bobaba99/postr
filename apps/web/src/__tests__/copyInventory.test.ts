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
 * Record 29 (owner decisions D3 and D4 of 2026-10-07,
 * docs/fixes/29-mvp-simplify.md): while IMPORT_ENABLED,
 * ADJUSTMENTS_ENABLED and EDITOR_EXTRAS_ENABLED are off, no copy a user
 * can be shown, in English or French, points at a control they hide
 * (HIDDEN_CLAIMS, one list of patterns per switch). A string reachable only
 * with one of the switches on (copyScan's guards), or inside a component
 * only rendered with its switch on (HIDDEN_COMPONENTS, checked here: every
 * place that renders one is guarded by its switch), is not shown. A
 * hidden control's own label outside such a component is listed in
 * HIDDEN_LABELS with the test that shows the control is not drawn. The
 * API's strings are left out of this rule: they are prompts for the
 * model and error messages, and the editor's controls are the web app's.
 *
 * Re-run: npx vitest run src/__tests__/copyInventory.test.ts
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADJUSTMENTS_ENABLED, EDITOR_EXTRAS_ENABLED, IMPORT_ENABLED, LATEX_EXPORT_ENABLED } from '@/config/features';
import routes from '@/seo/routes.json';
import {
  LATEX_CLAIM,
  TAX_BEFORE_PERIOD,
  hasUntaxedPrice,
  readSource,
  scanSource,
  type CopyText,
  type HideFlag,
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

/** A string a user can read: not an import specifier, not a component's tag name. */
const isCopy = (t: CopyText) => t.kind === 'string' || t.kind === 'jsx';

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
    const frenchSource = scanned.filter((t) => isCopy(t) && FRENCH_PRICE.test(t.text));
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
        isCopy(t) &&
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
        isCopy(t) &&
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
    expect(scanned.filter((t) => isCopy(t) && TAX_BEFORE_PERIOD.test(t.text)).map(at)).toEqual([]);
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

// ---------------------------------------------------------------- record 29

/**
 * What points at a control each switch hides (bounded-designs.md §5.2), in
 * English and French: the control named, or offered as something Postr
 * does. A control's mere styling words ("italic", "rotate(90deg)") are not
 * claims, and the controls themselves are counted hidden by
 * src/poster/__tests__/mvpHidden.test.tsx and scripts/simplify-check.mjs.
 */
const HIDDEN_CLAIMS: Readonly<Record<Exclude<HideFlag, 'LATEX_EXPORT_ENABLED'>, readonly RegExp[]>> = {
  IMPORT_ENABLED: [
    // The file type, not a CSS class (.postr-ack) or the domain (postr.sh).
    /(^|\s)\.postr(?![-\w.])/i,
    /\bimport (an?|your|one|existing|the)( existing)? (poster|PowerPoint|PDF|file)\b/i,
    /import one you already have|you can import it|Import (PDF|it\b)|Import…|Import and edit|Already have a poster/i,
    /importez[- ](la|le|et modifiez)|importer (une|votre) affiche|affiche que vous avez déjà/i,
  ],
  ADJUSTMENTS_ENABLED: [
    /\bcrop (the |an )?image|✂|Exit crop|Apply crop|Reset crop/i,
    /Drag to rotate|rotate (handle|control)|Rotation tricks|faire pivoter/i,
    /Stretch to fit|Show grid|Scan image|scan an image/i,
    /custom palette|palette designer|build your own|créez la vôtre/i,
    /Copy a design|Copier un design|poster you admire|affiche que vous admirez|Borrow a look/i,
    /style presets?|préréglages? de style/i,
    /line (height|spacing)|interligne/i,
    /\b[Ss]trikethrough\b|Highlight ·|Text · |Default color|Reset to palette/,
    /Caption (position|spacing)|✨ Format|Format (table|note)\b/i,
    /border (style|presets?)|header strip|column borders|Drag to resize column/i,
    /citation[- ]styles?|styles de citation|Pick APA|(Vancouver|IEEE)( and \w+)? styles?|APA 7, Vancouver/i,
  ],
  EDITOR_EXTRAS_ENABLED: [
    /Staples/,
    /guidelines? panel|consignes d’affiche|board sizes|conference size|recherche des formats de congrès/i,
    /\bchecklist|liste de vérification|word targets|cibles de nombre de mots|Scratch Pad/i,
    /Duplicate this poster/i,
  ],
};

/** The switch each component is rendered only behind; the file it is defined in. */
const HIDDEN_COMPONENTS: Readonly<Record<string, { flag: HideFlag; file: string }>> = {
  ImportSection: { flag: 'IMPORT_ENABLED', file: 'apps/web/src/poster/sidebar/ImportSection.tsx' },
  ImportTile: { flag: 'IMPORT_ENABLED', file: 'apps/web/src/poster/sidebar/ImportTile.tsx' },
  ImportConfirmReplaceModal: { flag: 'IMPORT_ENABLED', file: 'apps/web/src/components/ImportConfirmReplaceModal.tsx' },
  ImportPosterModal: { flag: 'IMPORT_ENABLED', file: 'apps/web/src/components/ImportPosterModal.tsx' },
  PostrExportButton: { flag: 'IMPORT_ENABLED', file: 'apps/web/src/poster/sidebar/PostrExportButton.tsx' },
  CopyDesignModal: { flag: 'ADJUSTMENTS_ENABLED', file: 'apps/web/src/components/CopyDesignModal.tsx' },
  PaletteDesigner: { flag: 'ADJUSTMENTS_ENABLED', file: 'apps/web/src/components/PaletteDesigner.tsx' },
  PresetEditModal: { flag: 'ADJUSTMENTS_ENABLED', file: 'apps/web/src/components/PresetEditModal.tsx' },
  CropOverlay: { flag: 'ADJUSTMENTS_ENABLED', file: 'apps/web/src/poster/CropOverlay.tsx' },
  ImageScanSection: { flag: 'ADJUSTMENTS_ENABLED', file: 'apps/web/src/poster/ReadabilityPanel.tsx' },
  ImageFitToggle: { flag: 'ADJUSTMENTS_ENABLED', file: 'apps/web/src/poster/Sidebar.tsx' },
  CropHint: { flag: 'ADJUSTMENTS_ENABLED', file: 'apps/web/src/poster/Sidebar.tsx' },
  HeadingEditor: { flag: 'ADJUSTMENTS_ENABLED', file: 'apps/web/src/poster/Sidebar.tsx' },
  TextBlockEditor: { flag: 'ADJUSTMENTS_ENABLED', file: 'apps/web/src/poster/Sidebar.tsx' },
  CustomBorderMockup: { flag: 'ADJUSTMENTS_ENABLED', file: 'apps/web/src/poster/Sidebar.tsx' },
  TableContextMenu: { flag: 'ADJUSTMENTS_ENABLED', file: 'apps/web/src/poster/blocks.tsx' },
  StaplesPrintModal: { flag: 'EDITOR_EXTRAS_ENABLED', file: 'apps/web/src/components/StaplesPrintModal.tsx' },
  GuidelinesPanel: { flag: 'EDITOR_EXTRAS_ENABLED', file: 'apps/web/src/poster/GuidelinesPanel.tsx' },
};

/**
 * Files whose copy is reached only through a hidden component or a hidden
 * route, with the reason. Every string in them, at the top level too, is
 * not shown while their switch is off.
 */
const HIDDEN_FILES: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    Object.values(HIDDEN_COMPONENTS)
      .filter((c) => !/(Sidebar|ReadabilityPanel|blocks)\.tsx$/.test(c.file))
      .map((c) => [c.file, `defines a component rendered only with ${c.flag} on`]),
  ),
  // The readers run only from the import modals; importPostr also builds the
  // welcome poster, whose failure is caught and never shown
  // (data/seedWelcomePoster.ts).
  'apps/web/src/import/': 'run only from the hidden import',
  // /paper-to-poster redirects to / (routes.tsx header).
  'apps/web/src/pages/PaperToPoster.tsx': 'a page whose route redirects',
};
const inHiddenFile = (file: string) => Object.keys(HIDDEN_FILES).some((f) => (f.endsWith('/') ? file.startsWith(f) : file === f));

/**
 * A hidden control's own label, outside any hidden component, and the test
 * that shows the control is not drawn while its switch is off.
 */
const HIDDEN_LABELS: Readonly<Record<string, readonly string[]>> = {
  // The rotate control (blocks.tsx rotateButton): blockControls draws it only
  // with ADJUSTMENTS_ENABLED (mvpHidden.test.tsx, "an image selected").
  'apps/web/src/poster/blocks.tsx': ['Drag to rotate — snaps at 0/45/90/135/180° (Shift = 15° steps)'],
  // The status of the profile's presets row's "Clear all", a row drawn only
  // with ADJUSTMENTS_ENABLED (mvpHiddenPages.test.tsx).
  'apps/web/src/pages/Profile.tsx': ['Style presets cleared.'],
};

const WEB_APP = /^apps\/web\//;
const RECORD_29 = Object.keys(HIDDEN_CLAIMS) as Array<keyof typeof HIDDEN_CLAIMS>;
const SWITCH_ON: Readonly<Record<string, boolean>> = { IMPORT_ENABLED, ADJUSTMENTS_ENABLED, EDITOR_EXTRAS_ENABLED };

/** Shown while every record-29 switch that is off stays off: no off switch guards it. */
function shown(t: Found): boolean {
  const off = (f: HideFlag) => f !== 'LATEX_EXPORT_ENABLED' && !SWITCH_ON[f];
  if (t.guardedBy.some(off)) return false;
  if (inHiddenFile(t.file)) return false;
  const host = t.component ? HIDDEN_COMPONENTS[t.component] : undefined;
  if (host && host.file === t.file && off(host.flag)) return false;
  return !(HIDDEN_LABELS[t.file] ?? []).includes(t.text);
}

describe('record 29: no copy points at a control a switch hides', () => {
  it('every hidden component is rendered only behind its switch, or inside another one hidden by it', () => {
    const bad = scanned.filter((t) => {
      if (t.kind !== 'element') return false;
      const c = HIDDEN_COMPONENTS[t.text];
      if (!c || SWITCH_ON[c.flag]) return false;
      if (t.guardedBy.includes(c.flag)) return false;
      const host = t.component ? HIDDEN_COMPONENTS[t.component] : undefined;
      if (host && host.flag === c.flag) return false;
      return !(inHiddenFile(t.file) && Object.values(HIDDEN_COMPONENTS).some((h) => h.file === t.file && h.flag === c.flag));
    });
    expect(bad.map(at)).toEqual([]);
    // The list is live: each component is still defined where it says.
    for (const [name, c] of Object.entries(HIDDEN_COMPONENTS)) {
      expect(scanned.some((t) => t.file === c.file && t.component === name), `${name} in ${c.file}`).toBe(true);
    }
  });

  for (const flag of RECORD_29) {
    describe.runIf(!SWITCH_ON[flag])(`${flag} is off`, () => {
      it('no web app string a user can be shown names a control it hides', () => {
        const hits = scanned.filter(
          (t) => isCopy(t) && WEB_APP.test(t.file) && shown(t) && HIDDEN_CLAIMS[flag].some((re) => re.test(t.text)),
        );
        expect(hits.map(at)).toEqual([]);
      });

      it('the crawler copy does not name one', () => {
        expect(routeStrings().filter((r) => HIDDEN_CLAIMS[flag].some((re) => re.test(r.text)))).toEqual([]);
      });

      it('index.html and the public text files do not name one', () => {
        expect(rawLines.filter((l) => HIDDEN_CLAIMS[flag].some((re) => re.test(l.text)))).toEqual([]);
      });
    });
  }

  it('each listed hidden label is still where the list says', () => {
    for (const [file, labels] of Object.entries(HIDDEN_LABELS)) {
      const there = scanned.filter((t) => t.file === file).map((t) => t.text);
      for (const l of labels) expect(there, `${file} ${l}`).toContain(l);
    }
  });
});
