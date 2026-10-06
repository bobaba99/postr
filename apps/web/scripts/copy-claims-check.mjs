#!/usr/bin/env node
/**
 * copy-claims-check.mjs — what a visitor reads, against two owner decisions
 * of 2026-10-06 (fix 25, docs/fixes/25-latex-hidden-prices.md):
 *
 *   1. The LaTeX export is hidden (config/features.ts LATEX_EXPORT_ENABLED):
 *      no button for it, and no page outside the legal pages names it.
 *   2. Stripe prices are before tax: every price shown says tax is extra,
 *      right beside it.
 *
 * ENTRY POINT: the user's. The app's own Vite server and Chromium
 * (lib/editorHarness.mjs), the backend faked at the network. A first visitor
 * opens /p/new (a silent guest session, lib/guestBackend.mjs), clicks the
 * rail's EXPORT tab, then "▤ PowerPoint (.pptx)" (the guest's account
 * prompt); a free account does the same and reads the paywall; a term holder
 * (editorHarness's installMocks) opens a 48 × 36, a 60 × 40 and a 120 × 60 in
 * poster's Export tab. The public pages are entered at their URLs. Text is
 * read with `innerText`, the rendered text with its line breaks: jsdom has
 * no layout, so the unit tests read `textContent` and join it themselves.
 *
 * CLAIMS (counted; a claim is OBSERVED when the defect is present)
 *   X1  the Export tab shows a LaTeX button ([data-postr-export-latex]), for
 *       a guest, a free account or a term holder
 *   X2  the Export tab's text (paywall, credit line, size notes, the guest's
 *       account prompt) names LaTeX, XeLaTeX, LuaLaTeX, Overleaf or a .tex
 *   X3  the Export tab has no PowerPoint button (a control: the panel read
 *       is the right one)
 *   P1  a public page's text, title or description names LaTeX (as X2)
 *   P2  a price on a page or in the paywall is not followed by a tax note
 *       within 40 characters
 *   P3  a page that should show a price shows none (a control)
 *   P4  a tax note sits between a price and its billing period
 *       ("CA$18.99 + applicable taxes / 4 months" reads as taxes per 4
 *       months; review round 1, B-R1-03). Also recorded, not judged: the
 *       /auth?plan= label's text and its line count at 375 and 1440 px
 *
 * NOT COVERED: the legal pages (stream A of 2026-10-06 owns them); the
 * prerendered HTML a crawler reads (the copy inventory,
 * src/__tests__/copyInventory.test.ts, reads its source, seo/routes.json);
 * /billing/success (it needs a completed checkout); Stripe's own pages.
 *
 * The patterns are the copy inventory's (src/test/copyScan.ts LATEX_CLAIM,
 * PRICE, TAX_NOTE, TAX_BEFORE_PERIOD), copied: this file runs in bare Node.
 *
 * RUN (from apps/web; port 5880 by default)
 *   node scripts/copy-claims-check.mjs [--port 5880]
 *   POSTR_MUTANT=../../docs/fixes/25-latex-hidden-prices.mutants.json#switch-on node scripts/copy-claims-check.mjs
 *
 * EXIT  0 nothing observed · 1 at least one claim OBSERVED · 2 instrument error
 *
 * Side effect: loading vite.config.ts rewrites apps/web/public/version.json.
 */
import { openEditor, startHarness, log } from './lib/editorHarness.mjs';
import { newGuestPage, newState, openNewPoster } from './lib/guestBackend.mjs';

const LATEX_CLAIM = /(?:^|[^a-z]|xe|lua|pdf)latex|overleaf|\.tex\b/i;
const PRICE = /(?:CA|C|US)\$\s?\d+(?:[.,]\d{2})?|\$\s?\d+[.,]\d{2}\b|\b\d+[.,]\d{2}\s?(?:\$|CAD\b|USD\b)/g;
const TAX_NOTE = /\btax(?:e|es)?\b/i;
const TAX_BEFORE_PERIOD =
  /\btax(?:e|es)?\b(?:\s+applicables?|\s+en\s+sus)?\s*(?:\/|\bper\b|\bevery\b|\beach\b|\bpar\b)\s*(?:\d+[\s-]*)?(?:months?|years?|weeks?|days?|terms?|mois|ans?|semaines?|jours?)\b/i;

