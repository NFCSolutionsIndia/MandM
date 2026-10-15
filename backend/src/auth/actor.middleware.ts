import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { ActorContext } from '../db/actor-context.js';
import { DbService } from '../db/db.service.js';
import { hashToken } from './tokens.js';

/**
 * The keystone.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  This is the only place in the application that decides who the actor is.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Everything the schema does — sixty policies, nine `SECURITY DEFINER`
 * helpers, `app_current_user()` — depends on `app.user_id` being set on the
 * transaction. `DbService.tx()` reads it from `ActorContext`, and this
 * middleware is what puts it there.
 *
 * MIDDLEWARE, not a guard. A guard returns a boolean and cannot wrap the rest
 * of the request, which is exactly what `AsyncLocalStorage.run()` requires: the
 * actor has to be visible to every `await` beneath the handler, and invisible
 * to every other request on the process.
 *
 * It never rejects. An unauthenticated request simply proceeds with no actor,
 * and the database then shows it nothing — so a route that forgets its guard
 * leaks an empty list rather than somebody's archive. Rejection is the
 * guard's job; identification is this one's.
 */
@Injectable()
export class ActorMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ActorMiddleware.name);

  /** How long a session lives, and how far each use extends it. */
  private static readonly SESSION_DAYS = 30;

  constructor(private readonly db: DbService) {}

  async use(
    req: FastifyRequest['raw'] & { authUserId?: string },
    _res: FastifyReply['raw'],
    next: (error?: unknown) => void,
  ): Promise<void> {
    const raw = this.bearer(req.headers.authorization);

    if (!raw) {
      next();
      return;
    }

    const tokenHash = hashToken(raw);

    let userId: string | null = null;
    try {
      // `app_resolve_session` is SECURITY DEFINER and checks revocation and
      // expiry itself. It is the one query that legitimately runs with no
      // actor, and it returns a single uuid — it cannot list sessions and
      // cannot be asked about a user.
      const result = await this.db.raw.execute<{ user_id: string | null }>(
        sql`SELECT app_resolve_session(${tokenHash}) AS user_id`,
      );
      userId = result.rows[0]?.user_id ?? null;
    } catch (error) {
      // A database problem must not look like a valid session.
      this.logger.error(
        `Session resolution failed: ${(error as Error).message}`,
      );
      next();
      return;
    }

    if (!userId) {
      // An invalid or expired token is treated exactly like no token. Saying
      // "that session has expired" would confirm the token was once real.
      next();
      return;
    }

    // Extend a session that is being used. The function is a no-op unless the
    // expiry is actually approaching, so this is not a write on every request.
    void this.db.raw
      .execute(
        sql`SELECT app_touch_session(${tokenHash}, ${ActorMiddleware.SESSION_DAYS})`,
      )
      .catch((error: Error) =>
        this.logger.warn(`Session touch failed: ${error.message}`),
      );

    req.authUserId = userId;

    // Everything downstream — guards, interceptors, the handler, every service
    // it calls — now runs inside this actor.
    ActorContext.run(userId, () => next());
  }

  /** `Authorization: Bearer <token>`, and nothing else. */
  private bearer(header: string | undefined): string | null {
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    if (!value || scheme.toLowerCase() !== 'bearer') return null;
    return value.trim() || null;
  }
}
