#!/usr/bin/env node
/**
 * Scorer for the deterministic-vs-LLM extraction experiment (harness only).
 *
 * For every paper under papers/, reads gold.json + findings.A.json +
 * findings.B.json (a missing arm file is reported, not fatal) and computes the
 * three axes from ../extraction-deterministic-vs-llm.md:
 *
 *   1. star-hit (binary)       — arm rank-1 matches the human star finding?
 *   2. top-3 overlap (0..1)    — |arm-top-3 ∩ human-top-3| / 3
 *   3. fidelity failures       — sourceQuotes NOT verbatim in text.md (a GATE:
 *                                any failure on a well-written paper disqualifies
 *                                the arm for that paper)
 *
 * Results are split well-written vs badly-written (robustness). Cost + latency
 * are surfaced for context only — never used to pick the winner.
 *
 * Writes RESULTS.json + RESULTS.md, both stamped at run time. Neither is a
 * committed fixture; the fixtures are papers/**\/{text.md,gold.json}, which carry
 * NO Date.now()/Math.random().
 *
 *   node score.mjs
 */

import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAPERS_DIR = join(HERE, 'papers');

/** Whitespace-collapse + trim + lowercase. Identical to runArmB.mjs `norm()`. */
function norm(s) {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Two findings are "the same" when one normalized sourceQuote contains the
 *  other (either direction) — tolerates an arm quoting a longer/shorter span
 *  than the human. Empty quotes never match. (See shape.md.) */
function sameFinding(quoteA, quoteB) {
  const a = norm(quoteA);
  const b = norm(quoteB);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

/** Is `quote` verbatim in `text` after normalization? */
function verbatimIn(quote, normalizedText) {
  const q = norm(quote);
  return q.length > 0 && normalizedText.includes(q);
}

async function readJson(path) {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw);
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** star-hit: the arm's rank-1 finding matches the human star finding's quote. */
function starHit(armFindings, gold) {
  const top = armFindings.find((f) => f.rank === 1);
  if (!top) return false;
  return sameFinding(top.sourceQuote, gold.star.sourceQuote);
}

/** top-3 overlap: how many of the human's top-3 quotes are matched by any of the
 *  arm's rank 1..3 findings, over 3. Each gold slot counted at most once. */
function top3Overlap(armFindings, gold) {
  const armTop3 = armFindings
    .filter((f) => f.rank >= 1 && f.rank <= 3)
    .map((f) => f.sourceQuote);
  const goldTop3 = (gold.top3 ?? []).map((g) => g.sourceQuote);
  const usedArm = new Set();
  let hits = 0;
  for (const g of goldTop3) {
    for (let i = 0; i < armTop3.length; i++) {
      if (usedArm.has(i)) continue;
      if (sameFinding(armTop3[i], g)) {
        usedArm.add(i);
        hits += 1;
        break;
      }
    }
  }
  const denom = goldTop3.length || 3;
  return hits / denom;
}

/** Fidelity: count findings whose sourceQuote is not verbatim in text.md.
 *  (Arms self-gate, so on clean input this should be 0; a residual miss is a
 *  fidelity failure charged to that arm.) */
function fidelityFailures(armFindings, paperText) {
  const normalizedText = norm(paperText);
  let fails = 0;
  const offenders = [];
  for (const f of armFindings) {
    if (!verbatimIn(f.sourceQuote, normalizedText)) {
      fails += 1;
      offenders.push(f.sourceQuote);
    }
  }
  return { fails, offenders };
}

/** Did the arm promote any doNotPromote finding into its top-3? (Reported, not
 *  part of the pass/fail gate — informs the human judgement.) */
function promotedForbidden(armFindings, gold) {
  const forbidden = gold.doNotPromote ?? [];
  if (forbidden.length === 0) return 0;
  const armTop3 = armFindings.filter((f) => f.rank >= 1 && f.rank <= 3);
  let count = 0;
  for (const bad of forbidden) {
    if (armTop3.some((f) => sameFinding(f.sourceQuote, bad.sourceQuote))) {
      count += 1;
    }
  }
  return count;
}

/**
 * Normalize an arm's on-disk output into the wrapper shape the scorer expects.
 * Accepts BOTH forms so the two arms can differ in how they serialize:
 *   - the wrapper object `{ paper, arm, model, findings, meta }` (Arm B writes this), OR
 *   - a bare `Finding[]` array (Arm A prints its findings to stdout, so
 *     `node runArmA.mjs papers/<P> > papers/<P>/findings.A.json` yields a bare array).
 * `armId` is the fallback arm label when the file doesn't carry one.
 */
function normalizeArmFile(parsed, armId) {
  if (Array.isArray(parsed)) {
    return { arm: armId, model: null, stub: null, findings: parsed, meta: {} };
  }
  if (parsed && typeof parsed === 'object') {
    return {
      arm: parsed.arm ?? armId,
      model: parsed.model ?? null,
      stub: parsed.stub ?? null,
      findings: Array.isArray(parsed.findings) ? parsed.findings : [],
      meta: parsed.meta ?? {},
    };
  }
  return { arm: armId, model: null, stub: null, findings: [], meta: {} };
}

function scoreArm(armFile, gold, paperText) {
  const findings = Array.isArray(armFile?.findings) ? armFile.findings : [];
  const { fails, offenders } = fidelityFailures(findings, paperText);
  const fidelityFail = fails > 0;
  const disqualified = gold.wellWritten && fidelityFail; // hard gate on clean papers
  return {
    arm: armFile.arm,
    model: armFile.model ?? null,
    stub: armFile.stub ?? null,
    findingCount: findings.length,
    starHit: starHit(findings, gold),
    top3Overlap: top3Overlap(findings, gold),
    fidelityFailures: fails,
    fidelityOffenders: offenders,
    disqualified,
    promotedForbidden: promotedForbidden(findings, gold),
    droppedForMissingQuote: armFile.meta?.droppedForMissingQuote ?? null,
    latencyMs: armFile.meta?.latencyMs ?? null,
    costUsd: armFile.meta?.costUsd ?? null,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Aggregate a set of per-paper arm results into means + gate summaries. */
function aggregate(rows) {
  if (rows.length === 0) {
    return {
      papers: 0,
      starHitRate: null,
      meanTop3Overlap: null,
      totalFidelityFailures: 0,
      disqualifiedPapers: 0,
      totalPromotedForbidden: 0,
      meanLatencyMs: null,
      totalCostUsd: 0,
    };
  }
  const n = rows.length;
  const starHits = rows.filter((r) => r.starHit).length;
  const meanTop3 = rows.reduce((s, r) => s + r.top3Overlap, 0) / n;
  const totalFid = rows.reduce((s, r) => s + r.fidelityFailures, 0);
  const dq = rows.filter((r) => r.disqualified).length;
  const promo = rows.reduce((s, r) => s + r.promotedForbidden, 0);
  const latencies = rows.map((r) => r.latencyMs).filter((x) => typeof x === 'number');
  const costs = rows.map((r) => r.costUsd).filter((x) => typeof x === 'number');
  return {
    papers: n,
    starHitRate: round2(starHits / n),
    meanTop3Overlap: round2(meanTop3),
    totalFidelityFailures: totalFid,
    disqualifiedPapers: dq,
    totalPromotedForbidden: promo,
    meanLatencyMs: latencies.length ? round2(latencies.reduce((s, x) => s + x, 0) / latencies.length) : null,
    totalCostUsd: round2(costs.reduce((s, x) => s + x, 0)),
  };
}

async function main() {
  let entries;
  try {
    entries = await readdir(PAPERS_DIR, { withFileTypes: true });
  } catch (err) {
    console.error(`Cannot read papers dir ${PAPERS_DIR}: ${err.message}`);
    process.exit(1);
  }
  const papers = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();

  const perPaper = [];
  const warnings = [];

  for (const paper of papers) {
    const dir = join(PAPERS_DIR, paper);
    const goldPath = join(dir, 'gold.json');
    const textPath = join(dir, 'text.md');
    if (!(await exists(goldPath)) || !(await exists(textPath))) {
      warnings.push(`${paper}: missing gold.json or text.md — skipped`);
      continue;
    }
    let gold, paperText;
    try {
      gold = await readJson(goldPath);
      paperText = await readFile(textPath, 'utf8');
    } catch (err) {
      warnings.push(`${paper}: failed to load fixtures (${err.message}) — skipped`);
      continue;
    }

    const arms = {};
    for (const armId of ['A', 'B']) {
      const armPath = join(dir, `findings.${armId}.json`);
      if (!(await exists(armPath))) {
        warnings.push(`${paper}: findings.${armId}.json absent — arm ${armId} not scored`);
        continue;
      }
      try {
        const armFile = normalizeArmFile(await readJson(armPath), armId);
        arms[armId] = scoreArm(armFile, gold, paperText);
      } catch (err) {
        warnings.push(`${paper}: arm ${armId} unreadable (${err.message})`);
      }
    }

    perPaper.push({
      paper,
      wellWritten: gold.wellWritten !== false,
      simulatedFrom: gold.simulatedFrom ?? null,
      arms,
    });
  }

  // Split aggregates by arm and by well/badly-written.
  const byArm = { A: {}, B: {} };
  for (const armId of ['A', 'B']) {
    const rowsAll = perPaper.map((p) => p.arms[armId]).filter(Boolean);
    const rowsWell = perPaper.filter((p) => p.wellWritten).map((p) => p.arms[armId]).filter(Boolean);
    const rowsBad = perPaper.filter((p) => !p.wellWritten).map((p) => p.arms[armId]).filter(Boolean);
    byArm[armId] = {
      all: aggregate(rowsAll),
      wellWritten: aggregate(rowsWell),
      badlyWritten: aggregate(rowsBad),
    };
  }

  const generatedAt = new Date().toISOString(); // stamped at run time only
  const results = { generatedAt, papers: perPaper, aggregate: byArm, warnings };

  await writeFile(join(HERE, 'RESULTS.json'), JSON.stringify(results, null, 2) + '\n', 'utf8');
  await writeFile(join(HERE, 'RESULTS.md'), renderMarkdown(results), 'utf8');

  for (const w of warnings) console.error('warn:', w);
  console.error(`Scored ${perPaper.length} paper(s) -> RESULTS.json + RESULTS.md`);
}

function fmt(n) {
  return n === null || n === undefined ? '—' : String(n);
}

function bool(b) {
  return b ? '✅' : '—';
}

function armPaperRow(paper, armId, a) {
  if (!a) return `| ${paper} | ${armId} | — | — | — | — | — |`;
  return `| ${paper} | ${armId} | ${bool(a.starHit)} | ${a.top3Overlap.toFixed(2)} | ${a.fidelityFailures} | ${a.disqualified ? 'DQ' : 'ok'} | ${fmt(a.latencyMs)} |`;
}

function aggBlock(title, agg) {
  return [
    `### ${title}`,
    '',
    '| arm | papers | star-hit rate | mean top-3 overlap | fidelity failures | disqualified papers | mean latency (ms) | total cost ($) |',
    '|---|---|---|---|---|---|---|---|',
    `| A | ${agg.A.papers} | ${fmt(agg.A.starHitRate)} | ${fmt(agg.A.meanTop3Overlap)} | ${agg.A.totalFidelityFailures} | ${agg.A.disqualifiedPapers} | ${fmt(agg.A.meanLatencyMs)} | ${fmt(agg.A.totalCostUsd)} |`,
    `| B | ${agg.B.papers} | ${fmt(agg.B.starHitRate)} | ${fmt(agg.B.meanTop3Overlap)} | ${agg.B.totalFidelityFailures} | ${agg.B.disqualifiedPapers} | ${fmt(agg.B.meanLatencyMs)} | ${fmt(agg.B.totalCostUsd)} |`,
    '',
  ].join('\n');
}

function renderMarkdown(results) {
  const { generatedAt, papers, aggregate: agg, warnings } = results;
  const lines = [];
  lines.push('# Extraction experiment — RESULTS');
  lines.push('');
  lines.push(`_Generated ${generatedAt}. Regenerated on every \`node score.mjs\` run — not a committed fixture._`);
  lines.push('');
  lines.push('Cost and latency are **recorded for context only** and are never used to pick the winner. ' +
    'Fidelity is a **gate**, not a score: any fidelity failure on a well-written paper disqualifies (DQ) that arm for that paper. ' +
    'The "quote supports the claim" half of fidelity is a human judgement (Gavin), not computed here.');
  lines.push('');

  lines.push('## Per-paper');
  lines.push('');
  lines.push('| paper | arm | star-hit | top-3 overlap | fidelity failures | gate | latency (ms) |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const p of papers) {
    const tag = p.wellWritten ? '' : ` _(bad-intro, from ${p.simulatedFrom ?? '?'})_`;
    lines.push(`| **${p.paper}**${tag} | | | | | | |`);
    lines.push(armPaperRow(p.paper, 'A', p.arms.A));
    lines.push(armPaperRow(p.paper, 'B', p.arms.B));
  }
  lines.push('');

  lines.push('## Aggregate');
  lines.push('');
  lines.push(aggBlock('All papers', { A: agg.A.all, B: agg.B.all }));
  lines.push(aggBlock('Well-written only', { A: agg.A.wellWritten, B: agg.B.wellWritten }));
  lines.push(aggBlock('Badly-written only (robustness)', { A: agg.A.badlyWritten, B: agg.B.badlyWritten }));

  lines.push('## Decision rule');
  lines.push('');
  lines.push('Pick the arm that (1) has **zero fidelity failures on well-written papers**, ' +
    '(2) wins or ties on **star-hit + top-3 overlap** aggregate, and (3) **degrades less** on the badly-written subset. ' +
    'On a quality tie, **prefer Arm A** (deterministic). Record the decision + numbers back into spec §3.1.');
  lines.push('');

  if (warnings.length) {
    lines.push('## Warnings');
    lines.push('');
    for (const w of warnings) lines.push(`- ${w}`);
    lines.push('');
  }
  return lines.join('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
