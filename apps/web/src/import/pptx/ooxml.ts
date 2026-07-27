/**
 * OOXML primitives for the .pptx importer — zip entry access, XML
 * parsing, and relationship resolution.
 *
 * No new dependencies: `fflate` already ships for the `.postr`
 * bundle path, and XML goes through the browser's built-in
 * `DOMParser`. Everything here is deliberately dumb — it answers
 * "what does the file say?" and never decides what a shape means.
 */
import { unzipSync } from 'fflate';

/** OOXML namespaces. Looked up by `getElementsByTagNameNS` so a deck
 *  written with different prefixes (`<pptx:sp>` instead of `<p:sp>`)
 *  still parses — prefixes are arbitrary in XML, namespaces are not. */
export const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
export const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
export const NS_R =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const NS_REL =
  'http://schemas.openxmlformats.org/package/2006/relationships';

/**
 * Thrown for input that is not a readable PowerPoint file. The modal
 * turns this into the generic "Something went wrong" panel — the raw
 * message never reaches the user (house rule: no raw parser errors).
 */
export class PptxImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PptxImportError';
  }
}

/** Guard against a decompression bomb, mirroring `postrFile.ts`. */
const MAX_PPTX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_PPTX_DECOMPRESSED_BYTES = 200 * 1024 * 1024;

export type ZipEntries = Record<string, Uint8Array>;

/** Unzip .pptx bytes, refusing oversized or non-zip input. */
export function readPptxEntries(bytes: Uint8Array): ZipEntries {
  if (bytes.byteLength > MAX_PPTX_FILE_BYTES) {
    throw new PptxImportError('PowerPoint file exceeds the size limit.');
  }
  let entries: ZipEntries;
  try {
    entries = unzipSync(bytes);
  } catch {
    // Not a zip at all (a PDF renamed to .pptx, a truncated upload).
    throw new PptxImportError('File is not a readable PowerPoint archive.');
  }

  let total = 0;
  for (const entry of Object.values(entries)) total += entry.byteLength;
  if (total > MAX_PPTX_DECOMPRESSED_BYTES) {
    throw new PptxImportError('PowerPoint file expands beyond the size limit.');
  }

  // A .pptx MUST carry a presentation part. Without it we're looking at
  // some other zip (a .docx, a .postr bundle, a plain archive).
  if (!entries['ppt/presentation.xml']) {
    throw new PptxImportError('Archive is not a PowerPoint presentation.');
  }
  return entries;
}

export const bytesToText = (bytes: Uint8Array): string =>
  new TextDecoder().decode(bytes);

/**
 * Parse an XML part. `DOMParser` reports failures as a `<parsererror>`
 * element in the result rather than throwing, so we check for it.
 */
export function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new PptxImportError('PowerPoint file contains malformed XML.');
  }
  return doc;
}

/** Read + parse a named zip entry, or null when it is absent. */
export function parsePart(entries: ZipEntries, path: string): Document | null {
  const bytes = entries[path];
  if (!bytes) return null;
  return parseXml(bytesToText(bytes));
}

/** First namespaced child element with `tag`, searched at any depth. */
export function firstEl(
  root: Element | Document,
  ns: string,
  tag: string,
): Element | null {
  return root.getElementsByTagNameNS(ns, tag)[0] ?? null;
}

/** All namespaced descendants with `tag`, as a real array. */
export function allEls(
  root: Element | Document,
  ns: string,
  tag: string,
): Element[] {
  return Array.from(root.getElementsByTagNameNS(ns, tag));
}

/** Parse an integer attribute, returning `fallback` when absent/NaN. */
export function intAttr(
  el: Element | null,
  name: string,
  fallback = 0,
): number {
  if (!el) return fallback;
  const raw = el.getAttribute(name);
  if (raw === null) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Resolve a slide's `_rels` file into `r:embed` id → zip entry path.
 *
 * Relationship targets are relative to the *part's* directory, so
 * `ppt/slides/slide1.xml` with target `../media/image1.png` resolves
 * to `ppt/media/image1.png`. We normalize rather than string-match so
 * decks written by other tools (absolute `/ppt/media/...`, or a flat
 * `media/...`) resolve too.
 */
export function resolveRelationships(
  entries: ZipEntries,
  partPath: string,
): Map<string, string> {
  const map = new Map<string, string>();
  const relPath = relsPathFor(partPath);
  const doc = parsePart(entries, relPath);
  if (!doc) return map;

  for (const rel of allEls(doc, NS_REL, 'Relationship')) {
    const id = rel.getAttribute('Id');
    const target = rel.getAttribute('Target');
    if (!id || !target) continue;
    // External targets (linked images on disk) have no bytes in the
    // archive — skip so callers treat them as a missing asset.
    if (rel.getAttribute('TargetMode') === 'External') continue;
    map.set(id, normalizeTarget(partPath, target));
  }
  return map;
}

/** `ppt/slides/slide1.xml` → `ppt/slides/_rels/slide1.xml.rels`. */
function relsPathFor(partPath: string): string {
  const idx = partPath.lastIndexOf('/');
  const dir = idx === -1 ? '' : partPath.slice(0, idx);
  const file = idx === -1 ? partPath : partPath.slice(idx + 1);
  return `${dir}/_rels/${file}.rels`;
}

/** Resolve a relationship target against its owning part's directory. */
export function normalizeTarget(partPath: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const idx = partPath.lastIndexOf('/');
  const baseSegments = idx === -1 ? [] : partPath.slice(0, idx).split('/');
  const segments = [...baseSegments];
  for (const segment of target.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join('/');
}
