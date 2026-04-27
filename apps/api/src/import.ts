/**
 * Import vision endpoint — proxies a poster image to a vision LLM
 * and returns structured blocks.
 *
 * Two modes:
 *   - mode='full-extract' — extract every block (title/heading/text/
 *     image regions) on the page. Used by the image OCR fallback path
 *     when a PDF has no text layer (PresenterGeng.pdf, JPG inputs).
 *   - mode='classify-region' — single-bbox classification: figure /
 *     logo / table / decoration. Used by the figure pipeline as a
 *     post-filter after pixel heuristics.
 *
 * Anthropic Claude Sonnet 4.6 is the default. The frontend can pass
 * `model: 'gpt' | 'ollama'` once those adapters land — for now we
 * accept the param but only Claude is wired in production. The
 * benchmark harness exercises all three adapters separately.
 */
import express, { type Request, type Router, type Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireAuth, type AuthLocals } from './auth.js';
import { createRateLimiter } from './rateLimit.js';

// ─────────────────────────────────────────────────────────────────────
// Request / response schemas
// ─────────────────────────────────────────────────────────────────────

const ExtractRequest = z.object({
  imageUrl: z.string().url(),
  pageWidthPt: z.number().positive(),
  pageHeightPt: z.number().positive(),
  mode: z.enum([
    'full-extract',
    'classify-region',
    'measure-text',
    'split-multi-logo',
  ]),
  model: z.enum(['claude', 'gpt', 'ollama']).optional().default('claude'),
});

/** split-multi-logo mode — given an image suspected to contain
 *  multiple logos baked into a single XObject, return per-logo
 *  pixel-space bboxes. */
const SplitMultiLogoSchema = {
  type: 'object',
  required: ['logos'],
  properties: {
    isSingleLogo: { type: 'boolean' },
    logos: {
      type: 'array',
      items: {
        type: 'object',
        required: ['bbox'],
        properties: {
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
          name: { type: 'string' },
        },
      },
    },
  },
} as const;

/** measure-text mode — returns every text region in the image with
 *  pixel-space bboxes so the client can compute effective print size. */
const MeasureTextSchema = {
  type: 'object',
  required: ['imagePixelWidth', 'imagePixelHeight', 'regions'],
  properties: {
    imagePixelWidth: { type: 'number' },
    imagePixelHeight: { type: 'number' },
    regions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['text', 'bbox', 'role'],
        properties: {
          text: { type: 'string' },
          /** pixel-space bbox (origin top-left of the cropped image) */
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
          /** plot-anatomy role: title / axis / tick / legend / data / other */
          role: {
            enum: ['title', 'axis-title', 'axis-tick', 'legend', 'data', 'other'],
          },
        },
      },
    },
  },
} as const;

