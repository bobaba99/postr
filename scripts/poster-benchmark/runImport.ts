/**
 * Playwright UI driver for the poster-import benchmark.
 *
 * For each PDF in ./pdf/:
 *   1. open /auth?guest=1 → wait for redirect to /dashboard
 *   2. click "+ New poster" chevron → "Import PDF / .postr…"
 *   3. setInputFiles on the hidden <input type=file>
 *   4. wait for preview, click "Create poster from import"
 *   5. wait for /p/:id to load + editor to settle
 *   6. open Layout tab in sidebar, click "Auto-Arrange"
 *   7. screenshot the canvas frame
 *   8. write screenshot + small JSON sidecar (block-type counts) to ./shots/
 *
 * The screenshots are the primary artifact — visual review (next step
 * in the pipeline) decides pass/fail by looking for cartoon decoration
 * leaks, orphan text fragments, merged multi-logo blocks, broken list
 * rendering, and missing headings. The block-type counts are a
 * secondary sanity signal, NOT the source of truth.
 *
 * Run:  tsx scripts/poster-benchmark/runImport.ts
 *
 * Pre-req: dev servers up (web :5174, api :8787) and one prior guest
 * session is fine — the script reuses cookies via a persistent
 * context.
 */

import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page, type ConsoleMessage } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PDF_DIR = join(__dirname, 'pdf');
const SHOT_DIR = join(__dirname, 'shots');
mkdirSync(SHOT_DIR, { recursive: true });

const WEB_URL = process.env.POSTR_WEB_URL ?? 'http://localhost:5174';
const PER_POSTER_TIMEOUT_MS = 180_000;

interface PosterResult {
  id: string;
  ok: boolean;
  blockTypeCounts: Record<string, number>;
  importTraces: { tag: string; payload: unknown }[];
  warnings: string[];
  error?: string;
  durationMs: number;
}

const results: PosterResult[] = [];

const pdfs = readdirSync(PDF_DIR)
  .filter((f) => f.endsWith('.pdf'))
  .sort();

