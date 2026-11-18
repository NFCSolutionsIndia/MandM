import { Injectable, Logger } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';

import { CalendarService, likePattern } from '../calendar/calendar.service.js';
import { NO_JIT } from '../common/no-jit.js';
import { decodeCursor, encodeCursor } from '../common/cursor.js';
import { DbService } from '../db/db.service.js';
import { readRelationship } from '../people/members.dto.js';
import { StorageService } from '../storage/storage.service.js';
import type { SearchQueryDto, SearchType } from './search.dto.js';

type Page<T> = { items: T[]; nextCursor: string | null };

type PersonRow = {
  id: string;
  name: string;
  nickname: string | null;
  display: string;
  relationship: string | null;
  location: string | null;
  deceased_at: Date | string | null;
  memory_count: string;
  avatar_key: string | null;
};

type MemoryRow = {
  id: string;
  vault_id: string;
  title: string | null;
  occurred_at: Date | string;
  cursor_at: string;
  media_kind: string | null;
  cover_key: string | null;
};

/**
 * One search box over the user's people, memories and dates (BE-07).
 *
 * Everything runs as the signed-in user, so row-level security decides what
 * can be found: another family's memories are not filtered out, they simply
 * do not exist for this query. No owner id is ever taken from the request.
 */
@Injectable()
export class SearchService {
  private readonly log = new Logger(SearchService.name);

  constructor(
    private readonly db: DbService,
    private readonly storage: StorageService,
    private readonly calendar: CalendarService,
  ) {}

  async search(query: SearchQueryDto, at: Date = new Date()) {
    const want = new Set(query.types);

    // Independent reads, each in its own transaction: run them side by side,
    // so "All" costs the slowest section rather than the sum of the three.
    const [people, memories, dates] = await Promise.all([
      want.has('people') ? this.people(query.q, query.limit, query.cursor) : undefined,
      want.has('memories') ? this.memories(query.q, query.limit, query.cursor) : undefined,
      want.has('dates') ? this.dates(query.q, query.limit, query.cursor, at) : undefined,
    ]);

    const out: Partial<Record<SearchType, Page<unknown>>> = {};
    if (people) out.people = people;
    if (memories) out.memories = memories;
    if (dates) out.dates = dates;
    return { q: query.q, ...out };
  }

  /** My people, matched on name or nickname, sorted by what the screen shows first. */
  private async people(q: string, limit: number, cursor?: string) {
    const p = likePattern(q);
    const where: SQL[] = [
      sql`m.owner_id = app_current_user()`,
      sql`m.merged_into_id IS NULL`,
      sql`(m.name ILIKE ${p} OR m.nickname ILIKE ${p})`,
    ];
    if (cursor) {
      const [display, id] = decodeCursor(cursor, ['s', 's']);
      where.push(sql`(COALESCE(m.nickname, m.name), m.id) > (${display}, ${id}::uuid)`);
    }

    const result = await this.run<PersonRow>(sql`
        SELECT m.id, m.name, m.nickname, COALESCE(m.nickname, m.name) AS display,
               m.relationship, m.location, m.deceased_at, a.storage_key AS avatar_key,
               (SELECT count(*) FROM memory_members mm
                  JOIN memories mem ON mem.id = mm.memory_id AND mem.deleted_at IS NULL
                 WHERE mm.member_id = m.id) AS memory_count
          FROM members m
          LEFT JOIN media_assets a ON a.id = m.avatar_media_id AND a.deleted_at IS NULL
         WHERE ${sql.join(where, sql` AND `)}
         ORDER BY COALESCE(m.nickname, m.name), m.id
         LIMIT ${limit + 1}`);

    const rows = result.rows.slice(0, limit);
    const last = rows.at(-1);
    return {
      items: await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          name: r.name,
          nickname: r.nickname,
          displayName: r.display,
          ...readRelationship(r.relationship),
          location: r.location,
          memoryCount: Number(r.memory_count),
          avatarUrl: r.avatar_key ? await this.signed(r.avatar_key) : null,
          deceased: r.deceased_at !== null,
        })),
      ),
      nextCursor: result.rows.length > limit && last ? encodeCursor([last.display, last.id]) : null,
    };
  }

  /**
   * Memories I can see, newest first, matched on title, note, the search text,
   * or a person tagged in them ("dad" finds Thanksgiving because Dad is in it).
   */
  private async memories(q: string, limit: number, cursor?: string) {
    const p = likePattern(q);
    const where: SQL[] = [
      sql`mem.deleted_at IS NULL`,
      sql`(mem.title ILIKE ${p}
           OR mem.note ILIKE ${p}
           OR mem.search_text ILIKE ${p}
           OR EXISTS (
             SELECT 1 FROM memory_members mm
               JOIN members pm ON pm.id = mm.member_id
              WHERE mm.memory_id = mem.id
                AND (pm.name ILIKE ${p} OR pm.nickname ILIKE ${p})))`,
    ];
    if (cursor) {
      const [occurred, id] = decodeCursor(cursor, ['s', 's']);
      where.push(sql`(mem.occurred_at, mem.id) < (${occurred}::timestamptz, ${id}::uuid)`);
    }

    const result = await this.run<MemoryRow>(sql`
        SELECT mem.id, mem.vault_id, mem.title, mem.occurred_at,
               to_char(mem.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at,
               cover.kind AS media_kind, cover.storage_key AS cover_key
          FROM memories mem
          LEFT JOIN LATERAL (
            -- The chosen cover, else the first item in the memory.
            SELECT ma.kind, ma.storage_key FROM media_assets ma
             WHERE ma.memory_id = mem.id AND ma.deleted_at IS NULL
             ORDER BY (ma.id = mem.cover_media_id) DESC, ma.sort_order, ma.id
             LIMIT 1
          ) cover ON true
         WHERE ${sql.join(where, sql` AND `)}
         ORDER BY mem.occurred_at DESC, mem.id DESC
         LIMIT ${limit + 1}`);

    const rows = result.rows.slice(0, limit);
    const last = rows.at(-1);
    return {
      items: await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          vaultId: r.vault_id,
          title: r.title,
          occurredAt: new Date(r.occurred_at).toISOString(),
          /** `image`, `video` or `audio`: the badge on the card. Null for a text-only memory. */
          mediaKind: r.media_kind,
          /**
           * The cover, signed for a few minutes. The original file until the
           * media pipeline produces real thumbnails (pending item P-8).
           */
          thumbnailUrl: r.cover_key ? await this.signed(r.cover_key) : null,
        })),
      ),
      nextCursor: result.rows.length > limit && last ? encodeCursor([last.cursor_at, last.id]) : null,
    };
  }

  /** The next year of dates whose title or person matches, soonest first. */
  private async dates(q: string, limit: number, cursor: string | undefined, at: Date) {
    const after = cursor
      ? (decodeCursor(cursor, ['s', 's', 's']) as [string, string, string])
      : undefined;
    const rows = await this.calendar.occurrences({ days: 366, q, after, limit: limit + 1 }, at);

    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > limit && last ? encodeCursor([last.date, last.type, last.id]) : null,
    };
  }

  /** One statement as the signed-in user, with JIT off (see NO_JIT). */
  private async run<T extends Record<string, unknown>>(query: SQL) {
    return this.db.tx(async (tx) => {
      await tx.execute(NO_JIT);
      return tx.execute<T>(query);
    });
  }

  private async signed(key: string): Promise<string | null> {
    try {
      return (await this.storage.presignDownload(key)).url;
    } catch (error) {
      this.log.warn(`media URL not signed: ${(error as Error).message}`);
      return null;
    }
  }
}
