/**
 * Shared asset resolver — injectable fetcher keeps these tests off
 * the network and away from Supabase entirely.
 */
import { describe, expect, it } from 'vitest';
import type { Block, PosterDoc } from '@postr/shared';
import { DEFAULT_HEADING_STYLE, DEFAULT_PALETTE, DEFAULT_STYLES } from '@/poster/constants';
import { mimeFromExt, resolvePosterAssets, sniffExt } from '../resolveAssets';

/** 1×1 transparent PNG. */
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_B64}`;

const imageBlock = (id: string, imageSrc: string | null): Block => ({
  id,
  type: 'image',
  x: 0,
  y: 0,
  w: 100,
  h: 80,
  content: '',
  imageSrc,
  imageFit: 'contain',
  tableData: null,
});

const docWith = (blocks: Block[]): PosterDoc => ({
  version: 1,
  widthIn: 48,
  heightIn: 36,
  blocks,
  fontFamily: 'Source Sans 3',
  palette: DEFAULT_PALETTE,
  styles: DEFAULT_STYLES,
  headingStyle: DEFAULT_HEADING_STYLE,
  institutions: [],
  authors: [],
  references: [],
});

describe('resolvePosterAssets', () => {
  it('decodes data: URLs with the default fetcher', async () => {
    const { assets, missing } = await resolvePosterAssets(
      docWith([imageBlock('img1', TINY_PNG_DATA_URL)]),
    );
    expect(missing).toEqual([]);
    const asset = assets.get('img1');
    expect(asset?.ext).toBe('png');
    expect(asset?.mime).toBe('image/png');
    expect(asset?.bytes.slice(0, 4)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  });

  it('uses an injected fetcher and sniffs the format from bytes', async () => {
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const { assets } = await resolvePosterAssets(
      docWith([imageBlock('img1', 'storage://user/poster/whatever.bin')]),
      async () => jpegBytes,
    );
    expect(assets.get('img1')?.ext).toBe('jpg');
    expect(assets.get('img1')?.mime).toBe('image/jpeg');
  });

  it('reports failed resolutions in missing without aborting', async () => {
    const png = Uint8Array.from(atob(TINY_PNG_B64), (c) => c.charCodeAt(0));
    const { assets, missing } = await resolvePosterAssets(
      docWith([imageBlock('ok', 'storage://a/ok.png'), imageBlock('gone', 'storage://a/gone.png')]),
      async (src) => (src.includes('ok') ? png : null),
    );
    expect(assets.has('ok')).toBe(true);
    expect(missing).toEqual(['gone']);
  });

  it('ignores blocks without an imageSrc', async () => {
    const { assets, missing } = await resolvePosterAssets(
      docWith([imageBlock('empty', null)]),
      async () => {
        throw new Error('fetcher must not be called');
      },
    );
    expect(assets.size).toBe(0);
    expect(missing).toEqual([]);
  });
});

describe('sniffExt', () => {
  it('detects png / jpg / gif / webp / svg', () => {
    expect(sniffExt(Uint8Array.from(atob(TINY_PNG_B64), (c) => c.charCodeAt(0)))).toBe('png');
    expect(sniffExt(new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('jpg');
    expect(sniffExt(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]))).toBe('gif');
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(sniffExt(webp)).toBe('webp');
    expect(sniffExt(new TextEncoder().encode('<svg xmlns="x"></svg>'))).toBe('svg');
  });

  it('returns null for unknown payloads', () => {
    expect(sniffExt(new TextEncoder().encode('just some text 1234'))).toBeNull();
    expect(sniffExt(new Uint8Array(4))).toBeNull();
  });
});

describe('mimeFromExt', () => {
  it('maps common extensions', () => {
    expect(mimeFromExt('png')).toBe('image/png');
    expect(mimeFromExt('JPG')).toBe('image/jpeg');
    expect(mimeFromExt('svg')).toBe('image/svg+xml');
    expect(mimeFromExt('bin')).toBe('application/octet-stream');
  });
});
