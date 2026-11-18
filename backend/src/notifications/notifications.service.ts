import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';

import { decodeCursor, encodeCursor } from '../common/cursor.js';
import { DbService } from '../db/db.service.js';
import {
  NON_SUPPRESSIBLE_NOTIFICATIONS,
  NOTIFICATION_TYPE,
  type NotificationType,
} from '../shared/enums.js';
import { StorageService } from '../storage/storage.service.js';
import type {
  ListNotificationsDto,
  NotificationItem,
  NotificationPayload,
  QuietHoursDto,
} from './notifications.dto.js';

type Row = {
  id: string;
  type: NotificationType;
  payload: NotificationPayload | null;
  deep_link: string | null;
  read_at: Date | string | null;
  created_at: Date | string;
  cursor_at: string;
  member_id: string | null;
  member_name: string | null;
  member_nickname: string | null;
  avatar_key: string | null;
};

/** What a row says when the job that wrote it gave no title. */
const DEFAULT_TITLE: Record<NotificationType, string> = {
  capsule_delivered: 'Your capsule was delivered',
  capsule_opened: 'Your capsule was opened',
  capsule_reply: 'You have a reply',
  occasion_reminder: 'An occasion is coming up',
  on_this_day: 'On this day',
  memory_added: 'A memory was added',
  vault_invite: 'You were invited to a vault',
  storage_warning: 'Your storage is nearly full',
  capsule_failed: 'A capsule could not be delivered',
  security_alert: 'Security alert',
  billing: 'Billing update',
};

const SUPPRESSIBLE = NOTIFICATION_TYPE.filter(
  (t) => !(NON_SUPPRESSIBLE_NOTIFICATIONS as readonly string[]).includes(t),
);

/**
 * The notification centre (BE-12): the bell's dot, the list, read state and
 * quiet hours.
 *
 * Request handlers only ever READ notifications and mark them read. Creating
 * one is the background jobs' business (policy `notifications_mark_read` is
 * the app's only write), so the product cannot be made to tell a user
 * something it never decided.
 */
