/**
 * OpenAI vision adapter — gpt-4o by default, can be overridden via
 * BENCH_OPENAI_MODEL.
 */
import { promises as fs } from 'node:fs';
import type { ExtractResult } from '../metrics.js';

const SYSTEM = `You are a layout-extraction assistant for academic posters. Given an image of a poster page, return JSON with:
- blocks: array of {type: title|heading|authors|text|table, text: string, bbox: {x,y,w,h} in points, confidence: 0..1}
- figureBBoxes: array of {x,y,w,h} for figure/chart regions ONLY (exclude logos and decorative icons)
- warnings: short notes
Be conservative — prefer 0.5 confidence over hallucinating.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  required: ['blocks', 'figureBBoxes', 'warnings'],
  properties: {
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type', 'text', 'bbox', 'confidence'],
        additionalProperties: false,
        properties: {
          type: { enum: ['title', 'heading', 'authors', 'text', 'table'] },
          text: { type: 'string' },
          bbox: {
            type: 'object',
            required: ['x', 'y', 'w', 'h'],
            additionalProperties: false,
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              w: { type: 'number' },
              h: { type: 'number' },
            },
          },
          confidence: { type: 'number' },
        },
      },
    },
    figureBBoxes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['x', 'y', 'w', 'h'],
        additionalProperties: false,
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          w: { type: 'number' },
          h: { type: 'number' },
        },
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  additionalProperties: false,
} as const;

interface OpenAIResponse {
  output_text?: string;
  choices?: Array<{
    message?: { content?: string | Array<{ text?: string }> };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export async function runOpenAIFullExtract(ctx: {
  imagePath: string;
  pageWidthPt: number;
  pageHeightPt: number;
}): Promise<ExtractResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  const model = process.env.BENCH_OPENAI_MODEL ?? 'gpt-4o-2024-11-20';
  const data = (await fs.readFile(ctx.imagePath)).toString('base64');
  const mediaType = ctx.imagePath.endsWith('.jpg') ? 'image/jpeg' : 'image/png';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Page size: ${ctx.pageWidthPt} × ${ctx.pageHeightPt} pt.` },
            {
              type: 'image_url',
              image_url: { url: `data:${mediaType};base64,${data}` },
            },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'PosterExtraction',
          strict: true,
          schema: RESPONSE_SCHEMA,
        },
      },
      max_tokens: 4096,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`openai ${res.status}: ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as OpenAIResponse;
  const content =
    body.choices?.[0]?.message?.content ??
    body.output_text ??
    '';
  const text =
    typeof content === 'string'
      ? content
      : content
          .map((p) => p.text ?? '')
          .join('');
  const parsed = JSON.parse(text) as ExtractResult;
  // gpt-4o pricing 2026-04: $2.50/M input, $10/M output.
  const inT = body.usage?.prompt_tokens ?? 0;
  const outT = body.usage?.completion_tokens ?? 0;
  parsed.usage = {
    inputTokens: inT,
    outputTokens: outT,
    costUsd: (inT * 2.5 + outT * 10) / 1_000_000,
  };
  return parsed;
}