const FullExtractSchema = {
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
          fontSizePt: { type: 'number' },
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

const ClassifyRegionSchema = {
  type: 'object',
  required: ['kind', 'confidence', 'evidence'],
  properties: {
    kind: { enum: ['figure', 'table', 'logo', 'decoration'] },
    confidence: { type: 'number' },
    reason: { type: 'string' },
    /**
     * Forced chain-of-thought. The model commits to specific
     * observations BEFORE settling on `kind`. The frontend then
     * cross-checks: a `kind: "figure"` verdict that contradicts the
     * evidence (e.g. `representsQuantitativeData: false`) gets
     * downgraded to `decoration`.
     *
     * The fields cover every chart family used in research posters:
     * scatter, bar, line, box/violin, heatmap, pie/donut, histogram,
     * forest plot, error-bar plot, network diagram, schematic
     * illustration, AND composite figures (multiple subplots).
     */
    evidence: {
      type: 'object',
      required: [
        'representsQuantitativeData',
        'hasAxesWithTicks',
        'hasPlottedMarks',
        'hasMultipleSubplots',
        'hasSchematicWithLabels',
        'hasGridRowsAndCols',
        'hasNumericData',
        'isStylizedIcon',
      ],
      properties: {
        representsQuantitativeData: {
          type: 'boolean',
          description:
            'OVERALL judgment: does the image present real data — any of: a chart with axes, a heatmap, a pie/donut, a histogram, a forest plot, a network with measured edges, a labeled experimental schematic, or a composite figure of any of the above? FALSE for cartoon icons / silhouettes / stock illustrations.',
        },
        hasAxesWithTicks: {
          type: 'boolean',
          description:
            'X and/or Y axis with tick marks or value labels visible. Bar / line / scatter / box / violin / heatmap / histogram all set this true. Pie charts and pure schematics may set this false.',
        },
        hasPlottedMarks: {
          type: 'boolean',
          description:
            'Any visible data-encoding marks — points, lines, bars, boxes, violins, heatmap cells, pie segments, error bars, density curves, forest-plot intervals, network nodes/edges with labeled weights, etc.',
        },
        hasMultipleSubplots: {
          type: 'boolean',
          description:
            'The image is a composite/panel figure with 2+ distinct subplots arranged in a grid or row.',
        },
        hasSchematicWithLabels: {
          type: 'boolean',
          description:
            'The image is an experimental schematic, conceptual diagram, network, or flowchart with text labels that name conditions, variables, or measurements. NOT a stock cartoon.',
        },
        hasGridRowsAndCols: {
          type: 'boolean',
          description:
            'A structured grid of rows and columns of data (table).',
        },
        hasNumericData: {
          type: 'boolean',
          description:
            'Numbers visible inside the region (table cells, axis ticks, data labels, percentages, p-values).',
        },
        isStylizedIcon: {
          type: 'boolean',
          description:
            'TRUE if the image is purely a stylized icon, cartoon, silhouette, placeholder graphic, ornamental shape, or stock illustration — EVEN if it depicts a chart-shape (e.g. a magnifying glass over a tiny bar-chart icon is still ornamental). Implies `representsQuantitativeData: false`.',
        },
      },
    },
  },
} as const;

// ─────────────────────────────────────────────────────────────────────
// Router factory
// ─────────────────────────────────────────────────────────────────────

export interface ImportRouterDeps {
  getSupabaseAdmin?: () => SupabaseClient | null;
  getAnthropic?: () => Anthropic | null;
  /** Inject a fetch impl for tests. Defaults to global fetch. */
  fetchFn?: typeof fetch;
}

export function createImportRouter(deps: ImportRouterDeps = {}): Router {
  const router = express.Router();
  const getSupabase = deps.getSupabaseAdmin ?? defaultGetSupabaseAdmin;
  const getAnthropic = deps.getAnthropic ?? defaultGetAnthropic;
  const fetchFn = deps.fetchFn ?? fetch;

  router.post(
    '/api/import/extract',
    requireAuth(getSupabase),
    createRateLimiter({ maxPerWindow: 5, maxPerDay: 20 }),
    async (req: Request, res: Response) => {
      const parsed = ExtractRequest.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: 'bad_request', details: parsed.error.flatten() });
      }

      const { imageUrl, pageWidthPt, pageHeightPt, mode, model } = parsed.data;

      // Only the Anthropic adapter is wired for now; we 503 on
      // anything else so the frontend can fall back.
      if (model !== 'claude') {
        return res.status(503).json({
          error: 'model_unavailable',
          message: `Model "${model}" is not yet wired in production.`,
        });
      }

      const anthropic = getAnthropic();
      if (!anthropic) {
        return res.status(500).json({
          error: 'provider_not_configured',
          message: 'ANTHROPIC_API_KEY is missing on the server.',
        });
      }

      // Re-fetch the image bytes server-side. The signed URL is
      // single-use enough that we don't pass it to the LLM directly
      // (Anthropic supports remote URLs but we want to keep the
      // bucket private and accept arbitrary internal-only URLs).
      let mediaType: 'image/png' | 'image/jpeg' = 'image/png';
      let imageData: string;
      try {
        const r = await fetchFn(imageUrl, {
          signal: AbortSignal.timeout(15_000),
        });
        if (!r.ok) {
          return res.status(502).json({
            error: 'image_fetch_failed',
            status: r.status,
          });
        }
        const buf = Buffer.from(await r.arrayBuffer());
        const contentType = r.headers.get('content-type') ?? 'image/png';
        mediaType = contentType.includes('jpeg') ? 'image/jpeg' : 'image/png';
        imageData = buf.toString('base64');
        if (imageData.length > 20 * 1024 * 1024) {
          return res.status(413).json({ error: 'image_too_large' });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown';
        return res.status(502).json({ error: 'image_fetch_failed', message });
      }

      try {
        if (mode === 'full-extract') {
          const out = await callAnthropicFullExtract(
            anthropic,
            { mediaType, imageData, pageWidthPt, pageHeightPt },
          );
          return res.json(out);
        }
        if (mode === 'measure-text') {
          const out = await callAnthropicMeasureText(anthropic, {
            mediaType,
            imageData,
          });
          return res.json(out);
        }
        if (mode === 'split-multi-logo') {
          const out = await callAnthropicSplitMultiLogo(anthropic, {
            mediaType,
            imageData,
          });
          return res.json(out);
        }
        const out = await callAnthropicClassifyRegion(anthropic, {
          mediaType,
          imageData,
        });
        return res.json(out);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown';
        // eslint-disable-next-line no-console
        console.error('[import.extract] vision call failed:', message);
        return res.status(502).json({ error: 'vision_call_failed', message });
      }
    },
  );

  return router;
}

