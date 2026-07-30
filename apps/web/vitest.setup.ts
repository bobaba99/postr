import '@testing-library/jest-dom/vitest';

// jsdom doesn't ship window.matchMedia. GSAP's gsap.matchMedia()
// (used by motion/index.ts for the prefers-reduced-motion gate)
// calls it at module load, so any test that imports the motion
// module would otherwise crash. Polyfill with a no-op that
// reports "no match" for everything.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// jsdom's Blob never grew the async readers (arrayBuffer/text/stream),
// but app code calls file.arrayBuffer() before handing bytes to pdfjs
// or unzipper. Back it with FileReader, which jsdom does implement.
if (typeof Blob !== 'undefined' && typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}
