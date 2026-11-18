import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql, type SQL } from 'drizzle-orm';

import { decodeCursor, encodeCursor } from '../common/cursor.js';
import type { Env } from '../config/env.schema.js';
import { DbService } from '../db/db.service.js';
import type { ListSessionsDto, SearchUsersDto } from './users.dto.js';

type UserRow = {
  id: string;
  username: string;
  email: string;
  phone: string | null;
  plan: string;
  created_at: string;
  last_active_at: string | null;
  deleted_at: string | null;
  email_verified: boolean;
  phone_verified: boolean;
  has_passkey: boolean;
};

type SessionRow = {
  id: string;
  user_agent: string | null;
  created_at: string;
  last_active_at: string;
  access_expires_at: string;
  refresh_expires_at: string;
  revoked_at: string | null;
};

const iso = (v: string | Date | null) => (v === null ? null : new Date(v).toISOString());

/**
 * The console's Users pages (ADM-02).
 *
 * Runs on the `mm_admin` connection. Account metadata only: migration 0024
 * grants session columns one by one, so token hashes and hashed IPs cannot be
 * selected here even by mistake, and nothing in a vault is touched.
 *
 * Every call writes an audit row in the same transaction as the read or the
 * revoke, so a lookup that returned data always left a record.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly db: DbService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async search(query: SearchUsersDto) {
    const where: SQL[] = [];
    if (query.q) {
      const pattern = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const match: SQL[] = [
        sql`u.email::text ILIKE ${pattern}`,
        sql`u.username::text ILIKE ${pattern}`,
        sql`u.phone ILIKE ${pattern}`,
      ];
      // "+91 98480 12345", "9848012345" and "98480-12345" are one number.
      const digits = query.q.replace(/\D/g, '');
      if (digits.length >= 3) {
        match.push(sql`regexp_replace(u.phone, '\\D', '', 'g') LIKE ${`%${digits}%`}`);
      }
      where.push(sql`(${sql.join(match, sql` OR `)})`);
    }
    if (query.cursor) {
      const [createdAt, id] = decodeCursor(query.cursor, ['s', 's']);
      where.push(sql`(u.created_at, u.id) < (${createdAt}::timestamptz, ${id}::uuid)`);
    }

    return this.db.adminTx(async (tx) => {
      const result = await tx.execute<UserRow>(sql`
        SELECT u.id, u.username::text AS username, u.email::text AS email, u.phone,
               u.plan, u.created_at, u.deleted_at,
               GREATEST(u.last_seen_at,
                        (SELECT max(s.last_active_at) FROM sessions s WHERE s.user_id = u.id))
                 AS last_active_at,
               u.email_verified_at IS NOT NULL AS email_verified,
               u.phone_verified_at IS NOT NULL AS phone_verified,
               EXISTS (SELECT 1 FROM passkey_credentials p WHERE p.user_id = u.id) AS has_passkey
          FROM users u
         ${where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``}
         ORDER BY u.created_at DESC, u.id DESC
         LIMIT ${query.limit + 1}`);

      const rows = result.rows.slice(0, query.limit);
      const last = rows.at(-1);

      await tx.execute(sql`
        SELECT app_admin_audit_read('admin.users.searched', NULL,
          ${JSON.stringify({ q: query.q ?? null, page: Boolean(query.cursor), results: rows.length })}::jsonb)`);

      return {
        items: rows.map((r) => ({
          id: r.id,
          username: r.username,
          email: r.email,
          phone: r.phone,
          channels: [
            ...(r.email_verified ? ['email'] : []),
            ...(r.phone_verified ? ['phone'] : []),
            ...(r.has_passkey ? ['passkey'] : []),
          ],
          plan: r.plan,
          createdAt: iso(r.created_at),
          lastActiveAt: iso(r.last_active_at),
          deletedAt: iso(r.deleted_at),
        })),
        nextCursor:
          result.rows.length > query.limit && last
            ? encodeCursor([iso(last.created_at)!, last.id])
            : null,
      };
    });
  }

  async sessions(userId: string, query: ListSessionsDto) {
    const idleDays = this.config.get('SESSION_IDLE_DAYS', { infer: true });
    const where: SQL[] = [sql`s.user_id = ${userId}`];
    if (query.cursor) {
      const [createdAt, id] = decodeCursor(query.cursor, ['s', 's']);
      where.push(sql`(s.created_at, s.id) < (${createdAt}::timestamptz, ${id}::uuid)`);
    }

    return this.db.adminTx(async (tx) => {
      const user = await tx.execute(sql`SELECT 1 FROM users WHERE id = ${userId}`);
      if (user.rows.length === 0) throw new NotFoundException('User not found.');

      const result = await tx.execute<SessionRow>(sql`
        SELECT s.id, s.user_agent, s.created_at, s.last_active_at,
               s.access_expires_at, s.refresh_expires_at, s.revoked_at
          FROM sessions s
         WHERE ${sql.join(where, sql` AND `)}
         ORDER BY s.created_at DESC, s.id DESC
         LIMIT ${query.limit + 1}`);

      const rows = result.rows.slice(0, query.limit);
      const last = rows.at(-1);

      await tx.execute(sql`
        SELECT app_admin_audit_read('admin.user.sessions_viewed', ${userId}::uuid,
          ${JSON.stringify({ results: rows.length })}::jsonb)`);

      const now = Date.now();
      return {
        items: rows.map((r) => {
          // A session ends at whichever comes first: the refresh token's
          // expiry, or SESSION_IDLE_DAYS without use.
          const idleEnd = new Date(r.last_active_at).getTime() + idleDays * 86_400_000;
          const expiresAt = new Date(Math.min(new Date(r.refresh_expires_at).getTime(), idleEnd));
          const revoked = r.revoked_at !== null;
          return {
            id: r.id,
            userAgent: r.user_agent,
            createdAt: iso(r.created_at),
            lastActiveAt: iso(r.last_active_at),
            expiresAt: expiresAt.toISOString(),
            revoked,
            revokedAt: iso(r.revoked_at),
            active: !revoked && expiresAt.getTime() > now,
          };
        }),
        nextCursor:
          result.rows.length > query.limit && last
            ? encodeCursor([iso(last.created_at)!, last.id])
            : null,
      };
    });
  }

  /** Ends every live session. 404 for an unknown user; `revoked` may be 0. */
  async revokeAll(userId: string) {
    return this.db.adminTx(async (tx) => {
      const result = await tx.execute<{ revoked: number | null }>(
        sql`SELECT app_admin_revoke_user_sessions(${userId}::uuid) AS revoked`,
      );
      const revoked = result.rows[0]?.revoked ?? null;
      if (revoked === null) throw new NotFoundException('User not found.');
      return { userId, revoked: Number(revoked) };
    });
  }
}
