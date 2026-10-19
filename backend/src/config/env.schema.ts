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
   * The CONSOLE credential. This is `mm_admin`.
   *
   * A third connection, because the admin realm is a different principal
   * with different policies: `mm_admin` can read any account and no
   * content, unless a live break-glass grant says otherwise. Routing the
   * console through `mm_app` would make every admin query subject to
   * `app.user_id` instead, which is the wrong question entirely.
   *
   * Optional, so a deployment that serves only the mobile API need not
   * hold a credential the console uses.
   */
  ADMIN_DATABASE_URL: postgresUrl.optional(),

  /**
   * The DELIVERY ENGINE credential. This is `mm_worker`.
   *
   * A fourth connection, because the worker answers a different question
   * again: it may claim jobs and read only the memories inside a capsule
   * that is actually in flight. Routing it through `mm_app` would make
   * every query depend on `app.user_id`, and the worker has no user.
   *
   * Optional, so the API container need not hold it.
   */
  WORKER_DATABASE_URL: postgresUrl.optional(),

  /** How long a claimed job is leased before the reaper may take it back. */
  WORKER_LEASE_SECONDS: z.coerce.number().int().positive().default(300),

  /** Jobs claimed per tick. Small, so one slow batch cannot stall the loop. */
  WORKER_BATCH_SIZE: z.coerce.number().int().positive().max(500).default(25),

  /** Seconds between ticks when the queue came back empty. */
  WORKER_IDLE_SECONDS: z.coerce.number().int().positive().default(5),

  /**
   * 32 bytes, base64, for the `_enc` columns on `admin_users`.
   *
   * A TOTP secret cannot be hashed — the server has to reproduce it to
   * check a code — so it is encrypted with a key that lives OUTSIDE the
   * database. That is the whole point: a leaked backup is then not enough
   * to generate second factors.
   *
   * Generate with:
   *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   */
  ADMIN_ENCRYPTION_KEY: z
    .string()
    .optional()
    .refine(
      (v) => v === undefined || Buffer.from(v, 'base64').length === 32,
      'must decode to exactly 32 bytes of base64',
    ),

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

  // ─── Email ─────────────────────────────────────────────────────────────

  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  Two ways to send, and the absence of BOTH is what is meaningful.
   * ═══════════════════════════════════════════════════════════════════════
   *
   * SMTP is tried first, then Resend. With neither, the service logs codes to
   * the console in development and REFUSES to send in production — a deploy
   * that silently logged sign-in codes instead of mailing them would be a
   * breach, not a bug.
   *
   * Two transports rather than one because a capsule that arrives is the
   * product, and one vendor's bad afternoon must not be the reason it does
   * not. SMTP is the lowest common denominator: every provider speaks it, so
   * changing vendor is a change to this file rather than to the code.
   */
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().max(65_535).default(587),
  SMTP_USERNAME: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),

  /**
   * Implicit TLS from the first byte (port 465) rather than STARTTLS.
   *
   * Derived from the port when absent, which is right for every provider
   * worth using. Either way the connection is encrypted — nodemailer will
   * not fall back to plaintext, and this is a password travelling the wire.
   */
  SMTP_SECURE: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === true || v === 'true')),

  RESEND_API_KEY: z.string().min(1).optional(),

  /** The envelope sender. Must be a domain verified with the provider. */
  MAIL_FROM: z.string().optional().default('Moments & Memories <noreply@localhost>'),

  // ─── Object storage ────────────────────────────────────────────────────
  //
  // Cloudflare R2, which speaks the S3 API. Chosen for zero egress fees:
  // this product serves 4K video back to the people who uploaded it, and on
  // S3 the egress alone can exceed the subscription price.

  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET: z.string().min(1).optional(),

  /**
   * An explicit endpoint, for anything S3-compatible that is not R2 —
   * MinIO locally, or a migration to S3 later. Derived from the account id
   * when absent.
   */
  R2_ENDPOINT: z.string().url().optional(),

  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  How long a signed media URL lives. FIVE MINUTES, and this is a
   *  security parameter rather than a tuning knob.
   * ═══════════════════════════════════════════════════════════════════════
   *
   * Revoking a share link stops the next request immediately, but a signed
   * URL already handed out keeps working until it expires. That window IS
   * this number: real exposure after revocation is bounded to minutes
   * rather than forever.
   *
   * Raising it for convenience silently lengthens that window for every
   * share in the product, which is why it has a hard ceiling here.
   */
  MEDIA_URL_TTL_SECONDS: z.coerce.number().int().positive().max(900).default(300),

  /** How long a client has to finish an upload it started. */
  UPLOAD_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),
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
  /**
   * An empty variable means UNSET, not "set to nothing".
   *
   * `.env` files are full of `R2_ACCESS_KEY_ID=` lines waiting for a value,
   * and dotenv reads those as an empty string. Without this, a placeholder
   * somebody has not filled in yet fails an OPTIONAL variable's `.min(1)` and
   * refuses to boot — which is a confusing way to say "this is still blank",
   * and tempts people to delete the line and forget it exists.
   *
   * A required variable still fails, but now says "required" rather than
   * "too small", which is the truth.
   */
  const present = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== ''),
  );

  const parsed = envSchema.safeParse(present);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');

    // The message names the variable and the problem, never the value:
    // this reaches logs and error trackers, and DATABASE_URL holds a password.
    throw new Error(
      `Invalid environment configuration:\n${problems}\n\n` +
        'See Docs/development/SETUP.md for the full template.',
    );
  }

  return parsed.data;
}
