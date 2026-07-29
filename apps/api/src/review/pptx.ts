/**
 * Server-side PPTX → page-image renderer (D10, spec §6.2.2).
 *
 * The client uploads a .pptx to Supabase Storage; /api/review/render-pptx
 * re-fetches it through the SSRF guard and hands the bytes here. The
 * reference implementation shells out to LibreOffice headless (soffice
 * --convert-to pdf) + poppler (pdftoppm -jpeg -r 150) in a per-request
 * temp dir that is always removed in a `finally`.
 *
 * OPS NOTE: Render's native Node image has neither soffice nor pdftoppm.
 * Deploy the API as a Docker-based service with `libreoffice-impress` +
 * `poppler-utils` installed, or swap in a hosted-convert PptxRenderer
 * behind this same interface — PPTX ships last (spec §6.2.2), so it
 * never blocks the other input kinds.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** One rendered slide: the JPEG bytes plus their pixel dimensions. */
export interface RenderedPage {
  pageNumber: number;
  jpeg: Buffer;
  widthPx: number;
  heightPx: number;
}

/** The render seam the route depends on — swap implementations freely. */
export interface PptxRenderer {
  render(pptx: Buffer): Promise<RenderedPage[]>;
}

/** Narrow execFile surface (injectable for tests — no real LibreOffice). */
export type ExecFileFn = (
  file: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>;

const execFileAsync: ExecFileFn = async (file, args) => {
  const { stdout, stderr } = await promisify(execFile)(file, args, {
    maxBuffer: 16 * 1024 * 1024,
  });
  return { stdout: String(stdout), stderr: String(stderr) };
};

export interface LibreOfficeRendererOptions {
  /** Path/name of the LibreOffice binary (default 'soffice'). */
  sofficePath?: string;
  /** Path/name of the poppler binary (default 'pdftoppm'). */
  pdftoppmPath?: string;
  /** Parent dir for per-request temp dirs (default os.tmpdir()). */
  workDir?: string;
  /** Injectable process runner for tests. */
  execFileFn?: ExecFileFn;
}

export function createLibreOfficeRenderer(
  opts: LibreOfficeRendererOptions = {},
): PptxRenderer {
  const sofficePath = opts.sofficePath ?? 'soffice';
  const pdftoppmPath = opts.pdftoppmPath ?? 'pdftoppm';
  const workDir = opts.workDir ?? tmpdir();
  const execFileFn = opts.execFileFn ?? execFileAsync;

  return {
    async render(pptx: Buffer): Promise<RenderedPage[]> {
      const dir = await mkdtemp(join(workDir, 'postr-pptx-'));
      try {
        const inPath = join(dir, 'deck.pptx');
        await writeFile(inPath, pptx);

        // PPTX → PDF (LibreOffice headless; writes deck.pdf into --outdir).
        await execFileFn(sofficePath, [
          '--headless',
          '--convert-to',
          'pdf',
          '--outdir',
          dir,
          inPath,
        ]);

        // PDF → one JPEG per slide at 150 DPI (page-1.jpg, page-2.jpg, …).
        const outPrefix = join(dir, 'page');
        await execFileFn(pdftoppmPath, [
          '-jpeg',
          '-r',
          '150',
          join(dir, 'deck.pdf'),
          outPrefix,
        ]);

        const names = (await readdir(dir))
          .filter((n) => /^page-\d+\.jpg$/.test(n))
          .sort((a, b) => pageNumberOf(a) - pageNumberOf(b));
        const pages: RenderedPage[] = [];
        for (const [index, name] of names.entries()) {
          const jpeg = await readFile(join(dir, name));
          const { widthPx, heightPx } = jpegDimensions(jpeg);
          pages.push({ pageNumber: index + 1, jpeg, widthPx, heightPx });
        }
        return pages;
      } finally {
        // Always scrub the temp dir — pptx bytes and renders are user data.
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}

/** pdftoppm zero-pads page numbers to the deck's digit width (page-1 … page-24). */
function pageNumberOf(name: string): number {
  return Number(name.slice('page-'.length, -'.jpg'.length));
}

/**
 * Read pixel dimensions from a JPEG's SOF segment. No dependency needed:
 * after the SOI marker a JPEG is length-prefixed segments; the SOF
 * segment (FFC0–FFCF except C4/C8/CC) carries height/width as big-endian
 * u16s at segment offsets 5 and 7.
 */
function jpegDimensions(buf: Buffer): { widthPx: number; heightPx: number } {
  let off = 2; // skip SOI (FF D8)
  // Need 9 readable bytes from off: marker(2) + length(2) + precision(1)
  // + height(2) + width(2) — the highest index read is off + 8.
  while (off + 9 <= buf.length) {
    if (buf[off] !== 0xff) break;
    const marker = buf[off + 1]!;
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      return {
        heightPx: buf.readUInt16BE(off + 5),
        widthPx: buf.readUInt16BE(off + 7),
      };
    }
    const segmentLength = buf.readUInt16BE(off + 2);
    off += 2 + segmentLength;
  }
  throw new Error('pptx render: unreadable JPEG dimensions');
}
