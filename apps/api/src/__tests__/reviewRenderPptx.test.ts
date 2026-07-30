/**
 * POST /api/review/render-pptx — route tests with a fake PptxRenderer and
 * fake Supabase Storage (no LibreOffice, no network). Pins: the signed-URL
 * happy path + storage layout, the 24-page hard cap (spec §1 — never
 * silently truncate), and the SSRF guard rejecting foreign hosts before
 * any fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createReviewRouter } from '../review.js';
import type { PptxRenderer, RenderedPage } from '../review/pptx.js';

const SUPABASE_URL = 'https://testref.supabase.co';
const VALID_FILE_URL = `${SUPABASE_URL}/storage/v1/object/sign/poster-assets/user-1/review-tmp/deck.pptx?token=abc`;
const PPTX_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);

function fakeSupabase() {
  const uploads: Array<{
    bucket: string;
    path: string;
    contentType?: string;
    byteLength: number;
  }> = [];
  const signed: Array<{ bucket: string; path: string; ttlSec: number }> = [];
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: { id: 'user-1', is_anonymous: false } },
        error: null,
      }),
    },
    storage: {
      from(bucket: string) {
        return {
          upload: async (
            path: string,
            body: Buffer,
            opts?: { contentType?: string },
          ) => {
            uploads.push({
              bucket,
              path,
              contentType: opts?.contentType,
              byteLength: body.length,
            });
            return { data: { path }, error: null };
          },
          createSignedUrl: async (path: string, ttlSec: number) => {
            signed.push({ bucket, path, ttlSec });
            return {
              data: { signedUrl: `https://signed.test/${path}?token=sig` },
              error: null,
            };
          },
        };
      },
    },
  } as unknown as SupabaseClient;
  return { client, uploads, signed };
}

function fakeRenderer(pages: Array<{ widthPx: number; heightPx: number }>) {
  const calls: Buffer[] = [];
  const renderer: PptxRenderer = {
    render: async (pptx: Buffer): Promise<RenderedPage[]> => {
      calls.push(pptx);
      return pages.map((d, i) => ({
        pageNumber: i + 1,
        jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
        widthPx: d.widthPx,
        heightPx: d.heightPx,
      }));
    },
  };
  return { renderer, calls };
}

function buildApp(deps: { renderer: PptxRenderer; fetchFn?: typeof fetch }) {
  const fake = fakeSupabase();
  const fetchFn =
    deps.fetchFn ??
    ((async () =>
      new Response(PPTX_BYTES, {
        status: 200,
        headers: {
          'content-type':
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        },
      })) as unknown as typeof fetch);
  const app = express();
  app.use(express.json());
  app.use(
    createReviewRouter({
      getSupabaseAdmin: () => fake.client,
      fetchFn,
      getPptxRenderer: () => deps.renderer,
    }),
  );
  return { app, fake };
}

function postRender(app: ReturnType<typeof express>, fileUrl: string) {
  return request(app)
    .post('/api/review/render-pptx')
    .set('Authorization', 'Bearer test-token')
    .send({ fileUrl });
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', SUPABASE_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/review/render-pptx', () => {
  it('renders the deck, uploads page JPEGs to review-temp, returns signed URLs', async () => {
    const { renderer, calls } = fakeRenderer([
      { widthPx: 2048, heightPx: 1152 },
      { widthPx: 2048, heightPx: 1152 },
    ]);
    const { app, fake } = buildApp({ renderer });

    const res = await postRender(app, VALID_FILE_URL);

    expect(res.status).toBe(200);
    expect(res.body.pages).toHaveLength(2);
    expect(res.body.pages[0]).toMatchObject({
      pageNumber: 1,
      widthPx: 2048,
      heightPx: 1152,
    });
    expect(res.body.pages[0].url).toContain('https://signed.test/');

    // the renderer received exactly the fetched .pptx bytes
    expect(calls).toHaveLength(1);
    expect(calls[0]!.equals(Buffer.from(PPTX_BYTES))).toBe(true);

    // one upload per page under {user}/review-temp/{batch}/page-N.jpg
    expect(fake.uploads).toHaveLength(2);
    expect(fake.uploads[0]!.bucket).toBe('poster-assets');
    expect(fake.uploads[0]!.contentType).toBe('image/jpeg');
    expect(fake.uploads[0]!.path).toMatch(
      /^user-1\/review-temp\/[0-9a-f-]{36}\/page-1\.jpg$/,
    );
    expect(fake.uploads[1]!.path).toMatch(
      /^user-1\/review-temp\/[0-9a-f-]{36}\/page-2\.jpg$/,
    );

    // signed URLs minted for the uploaded paths at the review TTL (600s)
    expect(fake.signed).toEqual([
      { bucket: 'poster-assets', path: fake.uploads[0]!.path, ttlSec: 600 },
      { bucket: 'poster-assets', path: fake.uploads[1]!.path, ttlSec: 600 },
    ]);

    // each page carries its review-temp storagePath so the client can
    // delete the temp images once the review is done
    expect(res.body.pages[0].storagePath).toBe(fake.uploads[0]!.path);
    expect(res.body.pages[1].storagePath).toBe(fake.uploads[1]!.path);
  });

  it('rejects any page below the 1024×1024 audit floor (400 page_too_small) and uploads nothing', async () => {
    const { renderer } = fakeRenderer([{ widthPx: 900, heightPx: 900 }]);
    const { app, fake } = buildApp({ renderer });

    const res = await postRender(app, VALID_FILE_URL);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('page_too_small');
    expect(res.body.message).toContain('1024×1024');
    expect(fake.uploads).toHaveLength(0);
  });

  it('rejects a deck over the 24-page cap (400 too_many_pages) and uploads nothing', async () => {
    const { renderer } = fakeRenderer(
      Array.from({ length: 25 }, () => ({ widthPx: 2048, heightPx: 1152 })),
    );
    const { app, fake } = buildApp({ renderer });

    const res = await postRender(app, VALID_FILE_URL);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('too_many_pages');
    expect(fake.uploads).toHaveLength(0);
  });

  it('rejects a fileUrl on a foreign host with 400 before any fetch or render', async () => {
    const fetchFn = vi.fn();
    const { renderer, calls } = fakeRenderer([
      { widthPx: 2048, heightPx: 1152 },
    ]);
    const { app } = buildApp({
      renderer,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const res = await postRender(app, 'https://evil.example.com/deck.pptx');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('url_not_allowed');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });
});
