/**
 * wizardHelpers — small pure/DOM utilities lifted out of SlidesWizard so the
 * shell stays focused on orchestration.
 */
import { buildDeck } from '../deck/buildDeck';
import type { SlideDeck } from '../deck/types';

/**
 * A placeholder deck so the shell renders before a real deck is built. Built
 * through the real `buildDeck` — not a hand-shaped literal — so the preview
 * reflects the true arc, using bogus names (never real ones).
 */
export function placeholderDeck(): SlideDeck {
  return buildDeck({
    title: 'Your talk will appear here',
    authors: [{ name: 'Jane Doe' }],
    durationMinutes: 10,
    rankedFindings: [],
    gap: 'Paste a manuscript to begin — the arc builds from your paper.',
    resolution: 'Answer a few short questions and the deck assembles itself.',
    methodsSummary: 'Methods, figures, and speaker notes come from your text.',
    references: [],
    introReferences: [],
    methodsReferences: [],
  });
}

/** Trigger a browser download of raw bytes as a named file. */
export function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mimeType: string,
) {
  // Re-wrap so the BlobPart is a Uint8Array<ArrayBuffer> — pptxgenjs types
  // the buffer as ArrayBufferLike, which the DOM Blob signature rejects.
  const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
