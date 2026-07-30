/**
 * The UI barrel: the wrappers resolve the ingest context (session
 * userId + a fresh sessionId per call) and dispatch through
 * normalizeInput — components never build IngestContext themselves.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PosterDoc } from '@postr/shared';

const { mockNormalize, mockEnsureSession } = vi.hoisted(() => ({
  mockNormalize: vi.fn(),
  mockEnsureSession: vi.fn(),
}));

vi.mock('../normalizeInput', () => ({ normalizeInput: mockNormalize }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/auth', () => ({ ensureSession: mockEnsureSession }));

import { ingestFileForReview, ingestPosterForReview } from '../index';

beforeEach(() => {
  vi.clearAllMocks();
  mockEnsureSession.mockResolvedValue({ user: { id: 'u1' } });
  mockNormalize.mockResolvedValue({
    pages: [],
    meta: { sourceKind: 'pdf', pageCount: 0, ingestedAt: '2026-07-29T00:00:00.000Z' },
  });
});

describe('ingestFileForReview', () => {
  it('dispatches by MIME and resolves the context per call', async () => {
    const pdf = new File(['x'], 'deck.pdf', { type: 'application/pdf' });
    await ingestFileForReview(pdf);
    expect(mockNormalize).toHaveBeenCalledWith(
      { kind: 'pdf', file: pdf },
      { userId: 'u1', sessionId: expect.any(String) },
    );

    const pptx = new File(['x'], 'deck.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    await ingestFileForReview(pptx);
    expect(mockNormalize).toHaveBeenCalledWith(
      { kind: 'pptx', file: pptx },
      expect.objectContaining({ userId: 'u1' }),
    );

    const png = new File(['x'], 'poster.png', { type: 'image/png' });
    await ingestFileForReview(png);
    expect(mockNormalize).toHaveBeenCalledWith(
      { kind: 'image', file: png },
      expect.objectContaining({ userId: 'u1' }),
    );
  });
});

describe('ingestPosterForReview', () => {
  it('dispatches the postr kind with doc + posterId', async () => {
    const doc = { version: 1, blocks: [] } as unknown as PosterDoc;
    await ingestPosterForReview({ doc, posterId: 'p1' });
    expect(mockNormalize).toHaveBeenCalledWith(
      { kind: 'postr', doc, posterId: 'p1' },
      { userId: 'u1', sessionId: expect.any(String) },
    );
  });
});
