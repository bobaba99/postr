/**
 * useStorageUrl — resolves a "storage://" imageSrc to a signed URL.
 *
 * If the src is a regular URL or base64 data URL, returns it as-is.
 * If it's a storage path, resolves it to a Supabase signed URL with
 * caching (50 min TTL). Returns null while resolving.
 */
import { useEffect, useState } from 'react';
import { isStoragePath, resolveStorageUrl } from '@/data/posterImages';

export function useStorageUrl(src: string | null): string | null {
  const [resolved, setResolved] = useState<string | null>(() => {
    // Synchronous fast path for non-storage URLs
    if (!src || !isStoragePath(src)) return src;
    return null; // will resolve async
  });

  useEffect(() => {
    if (!src) { setResolved(null); return; }
    if (!isStoragePath(src)) { setResolved(src); return; }

    let cancelled = false;
    resolveStorageUrl(src).then((url) => {
      if (!cancelled) setResolved(url);
    });
    return () => { cancelled = true; };
  }, [src]);

  return resolved;
}
