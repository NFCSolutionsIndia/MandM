import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Unit tests — fast, no database, no network.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  Why Vitest and not Jest.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every dependency this service runs on is ESM-only: NestJS 12, Drizzle, Zod.
 * Jest under CommonJS cannot load them — `Must use import to load ES Module` —
 * which is why the scaffolded test setup never ran a single test. Vitest is
 * ESM-native, so the test runner and the runtime agree about what a module is.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  Why SWC and not Vitest's default esbuild.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * esbuild does not implement `emitDecoratorMetadata`. NestJS resolves
 * `constructor(private readonly db: DbService)` by reading the type metadata
 * the TypeScript compiler emits — without it, dependency injection fails at
 * runtime with "Nest can't resolve dependencies", in tests only. SWC emits it.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    environment: 'node',
    root: './',
    include: ['src/**/*.spec.ts'],
  },
});