@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);

  constructor(
    private readonly db: DbService,
    private readonly storage: StorageService,
  ) {}

  /** Newest first, keyset-paged on (created_at, id). */
  async list(query: ListNotificationsDto) {
    const where: SQL[] = [sql`n.user_id = app_current_user()`];
    if (query.unread) where.push(sql`n.read_at IS NULL`);
    if (query.cursor) {
      const [at, id] = decodeCursor(query.cursor, ['s', 's']);
      where.push(sql`(n.created_at, n.id) < (${at}::timestamptz, ${id}::uuid)`);
    }

    const result = await this.db.tx((tx) =>
      tx.execute<Row>(sql`
        SELECT n.id, n.type, n.payload, n.deep_link, n.read_at, n.created_at,
               -- Microseconds survive here; a JS Date would round them away
               -- and the cursor would skip rows created in the same millisecond.
               to_char(n.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at,
               m.id AS member_id, m.name AS member_name, m.nickname AS member_nickname,
               a.storage_key AS avatar_key
          FROM notifications n
          LEFT JOIN members m
            ON m.id = CASE WHEN (n.payload ->> 'memberId') ~* '^[0-9a-f-]{36}$'
                           THEN (n.payload ->> 'memberId')::uuid END
          LEFT JOIN media_assets a ON a.id = m.avatar_media_id AND a.deleted_at IS NULL
         WHERE ${sql.join(where, sql` AND `)}
         ORDER BY n.created_at DESC, n.id DESC
         LIMIT ${query.limit + 1}`),
    );

    const rows = result.rows.slice(0, query.limit);
    const last = rows.at(-1);
    return {
      items: await Promise.all(rows.map((r) => this.shape(r))),
      nextCursor:
        result.rows.length > query.limit && last
          ? encodeCursor([last.cursor_at, last.id])
          : null,
    };
  }

  /** The bell's dot. Served by the partial index `ix_notifications_unread`. */
  async unreadCount(): Promise<{ unread: number }> {
    const result = await this.db.tx((tx) =>
      tx.execute<{ n: string }>(sql`
        SELECT count(*) AS n FROM notifications
         WHERE user_id = app_current_user() AND read_at IS NULL`),
    );
    return { unread: Number(result.rows[0]?.n ?? 0) };
  }

  /** Idempotent: marking a read notification read again changes nothing. 404 if not yours. */
  async markRead(id: string): Promise<void> {
    await this.db.tx(async (tx) => {
      const found = await tx.execute(sql`
        SELECT 1 FROM notifications WHERE id = ${id} AND user_id = app_current_user()`);
      if (found.rows.length === 0) throw new NotFoundException();
      await tx.execute(sql`
        UPDATE notifications SET read_at = now()
         WHERE id = ${id} AND read_at IS NULL`);
    });
  }

  /** "Mark all read". Returns how many changed. */
  async markAllRead(): Promise<{ updated: number }> {
    const result = await this.db.tx((tx) =>
      tx.execute(sql`
        UPDATE notifications SET read_at = now()
         WHERE user_id = app_current_user() AND read_at IS NULL`),
    );
    return { updated: result.rowCount ?? 0 };
  }

  /**
   * Per-type channel switches and the quiet hours, with defaults filled in for
   * types the user has never touched (push and email on).
   *
   * Quiet hours are kept on every switch-off-able type. The ones a user may
   * not silence (failed delivery, security, billing) ignore them by design.
   */
  async preferences() {
    const result = await this.db.tx((tx) =>
      tx.execute<{
        type: NotificationType;
        push_enabled: boolean;
        email_enabled: boolean;
        quiet_hours_start: string | null;
        quiet_hours_end: string | null;
        timezone: string;
      }>(sql`
        SELECT p.type, p.push_enabled, p.email_enabled,
               to_char(p.quiet_hours_start, 'HH24:MI') AS quiet_hours_start,
               to_char(p.quiet_hours_end, 'HH24:MI') AS quiet_hours_end,
               u.timezone
          FROM users u
          LEFT JOIN notification_preferences p ON p.user_id = u.id
         WHERE u.id = app_current_user()`),
    );

    const byType = new Map(result.rows.filter((r) => r.type).map((r) => [r.type, r]));
    const quiet = result.rows.find((r) => r.type && SUPPRESSIBLE.includes(r.type) && r.quiet_hours_start);

    return {
      quietHours: quiet
        ? {
            start: quiet.quiet_hours_start!,
            end: quiet.quiet_hours_end!,
            timezone: result.rows[0]?.timezone ?? null,
          }
        : null,
      types: NOTIFICATION_TYPE.map((type) => {
        const row = byType.get(type);
        return {
          type,
          push: row?.push_enabled ?? true,
          email: row?.email_enabled ?? true,
          suppressible: SUPPRESSIBLE.includes(type),
        };
      }),
    };
  }

  /** Sets the same quiet hours on every switch-off-able type, creating rows as needed. */
  async setQuietHours(body: QuietHoursDto) {
    await this.writeQuietHours(body.start, body.end);
    return this.preferences();
  }

  async clearQuietHours() {
    await this.writeQuietHours(null, null);
    return this.preferences();
  }

  private async writeQuietHours(start: string | null, end: string | null) {
    await this.db.tx((tx) =>
      tx.execute(sql`
        INSERT INTO notification_preferences (user_id, type, quiet_hours_start, quiet_hours_end)
        SELECT app_current_user(), t, ${start}::time, ${end}::time
          FROM unnest(${sql.raw(`ARRAY[${SUPPRESSIBLE.map((t) => `'${t}'`).join(', ')}]`)}::varchar[]) AS t
        ON CONFLICT (user_id, type) DO UPDATE
          SET quiet_hours_start = EXCLUDED.quiet_hours_start,
              quiet_hours_end = EXCLUDED.quiet_hours_end,
              updated_at = now()`),
    );
  }

  private async shape(r: Row): Promise<NotificationItem> {
    const payload: NotificationPayload = r.payload ?? {};
    const name = r.member_id
      ? (r.member_nickname ?? r.member_name!)
      : typeof payload.actorName === 'string'
        ? payload.actorName
        : null;

    return {
      id: r.id,
      type: r.type,
      title: typeof payload.title === 'string' && payload.title ? payload.title : DEFAULT_TITLE[r.type],
      body: typeof payload.body === 'string' ? payload.body : null,
      actor: name
        ? {
            memberId: r.member_id,
            name,
            avatarUrl: r.avatar_key ? await this.signed(r.avatar_key) : null,
          }
        : null,
      deepLink: r.deep_link,
      read: r.read_at !== null,
      readAt: r.read_at === null ? null : new Date(r.read_at).toISOString(),
      createdAt: new Date(r.created_at).toISOString(),
      data: payload,
    };
  }

  private async signed(key: string): Promise<string | null> {
    try {
      return (await this.storage.presignDownload(key)).url;
    } catch (error) {
      this.log.warn(`avatar URL not signed: ${(error as Error).message}`);
      return null;
    }
  }
}
