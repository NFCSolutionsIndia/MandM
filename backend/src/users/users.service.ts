import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';

import { rethrowAsHttp, sqlstate } from '../common/pg-errors.js';
import type { Env } from '../config/env.schema.js';
import { DbService } from '../db/db.service.js';
import { StorageService } from '../storage/storage.service.js';
import {
  normalizeUsername,
  suggestionCandidates,
  usernameProblem,
} from './username.js';

type Tx = Parameters<Parameters<DbService['tx']>[0]>[0];

type MeRow = {
  id: string;
  email: string;
  username: string;
  name: string;
  plan: string;
  timezone: string;
  avatar_key: string | null;
  created_at: Date;
  username_changed_at: Date | string | null;
};

/** Why a name cannot be had. `yours` is not here: keeping your own handle is always fine. */
export type UsernameUnavailableReason = 'invalid' | 'reserved' | 'taken';

@Injectable()
export class UsersService {
  private readonly changeDays: number;

  private readonly log = new Logger(UsersService.name);

  constructor(
    private readonly db: DbService,
    private readonly storage: StorageService,
    config: ConfigService<Env, true>,
  ) {
    this.changeDays = config.get('USERNAME_CHANGE_DAYS', { infer: true });
  }

  /** The signed-in user. Row-level security, not a WHERE on a request id, picks the row. */
  async me() {
    const result = await this.db.tx((tx) =>
      tx.execute<MeRow>(
        sql`SELECT u.id, u.email, u.username::text AS username, u.name, u.plan, u.timezone,
                   a.storage_key AS avatar_key, u.created_at, u.username_changed_at
              FROM users u
              LEFT JOIN media_assets a ON a.id = u.avatar_media_id AND a.deleted_at IS NULL
             WHERE u.id = app_current_user()`,
      ),
    );
    const user = result.rows[0];
    if (!user) throw new UnauthorizedException();

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
      plan: user.plan,
      /** IANA zone. "Today" on the calendar and every countdown is in this zone. */
      timezone: user.timezone,
      /** Home's top-right photo. A short-lived signed URL, or null. */
      avatarUrl: user.avatar_key ? await this.avatarUrl(user.avatar_key) : null,
      createdAt: user.created_at,
      usernameChangedAt: this.iso(user.username_changed_at),
      /** When the user may next choose a handle; null means now. */
      usernameChangeableAt: this.nextChange(user.username_changed_at),
    };
  }

  /**
   * Whether `raw` could be the caller's handle, and if not, up to three that
   * could. A malformed name is an answer (`reason: invalid`), not an error:
   * the edit screen calls this on every keystroke.
   */
  async availability(raw: string) {
    const username = normalizeUsername(raw);
    const problem = usernameProblem(username);

    return this.db.tx(async (tx) => {
      let reason: UsernameUnavailableReason | null = problem ? 'invalid' : null;

      if (!reason) {
        const status = await tx.execute<{ status: string }>(
          sql`SELECT app_username_status(${username}::citext) AS status`,
        );
        const s = status.rows[0]?.status;
        if (s === 'reserved' || s === 'taken') reason = s;
      }

      const available = reason === null;
      return {
        username,
        available,
        ...(reason ? { reason } : {}),
        ...(problem ? { message: `Username ${problem}.` } : {}),
        suggestions: available ? [] : await this.freeOf(tx, username),
      };
    });
  }

  /**
   * D-5: choose a new handle, at most once every USERNAME_CHANGE_DAYS.
   * The same handle again is a 200 that spends nothing.
   */
  async changeUsername(username: string) {
    try {
      const result = await this.db.tx((tx) =>
        tx.execute<{ username: string; changed: boolean; changed_at: Date | string | null }>(
          sql`SELECT * FROM app_change_username(${username}::citext, ${this.changeDays})`,
        ),
      );
      const row = result.rows[0]!;
      return {
        username: row.username,
        changed: row.changed,
        usernameChangedAt: this.iso(row.changed_at),
        usernameChangeableAt: this.nextChange(row.changed_at),
      };
    } catch (error) {
      switch (sqlstate(error)) {
        case 'MMU01':
          throw new UnprocessableEntityException({
            message: 'Validation failed',
            errors: [{ field: 'username', message: 'is reserved' }],
          });

        case 'MMU02': {
          const detail = (error as { cause?: { detail?: string } }).cause?.detail;
          throw new HttpException(
            {
              statusCode: HttpStatus.TOO_MANY_REQUESTS,
              message: `You can change your username once every ${this.changeDays} days.`,
              retryAfter: detail ?? null,
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }

        case '23505':
          throw new ConflictException({
            statusCode: HttpStatus.CONFLICT,
            message: 'That username is taken.',
            suggestions: await this.db.tx((tx) => this.freeOf(tx, username)),
          });

        case '23514':
          throw new UnprocessableEntityException({
            message: 'Validation failed',
            errors: [{ field: 'username', message: 'is not a valid username' }],
          });

        default:
          rethrowAsHttp(error);
      }
    }
  }

  /** Raw `execute` returns timestamps as strings; both are accepted. */
  /** A Home screen without the avatar beats no Home screen. */
  private async avatarUrl(key: string): Promise<string | null> {
    try {
      return (await this.storage.presignDownload(key)).url;
    } catch (error) {
      this.log.warn(`avatar URL not signed: ${(error as Error).message}`);
      return null;
    }
  }

  private nextChange(changedAt: Date | string | null): string | null {
    if (!changedAt) return null;
    const next = new Date(new Date(changedAt).getTime() + this.changeDays * 86_400_000);
    return next > new Date() ? next.toISOString() : null;
  }

  private iso(t: Date | string | null): string | null {
    return t === null ? null : new Date(t).toISOString();
  }

  /** Up to three free alternatives to `username`, in the order they were proposed. */
  private async freeOf(tx: Tx, username: string): Promise<string[]> {
    const candidates = suggestionCandidates(username);
    if (candidates.length === 0) return [];
    // One text parameter, split in SQL: a comma can never be in a username.
    const result = await tx.execute<{ c: string }>(
      sql`SELECT c FROM unnest(string_to_array(${candidates.join(',')}, ','))
                 WITH ORDINALITY AS t(c, i)
           WHERE app_username_status(c::citext) = 'available'
           ORDER BY i
           LIMIT 3`,
    );
    return result.rows.map((r) => r.c);
  }
}
