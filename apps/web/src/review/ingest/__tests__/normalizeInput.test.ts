/**
 * normalizeInput: pure dispatch over the four input kinds. The from*
 * modules are mocked — their own suites cover the behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PosterDoc } from '@postr/shared';

const { mockFromPoster, mockFromPdf, mockFromImage, mockFromPptx } = vi.hoisted(() => ({
  mockFromPoster: vi.fn(),
  mockFromPdf: vi.fn(),
  mockFromImage: vi.fn(),
  mockFromPptx: vi.fn(),
}));

vi.mock('../fromPoster', () => ({ fromPoster: mockFromPoster }));
vi.mock('../fromPdf', () => ({ fromPdf: mockFromPdf }));
vi.mock('../fromImage', () => ({ fromImage: mockFromImage }));
vi.mock('../fromPptx', () => ({ fromPptx: mockFromPptx }));

import { normalizeInput } from '../normalizeInput';
import type { NormalizedArtifact } from '../types';

const CTX = { userId: 'u1', sessionId: 'sess-1' };

function artifact(sourceKind: NormalizedArtifact['meta']['sourceKind']): NormalizedArtifact {
  return {
    pages: [],
    meta: { sourceKind, pageCount: 0, ingestedAt: '2026-07-29T00:00:00.000Z' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFromPoster.mockResolvedValue(artifact('postr'));
  mockFromPdf.mockResolvedValue(artifact('pdf'));
  mockFromImage.mockResolvedValue(artifact('image'));
  mockFromPptx.mockResolvedValue(artifact('pptx'));
});

describe('normalizeInput', () => {
  it('dispatches postr input with the posterId from the input, not the ctx', async () => {
    const doc = { widthIn: 48, heightIn: 36 } as PosterDoc;
    const out = await normalizeInput({ kind: 'postr', doc, posterId: 'p1' }, CTX);
    expect(mockFromPoster).toHaveBeenCalledWith(doc, { userId: 'u1', posterId: 'p1' });
    expect(out.meta.sourceKind).toBe('postr');
  });

  it('dispatches pdf input to fromPdf with the shared ctx', async () => {
    const file = new File(['x'], 'talk.pdf', { type: 'application/pdf' });
    const out = await normalizeInput({ kind: 'pdf', file }, CTX);
    expect(mockFromPdf).toHaveBeenCalledWith(file, CTX);
    expect(out.meta.sourceKind).toBe('pdf');
  });

  it('dispatches image input to fromImage', async () => {
    const file = new File(['x'], 'poster.png', { type: 'image/png' });
    const out = await normalizeInput({ kind: 'image', file }, CTX);
    expect(mockFromImage).toHaveBeenCalledWith(file, CTX);
    expect(out.meta.sourceKind).toBe('image');
  });

  it('dispatches pptx input to fromPptx', async () => {
    const file = new File(['x'], 'deck.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    const out = await normalizeInput({ kind: 'pptx', file }, CTX);
    expect(mockFromPptx).toHaveBeenCalledWith(file, CTX);
    expect(out.meta.sourceKind).toBe('pptx');
  });
});
