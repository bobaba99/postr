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
import { Readable } from 'node:stream';
import { createInflateRaw, crc32 } from 'node:zlib';
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
const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50;
const ZIP_EOCD_MIN_BYTES = 22;
const ZIP_MAX_COMMENT_BYTES = 65_535;
const MAX_CENTRAL_DIRECTORY_ENTRIES = 10_000;
const MAX_CENTRAL_DIRECTORY_BYTES = 16 * 1024 * 1024;
const ZIP_STREAM_CHUNK_BYTES = 64 * 1024;

interface PptxZipEntry {
  name: string;
  nameBytes: Buffer;
  flags: number;
  compressionMethod: number;
  crc: number;
  compressedBytes: number;
  uncompressedBytes: number;
  localHeaderOffset: number;
  dataOffset: number;
}

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
 * Validate the bounded ZIP directory and stream every entry through CRC,
 * emitted-byte, and compression-ratio checks. No expanded entry is retained:
 * zlib output is consumed in bounded chunks before LibreOffice runs.
 *
 * A PPTX must contain its OOXML roots and at least one numbered slide; the
 * slide count is known before conversion starts.
 */
export async function inspectPptxArchive(
  pptx: Buffer,
  maxSlides: number,
  options: {
    maxUncompressedBytes?: number;
    maxCompressionRatio?: number;
  } = {},
): Promise<{ slideCount: number }> {
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
  const entries: PptxZipEntry[] = [];
  let cursor = centralOffset;
  let totalCompressedBytes = 0;
  let totalDeclaredUncompressedBytes = 0;
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
    const nameBytes = pptx.subarray(
      cursor + 46,
      cursor + 46 + nameLength,
    );
    const name = nameBytes.toString('utf8');
    const flags = pptx.readUInt16LE(cursor + 8);
    const compressionMethod = pptx.readUInt16LE(cursor + 10);
    const expectedCrc = pptx.readUInt32LE(cursor + 16);
    const compressedBytes = pptx.readUInt32LE(cursor + 20);
    const uncompressedBytes = pptx.readUInt32LE(cursor + 24);
    const localHeaderOffset = pptx.readUInt32LE(cursor + 42);
    if ((flags & 0x0001) !== 0) {
      throw new PptxArchiveError(
        'invalid_pptx',
        `Encrypted PPTX entry is not supported: ${name}`,
      );
    }
    if ((flags & 0x0008) !== 0) {
      throw new PptxArchiveError(
        'invalid_pptx',
        `PPTX data descriptor is not supported: ${name}`,
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
      uncompressedBytes === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      throw new PptxArchiveError(
        'invalid_pptx',
        `ZIP64 PPTX entry is not supported: ${name}`,
      );
    }
    totalCompressedBytes += compressedBytes;
    totalDeclaredUncompressedBytes += uncompressedBytes;
    if (totalDeclaredUncompressedBytes > maxUncompressedBytes) {
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
    if (names.has(name)) {
      throw new PptxArchiveError(
        'invalid_pptx',
        `Duplicate PPTX entry is not supported: ${name}`,
      );
    }
    names.add(name);
    entries.push({
      name,
      nameBytes,
      flags,
      compressionMethod,
      crc: expectedCrc,
      compressedBytes,
      uncompressedBytes,
      localHeaderOffset,
      dataOffset: -1,
    });
    cursor = entryEnd;
  }
  if (cursor !== centralEnd) {
    throw new PptxArchiveError('invalid_pptx', 'PPTX central directory entry count is invalid');
  }
  if (
    totalDeclaredUncompressedBytes > 0 &&
    (totalCompressedBytes === 0 ||
      totalDeclaredUncompressedBytes >
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

  reconcileLocalEntries(pptx, entries, centralOffset);
  await validateActualEntryData(
    pptx,
    entries,
    maxUncompressedBytes,
    maxCompressionRatio,
    totalCompressedBytes,
  );

  return { slideCount: slides.length };
}

function reconcileLocalEntries(
  pptx: Buffer,
  entries: PptxZipEntry[],
  centralOffset: number,
): void {
  const localOrder = [...entries].sort(
    (left, right) => left.localHeaderOffset - right.localHeaderOffset,
  );
  let expectedOffset = 0;

  for (const entry of localOrder) {
    const offset = entry.localHeaderOffset;
    if (
      offset !== expectedOffset ||
      offset + 30 > centralOffset ||
      pptx.readUInt32LE(offset) !== ZIP_LOCAL_FILE_SIGNATURE
    ) {
      throw new PptxArchiveError(
        'invalid_pptx',
        `Malformed PPTX local entry layout: ${entry.name}`,
      );
    }

    const localFlags = pptx.readUInt16LE(offset + 6);
    const localCompressionMethod = pptx.readUInt16LE(offset + 8);
    const localCrc = pptx.readUInt32LE(offset + 14);
    const localCompressedBytes = pptx.readUInt32LE(offset + 18);
    const localUncompressedBytes = pptx.readUInt32LE(offset + 22);
    const localNameLength = pptx.readUInt16LE(offset + 26);
    const localExtraLength = pptx.readUInt16LE(offset + 28);
    const localNameStart = offset + 30;
    const dataOffset =
      localNameStart + localNameLength + localExtraLength;
    const dataEnd = dataOffset + entry.compressedBytes;

    if (
      localNameLength === 0 ||
      dataOffset > centralOffset ||
      dataEnd > centralOffset
    ) {
      throw new PptxArchiveError(
        'invalid_pptx',
        `Malformed PPTX local entry bounds: ${entry.name}`,
      );
    }

    const localNameBytes = pptx.subarray(
      localNameStart,
      localNameStart + localNameLength,
    );
    if (
      !localNameBytes.equals(entry.nameBytes) ||
      localFlags !== entry.flags ||
      localCompressionMethod !== entry.compressionMethod ||
      localCrc !== entry.crc ||
      localCompressedBytes !== entry.compressedBytes ||
      localUncompressedBytes !== entry.uncompressedBytes
    ) {
      throw new PptxArchiveError(
        'invalid_pptx',
        `PPTX local and central metadata differ: ${entry.name}`,
      );
    }
    if (
      localCompressedBytes === 0xffffffff ||
      localUncompressedBytes === 0xffffffff
    ) {
      throw new PptxArchiveError(
        'invalid_pptx',
        `ZIP64 PPTX entry is not supported: ${entry.name}`,
      );
    }
    if (
      entry.compressionMethod === 0 &&
      entry.compressedBytes !== entry.uncompressedBytes
    ) {
      throw new PptxArchiveError(
        'invalid_pptx',
        `Stored PPTX entry size mismatch: ${entry.name}`,
      );
    }

    entry.dataOffset = dataOffset;
    expectedOffset = dataEnd;
  }

  if (expectedOffset !== centralOffset) {
    throw new PptxArchiveError(
      'invalid_pptx',
      'Unexpected data exists between PPTX entries and the central directory',
    );
  }
}

async function validateActualEntryData(
  pptx: Buffer,
  entries: PptxZipEntry[],
  maxUncompressedBytes: number,
  maxCompressionRatio: number,
  totalCompressedBytes: number,
): Promise<void> {
  let actualTotalBytes = 0;

  for (const entry of entries) {
    let actualEntryBytes = 0;
    let actualCrc = 0;

    const consume = (chunk: Buffer): void => {
      actualEntryBytes += chunk.byteLength;
      actualTotalBytes += chunk.byteLength;
      if (actualEntryBytes > maxUncompressedBytes) {
        throw new PptxArchiveError(
          'invalid_pptx',
          `PPTX entry actual uncompressed size exceeds ${maxUncompressedBytes} bytes: ${entry.name}`,
        );
      }
      if (actualTotalBytes > maxUncompressedBytes) {
        throw new PptxArchiveError(
          'invalid_pptx',
          `PPTX actual uncompressed size exceeds ${maxUncompressedBytes} bytes`,
        );
      }
      if (
        actualEntryBytes > 0 &&
        (entry.compressedBytes === 0 ||
          actualEntryBytes >
            entry.compressedBytes * maxCompressionRatio)
      ) {
        throw new PptxArchiveError(
          'invalid_pptx',
          `PPTX entry actual compression ratio exceeds ${maxCompressionRatio}: ${entry.name}`,
        );
      }
      actualCrc = crc32(chunk, actualCrc);
    };

    if (entry.compressionMethod === 0) {
      for (const chunk of archiveChunks(
        pptx,
        entry.dataOffset,
        entry.compressedBytes,
      )) {
        consume(chunk);
      }
    } else {
      const inflater = createInflateRaw({
        chunkSize: ZIP_STREAM_CHUNK_BYTES,
      });
      const input = Readable.from(
        archiveChunks(pptx, entry.dataOffset, entry.compressedBytes),
        { objectMode: false },
      );
      try {
        for await (const chunk of input.pipe(inflater)) {
          consume(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
      } catch (error) {
        if (error instanceof PptxArchiveError) throw error;
        throw new PptxArchiveError(
          'invalid_pptx',
          `Malformed deflated PPTX entry: ${entry.name}`,
        );
      }
      if (inflater.bytesWritten !== entry.compressedBytes) {
        throw new PptxArchiveError(
          'invalid_pptx',
          `Trailing data in deflated PPTX entry: ${entry.name}`,
        );
      }
    }

    if (actualEntryBytes !== entry.uncompressedBytes) {
      throw new PptxArchiveError(
        'invalid_pptx',
        `PPTX entry actual size differs from declared uncompressed size: ${entry.name}`,
      );
    }
    if ((actualCrc >>> 0) !== entry.crc) {
      throw new PptxArchiveError(
        'invalid_pptx',
        `PPTX entry CRC mismatch: ${entry.name}`,
      );
    }
  }

  if (
    actualTotalBytes > 0 &&
    (totalCompressedBytes === 0 ||
      actualTotalBytes >
        totalCompressedBytes * maxCompressionRatio)
  ) {
    throw new PptxArchiveError(
      'invalid_pptx',
      `PPTX aggregate actual compression ratio exceeds ${maxCompressionRatio}`,
    );
  }
}

function* archiveChunks(
  pptx: Buffer,
  offset: number,
  byteLength: number,
): Generator<Buffer> {
  const end = offset + byteLength;
  for (let cursor = offset; cursor < end; cursor += ZIP_STREAM_CHUNK_BYTES) {
    yield pptx.subarray(cursor, Math.min(end, cursor + ZIP_STREAM_CHUNK_BYTES));
  }
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
