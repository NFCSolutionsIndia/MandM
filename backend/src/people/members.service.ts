import {
  ConflictException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';

import { decodeCursor, encodeCursor } from '../common/cursor.js';
import { rethrowAsHttp, sqlstate } from '../common/pg-errors.js';
import { DbService } from '../db/db.service.js';
import { StorageService } from '../storage/storage.service.js';
import {
  readRelationship,
  storedRelationship,
  type CreateMemberDto,
  type ListMembersDto,
  type UpdateMemberDto,
} from './members.dto.js';

type Tx = Parameters<Parameters<DbService['tx']>[0]>[0];

type MemberRow = {
  id: string;
  name: string;
  relationship: string | null;
  birthday: string | null;
  birthday_precision: string | null;
  anniversary: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  avatar_media_id: string | null;
  avatar_key: string | null;
  deceased_at: Date | string | null;
  merged_into_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

/** A birthday a countdown or a milestone can use: known to the day. */
const KNOWN_TO_DAY = sql`COALESCE(m.birthday_precision, 'day') IN ('exact', 'day')`;

const COLUMNS = sql`
  m.id, m.name, m.relationship,
  to_char(m.birthday, 'YYYY-MM-DD') AS birthday, m.birthday_precision,
  to_char(m.anniversary, 'YYYY-MM-DD') AS anniversary,
  m.phone, m.email::text AS email, m.notes, m.avatar_media_id,
  a.storage_key AS avatar_key, m.deceased_at, m.merged_into_id,
  m.created_at, m.updated_at`;

const FROM = sql`
  FROM members m
  LEFT JOIN media_assets a ON a.id = m.avatar_media_id AND a.deleted_at IS NULL`;

/** "Today" as a calendar day in the signed-in user's timezone. */
export const TODAY = sql`(SELECT (now() AT TIME ZONE u.timezone)::date FROM users u WHERE u.id = app_current_user())`;

/**
 * People (BE-04): the records a user keeps about the people in their life.
 *
 * The owner is ALWAYS the session's user — `app_current_user()` in SQL, never
 * a field of the request — and row-level security (`members_own`) makes
 * another owner's person simply not exist: 404, never 403.
 */
@Injectable()
export class MembersService {
  private readonly log = new Logger(MembersService.name);

  constructor(
    private readonly db: DbService,
    private readonly storage: StorageService,
  ) {}

  /** Sorted by name, keyset-paged. Merged-away duplicates are not listed. */
  async list(query: ListMembersDto) {
    const where: SQL[] = [sql`m.owner_id = app_current_user()`, sql`m.merged_into_id IS NULL`];
    if (query.q) {
      const pattern = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      where.push(sql`m.name ILIKE ${pattern}`);
    }
    if (query.cursor) {
      const [name, id] = decodeCursor(query.cursor, ['s', 's']);
      where.push(sql`(m.name, m.id) > (${name}, ${id}::uuid)`);
    }

    const result = await this.db.tx((tx) =>
      tx.execute<MemberRow>(sql`
        SELECT ${COLUMNS} ${FROM}
         WHERE ${sql.join(where, sql` AND `)}
         ORDER BY m.name, m.id
         LIMIT ${query.limit + 1}`),
    );

    const rows = result.rows.slice(0, query.limit);
    const last = rows.at(-1);
    return {
      items: await Promise.all(rows.map((r) => this.shape(r))),
      nextCursor:
        result.rows.length > query.limit && last ? encodeCursor([last.name, last.id]) : null,
    };
  }

  /** One person, with their next occasions, linked events, and capsule counts. */
  async get(id: string) {
    return this.db.tx(async (tx) => {
      const row = await this.find(tx, id);

      const occasions = await tx.execute<{
        next_birthday: string | null;
        birthday_days: number | null;
        turns: number | null;
        next_anniversary: string | null;
        anniversary_days: number | null;
        years: number | null;
      }>(sql`
        WITH t AS (SELECT ${TODAY} AS today),
        n AS (
          SELECT CASE WHEN ${KNOWN_TO_DAY} THEN app_next_occurrence(m.birthday, 'yearly', t.today) END AS b,
                 app_next_occurrence(m.anniversary, 'yearly', t.today) AS an,
                 m.birthday, m.anniversary, t.today
            FROM members m, t WHERE m.id = ${id}
        )
        SELECT to_char(b, 'YYYY-MM-DD') AS next_birthday, (b - today) AS birthday_days,
               (extract(year FROM b) - extract(year FROM birthday))::int AS turns,
               to_char(an, 'YYYY-MM-DD') AS next_anniversary, (an - today) AS anniversary_days,
               (extract(year FROM an) - extract(year FROM anniversary))::int AS years
          FROM n`);

      const events = await tx.execute<{
        id: string;
        title: string;
        type: string;
        next: string | null;
        days: number | null;
      }>(sql`
        SELECT e.id, e.title, e.type,
               to_char(app_next_occurrence(e.event_date, e.recurrence, ${TODAY}), 'YYYY-MM-DD') AS next,
               (app_next_occurrence(e.event_date, e.recurrence, ${TODAY}) - ${TODAY}) AS days
          FROM event_members em
          JOIN events e ON e.id = em.event_id
         WHERE em.member_id = ${id} AND e.archived_at IS NULL
         ORDER BY app_next_occurrence(e.event_date, e.recurrence, ${TODAY}) NULLS LAST, e.title`);

      const counts = await tx.execute<{ milestone: string; pending: string; delivered: string }>(sql`
        SELECT
          (SELECT count(*) FROM capsules c
            WHERE c.milestone_member_id = ${id} AND c.state <> 'cancelled') AS milestone,
          (SELECT count(DISTINCT c.id) FROM capsule_recipients r JOIN capsules c ON c.id = r.capsule_id
            WHERE r.member_id = ${id} AND c.state IN ('sealed', 'delivering')) AS pending,
          (SELECT count(DISTINCT c.id) FROM capsule_recipients r JOIN capsules c ON c.id = r.capsule_id
            WHERE r.member_id = ${id} AND c.state IN ('delivered', 'opened')) AS delivered`);

      const o = occasions.rows[0]!;
      const c = counts.rows[0]!;
      return {
        ...(await this.shape(row)),
        occasions: {
          birthday: o.next_birthday
            ? { date: o.next_birthday, daysLeft: Number(o.birthday_days), turns: o.turns }
            : null,
          anniversary: o.next_anniversary
            ? { date: o.next_anniversary, daysLeft: Number(o.anniversary_days), years: o.years }
            : null,
          events: events.rows.map((e) => ({
            id: e.id,
            title: e.title,
            type: e.type,
            nextOccurrence: e.next,
            daysLeft: e.days === null ? null : Number(e.days),
          })),
        },
        capsules: {
          milestone: Number(c.milestone),
          pendingDeliveries: Number(c.pending),
          delivered: Number(c.delivered),
        },
      };
    });
  }

  async create(body: CreateMemberDto) {
    const id = await this.translating(() =>
      this.db.tx(async (tx) => {
        if (body.avatarMediaId) await this.assertMedia(tx, body.avatarMediaId);

        const precision =
          body.birthday == null ? null : (body.birthdayPrecision ?? 'day');

        const created = await tx.execute<{ id: string }>(sql`
          INSERT INTO members
            (id, owner_id, name, relationship, birthday, birthday_precision, anniversary,
             phone, email, notes, avatar_media_id, deceased_at)
          VALUES (uuid_generate_v7(), app_current_user(), ${body.name},
                  ${storedRelationship(body.relationship, body.relationshipLabel)},
                  ${body.birthday ?? null}, ${precision}, ${body.anniversary ?? null},
                  ${body.phone ?? null}, ${body.email ?? null}, ${body.notes ?? null},
                  ${body.avatarMediaId ?? null}, ${body.deceasedAt ?? null})
          RETURNING id`);
        return created.rows[0]!.id;
      }),
    );
    return this.get(id);
  }

  async update(id: string, body: UpdateMemberDto) {
    await this.translating(() =>
      this.db.tx(async (tx) => {
        const current = await tx.execute<{
          birthday: string | null;
          birthday_precision: string | null;
        }>(sql`
          SELECT to_char(birthday, 'YYYY-MM-DD') AS birthday, birthday_precision
            FROM members WHERE id = ${id} FOR UPDATE`);
        const cur = current.rows[0];
        if (!cur) throw new NotFoundException();

        // The birthday and its precision as they will be after this request.
        const birthday = body.birthday !== undefined ? body.birthday : cur.birthday;
        let precision =
          body.birthdayPrecision !== undefined ? body.birthdayPrecision : cur.birthday_precision;
        if (birthday === null) {
          if (body.birthdayPrecision != null) {
            throw this.invalid('birthdayPrecision', 'needs a birthday');
          }
          precision = null;
        } else if (precision === null) {
          precision = 'day';
        }

        const knownBefore =
          cur.birthday !== null && ['exact', 'day', null].includes(cur.birthday_precision);
        const knownAfter = precision === 'exact' || precision === 'day';
        if (knownBefore && (!knownAfter || birthday !== cur.birthday)) {
          await this.assertNoSealedMilestones(tx, id);
        }

        if (body.avatarMediaId) await this.assertMedia(tx, body.avatarMediaId);

        const sets: SQL[] = [];
        if (body.name !== undefined) sets.push(sql`name = ${body.name}`);
        if (body.relationship !== undefined) {
          sets.push(sql`relationship = ${storedRelationship(body.relationship, body.relationshipLabel)}`);
        }
        sets.push(sql`birthday = ${birthday}`, sql`birthday_precision = ${precision}`);
        if (body.anniversary !== undefined) sets.push(sql`anniversary = ${body.anniversary}`);
        if (body.phone !== undefined) sets.push(sql`phone = ${body.phone}`);
        if (body.email !== undefined) sets.push(sql`email = ${body.email}`);
        if (body.notes !== undefined) sets.push(sql`notes = ${body.notes}`);
        if (body.avatarMediaId !== undefined) sets.push(sql`avatar_media_id = ${body.avatarMediaId}`);
        if (body.deceasedAt !== undefined) sets.push(sql`deceased_at = ${body.deceasedAt}`);

        await tx.execute(sql`UPDATE members SET ${sql.join(sets, sql`, `)} WHERE id = ${id}`);
      }),
    );
    return this.get(id);
  }

  /**
   * 409 `member_has_capsules` when a capsule depends on this person: any
   * capsule whose milestone they are (the foreign key would refuse anyway),
   * or a sealed capsule still waiting to be delivered to them.
   */
  async remove(id: string): Promise<void> {
    await this.translating(() =>
      this.db.tx(async (tx) => {
        await this.find(tx, id);

        const blocking = await tx.execute<{ id: string }>(sql`
          SELECT c.id FROM capsules c WHERE c.milestone_member_id = ${id}
          UNION
          SELECT c.id FROM capsule_recipients r JOIN capsules c ON c.id = r.capsule_id
           WHERE r.member_id = ${id} AND c.state IN ('sealed', 'delivering')
          ORDER BY 1`);
        if (blocking.rows.length > 0) {
          throw this.hasCapsules(blocking.rows.map((r) => r.id));
        }

        await tx.execute(sql`DELETE FROM members WHERE id = ${id}`);
      }),
    );
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async find(tx: Tx, id: string): Promise<MemberRow> {
    const result = await tx.execute<MemberRow>(sql`SELECT ${COLUMNS} ${FROM} WHERE m.id = ${id}`);
    const row = result.rows[0];
    if (!row) throw new NotFoundException();
    return row;
  }

  /** The birthday a sealed milestone capsule counts on must not be taken away or moved. */
  private async assertNoSealedMilestones(tx: Tx, id: string) {
    const sealed = await tx.execute<{ id: string }>(sql`
      SELECT id FROM capsules
       WHERE milestone_member_id = ${id} AND state IN ('sealed', 'delivering')
       ORDER BY id`);
    if (sealed.rows.length > 0) {
      throw this.hasCapsules(
        sealed.rows.map((r) => r.id),
        'A sealed milestone capsule counts on this birthday, so it cannot be changed or removed.',
      );
    }
  }

  private hasCapsules(capsuleIds: string[], message?: string) {
    return new ConflictException({
      statusCode: HttpStatus.CONFLICT,
      reason: 'member_has_capsules',
      message: message ?? 'Capsules depend on this person. Cancel or deliver them first.',
      capsuleIds,
    });
  }

  /** A photo the user can actually see. RLS answers that; an absent row is not theirs. */
  private async assertMedia(tx: Tx, mediaId: string) {
    const found = await tx.execute(sql`
      SELECT 1 FROM media_assets WHERE id = ${mediaId} AND deleted_at IS NULL`);
    if (found.rows.length === 0) throw this.invalid('avatarMediaId', 'is not a photo you can use');
  }

  private invalid(field: string, message: string) {
    return new UnprocessableEntityException({
      message: 'Validation failed',
      errors: [{ field, message }],
    });
  }

  private async translating<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      // A capsule this request cannot see still holds the foreign key.
      if (sqlstate(error) === '23503') throw this.hasCapsules([]);
      rethrowAsHttp(error);
    }
  }

  private async shape(r: MemberRow) {
    return {
      id: r.id,
      name: r.name,
      ...readRelationship(r.relationship),
      birthday: r.birthday,
      birthdayPrecision: r.birthday_precision,
      anniversary: r.anniversary,
      phone: r.phone,
      email: r.email,
      notes: r.notes,
      avatarMediaId: r.avatar_media_id,
      avatarUrl: r.avatar_key ? await this.signed(r.avatar_key) : null,
      deceasedAt: r.deceased_at === null ? null : new Date(r.deceased_at).toISOString(),
      mergedIntoId: r.merged_into_id,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
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
