import { z } from 'zod';

/**
 * The shape of this service's environment.
 *
 * Every variable the backend reads is declared here and nowhere else. If a
 * variable is not in this schema, no code may read it — that is what makes
 * `.env.example` trustworthy as documentation rather than a stale guess.
 *
 * This runs once, at boot, before the application accepts a request. A missing
 * or malformed value stops the process with a readable message instead of
 * surfacing hours later as an unexplained failure inside a request.
 */

/** A PostgreSQL connection string. `.url()` alone would accept `https://…`. */
const postgresUrl = z
  .string()
  .url()
  .refine(
    (v) => v.startsWith('postgres://') || v.startsWith('postgresql://'),
    'must be a postgres:// connection string',
  );

export const envSchema = z.object({
  /**
   * Narrowed to a union rather than a plain string: `NODE_ENV=prodcution`
   * would otherwise silently disable every `=== 'production'` guard in the
   * codebase, in production, with nothing to indicate why.
   */
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  /** Coerced, because every environment variable arrives as a string. */
  PORT: z.coerce.number().int().positive().default(3000),

  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  The APPLICATION credential. This is `mm_app`, never `postgres`.
   * ═══════════════════════════════════════════════════════════════════════
   *
   * Row-level security is bypassed for a superuser and for a table's owner.
   * Pointing this at `postgres` would leave every policy in place, enforcing
   * nothing, with no error and no test failure to say so — see migration 0002.
   *
   * `mm_app` owns no tables and cannot create them, so it also cannot be the
   * credential a migration runs under.
   */
  DATABASE_URL: postgresUrl,

  /**
   * The MIGRATION credential — the table owner, used only by drizzle-kit.
   *
   * Optional on purpose. Migrations run as a separate task on a server, and
   * the API container has no business holding a credential that can DROP a
   * table. A deploy that injects only `DATABASE_URL` must still boot.
   */
  MIGRATION_DATABASE_URL: postgresUrl.optional(),

  /**
   * Connections per process.
   *
   * Deliberately small. Each container holds up to this many, and the fleet is
   * sized in dozens of containers — so the real figure at the database is
   * `containers × DB_POOL_MAX`, and Aurora enforces a hard ceiling on it. A
   * pool of 10 per process is already 720 connections across 72 containers.
   *
   * More connections do not mean more throughput: past the server's core count
   * they mean more context switching and worse latency for everyone.
   */
  DB_POOL_MAX: z.coerce.number().int().positive().max(100).default(10),

  /**
   * Kill any single statement that runs longer than this.
   *
   * Without it, one pathological query holds a connection until the client
   * gives up — and under load that is how a slow query becomes an outage.
   * Reports and exports that legitimately take longer get their own role.
   */
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

  /**
   * Kill a transaction left open and idle.
   *
   * An abandoned open transaction holds its locks and pins the oldest row
   * version, which blocks vacuum and bloats the table indefinitely. This is
   * the backstop for a handler that forgets to commit.
   */
  DB_IDLE_TX_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  /**
   * The integration suite's database. Optional — the running service never
   * reads these, and a production task has no reason to hold them.
   *
   * Declared here anyway because this schema is the only inventory of what the
   * project's environment contains; a variable that lives nowhere is a variable
   * nobody can audit.
   */
  TEST_DATABASE_URL: postgresUrl.optional(),
  TEST_MIGRATION_DATABASE_URL: postgresUrl.optional(),
});

/** The validated environment, as a type. Derived — never hand-written. */
export type Env = z.infer<typeof envSchema>;

/**
 * Validate `process.env` against the schema.
 *
 * Passed to `ConfigModule.forRoot({ validate })`, which calls this at startup
 * and aborts the bootstrap if it throws.
 *
 * The error lists *every* problem rather than only the first, because fixing
 * configuration one failed boot at a time is miserable.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');

    // The message names the variable and the problem, never the value:
    // this reaches logs and error trackers, and DATABASE_URL holds a password.
    throw new Error(
      `Invalid environment configuration:\n${problems}\n\n` +
        'See backend/.env.example for the expected shape.',
    );
  }

  return parsed.data;
}
