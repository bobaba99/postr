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
import {
  mkdtemp,
  writeFile,
  readFile,
  readdir,
  rm,
  stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  REVIEW_PPTX_MAX_COMPRESSION_RATIO,
  REVIEW_PPTX_MAX_UNCOMPRESSED_BYTES,
  REVIEW_PPTX_RENDERED_MAX_DIMENSION_PX,
  REVIEW_PPTX_RENDERED_MAX_PIXELS,
  REVIEW_PPTX_RENDERED_PAGE_MAX_BYTES,
  REVIEW_PPTX_RENDERED_TOTAL_MAX_BYTES,
} from './config.js';

const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_FILE_SIGNATURE = 0x02014b50;
const ZIP_EOCD_MIN_BYTES = 22;
const ZIP_MAX_COMMENT_BYTES = 65_535;
const MAX_CENTRAL_DIRECTORY_ENTRIES = 10_000;
const MAX_CENTRAL_DIRECTORY_BYTES = 16 * 1024 * 1024;

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

export class PptxTooLargeError extends Error {
  constructor(
    public readonly actualBytes: number | null,
    public readonly maxBytes: number,
  ) {
    super(
      actualBytes === null
        ? `PPTX response exceeded ${maxBytes} bytes`
        : `PPTX response is ${actualBytes} bytes; maximum is ${maxBytes}`,
    );
    this.name = 'PptxTooLargeError';
  }
}

export class PptxArchiveError extends Error {
  constructor(
    public readonly code: 'invalid_pptx' | 'too_many_pages',
    detail: string,
  ) {
    super(detail);
    this.name = 'PptxArchiveError';
  }
}

export class PptxRenderOutputError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'PptxRenderOutputError';
  }
}

/**
 * Read an HTTP response without ever retaining more than `maxBytes`.
 * Content-Length rejects known-oversized objects without reading; chunked
 * bodies are cancelled as soon as the running total crosses the cap.
 */
export async function readPptxResponse(
  response: Response,
  maxBytes: number,
): Promise<Buffer> {
  const declared = response.headers.get('content-length')?.trim();
  if (declared && /^\d+$/.test(declared)) {
    const declaredBytes = BigInt(declared);
    if (declaredBytes > BigInt(maxBytes)) {
      try {
        await response.body?.cancel();
      } catch {
        // Best effort: the response is rejected regardless.
      }
      const asNumber =
        declaredBytes <= BigInt(Number.MAX_SAFE_INTEGER)
          ? Number(declaredBytes)
          : null;
      throw new PptxTooLargeError(asNumber, maxBytes);
    }
  }

  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      const nextTotal = total + value.byteLength;
      if (nextTotal > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // Best effort: the size failure remains authoritative.
        }
        throw new PptxTooLargeError(nextTotal, maxBytes);
      }
      chunks.push(value);
      total = nextTotal;
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

/**
 * Validate the bounded ZIP central directory without inflating attacker
 * controlled data. A PPTX must contain its OOXML roots and at least one
 * numbered slide; the slide count is known before LibreOffice runs.
 */
