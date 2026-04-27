/**
 * Poster HTML generator. Takes the 10 papers from `papers.ts`, runs
 * each through one of four templates, writes the result into
 * `generated/<id>.html`. Tries to mimic the visual quirks of real
 * academic posters so the importer gets stressed:
 *
 *   - data-heavy:   3-column body, multiple SVG charts + a results
 *                   table, logo banner top-right
 *   - methods-heavy: schematic figure dominant, single big figure
 *                   spanning two columns, bullets in methods
 *   - review:       text-heavy 4-column body, one summary table, no
 *                   figures, ornamental header icon (decoration test)
 *   - minimal:      title + 2-column body, just one tiny figure, no
 *                   logos — proves the importer doesn't hallucinate
 *                   structure that isn't there
 *
 * The decoration / cartoon icon classes (📚 emoji rendered, faux
 * "people" SVG, FAQ bubble) are baked into the `review` template so
 * the importer's decoration filter gets exercised every run.
 *
 * Run:  tsx scripts/poster-benchmark/generate.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAPERS, type Paper } from './papers';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'generated');

mkdirSync(OUT_DIR, { recursive: true });

// ── Reusable bits ───────────────────────────────────────────────

/** A simple bar chart in SVG — gives the figure-extraction pipeline
 *  something with axes, ticks, and rectangular marks. */
