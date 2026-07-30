/**
 * review/pptx.ts — the LibreOffice PptxRenderer. A fake execFileFn stands
 * in for soffice/pdftoppm (no real LibreOffice in CI): it captures argv,
 * verifies the input file was actually written, and materializes the page
 * JPEGs pdftoppm would produce. Asserts the page-order read-back, the
 * SOF0 dimension parse, and the finally-cleanup of the temp dir.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmod, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';
import {
  createLibreOfficeRenderer,
  inspectPptxArchive,
  type ExecFileFn,
} from '../review/pptx.js';

/** Minimal JPEG carrying real SOF0 dimensions (what the parser reads). */
function fakeJpeg(
  widthPx: number,
  heightPx: number,
  byteLength?: number,
): Buffer {
  const header = Buffer.from([
    0xff, 0xd8, // SOI
    0xff, 0xc0, // SOF0
    0x00, 0x11, // segment length
    0x08, // precision
    (heightPx >> 8) & 0xff, heightPx & 0xff,
    (widthPx >> 8) & 0xff, widthPx & 0xff,
  ]);
  if (byteLength === undefined || byteLength <= header.length) return header;
  return Buffer.concat([header, Buffer.alloc(byteLength - header.length)]);
}

interface ExecCall {
  file: string;
  args: string[];
}

function fakeExec(
  opts: {
    pages?: Array<{
      widthPx: number;
      heightPx: number;
      byteLength?: number;
    }>;
    failOn?: 'soffice' | 'pdftoppm';
  } = {},
) {
  const calls: ExecCall[] = [];
  const pages = opts.pages ?? [
    { widthPx: 1582, heightPx: 2048 },
    { widthPx: 1582, heightPx: 2048 },
  ];
  let sawInputBytes: Buffer | null = null;
  const execFileFn: ExecFileFn = async (file, args) => {
    calls.push({ file, args });
    if (calls.length === 1) {
      // soffice --headless --convert-to pdf --outdir <dir> <in>
      if (opts.failOn === 'soffice') throw new Error('soffice crashed');
      const outDir = args[args.indexOf('--outdir') + 1]!;
      const inPath = args[args.length - 1]!;
      sawInputBytes = await readFile(inPath); // proves the pptx was written
      await writeFile(join(outDir, 'deck.pdf'), sawInputBytes);
    } else {
      // pdftoppm -jpeg -r 150 <pdf> <outPrefix>
      if (opts.failOn === 'pdftoppm') throw new Error('pdftoppm crashed');
      const outPrefix = args[args.length - 1]!;
      for (let i = 0; i < pages.length; i++) {
        await writeFile(
          `${outPrefix}-${i + 1}.jpg`,
          fakeJpeg(
            pages[i]!.widthPx,
            pages[i]!.heightPx,
            pages[i]!.byteLength,
          ),
        );
      }
    }
    return { stdout: '', stderr: '' };
  };
  return { execFileFn, calls, getSawInputBytes: () => sawInputBytes };
}

interface ZipEntry {
  name: string;
  flags?: number;
  compressionMethod?: number;
  compressedBytes?: number;
  uncompressedBytes?: number;
  data?: Buffer;
  compressedData?: Buffer;
  crc?: number;
  localName?: string;
  localFlags?: number;
  localCompressionMethod?: number;
  localCompressedBytes?: number;
  localUncompressedBytes?: number;
  localCrc?: number;
}

