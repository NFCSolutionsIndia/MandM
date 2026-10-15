import {
  CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
  SetMetadata,
  UnauthorizedException,
  type NestMiddleware,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { hashToken } from '../auth/tokens.js';
import { AdminContext } from '../db/actor-context.js';
import { DbService } from '../db/db.service.js';

/** Marks an admin route as reachable without a completed sign-in. */
export const PUBLIC_ADMIN_ROUTE = Symbol('PUBLIC_ADMIN_ROUTE');
export const PublicAdmin = () => SetMetadata(PUBLIC_ADMIN_ROUTE, true);

/**
 * Resolves the console's actor, exactly as `ActorMiddleware` does for users —
 * and into a **separate** storage.
 *
 * One request is never both a user and an admin. Keeping the two apart here
 * means `app_current_user()` is NULL on every admin connection, so no user
 * policy can be satisfied by an admin session and vice versa.
 */
@Injectable()
export class AdminActorMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AdminActorMiddleware.name);

  constructor(private readonly db: DbService) {}

  async use(
    req: FastifyRequest['raw'],
    _res: FastifyReply['raw'],
    next: (error?: unknown) => void,
  ): Promise<void> {
    const header = req.headers.authorization;
    const [scheme, value] = header?.split(' ') ?? [];

    if (!value || scheme?.toLowerCase() !== 'bearer') {
      next();
      return;
    }

    let adminId: string | null = null;
    try {
      // Resolves only a session whose SECOND factor is complete. A token that
      // stopped after the emailed code reaches no admin route at all.
      const result = await this.db.raw.execute<{ user_id: string | null }>(
        sql`SELECT app_resolve_admin_session(${hashToken(value.trim())}) AS user_id`,
      );
      adminId = result.rows[0]?.user_id ?? null;
    } catch (error) {
      this.logger.error(
        `Admin session resolution failed: ${(error as Error).message}`,
      );
      next();
      return;
    }

    if (!adminId) {
      next();
      return;
    }

    AdminContext.run(adminId, () => next());
  }
}

/**
 * Requires a fully authenticated admin.
 *
 * Like `AuthGuard`, this is a 401 rather than the boundary. The boundary is
 * that admin queries run on the `mm_admin` connection with `app.admin_id` set
 * — and with no admin, `app_admin_may_read_content()` is false for every row,
 * so the console would see account metadata and no content regardless.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_ADMIN_ROUTE,
      [context.getHandler(), context.getClass()],
    );

    if (isPublic) return true;

    if (!AdminContext.adminId()) {
      throw new UnauthorizedException('Admin authentication required');
    }

    return true;
  }
}