function svgBarChart(title: string, bars: { label: string; value: number }[]): string {
  const W = 320;
  const H = 200;
  const PAD = 40;
  const max = Math.max(...bars.map((b) => b.value));
  const barW = (W - PAD * 2) / bars.length - 8;
  return `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;font-family:serif">
      <text x="${W / 2}" y="16" text-anchor="middle" font-size="13" font-weight="700">${title}</text>
      <line x1="${PAD}" y1="${H - PAD}" x2="${W - PAD}" y2="${H - PAD}" stroke="#222" stroke-width="1.4"/>
      <line x1="${PAD}" y1="${PAD}" x2="${PAD}" y2="${H - PAD}" stroke="#222" stroke-width="1.4"/>
      ${[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = H - PAD - t * (H - PAD * 2);
        return `<line x1="${PAD - 4}" y1="${y}" x2="${PAD}" y2="${y}" stroke="#222"/>
                <text x="${PAD - 6}" y="${y + 3}" text-anchor="end" font-size="9">${(t * max).toFixed(1)}</text>`;
      }).join('')}
      ${bars.map((b, i) => {
        const x = PAD + i * (barW + 8) + 4;
        const h = (b.value / max) * (H - PAD * 2);
        const y = H - PAD - h;
        return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="#3b6fb5" />
                <text x="${x + barW / 2}" y="${H - PAD + 14}" text-anchor="middle" font-size="9">${b.label}</text>`;
      }).join('')}
    </svg>
  `;
}

/** A small scatter plot — adds a second figure with distinct visual
 *  encoding so the figure pipeline sees more than one bar chart. */
function svgScatter(title: string): string {
  const W = 240;
  const H = 200;
  const PAD = 32;
  const points: [number, number][] = Array.from({ length: 30 }, () => [
    Math.random() * 100,
    Math.random() * 60 + Math.random() * 40,
  ]);
  return `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;font-family:serif">
      <text x="${W / 2}" y="16" text-anchor="middle" font-size="12" font-weight="700">${title}</text>
      <line x1="${PAD}" y1="${H - PAD}" x2="${W - PAD}" y2="${H - PAD}" stroke="#222"/>
      <line x1="${PAD}" y1="${PAD}" x2="${PAD}" y2="${H - PAD}" stroke="#222"/>
      ${points.map(([x, y]) => {
        const cx = PAD + (x / 100) * (W - PAD * 2);
        const cy = H - PAD - (y / 100) * (H - PAD * 2);
        return `<circle cx="${cx}" cy="${cy}" r="3" fill="#c0392b" opacity="0.7"/>`;
      }).join('')}
      <text x="${W / 2}" y="${H - 6}" text-anchor="middle" font-size="9">Baseline WMC (z-score)</text>
    </svg>
  `;
}

/** A faux institutional logo — a colored shield with letters.
 *  Renders as a small text-bearing image, NOT a cartoon icon. */
function svgLogo(letters: string, color: string, sub: string = ''): string {
  return `
    <svg viewBox="0 0 100 60" style="width:80px;height:48px">
      <rect x="2" y="4" width="96" height="36" fill="${color}" rx="3"/>
      <text x="50" y="28" text-anchor="middle" font-size="18" font-weight="800" fill="#fff" font-family="Georgia, serif">${letters}</text>
      ${sub ? `<text x="50" y="52" text-anchor="middle" font-size="6.5" fill="#444" font-family="Georgia, serif">${sub}</text>` : ''}
    </svg>
  `;
}

/** A cartoon "people" decoration — the importer should drop this.
 *  Low color count + low edge density = high iconScore. */
function svgPeopleIcon(): string {
  return `
    <svg viewBox="0 0 60 60" style="width:48px;height:48px">
      <circle cx="20" cy="22" r="9" fill="#9aa0a6"/>
      <circle cx="40" cy="22" r="9" fill="#9aa0a6"/>
      <path d="M5 55 Q20 38 35 55 Z" fill="#9aa0a6"/>
      <path d="M25 55 Q40 38 55 55 Z" fill="#9aa0a6"/>
    </svg>
  `;
}

function svgLeafIcon(): string {
  return `
    <svg viewBox="0 0 60 60" style="width:42px;height:42px">
      <path d="M30 8 C 12 18 12 42 30 52 C 48 42 48 18 30 8 Z" fill="#5a8a3a"/>
      <path d="M30 12 L 30 50" stroke="#3d6a26" stroke-width="2" fill="none"/>
    </svg>
  `;
}

function refList(p: Paper): string {
  return `
    <p style="font-size:9px;line-height:1.35;margin:0">
      [1] ${p.authors[0]} et al. (${p.year}). ${p.title}. <i>${p.journal}</i>.<br/>
      [2] Klingberg, T. (2010). Training and plasticity of working memory. <i>Trends in Cognitive Sciences</i>, 14(7), 317–324.<br/>
      [3] Engle, R. W. (2002). Working memory capacity as executive attention. <i>Current Directions in Psychological Science</i>, 11(1), 19–23.<br/>
      [4] Baddeley, A. (2003). Working memory: looking back and looking forward. <i>Nature Reviews Neuroscience</i>, 4(10), 829–839.
    </p>
  `;
}

// ── Templates ────────────────────────────────────────────────────

function dataHeavy(p: Paper): string {
  const bars = p.facts
    .filter((f) => /[\d.]+/.test(f))
    .slice(0, 4)
    .map((f) => {
      const m = f.match(/([\d.]+)/);
      return { label: f.split(/[:=(]/)[0]!.trim().slice(0, 8), value: parseFloat(m?.[1] ?? '0') };
    });
  return `
    <div class="poster">
      <header style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1a1a1a;padding-bottom:8px;margin-bottom:14px">
        <div style="flex:1">
          <h1 style="margin:0;font-size:32px;line-height:1.15;color:#1a1a1a">${p.title}</h1>
          <p style="margin:6px 0 2px;font-size:14px;color:#444">${p.authors.join(', ')}</p>
          <p style="margin:0;font-size:12px;color:#666"><sup>1</sup>${p.affiliation} · <sup>2</sup>Department of Psychology, ${p.affiliation.split(',')[0]}</p>
        </div>
        <div style="display:flex;gap:8px;margin-left:18px">
          ${svgLogo('UNIV', '#8b1a1a')}
          ${svgLogo('PSY', '#2c5282', 'Department')}
          ${svgLogo('FUND', '#5a8a3a', 'Grant 2024-A')}
        </div>
      </header>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px">
        <section>
          <h2 style="margin:0 0 6px;color:#3b6fb5">1. Introduction</h2>
          <p style="margin:0;font-size:11px;line-height:1.45">
            ${p.abstract.split('.').slice(0, 3).join('.')}.
            Working memory capacity (WMC) has been a central construct in cognitive psychology
            for over four decades, with foundational work by Baddeley and others establishing
            its role in higher-order cognition.
          </p>
          <h2 style="margin:14px 0 6px;color:#3b6fb5">2. Methods</h2>
          <p style="margin:0;font-size:11px;line-height:1.45">
            Participants were recruited through community announcements and screened for
            cognitive impairment. The training protocol followed standard adaptive N-back
            procedures with difficulty calibrated to individual baseline performance.
          </p>
          <ul style="font-size:11px;line-height:1.45;padding-left:14px">
            ${p.facts.map((f) => `<li>${f}</li>`).join('')}
          </ul>
        </section>
        <section>
          <h2 style="margin:0 0 6px;color:#3b6fb5">3. Results</h2>
          ${svgBarChart('Figure 1. Effect sizes by transfer type', bars)}
          <p style="margin:8px 0;font-size:11px;line-height:1.45">
            The primary outcome showed significant improvement on trained tasks. Transfer to
            non-trained measures was modest and varied by task similarity.
          </p>
          <table style="border-collapse:collapse;width:100%;font-size:10px;margin-top:8px">
            <thead><tr style="background:#e8edf2"><th style="border:1px solid #888;padding:4px">Measure</th><th style="border:1px solid #888;padding:4px">Pre</th><th style="border:1px solid #888;padding:4px">Post</th><th style="border:1px solid #888;padding:4px">d</th></tr></thead>
            <tbody>
              <tr><td style="border:1px solid #888;padding:4px">N-back (3)</td><td style="border:1px solid #888;padding:4px">2.1 ± 0.6</td><td style="border:1px solid #888;padding:4px">3.4 ± 0.7</td><td style="border:1px solid #888;padding:4px">1.85</td></tr>
              <tr><td style="border:1px solid #888;padding:4px">Span (digits)</td><td style="border:1px solid #888;padding:4px">5.8 ± 1.2</td><td style="border:1px solid #888;padding:4px">6.4 ± 1.1</td><td style="border:1px solid #888;padding:4px">0.52</td></tr>
              <tr><td style="border:1px solid #888;padding:4px">Raven (matrices)</td><td style="border:1px solid #888;padding:4px">11.2 ± 4.1</td><td style="border:1px solid #888;padding:4px">11.8 ± 3.9</td><td style="border:1px solid #888;padding:4px">0.15</td></tr>
            </tbody>
          </table>
        </section>
        <section>
          <h2 style="margin:0 0 6px;color:#3b6fb5">4. Discussion</h2>
          ${svgScatter('Figure 2. Baseline WMC × gain')}
          <p style="margin:8px 0 0;font-size:11px;line-height:1.45">
            Initial WMC moderated training gains, consistent with prior literature suggesting
            "rich-get-richer" effects. Implications for individualized cognitive interventions
            are discussed.
          </p>
          <h2 style="margin:14px 0 6px;color:#3b6fb5">5. References</h2>
          ${refList(p)}
        </section>
      </div>
    </div>
  `;
}

function methodsHeavy(p: Paper): string {
  return `
    <div class="poster">
      <header style="text-align:center;border-bottom:2px solid #2c5282;padding-bottom:10px;margin-bottom:16px">
        <h1 style="margin:0;font-size:30px;color:#2c5282">${p.title}</h1>
        <p style="margin:6px 0;font-size:13px">${p.authors.join(' · ')}</p>
        <p style="margin:0;font-size:11px;color:#666">${p.affiliation} — Published in <i>${p.journal}</i>, ${p.year}</p>
      </header>

      <div style="display:grid;grid-template-columns:1fr 2fr 1fr;gap:18px">
        <section>
          <h2 style="margin:0 0 6px;color:#2c5282">Background</h2>
          <p style="font-size:11px;line-height:1.5">${p.abstract}</p>
          <h2 style="margin:14px 0 6px;color:#2c5282">Hypotheses</h2>
          <ol style="font-size:11px;line-height:1.5;padding-left:18px">
            <li>Adaptive training will produce larger gains than non-adaptive controls.</li>
            <li>Effects on near-transfer measures will exceed effects on far-transfer.</li>
            <li>Individual baseline differences will moderate response.</li>
          </ol>
        </section>

        <section>
          <h2 style="margin:0 0 6px;color:#2c5282">Procedure</h2>
          <svg viewBox="0 0 480 220" style="width:100%;height:auto;font-family:serif">
            <text x="240" y="14" text-anchor="middle" font-size="13" font-weight="700">Figure 1. Experimental design</text>
            <rect x="20" y="40" width="80" height="50" fill="#e8edf2" stroke="#2c5282"/>
            <text x="60" y="68" text-anchor="middle" font-size="11">Screening</text>
            <text x="60" y="82" text-anchor="middle" font-size="9">(n=120)</text>
            <line x1="100" y1="65" x2="140" y2="65" stroke="#2c5282" stroke-width="2" marker-end="url(#a)"/>
            <rect x="140" y="40" width="80" height="50" fill="#e8edf2" stroke="#2c5282"/>
            <text x="180" y="62" text-anchor="middle" font-size="11">Pre-test</text>
            <text x="180" y="76" text-anchor="middle" font-size="9">5 sessions</text>
            <line x1="220" y1="65" x2="260" y2="65" stroke="#2c5282" stroke-width="2"/>
            <rect x="260" y="20" width="100" height="40" fill="#dde8d2" stroke="#5a8a3a"/>
            <text x="310" y="44" text-anchor="middle" font-size="11">Training (n=42)</text>
            <rect x="260" y="80" width="100" height="40" fill="#f1dede" stroke="#8b1a1a"/>
            <text x="310" y="104" text-anchor="middle" font-size="11">Control (n=43)</text>
            <line x1="360" y1="40" x2="400" y2="65" stroke="#2c5282" stroke-width="2"/>
            <line x1="360" y1="100" x2="400" y2="65" stroke="#2c5282" stroke-width="2"/>
            <rect x="400" y="40" width="70" height="50" fill="#e8edf2" stroke="#2c5282"/>
            <text x="435" y="62" text-anchor="middle" font-size="11">Post-test</text>
            <text x="435" y="76" text-anchor="middle" font-size="9">+6mo follow</text>
            <defs><marker id="a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#2c5282"/></marker></defs>
          </svg>
          <p style="font-size:11px;line-height:1.5;margin-top:8px">
            Participants completed a structured 5-week training regimen on adaptive
            dual-N-back tasks, with daily session difficulty automatically calibrated to
            performance. Pre/post assessments included measures of working memory, fluid
            intelligence, and processing speed.
          </p>
        </section>

        <section>
          <h2 style="margin:0 0 6px;color:#2c5282">Results</h2>
          <ul style="font-size:11px;line-height:1.5;padding-left:14px">
            ${p.facts.map((f) => `<li>${f}</li>`).join('')}
          </ul>
          <h2 style="margin:14px 0 6px;color:#2c5282">Conclusion</h2>
          <p style="font-size:11px;line-height:1.5">
            Findings support theoretical models that distinguish between core capacity
            improvements and strategy-mediated efficiency gains.
          </p>
          <h2 style="margin:14px 0 6px;color:#2c5282">References</h2>
          ${refList(p)}
        </section>
      </div>
    </div>
  `;
}

function review(p: Paper): string {
  return `
    <div class="poster">
      <header style="display:flex;align-items:center;gap:14px;border-bottom:2px solid #5a8a3a;padding-bottom:10px;margin-bottom:16px">
        ${svgLeafIcon()}
        <div style="flex:1">
          <h1 style="margin:0;font-size:28px;color:#3d6a26">${p.title}</h1>
          <p style="margin:6px 0 0;font-size:13px">${p.authors.join(', ')} — ${p.journal}, ${p.year}</p>
        </div>
        ${svgPeopleIcon()}
      </header>

      <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:14px">
        <section>
          <h2 style="margin:0 0 6px;color:#5a8a3a">Scope</h2>
          <p style="font-size:10px;line-height:1.5">${p.abstract}</p>
        </section>
        <section>
          <h2 style="margin:0 0 6px;color:#5a8a3a">Method</h2>
          <p style="font-size:10px;line-height:1.5">
            Systematic literature search of PsycInfo, PubMed, and Web of Science. Inclusion
            criteria: peer-reviewed empirical studies of WM training in healthy adults
            published 2000–${p.year}. Risk-of-bias assessment using Cochrane RoB-2.
          </p>
        </section>
        <section>
          <h2 style="margin:0 0 6px;color:#5a8a3a">Findings</h2>
          <ul style="font-size:10px;line-height:1.5;padding-left:14px;margin:0">
            ${p.facts.map((f) => `<li>${f}</li>`).join('')}
          </ul>
          <table style="border-collapse:collapse;width:100%;font-size:9px;margin-top:8px">
            <thead><tr style="background:#dde8d2"><th style="border:1px solid #888;padding:3px">Domain</th><th style="border:1px solid #888;padding:3px">k</th><th style="border:1px solid #888;padding:3px">g</th></tr></thead>
            <tbody>
              <tr><td style="border:1px solid #888;padding:3px">WM</td><td style="border:1px solid #888;padding:3px">23</td><td style="border:1px solid #888;padding:3px">0.46</td></tr>
              <tr><td style="border:1px solid #888;padding:3px">Math</td><td style="border:1px solid #888;padding:3px">11</td><td style="border:1px solid #888;padding:3px">0.12</td></tr>
              <tr><td style="border:1px solid #888;padding:3px">Reading</td><td style="border:1px solid #888;padding:3px">9</td><td style="border:1px solid #888;padding:3px">0.08</td></tr>
            </tbody>
          </table>
        </section>
        <section>
          <h2 style="margin:0 0 6px;color:#5a8a3a">Implications</h2>
          <p style="font-size:10px;line-height:1.5">
            Practitioners should temper enthusiasm for WM training as a general cognitive
            enhancer. Effects on trained tasks are robust; transfer to academic outcomes is
            small and inconsistent. Future work should prioritize active controls.
          </p>
          <h2 style="margin:14px 0 6px;color:#5a8a3a">References</h2>
          ${refList(p)}
        </section>
      </div>
    </div>
  `;
}

function minimal(p: Paper): string {
  return `
    <div class="poster">
      <header style="text-align:center;margin-bottom:16px">
        <h1 style="margin:0;font-size:34px">${p.title}</h1>
        <p style="margin:6px 0;font-size:14px">${p.authors.join(', ')}</p>
        <p style="margin:0;font-size:11px;color:#666">${p.affiliation} · ${p.journal} (${p.year}) · cited ${p.citations} times</p>
      </header>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
        <section>
          <h2>Background</h2>
          <p style="font-size:11px;line-height:1.6">${p.abstract}</p>
          <h2>Methods</h2>
          <p style="font-size:11px;line-height:1.6">Standard meta-analytic procedures with random-effects models. PRISMA flow documented in supplementary materials.</p>
        </section>
        <section>
          ${svgBarChart('Figure 1. Effect sizes by outcome', [
            { label: 'WM', value: 0.79 },
            { label: 'Vis-WM', value: 0.52 },
            { label: 'Follow', value: 0.12 },
          ])}
          <h2 style="margin-top:12px">Conclusion</h2>
          <ul style="font-size:11px;line-height:1.6;padding-left:14px">
            ${p.facts.map((f) => `<li>${f}</li>`).join('')}
          </ul>
        </section>
      </div>
      <footer style="margin-top:18px;padding-top:8px;border-top:1px solid #aaa">
        <h2 style="font-size:14px">References</h2>
        ${refList(p)}
      </footer>
    </div>
  `;
}

const TEMPLATES: Record<Paper['posterStyle'], (p: Paper) => string> = {
  'data-heavy': dataHeavy,
  'methods-heavy': methodsHeavy,
  review,
  minimal,
};

// ── Wrapper that turns a body into a full HTML document ─────────

function wrap(body: string, paper: Paper): string {
  return `<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="utf-8"/>
  <title>${paper.id}</title>
  <style>
    @page { size: 36in 24in; margin: 0; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      color: #1a1a1a;
      background: #fff;
      width: 36in; height: 24in;
      box-sizing: border-box;
      padding: 0.5in;
    }
    .poster { width: 100%; height: 100%; box-sizing: border-box; }
    h1 { font-family: Georgia, 'Times New Roman', serif; }
    h2 { font-size: 17px; margin-top: 0; }
  </style>
</head><body>
${body}
</body></html>`;
}

// ── Generate all 10 ─────────────────────────────────────────────

let count = 0;
for (const paper of PAPERS) {
  const renderer = TEMPLATES[paper.posterStyle];
  const html = wrap(renderer(paper), paper);
  const path = join(OUT_DIR, `${paper.id}.html`);
  writeFileSync(path, html);
  count++;
  // eslint-disable-next-line no-console
  console.log(`  ✓ ${paper.id}.html  (${paper.posterStyle})`);
}
// eslint-disable-next-line no-console
console.log(`\nGenerated ${count} posters in ${OUT_DIR}`);