// ─────────────────────────────────────────────────────────────────────
// Anthropic adapter
// ─────────────────────────────────────────────────────────────────────

const FULL_EXTRACT_SYSTEM = `You are a layout-extraction assistant for academic posters. Given an image of a poster page, identify the readable content and return:
- blocks: an array of text-bearing regions with type (title/heading/authors/text/table), the visible text, a bbox in points (origin top-left of the page; pageWidthPt × pageHeightPt provided), the visible font size in points if you can estimate it, and a confidence in [0,1].
- figureBBoxes: bounding boxes for figure / chart / image regions ONLY. Exclude logos and decorative icons.
- warnings: short notes if you saw rotated text, small unreadable type, multi-column ambiguity, etc.

Be conservative on confidence: prefer 0.5 over hallucinating. Skip purely decorative graphics. Do NOT include logos in figureBBoxes.`;

const SPLIT_MULTI_LOGO_SYSTEM = `You are a logo segmentation assistant. The image you receive may contain ONE logo or MULTIPLE logos arranged in a row, column, or small grid (typical: a poster header strip with a university crest, a hospital logo, and a funder mark side by side). Your job:

- Return per-logo pixel-space bboxes — origin top-left of the supplied image.
- Tighten each bbox to the visible logo's bounding rectangle, NOT the whitespace around it.
- Optionally include each logo's text/name when you can read it (e.g. "McGill", "Douglas", "ADNI").
- If there's only one logo, set isSingleLogo: true and return that single bbox in logos[].

Be precise — these bboxes get cropped directly out of the source pixels and uploaded as separate logo blocks. A loose bbox includes whitespace from the next logo over.`;

const MEASURE_TEXT_SYSTEM = `You are a measurement assistant for plot/table images. Given an image, return EVERY visible text region with:
- text: what the region says (verbatim — preserve case and punctuation)
- bbox: pixel-space bounding box {x, y, w, h} where origin is top-left of the supplied image
- role: one of "title" | "axis-title" | "axis-tick" | "legend" | "data" | "other"
Also return imagePixelWidth and imagePixelHeight so the client can scale.

Be exhaustive — include axis tick labels, tiny legend entries, footnotes. The client uses your bboxes to compute whether each text region is legible at the poster's printed size; missing a small "n=541" caption gives the user a false-pass on readability.`;

const CLASSIFY_REGION_SYSTEM = `You are a single-region classifier for poster image crops. Your job is to decide whether the region carries actual research data (a figure or a table) or whether it is purely visual chrome (a logo or a decorative icon).

Return:
- kind: one of "figure", "table", "logo", "decoration"
- confidence: in [0,1]
- reason: 1-sentence rationale grounded in the evidence
- evidence: a forced chain-of-thought of specific yes/no observations

VERIFICATION RULES — apply in order:

1. Set kind = "figure" if evidence.representsQuantitativeData === true AND evidence.isStylizedIcon === false. This is INTENTIONALLY broad — it includes:
   - Scatter / line / bar / box / violin / forest plots (hasAxesWithTicks + hasPlottedMarks)
   - Histograms and density plots (hasAxesWithTicks + hasPlottedMarks)
   - Heatmaps (hasAxesWithTicks + hasPlottedMarks=cells)
   - Pie / donut charts (hasPlottedMarks=segments, hasAxesWithTicks may be false)
   - Network diagrams with labeled edges
   - Composite figures with 2+ subplots (hasMultipleSubplots)
   - Experimental schematics with labeled steps / conditions (hasSchematicWithLabels)
   The only requirement is that the region presents real measured / labeled information. A figure WITHOUT axes is fine if it has any other data-encoding mark.

2. Set kind = "table" if evidence.hasGridRowsAndCols === true AND evidence.hasNumericData === true AND evidence.isStylizedIcon === false.

3. Set kind = "logo" ONLY for institutional / brand marks: university crests, hospital logos, funder marks (e.g. ADNI). Decorative cartoons (animals, leaves, magnifiers, FAQ bubbles, silhouetted people, speech balloons) are NOT logos — set kind = "decoration".

4. Set kind = "decoration" when evidence.isStylizedIcon === true OR none of the above apply. Especially:
   - Stock icons that depict a chart-shape but contain no real data (a magnifying glass over a tiny bar icon is decoration)
   - Section dividers, banners, ornamental shapes
   - Placeholder / cartoon illustrations

5. When uncertain between figure and decoration, prefer "decoration". A false-positive figure pollutes the user's poster; a false-negative is recoverable.

CONCRETE DECORATION EXAMPLES — these are NOT figures, they are decoration:
- A "people silhouette" icon (two cartoon heads with shoulders, no axes, no numbers)
- A "magnifying glass with chart icon" inside a hexagon (line-art icon, not a real chart)
- A "speech / FAQ bubble with question mark" icon
- A "leaf" or "tree" icon
- A "lightbulb" or "gear" icon
- ANY single-color line-art / silhouette / cartoon shape
- A geometric shape (circle, hexagon, polygon) used as a section ornament
- A green / pastel monochrome icon depicting a CONCEPT (search, idea, methodology) rather than data

These all set isStylizedIcon = true and kind = "decoration" regardless of how chart-like the icon's shape appears.

CONCRETE FIGURE EXAMPLES — these ARE figures:
- A scatter plot with x/y axes and points/regression lines
- A bar chart with axis labels and bars of varying heights with numeric values
- A heatmap with colored cells and row/column labels
- A composite figure showing 4 related subplots
- A network diagram with named nodes and labeled edges
- An experimental schematic with labeled time-points and condition arrows
- A pie chart with percentage labels`;

