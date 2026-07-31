/**
 * Text-audit scraper — Postr.
 *
 * Serves apps/web/dist via `vite preview`, walks every route with
 * Playwright, extracts all visible user-facing text with its on-page
 * location, overlays numbered markers, screenshots each page, and emits
 * a self-contained audit HTML the reviewer edits in place:
 *   - every text item is editable; edits autosave to localStorage
 *   - "Copy audit for LLM" produces a markdown prompt of original→edit
 *   - "Download JSON" saves the full edited table locally
 *
 * Run from the repo root of the text-audit worktree:
 *   npx tsx scripts/text-audit/scrape.mts
 * Output: docs/text-audit/index.html + docs/text-audit/shots/*.png
 * Requires: `npm run build --workspace=apps/web` has been run (dist fresh).
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = join(root, 'docs', 'text-audit');
const shotsDir = join(outDir, 'shots');
const PORT = 4174;
const BASE = `http://localhost:${PORT}`;

const ROUTES = [
  '/', '/about', '/why-posters', '/pricing', '/chart-chooser',
  '/paper-to-poster', '/paper-to-slides',
  '/privacy', '/privacy/fr', '/cookies', '/cookies/fr', '/terms', '/terms/fr',
  '/auth', '/dashboard', '/profile', '/billing/success', '/billing/cancel',
  '/presentation-checker', '/p/new', '/404',
];

// ---------- in-page extraction (plain JS — runs in the browser) ----------
const EXTRACT_FN = `(() => {
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'PATH', 'BR', 'HR', 'META', 'LINK', 'TITLE']);
  const TEXTY = new Set(['H1','H2','H3','H4','H5','H6','P','A','BUTTON','LABEL','LI','TD','TH','SPAN','DIV','LEGEND','SUMMARY','CAPTION','FIGCAPTION','DT','DD','OPTION','STRONG','EM','SMALL','B','I','U','CODE','KBD','SAMP','MARK','CITE','Q','BLOCKQUOTE','PRE']);
  const directText = (el) => {
    let t = '';
    for (const n of el.childNodes) if (n.nodeType === Node.TEXT_NODE) t += n.textContent;
    return t.trim();
  };
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const sectionOf = (el) => {
    const parts = [];
    let cur = el;
    while (cur && cur !== document.body) {
      if (cur.dataset) {
        for (const k of Object.keys(cur.dataset)) {
          if (k.startsWith('postr')) { parts.push('data-' + k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())); break; }
        }
      }
      const tag = cur.tagName;
      if (['HEADER','FOOTER','NAV','MAIN','FORM','ASIDE'].includes(tag)) parts.push(tag.toLowerCase());
      if (tag === 'SECTION' && cur.getAttribute('aria-label')) parts.push('section "' + cur.getAttribute('aria-label') + '"');
      cur = cur.parentElement;
    }
    // nearest heading in document order (reading order), not subtree guess
    let heading = '';
    for (const h of document.querySelectorAll('h1,h2,h3')) {
      if (el.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_PRECEDING) {
        heading = h.textContent.trim().slice(0, 60);
      }
    }
    const where = parts.length ? parts.slice(0, 2).reverse().join(' › ') : 'page';
    return heading ? where + ' › under "' + heading + '"' : where;
  };
  const items = [];
  const seenText = new Set();
  const all = document.querySelectorAll('*');
  for (const el of all) {
    if (SKIP.has(el.tagName) || !TEXTY.has(el.tagName) && !el.getAttribute('role') && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') continue;
    if (!visible(el)) continue;
    let text = directText(el);
    const aria = el.getAttribute('aria-label');
    const placeholder = el.getAttribute('placeholder');
    if (!text && el.tagName === 'BUTTON') text = (el.textContent || '').trim();
    if (!text && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      text = (el.value || '').trim() || (placeholder || '').trim();
    }
    if (!text && aria) text = aria.trim();
    if (!text || text.length < 2) continue;
    if (text.length > 400) continue;
    // skip if an ancestor with the SAME full text was already captured
    let dup = false;
    let p = el.parentElement;
    while (p) { if (seenText.has(p)) { dup = true; break; } p = p.parentElement; }
    if (dup) continue;
    // skip if this element's whole text equals a descendant already captured
    const own = (el.textContent || '').trim();
    if (own && [...el.children].some((c) => seenText.has(c) && (c.textContent || '').trim() === own)) continue;
    seenText.add(el);
    const r = el.getBoundingClientRect();
    const sameTag = [...el.parentElement.children].filter((c) => c.tagName === el.tagName);
    const idx = sameTag.length > 1 ? ' ' + (sameTag.indexOf(el) + 1) + '/' + sameTag.length : '';
    items.push({
      tag: el.tagName.toLowerCase() + idx,
      role: el.getAttribute('role') || '',
      text,
      where: sectionOf(el),
      x: Math.round(r.left + window.scrollX),
      y: Math.round(r.top + window.scrollY),
      w: Math.round(r.width),
      h: Math.round(r.height),
    });
  }
  return items;
})()`;

const BADGE_FN = `(items) => {
  for (const it of items) {
    const b = document.createElement('div');
    b.textContent = String(it.n);
    b.style.cssText = 'position:absolute;left:' + Math.max(0, it.x - 6) + 'px;top:' + Math.max(0, it.y - 6) + 'px;'
      + 'min-width:20px;height:20px;padding:0 4px;border-radius:10px;background:#7c6aed;color:#fff;'
      + 'font:bold 11px/20px system-ui,sans-serif;text-align:center;z-index:2147483647;pointer-events:none;'
      + 'box-shadow:0 0 0 2px rgba(255,255,255,0.85);';
    document.body.appendChild(b);
  }
  return items.length;
}`;

const REMOVE_BADGES_FN = `() => {
  for (const b of document.querySelectorAll('div')) {
    if (b.style.zIndex === '2147483647') b.remove();
  }
  return true;
}`;

// ---------- preview server ----------
function waitForServer(url, timeoutMs = 30_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) return resolve();
      } catch { /* not up yet */ }
      if (Date.now() - start > timeoutMs) return reject(new Error('preview server did not start'));
      setTimeout(tick, 300);
    };
    tick();
  });
}

