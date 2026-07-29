import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `npm run build` emits test JavaScript under dist/. Never discover that
    // stale build output alongside the TypeScript source suites.
    exclude: ['dist/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['src/review.ts', 'src/review/**/*.ts'],
      thresholds: {
        statements: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
