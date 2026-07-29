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
import { REVIEW_PPTX_MAX_BYTES } from '../review/config.js';
import type { PptxRenderer, RenderedPage } from '../review/pptx.js';

const SUPABASE_URL = 'https://testref.supabase.co';
const VALID_FILE_URL = `${SUPABASE_URL}/storage/v1/object/sign/poster-assets/user-1/review-temp/deck.pptx?token=abc`;

/** Minimal, structurally valid ZIP with empty entries and a central directory. */
function zipWithEntries(names: string[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;
  for (const name of names) {
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(nameBytes.length, 26);
    nameBytes.copy(local, 30);
    localParts.push(local);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(localOffset, 42);
    nameBytes.copy(central, 46);
    centralParts.push(central);
    localOffset += local.length;
  }
  const locals = Buffer.concat(localParts);
  const central = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(names.length, 8);
  eocd.writeUInt16LE(names.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(locals.length, 16);
  return Buffer.concat([locals, central, eocd]);
}

function pptxBytes(slideCount = 1): Buffer {
  return zipWithEntries([
    '[Content_Types].xml',
    'ppt/presentation.xml',
    ...Array.from(
      { length: slideCount },
      (_, index) => `ppt/slides/slide${index + 1}.xml`,
    ),
  ]);
}

const PPTX_BYTES = pptxBytes();

function fakeSupabase(
  storageOpts: { failUploadAt?: number; failSignAt?: number } = {},
) {
  const uploads: Array<{
    bucket: string;
    path: string;
    contentType?: string;
    byteLength: number;
  }> = [];
  const signed: Array<{ bucket: string; path: string; ttlSec: number }> = [];
  const removes: Array<{ bucket: string; paths: string[] }> = [];
  let uploadCount = 0;
  let signCount = 0;
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
            uploadOptions?: { contentType?: string },
          ) => {
            uploadCount++;
            uploads.push({
              bucket,
              path,
              contentType: uploadOptions?.contentType,
              byteLength: body.length,
            });
            if (uploadCount === storageOpts.failUploadAt) {
              return { data: null, error: { message: 'upload failed' } };
            }
            return { data: { path }, error: null };
          },
          createSignedUrl: async (path: string, ttlSec: number) => {
            signCount++;
            signed.push({ bucket, path, ttlSec });
            if (signCount === storageOpts.failSignAt) {
              return { data: null, error: { message: 'sign failed' } };
            }
            return {
              data: { signedUrl: `https://signed.test/${path}?token=sig` },
              error: null,
            };
          },
          remove: async (paths: string[]) => {
            removes.push({ bucket, paths });
            return { data: [], error: null };
          },
        };
      },
    },
  } as unknown as SupabaseClient;
  return { client, uploads, signed, removes };
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

function buildApp(deps: {
  renderer: PptxRenderer;
  fetchFn?: typeof fetch;
  storageOpts?: { failUploadAt?: number; failSignAt?: number };
}) {
  const fake = fakeSupabase(deps.storageOpts);
  const fetchFn =
    deps.fetchFn ??
    ((async () =>
      new Response(Uint8Array.from(PPTX_BYTES), {
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
      storagePath: fake.uploads[0]!.path,
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

  it('rejects a 25-slide archive before invoking LibreOffice', async () => {
    const { renderer, calls } = fakeRenderer([
      { widthPx: 2048, heightPx: 1152 },
    ]);
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(Uint8Array.from(pptxBytes(25)), {
        status: 200,
        headers: {
          'content-type':
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        },
      }),
    );
    const { app, fake } = buildApp({
      renderer,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const res = await postRender(app, VALID_FILE_URL);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('too_many_pages');
    expect(calls).toHaveLength(0);
    expect(fake.uploads).toHaveLength(0);
  });

  it('rejects bytes without the required PPTX OOXML entries before rendering', async () => {
    const { renderer, calls } = fakeRenderer([
      { widthPx: 2048, heightPx: 1152 },
    ]);
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(Uint8Array.from(zipWithEntries(['word/document.xml'])), {
        status: 200,
      }),
    );
    const { app } = buildApp({
      renderer,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const res = await postRender(app, VALID_FILE_URL);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_pptx');
    expect(calls).toHaveLength(0);
  });

  it('prechecks Content-Length and cancels an oversized body before rendering', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { 'content-length': String(REVIEW_PPTX_MAX_BYTES + 1) },
      }),
    );
    const { renderer, calls } = fakeRenderer([
      { widthPx: 2048, heightPx: 1152 },
    ]);
    const { app } = buildApp({
      renderer,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const res = await postRender(app, VALID_FILE_URL);

    expect(res.status).toBe(413);
    expect(res.body.error).toBe('pptx_too_large');
    expect(cancelled).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('cancels a streamed body as soon as it crosses the byte cap', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let emitted = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        emitted++;
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchFn = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    const { renderer, calls } = fakeRenderer([
      { widthPx: 2048, heightPx: 1152 },
    ]);
    const { app } = buildApp({
      renderer,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const res = await postRender(app, VALID_FILE_URL);

    expect(res.status).toBe(413);
    expect(res.body.error).toBe('pptx_too_large');
    expect(emitted).toBeGreaterThanOrEqual(51);
    expect(emitted).toBeLessThanOrEqual(52);
    expect(cancelled).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('removes prior page uploads when a later upload fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { renderer } = fakeRenderer([
      { widthPx: 2048, heightPx: 1152 },
      { widthPx: 2048, heightPx: 1152 },
    ]);
    const { app, fake } = buildApp({
      renderer,
      storageOpts: { failUploadAt: 2 },
    });

    const res = await postRender(app, VALID_FILE_URL);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('page_upload_failed');
    expect(fake.removes).toEqual([
      { bucket: 'poster-assets', paths: [fake.uploads[0]!.path] },
    ]);
  });

  it('removes all uploaded pages when signing a later page fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { renderer } = fakeRenderer([
      { widthPx: 2048, heightPx: 1152 },
      { widthPx: 2048, heightPx: 1152 },
    ]);
    const { app, fake } = buildApp({
      renderer,
      storageOpts: { failSignAt: 2 },
    });

    const res = await postRender(app, VALID_FILE_URL);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('page_upload_failed');
    expect(fake.removes).toEqual([
      {
        bucket: 'poster-assets',
        paths: [fake.uploads[0]!.path, fake.uploads[1]!.path],
      },
    ]);
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
