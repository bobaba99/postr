import type { PageImage } from './types';

/** Keep a browser-local copy available after review-temp storage is deleted. */
export function createLocalPreviewUrl(blob: Blob): string | undefined {
  if (typeof URL.createObjectURL !== 'function') return undefined;
  return URL.createObjectURL(blob);
}

export async function downloadLocalPreviewUrl(
  signedUrl: string,
  opts: {
    fetchFn?: typeof fetch;
    createObjectUrl?: (blob: Blob) => string;
    validateBlob?: (blob: Blob) => void | Promise<void>;
  } = {},
): Promise<string | undefined> {
  const createObjectUrl = opts.createObjectUrl ?? URL.createObjectURL?.bind(URL);
  const response = await (opts.fetchFn ?? fetch)(signedUrl, {
    credentials: 'omit',
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`preview fetch failed: ${response.status}`);
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    throw new Error(`preview fetch returned ${contentType || 'unknown content'}`);
  }
  const blob = await response.blob();
  await opts.validateBlob?.(blob);
  return createObjectUrl?.(blob);
}

export function revokePagePreviews(pages: PageImage[]): void {
  if (typeof URL.revokeObjectURL !== 'function') return;
  for (const page of pages) {
    if (page.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(page.previewUrl);
    }
  }
}
