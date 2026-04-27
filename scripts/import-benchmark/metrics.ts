/**
 * Metric computation for the import benchmark.
 */
export interface ExtractedBlock {
  type: 'title' | 'heading' | 'authors' | 'text' | 'table';
  text: string;
  bbox: { x: number; y: number; w: number; h: number };
  confidence: number;
}

export interface ExtractResult {
  blocks: ExtractedBlock[];
  figureBBoxes: { x: number; y: number; w: number; h: number }[];
  warnings: string[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
}

export interface RunMetric {
  model: string;
  posterName: string;
  posterClass: 'A' | 'B' | 'C';
  textAccuracy: number; // 0..1, 1 = identical
  blockCount: number;
  figureCount: number;
  latencyMs: { p50: number; p95: number; n: number };
  costUsd: number;
  warnings: string[];
}

export interface ComputeInput {
  model: string;
  posterName: string;
  posterClass: 'A' | 'B' | 'C';
  groundTruthText: string;
  extracted: ExtractResult;
  latencies: number[];
}

export function computeMetrics(input: ComputeInput): RunMetric {
  // Defensive: any of these can come back undefined when an adapter
  // partially fails or the model emits a malformed JSON.
  const blocks = Array.isArray(input.extracted.blocks)
    ? input.extracted.blocks
    : [];
  const figureBBoxes = Array.isArray(input.extracted.figureBBoxes)
    ? input.extracted.figureBBoxes
    : [];
  const warnings = Array.isArray(input.extracted.warnings)
    ? input.extracted.warnings
    : [];
  const concatText = blocks
    .map((b) => b?.text ?? '')
    .join(' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const truth = input.groundTruthText
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const textAccuracy = truth ? normalizedLevenshtein(concatText, truth) : 0;

  return {
    model: input.model,
    posterName: input.posterName,
    posterClass: input.posterClass,
    textAccuracy,
    blockCount: blocks.length,
    figureCount: figureBBoxes.length,
    latencyMs: percentiles(input.latencies),
    costUsd: input.extracted.usage?.costUsd ?? 0,
    warnings,
  };
}

function percentiles(values: number[]): { p50: number; p95: number; n: number } {
  if (values.length === 0) return { p50: 0, p95: 0, n: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p: number): number =>
    Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100));
  return {
    p50: sorted[idx(50)] ?? 0,
    p95: sorted[idx(95)] ?? 0,
    n: sorted.length,
  };
}

/** 1.0 = identical, 0.0 = total replacement. */
function normalizedLevenshtein(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return Math.max(0, 1 - dist / maxLen);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  // Cap at 10k chars per side — irrelevant precision otherwise + saves
  // a lot of time on dense posters.
  const A = a.length > 10000 ? a.slice(0, 10000) : a;
  const B = b.length > 10000 ? b.slice(0, 10000) : b;
  const prev = new Array<number>(B.length + 1);
  const curr = new Array<number>(B.length + 1);
  for (let j = 0; j <= B.length; j++) prev[j] = j;
  for (let i = 1; i <= A.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= B.length; j++) {
      const cost = A[i - 1] === B[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1]! + 1,
        prev[j]! + 1,
        prev[j - 1]! + cost,
      );
    }
    for (let j = 0; j <= B.length; j++) prev[j] = curr[j]!;
  }
  return prev[B.length] ?? Math.max(A.length, B.length);
}
