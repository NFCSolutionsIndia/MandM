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

// The console connection, when the suite exercises the admin realm. Same
// rule: it may only ever point at mm_test.
const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
if (adminUrl) {
  if (!adminUrl.includes('mm_test')) {
    throw new Error(`Refusing to run: ${adminUrl.split('@')[1]} is not mm_test`);
  }
  process.env.ADMIN_DATABASE_URL = adminUrl;
}
// The delivery engine, when a suite exercises it. Same rule.
const workerUrl = process.env.TEST_WORKER_DATABASE_URL;
if (workerUrl) {
  if (!workerUrl.includes('mm_test')) {
    throw new Error(`Refusing to run: ${workerUrl.split('@')[1]} is not mm_test`);
  }
  process.env.WORKER_DATABASE_URL = workerUrl;
}

process.env.MIGRATION_DATABASE_URL = ownerUrl;
process.env.NODE_ENV = 'test';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  No test may reach a real mail provider.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The auth suites sign in as aarav@example.com, bina@example.com and a dozen
 * other addresses that do not exist. With SMTP configured in `.env` — which
 * it now is, for local development against ZeptoMail — running the suite
 * would send real mail to every one of them, and a provider measures an
 * account by how much of what it sends bounces. One afternoon of `npm test`
 * is enough to get a sending domain suspended.
 *
 * Cleared here rather than guarded inside MailService, for the same reason
 * the database URLs are rewritten here: it is the only point early enough to
 * be unconditional, and it cannot be forgotten by a suite written later.
 *
 * With both gone and NODE_ENV=test, the service logs codes to the console —
 * which is exactly what the suites read them back from anyway. Object storage
 * needs no equivalent: the archive suite replaces StorageService outright.
 *
 * Emptied rather than DELETED, and that distinction is the whole trick:
 * `ConfigModule.forRoot()` runs dotenv again when app.module.ts is imported,
 * and dotenv only skips a key that already exists in `process.env`. Deleting
 * one invites it straight back from the file. An empty string still exists,
 * so it survives — and `validateEnv` strips empty values before parsing, so
 * the service sees no transport at all.
 */
process.env.SMTP_HOST = '';
process.env.SMTP_USERNAME = '';
process.env.SMTP_PASSWORD = '';
process.env.RESEND_API_KEY = '';