const args = process.argv.slice(2);
const port = Number(args.includes('--port') ? args[args.indexOf('--port') + 1] : 5880);

const observed = [];
const note = (claim, where, detail) => {
  observed.push({ claim, where, detail });
  log(`OBSERVED ${claim} ${where}: ${detail}`);
};

/** Each price in `text` whose next 40 characters say nothing of tax. */
function untaxed(text) {
  const flat = text.replace(/\s+/g, ' ');
  return [...flat.matchAll(PRICE)]
    .map((m) => ({ price: m[0], after: flat.slice(m.index + m[0].length, m.index + m[0].length + 40) }))
    .filter((p) => !TAX_NOTE.test(p.after));
}
const pricesIn = (text) => [...text.replace(/\s+/g, ' ').matchAll(PRICE)].length;

function judgeText(where, text, { expectPrices = 0 } = {}) {
  const latex = text.split('\n').filter((l) => LATEX_CLAIM.test(l));
  if (latex.length) note(where.startsWith('export') ? 'X2' : 'P1', where, JSON.stringify(latex[0].slice(0, 140)));
  for (const p of untaxed(text)) note('P2', where, `${p.price} then ${JSON.stringify(p.after)}`);
  const flat = text.replace(/\s+/g, ' ');
  const order = flat.match(TAX_BEFORE_PERIOD);
  if (order) note('P4', where, JSON.stringify(flat.slice(Math.max(0, order.index - 30), order.index + order[0].length)));
  const n = pricesIn(text);
  if (n < expectPrices) note('P3', where, `${n} price(s), expected at least ${expectPrices}`);
  return { latexLines: latex.length, prices: n };
}

const railTab = (page, name) => page.locator('button[data-postr-tab]').filter({ hasText: new RegExp(`^${name}\\d*$`, 'i') }).first();

/** The Export tab's panel: the sidebar region holding the PowerPoint button and Save PDF. */
async function readExportTab(page, where) {
  await railTab(page, 'export').click();
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const pptx = document.querySelector('[data-postr-export-pptx]');
    let panel = pptx;
    while (panel && !/Save PDF/.test(panel.textContent || '')) panel = panel.parentElement;
    return {
      pptx: !!pptx,
      latexButtons: document.querySelectorAll('[data-postr-export-latex]').length,
      text: panel ? panel.innerText : '',
    };
  });
  if (!r.pptx) note('X3', where, 'no PowerPoint button');
  if (r.latexButtons > 0) note('X1', where, `${r.latexButtons} LaTeX button(s)`);
  return r;
}

const results = [];
async function scenario(name, fn) {
  try {
    const r = await fn();
    results.push({ name, ...r });
    log(`[${name}] ${JSON.stringify(r)}`);
  } catch (e) {
    log(`INSTRUMENT ERROR in ${name}: ${e.stack || e}`);
    process.exitCode = 2;
  }
}

