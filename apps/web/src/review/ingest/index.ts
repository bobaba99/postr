/**
 * UI-facing entry points (spec §3, consumed by Milestone 5): resolve the
 * ingest context (the current session's user id — anonymous sessions are
 * fine, storage RLS scopes to auth.uid() — plus a fresh sessionId per
 * call for the temp upload prefix) and dispatch through normalizeInput.
 * cleanupReviewTemp is the fire-and-forget delete for the temp page
 * images, run on unmount / "start a new review".
 */
import type { PosterDoc } from '@postr/shared';
import { ensureSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { normalizeInput } from './normalizeInput';
import type { IngestContext, NormalizedArtifact } from './types';

async function resolveIngestContext(): Promise<IngestContext> {
  const session = await ensureSession(supabase);
  if (!session) throw new Error('No session returned by Supabase');
  return { userId: session.user.id, sessionId: crypto.randomUUID() };
}

function kindForFile(file: File): 'pdf' | 'image' | 'pptx' {
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
    return 'pptx';
  }
  return 'image'; // the MIME allowlist (Task 20) rejects non-images downstream
}

export async function ingestFileForReview(file: File): Promise<NormalizedArtifact> {
  const ctx = await resolveIngestContext();
  return normalizeInput({ kind: kindForFile(file), file }, ctx);
}

export async function ingestPosterForReview(input: {
  doc: PosterDoc;
  posterId: string;
}): Promise<NormalizedArtifact> {
  const ctx = await resolveIngestContext();
  return normalizeInput({ kind: 'postr', ...input }, ctx);
}

/**
 * Best-effort delete of a review's review-temp page images. Callers
 * fire-and-forget (`void cleanupReviewTemp(paths)`) on unmount and on
 * "start a new review" — results live in component memory, so the
 * images have no consumer once the view is gone. Failures are
 * swallowed: a stranded temp object is harmless (RLS still scopes it
 * to the owner; the post-launch scheduled sweep is the backstop).
 */
export async function cleanupReviewTemp(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await supabase.storage.from('poster-assets').remove(paths);
  } catch {
    // Best-effort by design — see the docblock.
  }
}
