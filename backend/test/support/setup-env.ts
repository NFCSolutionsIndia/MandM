import 'dotenv/config';

/**
 * Points the whole integration suite at `mm_test`, before anything imports the
 * application.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  This has to be a setup file, and the reason is a genuine trap.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `ConfigModule.forRoot({...})` sits inside `@Module({ imports: [...] })` in
 * app.module.ts, and decorator metadata is evaluated **when the module is
 * imported** — not when the testing module is compiled. So assigning
 * `process.env.DATABASE_URL` inside `beforeAll` is already too late: the
 * configuration was read while the import statement at the top of the spec was
 * being resolved.
 *
 * A `setupFiles` entry runs before the test file is imported at all, which is
 * the only point early enough.
 *
 * The safety property matters more than the convenience one: with this in
 * place, **no integration test can reach `mm_dev`**, however it is written.
 * The first version of the auth suite asserted against `mm_test` while the
 * application under test quietly wrote to `mm_dev`, and every assertion failed
 * for a reason that had nothing to do with the code being tested.
 */

const appUrl = process.env.TEST_DATABASE_URL;
const ownerUrl = process.env.TEST_MIGRATION_DATABASE_URL;

if (!appUrl || !ownerUrl) {
  throw new Error(
    'TEST_DATABASE_URL and TEST_MIGRATION_DATABASE_URL must be set — see the ' +
      'Environment reference in Docs/development/SETUP.md.',
  );
}

for (const url of [appUrl, ownerUrl]) {
  if (!url.includes('mm_test')) {
    throw new Error(`Refusing to run: ${url.split('@')[1]} is not mm_test`);
  }
}

process.env.DATABASE_URL = appUrl;
process.env.MIGRATION_DATABASE_URL = ownerUrl;
process.env.NODE_ENV = 'test';