function zipWithEntries(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const data = entry.data ?? Buffer.alloc(0);
    const nameBytes = Buffer.from(entry.name);
    const localNameBytes = Buffer.from(entry.localName ?? entry.name);
    const flags = entry.flags ?? 0;
    const method = entry.compressionMethod ?? 0;
    const compressedData =
      entry.compressedData ??
      (method === 8 ? deflateRawSync(data) : Buffer.from(data));
    const compressedBytes = entry.compressedBytes ?? compressedData.length;
    const uncompressedBytes = entry.uncompressedBytes ?? data.length;
    const expectedCrc = entry.crc ?? crc32(data);
    const localFlags = entry.localFlags ?? flags;
    const localMethod = entry.localCompressionMethod ?? method;
    const localCompressedBytes =
      entry.localCompressedBytes ?? compressedBytes;
    const localUncompressedBytes =
      entry.localUncompressedBytes ?? uncompressedBytes;
    const localCrc = entry.localCrc ?? expectedCrc;
    const local = Buffer.alloc(30 + localNameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(localFlags, 6);
    local.writeUInt16LE(localMethod, 8);
    local.writeUInt32LE(localCrc, 14);
    local.writeUInt32LE(localCompressedBytes, 18);
    local.writeUInt32LE(localUncompressedBytes, 22);
    local.writeUInt16LE(localNameBytes.length, 26);
    localNameBytes.copy(local, 30);
    localParts.push(local, compressedData);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(expectedCrc, 16);
    central.writeUInt32LE(compressedBytes, 20);
    central.writeUInt32LE(uncompressedBytes, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(localOffset, 42);
    nameBytes.copy(central, 46);
    centralParts.push(central);
    localOffset += local.length + compressedData.length;
  }
  const locals = Buffer.concat(localParts);
  const central = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(locals.length, 16);
  return Buffer.concat([locals, central, eocd]);
}

function requiredPptxEntries(
  overrides: Partial<ZipEntry> = {},
): ZipEntry[] {
  return [
    {
      name: '[Content_Types].xml',
      data: Buffer.from('<Types/>'),
      ...overrides,
    },
    {
      name: 'ppt/presentation.xml',
      data: Buffer.from('<p:presentation/>'),
      ...overrides,
    },
    {
      name: 'ppt/slides/slide1.xml',
      data: Buffer.from('<p:sld/>'),
      ...overrides,
    },
  ];
}

let workDir: string;
beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'pptx-test-'));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('createLibreOfficeRenderer', () => {
  it('runs soffice → pdftoppm and reads the page JPEGs back in order with dimensions', async () => {
    const fake = fakeExec();
    const renderer = createLibreOfficeRenderer({
      sofficePath: '/usr/bin/soffice',
      pdftoppmPath: '/usr/bin/pdftoppm',
      workDir,
      execFileFn: fake.execFileFn,
    });

    const pages = await renderer.render(Buffer.from('fake-pptx-bytes'));

    // argv: the conversion pipeline as deployed (D10)
    expect(fake.calls).toHaveLength(2);
    const [soffice, pdftoppm] = fake.calls;
    expect(soffice!.file).toBe('/usr/bin/soffice');
    expect(soffice!.args.slice(0, 4)).toEqual([
      '--headless',
      '--convert-to',
      'pdf',
      '--outdir',
    ]);
    const dir = soffice!.args[4]!;
    expect(dir.startsWith(workDir)).toBe(true);
    expect(soffice!.args[5]).toBe(join(dir, 'deck.pptx'));
    expect(pdftoppm!.file).toBe('/usr/bin/pdftoppm');
    expect(pdftoppm!.args).toEqual([
      '-jpeg',
      '-r',
      '150',
      '-scale-to',
      '2048',
      '-f',
      '1',
      '-l',
      '25',
      join(dir, 'deck.pdf'),
      join(dir, 'page'),
    ]);

    // the input bytes were really written to the temp dir for soffice
    expect(fake.getSawInputBytes()?.toString()).toBe('fake-pptx-bytes');

    // pages come back in page order, with SOF0-parsed dimensions
    expect(pages.map((p) => p.pageNumber)).toEqual([1, 2]);
    expect(pages[0]).toMatchObject({ widthPx: 1582, heightPx: 2048 });
    expect(pages[0]!.jpeg.equals(fakeJpeg(1582, 2048))).toBe(true);

    // finally-cleanup removed the whole temp dir
    expect(existsSync(dir)).toBe(false);
  });

  it('cleans the temp dir even when conversion fails', async () => {
    const fake = fakeExec({ failOn: 'pdftoppm' });
    const renderer = createLibreOfficeRenderer({
      sofficePath: '/usr/bin/soffice',
      pdftoppmPath: '/usr/bin/pdftoppm',
      workDir,
      execFileFn: fake.execFileFn,
    });

    await expect(renderer.render(Buffer.from('x'))).rejects.toThrow(
      'pdftoppm crashed',
    );
    const dir = fake.calls[0]!.args[4]!;
    expect(existsSync(dir)).toBe(false);
  });

  it('returns an empty page list when pdftoppm produced nothing (the route turns it into a 502)', async () => {
    const fake = fakeExec({ pages: [] });
    const renderer = createLibreOfficeRenderer({
      workDir,
      execFileFn: fake.execFileFn,
    });
    await expect(renderer.render(Buffer.from('x'))).resolves.toEqual([]);
  });

  it('rejects a rendered JPEG whose file size exceeds the per-page cap', async () => {
    const fake = fakeExec({
      pages: [{ widthPx: 100, heightPx: 100, byteLength: 33 }],
    });
    const renderer = createLibreOfficeRenderer({
      workDir,
      execFileFn: fake.execFileFn,
      maxRenderedPageBytes: 32,
      maxRenderedTotalBytes: 64,
    });

    await expect(renderer.render(Buffer.from('x'))).rejects.toThrow(
      /page-1\.jpg.*32 bytes/,
    );
  });

  it('rejects rendered JPEGs whose aggregate file size exceeds the cap', async () => {
    const fake = fakeExec({
      pages: [
        { widthPx: 100, heightPx: 100, byteLength: 20 },
        { widthPx: 100, heightPx: 100, byteLength: 20 },
      ],
    });
    const renderer = createLibreOfficeRenderer({
      workDir,
      execFileFn: fake.execFileFn,
      maxRenderedPageBytes: 32,
      maxRenderedTotalBytes: 39,
    });

    await expect(renderer.render(Buffer.from('x'))).rejects.toThrow(
      /aggregate.*39 bytes/,
    );
  });

  it('rejects a rendered JPEG whose width or height exceeds the dimension cap', async () => {
    const fake = fakeExec({
      pages: [{ widthPx: 1201, heightPx: 100 }],
    });
    const renderer = createLibreOfficeRenderer({
      workDir,
      execFileFn: fake.execFileFn,
      maxRenderedDimensionPx: 1200,
      maxRenderedPixels: 1_000_000,
    });

    await expect(renderer.render(Buffer.from('x'))).rejects.toThrow(
      /1201x100.*1200px/,
    );
  });

  it('enforces the 2048px vision ceiling on rendered slides by default', async () => {
    const fake = fakeExec({
      pages: [{ widthPx: 2049, heightPx: 100 }],
    });
    const renderer = createLibreOfficeRenderer({
      workDir,
      execFileFn: fake.execFileFn,
    });

    await expect(renderer.render(Buffer.from('x'))).rejects.toThrow(
      /2049x100.*2048px/,
    );
  });

  it('rejects a rendered JPEG whose decoded pixel area exceeds the cap', async () => {
    const fake = fakeExec({
      pages: [{ widthPx: 101, heightPx: 100 }],
    });
    const renderer = createLibreOfficeRenderer({
      workDir,
      execFileFn: fake.execFileFn,
      maxRenderedDimensionPx: 1000,
      maxRenderedPixels: 10_000,
    });

    await expect(renderer.render(Buffer.from('x'))).rejects.toThrow(
      /10100 pixels.*10000/,
    );
  });

  it('kills a default subprocess that exceeds the configured hard timeout', async () => {
    const sleeper = join(workDir, 'sleep.sh');
    await writeFile(sleeper, '#!/bin/sh\nexec sleep 1\n');
    await chmod(sleeper, 0o755);
    const renderer = createLibreOfficeRenderer({
      sofficePath: sleeper,
      pdftoppmPath: sleeper,
      workDir,
      processTimeoutMs: 20,
    });

    await expect(renderer.render(Buffer.from('x'))).rejects.toMatchObject({
      killed: true,
      signal: 'SIGKILL',
    });
  });
});

