/**
 * /api/import/extract — SSRF guard + image size cap.
 *
 * The handler fetches imageUrl server-side and forwards the bytes to
 * Anthropic, so the endpoint must only ever fetch this project's own
 * Supabase Storage host: internal addresses 400 before any fetch,
 * redirects are refused, and config failures fail closed. Oversized
 * images must 413 before the upstream call instead of bouncing off
 * Anthropic's own image limit as a 502.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createImportRouter } from '../import.js';

const SUPABASE_URL = 'https://testref.supabase.co';
const VALID_IMAGE_URL = `${SUPABASE_URL}/storage/v1/object/sign/posters/page-1.png?token=abc`;

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

function fakeAnthropic() {
  const create = vi.fn().mockResolvedValue({
    content: [
      {
        type: 'tool_use',
        id: 'toolu_test',
        name: 'emit_classification',
        input: { kind: 'figure', confidence: 0.9 },
      },
    ],
    stop_reason: 'tool_use',
    usage: { input_tokens: 10, output_tokens: 10 },
  });
  return { create, client: { messages: { create } } as unknown as Anthropic };
}

function pngResponse(byteLength: number): Response {
  return new Response(new Uint8Array(byteLength), {
    status: 200,
    headers: { 'content-type': 'image/png' },
  });
}

function buildApp(deps: { fetchFn: typeof fetch; anthropic?: Anthropic }) {
  const app = express();
  app.use(express.json());
  app.use(
    createImportRouter({
      getSupabaseAdmin: () => fakeSupabase(),
      getAnthropic: () => deps.anthropic ?? fakeAnthropic().client,
      fetchFn: deps.fetchFn,
    }),
  );
  return app;
}

function postExtract(app: ReturnType<typeof buildApp>, imageUrl: string) {
  return request(app)
    .post('/api/import/extract')
    .set('Authorization', 'Bearer test-token')
    .send({
      imageUrl,
      pageWidthPt: 612,
      pageHeightPt: 792,
      mode: 'classify-region',
    });
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', SUPABASE_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/import/extract — SSRF guard', () => {
  it.each([
    ['the cloud metadata endpoint', 'http://169.254.169.254/latest/meta-data/'],
    ['localhost with a port', 'http://127.0.0.1:8080/internal-admin'],
    ['loopback over https', 'https://127.0.0.1/internal-admin'],
    ['a private 10.x address', 'https://10.0.0.8/admin'],
    ['a private 192.168.x address', 'https://192.168.1.10/router'],
    [
      'plain http on the allowed host',
      'http://testref.supabase.co/storage/v1/object/public/p.png',
    ],
    [
      'an allowed-host suffix spoof',
      'https://testref.supabase.co.evil.com/p.png',
    ],
    [
      'a userinfo @ trick where the real host is evil.com',
      'https://testref.supabase.co@evil.com/p.png',
    ],
    [
      'the allowed host on a non-default port',
      'https://testref.supabase.co:8443/p.png',
    ],
  ])('rejects %s with 400 before any fetch', async (_label, imageUrl) => {
    const fetchFn = vi.fn();
    const app = buildApp({ fetchFn: fetchFn as unknown as typeof fetch });

    const res = await postExtract(app, imageUrl);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('bad_request');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('accepts a Supabase Storage URL on the project host', async () => {
    const fetchFn = vi.fn().mockResolvedValue(pngResponse(1024));
    const anthropic = fakeAnthropic();
    const app = buildApp({
      fetchFn: fetchFn as unknown as typeof fetch,
      anthropic: anthropic.client,
    });

    const res = await postExtract(app, VALID_IMAGE_URL);

    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('figure');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(anthropic.create).toHaveBeenCalledTimes(1);
  });

  it('fetches with redirect: "error" so the allowed host cannot bounce elsewhere', async () => {
    const fetchFn = vi.fn().mockResolvedValue(pngResponse(1024));
    const app = buildApp({ fetchFn: fetchFn as unknown as typeof fetch });

    await postExtract(app, VALID_IMAGE_URL);

    expect(fetchFn).toHaveBeenCalledWith(
      VALID_IMAGE_URL,
      expect.objectContaining({ redirect: 'error' }),
    );
  });

  it('returns 502 when the fetch rejects (e.g. a refused redirect)', async () => {
    // With redirect: 'error', undici rejects on any 3xx — the handler
    // must surface that as image_fetch_failed without calling Anthropic.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchFn = vi
      .fn()
      .mockRejectedValue(new TypeError('fetch failed: unexpected redirect'));
    const anthropic = fakeAnthropic();
    const app = buildApp({
      fetchFn: fetchFn as unknown as typeof fetch,
      anthropic: anthropic.client,
    });

    const res = await postExtract(app, VALID_IMAGE_URL);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('image_fetch_failed');
    expect(anthropic.create).not.toHaveBeenCalled();
  });

  it('fails closed with 500 when SUPABASE_URL is not configured', async () => {
    vi.stubEnv('SUPABASE_URL', '');
    const fetchFn = vi.fn();
    const app = buildApp({ fetchFn: fetchFn as unknown as typeof fetch });

    const res = await postExtract(app, VALID_IMAGE_URL);

    expect(res.status).toBe(500);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('POST /api/import/extract — image size cap', () => {
  const FIVE_MB = 5 * 1024 * 1024;

  it('rejects an image over 5MB raw bytes with 413 before the Anthropic call', async () => {
    const fetchFn = vi.fn().mockResolvedValue(pngResponse(FIVE_MB + 1));
    const anthropic = fakeAnthropic();
    const app = buildApp({
      fetchFn: fetchFn as unknown as typeof fetch,
      anthropic: anthropic.client,
    });

    const res = await postExtract(app, VALID_IMAGE_URL);

    expect(res.status).toBe(413);
    expect(res.body.error).toBe('image_too_large');
    expect(anthropic.create).not.toHaveBeenCalled();
  });

  it('accepts an image at exactly 5MB raw bytes', async () => {
    const fetchFn = vi.fn().mockResolvedValue(pngResponse(FIVE_MB));
    const anthropic = fakeAnthropic();
    const app = buildApp({
      fetchFn: fetchFn as unknown as typeof fetch,
      anthropic: anthropic.client,
    });

    const res = await postExtract(app, VALID_IMAGE_URL);

    expect(res.status).toBe(200);
    expect(anthropic.create).toHaveBeenCalledTimes(1);
  });
});
