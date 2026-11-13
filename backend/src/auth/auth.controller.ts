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
  UsePipes,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';

import { ZodValidationPipe } from '../common/zod.pipe.js';
import { ActorContext } from '../db/actor-context.js';
import { DbService } from '../db/db.service.js';
import { Public } from './auth.guard.js';
import {
  refreshSchema,
  requestCodeSchema,
  verifyCodeSchema,
  type RefreshDto,
  type RequestCodeDto,
  type VerifyCodeDto,
} from './auth.dto.js';
import { AuthService, type SessionPair } from './auth.service.js';
import { hashToken } from './tokens.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly db: DbService,
  ) {}

  /**
   * Ask for a sign-in code.
   *
   * Always 202, whether or not the address has an account, whether or not it
   * was rate-limited. Any other behaviour turns this into a way to test
   * whether somebody has an account here.
   */
  @Public()
  @Post('request-code')
  @HttpCode(HttpStatus.ACCEPTED)
  @UsePipes(new ZodValidationPipe(requestCodeSchema))
  async requestCode(
    @Body() body: RequestCodeDto,
    @Req() req: FastifyRequest,
  ): Promise<{ status: string }> {
    await this.auth.requestCode(body.email, this.ipHash(req));

    return {
      status: 'If that address can receive mail, a code is on its way.',
    };
  }

  /**
   * Redeem a code and open a session: an access token and a refresh token.
   *
   * One 401 for every failure: wrong code, expired code, too many attempts, no
   * code at all. Distinguishing them would tell an attacker which part of the
   * guess was right.
   */
  @Public()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(verifyCodeSchema))
  async verify(
    @Body() body: VerifyCodeDto,
    @Req() req: FastifyRequest,
    @Headers('user-agent') userAgent?: string,
  ) {
    const result = await this.auth.verifyCode(
      body.email,
      body.code,
      userAgent?.slice(0, 512) ?? null,
      this.ipHash(req),
    );

    if (!result) {
      throw new UnauthorizedException('That code is not valid.');
    }

    const { isNewAccount, ...pair } = result;
    return { ...this.body(pair), isNewAccount, user: pair.user };
  }

  /**
   * Exchange a refresh token for a new pair.
   *
   * Public: the access token has usually expired by the time this is called,
   * which is the point. The refresh token in the body is the credential.
   *
   * One 401 for expired, idle, revoked, unknown and reused alike — and the
   * client's answer to every one of them is the same: sign out. A reused
   * token has also revoked the session it belonged to by the time this
   * returns.
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(refreshSchema))
  async refresh(@Body() body: RefreshDto) {
    const pair = await this.auth.refresh(body.refreshToken);

    if (!pair) {
      throw new UnauthorizedException('Session expired. Sign in again.');
    }

    return { ...this.body(pair), user: pair.user };
  }

  /**
   * The shared part of `/verify` and `/refresh`.
   *
   * The only time either raw token exists outside the client. The database
   * holds their SHA-256 and nothing else.
   */
  private body(pair: SessionPair) {
    return {
      accessToken: pair.accessToken,
      accessExpiresAt: pair.accessExpiresAt.toISOString(),
      refreshToken: pair.refreshToken,
      refreshExpiresAt: pair.refreshExpiresAt.toISOString(),
    };
  }

  /** The signed-in user. The first endpoint that needs an actor to work. */
  @Get('me')
  async me() {
    const rows = await this.db.tx((tx) =>
      tx.execute<{
        id: string;
        email: string;
        username: string;
        name: string;
        plan: string;
        created_at: Date;
      }>(
        sql`SELECT id, email, username, name, plan, created_at
              FROM users
             WHERE id = app_current_user()`,
      ),
    );

    // Note what makes this safe: there is no WHERE clause naming a user id
    // from the request. The row-level security policy restricts it, so this
    // query cannot be made to return somebody else by any input.
    const user = rows.rows[0];
    if (!user) throw new UnauthorizedException();

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
      plan: user.plan,
      createdAt: user.created_at,
      actor: ActorContext.userId(),
    };
  }

  /** Revoke this session. Takes effect on the very next request. */
  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  async signOut(@Headers('authorization') authorization?: string) {
    const token = authorization?.split(' ')[1];
    if (token) await this.auth.signOut(token);
  }

  /** Revoke every other session. The "I lost my phone" button. */
  @Post('sign-out-others')
  @HttpCode(HttpStatus.OK)
  async signOutOthers(@Headers('authorization') authorization?: string) {
    const token = authorization?.split(' ')[1];
    const revoked = token ? await this.auth.signOutOthers(token) : 0;
    return { revoked };
  }

  /**
   * The caller's IP, hashed.
   *
   * Hashed here rather than stored and hashed later, so the raw address never
   * reaches a column. The audit trail needs to correlate accesses, not to know
   * where anybody lives.
   */
  private ipHash(req: FastifyRequest): string | null {
    const ip = req.ip;
    return ip ? hashToken(ip) : null;
  }
}
