import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';

import { decodeCursor, encodeCursor } from '../common/cursor.js';
import { translatingPgErrors } from '../common/pg-errors.js';
import { DbService } from '../db/db.service.js';
import type { CreateEventDto, ListEventsDto, UpdateEventDto } from './events.dto.js';
import { TODAY } from './members.service.js';

type Tx = Parameters<Parameters<DbService['tx']>[0]>[0];

type EventRow = {
  id: string;
  title: string;
  type: string;
  event_date: string;
  recurrence: string;
  all_day: boolean;
  notes: string | null;
  next_occurrence: string | null;
  days_left: number | null;
  archived_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  members: { id: string; name: string }[] | null;
};

const SELECT = sql`
  SELECT e.id, e.title, e.type, to_char(e.event_date, 'YYYY-MM-DD') AS event_date,
         e.recurrence, e.all_day, e.notes,
         to_char(app_next_occurrence(e.event_date, e.recurrence, t.today), 'YYYY-MM-DD') AS next_occurrence,
         (app_next_occurrence(e.event_date, e.recurrence, t.today) - t.today) AS days_left,
         e.archived_at, e.created_at, e.updated_at,
         (SELECT json_agg(json_build_object('id', m.id, 'name', m.name) ORDER BY m.name, m.id)
            FROM event_members em JOIN members m ON m.id = em.member_id
           WHERE em.event_id = e.id) AS members
    FROM events e
    CROSS JOIN (SELECT ${TODAY} AS today) t`;

/**
 * Events: birthdays, anniversaries, festivals and anything else a user marks.
 *
 * Recurrence is a rule (`none | yearly | monthly`), never stored rows; each
 * response carries the next occurrence and the days until it, counted in the
 * user's timezone. Owner-scoped by row-level security (`events_own`).
 *
 * DELETE archives rather than deletes: capsules and reminders may point at an
 * event, and "we stopped marking this" is something a family may undo
 * (`POST /events/:id/restore`).
 */
@Injectable()
export class EventsService {
  constructor(private readonly db: DbService) {}

  /** Sorted by the original date, keyset-paged. Archived ones only with ?archived=true. */
  async list(query: ListEventsDto) {
    const where: SQL[] = [
      sql`e.owner_id = app_current_user()`,
      query.archived ? sql`e.archived_at IS NOT NULL` : sql`e.archived_at IS NULL`,
    ];
    if (query.type) where.push(sql`e.type = ${query.type}`);
    if (query.memberId) {
      where.push(sql`EXISTS (SELECT 1 FROM event_members em
                              WHERE em.event_id = e.id AND em.member_id = ${query.memberId})`);
    }
    if (query.q) {
      const pattern = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      where.push(sql`e.title ILIKE ${pattern}`);
    }
    if (query.cursor) {
      const [date, id] = decodeCursor(query.cursor, ['s', 's']);
      where.push(sql`(e.event_date, e.id) > (${date}::date, ${id}::uuid)`);
    }

    const result = await this.db.tx((tx) =>
      tx.execute<EventRow>(sql`${SELECT}
         WHERE ${sql.join(where, sql` AND `)}
         ORDER BY e.event_date, e.id
         LIMIT ${query.limit + 1}`),
    );

    const rows = result.rows.slice(0, query.limit);
    const last = rows.at(-1);
    return {
      items: rows.map((r) => this.shape(r)),
      nextCursor:
        result.rows.length > query.limit && last ? encodeCursor([last.event_date, last.id]) : null,
    };
  }

  async get(id: string) {
    return this.db.tx((tx) => this.find(tx, id));
  }

  async create(body: CreateEventDto) {
    return translatingPgErrors(() =>
      this.db.tx(async (tx) => {
        await this.assertOwnMembers(tx, body.memberIds);
        const created = await tx.execute<{ id: string }>(sql`
          INSERT INTO events (id, owner_id, title, type, event_date, recurrence, all_day, notes)
          VALUES (uuid_generate_v7(), app_current_user(), ${body.title}, ${body.type},
                  ${body.eventDate}, ${body.recurrence}, ${body.allDay}, ${body.notes ?? null})
          RETURNING id`);
        const id = created.rows[0]!.id;
        await this.setMembers(tx, id, body.memberIds);
        return this.find(tx, id);
      }),
    );
  }

