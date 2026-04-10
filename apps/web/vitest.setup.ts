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
