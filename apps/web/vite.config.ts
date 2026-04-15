/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

// Resolve a stable build identifier that changes every deploy:
// prefer VERCEL_GIT_COMMIT_SHA (injected by Vercel), fall back to
// local `git rev-parse`, and last resort a timestamp so dev builds
// still get a unique value.
function resolveBuildId(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12);
  }
  try {
    return execSync('git rev-parse --short=12 HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return `dev-${Date.now()}`;
  }
}

const BUILD_ID = resolveBuildId();

// Writes `public/version.json` so clients can diff the live deploy's
// build id against the one baked into their bundle. Runs synchronously
// at config-load time so it covers both `vite build` AND `vite dev` —
// otherwise dev clients fetch a stale committed version.json while
// __BUILD_ID__ resolves to the current git HEAD, so the "new version
// available" banner stays stuck on forever in local dev.
function writeVersionFile() {
  const outPath = path.resolve(__dirname, 'public/version.json');
  fs.writeFileSync(
    outPath,
    JSON.stringify({
      buildId: BUILD_ID,
      builtAt: new Date().toISOString(),
    }),
  );
}
writeVersionFile();

export default defineConfig({
  plugins: [react()],
  define: {
    // Baked into the bundle so the client has something to compare
    // against whatever /version.json currently advertises.
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: false,
  },
});
