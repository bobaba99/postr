/**
 * M1 mobile audit. Measures rather than eyeballs.
 *
 * Checks, per route, at three widths:
 *   - horizontal overflow (the page body must never scroll sideways)
 *   - tap targets under 44x44 CSS px (Apple HIG / WCAG 2.5.5 target size)
 *   - form inputs under 16px font (iOS Safari auto-zooms on focus below that)
 *   - text under 12px (illegible on a phone)
 * Reports offenders with the selector and measurement, so fixes are targeted.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const ROUTES = ['/', '/about', '/chart-chooser', '/paper-to-poster', '/privacy', '/cookies', '/terms'];
const WIDTHS = [
  { w: 375, h: 812, label: 'iPhone SE/13 mini' },
  { w: 414, h: 896, label: 'iPhone Plus/Max' },
  { w: 768, h: 1024, label: 'iPad portrait' },
];

const audit = async (page) => page.evaluate(() => {
  const de = document.documentElement;
  const out = {
    overflowBy: de.scrollWidth - window.innerWidth,
    smallTargets: [],
    zoomingInputs: [],
    tinyText: [],
    collapsedReveals: [],
  };

  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
      : '';
    const txt = (el.innerText || el.value || '').trim().slice(0, 28);
    return `${el.tagName.toLowerCase()}${id}${cls}${txt ? ` "${txt}"` : ''}`;
  };

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && el.offsetParent !== null;
  };

  // Interactive elements below the 44px target-size floor.
  for (const el of document.querySelectorAll('a, button, input, select, textarea, [role="button"]')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 44 || r.height < 44) {
      out.smallTargets.push({ el: describe(el), w: Math.round(r.width), h: Math.round(r.height) });
    }
  }

  // Text inputs below 16px trigger iOS Safari's focus zoom.
  for (const el of document.querySelectorAll('input, textarea, select')) {
    if (!visible(el)) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 16) out.zoomingInputs.push({ el: describe(el), fontSize: fs });
  }

  // Body copy that would be hard to read on a phone.
  for (const el of document.querySelectorAll('p, li, span, div')) {
    if (!visible(el)) continue;
    if (!el.innerText || el.children.length > 0) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs > 0 && fs < 12) out.tinyText.push({ el: describe(el), fontSize: fs });
  }

  // Reveal wrappers that claim to be open but render at zero height.
  //
  // Deliberately does NOT use visible() — that helper skips zero-height
  // elements, which is exactly the state this check exists to catch.
  //
  // Two independent bugs produced this on /chart-chooser: a
  // requestAnimationFrame that never fired in a background tab, so
  // `revealed` stayed false; and a grid-template-rows 0fr -> 1fr
  // transition that never interpolated, so the row computed to 0px
  // even when revealed was true. Both left content in the DOM and in
  // the accessibility tree while clipping it to nothing — the paste
  // box and every entry button, invisible on a live page.
  //
  // jsdom does not compute grid layout, so no vitest suite can catch
  // this class of failure. It has to be asserted in a real browser.
  for (const el of document.querySelectorAll('[data-revealed="true"]')) {
    const r = el.getBoundingClientRect();
    const inner = el.firstElementChild;
    const wanted = inner ? inner.scrollHeight : 0;
    // Content worth showing (>8px) that is rendering at under 4px.
    if (wanted > 8 && r.height < 4) {
      out.collapsedReveals.push({
        el: describe(el),
        renderedHeight: Math.round(r.height),
        contentHeight: wanted,
        gridTemplateRows: getComputedStyle(el).gridTemplateRows,
      });
    }
  }

  return out;
});

const browser = await chromium.launch();
const findings = [];

for (const vp of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(400);
    const r = await audit(page);
    const problems =
      (r.overflowBy > 0 ? 1 : 0) +
      r.smallTargets.length +
      r.zoomingInputs.length +
      r.tinyText.length +
      r.collapsedReveals.length;
    findings.push({ width: vp.w, label: vp.label, route, ...r, problems });
  }
  await ctx.close();
}

await browser.close();

// ── report ────────────────────────────────────────────────────────
const line = (s) => console.log(s);
line('M1 MOBILE AUDIT — measured, not eyeballed\n');

line('COLLAPSED REVEALS (content present but clipped to zero height)');
const collapsed = findings.filter((f) => f.collapsedReveals.length);
if (!collapsed.length) line('  none — every open section renders its content');
else {
  const seen = new Set();
  collapsed.forEach((f) => f.collapsedReveals.forEach((c) => {
    const k = f.route + c.el;
    if (seen.has(k)) return;
    seen.add(k);
    line(
      `  ${f.route} @${f.width}px: ${c.el} rendered ${c.renderedHeight}px ` +
      `but content is ${c.contentHeight}px (grid-template-rows: ${c.gridTemplateRows})`,
    );
  }));
}

line('\nOVERFLOW (page body must never scroll sideways)');
const overflow = findings.filter((f) => f.overflowBy > 0);
if (!overflow.length) line('  none at any width — clean');
else overflow.forEach((f) => line(`  ${f.route} @${f.width}px overflows by ${f.overflowBy}px`));

line('\nINPUTS UNDER 16px (iOS Safari zooms the page on focus)');
const zoom = findings.filter((f) => f.zoomingInputs.length);
if (!zoom.length) line('  none — clean');
else {
  const seen = new Set();
  zoom.forEach((f) => f.zoomingInputs.forEach((z) => {
    const k = f.route + z.el;
    if (seen.has(k)) return;
    seen.add(k);
    line(`  ${f.route}: ${z.el} at ${z.fontSize}px`);
  }));
}

line('\nTAP TARGETS UNDER 44px (only at phone widths)');
const phone = findings.filter((f) => f.width < 500 && f.smallTargets.length);
if (!phone.length) line('  none — clean');
else {
  const seen = new Set();
  phone.forEach((f) => f.smallTargets.forEach((t) => {
    const k = f.route + t.el;
    if (seen.has(k)) return;
    seen.add(k);
    line(`  ${f.route}: ${t.el} — ${t.w}x${t.h}`);
  }));
}

line('\nTEXT UNDER 12px');
const tiny = findings.filter((f) => f.tinyText.length);
if (!tiny.length) line('  none — clean');
else {
  const seen = new Set();
  tiny.forEach((f) => f.tinyText.forEach((t) => {
    const k = f.route + t.el;
    if (seen.has(k)) return;
    seen.add(k);
    line(`  ${f.route}: ${t.el} at ${t.fontSize}px`);
  }));
}

line('\nPER-ROUTE PROBLEM COUNT (375px)');
findings.filter((f) => f.width === 375)
  .sort((a, b) => b.problems - a.problems)
  .forEach((f) => line(`  ${String(f.problems).padStart(3)}  ${f.route}`));
