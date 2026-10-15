import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import { DbService, type Db } from '../../src/db/db.service.js';
import * as schema from '../../src/db/schema/index.js';

/**
 * The integration-test harness.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  Why this exists: every suite used to hand-write its own list of DELETEs in
 *  foreign-key order.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * That works until a new domain adds a reference to a table an older suite
 * deletes from — and then three suites that test nothing to do with the new
 * domain fail in their setup. It happened the moment `capsule_memories` began
 * referencing `memories`.
 *
 * `resetDatabase()` discovers the tables instead and truncates them in one
 * statement with CASCADE, so PostgreSQL resolves the order. A suite written
 * today keeps working when a domain arrives next month.
 */

export interface Harness {
  /** Connects as the table OWNER, bypassing RLS. For seeding and assertions. */
  ownerPool: Pool;
  /** Connects as `mm_app`. Every policy applies. For the code under test. */
  appPool: Pool;
  db: Db;
  service: DbService;
}

/**
 * Open both connections and bring the schema up to date.
 *
 * Refuses anything that is not `mm_test`: these helpers delete every row, and
 * the cost of being pointed at the wrong database once is somebody's archive.
 */
export async function connect(): Promise<Harness> {
  const ownerUrl = process.env.TEST_MIGRATION_DATABASE_URL;
  const appUrl = process.env.TEST_DATABASE_URL;

  if (!ownerUrl || !appUrl) {
    throw new Error(
      'TEST_DATABASE_URL and TEST_MIGRATION_DATABASE_URL must be set — see ' +
        'the Environment reference in Docs/development/SETUP.md.',
    );
  }

  for (const url of [ownerUrl, appUrl]) {
    if (!url.includes('mm_test')) {
      throw new Error(`Refusing to run: ${url.split('@')[1]} is not mm_test`);
    }
  }

  const ownerPool = new Pool({ connectionString: ownerUrl });
  const appPool = new Pool({ connectionString: appUrl });

  // The real migrations, not a hand-built fixture schema. A fixture would
  // drift, and then start passing tests that production fails.
  await migrate(drizzle(ownerPool), { migrationsFolder: './src/db/migrations' });

  const db = drizzle(appPool, { schema, casing: 'snake_case' });

  return { ownerPool, appPool, db, service: new DbService(db) };
}

/**
 * Empty every application table.
 *
 * `TRUNCATE ... CASCADE` rather than a hand-ordered list of DELETEs: PostgreSQL
 * works out the dependency order itself, which is the whole point. It is also
 * far faster, because it does not walk the rows.
 *
 * `drizzle.__drizzle_migrations` lives in its own schema and is untouched —
 * truncating the ledger would make the next `migrate()` try to recreate
 * everything.
 */
export async function resetDatabase(ownerPool: Pool): Promise<void> {
  const { rows } = await ownerPool.query<{ list: string | null }>(
    `SELECT string_agg(format('%I.%I', schemaname, tablename), ', ') AS list
       FROM pg_tables
      WHERE schemaname = 'public'`,
  );

  if (rows[0]?.list) {
    await ownerPool.query(`TRUNCATE TABLE ${rows[0].list} CASCADE`);
  }
}

/** Close both pools. Vitest hangs on an open handle otherwise. */
export async function disconnect(harness: Harness | undefined): Promise<void> {
  await harness?.ownerPool.end();
  await harness?.appPool.end();
}

/** The PostgreSQL SQLSTATE behind a Drizzle error, which wraps the driver's. */
export function pgCode(error: unknown): string | undefined {
  return (error as { cause?: { code?: string } }).cause?.code;
}
