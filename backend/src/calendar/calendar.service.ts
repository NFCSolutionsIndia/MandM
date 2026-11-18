import { Injectable, Logger } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';

import { NO_JIT } from '../common/no-jit.js';
import { DbService } from '../db/db.service.js';
import { StorageService } from '../storage/storage.service.js';
import type { CalendarItem, CalendarType } from './calendar.dto.js';

type Row = {
  type: CalendarType;
  source: 'person' | 'event' | 'capsule';
  id: string;
  title: string;
  date: string;
  days_left: number;
  turns: number | null;
  recurrence: 'none' | 'yearly' | 'monthly';
  capsule_state: string | null;
  person_id: string | null;
  person_name: string | null;
  person_nickname: string | null;
  person_location: string | null;
  person_deceased: boolean | null;
  avatar_key: string | null;
};

export interface OccurrenceOptions {
  /** First day, inclusive, `YYYY-MM-DD`. Omitted: today in the user's zone. */
  from?: string;
  /** Last day, inclusive, `YYYY-MM-DD`. Omitted: `from` + `days` - 1. */
  to?: string;
  /** With no `to`: how many days from `from`. */
  days?: number;
  types?: readonly CalendarType[];
  /** Matches the title, and the person's name or nickname. Case-insensitive. */
  q?: string;
  /** Keyset: return only items after this (date, type, id). */
  after?: readonly [string, string, string];
  limit?: number;
}

/** `%text%` for ILIKE, with the user's own `%`, `_` and `\` taken literally. */
export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Every dated thing the user has, expanded into one row per day it falls on.
 *
 * Exported so a test can EXPLAIN it, and so search can reuse it for "Dates".
 *
 * Rules, the same as upcoming moments (BE-06) so the two never disagree:
 *  - a birthday must be known to the day; a month or year cannot be placed
 *  - merged-away people and archived events are left out
 *  - a yearly birthday/anniversary EVENT is left out when one of its people
 *    already has that date on their record, so a birthday never shows twice
 *  - nothing repeats before it first happened (no birthday before the birth)
 *  - every date is a calendar day in the user's timezone
 */
