/**
 * UI-facing entry points (spec §3, consumed by Milestone 5): resolve the
 * ingest context (the current session's user id — anonymous sessions are
 * fine, storage RLS scopes to auth.uid() — plus a fresh sessionId per
 * call for the temp upload prefix) and dispatch through normalizeInput.
 */
import type { PosterDoc } from '@postr/shared';
import { ensureSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { normalizeInput } from './normalizeInput';
import type { IngestContext, NormalizedArtifact } from './types';

async function resolveIngestContext(): Promise<IngestContext> {
  const session = await ensureSession(supabase);
  if (!session) {
    throw new Error('Unable to establish a review session.');
  }
  return { userId: session.user.id, sessionId: crypto.randomUUID() };
}

function kindForFile(file: File): 'pdf' | 'image' | 'pptx' {
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
    return 'pptx';
  }
  return 'image'; // the MIME allowlist rejects non-images downstream
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
