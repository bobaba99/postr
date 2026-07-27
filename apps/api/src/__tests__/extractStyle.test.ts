/**
 * extract-style mode — schema closure + endpoint behaviour.
 *
 * The feature's defining guarantee (design plan §1) is that the
 * extractor's output schema CANNOT express the source poster's
 * content: every field is an enum, a number, or a hex colour, and
 * unknown fields are rejected. That guarantee must live in a test,
 * not a convention — the first half of this file is that test.
 *
 * The second half exercises the /api/import/extract route with
 * mode='extract-style': validation pass-through, malformed-payload
 * rejection, the font-enum fallback, and the 10/day mode-scoped cap.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createImportRouter } from '../import.js';
import {
  CURATED_FONT_FAMILIES,
  ExtractStyleToolSchema,
  validateExtractedStyle,
} from '../extractStyle.js';

const SUPABASE_URL = 'https://testref.supabase.co';
const VALID_IMAGE_URL = `${SUPABASE_URL}/storage/v1/object/sign/posters/style.jpg?token=abc`;

const VALID_PALETTE = {
  bg: '#FAFDF7',
  primary: '#1B3A2D',
  accent: '#2D6A4F',
  accent2: '#52B788',
  muted: '#5A6E5F',
  headerBg: '#2D6A4F',
  headerFg: '#FFFFFF',
};

function validPayload() {
  return {
    fontFamily: 'Lora',
    palette: { ...VALID_PALETTE },
    confidence: 0.8,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Schema closure — the §1 guarantee
// ─────────────────────────────────────────────────────────────────────

describe('validateExtractedStyle — schema closure', () => {
  it('accepts a valid payload and stamps version 1', () => {
    const out = validateExtractedStyle(validPayload());
    expect(out).not.toBeNull();
    expect(out!.version).toBe(1);
    expect(out!.fontFamily).toBe('Lora');
    expect(out!.palette).toEqual(VALID_PALETTE);
    expect(out!.confidence).toBe(0.8);
  });

  it('rejects any additional top-level property (no channel for content)', () => {
    const smuggled = {
      ...validPayload(),
      title: 'Novel biomarkers in early-onset dementia',
    };
    expect(validateExtractedStyle(smuggled)).toBeNull();
  });

  it('rejects additional properties nested inside palette', () => {
    const payload = validPayload();
    const smuggled = {
      ...payload,
      palette: { ...payload.palette, note: 'abstract text here' },
    };
    expect(validateExtractedStyle(smuggled)).toBeNull();
  });

  it.each([
    ['a CSS colour name', 'tomato'],
    ['a 3-digit hex', '#FA0'],
    ['an rgb() value', 'rgb(20, 30, 40)'],
    ['free text', 'the header is dark green like the university crest'],
    ['an 8-digit hex', '#11223344'],
  ])('rejects %s as a palette value', (_label, value) => {
    const payload = validPayload();
    const bad = { ...payload, palette: { ...payload.palette, accent: value } };
    expect(validateExtractedStyle(bad)).toBeNull();
  });

  it('rejects a palette missing a role', () => {
    const payload = validPayload();
    const { headerFg: _headerFg, ...partial } = payload.palette;
    expect(validateExtractedStyle({ ...payload, palette: partial })).toBeNull();
  });

  it.each([[-0.1], [1.2], ['high']])(
    'rejects out-of-range/non-numeric confidence %p',
    (confidence) => {
      expect(
        validateExtractedStyle({ ...validPayload(), confidence }),
      ).toBeNull();
    },
  );

  it('falls back to fontFamily null (not rejection) for an unknown family', () => {
    const out = validateExtractedStyle({
      ...validPayload(),
      fontFamily: 'Comic Sans MS',
    });
    expect(out).not.toBeNull();
    expect(out!.fontFamily).toBeNull();
  });

  it('accepts fontFamily null as-is', () => {
    const out = validateExtractedStyle({ ...validPayload(), fontFamily: null });
    expect(out).not.toBeNull();
    expect(out!.fontFamily).toBeNull();
  });

  it('rejects non-object payloads', () => {
    expect(validateExtractedStyle(null)).toBeNull();
    expect(validateExtractedStyle('a poster description')).toBeNull();
    expect(validateExtractedStyle([validPayload()])).toBeNull();
  });
});

describe('ExtractStyleToolSchema — no free-text field, closed at every level', () => {
  it('closes both object levels with additionalProperties: false', () => {
    expect(ExtractStyleToolSchema.additionalProperties).toBe(false);
    expect(
      ExtractStyleToolSchema.properties.palette.additionalProperties,
    ).toBe(false);
  });

  it('constrains every leaf to an enum, a bounded number, or a hex pattern', () => {
    const { fontFamily, palette, confidence } =
      ExtractStyleToolSchema.properties;
    expect([...fontFamily.enum]).toEqual([...CURATED_FONT_FAMILIES]);
    expect(confidence.minimum).toBe(0);
    expect(confidence.maximum).toBe(1);
    for (const role of Object.values(palette.properties)) {
      expect(role.type).toBe('string');
      expect(role.pattern).toBe('^#[0-9a-fA-F]{6}$');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Endpoint behaviour
// ─────────────────────────────────────────────────────────────────────

function fakeSupabase(): SupabaseClient {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: 'user-1', is_anonymous: true } },
        error: null,
      }),
    },
  } as unknown as SupabaseClient;
}

function fakeAnthropic(toolInput: unknown) {
  const create = vi.fn().mockResolvedValue({
    content: [
      {
        type: 'tool_use',
        id: 'toolu_test',
        name: 'emit_style',
        input: toolInput,
      },
    ],
    stop_reason: 'tool_use',
    usage: { input_tokens: 10, output_tokens: 10 },
  });
  return { create, client: { messages: { create } } as unknown as Anthropic };
}

function jpegResponse(): Response {
  return new Response(new Uint8Array(1024), {
    status: 200,
    headers: { 'content-type': 'image/jpeg' },
  });
}

function buildApp(anthropic: Anthropic) {
  const app = express();
  app.use(express.json());
  app.use(
    createImportRouter({
      getSupabaseAdmin: () => fakeSupabase(),
      getAnthropic: () => anthropic,
      // A fresh Response per call — a Response body is single-use,
      // and the rate-limit test posts 12 times through one app.
      fetchFn: vi.fn().mockImplementation(() =>
        Promise.resolve(jpegResponse()),
      ) as unknown as typeof fetch,
    }),
  );
  return app;
}

function postExtractStyle(app: ReturnType<typeof buildApp>) {
  return request(app)
    .post('/api/import/extract')
    .set('Authorization', 'Bearer test-token')
    .send({
      imageUrl: VALID_IMAGE_URL,
      pageWidthPt: 612,
      pageHeightPt: 792,
      mode: 'extract-style',
    });
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', SUPABASE_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/import/extract — mode extract-style', () => {
  it('returns the validated style with version 1', async () => {
    const anthropic = fakeAnthropic(validPayload());
    const app = buildApp(anthropic.client);

    const res = await postExtractStyle(app);

    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
    expect(res.body.fontFamily).toBe('Lora');
    expect(res.body.palette).toEqual(VALID_PALETTE);
    expect(anthropic.create).toHaveBeenCalledTimes(1);
  });

  it('forces the emit_style tool on the Anthropic call', async () => {
    const anthropic = fakeAnthropic(validPayload());
    const app = buildApp(anthropic.client);

    await postExtractStyle(app);

    expect(anthropic.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tool_choice: { type: 'tool', name: 'emit_style' },
      }),
    );
  });

  it('502s (vision_call_failed) when the payload smuggles extra fields', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const anthropic = fakeAnthropic({
      ...validPayload(),
      abstractText: 'lorem ipsum',
    });
    const app = buildApp(anthropic.client);

    const res = await postExtractStyle(app);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('vision_call_failed');
  });

  it('degrades an out-of-enum font to null instead of failing', async () => {
    const anthropic = fakeAnthropic({
      ...validPayload(),
      fontFamily: 'Papyrus',
    });
    const app = buildApp(anthropic.client);

    const res = await postExtractStyle(app);

    expect(res.status).toBe(200);
    expect(res.body.fontFamily).toBeNull();
  });

  it('caps extract-style at 10/day without touching other modes', async () => {
    const anthropic = fakeAnthropic(validPayload());
    const app = buildApp(anthropic.client);

    for (let i = 0; i < 10; i += 1) {
      const ok = await postExtractStyle(app);
      expect(ok.status).toBe(200);
    }

    const eleventh = await postExtractStyle(app);
    expect(eleventh.status).toBe(429);
    expect(eleventh.body.error).toBe('daily_limit_exceeded');
    expect(eleventh.headers['retry-after']).toMatch(/^\d+$/);

    // Other modes are unaffected by the style cap. (This fake
    // Anthropic returns a style payload for every mode; the endpoint
    // passes classify-region output through unvalidated, so a 200 is
    // all that matters here.)
    const classify = await request(app)
      .post('/api/import/extract')
      .set('Authorization', 'Bearer test-token')
      .send({
        imageUrl: VALID_IMAGE_URL,
        pageWidthPt: 612,
        pageHeightPt: 792,
        mode: 'classify-region',
      });
    expect(classify.status).toBe(200);
  });
});
