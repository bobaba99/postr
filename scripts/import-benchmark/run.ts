/**
 * Vision-model benchmark for Postr's import pipeline.
 *
 * Run:
 *   ANTHROPIC_API_KEY=... npx tsx scripts/import-benchmark/run.ts
 *
 * Env knobs:
 *   ANTHROPIC_API_KEY  — required for the Claude adapter
 *   OPENAI_API_KEY     — required for the OpenAI adapter (optional)
 *   OLLAMA_API_KEY     — required for the Ollama Cloud adapter (optional)
 *   BENCH_RUNS=N       — runs per (model, poster) for latency stats (default 1)
 *   BENCH_RASTERIZE=1  — pre-rasterize PDFs to PNG via pdftoppm
 *   BENCH_REPORT=path  — output md path (default docs/plans/...)
 */
import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import { runClaudeFullExtract } from './models/claude.js';
import { runOpenAIFullExtract } from './models/openai.js';
import { runOllamaFullExtract } from './models/ollama.js';
import { computeMetrics, type RunMetric } from './metrics.js';
import { writeReport } from './report.js';

const execFileP = promisify(execFile);

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const POSTERS_DIR = path.join(REPO_ROOT, 'docs', 'test_posters');
const FIXTURES_DIR = path.join(REPO_ROOT, 'scripts', 'import-benchmark', 'fixtures');
const REPORT_PATH =
  process.env.BENCH_REPORT ??
  path.join(REPO_ROOT, 'docs', 'plans', `${todayStamp()}-import-benchmark-results.md`);

interface PosterFixture {
  name: string;
  klass: 'A' | 'B' | 'C'; // A=text-layer PDF, B=flattened PDF, C=raster
  pdfPath?: string;
  rasterPath: string; // PNG every adapter actually consumes
  pageWidthPt: number;
  pageHeightPt: number;
  groundTruthText: string;
}

