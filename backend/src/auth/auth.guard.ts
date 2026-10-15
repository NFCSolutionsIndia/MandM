import {
  CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ActorContext } from '../db/actor-context.js';

/** Marks a route as reachable without a session. */
export const PUBLIC_ROUTE = Symbol('PUBLIC_ROUTE');
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);

/**
 * Requires an actor, and nothing more.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  This guard is a 401, not a security boundary.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * It exists so an unauthenticated request gets an honest error instead of a
 * confusing empty list. The actual protection is row-level security: if this
 * guard were deleted tomorrow, every handler would still return nothing,
 * because `app.user_id` would be unset and sixty policies would deny.
 *
 * That ordering matters. A system whose authorization lives in guards fails
 * open the first time somebody forgets one. This one fails closed, and the
 * guard is a courtesy on top.
 *
 * Registered globally, so a new route is protected by default and opting out
 * is an explicit `@Public()` somebody has to write and a reviewer can see.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    if (!ActorContext.userId()) {
      throw new UnauthorizedException('Authentication required');
    }

    return true;
  }
}