async function callAnthropicFullExtract(
  anthropic: Anthropic,
  ctx: {
    mediaType: 'image/png' | 'image/jpeg';
    imageData: string;
    pageWidthPt: number;
    pageHeightPt: number;
  },
): Promise<unknown> {
  const tool = {
    name: 'emit_extraction',
    description:
      'Emit the extracted poster contents as structured JSON.',
    input_schema: FullExtractSchema as unknown as Anthropic.Tool.InputSchema,
  } satisfies Anthropic.Tool;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    system: FULL_EXTRACT_SYSTEM,
    tools: [tool],
    tool_choice: { type: 'tool', name: 'emit_extraction' },
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
  if (!toolUse) throw new Error('vision_no_tool_use');
  return toolUse.input as unknown;
}

async function callAnthropicSplitMultiLogo(
  anthropic: Anthropic,
  ctx: { mediaType: 'image/png' | 'image/jpeg'; imageData: string },
): Promise<unknown> {
  const tool = {
    name: 'emit_logo_segmentation',
    description: 'Emit per-logo pixel-space bboxes for the supplied image.',
    input_schema:
      SplitMultiLogoSchema as unknown as Anthropic.Tool.InputSchema,
  } satisfies Anthropic.Tool;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    system: SPLIT_MULTI_LOGO_SYSTEM,
    tools: [tool],
    tool_choice: { type: 'tool', name: 'emit_logo_segmentation' },
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
  return toolUse.input as unknown;
}

async function callAnthropicMeasureText(
  anthropic: Anthropic,
  ctx: { mediaType: 'image/png' | 'image/jpeg'; imageData: string },
): Promise<unknown> {
  const tool = {
    name: 'emit_measurements',
    description:
      'Emit text-region measurements for the supplied figure image.',
    input_schema:
      MeasureTextSchema as unknown as Anthropic.Tool.InputSchema,
  } satisfies Anthropic.Tool;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2048,
    system: MEASURE_TEXT_SYSTEM,
    tools: [tool],
    tool_choice: { type: 'tool', name: 'emit_measurements' },
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
  return toolUse.input as unknown;
}

async function callAnthropicClassifyRegion(
  anthropic: Anthropic,
  ctx: { mediaType: 'image/png' | 'image/jpeg'; imageData: string },
): Promise<unknown> {
  const tool = {
    name: 'emit_classification',
    description: 'Emit the region classification as structured JSON.',
    input_schema:
      ClassifyRegionSchema as unknown as Anthropic.Tool.InputSchema,
  } satisfies Anthropic.Tool;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 256,
    system: CLASSIFY_REGION_SYSTEM,
    tools: [tool],
    tool_choice: { type: 'tool', name: 'emit_classification' },
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
  return toolUse.input as unknown;
}

// ─────────────────────────────────────────────────────────────────────
// Default factories
// ─────────────────────────────────────────────────────────────────────

function defaultGetSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function defaultGetAnthropic(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}