(async () => {
  // eslint-disable-next-line no-console
  console.log(`Driving ${pdfs.length} posters through the import pipeline.`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2, // crisper screenshots for visual review
  });
  const page = await ctx.newPage();

  // Sign in once via guest flow; subsequent imports reuse the session.
  await page.goto(`${WEB_URL}/auth?guest=1`, { waitUntil: 'networkidle' });
  await page.waitForURL((u) => u.toString().includes('/dashboard'), {
    timeout: 15_000,
  });
  // eslint-disable-next-line no-console
  console.log(`  · signed in as guest, on dashboard`);

  for (const pdf of pdfs) {
    const id = pdf.replace(/\.pdf$/, '');
    const pdfPath = join(PDF_DIR, pdf);
    const start = Date.now();
    const traces: { tag: string; payload: unknown }[] = [];
    const warnings: string[] = [];
    let ok = false;
    let error: string | undefined;
    let blockTypeCounts: Record<string, number> = {};

    // Re-attach the console listener per poster so traces don't bleed
    // across runs.
    const listener = (msg: ConsoleMessage) => {
      const text = msg.text();
      if (text.startsWith('[import.trace]') || text.startsWith('[import.preScan]') || text.startsWith('[import.budget]') || text.startsWith('[import.verifier]')) {
        try {
          // Playwright concatenates args with a space; the second arg
          // is the structured object (logged as "[Object]" in some
          // versions). Capture the raw text — good enough for the
          // sidecar.
          traces.push({ tag: text.split(' ')[0]! ?? '[unknown]', payload: text });
        } catch {
          /* swallow */
        }
      }
    };
    page.on('console', listener);

    try {
      // eslint-disable-next-line no-console
      console.log(`\n→ ${id}`);

      // Make sure we're on /dashboard for each poster (not still on
      // the previous /p/:id route).
      if (!page.url().includes('/dashboard')) {
        await page.goto(`${WEB_URL}/dashboard`, { waitUntil: 'networkidle' });
      }

      // Open import modal: click ▾ then "Import PDF / .postr…"
      // Two New-Poster buttons exist on the dashboard (header + empty
      // state), so .first() pins to the header one.
      await page.getByRole('button', { name: 'More poster options' }).first().click();
      await page.getByRole('menuitem', { name: /Import PDF/i }).first().click();

      // Drop the PDF via the hidden file input. The drop-zone has the
      // <input ref={fileRef}> sibling; setInputFiles bypasses the
      // file-chooser dialog.
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(pdfPath);

      // Wait for preview state — the "Create poster from import"
      // button only appears once extraction finishes. The verifier +
      // pre-scan can take 30–90s per poster, so generous timeout.
      const confirmBtn = page.getByRole('button', { name: /Create poster from import/i });
      await confirmBtn.waitFor({ timeout: PER_POSTER_TIMEOUT_MS });

      // Capture warnings displayed in the preview before confirming.
      const warningEls = await page.locator('ul li').allInnerTexts().catch(() => [] as string[]);
      warnings.push(...warningEls.filter((w) => w.length < 240));

      await confirmBtn.click();

      // Wait for editor route + canvas to settle.
      await page.waitForURL((u) => /\/p\/[a-z0-9-]+/i.test(u.toString()), {
        timeout: 30_000,
      });
      await page.locator('[data-postr-canvas-frame]').first().waitFor({ timeout: 30_000 });
      // Give blocks a moment to mount + storage:// images to resolve.
      await page.waitForTimeout(2500);

      // ── Auto-arrange ──────────────────────────────────────────
      // The Layout tab is open by default after arriving at /p/:id;
      // click the Auto-Arrange button.
      await page.getByRole('button', { name: /Auto-Arrange/i }).click();
      await page.waitForTimeout(1500); // packer + animation settle

      // Block-type counts via DOM (not source of truth — visual review
      // is). Count `data-block-type` attributes inside the canvas.
      const counts = await page.evaluate(() => {
        const out: Record<string, number> = {};
        document.querySelectorAll('[data-block-type]').forEach((el) => {
          const t = el.getAttribute('data-block-type') ?? 'unknown';
          out[t] = (out[t] ?? 0) + 1;
        });
        return out;
      });
      blockTypeCounts = counts;

      // ── Screenshot the canvas frame ───────────────────────────
      // The canvas can be larger than the viewport. Screenshot the
      // inner #poster-canvas element (the actual poster grid),
      // skipping any fixed-position editor chrome that overlaps the
      // canvas-frame's bounding rect. Hiding overlapping chrome via
      // CSS first so the screenshot shows ONLY the poster content.
      await page.addStyleTag({
        content: `
          [data-postr-sidebar],
          [data-postr-guidelines],
          [data-postr-topbar],
          [aria-label="Show sidebar"],
          [aria-label="Show guidelines"],
          [role="alert"] { display: none !important; }
        `,
      });
      await page.waitForTimeout(150);
      const canvas = page.locator('#poster-canvas').first();
      await canvas.screenshot({ path: join(SHOT_DIR, `${id}.png`) });
      ok = true;
      // eslint-disable-next-line no-console
      console.log(`  ✓ ${id}.png — blocks: ${JSON.stringify(counts)}`);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      // Best-effort screenshot so the report shows the failed state.
      try {
        await page.screenshot({ path: join(SHOT_DIR, `${id}.error.png`), fullPage: true });
      } catch {
        /* swallow */
      }
      // eslint-disable-next-line no-console
      console.log(`  ✗ ${id} — ${error}`);
    } finally {
      page.off('console', listener);
      results.push({
        id,
        ok,
        blockTypeCounts,
        importTraces: traces,
        warnings,
        error,
        durationMs: Date.now() - start,
      });
    }
  }

  await browser.close();

  // Write the sidecar JSON for the visual-review step.
  writeFileSync(
    join(SHOT_DIR, 'results.json'),
    JSON.stringify(results, null, 2),
  );
  // eslint-disable-next-line no-console
  console.log(`\nDone. ${results.filter((r) => r.ok).length}/${results.length} succeeded.`);
  // eslint-disable-next-line no-console
  console.log(`Screenshots + results.json at ${SHOT_DIR}`);
})();
