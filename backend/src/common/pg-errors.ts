import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

/** The PostgreSQL error hiding under a Drizzle wrapper. */
function sqlstate(error: unknown): string | undefined {
  return (error as { cause?: { code?: string }; code?: string }).cause?.code
    ?? (error as { code?: string }).code;
}

/**
 * Turn a PostgreSQL error into the HTTP answer it deserves.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  Without this, a row-level security refusal is an HTTP 500.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A `WITH CHECK` violation RAISES `42501`, it does not return an empty result —
 * so a handler that only checks for a missing row sees an exception instead,
 * and the caller gets "Internal server error" for something the system
 * decided on purpose. That is both a lie and an invitation to retry.
 *
 * **`42501` becomes 404, not 403.** The policy has already decided this row
 * does not exist for this caller; answering "forbidden" would confirm that it
 * exists for somebody, which is exactly what the policy was hiding.
 */
export function rethrowAsHttp(error: unknown): never {
  switch (sqlstate(error)) {
    case '42501':
      throw new NotFoundException();

    case '23505':
      throw new ConflictException('That already exists.');

    case '23514':
      throw new BadRequestException('That value is not allowed here.');

    case '23503':
      throw new BadRequestException('That refers to something which does not exist.');

    default:
      // Genuinely unexpected: let it surface as a 500 with a stack trace,
      // because somebody needs to look at it.
      throw error;
  }
}

/** Run `fn`, translating any PostgreSQL refusal into an HTTP answer. */
export async function translatingPgErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    rethrowAsHttp(error);
  }
}
