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
   * Not read by anything yet — declared now so that wiring the database is a
   * configuration error at boot rather than a runtime error in the first
   * query. `.url()` alone would accept `https://example.com`, so the protocol
   * is checked explicitly.
   */
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (v) => v.startsWith('postgres://') || v.startsWith('postgresql://'),
      'DATABASE_URL must be a postgres:// connection string',
    ),
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
