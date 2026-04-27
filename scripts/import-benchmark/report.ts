/**
 * Markdown report writer for the import benchmark.
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { RunMetric } from './metrics.js';

export async function writeReport(
  outPath: string,
  rows: RunMetric[],
): Promise<void> {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const lines: string[] = [];
  lines.push('# Postr import benchmark — vision-model comparison');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Test corpus');
  lines.push('');
  lines.push(
    '- **Class A** — text-layer PDF (`EW_INS.pdf`, `VocUM_poster.pdf`). Ground truth from pdfjs/pdftotext.',
  );
  lines.push(
    '- **Class B** — flattened-content PDF (`PresenterGeng.pdf`). Ground truth hand-transcribed.',
  );
  lines.push(
    '- **Class C** — pure raster JPG (`POSTER_DRAFT_page-0001.jpg`). Ground truth hand-transcribed.',
  );
  lines.push('');

  // Per-poster table
  const posters = [...new Set(rows.map((r) => r.posterName))];
  for (const poster of posters) {
    lines.push(`## ${poster}`);
    lines.push('');
    lines.push(
      '| Model | Class | Text accuracy | Blocks | Figures | p50 (ms) | p95 (ms) | $/run |',
    );
    lines.push('|---|---|---|---|---|---|---|---|');
    const subset = rows.filter((r) => r.posterName === poster);
    for (const r of subset) {
      lines.push(
        `| ${r.model} | ${r.posterClass} | ${(r.textAccuracy * 100).toFixed(1)}% | ${r.blockCount} | ${r.figureCount} | ${r.latencyMs.p50} | ${r.latencyMs.p95} | $${r.costUsd.toFixed(4)} |`,
      );
    }
    lines.push('');
    const warnings = subset
      .flatMap((r) => r.warnings.map((w) => `${r.model}: ${w}`))
      .filter(Boolean);
    if (warnings.length > 0) {
      lines.push('Warnings:');
      for (const w of warnings) lines.push(`- ${w}`);
      lines.push('');
    }
  }

  // Aggregate ranking
  lines.push('## Aggregate ranking');
  lines.push('');
  const byModel = new Map<string, RunMetric[]>();
  for (const r of rows) {
    if (!byModel.has(r.model)) byModel.set(r.model, []);
    byModel.get(r.model)!.push(r);
  }
  lines.push('| Model | Avg text accuracy | Avg blocks | Avg latency p50 | Total $ |');
  lines.push('|---|---|---|---|---|');
  const byScore: { model: string; score: number; line: string }[] = [];
  for (const [model, runs] of byModel) {
    const avgAcc = mean(runs.map((r) => r.textAccuracy));
    const avgBlocks = mean(runs.map((r) => r.blockCount));
    const avgLat = mean(runs.map((r) => r.latencyMs.p50));
    const totCost = runs.reduce((s, r) => s + r.costUsd, 0);
    // Simple composite: 0.6×accuracy + 0.2×block-coverage + 0.2×(1-cost_norm).
    const blockNorm = Math.min(1, avgBlocks / 30);
    const costNorm = Math.min(1, totCost / 0.05); // $0.05 ceiling
    const score = 0.6 * avgAcc + 0.2 * blockNorm + 0.2 * (1 - costNorm);
    const line = `| ${model} | ${(avgAcc * 100).toFixed(1)}% | ${avgBlocks.toFixed(1)} | ${avgLat.toFixed(0)} ms | $${totCost.toFixed(4)} |`;
    byScore.push({ model, score, line });
  }
  byScore.sort((a, b) => b.score - a.score);
  for (const r of byScore) lines.push(r.line);
  lines.push('');
  if (byScore.length > 0) {
    lines.push(
      `**Recommended production model:** \`${byScore[0]!.model}\` (composite score ${byScore[0]!.score.toFixed(3)}).`,
    );
    lines.push('');
  }

  await fs.writeFile(outPath, lines.join('\n'), 'utf8');
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}