export function inspectPptxArchive(
  pptx: Buffer,
  maxSlides: number,
  options: {
    maxUncompressedBytes?: number;
    maxCompressionRatio?: number;
  } = {},
): { slideCount: number } {
  const maxUncompressedBytes =
    options.maxUncompressedBytes ?? REVIEW_PPTX_MAX_UNCOMPRESSED_BYTES;
  const maxCompressionRatio =
    options.maxCompressionRatio ?? REVIEW_PPTX_MAX_COMPRESSION_RATIO;
  const eocdOffset = findEndOfCentralDirectory(pptx);
  if (eocdOffset < 0) {
    throw new PptxArchiveError('invalid_pptx', 'ZIP end-of-central-directory not found');
  }

  const diskNumber = pptx.readUInt16LE(eocdOffset + 4);
  const centralDisk = pptx.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = pptx.readUInt16LE(eocdOffset + 8);
  const totalEntries = pptx.readUInt16LE(eocdOffset + 10);
  const centralSize = pptx.readUInt32LE(eocdOffset + 12);
  const centralOffset = pptx.readUInt32LE(eocdOffset + 16);
  if (
    diskNumber !== 0 ||
    centralDisk !== 0 ||
    entriesOnDisk !== totalEntries ||
    totalEntries === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff
  ) {
    throw new PptxArchiveError(
      'invalid_pptx',
      'Multi-disk and ZIP64 PPTX archives are not supported',
    );
  }
  if (
    totalEntries > MAX_CENTRAL_DIRECTORY_ENTRIES ||
    centralSize > MAX_CENTRAL_DIRECTORY_BYTES
  ) {
    throw new PptxArchiveError('invalid_pptx', 'PPTX central directory is too large');
  }

  const centralEnd = centralOffset + centralSize;
  if (
    centralOffset < 0 ||
    centralEnd > eocdOffset ||
    centralEnd !== eocdOffset
  ) {
    throw new PptxArchiveError('invalid_pptx', 'PPTX central directory bounds are invalid');
  }

  const names = new Set<string>();
  let cursor = centralOffset;
  let totalCompressedBytes = 0;
  let totalUncompressedBytes = 0;
  for (let index = 0; index < totalEntries; index++) {
    if (
      cursor + 46 > centralEnd ||
      pptx.readUInt32LE(cursor) !== ZIP_CENTRAL_FILE_SIGNATURE
    ) {
      throw new PptxArchiveError('invalid_pptx', 'Malformed PPTX central directory entry');
    }
    const nameLength = pptx.readUInt16LE(cursor + 28);
    const extraLength = pptx.readUInt16LE(cursor + 30);
    const commentLength = pptx.readUInt16LE(cursor + 32);
    const entryEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (nameLength === 0 || entryEnd > centralEnd) {
      throw new PptxArchiveError('invalid_pptx', 'Malformed PPTX central directory lengths');
    }
    const name = pptx.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    const flags = pptx.readUInt16LE(cursor + 8);
    const compressionMethod = pptx.readUInt16LE(cursor + 10);
    const compressedBytes = pptx.readUInt32LE(cursor + 20);
    const uncompressedBytes = pptx.readUInt32LE(cursor + 24);
    if ((flags & 0x0001) !== 0) {
      throw new PptxArchiveError(
        'invalid_pptx',
        `Encrypted PPTX entry is not supported: ${name}`,
      );
    }
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw new PptxArchiveError(
        'invalid_pptx',
        `Unsupported PPTX compression method ${compressionMethod}: ${name}`,
      );
    }
    if (
      compressedBytes === 0xffffffff ||
      uncompressedBytes === 0xffffffff
    ) {
      throw new PptxArchiveError(
        'invalid_pptx',
        `ZIP64 PPTX entry is not supported: ${name}`,
      );
    }
    totalCompressedBytes += compressedBytes;
    totalUncompressedBytes += uncompressedBytes;
    if (totalUncompressedBytes > maxUncompressedBytes) {
      throw new PptxArchiveError(
        'invalid_pptx',
        `PPTX uncompressed size exceeds ${maxUncompressedBytes} bytes`,
      );
    }
    if (
      uncompressedBytes > 0 &&
      (compressedBytes === 0 ||
        uncompressedBytes > compressedBytes * maxCompressionRatio)
    ) {
      throw new PptxArchiveError(
        'invalid_pptx',
        `PPTX entry compression ratio exceeds ${maxCompressionRatio}: ${name}`,
      );
    }
    names.add(name);
    cursor = entryEnd;
  }
  if (cursor !== centralEnd) {
    throw new PptxArchiveError('invalid_pptx', 'PPTX central directory entry count is invalid');
  }
  if (
    totalUncompressedBytes > 0 &&
    (totalCompressedBytes === 0 ||
      totalUncompressedBytes >
        totalCompressedBytes * maxCompressionRatio)
  ) {
    throw new PptxArchiveError(
      'invalid_pptx',
      `PPTX aggregate compression ratio exceeds ${maxCompressionRatio}`,
    );
  }
  if (!names.has('[Content_Types].xml') || !names.has('ppt/presentation.xml')) {
    throw new PptxArchiveError('invalid_pptx', 'Required PPTX OOXML entries are missing');
  }

  const slides = [...names].filter((name) =>
    /^ppt\/slides\/slide[1-9]\d*\.xml$/.test(name),
  );
  if (slides.length === 0) {
    throw new PptxArchiveError('invalid_pptx', 'PPTX contains no slides');
  }
  if (slides.length > maxSlides) {
    throw new PptxArchiveError(
      'too_many_pages',
      `PPTX contains ${slides.length} slides; maximum is ${maxSlides}`,
    );
  }
  return { slideCount: slides.length };
}

function findEndOfCentralDirectory(pptx: Buffer): number {
  if (pptx.length < ZIP_EOCD_MIN_BYTES) return -1;
  const minOffset = Math.max(
    0,
    pptx.length - ZIP_EOCD_MIN_BYTES - ZIP_MAX_COMMENT_BYTES,
  );
  for (let offset = pptx.length - ZIP_EOCD_MIN_BYTES; offset >= minOffset; offset--) {
    if (pptx.readUInt32LE(offset) !== ZIP_EOCD_SIGNATURE) continue;
    const commentLength = pptx.readUInt16LE(offset + 20);
    if (offset + ZIP_EOCD_MIN_BYTES + commentLength === pptx.length) {
      return offset;
    }
  }
  return -1;
}

