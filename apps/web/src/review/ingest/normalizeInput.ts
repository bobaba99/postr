/**
 * The ingest dispatcher (spec §3): one entry point for every input
 * kind — each normalizes to the same NormalizedArtifact. The UI picks
 * the kind from how the user arrived (editor → postr with the doc +
 * posterId; file drop → pdf/image/pptx from the file's MIME type).
 */
import type { PosterDoc } from '@postr/shared';
import { fromImage } from './fromImage';
import { fromPdf } from './fromPdf';
import { fromPoster } from './fromPoster';
import { fromPptx } from './fromPptx';
import type { IngestContext, NormalizedArtifact } from './types';

export type ReviewInput =
  | { kind: 'postr'; doc: PosterDoc; posterId: string }
  | { kind: 'pdf' | 'image' | 'pptx'; file: File };

export async function normalizeInput(
  input: ReviewInput,
  ctx: IngestContext,
): Promise<NormalizedArtifact> {
  switch (input.kind) {
    case 'postr':
      return fromPoster(input.doc, { userId: ctx.userId, posterId: input.posterId });
    case 'pdf':
      return fromPdf(input.file, ctx);
    case 'image':
      return fromImage(input.file, ctx);
    case 'pptx':
      return fromPptx(input.file, ctx);
  }
}
