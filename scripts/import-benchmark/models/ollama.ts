/**
 * Ollama Cloud adapter (free tier). Default model: qwen2.5vl:72b.
 * https://ollama.com/api/chat with format: 'json' for structured
 * output. Schema isn't enforced server-side, so we parse defensively.
 */
import { promises as fs } from 'node:fs';
import type { ExtractResult } from '../metrics.js';

const SYSTEM = `You are a layout-extraction assistant for academic posters. Return ONLY valid JSON with exactly this shape:
{
  "blocks": [{"type": "title|heading|authors|text|table", "text": string, "bbox": {"x":number,"y":number,"w":number,"h":number}, "confidence": 0..1}],
  "figureBBoxes": [{"x":number,"y":number,"w":number,"h":number}],
  "warnings": [string]
}
figureBBoxes contains figure/chart regions ONLY (exclude logos and decorations). Confidence prefers 0.5 over hallucinating.`;

interface OllamaResponse {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

export async function runOllamaFullExtract(ctx: {
  imagePath: string;
  pageWidthPt: number;
  pageHeightPt: number;
}): Promise<ExtractResult> {
  const apiKey = process.env.OLLAMA_API_KEY;
  if (!apiKey) throw new Error('OLLAMA_API_KEY not set');
  const model = process.env.BENCH_OLLAMA_MODEL ?? 'qwen2.5vl:72b';
  const data = (await fs.readFile(ctx.imagePath)).toString('base64');

  const res = await fetch('https://ollama.com/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: false,
      format: 'json',
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `Page size: ${ctx.pageWidthPt} × ${ctx.pageHeightPt} pt. Extract content from the attached image.`,
          images: [data],
        },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ollama ${res.status}: ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as OllamaResponse;
  const text = body.message?.content ?? '';
  const parsed = safeParse(text);
  // Ollama Cloud pricing as of 2026-04: free tier rate-limited; treat
  // cost as $0.
  parsed.usage = {
    inputTokens: body.prompt_eval_count ?? 0,
    outputTokens: body.eval_count ?? 0,
    costUsd: 0,
  };
  return parsed;
}

function safeParse(text: string): ExtractResult {
  try {
    return JSON.parse(text) as ExtractResult;
  } catch {
    // Best-effort: try to find a JSON object in the response.
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as ExtractResult;
      } catch {
        // fall through
      }
    }
    return { blocks: [], figureBBoxes: [], warnings: ['ollama_parse_failed'] };
  }
}
