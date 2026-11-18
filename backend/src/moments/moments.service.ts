import { Injectable, Logger } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';

import { NO_JIT } from '../common/no-jit.js';
import { DbService } from '../db/db.service.js';
import { StorageService } from '../storage/storage.service.js';
import type {
  MomentSource,
  MomentType,
  UpcomingMoment,
  UpcomingResponse,
} from './moments.dto.js';

type Row = {
  type: MomentType;
  id: string;
  source: MomentSource;
  title: string;
  date: string;
  days_left: number;
  turns: number | null;
  next_7_days: string | number;
  person_id: string | null;
  person_name: string | null;
  person_nickname: string | null;
  person_location: string | null;
  person_deceased: boolean | null;
  avatar_key: string | null;
};

/**
 * The one query behind the endpoint, exported so a test can EXPLAIN exactly
 * what runs. Every source is joined from `me` on owner_id, which is what lets
 * the planner use the owner indexes instead of reading every member.
 *
 * `types` narrows the sources (Home's "Sending soon" asks for capsules only).
 * `next_7_days` counts every matching moment from today to today + 6, before
 * the LIMIT, so "3 moments coming up this week" does not depend on `limit`.
 */
export function upcomingSql(limit: number, at: Date, types?: readonly MomentType[]): SQL {
  const typeFilter =
    types && types.length > 0
      ? sql`AND x.type IN (${sql.join(types.map((t) => sql`${t}`), sql`, `)})`
      : sql``;
  return sql`
    WITH me AS (
      SELECT u.id AS user_id,
             (${at.toISOString()}::timestamptz AT TIME ZONE u.timezone)::date AS today,
             u.timezone
        FROM users u
       WHERE u.id = app_current_user()
    ),
    moments AS (
      -- Capsules I sealed that have not been delivered.
      SELECT 'capsule'::text AS type, c.id, 'capsule'::text AS source,
             COALESCE(NULLIF(btrim(c.title), ''), 'Time capsule') AS title,
             COALESCE(
               (c.unlock_at AT TIME ZONE me.timezone)::date,
               app_date_in_year(mm.birthday,
                 extract(year FROM mm.birthday)::int + app_milestone_age(c.milestone_spec))
             ) AS date,
             NULL::date AS since,
             COALESCE(c.milestone_member_id, (
               SELECT r.member_id FROM capsule_recipients r
                WHERE r.capsule_id = c.id AND r.member_id IS NOT NULL
                ORDER BY r.created_at, r.id LIMIT 1)) AS member_id
        FROM me
        JOIN capsules c ON c.owner_id = me.user_id
        LEFT JOIN members mm ON mm.id = c.milestone_member_id
                            AND COALESCE(mm.birthday_precision, 'day') IN ('exact', 'day')
       WHERE c.state = 'sealed' AND c.delivered_at IS NULL

      UNION ALL

      -- Birthdays on my people's records. A birthday known only to the
      -- month or year has no day to count down to.
      SELECT 'birthday', m.id, 'person', COALESCE(m.nickname, m.name) || '''s birthday',
             app_next_occurrence(m.birthday, 'yearly', me.today), m.birthday, m.id
        FROM me
        JOIN members m ON m.owner_id = me.user_id
       WHERE m.birthday IS NOT NULL
         AND m.merged_into_id IS NULL
         AND COALESCE(m.birthday_precision, 'day') IN ('exact', 'day')

      UNION ALL

      SELECT 'anniversary', m.id, 'person', COALESCE(m.nickname, m.name) || '''s anniversary',
             app_next_occurrence(m.anniversary, 'yearly', me.today), m.anniversary, m.id
        FROM me
        JOIN members m ON m.owner_id = me.user_id
       WHERE m.anniversary IS NOT NULL
         AND m.merged_into_id IS NULL

      UNION ALL

      -- My events.
      SELECT CASE WHEN e.type IN ('birthday', 'anniversary') THEN e.type ELSE 'event' END,
             e.id, 'event', e.title,
             app_next_occurrence(e.event_date, e.recurrence, me.today),
             -- A yearly birthday or anniversary counts years ("Grandpa turns 80").
             CASE WHEN e.recurrence = 'yearly' AND e.type IN ('birthday', 'anniversary')
                  THEN e.event_date END,
             (SELECT em.member_id FROM event_members em
                JOIN members p ON p.id = em.member_id
               WHERE em.event_id = e.id
               ORDER BY p.name, p.id LIMIT 1)
        FROM me
        JOIN events e ON e.owner_id = me.user_id
       WHERE e.archived_at IS NULL
         AND NOT (
           e.type IN ('birthday', 'anniversary') AND EXISTS (
             SELECT 1 FROM event_members em
               JOIN members p ON p.id = em.member_id
              WHERE em.event_id = e.id
                AND p.merged_into_id IS NULL
                AND ((e.type = 'birthday' AND p.birthday IS NOT NULL
                      AND COALESCE(p.birthday_precision, 'day') IN ('exact', 'day'))
                  OR (e.type = 'anniversary' AND p.anniversary IS NOT NULL))))
    )
    SELECT x.type, x.id, x.source, x.title,
           to_char(x.date, 'YYYY-MM-DD') AS date,
           (x.date - me.today) AS days_left,
           (extract(year FROM x.date) - extract(year FROM x.since))::int AS turns,
           count(*) FILTER (WHERE x.date - me.today < 7) OVER () AS next_7_days,
           p.id AS person_id, p.name AS person_name,
           p.nickname AS person_nickname, p.location AS person_location,
           (p.deceased_at IS NOT NULL) AS person_deceased,
           a.storage_key AS avatar_key
      FROM moments x
      CROSS JOIN me
      LEFT JOIN members p ON p.id = x.member_id
      LEFT JOIN media_assets a ON a.id = p.avatar_media_id AND a.deleted_at IS NULL
     WHERE x.date >= me.today
       ${typeFilter}
     ORDER BY x.date, x.type, x.title, x.id
     LIMIT ${limit}
  `;
}

