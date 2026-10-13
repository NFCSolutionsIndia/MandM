import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Integration tests — these talk to a real PostgreSQL.
 *
 * Kept in a separate config so `npm test` stays fast and runnable without
 * Docker, while `npm run test:e2e` is the suite that proves the things only a
 * real database can prove: row-level security, constraints, triggers.
 *
 * `fileParallelism: false` because these share one database. Two suites
 * truncating the same tables concurrently fail in ways that look like flaky
 * tests rather than what they are.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    environment: 'node',
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    fileParallelism: false,

    // A migration run plus a schema reset is slower than a unit test.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
