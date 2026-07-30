import { defineConfig, configDefaults } from 'vitest/config';

// After `npm run build` (tsc → dist/), the compiled dist/**/*.test.js
// copies match the default include glob, so the whole suite would run
// twice and flake under parallel load. Keep the default include
// behavior; just exclude the build output.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/dist/**'],
  },
});