  async update(id: string, body: UpdateEventDto) {
    return translatingPgErrors(() =>
      this.db.tx(async (tx) => {
        const exists = await tx.execute(sql`SELECT 1 FROM events WHERE id = ${id} FOR UPDATE`);
        if (exists.rows.length === 0) throw new NotFoundException();

        const sets: SQL[] = [];
        if (body.title !== undefined) sets.push(sql`title = ${body.title}`);
        if (body.type !== undefined) sets.push(sql`type = ${body.type}`);
        if (body.eventDate !== undefined) sets.push(sql`event_date = ${body.eventDate}`);
        if (body.recurrence !== undefined) sets.push(sql`recurrence = ${body.recurrence}`);
        if (body.allDay !== undefined) sets.push(sql`all_day = ${body.allDay}`);
        if (body.notes !== undefined) sets.push(sql`notes = ${body.notes}`);
        if (sets.length > 0) {
          await tx.execute(sql`UPDATE events SET ${sql.join(sets, sql`, `)} WHERE id = ${id}`);
        }

        if (body.memberIds !== undefined) {
          await this.assertOwnMembers(tx, body.memberIds);
          await tx.execute(sql`DELETE FROM event_members WHERE event_id = ${id}`);
          await this.setMembers(tx, id, body.memberIds);
        }
        return this.find(tx, id);
      }),
    );
  }

  /** Archive. Idempotent: archiving an archived event is still 204. */
  async archive(id: string): Promise<void> {
    await this.db.tx(async (tx) => {
      const result = await tx.execute(sql`
        UPDATE events SET archived_at = COALESCE(archived_at, now())
         WHERE id = ${id} RETURNING id`);
      if (result.rows.length === 0) throw new NotFoundException();
    });
  }

  async restore(id: string) {
    return this.db.tx(async (tx) => {
      const result = await tx.execute(sql`
        UPDATE events SET archived_at = NULL WHERE id = ${id} RETURNING id`);
      if (result.rows.length === 0) throw new NotFoundException();
      return this.find(tx, id);
    });
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async find(tx: Tx, id: string) {
    const result = await tx.execute<EventRow>(sql`${SELECT} WHERE e.id = ${id}`);
    const row = result.rows[0];
    if (!row) throw new NotFoundException();
    return this.shape(row);
  }

  /** Every id must be one of the caller's people. Somebody else's is "not found", as a 422. */
  private async assertOwnMembers(tx: Tx, ids: string[]) {
    if (ids.length === 0) return;
    const found = await tx.execute<{ n: string }>(sql`
      SELECT count(*) AS n FROM members
       WHERE id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`);
    if (Number(found.rows[0]!.n) !== ids.length) {
      throw new UnprocessableEntityException({
        message: 'Validation failed',
        errors: [{ field: 'memberIds', message: 'includes a person who is not in your people' }],
      });
    }
  }

  private async setMembers(tx: Tx, eventId: string, ids: string[]) {
    for (const memberId of ids) {
      await tx.execute(sql`
        INSERT INTO event_members (event_id, member_id) VALUES (${eventId}, ${memberId})`);
    }
  }

  private shape(r: EventRow) {
    return {
      id: r.id,
      title: r.title,
      type: r.type,
      eventDate: r.event_date,
      recurrence: r.recurrence,
      allDay: r.all_day,
      notes: r.notes,
      /** Null for a one-off event that has passed. */
      nextOccurrence: r.next_occurrence,
      daysLeft: r.days_left === null ? null : Number(r.days_left),
      members: r.members ?? [],
      archivedAt: r.archived_at === null ? null : new Date(r.archived_at).toISOString(),
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    };
  }
}
