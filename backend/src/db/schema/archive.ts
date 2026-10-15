import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import {
  ALBUM_TYPE,
  MEDIA_KIND,
  MEMORY_MEMBER_SOURCE,
  MEMORY_VISIBILITY,
  OCCURRED_PRECISION,
  SYNC_STATE,
  TRANSCODE_STATUS,
  UPLOAD_STATUS,
} from '../../shared/enums.js';
import {
  calendarDate,
  createdAt,
  enumCheck,
  enumColumn,
  updatedAt,
  utcTimestamp,
  uuidPk,
  uuidRef,
  vaultScope,
} from './columns.js';
import { users } from './identity.js';
import { members } from './people.js';
import { vaults } from './tenancy.js';

/**
 * The archive — what the product actually stores.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  The first domain that is genuinely vault-scoped.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Identity is self-owned, people are owner-owned; everything here belongs to a
 * vault, which is why `vaultScope()` exists and why row-level security on these
 * tables resolves through `app_vault_role()`.
 *
 * This is also the domain where the difference between an archive and an upload
 * folder is decided, and it comes down to three columns on `memories`:
 * `occurred_at`, `occurred_precision` and `note`.
 */

/**
 * `memories` — the atomic unit of the product.
 *
 * A memory is not a file. It is a moment, with a note about why it mattered and
 * a date it actually happened, which may have zero media attached or twenty.
 */
