/**
 * Test-only stand-in for `pdfjs-dist/build/pdf.worker.mjs?url`.
 *
 * Vite 8 denies transforming that `?url` request from the hoisted
 * workspace node_modules, so any suite that transitively imports
 * `src/import/pdfImport.ts` fails to load. Under jsdom the worker URL
 * is never fetched (pdfjs itself is mocked per-test), so a stable
 * placeholder string is enough. Aliased in vite.config.ts `test.alias`.
 */
export default 'about:blank#pdf-worker-stub';
