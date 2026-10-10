/**
 * PosterClosedPage — what the editor shows after it closed the open poster
 * because the account signed in here changed (fix 23,
 * docs/fixes/23-new-poster-owner-only.md).
 *
 * The poster is still in memory, so it can always be downloaded as a
 * `.postr` file and imported into any account. A guest's poster says so
 * first: a guest session cannot be signed in to again once another account
 * has replaced it (step 10, R1-2). "Sign in" is offered only when it can
 * reach a sign-in form: /auth sends a signed-in permanent account on to
 * My posters (step 10, R1-1).
 *
 * The file is made as the page opens, while the owner's stored images can
 * still be fetched: their signed URLs are cached for 50 minutes, and the
 * account signed in now cannot sign them again. Made when the button was
 * pressed, a later press left them out and said "Downloaded." (step 9 round
 * 2, S9R2-1). If an image still could not be included, the page says how
 * many.
 */
import { useEffect, useRef, useState } from 'react';
import { usePosterStore } from '@/stores/posterStore';
import { exportPostrWithReport, savePostr, type PostrExport } from '@/import/postrFile';
import { IMPORT_ENABLED } from '@/config/features';

interface PosterClosedPageProps {
  /** The poster's owner was a guest. */
  ownerWasGuest: boolean;
  /** A guest, or no one, is signed in now, so /auth shows its form. */
  canSignIn: boolean;
}

const BUTTON =
  'inline-block rounded-md bg-[#2a2a3a] px-4 py-2 text-xs font-medium text-[#c8cad0] hover:bg-[#3a3a4a] disabled:cursor-wait';

type DownloadState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; missingImages: number }
  | { kind: 'failed' };

const makeCopy = () => {
  const { doc } = usePosterStore.getState();
  return doc ? exportPostrWithReport(doc) : Promise.reject(new Error('No poster in memory'));
};

export function PosterClosedPage({ ownerWasGuest, canSignIn }: PosterClosedPageProps) {
  const [download, setDownload] = useState<DownloadState>({ kind: 'idle' });
  const copy = useRef<Promise<PostrExport> | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    // The editor that had the focus is gone: the page takes it.
    heading.current?.focus();
    const made = makeCopy();
    made.catch(() => {}); // A failure is reported when the button is pressed.
    copy.current = made;
  }, []);

  async function downloadCopy() {
    if (download.kind === 'busy') return;
    setDownload({ kind: 'busy' });
    try {
      // The copy made as the page opened; made again if that failed.
      const made = await (copy.current ?? makeCopy()).catch(() => makeCopy());
      savePostr(made.blob, usePosterStore.getState().posterTitle);
      setDownload({ kind: 'done', missingImages: made.missingImages });
    } catch (err) {
      console.error('Downloading the closed poster failed:', err);
      setDownload({ kind: 'failed' });
    }
  }

  return (
    <main className="flex h-screen w-screen items-center justify-center bg-[#0a0a12] px-4 text-[#c8cad0]">
      <div className="max-w-md space-y-3 text-center">
        <h1 ref={heading} tabIndex={-1} className="text-base font-medium outline-none">
          {ownerWasGuest ? 'This guest poster was closed' : 'This poster is in another account'}
        </h1>
        <p className="text-xs text-[#888]">
          {/* "you can import it" only while import is offered (IMPORT_ENABLED, record 29). */}
          {ownerWasGuest
            ? IMPORT_ENABLED
              ? 'The guest session that made it has ended in this browser. Download a copy to keep it; you can import it into any account.'
              : 'The guest session that made it has ended in this browser. Download a copy to keep it.'
            : canSignIn
              ? 'The account signed in here changed. Sign in to the account that owns this poster to keep editing it.'
              : IMPORT_ENABLED
                ? 'The account signed in here changed. Download a copy to keep this version; you can import it into any account.'
                : 'The account signed in here changed. Download a copy to keep this version.'}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={downloadCopy} disabled={download.kind === 'busy'} className={BUTTON}>
            Download a copy
          </button>
          {canSignIn && !ownerWasGuest && (
            <a href="/auth" className={BUTTON}>
              Sign in
            </a>
          )}
          <a href="/dashboard" className={BUTTON}>
            My posters
          </a>
        </div>
        <p role="status" className="min-h-4 text-xs text-[#888]">
          {download.kind === 'busy' && 'Preparing the file…'}
          {download.kind === 'done' && (download.missingImages
            ? `Downloaded. ${download.missingImages} image${download.missingImages === 1 ? '' : 's'} could not be included.`
            : 'Downloaded.')}
          {download.kind === 'failed' && 'Something went wrong. Try again.'}
        </p>
      </div>
    </main>
  );
}
