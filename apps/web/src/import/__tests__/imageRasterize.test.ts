import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rasterizeImage } from '../imageImport';

const decodeMock = vi.fn(async () => {});
const drawImageMock = vi.fn();

let naturalWidth = 0;
let naturalHeight = 0;
let canvas: HTMLCanvasElement;
let createElementSpy: ReturnType<typeof vi.spyOn>;

class FakeImage {
  src = '';
  get naturalWidth() {
    return naturalWidth;
  }
  get naturalHeight() {
    return naturalHeight;
  }
  decode = decodeMock;
}

function pngFile(width: number, height: number): File {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return Object.assign(new File([bytes], 'poster.png', { type: 'image/png' }), {
    arrayBuffer: vi.fn(async () => bytes.buffer),
  });
}

function jpegFile(width: number, height: number): File {
  const bytes = new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x00,
    0x03,
    0x11,
    0x00,
  ]);
  return Object.assign(new File([bytes], 'poster.jpg', { type: 'image/jpeg' }), {
    arrayBuffer: vi.fn(async () => bytes.buffer),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:poster'),
      revokeObjectURL: vi.fn(),
    }),
  );
  canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: drawImageMock }),
  } as unknown as HTMLCanvasElement;
  const realCreateElement = document.createElement.bind(document);
  createElementSpy = vi
    .spyOn(document, 'createElement')
    .mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      if (tagName === 'canvas') return canvas;
      return realCreateElement(tagName, options);
    }) as typeof document.createElement);
});

afterEach(() => {
  createElementSpy.mockRestore();
  vi.unstubAllGlobals();
});

describe('rasterizeImage review bounds', () => {
  it('draws a large image directly into a bounded canvas', async () => {
    naturalWidth = 4000;
    naturalHeight = 2000;

    const result = await rasterizeImage(pngFile(naturalWidth, naturalHeight), {
      maxDimension: 2048,
      maxSourcePixels: 40_000_000,
    });

    expect(result.canvas.width).toBe(2048);
    expect(result.canvas.height).toBe(1024);
    expect(drawImageMock).toHaveBeenCalledWith(
      expect.any(FakeImage),
      0,
      0,
      2048,
      1024,
    );
  });

  it('rejects a hostile source pixel count before browser decode', async () => {
    naturalWidth = 100_000;
    naturalHeight = 100_000;

    await expect(
      rasterizeImage(pngFile(naturalWidth, naturalHeight), {
        maxDimension: 2048,
        maxSourcePixels: 40_000_000,
      }),
    ).rejects.toThrow('Image dimensions exceed the safe pixel limit.');

    expect(decodeMock).not.toHaveBeenCalled();
  });

  it('applies the pre-decode pixel guard to JPEG headers too', async () => {
    naturalWidth = 50_000;
    naturalHeight = 50_000;

    await expect(
      rasterizeImage(jpegFile(naturalWidth, naturalHeight), {
        maxDimension: 2048,
        maxSourcePixels: 40_000_000,
      }),
    ).rejects.toThrow('Image dimensions exceed the safe pixel limit.');

    expect(decodeMock).not.toHaveBeenCalled();
  });
});