export const memories = pgTable(
  'memories',
  {
    id: uuidPk(),

    vaultId: vaultScope().references(() => vaults.id, { onDelete: 'cascade' }),

    /** Who added it. Not necessarily who appears in it — see `memory_members`. */
    authorId: uuidRef('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    title: varchar('title', { length: 300 }),

    /**
     * The meaning, not the file.
     *
     * Consumer photo storage solved storage and left this unsolved: forty
     * thousand images with no record of why any of them mattered. This column
     * is the difference, and it is why it is `text` rather than a caption-sized
     * varchar — people write paragraphs when the moment deserves one.
     */
    note: text('note'),

    /**
     * ═════════════════════════════════════════════════════════════════════
     *  WHEN IT HAPPENED — never the upload time.
     * ═════════════════════════════════════════════════════════════════════
     *
     * The timeline is ordered by this column. A scanned 1974 wedding
     * photograph belongs in 1974, not on the Tuesday someone digitised it. Get
     * this wrong and the product is a camera roll with extra steps.
     */
    occurredAt: utcTimestamp('occurred_at').notNull(),

    /**
     * How much of `occurred_at` is actually known.
     *
     * That 1974 photograph has a *year*. Without this column an imported
     * archive either invents a precise timestamp it cannot justify or collapses
     * every old photograph onto the upload date — and both destroy the thing
     * the user came here to preserve.
     */
    occurredPrecision: enumColumn('occurred_precision', OCCURRED_PRECISION)
      .notNull()
      .default('exact'),

    /** "Diwali", "first day of school" — free text, grouped on by the app. */
    occasion: varchar('occasion', { length: 32 }),

    visibility: enumColumn('visibility', MEMORY_VISIBILITY)
      .notNull()
      .default('private'),

    isFavourite: boolean('is_favourite').notNull().default(false),

    /** Which asset represents it. Set after upload, hence nullable. */
    coverMediaId: uuidRef('cover_media_id').references(
      (): AnyPgColumn => mediaAssets.id,
      { onDelete: 'set null' },
    ),

    /**
     * ═════════════════════════════════════════════════════════════════════
     *  The id the DEVICE assigned, which makes offline creation idempotent.
     * ═════════════════════════════════════════════════════════════════════
     *
     * The apps write locally and sync later. When a create fails ambiguously —
     * request sent, response lost — the outbox retries it. Unique on
     * `(author_id, client_id)`, that retry collides instead of producing a
     * second copy of the same moment.
     *
     * Scoped to the author rather than globally unique, because a client id is
     * generated on a device and no device can be trusted not to collide with
     * another one.
     */
    clientId: uuid('client_id').notNull(),

    syncState: enumColumn('sync_state', SYNC_STATE).notNull().default('synced'),

    /**
     * Title, note, people, place and tags, concatenated by the application and
     * indexed with a `tsvector` GIN index plus trigrams for typo tolerance.
     *
     * Maintained in the application rather than by a generated column, because
     * it draws on rows in other tables — the people tagged in the memory live
     * in `memory_members`, which PostgreSQL cannot reach from a generated
     * column expression.
     */
    searchText: text('search_text'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),

    /**
     * Trash, not deletion. Thirty days, then a purge job.
     *
     * The single most destructive action in the product is deleting a memory,
     * and it is frequently a mis-tap. Everything here is recoverable until the
     * purge, and the purge is the only code that issues a real DELETE.
     */
    deletedAt: utcTimestamp('deleted_at'),
  },
  (t) => [
    /**
     * Offline idempotency. The retry after an ambiguous failure hits this and
     * becomes a detectable conflict instead of a duplicate memory.
     */
    uniqueIndex('ux_memories_client').on(t.authorId, t.clientId),

    /**
     * The timeline — the single most-run query in the product.
     *
     * Partial, so the index contains only live rows. PostgreSQL supports that;
     * MySQL does not, which is why the older design notes carry a sentence
     * about keeping `deleted_at` out of the key. That constraint no longer
     * applies, and a partial index is both smaller and faster here.
     *
     * This index also satisfies the rule that a `vault_id` column must have an
     * index leading with it, so no separate single-column scope index is
     * created — on a table heading for hundreds of millions of rows, a
     * redundant index is real storage and real write amplification.
     */
    index('ix_memories_timeline')
      .on(t.vaultId, t.occurredAt.desc())
      .where(sql`${t.deletedAt} IS NULL`),

    /** "On this day" scans a date range forwards rather than newest-first. */
    index('ix_memories_on_this_day')
      .on(t.vaultId, t.occurredAt)
      .where(sql`${t.deletedAt} IS NULL`),

    index('ix_memories_author').on(t.authorId),

    /** The trash view, and the purge job. Partial — almost no rows qualify. */
    index('ix_memories_trash')
      .on(t.vaultId, t.deletedAt)
      .where(sql`${t.deletedAt} IS NOT NULL`),

    check(
      'ck_memories_precision',
      sql.raw(enumCheck('occurred_precision', OCCURRED_PRECISION)),
    ),
    check(
      'ck_memories_visibility',
      sql.raw(enumCheck('visibility', MEMORY_VISIBILITY)),
    ),
    check('ck_memories_sync_state', sql.raw(enumCheck('sync_state', SYNC_STATE))),
  ],
).enableRLS();

/**
 * `media_assets` — the files themselves, and every derivative of them.
 *
 * The original is immutable. Thumbnails, previews, posters and transcodes are
 * additional objects, never replacements: commitment 01 is that a memory is
 * preserved at original quality, and a pipeline that overwrites its input
 * cannot promise that.
 */
export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuidPk(),

    memoryId: uuidRef('memory_id')
      .notNull()
      .references(() => memories.id, { onDelete: 'cascade' }),

    /**
     * ═════════════════════════════════════════════════════════════════════
     *  DENORMALISED on purpose. This is the one copy that matters.
     * ═════════════════════════════════════════════════════════════════════
     *
     * It is reachable through `memory_id`, and deliberately stored here anyway.
     * The post-query scope guard checks `vault_id` on **every returned row of
     * every result set**, and making that a join would put a join in the hot
     * path of a security control.
     *
     * It also lets the RLS policy on this table resolve without touching
     * `memories` at all. The redundancy is the cheaper choice, and the
     * consistency risk is bounded: a media asset never moves vault.
     */
    vaultId: vaultScope().references(() => vaults.id, { onDelete: 'cascade' }),

    ownerId: uuidRef('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    kind: enumColumn('kind', MEDIA_KIND).notNull(),
    mime: varchar('mime', { length: 128 }).notNull(),

    /**
     * `bigint` with a CHECK, because PostgreSQL has no unsigned integers.
     *
     * MySQL's `BIGINT UNSIGNED` has no equivalent here; the constraint does the
     * same job explicitly, and a negative byte count is a bug worth catching at
     * the boundary rather than in a billing total.
     */
    bytes: bigint('bytes', { mode: 'bigint' }).notNull(),

    width: integer('width'),
    height: integer('height'),
    durationMs: integer('duration_ms'),

    /**
     * Where the object lives: `vault/<id>/memory/<id>/asset/<id>/<variant>`.
     *
     * Unique, because two rows pointing at one object means deleting either row
     * destroys the other's file.
     */
    storageKey: varchar('storage_key', { length: 512 }).notNull(),

    thumbKey: varchar('thumb_key', { length: 512 }),
    previewKey: varchar('preview_key', { length: 512 }),
    posterKey: varchar('poster_key', { length: 512 }),

    /**
     * About thirty bytes that encode a blurred version of the image.
     *
     * It renders instantly from the row itself, with no second request, so a
     * timeline on a slow Indian 3G connection shows something recognisable
     * while the thumbnails are still in flight.
     */
    blurhash: varchar('blurhash', { length: 64 }),

    /**
     * Indexed, because a monthly sweep re-reads every object and compares.
     *
     * "The file is still there" is not the promise. "The file is still the file
     * you uploaded" is, and only a checksum can say so — silent corruption in
     * object storage is rare and not zero, and this archive is meant to last
     * decades.
     */
    checksumSha256: varchar('checksum_sha256', { length: 64 }).notNull(),

    /** Release 2 de-duplication: near-identical images, not identical bytes. */
    perceptualHash: varchar('perceptual_hash', { length: 32 }),

    /** EXIF `DateTimeOriginal` — what the camera said, before anyone edited it. */
    capturedAt: utcTimestamp('captured_at'),

    /**
     * `jsonb`, and **GPS is stripped unless the user opts in**.
     *
     * A photograph of a child carries the coordinates of a home, and a family
     * archive that quietly retains them has built a location history nobody
     * asked for. Stripping happens at ingest, so the coordinates never reach
     * this column rather than being filtered on the way out.
     */
    exif: jsonb('exif'),

    transcodeStatus: enumColumn('transcode_status', TRANSCODE_STATUS)
      .notNull()
      .default('pending'),

    /** Which renditions exist, and where. Shape varies by `kind`. */
    transcodeVariants: jsonb('transcode_variants'),

    sortOrder: integer('sort_order').notNull().default(0),

    createdAt: createdAt(),
    deletedAt: utcTimestamp('deleted_at'),
  },
  (t) => [
    index('ix_media_memory').on(t.memoryId, t.sortOrder),
    index('ix_media_vault').on(t.vaultId),

    /** The transcode worker claims the oldest pending rows. */
    index('ix_media_transcode').on(t.transcodeStatus, t.createdAt),

    index('ix_media_checksum').on(t.checksumSha256),
    uniqueIndex('ux_media_storage_key').on(t.storageKey),

    check('ck_media_kind', sql.raw(enumCheck('kind', MEDIA_KIND))),
    check(
      'ck_media_transcode',
      sql.raw(enumCheck('transcode_status', TRANSCODE_STATUS)),
    ),
    check('ck_media_bytes', sql`${t.bytes} >= 0`),
  ],
).enableRLS();

