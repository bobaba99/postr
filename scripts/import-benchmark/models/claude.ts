/**
 * Claude Sonnet 4.6 vision adapter for the import benchmark.
 * Mirrors the production prompt + tool-use schema from
 * apps/api/src/import.ts so the benchmark numbers reflect what users
 * will actually see.
 */
import Anthropic from '@anthropic-ai/sdk';
import { promises as fs } from 'node:fs';
import type { ExtractResult } from '../metrics.js';

const SYSTEM = `You are a layout-extraction assistant for academic posters. Given an image of a poster page, identify the readable content and return:
- blocks: an array of text-bearing regions with type (title/heading/authors/text/table), the visible text, a bbox in points, the visible font size in points if you can estimate it, and a confidence in [0,1].
- figureBBoxes: bounding boxes for figure / chart / image regions ONLY. Exclude logos and decorative icons.
- warnings: short notes if you saw rotated text, small unreadable type, multi-column ambiguity, etc.

Be conservative on confidence: prefer 0.5 over hallucinating.`;

const TOOL_INPUT_SCHEMA = {
  type: 'object',
  required: ['blocks', 'figureBBoxes'],
  properties: {
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type', 'text', 'bbox', 'confidence'],
        properties: {
          type: { enum: ['title', 'heading', 'authors', 'text', 'table'] },
          text: { type: 'string' },
          bbox: {
            type: 'object',
            required: ['x', 'y', 'w', 'h'],
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
} as const;

export async function runClaudeFullExtract(ctx: {
  imagePath: string;
  pageWidthPt: number;
  pageHeightPt: number;
}): Promise<ExtractResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const anthropic = new Anthropic({ apiKey });
  const data = (await fs.readFile(ctx.imagePath)).toString('base64');
  const mediaType: 'image/jpeg' | 'image/png' =
    ctx.imagePath.endsWith('.jpg') || ctx.imagePath.endsWith('.jpeg')
      ? 'image/jpeg'
      : 'image/png';

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    system: SYSTEM,
    tools: [
      {
        name: 'emit_extraction',
        description: 'Emit the extracted poster contents as structured JSON.',
        input_schema: TOOL_INPUT_SCHEMA as unknown as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: 'tool', name: 'emit_extraction' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data },
          },
          {
            type: 'text',
            text: `Page size: ${ctx.pageWidthPt} × ${ctx.pageHeightPt} pt.`,
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
  );
  if (!toolUse) throw new Error('claude returned no tool_use block');
  const out = toolUse.input as ExtractResult;
  out.usage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    // Claude Sonnet 4.5 prices: $3/M input, $15/M output (2026-04 rate).
    costUsd:
      (response.usage.input_tokens * 3 +
        response.usage.output_tokens * 15) /
      1_000_000,
  };
  return out;
}
