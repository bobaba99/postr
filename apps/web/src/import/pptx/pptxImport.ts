/**
 * .pptx import entry point — parses the file, then uploads its media
 * into the user's poster-assets bucket and rewrites `imageSrc`.
 *
 * Mirrors the shape of `extractFromPdf` / `importPostr` so the modal
 * treats all three paths identically (progress, confirm/replace,
 * generic error handling).
 */
import type { ImportProgress, PosterDoc } from '@postr/shared';
import { uploadPosterImage } from '@/data/posterImages';
import { PptxImportError } from './ooxml';
import { parsePptx } from './parsePptx';

export interface PptxImportOutput {
  doc: PosterDoc;
  title: string;
  warnings: string[];
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

/**
 * Read a `.pptx` File into a `PosterDoc`, uploading each embedded
 * image so the resulting doc references storage paths.
 */
export async function extractFromPptx(
  file: File,
  posterId: string,
  userId: string,
  onProgress?: (p: ImportProgress) => void,
): Promise<PptxImportOutput> {
  onProgress?.({ stage: 'reading' });
  const bytes = new Uint8Array(await file.arrayBuffer());

  onProgress?.({ stage: 'clustering' });
  const parsed = parsePptx(bytes);

  const warnings = [...parsed.warnings];

  if (parsed.media.length > 0) {
    onProgress?.({ stage: 'uploading-figures', ratio: 0 });
  }

  // Sequential rather than parallel: an imported deck can carry dozens
  // of figures and Supabase Storage rate-limits bursts. This also lets
  // the progress ratio advance monotonically.
  const uploaded = new Map<string, string>();
  for (const [index, item] of parsed.media.entries()) {
    const mime = MIME_BY_EXT[item.ext] ?? 'image/png';
    // Copy into a fresh buffer so the File never aliases the zip's
    // backing store (fflate may hand back views over shared memory).
    const copy = new Uint8Array(item.bytes.byteLength);
    copy.set(item.bytes);
    const imageFile = new File([copy], `${item.blockId}.${item.ext}`, { type: mime });
    const src = await uploadPosterImage(userId, posterId, item.blockId, imageFile);
    if (src) {
      uploaded.set(item.blockId, src);
    } else {
      warnings.push(
        'An image from the slide could not be saved and was left as an empty frame.',
      );
    }
    onProgress?.({
      stage: 'uploading-figures',
      ratio: (index + 1) / parsed.media.length,
    });
  }

  onProgress?.({ stage: 'building-preview' });
  const blocks = parsed.doc.blocks.map((block) => {
    const src = uploaded.get(block.id);
    return src ? { ...block, imageSrc: src } : block;
  });

  onProgress?.({ stage: 'ready' });
  return {
    doc: { ...parsed.doc, blocks },
    title: parsed.title,
    warnings,
  };
}

export { PptxImportError };
