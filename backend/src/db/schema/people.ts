import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import {
  EVENT_TYPE,
  NOTIFICATION_CHANNEL,
  OCCURRED_PRECISION,
  RECURRENCE,
} from '../../shared/enums.js';
import {
  calendarDate,
  citext,
  createdAt,
  enumArrayCheck,
  enumCheck,
  enumColumn,
  opaqueToken,
  updatedAt,
  utcTimestamp,
  uuidPk,
  uuidRef,
} from './columns.js';
import { users } from './identity.js';

/**
 * People and occasions.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  Members are NOT users, and nothing here is scoped to a vault.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A member is a record *about* a person — a grandmother, a child, a friend —
 * written by somebody else. These are real people who never consented to being
 * in this database, so a member row is private to its owner and never
 * discoverable, searchable or joinable across accounts.
 *
 * That is why these tables carry `owner_id` rather than `vault_id`. A shared
 * vault lets several people contribute memories; it does not let them read each
 * other's address books. Row-level security here keys on the owner, exactly as
 * it does for sessions and devices.
 */

/**
 * `members` — the people a user keeps track of.
 *
 * Deliberately not a social graph. There is no friend request, no mutual
 * connection, and no way to discover that someone else has a row about you.
 */
export const members = pgTable(
  'members',
  {
    id: uuidPk(),

    ownerId: uuidRef('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 200 }).notNull(),

    /**
     * `mother`, `daughter`, `school friend` — a suggested vocabulary, not a
     * constraint.
     *
     * The one column here that is deliberately *not* an enum. Family structures
     * do not fit a fixed list, and a user who cannot describe a relationship
     * correctly will put the truth in the name field instead, which is worse.
     */
    relationship: varchar('relationship', { length: 64 }),

    /** FK added with the archive domain, which owns `media_assets`. */
    avatarMediaId: uuidRef('avatar_media_id'),

    phone: varchar('phone', { length: 32 }),
    phoneVerifiedAt: utcTimestamp('phone_verified_at'),

    /**
     * `citext`, like `users.email`, so re-adding somebody with different
     * capitalisation is detectable as the duplicate it is. Not unique: two
     * different users may each keep a record of the same person, and must never
     * learn that from a constraint violation.
     */
    email: citext('email'),
    emailVerifiedAt: utcTimestamp('email_verified_at'),

    /**
     * `date`, not `timestamptz`. A birthday is the 14th of March everywhere;
     * an instant would shift it a day for anyone who travels.
     */
    birthday: calendarDate('birthday'),

    /**
     * How much of the birthday is actually known.
     *
     * "March 1962" is a real answer for a grandparent, and the alternative is
     * inventing a day nobody can verify and then celebrating it.
     */
    birthdayPrecision: enumColumn('birthday_precision', OCCURRED_PRECISION),

    anniversary: calendarDate('anniversary'),

    notes: text('notes'),

    /**
     * Lets the owner send "fill in your own details" rather than guess them.
     *
     * Hashed, and nullable because most members never get one. Nothing about
     * the member is revealed by holding the token — it authorises writing to
     * one row, not reading the archive.
     */
    selfServiceTokenHash: opaqueToken('self_service_token_hash', 64),

    /**
     * Set if this person turns out to have an account of their own.
     *
     * `set null`, not `cascade`: if they later delete their account, the
     * owner's record of their grandmother does not vanish with it.
     */
    linkedUserId: uuidRef('linked_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    /**
     * Recorded, never used to hide the person.
     *
     * The product's whole premise is that memories of someone outlive them.
     * This column exists so the app can stop sending birthday reminders in the
     * present tense — a detail that, got wrong, is cruel.
     */
    deceasedAt: utcTimestamp('deceased_at'),

    /**
     * De-duplication without deletion.
     *
     * "Mum" and "Amma" are one person discovered to be one person. Merging
     * points the loser at the winner and keeps it, because memories, events and
     * capsules already reference the old id and must keep resolving.
     */
    mergedIntoId: uuidRef('merged_into_id').references(
      (): AnyPgColumn => members.id,
      { onDelete: 'set null' },
    ),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Every list in the app is one owner's people, sorted by name.
    index('ix_members_owner_name').on(t.ownerId, t.name),

    // Partial: most members have no birthday recorded, and the occasions UI
    // only ever asks about the ones that do.
    index('ix_members_owner_birthday')
      .on(t.ownerId, t.birthday)
      .where(sql`${t.birthday} IS NOT NULL`),

    index('ix_members_linked_user')
      .on(t.linkedUserId)
      .where(sql`${t.linkedUserId} IS NOT NULL`),

    uniqueIndex('ux_members_self_service_token')
      .on(t.selfServiceTokenHash)
      .where(sql`${t.selfServiceTokenHash} IS NOT NULL`),

    check(
      'ck_members_birthday_precision',
      sql.raw(enumCheck('birthday_precision', OCCURRED_PRECISION)),
    ),

    // A merge that points at itself would make the resolution loop forever.
    check('ck_members_merge_not_self', sql`${t.mergedIntoId} <> ${t.id}`),
  ],
).enableRLS();

/**
 * `events` — birthdays, anniversaries, festivals and anything else.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  Recurrence is a rule. Occurrences are computed, never stored.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A yearly birthday does not become fifty rows. It is one row with
 * `recurrence = 'yearly'`, and the next occurrence is arithmetic on
 * `event_date`. Materialising occurrences would mean deciding how far into the
 * future to generate them, backfilling when that horizon is reached, and
 * rewriting every generated row when somebody corrects the date by one day.
 */
export const events = pgTable(
  'events',
  {
    id: uuidPk(),

    ownerId: uuidRef('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    title: varchar('title', { length: 200 }).notNull(),

    type: enumColumn('type', EVENT_TYPE).notNull().default('custom'),

    /** The original date. For a recurring event, the first occurrence. */
    eventDate: calendarDate('event_date').notNull(),

    recurrence: enumColumn('recurrence', RECURRENCE).notNull().default('none'),

    /**
     * Defaults to true, because almost every occasion is a day rather than a
     * moment. The exception — a scheduled call at 19:00 — is why the column
     * exists at all.
     */
    allDay: boolean('all_day').notNull().default(true),

    notes: text('notes'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),

    /**
     * Archived rather than deleted. An event that capsules or reminders point
     * at must keep resolving, and "we stopped marking this anniversary" is a
     * thing a family may want to undo.
     */
    archivedAt: utcTimestamp('archived_at'),
  },
  (t) => [
    index('ix_events_owner_date').on(t.ownerId, t.eventDate),
    index('ix_events_owner_type').on(t.ownerId, t.type),

    check('ck_events_type', sql.raw(enumCheck('type', EVENT_TYPE))),
    check(
      'ck_events_recurrence',
      sql.raw(enumCheck('recurrence', RECURRENCE)),
    ),
  ],
).enableRLS();

/**
 * `event_members` — who an occasion is about.
 *
 * Many-to-many because an anniversary has two people. A one-to-many model
 * would have needed rework the first time somebody added a wedding.
 */
export const eventMembers = pgTable(
  'event_members',
  {
    eventId: uuidRef('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),

    memberId: uuidRef('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({
      name: 'pk_event_members',
      columns: [t.eventId, t.memberId],
    }),

    // The reverse question — "what occasions involve this person" — opens
    // their profile. The primary key leads with event_id and cannot serve it.
    index('ix_event_members_member').on(t.memberId),
  ],
).enableRLS();

/**
 * `event_reminders` — when to say something about an occasion.
 *
 * Separate from the event because one occasion wants several nudges: a week
 * ahead to buy something, and on the morning itself.
 */
export const eventReminders = pgTable(
  'event_reminders',
  {
    id: uuidPk(),

    eventId: uuidRef('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),

    /** How many days before the occurrence. 0 means on the day. */
    offsetDays: integer('offset_days').notNull().default(0),

    /**
     * Where to send it, as an array rather than a comma-separated string.
     *
     * A CSV column cannot be constrained or queried — the database could not
     * tell `push,email` from `push,emial`, and finding every email reminder
     * would mean a LIKE scan. An array takes a real CHECK and an index.
     *
     * Empty is allowed and meaningful: a reminder that shows in-app only.
     */
    channels: text('channels')
      .array()
      .notNull()
      .default(sql`ARRAY['push']::text[]`),

    /**
     * The year this reminder last fired — the single column that replaces a
     * table of materialised occurrences.
     *
     * The job writes it after sending. A crash between sending and writing
     * sends one duplicate; the inverse ordering would silently skip somebody's
     * birthday, and of the two failures only one is forgivable.
     */
    lastFiredForYear: integer('last_fired_for_year'),

    createdAt: createdAt(),
  },
  (t) => [
    index('ix_event_reminders_event').on(t.eventId),

    // The reminder sweep asks for rows not yet fired this year.
    index('ix_event_reminders_fired').on(t.lastFiredForYear),

    // One reminder per offset per event. Without this, editing a reminder by
    // inserting a new one quietly doubles the notification.
    uniqueIndex('ux_event_reminders_offset').on(t.eventId, t.offsetDays),

    check(
      'ck_event_reminders_offset',
      sql`${t.offsetDays} >= 0 AND ${t.offsetDays} <= 365`,
    ),
    check(
      'ck_event_reminders_channels',
      sql.raw(enumArrayCheck('channels', NOTIFICATION_CHANNEL)),
    ),
  ],
).enableRLS();