/**
 * The Home screen's "what's coming up" (BE-06, D-8 as proposed):
 *
 *   capsule      sealed, undelivered capsules I own — the unlock date, or for
 *                a milestone capsule the date the person reaches the age
 *   birthday     the next birthday of each of my people (known to the day)
 *   anniversary  the next anniversary of each of my people
 *   event        my own events, with yearly and monthly ones repeated
 *
 * An event typed birthday/anniversary keeps that type; it is left out when
 * one of its people already has that date on their record, so the same
 * birthday never shows twice.
 *
 * Every date is a calendar day in the USER's timezone (users.timezone):
 * at 23:30 UTC it is already tomorrow in Asia/Kolkata, and "in 7 days"
 * must count from there.
 */
@Injectable()
export class MomentsService {
  private readonly log = new Logger(MomentsService.name);

  constructor(
    private readonly db: DbService,
    private readonly storage: StorageService,
  ) {}

  /**
   * `at` is the instant "now" is taken from. It comes from the application
   * clock rather than the database's `now()` so a test can stand at 23:30 UTC.
   */
  async upcoming(
    limit: number,
    at: Date = new Date(),
    types?: readonly MomentType[],
  ): Promise<UpcomingResponse> {
    const result = await this.db.tx(async (tx) => {
      await tx.execute(NO_JIT);
      return tx.execute<Row>(upcomingSql(limit, at, types));
    });

    const items = await Promise.all(result.rows.map((r) => this.shape(r)));
    return {
      items,
      // The window count rides on every row; with no rows there is nothing ahead.
      counts: { next7Days: Number(result.rows[0]?.next_7_days ?? 0) },
    };
  }

  private async shape(r: Row): Promise<UpcomingMoment> {
    return {
      type: r.type,
      id: r.id,
      source: r.source,
      title: r.title,
      date: r.date,
      daysLeft: Number(r.days_left),
      turns: r.turns === null ? null : Number(r.turns),
      person: r.person_id
        ? {
            id: r.person_id,
            name: r.person_name!,
            nickname: r.person_nickname,
            displayName: r.person_nickname ?? r.person_name!,
            location: r.person_location,
            avatarUrl: r.avatar_key ? await this.avatarUrl(r.avatar_key) : null,
            deceased: Boolean(r.person_deceased),
          }
        : null,
    };
  }

  /** A short-lived signed URL. A Home screen without avatars beats no Home screen. */
  private async avatarUrl(key: string): Promise<string | null> {
    try {
      return (await this.storage.presignDownload(key)).url;
    } catch (error) {
      this.log.warn(`avatar URL not signed: ${(error as Error).message}`);
      return null;
    }
  }
}
