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
  type ExecFileFn,
} from '../review/pptx.js';

/** Minimal JPEG carrying real SOF0 dimensions (what the parser reads). */
function fakeJpeg(widthPx: number, heightPx: number): Buffer {
  return Buffer.from([
    0xff, 0xd8, // SOI
    0xff, 0xc0, // SOF0
    0x00, 0x11, // segment length
    0x08, // precision
    (heightPx >> 8) & 0xff, heightPx & 0xff,
    (widthPx >> 8) & 0xff, widthPx & 0xff,
  ]);
}

interface ExecCall {
  file: string;
  args: string[];
}

function fakeExec(
  opts: {
    pages?: Array<{ widthPx: number; heightPx: number }>;
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
          fakeJpeg(pages[i]!.widthPx, pages[i]!.heightPx),
        );
      }
    }
    return { stdout: '', stderr: '' };
  };
  return { execFileFn, calls, getSawInputBytes: () => sawInputBytes };
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
