/**
 * extract-style mode — lift DESIGN properties (palette roles + closest
 * curated font family) from a poster image. Phase 1 of
 * docs/plans/2026-07-27-design-style-extraction.md.
 *
 * The content/style boundary is enforced by the SCHEMA, not by a
 * prompt asking nicely: every field is an enum, a number, or a hex
 * colour. There is no free-text field, so the source poster's words
 * cannot pass through this endpoint. `validateExtractedStyle` asserts
 * that closure with a strict zod schema; the guarantee is unit-tested
 * in __tests__/extractStyle.test.ts.
 *
 * Mounted as a mode of POST /api/import/extract (see import.ts) so it
 * inherits the existing auth, rate limiting, SSRF guard, size cap and
 * Anthropic plumbing — per the plan, no second endpoint.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { CuratedFontFamily, ExtractedStyle } from '@postr/shared';

/**
 * Runtime copy of the curated families. @postr/shared ships TS source
 * only (its `main` points at src/index.ts), which `tsx` can execute in
 * dev but plain `node dist/index.js` cannot in production — so the API
 * must not import runtime VALUES from it. The compile-time asserts
 * below pin this copy to the shared `CuratedFontFamily` union in both
 * directions: add/remove/rename a family in either place and the build
 * breaks.
 */
export const CURATED_FONT_FAMILIES = [
  'Source Sans 3',
  'DM Sans',
  'IBM Plex Sans',
  'Fira Sans',
  'Libre Franklin',
  'Outfit',
  'Charter',
  'Literata',
  'Source Serif 4',
  'Lora',
] as const;

type LocalFamily = (typeof CURATED_FONT_FAMILIES)[number];
type AssertLocalCoversShared = [CuratedFontFamily] extends [LocalFamily]
  ? true
  : never;
type AssertSharedCoversLocal = [LocalFamily] extends [CuratedFontFamily]
  ? true
  : never;
// Compile-time only — these fail to typecheck when the lists drift.
const _localCoversShared: AssertLocalCoversShared = true;
const _sharedCoversLocal: AssertSharedCoversLocal = true;
void _localCoversShared;
void _sharedCoversLocal;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const HexColor = z.string().regex(HEX_COLOR);

/** Seven-role palette — hex values only, no other keys accepted. */
const PaletteSchema = z
  .object({
    bg: HexColor,
    primary: HexColor,
    accent: HexColor,
    accent2: HexColor,
    muted: HexColor,
    headerBg: HexColor,
    headerFg: HexColor,
  })
  .strict();

/**
 * The closed response schema (plan §1). `.strict()` everywhere: a
 * payload carrying anything beyond these fields — a `title`, a
 * `sections` array, any free text — fails validation and the request
 * errors rather than leaking.
 */
const ExtractedStyleResultSchema = z
  .object({
    fontFamily: z.enum(CURATED_FONT_FAMILIES).nullable(),
    palette: PaletteSchema,
    confidence: z.number().min(0).max(1),
  })
  .strict();

/**
 * Tool-input schema for the forced tool-use call. Mirrors
 * `ExtractedStyleResultSchema` — the model is structurally prevented
 * from returning content because no field can carry it.
 */
export const ExtractStyleToolSchema = {
  type: 'object',
  required: ['fontFamily', 'palette', 'confidence'],
  additionalProperties: false,
  properties: {
    fontFamily: {
      enum: [...CURATED_FONT_FAMILIES],
      description:
        'The curated family that most resembles the poster\'s dominant typeface. Judge serif vs sans first, then letterform character (geometric / humanist / old-style).',
    },
    palette: {
      type: 'object',
      required: [
        'bg',
        'primary',
        'accent',
        'accent2',
        'muted',
        'headerBg',
        'headerFg',
      ],
      additionalProperties: false,
      properties: {
        bg: {
          type: 'string',
          pattern: '^#[0-9a-fA-F]{6}$',
          description: 'Page background colour as 6-digit hex.',
        },
        primary: {
          type: 'string',
          pattern: '^#[0-9a-fA-F]{6}$',
          description: 'Main body-text colour.',
        },
        accent: {
          type: 'string',
          pattern: '^#[0-9a-fA-F]{6}$',
          description:
            'The dominant identity colour — section headings, bands, rules.',
        },
        accent2: {
          type: 'string',
          pattern: '^#[0-9a-fA-F]{6}$',
          description: 'Secondary accent colour.',
        },
        muted: {
          type: 'string',
          pattern: '^#[0-9a-fA-F]{6}$',
          description:
            'De-emphasised support colour — captions, footnotes, subtle fills.',
        },
        headerBg: {
          type: 'string',
          pattern: '^#[0-9a-fA-F]{6}$',
          description:
            'Colour behind the title/header area. Use the page background when there is no header band.',
        },
        headerFg: {
          type: 'string',
          pattern: '^#[0-9a-fA-F]{6}$',
          description: 'Text colour used on top of headerBg.',
        },
      },
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description:
        'How sure you are about the overall role assignment and font match. Below 0.5 means "I am guessing".',
    },
  },
} as const;