export function occurrencesSql(opts: OccurrenceOptions, at: Date = new Date()): SQL {
  const from = opts.from ? sql`${opts.from}::date` : sql`me.today`;
  const to = opts.to
    ? sql`${opts.to}::date`
    : sql`(${from} + ${(opts.days ?? 366) - 1}::int)`;

  const filters: SQL[] = [];
  if (opts.types && opts.types.length > 0) {
    filters.push(sql`x.type IN (${sql.join(opts.types.map((t) => sql`${t}`), sql`, `)})`);
  }
  if (opts.q) {
    const p = likePattern(opts.q);
    filters.push(sql`(x.title ILIKE ${p} OR p.name ILIKE ${p} OR p.nickname ILIKE ${p})`);
  }
  if (opts.after) {
    const [d, t, id] = opts.after;
    filters.push(sql`(x.date, x.type, x.id) > (${d}::date, ${t}, ${id}::uuid)`);
  }
  const where = filters.length > 0 ? sql`AND ${sql.join(filters, sql` AND `)}` : sql``;
  const limit = opts.limit ? sql`LIMIT ${opts.limit}` : sql``;

  return sql`
    WITH me AS (
      SELECT u.id AS user_id,
             (${at.toISOString()}::timestamptz AT TIME ZONE u.timezone)::date AS today,
             u.timezone
        FROM users u
       WHERE u.id = app_current_user()
    ),
    span AS (
      SELECT ${from} AS lo, ${to} AS hi FROM me
    ),
    yrs AS (
      SELECT generate_series(extract(year FROM span.lo)::int, extract(year FROM span.hi)::int) AS y
        FROM span
    ),
    mons AS (
      SELECT generate_series(date_trunc('month', span.lo), span.hi, interval '1 month')::date AS mo
        FROM span
    ),
    known AS (
      -- People whose birthday can be put on a day.
      SELECT m.* FROM me JOIN members m ON m.owner_id = me.user_id
       WHERE m.merged_into_id IS NULL
    ),
    items AS (
      SELECT 'birthday'::text AS type, 'person'::text AS source, m.id,
             COALESCE(m.nickname, m.name) || '''s birthday' AS title,
             app_date_in_year(m.birthday, yrs.y) AS date,
             m.birthday AS anchor, m.birthday AS since, 'yearly'::text AS recurrence,
             m.id AS member_id, NULL::text AS capsule_state
        FROM known m CROSS JOIN yrs
       WHERE m.birthday IS NOT NULL
         AND COALESCE(m.birthday_precision, 'day') IN ('exact', 'day')

      UNION ALL

      SELECT 'anniversary', 'person', m.id,
             COALESCE(m.nickname, m.name) || '''s anniversary',
             app_date_in_year(m.anniversary, yrs.y),
             m.anniversary, m.anniversary, 'yearly', m.id, NULL
        FROM known m CROSS JOIN yrs
       WHERE m.anniversary IS NOT NULL

      UNION ALL

      SELECT CASE e.type WHEN 'festival' THEN 'holiday'
                         WHEN 'custom' THEN 'event'
                         ELSE e.type END,
             'event', e.id, e.title, occ.d,
             e.event_date,
             CASE WHEN e.recurrence = 'yearly' AND e.type IN ('birthday', 'anniversary')
                  THEN e.event_date END,
             e.recurrence,
             (SELECT em.member_id FROM event_members em
                JOIN members pm ON pm.id = em.member_id
               WHERE em.event_id = e.id
               ORDER BY pm.name, pm.id LIMIT 1),
             NULL
        FROM me
        JOIN events e ON e.owner_id = me.user_id
        CROSS JOIN LATERAL (
          SELECT e.event_date AS d WHERE e.recurrence = 'none'
          UNION ALL
          SELECT app_date_in_year(e.event_date, yrs.y) FROM yrs WHERE e.recurrence = 'yearly'
          UNION ALL
          SELECT app_date_in_month(e.event_date, mons.mo) FROM mons WHERE e.recurrence = 'monthly'
        ) occ
       WHERE e.archived_at IS NULL
         AND NOT (
           e.type IN ('birthday', 'anniversary') AND EXISTS (
             SELECT 1 FROM event_members em
               JOIN members pm ON pm.id = em.member_id
              WHERE em.event_id = e.id
                AND pm.merged_into_id IS NULL
                AND ((e.type = 'birthday' AND pm.birthday IS NOT NULL
                      AND COALESCE(pm.birthday_precision, 'day') IN ('exact', 'day'))
                  OR (e.type = 'anniversary' AND pm.anniversary IS NOT NULL))))

      UNION ALL

      -- Capsules I own, on the day they open. Drafts have no promise yet;
      -- cancelled and failed ones are not on anybody's calendar.
      SELECT 'capsule', 'capsule', c.id,
             COALESCE(NULLIF(btrim(c.title), ''), 'Time capsule'),
             COALESCE(
               (c.unlock_at AT TIME ZONE me.timezone)::date,
               app_date_in_year(mm.birthday,
                 extract(year FROM mm.birthday)::int + app_milestone_age(c.milestone_spec)),
               (c.delivered_at AT TIME ZONE me.timezone)::date),
             NULL, NULL, 'none',
             COALESCE(c.milestone_member_id, (
               SELECT r.member_id FROM capsule_recipients r
                WHERE r.capsule_id = c.id AND r.member_id IS NOT NULL
                ORDER BY r.created_at, r.id LIMIT 1)),
             c.state
        FROM me
        JOIN capsules c ON c.owner_id = me.user_id
        LEFT JOIN members mm ON mm.id = c.milestone_member_id
                            AND COALESCE(mm.birthday_precision, 'day') IN ('exact', 'day')
       WHERE c.state IN ('sealed', 'delivering', 'delivered', 'opened')
    )
    SELECT x.type, x.source, x.id, x.title,
           to_char(x.date, 'YYYY-MM-DD') AS date,
           (x.date - me.today) AS days_left,
           (extract(year FROM x.date) - extract(year FROM x.since))::int AS turns,
           x.recurrence, x.capsule_state,
           p.id AS person_id, p.name AS person_name,
           p.nickname AS person_nickname, p.location AS person_location,
           (p.deceased_at IS NOT NULL) AS person_deceased,
           a.storage_key AS avatar_key
      FROM items x
      CROSS JOIN me
      CROSS JOIN span
      LEFT JOIN members p ON p.id = x.member_id
      LEFT JOIN media_assets a ON a.id = p.avatar_media_id AND a.deleted_at IS NULL
     WHERE x.date BETWEEN span.lo AND span.hi
       AND (x.anchor IS NULL OR x.date >= x.anchor)
       ${where}
     ORDER BY x.date, x.type, x.id
     ${limit}
  `;
}

