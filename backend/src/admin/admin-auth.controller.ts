import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { Public } from '../auth/auth.guard.js';
import { hashToken } from '../auth/tokens.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { AdminContext } from '../db/actor-context.js';
import { DbService } from '../db/db.service.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminGuard, PublicAdmin } from './admin.middleware.js';

const emailField = z.string().trim().toLowerCase().email().max(320);
const codeField = z.string().trim().regex(/^\d{6}$/, 'must be six digits');

const requestCodeSchema = z.object({ email: emailField });
const verifyEmailSchema = z.object({ email: emailField, code: codeField });
const verifyTotpSchema = z.object({ code: codeField });

/**
 * The console's own auth realm, under its own namespace.
 *
 * `@Public()` exempts these from the USER guard — a customer session must
 * never satisfy an admin route — while `AdminGuard` applies the console's own
 * rule. Two guards, two realms, no overlap.
 */
@Controller('admin/v1/auth')
@UseGuards(AdminGuard)
@Public()
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly db: DbService,
  ) {}

  /** Always 202. This endpoint must not become a way to enumerate staff. */
  @PublicAdmin()
  @Post('request-code')
  @HttpCode(HttpStatus.ACCEPTED)
  @UsePipes(new ZodValidationPipe(requestCodeSchema))
  async requestCode(
    @Body() body: { email: string },
    @Req() req: FastifyRequest,
  ) {
    await this.auth.requestCode(body.email, this.ipHash(req));
    return { status: 'If that address can receive mail, a code is on its way.' };
  }

  /**
   * Factor one. The token returned here can do exactly one thing: present a
   * TOTP code. It reaches no other admin route.
   */
  @PublicAdmin()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(verifyEmailSchema))
  async verifyEmail(
    @Body() body: { email: string; code: string },
    @Req() req: FastifyRequest,
    @Headers('user-agent') userAgent?: string,
  ) {
    const result = await this.auth.verifyEmailCode(
      body.email,
      body.code,
      userAgent?.slice(0, 512) ?? null,
      this.ipHash(req),
    );

    // One flat 401 for a wrong code, an expired one, an address that is not
    // staff, and a deactivated account alike.
    if (!result) throw new UnauthorizedException('That code is not valid.');

    return {
      mfaToken: result.mfaToken,
      mfaRequired: true,
      enrolmentRequired: result.enrolmentRequired,

      /**
       * Present exactly once, on first sign-in, and never recoverable.
       *
       * Re-enrolment is refused by `app_admin_enrol_totp` once a secret
       * exists — otherwise anybody holding a first-factor token could replace
       * the second factor with one of their own, which would make the second
       * factor decorative.
       */
      enrolment: result.enrolment,
    };
  }

  /** Factor two. The same token becomes usable. */
  @PublicAdmin()
  @Post('verify-totp')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(verifyTotpSchema))
  async verifyTotp(
    @Body() body: { code: string },
    @Headers('authorization') authorization?: string,
  ) {
    const mfaToken = authorization?.split(' ')[1];
    if (!mfaToken) throw new UnauthorizedException();

    const result = await this.auth.verifyTotp(mfaToken, body.code);
    if (!result) throw new UnauthorizedException('That code is not valid.');

    return { token: result.token, expiresInHours: 8 };
  }

  /** The signed-in admin, read on the console's own connection. */
  @Get('me')
  async me() {
    const rows = await this.db.adminTx((tx) =>
      tx.execute<{
        id: string;
        email: string;
        role: string;
        last_login_at: Date | null;
      }>(
        sql`SELECT a.id, a.email, r.name AS role, a.last_login_at
              FROM admin_users a
              JOIN roles r ON r.id = a.role_id
             WHERE a.id = app_current_admin()`,
      ),
    );

    const admin = rows.rows[0];
    if (!admin) throw new UnauthorizedException();

    const permissions = await this.db.adminTx((tx) =>
      tx.execute<{ module: string; action: string }>(
        sql`SELECT p.module, p.action
              FROM permissions p
              JOIN admin_users a ON a.role_id = p.role_id
             WHERE a.id = app_current_admin()
             ORDER BY p.module, p.action`,
      ),
    );

    return {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      lastLoginAt: admin.last_login_at,
      permissions: permissions.rows,
      actor: AdminContext.adminId(),
    };
  }

  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  async signOut(@Headers('authorization') authorization?: string) {
    const token = authorization?.split(' ')[1];
    if (token) await this.auth.signOut(token);
  }

  private ipHash(req: FastifyRequest): string | null {
    return req.ip ? hashToken(req.ip) : null;
  }
}