const EXTRACT_STYLE_SYSTEM = `You are a poster design analyst. You are shown an image of a research poster. Extract its DESIGN ONLY — which colours play which roles, and which curated font family its typography most resembles. You never transcribe, summarise, or describe the poster's content; the output schema has no field for it.

Palette role assignment:
- bg: the page background colour (the large empty areas, not a figure's fill).
- primary: the main body-text colour.
- accent: the poster's dominant identity colour — the one used for section headings, header bands, rules, or boxes.
- accent2: the secondary accent, when a second recurring colour exists; otherwise a lighter/darker variant of accent.
- muted: a de-emphasised support colour used for captions, footnotes, or subtle fills.
- headerBg: the colour behind the title area. When the title sits directly on the page background, repeat bg here.
- headerFg: the colour of the title text on top of headerBg.

Report colours you actually see on the page, as 6-digit hex. Ignore colours that only appear inside photographs or data figures — role colours come from the poster's chrome (bands, headings, rules, backgrounds), not from figure content.

fontFamily: pick the single curated family that most resembles the poster's dominant text face. Serif vs sans first, then closest letterform character.

confidence: your honest 0–1 estimate for the role assignment + font match combined. Prefer a low number over a confident guess — the UI tells the user when you were unsure.`;

/**
 * Validate a raw tool-use payload into an `ExtractedStyle`.
 *
 * Font handling per plan §5: an out-of-enum family is impossible by
 * construction (forced tool-use enum) but asserted anyway — it
 * degrades to `null` ("keep the current family") instead of failing
 * the whole extraction. Anything else malformed returns `null` and
 * the caller surfaces a vision failure.
 */
export function validateExtractedStyle(raw: unknown): ExtractedStyle | null {
  const withFontFallback = (() => {
    if (raw === null || typeof raw !== 'object') return raw;
    const f = (raw as { fontFamily?: unknown }).fontFamily;
    const known =
      typeof f === 'string' &&
      (CURATED_FONT_FAMILIES as readonly string[]).includes(f);
    if (known || f === null) return raw;
    return { ...raw, fontFamily: null };
  })();

  const parsed = ExtractedStyleResultSchema.safeParse(withFontFallback);
  if (!parsed.success) return null;
  return { version: 1, ...parsed.data };
}

export async function callAnthropicExtractStyle(
  anthropic: Anthropic,
  ctx: { mediaType: 'image/png' | 'image/jpeg'; imageData: string },
): Promise<ExtractedStyle> {
  const tool = {
    name: 'emit_style',
    description:
      'Emit the extracted design style (palette roles, font family, confidence) as structured JSON.',
    input_schema:
      ExtractStyleToolSchema as unknown as Anthropic.Tool.InputSchema,
  } satisfies Anthropic.Tool;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 512,
    system: EXTRACT_STYLE_SYSTEM,
    tools: [tool],
    tool_choice: { type: 'tool', name: 'emit_style' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: ctx.mediaType,
              data: ctx.imageData,
            },
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
  );
  if (!toolUse) throw new Error('vision_no_tool_use');

  const validated = validateExtractedStyle(toolUse.input);
  if (!validated) throw new Error('vision_bad_style_payload');
  return validated;
}