/**
 * The Calendar tab: month grid, year view, list view and the "Jump to" sheet.
 *
 * One expansion query serves all of them, so the dot on the 21st, the "5
 * dates" under March and the row in the list are the same fact counted three
 * ways, and cannot drift apart.
 */
@Injectable()
export class CalendarService {
  private readonly log = new Logger(CalendarService.name);

  constructor(
    private readonly db: DbService,
    private readonly storage: StorageService,
  ) {}

  /** Today in the user's timezone, `YYYY-MM-DD`. */
  async today(at: Date = new Date()): Promise<string> {
    const result = await this.db.tx((tx) =>
      tx.execute<{ today: string }>(sql`
        SELECT to_char((${at.toISOString()}::timestamptz AT TIME ZONE u.timezone)::date,
                       'YYYY-MM-DD') AS today
          FROM users u WHERE u.id = app_current_user()`),
    );
    return result.rows[0]!.today;
  }

  async occurrences(opts: OccurrenceOptions, at: Date = new Date()): Promise<CalendarItem[]> {
    const result = await this.db.tx(async (tx) => {
      await tx.execute(NO_JIT);
      return tx.execute<Row>(occurrencesSql(opts, at));
    });
    return Promise.all(result.rows.map((r) => this.shape(r)));
  }

  async range(
    query: { from: string; to: string; types: CalendarType[]; q?: string },
    at: Date = new Date(),
  ) {
    const [today, items] = await Promise.all([this.today(at), this.occurrences(query, at)]);
    return { from: query.from, to: query.to, today, items };
  }

  /**
   * Per-month totals for one year. `count` is every occurrence; `days` is how
   * many distinct days have at least one (a holiday and a birthday on the
   * 17th are two dates on one day). The design's "5 dates" is one of the two.
   * Pending item P-6 asks which.
   */
  async summary(year: number, types: CalendarType[], at: Date = new Date()) {
    const inner = occurrencesSql({ from: `${year}-01-01`, to: `${year}-12-31`, types }, at);
    const result = await this.db.tx(async (tx) => {
      await tx.execute(NO_JIT);
      return tx.execute<{ month: number; count: string; days: string; by_type: Record<string, number> }>(sql`
        WITH o AS (${inner}),
        per AS (
          SELECT extract(month FROM o.date::date)::int AS month, o.type, o.date FROM o
        ),
        typed AS (
          SELECT month, type, count(*)::int AS n FROM per GROUP BY month, type
        )
        SELECT m.month,
               (SELECT count(*) FROM per WHERE per.month = m.month) AS count,
               (SELECT count(DISTINCT per.date) FROM per WHERE per.month = m.month) AS days,
               COALESCE((SELECT jsonb_object_agg(t.type, t.n) FROM typed t WHERE t.month = m.month),
                        '{}'::jsonb) AS by_type
          FROM generate_series(1, 12) AS m(month)
         ORDER BY m.month`);
    });
    return {
      year,
      today: await this.today(at),
      months: result.rows.map((r) => ({
        month: Number(r.month),
        count: Number(r.count),
        days: Number(r.days),
        byType: r.by_type,
      })),
    };
  }

  private async shape(r: Row): Promise<CalendarItem> {
    return {
      type: r.type,
      source: r.source,
      id: r.id,
      title: r.title,
      date: r.date,
      daysLeft: Number(r.days_left),
      turns: r.turns === null ? null : Number(r.turns),
      recurrence: r.recurrence,
      capsuleState: r.capsule_state,
      person: r.person_id
        ? {
            id: r.person_id,
            name: r.person_name!,
            nickname: r.person_nickname,
            displayName: r.person_nickname ?? r.person_name!,
            location: r.person_location,
            avatarUrl: r.avatar_key ? await this.signed(r.avatar_key) : null,
            deceased: Boolean(r.person_deceased),
          }
        : null,
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
