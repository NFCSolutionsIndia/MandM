import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration.
 *
 * This config is for GENERATING migrations only — it never applies them. SQL is
 * applied by `npm run db:migrate`, so CI, a container entrypoint and a developer
 * machine all run the same code path and fail the same way.
 *
 * `dotenv/config` is imported for its side effect: drizzle-kit is a standalone
 * CLI, not the Nest application, so nothing has loaded `.env` for it.
 */
export default defineConfig({
  dialect: 'postgresql',

  // Where the table definitions live. Drizzle reads these TypeScript files and
  // diffs them against the last snapshot to produce a migration.
  schema: './src/db/schema/index.ts',

  // Generated SQL and the snapshots drizzle-kit diffs against.
  out: './src/db/migrations',

  dbCredentials: {
    // The OWNER credential, never the application one: mm_app cannot create
    // a table, and the credential that can has no business in an API container.
    url: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL!,
  },

  // TypeScript fields are camelCase; database columns are snake_case. Setting
  // this means a column name is derived rather than spelled twice, so the two
  // cannot disagree.
  casing: 'snake_case',

  // Print the SQL being generated. Worth leaving on: reading the SQL is how you
  // notice that an "add a column" change is secretly a table rewrite.
  verbose: true,

  // Ask before anything destructive. Drizzle emits a rename as DROP + CREATE
  // unless told otherwise, and on a table holding irreplaceable family media
  // that must never happen unattended.
  strict: true,
});