/**
 * `upload_sessions` — resumability, as a first-class table.
 *
 * Without server-side upload state a 4K video interrupted at 80% restarts from
 * zero. On a mobile connection that is not an inconvenience, it is the reason
 * somebody stops using the product.
 *
 * Deliberately NOT vault-scoped: a session exists before anyone has decided
 * which memory, and therefore which vault, the file belongs to.
 */
export const uploadSessions = pgTable(
  'upload_sessions',
  {
    id: uuidPk(),

    userId: uuidRef('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** The device's own id for this upload, so a retry resumes rather than restarts. */
    clientId: uuid('client_id').notNull(),

    /** Nullable: the memory may not exist yet when the bytes start moving. */
    intendedMemoryId: uuidRef('intended_memory_id').references(
      () => memories.id,
      { onDelete: 'set null' },
    ),

    filename: varchar('filename', { length: 255 }).notNull(),

    bytesTotal: bigint('bytes_total', { mode: 'bigint' }).notNull(),
    bytesReceived: bigint('bytes_received', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),

    /**
     * One ETag per confirmed part.
     *
     * The storage provider requires every part's ETag to assemble the final
     * object, and they arrive one at a time over what may be hours and several
     * network changes. Losing this list means re-uploading the whole file.
     */
    parts: jsonb('parts'),

    /** The provider's multipart upload id. Needed to abort as well as finish. */
    storageUploadId: varchar('storage_upload_id', { length: 255 }),

    status: enumColumn('status', UPLOAD_STATUS).notNull().default('pending'),

    /**
     * Abandoned uploads cost money until they are aborted.
     *
     * An unfinished multipart upload keeps its parts billable indefinitely, so
     * this column drives a sweep that aborts them at the provider.
     */
    expiresAt: utcTimestamp('expires_at').notNull(),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('ux_upload_sessions_client').on(t.userId, t.clientId),
    index('ix_upload_sessions_user').on(t.userId, t.status),
    index('ix_upload_sessions_expiry')
      .on(t.expiresAt)
      .where(sql`${t.status} IN ('pending', 'uploading')`),

    check('ck_upload_status', sql.raw(enumCheck('status', UPLOAD_STATUS))),
    check(
      'ck_upload_bytes',
      sql`${t.bytesTotal} >= 0 AND ${t.bytesReceived} >= 0 AND ${t.bytesReceived} <= ${t.bytesTotal}`,
    ),
  ],
).enableRLS();

/**
 * `albums` — curated sets.
 *
 * `type` separates the three ways one comes into existence: assembled by hand,
 * detected from an event, or created as a shared space other people contribute
 * to. They behave differently enough that collapsing them would mean a
 * `nullable` column for each difference.
 */
export const albums = pgTable(
  'albums',
  {
    id: uuidPk(),

    vaultId: vaultScope().references(() => vaults.id, { onDelete: 'cascade' }),

    ownerId: uuidRef('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),

    type: enumColumn('type', ALBUM_TYPE).notNull().default('manual'),

    coverMediaId: uuidRef('cover_media_id').references(() => mediaAssets.id, {
      onDelete: 'set null',
    }),

    /** For an event album: the window it covers. Dates, not instants. */
    startDate: calendarDate('start_date'),
    endDate: calendarDate('end_date'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('ix_albums_vault_type').on(t.vaultId, t.type),
    check('ck_albums_type', sql.raw(enumCheck('type', ALBUM_TYPE))),
    check(
      'ck_albums_dates',
      sql`${t.startDate} IS NULL OR ${t.endDate} IS NULL OR ${t.startDate} <= ${t.endDate}`,
    ),
  ],
).enableRLS();

/**
 * `album_memories` — which memories are in which album, and in what order.
 *
 * `sort_order` is explicit because an album is curated: the sequence is the
 * user's editorial choice, and sorting by date would discard it.
 */
export const albumMemories = pgTable(
  'album_memories',
  {
    albumId: uuidRef('album_id')
      .notNull()
      .references(() => albums.id, { onDelete: 'cascade' }),

    memoryId: uuidRef('memory_id')
      .notNull()
      .references(() => memories.id, { onDelete: 'cascade' }),

    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    primaryKey({
      name: 'pk_album_memories',
      columns: [t.albumId, t.memoryId],
    }),

    /** Reading an album: its memories, in the curated order. */
    index('ix_album_memories_order').on(t.albumId, t.sortOrder),

    /** The reverse: "which albums is this memory in", on the memory screen. */
    index('ix_album_memories_memory').on(t.memoryId),
  ],
).enableRLS();

/**
 * `memory_members` — who appears in a memory.
 *
 * Belongs to the people domain by meaning and lands here because it references
 * `memories`, which did not exist until this migration.
 *
 * It joins two things with *different* owners: a memory belongs to a vault,
 * a member belongs to one user. So writing a row requires both — permission to
 * write the memory, and ownership of the member. A contributor to a shared
 * vault may tag their own people, never somebody else's.
 */
export const memoryMembers = pgTable(
  'memory_members',
  {
    memoryId: uuidRef('memory_id')
      .notNull()
      .references(() => memories.id, { onDelete: 'cascade' }),

    memberId: uuidRef('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),

    source: enumColumn('source', MEMORY_MEMBER_SOURCE)
      .notNull()
      .default('manual'),

    /** 0–1, from whatever proposed the tag. Null when a person did. */
    confidence: numeric('confidence', { precision: 4, scale: 3 }),

    /**
     * Null means *suggested*, not confirmed.
     *
     * An automatic tag is a question until a person answers it. Treating a
     * guess as a fact is how a product tells somebody their late father is in a
     * photograph he is not in.
     */
    confirmedAt: utcTimestamp('confirmed_at'),

    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({
      name: 'pk_memory_members',
      columns: [t.memoryId, t.memberId],
    }),

    /** "Every memory this person appears in" — their profile screen. */
    index('ix_memory_members_member').on(t.memberId),

    /** The review queue: unconfirmed automatic suggestions. */
    index('ix_memory_members_pending')
      .on(t.memoryId)
      .where(sql`${t.confirmedAt} IS NULL`),

    check(
      'ck_memory_members_source',
      sql.raw(enumCheck('source', MEMORY_MEMBER_SOURCE)),
    ),
    check(
      'ck_memory_members_confidence',
      sql`${t.confidence} IS NULL OR (${t.confidence} >= 0 AND ${t.confidence} <= 1)`,
    ),
    /** A manual tag is a statement of fact; it carries no confidence score. */
    check(
      'ck_memory_members_manual',
      sql`${t.source} <> 'manual' OR ${t.confidence} IS NULL`,
    ),
  ],
).enableRLS();