// ---------- audit HTML ----------
function auditHtml(pages) {
  const pagesJson = JSON.stringify(pages).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Postr — text audit</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0a0a12; color: #e2e2e8; font: 14px/1.5 system-ui, sans-serif; }
  header { position: sticky; top: 0; z-index: 10; background: #111118; border-bottom: 1px solid #2a2a3a; padding: 10px 16px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  header strong { font-size: 15px; }
  header .spacer { flex: 1; }
  button { background: #5641b8; color: #fff; border: 0; border-radius: 8px; padding: 7px 12px; font: 600 12px system-ui; cursor: pointer; }
  button.ghost { background: #1a1a26; border: 1px solid #2a2a3a; color: #c8cad0; }
  input[type="search"] { background: #1a1a26; border: 1px solid #2a2a3a; border-radius: 8px; color: #e2e2e8; padding: 7px 10px; width: 220px; }
  nav.pages { display: flex; gap: 6px; flex-wrap: wrap; padding: 8px 16px; background: #0d0d16; border-bottom: 1px solid #1f1f2e; }
  nav.pages a { color: #9b8cf0; text-decoration: none; font-size: 12px; padding: 2px 6px; border-radius: 6px; }
  nav.pages a:hover { background: #1a1a26; }
  section.page { padding: 18px 16px 30px; border-bottom: 2px solid #1f1f2e; }
  section.page h2 { margin: 0 0 12px; font-size: 16px; color: #b4a9f5; }
  .cols { display: grid; grid-template-columns: minmax(0, 55fr) minmax(0, 45fr); gap: 16px; align-items: start; }
  .shot { border: 1px solid #2a2a3a; border-radius: 10px; overflow: hidden; position: sticky; top: 64px; }
  .shot img { width: 100%; display: block; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th { text-align: left; color: #8b8f99; font-weight: 600; padding: 4px 8px; border-bottom: 1px solid #2a2a3a; position: sticky; top: 64px; background: #0a0a12; }
  td { vertical-align: top; padding: 6px 8px; border-bottom: 1px solid #16161f; }
  td.num { color: #9b8cf0; font-weight: 700; white-space: nowrap; }
  td.loc { color: #8b8f99; font-size: 11px; max-width: 170px; }
  td.orig { color: #e2e2e8; white-space: pre-wrap; max-width: 260px; }
  td.edit > div { min-height: 1.4em; min-width: 120px; background: #14121e; border: 1px dashed #3a3a4e; border-radius: 6px; padding: 4px 6px; outline: none; white-space: pre-wrap; }
  td.edit > div:focus { border-color: #7c6aed; }
  tr.edited td.edit > div { border-style: solid; border-color: #7c6aed; }
  tr.edited td.orig { color: #8b8f99; text-decoration: line-through; }
  .tag { color: #6b7280; font-size: 10px; }
  #toast { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); background: #1a1a26; border: 1px solid #7c6aed; border-radius: 8px; padding: 8px 14px; opacity: 0; transition: opacity 160ms; pointer-events: none; }
  @media (max-width: 1100px) { .cols { grid-template-columns: 1fr; } .shot { position: static; } }
</style>
</head>
<body>
<header>
  <strong>Postr text audit</strong>
  <span class="tag" id="counts"></span>
  <input type="search" id="q" placeholder="Filter text or location…">
  <span class="spacer"></span>
  <button id="copy">Copy audit for LLM</button>
  <button id="dl" class="ghost">Download JSON</button>
  <button id="reset" class="ghost">Clear edits</button>
</header>
<nav class="pages" id="nav"></nav>
<main id="main"></main>
<div id="toast"></div>
<script>
const PAGES = ${pagesJson};
const LS = 'postr-text-audit-v1';
const edits = JSON.parse(localStorage.getItem(LS) || '{}');
const main = document.getElementById('main');
const nav = document.getElementById('nav');
let total = 0, editedCount = 0;
for (const p of PAGES) {
  const a = document.createElement('a');
  a.href = '#p' + p.n; a.textContent = p.route;
  nav.appendChild(a);
  const sec = document.createElement('section');
  sec.className = 'page'; sec.id = 'p' + p.n;
  sec.innerHTML = '<h2>' + p.n + '. ' + p.route + (p.error ? ' — ⚠ ' + p.error : '') + '</h2>'
    + '<div class="cols"><div class="shot"><img src="shots/' + p.shot + '" alt=""></div>'
    + '<div><table><thead><tr><th>#</th><th>location</th><th>current text</th><th>your edit</th></tr></thead><tbody></tbody></table></div></div>';
  const tb = sec.querySelector('tbody');
  p.items.forEach((it, i) => {
    total++;
    const id = p.route + '|' + it.n;
    const tr = document.createElement('tr');
    tr.dataset.id = id;
    tr.innerHTML = '<td class="num">' + it.n + '</td>'
      + '<td class="loc">' + it.where + ' <span class="tag">&lt;' + it.tag + '&gt;' + (it.role ? ' ' + it.role : '') + '</span></td>'
      + '<td class="orig"></td>'
      + '<td class="edit"><div contenteditable="true" spellcheck="false"></div></td>';
    tr.children[2].textContent = it.text;
    const ed = tr.querySelector('div[contenteditable]');
    if (edits[id]) { ed.textContent = edits[id]; tr.classList.add('edited'); }
    ed.addEventListener('input', () => {
      const v = ed.textContent.trim();
      if (v && v !== it.text) { edits[id] = v; tr.classList.add('edited'); }
      else { delete edits[id]; tr.classList.remove('edited'); }
      localStorage.setItem(LS, JSON.stringify(edits));
      updateCounts();
    });
    tb.appendChild(tr);
  });
  main.appendChild(sec);
}
function updateCounts() {
  editedCount = Object.keys(edits).length;
  document.getElementById('counts').textContent = total + ' text items · ' + editedCount + ' edited';
}
updateCounts();
document.getElementById('q').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  for (const tr of document.querySelectorAll('tbody tr')) {
    const hay = (tr.children[1].textContent + ' ' + tr.children[2].textContent).toLowerCase();
    tr.style.display = !q || hay.includes(q) ? '' : 'none';
  }
});
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.opacity = 1;
  setTimeout(() => (t.style.opacity = 0), 1600);
}
document.getElementById('copy').addEventListener('click', async () => {
  const lines = ['# Text audit — Postr', '', 'Instructions: apply each edit below to the matching UI copy. Keep tone consistent with neighboring strings. Locations are approximate (section › context).', ''];
  for (const p of PAGES) {
    const rows = p.items.filter((it) => edits[p.route + '|' + it.n]);
    if (!rows.length) continue;
    lines.push('## ' + p.route);
    for (const it of rows) {
      const id = p.route + '|' + it.n;
      lines.push('- [' + it.where + ' <' + it.tag + '>] "' + it.text.replace(/"/g, '\\\\"') + '" → "' + edits[id].replace(/"/g, '\\\\"') + '"');
    }
    lines.push('');
  }
  if (lines.length <= 4) lines.push('(no edits yet)');
  await navigator.clipboard.writeText(lines.join('\\n'));
  toast('Audit copied — paste it as your refactoring prompt');
});
document.getElementById('dl').addEventListener('click', () => {
  const out = PAGES.map((p) => ({
    route: p.route,
    items: p.items.map((it) => ({ n: it.n, where: it.where, tag: it.tag, original: it.text, edit: edits[p.route + '|' + it.n] || null })),
  }));
  const blob = new Blob([JSON.stringify({ generated: new Date().toISOString(), pages: out }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'postr-text-audit.json';
  a.click();
  toast('Downloaded postr-text-audit.json');
});
document.getElementById('reset').addEventListener('click', () => {
  if (!confirm('Clear all edits?')) return;
  for (const k of Object.keys(edits)) delete edits[k];
  localStorage.removeItem(LS);
  for (const tr of document.querySelectorAll('tr.edited')) {
    tr.classList.remove('edited');
    tr.querySelector('div[contenteditable]').textContent = '';
  }
  updateCounts();
  toast('Edits cleared');
});
</script>
</body>
</html>
`;
}

// ---------- main ----------
async function main() {
  mkdirSync(shotsDir, { recursive: true });
  const distOk = existsSync(join(root, 'apps', 'web', 'dist', 'index.html'));
  if (!distOk) throw new Error('apps/web/dist missing — run `npm run build --workspace=apps/web` first');

  const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: join(root, 'apps', 'web'),
    stdio: 'ignore',
  });
  process.on('exit', () => preview.kill());
  await waitForServer(BASE);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pages = [];
  let n = 0;
  for (const route of ROUTES) {
    n++;
    const entry = { n, route, items: [], shot: `route-${String(n).padStart(2, '0')}.png` };
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(700);
      const items = await page.evaluate(EXTRACT_FN);
      // dedupe identical (text, where) pairs within a page (repeat chrome)
      const seen = new Set();
      const deduped = items.filter((it) => {
        const k = it.text + '|' + it.where + '|' + it.tag;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      entry.items = deduped.map((it, i) => ({ ...it, n: i + 1 }));
      // badge injection: self-invoking — page.evaluate(string) ignores the arg
      const itemsJson = JSON.stringify(entry.items).replace(/</g, '\\u003c');
      await page.evaluate(`(${BADGE_FN})(${itemsJson})`);
      await page.waitForTimeout(120);
      await page.screenshot({ path: join(shotsDir, entry.shot), fullPage: true });
      await page.evaluate(`(${REMOVE_BADGES_FN})()`);
    } catch (err) {
      entry.error = String(err).split('\n')[0].slice(0, 120);
    }
    pages.push(entry);
    console.log(`${entry.route}: ${entry.items.length} text items${entry.error ? ' — ' + entry.error : ''}`);
  }
  await browser.close();
  preview.kill();

  writeFileSync(join(outDir, 'index.html'), auditHtml(pages));
  console.log(`\nwrote ${join(outDir, 'index.html')} — open it in a browser, edit text, then "Copy audit for LLM".`);
}

await main();