const DEFAULT_PROCESS_TIMEOUT_MS = 60_000;

function createExecFileFn(timeoutMs: number): ExecFileFn {
  return async (file, args) => {
    const { stdout, stderr } = await promisify(execFile)(file, args, {
      maxBuffer: 16 * 1024 * 1024,
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
    });
    return { stdout: String(stdout), stderr: String(stderr) };
  };
}

export interface LibreOfficeRendererOptions {
  /** Path/name of the LibreOffice binary (default 'soffice'). */
  sofficePath?: string;
  /** Path/name of the poppler binary (default 'pdftoppm'). */
  pdftoppmPath?: string;
  /** Parent dir for per-request temp dirs (default os.tmpdir()). */
  workDir?: string;
  /** Injectable process runner for tests. */
  execFileFn?: ExecFileFn;
  /** Hard timeout for each default subprocess (default 60 seconds). */
  processTimeoutMs?: number;
  /** Maximum encoded bytes for one rendered JPEG. */
  maxRenderedPageBytes?: number;
  /** Maximum encoded bytes across all rendered JPEGs. */
  maxRenderedTotalBytes?: number;
  /** Maximum accepted JPEG width or height. */
  maxRenderedDimensionPx?: number;
  /** Maximum accepted decoded pixel area for one JPEG. */
  maxRenderedPixels?: number;
}

export function createLibreOfficeRenderer(
  opts: LibreOfficeRendererOptions = {},
): PptxRenderer {
  const sofficePath = opts.sofficePath ?? 'soffice';
  const pdftoppmPath = opts.pdftoppmPath ?? 'pdftoppm';
  const workDir = opts.workDir ?? tmpdir();
  const execFileFn =
    opts.execFileFn ??
    createExecFileFn(opts.processTimeoutMs ?? DEFAULT_PROCESS_TIMEOUT_MS);
  const maxRenderedPageBytes =
    opts.maxRenderedPageBytes ?? REVIEW_PPTX_RENDERED_PAGE_MAX_BYTES;
  const maxRenderedTotalBytes =
    opts.maxRenderedTotalBytes ?? REVIEW_PPTX_RENDERED_TOTAL_MAX_BYTES;
  const maxRenderedDimensionPx =
    opts.maxRenderedDimensionPx ?? REVIEW_PPTX_RENDERED_MAX_DIMENSION_PX;
  const maxRenderedPixels =
    opts.maxRenderedPixels ?? REVIEW_PPTX_RENDERED_MAX_PIXELS;

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

        // PDF → one JPEG per slide (page-1.jpg, page-2.jpg, …), fitted inside
        // the same 2048px long-edge ceiling as every browser ingest path.
        const outPrefix = join(dir, 'page');
        await execFileFn(pdftoppmPath, [
          '-jpeg',
          '-r',
          '150',
          '-scale-to',
          String(REVIEW_PPTX_RENDERED_MAX_DIMENSION_PX),
          '-f',
          '1',
          '-l',
          '25',
          join(dir, 'deck.pdf'),
          outPrefix,
        ]);

        const names = (await readdir(dir))
          .filter((n) => /^page-\d+\.jpg$/.test(n))
          .sort((a, b) => pageNumberOf(a) - pageNumberOf(b));
        let totalRenderedBytes = 0;
        for (const name of names) {
          const { size } = await stat(join(dir, name));
          if (size > maxRenderedPageBytes) {
            throw new PptxRenderOutputError(
              `${name} exceeds ${maxRenderedPageBytes} bytes`,
            );
          }
          totalRenderedBytes += size;
          if (totalRenderedBytes > maxRenderedTotalBytes) {
            throw new PptxRenderOutputError(
              `Rendered JPEG aggregate exceeds ${maxRenderedTotalBytes} bytes`,
            );
          }
        }

        const pages: RenderedPage[] = [];
        for (const [index, name] of names.entries()) {
          const jpeg = await readFile(join(dir, name));
          if (jpeg.byteLength > maxRenderedPageBytes) {
            throw new PptxRenderOutputError(
              `${name} exceeds ${maxRenderedPageBytes} bytes`,
            );
          }
          const { widthPx, heightPx } = jpegDimensions(jpeg);
          if (
            widthPx > maxRenderedDimensionPx ||
            heightPx > maxRenderedDimensionPx
          ) {
            throw new PptxRenderOutputError(
              `${name} is ${widthPx}x${heightPx}; maximum dimension is ${maxRenderedDimensionPx}px`,
            );
          }
          const pixels = widthPx * heightPx;
          if (pixels > maxRenderedPixels) {
            throw new PptxRenderOutputError(
              `${name} has ${pixels} pixels; maximum is ${maxRenderedPixels}`,
            );
          }
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
