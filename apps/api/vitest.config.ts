import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// NestJS relies on decorator metadata (emitDecoratorMetadata) for DI, which
// esbuild (vitest's default transformer) does not emit. unplugin-swc compiles
// with SWC, which does — so the Nest container resolves providers correctly.
export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Auth tests share one Postgres; run files serially to keep them isolated.
    fileParallelism: false,
  },
  plugins: [swc.vite()],
});
