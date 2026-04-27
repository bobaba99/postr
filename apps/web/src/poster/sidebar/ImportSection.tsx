/**
 * ImportSection — sidebar wrapper that owns the import-modal flow.
 *
 * Reads the active poster directly from `usePosterStore` (singleton)
 * so the host LayoutTab doesn't need any new props. Renders the
 * `ImportTile` plus the two modals (`ImportConfirmReplaceModal` →
 * `ImportPosterModal` in `replace` mode).
 */
import { useState } from 'react';
import { usePosterStore } from '@/stores/posterStore';
import { ImportPosterModal } from '@/components/ImportPosterModal';
import { ImportConfirmReplaceModal } from '@/components/ImportConfirmReplaceModal';
import { ImportTile } from './ImportTile';

const REPLACE_THRESHOLD = 2;

export function ImportSection() {
  const posterId = usePosterStore((s) => s.posterId);
  const posterTitle = usePosterStore((s) => s.posterTitle);
  const doc = usePosterStore((s) => s.doc);
  const blocksCount = doc?.blocks.length ?? 0;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  function handleClick() {
    if (!posterId) return;
    if (blocksCount > REPLACE_THRESHOLD) {
      setConfirmOpen(true);
    } else {
      setImportOpen(true);
    }
  }

  return (
    <>
      <ImportTile blocksCount={blocksCount} onClick={handleClick} />
      <ImportConfirmReplaceModal
        open={confirmOpen}
        doc={doc}
        posterTitle={posterTitle}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          setImportOpen(true);
        }}
      />
      <ImportPosterModal
        open={importOpen}
        mode="replace"
        targetPosterId={posterId ?? undefined}
        onClose={() => setImportOpen(false)}
      />
    </>
  );
}
