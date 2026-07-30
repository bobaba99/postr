/**
 * Deterministic ingest guards (spec §3) — the pre-model checks that
 * reject bad input with typed errors before any page is rendered,
 * uploaded, or charged for. Exact typed-error kinds and the D15 copy
 * (names the workflow, never "AI") are pinned here.
 */
import { describe, it, expect } from 'vitest';
import {
  IngestError,
  INGEST_ALLOWED_MIME,
  INGEST_MAX_FILE_BYTES,
  INGEST_MAX_PAGES,
} from '../types';
import { assertFileAllowed, assertPageCap, isCanvasBlank } from '../guards';

/** RGBA pixel buffer helper — w×h pixels painted by `paint` (white default). */
function makePixels(
  w: number,
  h: number,
  paint: (x: number, y: number) => [number, number, number] = () => [255, 255, 255],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return data;
}

describe('ingest constants (contract with Tasks 21–23)', () => {
  it('pins the page cap, size cap, and MIME allowlist', () => {
    expect(INGEST_MAX_PAGES).toBe(24);
    expect(INGEST_MAX_FILE_BYTES).toBe(50 * 1024 * 1024);
    expect(INGEST_ALLOWED_MIME).toEqual([
      'application/pdf',
      'image/png',
      'image/jpeg',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ]);
  });
});

describe('IngestError', () => {
  it('is an Error with a machine-readable kind', () => {
    const err = new IngestError('msg', 'blank-render');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(IngestError);
    expect(err.name).toBe('IngestError');
    expect(err.kind).toBe('blank-render');
    expect(err.message).toBe('msg');
  });
});

describe('assertPageCap', () => {
  it('accepts exactly INGEST_MAX_PAGES pages', () => {
    expect(() => assertPageCap(INGEST_MAX_PAGES)).not.toThrow();
    expect(() => assertPageCap(1)).not.toThrow();
  });

  it('rejects over the cap with the D15 trim message', () => {
    let caught: unknown;
    try {
      assertPageCap(INGEST_MAX_PAGES + 1);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(IngestError);
    expect((caught as IngestError).kind).toBe('too-many-pages');
    expect((caught as IngestError).message).toBe(
      'That file has 25 pages — the checker reads up to 24. Trim it and try again.',
    );
  });
});

describe('assertFileAllowed', () => {
  it('accepts every allowlisted MIME type', () => {
    for (const type of INGEST_ALLOWED_MIME) {
      expect(() => assertFileAllowed({ size: 1, type })).not.toThrow();
    }
  });

  it('rejects a non-allowlisted MIME type with the unreadable copy', () => {
    let caught: unknown;
    try {
      assertFileAllowed({ size: 1, type: 'image/gif' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(IngestError);
    expect((caught as IngestError).kind).toBe('unsupported-mime');
    expect((caught as IngestError).message).toBe(
      "We couldn't read that file. Try exporting it as a PDF and upload that instead.",
    );
  });

  it('accepts a file at exactly the size cap, rejects one byte over', () => {
    expect(() =>
      assertFileAllowed({ size: INGEST_MAX_FILE_BYTES, type: 'image/png' }),
    ).not.toThrow();
    let caught: unknown;
    try {
      assertFileAllowed({ size: INGEST_MAX_FILE_BYTES + 1, type: 'image/png' });
    } catch (err) {
      caught = err;
    }
    expect((caught as IngestError).kind).toBe('file-too-large');
  });

  it('checks size before MIME (oversized beats unsupported)', () => {
    let caught: unknown;
    try {
      assertFileAllowed({ size: INGEST_MAX_FILE_BYTES + 1, type: 'image/gif' });
    } catch (err) {
      caught = err;
    }
    expect((caught as IngestError).kind).toBe('file-too-large');
  });

  it('honors a caller-narrowed MIME list', () => {
    expect(() =>
      assertFileAllowed({ size: 1024, type: 'image/png' }, ['image/png', 'image/jpeg']),
    ).not.toThrow();
    let caught: unknown;
    try {
      assertFileAllowed({ size: 1, type: 'application/pdf' }, ['image/png', 'image/jpeg']);
    } catch (err) {
      caught = err;
    }
    expect((caught as IngestError).kind).toBe('unsupported-mime');
  });
});

describe('isCanvasBlank', () => {
  it('treats an all-white render as blank', () => {
    expect(isCanvasBlank({ data: makePixels(16, 16) })).toBe(true);
  });

  it('treats any near-uniform color as blank (all-black, flat gray, solid red)', () => {
    expect(isCanvasBlank({ data: makePixels(16, 16, () => [0, 0, 0]) })).toBe(true);
    expect(isCanvasBlank({ data: makePixels(16, 16, () => [250, 250, 250]) })).toBe(true);
    expect(isCanvasBlank({ data: makePixels(16, 16, () => [255, 0, 0]) })).toBe(true);
  });

  it('tolerates JPEG-level noise within the ±8 channel range', () => {
    const noisy = makePixels(16, 16, (x) => [255, 255 - (x % 3), 255 - (x % 2)]);
    expect(isCanvasBlank({ data: noisy })).toBe(true);
  });

  it('flags a single dark pixel as content (stride covers small images)', () => {
    const data = makePixels(16, 16, (x, y) =>
      x === 8 && y === 8 ? [20, 20, 20] : [255, 255, 255],
    );
    expect(isCanvasBlank({ data })).toBe(false);
  });

  it('flags a real gradient as content', () => {
    const gradient = makePixels(64, 4, (x) => [
      Math.round((x / 63) * 250),
      128,
      255 - Math.round((x / 63) * 250),
    ]);
    expect(isCanvasBlank({ data: gradient })).toBe(false);
  });

  it('treats an empty buffer as blank', () => {
    expect(isCanvasBlank({ data: new Uint8ClampedArray(0) })).toBe(true);
  });

  it('treats a large uniform render as blank (sampling stride > 1)', () => {
    expect(isCanvasBlank({ data: makePixels(200, 200) })).toBe(true);
  });

  it('samples no more than 1024 pixels from a large render', () => {
    let channelReads = 0;
    const pixels = new Uint8ClampedArray(2047 * 4);
    const observedPixels = new Proxy(pixels, {
      get(target, property) {
        if (typeof property === 'string' && /^\d+$/.test(property)) {
          channelReads += 1;
        }
        return Reflect.get(target, property, target);
      },
    });

    expect(isCanvasBlank({ data: observedPixels })).toBe(true);
    expect(channelReads).toBeLessThanOrEqual(1024 * 3);
  });
});
