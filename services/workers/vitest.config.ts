import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Tests share one Postgres/Redis; run files serially.
    fileParallelism: false,
  },
});