async function main(): Promise<void> {
  const fixtures = await loadFixtures();
  // eslint-disable-next-line no-console
  console.log(
    `loaded ${fixtures.length} fixtures: ${fixtures.map((f) => f.name).join(', ')}`,
  );

  const adapters = [
    {
      name: 'claude' as const,
      run: runClaudeFullExtract,
      enabled: !!process.env.ANTHROPIC_API_KEY,
    },
    {
      name: 'openai' as const,
      run: runOpenAIFullExtract,
      enabled: !!process.env.OPENAI_API_KEY,
    },
    {
      name: 'ollama' as const,
      run: runOllamaFullExtract,
      enabled: !!process.env.OLLAMA_API_KEY,
    },
  ];

  const enabled = adapters.filter((a) => a.enabled);
  if (enabled.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(
      'no adapters enabled — set ANTHROPIC_API_KEY / OPENAI_API_KEY / OLLAMA_API_KEY',
    );
    process.exit(2);
  }

  const runs = parseInt(process.env.BENCH_RUNS ?? '1', 10);
  const rows: RunMetric[] = [];

  for (const fx of fixtures) {
    for (const adapter of enabled) {
      const latencies: number[] = [];
      let lastResult: Awaited<ReturnType<typeof adapter.run>> | null = null;
      for (let i = 0; i < runs; i++) {
        const t0 = Date.now();
        try {
          lastResult = await adapter.run({
            imagePath: fx.rasterPath,
            pageWidthPt: fx.pageWidthPt,
            pageHeightPt: fx.pageHeightPt,
          });
          latencies.push(Date.now() - t0);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(
            `[${adapter.name}/${fx.name}] run ${i + 1} failed:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
      if (!lastResult) continue;
      rows.push(
        computeMetrics({
          model: adapter.name,
          posterName: fx.name,
          posterClass: fx.klass,
          groundTruthText: fx.groundTruthText,
          extracted: lastResult,
          latencies,
        }),
      );
    }
  }

  await writeReport(REPORT_PATH, rows);
  // eslint-disable-next-line no-console
  console.log(`report written to ${REPORT_PATH}`);
}

async function loadFixtures(): Promise<PosterFixture[]> {
  const out: PosterFixture[] = [];
  const items = [
    { name: 'EW_INS', file: 'EW_INS.pdf', klass: 'A' as const },
    { name: 'VocUM', file: 'VocUM_poster.pdf', klass: 'A' as const },
    { name: 'PresenterGeng', file: 'PresenterGeng.pdf', klass: 'B' as const },
    {
      name: 'POSTER_DRAFT',
      file: 'POSTER_DRAFT_page-0001.jpg',
      klass: 'C' as const,
    },
  ];
  await fs.mkdir(FIXTURES_DIR, { recursive: true });
  for (const it of items) {
    const src = path.join(POSTERS_DIR, it.file);
    if (!(await exists(src))) {
      // eslint-disable-next-line no-console
      console.warn(`skip ${it.name}: ${src} missing`);
      continue;
    }
    const isPdf = it.file.toLowerCase().endsWith('.pdf');
    const rasterPath = isPdf
      ? path.join(FIXTURES_DIR, `${it.name}.jpg`)
      : src;
    let pageWidthPt = 0;
    let pageHeightPt = 0;
    if (isPdf) {
      // Rasterize via pdftoppm @ 200dpi the first time we see the
      // PDF; reuse the cached PNG on subsequent runs.
      if (!(await exists(rasterPath)) || process.env.BENCH_RASTERIZE === '1') {
        await rasterizePdf(src, rasterPath);
      }
      const dims = await pdfPageDims(src);
      pageWidthPt = dims.widthPt;
      pageHeightPt = dims.heightPt;
    } else {
      const dims = await imageDims(src);
      pageWidthPt = (dims.w / 300) * 72; // assume 300 dpi for jpg
      pageHeightPt = (dims.h / 300) * 72;
    }
    const groundTruthText = await loadGroundTruth(it.name, isPdf, src);
    out.push({
      name: it.name,
      klass: it.klass,
      pdfPath: isPdf ? src : undefined,
      rasterPath,
      pageWidthPt,
      pageHeightPt,
      groundTruthText,
    });
  }
  return out;
}

async function loadGroundTruth(
  name: string,
  isPdf: boolean,
  src: string,
): Promise<string> {
  // Prefer hand-transcribed ground truth in fixtures/<name>.text.json,
  // fall back to pdftotext for text-layer PDFs.
  const handPath = path.join(FIXTURES_DIR, `${name}.text.json`);
  if (await exists(handPath)) {
    const json = JSON.parse(await fs.readFile(handPath, 'utf8')) as {
      text: string;
    };
    return normalizeText(json.text);
  }
  if (isPdf) {
    try {
      const { stdout } = await execFileP('pdftotext', [src, '-']);
      return normalizeText(stdout);
    } catch {
      return '';
    }
  }
  return '';
}

async function rasterizePdf(src: string, dst: string): Promise<void> {
  // Render at 100 DPI as JPEG q=85 — keeps every fixture under 5 MB
  // (Claude's API ceiling) while staying readable for vision models.
  // 200 DPI on a 36×42 poster produces a ~14 MB PNG; we do not need
  // print-quality pixels for an LLM benchmark.
  const tmp = dst.replace(/\.png$/, '');
  await execFileP('pdftoppm', [
    '-jpeg',
    '-jpegopt',
    'quality=85',
    '-r',
    '100',
    '-f',
    '1',
    '-l',
    '1',
    src,
    tmp,
  ]);
  const generated = `${tmp}-1.jpg`;
  if (await exists(generated)) {
    // Save as .jpg regardless of dst extension so the adapters know
    // the media type from the file name.
    const finalDst = dst.replace(/\.png$/, '.jpg');
    await fs.rename(generated, finalDst);
  }
}

async function pdfPageDims(
  src: string,
): Promise<{ widthPt: number; heightPt: number }> {
  const { stdout } = await execFileP('pdfinfo', [src]);
  const m = stdout.match(/Page size:\s*([\d.]+)\s*x\s*([\d.]+)/);
  if (!m) return { widthPt: 612, heightPt: 792 };
  return { widthPt: parseFloat(m[1]!), heightPt: parseFloat(m[2]!) };
}

async function imageDims(src: string): Promise<{ w: number; h: number }> {
  try {
    const { stdout } = await execFileP('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', src]);
    const w = parseInt(stdout.match(/pixelWidth:\s*(\d+)/)?.[1] ?? '0', 10);
    const h = parseInt(stdout.match(/pixelHeight:\s*(\d+)/)?.[1] ?? '0', 10);
    return { w, h };
  } catch {
    return { w: 0, h: 0 };
  }
}

function normalizeText(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