const h = await startHarness({ name: 'copy-claims', port });
try {
  // A guest (no account): the Export tab, then the account prompt the PowerPoint click opens.
  await scenario('export: guest', async () => {
    const state = newState();
    const { context, page } = await newGuestPage(h, state);
    try {
      await openNewPoster(page, h.base);
      const tab = await readExportTab(page, 'export: guest');
      const t = judgeText('export: guest', tab.text);
      await page.locator('[data-postr-export-pptx]').click();
      await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
      const prompt = await page.locator('[role="dialog"]').first().innerText();
      const p = judgeText('export: guest account prompt', prompt);
      return { latexButtons: tab.latexButtons, latexLines: t.latexLines + p.latexLines, prompt: prompt.split('\n').slice(0, 3).join(' / ') };
    } finally {
      await context.close();
    }
  });

  // A free account: the paywall with both prices.
  await scenario('export: free account', async () => {
    const state = newState({ anonymous: false });
    const { context, page } = await newGuestPage(h, state);
    try {
      await openNewPoster(page, h.base);
      await page.waitForTimeout(600);
      const tab = await readExportTab(page, 'export: free account');
      if (!/Get the term/.test(tab.text)) note('P3', 'export: free account', 'no paywall on screen');
      const t = judgeText('export: free account', tab.text, { expectPrices: 2 });
      return { latexButtons: tab.latexButtons, ...t };
    } finally {
      await context.close();
    }
  });

  // A term holder, at three sizes: full size, half size (56–112 in), too big (> 112 in).
  for (const [w, hgt] of [[48, 36], [60, 40], [120, 60]]) {
    await scenario(`export: term holder ${w}x${hgt}`, async () => {
      const { context, page } = await openEditor(h, { viewport: { width: 1440, height: 900 }, poster: { w, h: hgt } });
      try {
        const where = `export: term holder ${w}x${hgt}`;
        const tab = await readExportTab(page, where);
        const t = judgeText(where, tab.text);
        const sizeNote = tab.text.split('\n').find((l) => /half size|too large/.test(l)) ?? null;
        if (w === 120 && !/Save a PDF instead/.test(tab.text)) note('X2', where, 'the too-big note does not send the user to the PDF');
        return { latexButtons: tab.latexButtons, ...t, sizeNote: sizeNote && sizeNote.slice(0, 160) };
      } finally {
        await context.close();
      }
    });
  }

  // The public pages, and the checkout-resume banners.
  const PAGES = [
    ['/', 0], ['/about', 0], ['/why-posters', 0], ['/pricing', 2], ['/tools/figure-readability', 0],
    ['/auth', 0], ['/auth?plan=term', 1], ['/auth?plan=pack', 1], ['/billing/cancel', 0],
  ];
  for (const [route, expectPrices] of PAGES) {
    await scenario(`page ${route}`, async () => {
      const state = newState();
      const { context, page } = await newGuestPage(h, state);
      try {
        await page.goto(`${h.base}${route}`);
        await page.waitForSelector('main, h1', { timeout: 60000 });
        await page.waitForTimeout(1200);
        const r = await page.evaluate(() => ({
          path: location.pathname + location.search,
          title: document.title,
          description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
          text: document.body.innerText,
        }));
        const t = judgeText(`page ${route}`, `${r.title}\n${r.description}\n${r.text}`, { expectPrices });
        if (!route.startsWith('/auth?plan=')) return { landed: r.path, ...t };
        // The plan label above "Change plan": its text and how many lines it takes.
        const label = {};
        for (const width of [375, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.waitForTimeout(200);
          label[width] = await page.evaluate(() => {
            const el = [...document.querySelectorAll('div')].find(
              (d) => d.children.length === 0 && /^(Term|Export pack) · /.test(d.textContent || ''),
            );
            if (!el) return null;
            const box = el.getBoundingClientRect();
            const lh = parseFloat(getComputedStyle(el).lineHeight);
            return { text: el.innerText, height: Math.round(box.height), lines: Math.round(box.height / lh) };
          });
        }
        return { landed: r.path, ...t, label };
      } finally {
        await context.close();
      }
    });
  }
} finally {
  await h.stop();
}

const byClaim = {};
for (const o of observed) byClaim[o.claim] = (byClaim[o.claim] ?? 0) + 1;
console.log(JSON.stringify({ git: h.git, engine: h.engine, mutant: h.mutant, scenarios: results.length, observed: byClaim, results }, null, 2));
if (process.exitCode !== 2) process.exitCode = observed.length > 0 ? 1 : 0;