describe('inspectPptxArchive', () => {
  it('accepts a structurally valid archive after streaming every entry', async () => {
    const pptx = zipWithEntries(
      requiredPptxEntries({ compressionMethod: 8 }),
    );

    await expect(inspectPptxArchive(pptx, 24)).resolves.toEqual({
      slideCount: 1,
    });
  });

  it('rejects encrypted ZIP entries', async () => {
    const pptx = zipWithEntries(requiredPptxEntries({ flags: 0x0001 }));

    await expect(inspectPptxArchive(pptx, 24)).rejects.toThrow(/encrypted/i);
  });

  it('rejects ZIP entries using unsupported compression methods', async () => {
    const pptx = zipWithEntries(
      requiredPptxEntries({ compressionMethod: 12 }),
    );

    await expect(inspectPptxArchive(pptx, 24)).rejects.toThrow(
      /compression method 12/i,
    );
  });

  it('rejects archives whose declared uncompressed total exceeds the cap', async () => {
    const pptx = zipWithEntries(
      requiredPptxEntries({
        compressionMethod: 8,
        compressedBytes: 20,
        uncompressedBytes: 60,
      }),
    );

    await expect(
      inspectPptxArchive(pptx, 24, {
        maxUncompressedBytes: 179,
        maxCompressionRatio: 100,
      }),
    ).rejects.toThrow(/uncompressed.*179 bytes/i);
  });

  it('rejects entries whose declared compression ratio exceeds the cap', async () => {
    const entries = requiredPptxEntries();
    entries[2] = {
      ...entries[2]!,
      compressionMethod: 8,
      compressedBytes: 1,
      uncompressedBytes: 101,
    };
    const pptx = zipWithEntries(entries);

    await expect(
      inspectPptxArchive(pptx, 24, {
        maxUncompressedBytes: 1000,
        maxCompressionRatio: 100,
      }),
    ).rejects.toThrow(/compression ratio.*100/i);
  });

  it('rejects forged central and local sizes using actual streamed output', async () => {
    const entries = requiredPptxEntries({ compressionMethod: 8 });
    entries[2] = {
      ...entries[2]!,
      data: Buffer.alloc(4096, 0x41),
      uncompressedBytes: 1,
      localUncompressedBytes: 1,
    };
    const pptx = zipWithEntries(entries);

    await expect(
      inspectPptxArchive(pptx, 24, {
        maxUncompressedBytes: 128,
        maxCompressionRatio: 10_000,
      }),
    ).rejects.toThrow(/actual.*uncompressed.*128 bytes/i);
  });

  it('rejects forged central and local sizes using the actual compression ratio', async () => {
    const entries = requiredPptxEntries({ compressionMethod: 8 });
    entries[2] = {
      ...entries[2]!,
      data: Buffer.alloc(4096, 0x41),
      uncompressedBytes: 1,
      localUncompressedBytes: 1,
    };
    const pptx = zipWithEntries(entries);

    await expect(
      inspectPptxArchive(pptx, 24, {
        maxUncompressedBytes: 10_000,
        maxCompressionRatio: 10,
      }),
    ).rejects.toThrow(/actual.*compression ratio.*10/i);
  });

  it('rejects when both central and local compressed and uncompressed sizes are forged', async () => {
    const entries = requiredPptxEntries({ compressionMethod: 8 });
    entries[2] = {
      ...entries[2]!,
      data: Buffer.alloc(4096, 0x41),
      compressedBytes: 1,
      localCompressedBytes: 1,
      uncompressedBytes: 1,
      localUncompressedBytes: 1,
    };
    const pptx = zipWithEntries(entries);

    await expect(inspectPptxArchive(pptx, 24)).rejects.toThrow(
      /local entry layout|unexpected data/i,
    );
  });

  it('rejects CRC corruption even when local and central metadata agree', async () => {
    const pptx = zipWithEntries(
      requiredPptxEntries({
        compressionMethod: 8,
        crc: 0xdeadbeef,
        localCrc: 0xdeadbeef,
      }),
    );

    await expect(inspectPptxArchive(pptx, 24)).rejects.toThrow(/CRC/i);
  });

  it('rejects malformed deflate streams', async () => {
    const entries = requiredPptxEntries({ compressionMethod: 8 });
    entries[2] = {
      ...entries[2]!,
      compressedData: Buffer.from([0xff, 0xff, 0xff, 0xff]),
    };
    const pptx = zipWithEntries(entries);

    await expect(inspectPptxArchive(pptx, 24)).rejects.toThrow(
      /malformed deflated/i,
    );
  });

  it('rejects data descriptors before decompression', async () => {
    const pptx = zipWithEntries(requiredPptxEntries({ flags: 0x0008 }));

    await expect(inspectPptxArchive(pptx, 24)).rejects.toThrow(
      /data descriptor/i,
    );
  });

  it('rejects mismatched local and central entry metadata', async () => {
    const pptx = zipWithEntries(
      requiredPptxEntries({
        compressionMethod: 8,
        localCompressionMethod: 0,
      }),
    );

    await expect(inspectPptxArchive(pptx, 24)).rejects.toThrow(
      /local.*central.*metadata/i,
    );
  });
});
