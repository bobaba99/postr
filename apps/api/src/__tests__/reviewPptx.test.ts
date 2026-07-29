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
    { widthPx: 2550, heightPx: 3300 },
    { widthPx: 2550, heightPx: 3300 },
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
}

function zipWithEntries(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name);
    const flags = entry.flags ?? 0;
    const method = entry.compressionMethod ?? 0;
    const compressedBytes = entry.compressedBytes ?? 0;
    const uncompressedBytes = entry.uncompressedBytes ?? 0;
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(compressedBytes, 18);
    local.writeUInt32LE(uncompressedBytes, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    nameBytes.copy(local, 30);
    localParts.push(local);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(compressedBytes, 20);
    central.writeUInt32LE(uncompressedBytes, 24);
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
    { name: '[Content_Types].xml', ...overrides },
    { name: 'ppt/presentation.xml', ...overrides },
    { name: 'ppt/slides/slide1.xml', ...overrides },
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
    expect(pages[0]).toMatchObject({ widthPx: 2550, heightPx: 3300 });
    expect(pages[0]!.jpeg.equals(fakeJpeg(2550, 3300))).toBe(true);

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
  it('rejects encrypted ZIP entries', () => {
    const pptx = zipWithEntries(requiredPptxEntries({ flags: 0x0001 }));

    expect(() => inspectPptxArchive(pptx, 24)).toThrow(/encrypted/i);
  });

  it('rejects ZIP entries using unsupported compression methods', () => {
    const pptx = zipWithEntries(
      requiredPptxEntries({ compressionMethod: 12 }),
    );

    expect(() => inspectPptxArchive(pptx, 24)).toThrow(
      /compression method 12/i,
    );
  });

  it('rejects archives whose declared uncompressed total exceeds the cap', () => {
    const pptx = zipWithEntries(
      requiredPptxEntries({
        compressionMethod: 8,
        compressedBytes: 20,
        uncompressedBytes: 60,
      }),
    );

    expect(() =>
      inspectPptxArchive(pptx, 24, {
        maxUncompressedBytes: 179,
        maxCompressionRatio: 100,
      }),
    ).toThrow(/uncompressed.*179 bytes/i);
  });

  it('rejects entries whose declared compression ratio exceeds the cap', () => {
    const entries = requiredPptxEntries();
    entries[2] = {
      ...entries[2]!,
      compressionMethod: 8,
      compressedBytes: 1,
      uncompressedBytes: 101,
    };
    const pptx = zipWithEntries(entries);

    expect(() =>
      inspectPptxArchive(pptx, 24, {
        maxUncompressedBytes: 1000,
        maxCompressionRatio: 100,
      }),
    ).toThrow(/compression ratio.*100/i);
  });
});
