import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  ADMIN_ACTION,
  ADMIN_MODULE,
  APPEAL_STATE,
  AUDIT_ACTOR,
  MODERATION_SEVERITY,
  MODERATION_SOURCE,
  MODERATION_SUBJECT,
  REVIEW_STATE,
} from '../../shared/enums.js';
import {
  citext,
  createdAt,
  enumCheck,
  enumColumn,
  updatedAt,
  utcTimestamp,
  uuidPk,
  uuidRef,
} from './columns.js';
import { users } from './identity.js';

/**
 * Trust, safety, governance and the admin realm.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  A different security model from every other domain.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Everywhere else the question is "may this user see this row". Here it becomes
 * "which employee read a family's private archive, and why" — which is a
 * question about *us*, answerable only if the answer is recorded at the moment
 * it happens.
 *
 * Most of these tables are invisible to `mm_app` entirely. They have RLS
 * enabled and no policy, so the API cannot read or write them; the admin
 * console connects as its own role. The exceptions are the three that are
 * genuinely user-facing — `reports`, `blocks`, and a user's own `audit_logs`.
 */

// ─── The admin realm ─────────────────────────────────────────────────────────

/**
 * `roles` — a named bundle of permissions.
 *
 * Separate from `admin_users` so that "what a support agent may do" is changed
 * in one place rather than per person, and so the change is reviewable.
 */
export const roles = pgTable(
  'roles',
  {
    id: uuidPk(),
    name: varchar('name', { length: 64 }).notNull(),
    description: text('description'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('ux_roles_name').on(t.name)],
).enableRLS();

/**
 * `permissions` — the module × action matrix.
 *
 * A row is a grant. No row is a denial, so a new module is inaccessible to
 * every existing role until somebody deliberately grants it — which is the
 * correct direction for a table that decides who may read a stranger's
 * photographs.
 */
export const permissions = pgTable(
  'permissions',
  {
    roleId: uuidRef('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),

    module: enumColumn('module', ADMIN_MODULE).notNull(),
    action: enumColumn('action', ADMIN_ACTION).notNull(),
  },
  (t) => [
    primaryKey({
      name: 'pk_permissions',
      columns: [t.roleId, t.module, t.action],
    }),
    check('ck_permissions_module', sql.raw(enumCheck('module', ADMIN_MODULE))),
    check('ck_permissions_action', sql.raw(enumCheck('action', ADMIN_ACTION))),
  ],
).enableRLS();

/**
 * `admin_users` — staff, in their own realm.
 *
 * Deliberately **not** a flag on `users`. An admin is a different kind of
 * principal with a different login, different credentials and a different
 * audit expectation; a boolean on the user table is how a compromised customer
 * account becomes a compromised console.
 */
export const adminUsers = pgTable(
  'admin_users',
  {
    id: uuidPk(),

    email: citext('email').notNull(),

    roleId: uuidRef('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),

    /**
     * Encrypted at the application layer before it reaches this column.
     *
     * MFA is mandatory for every admin, with no bypass: the console can read
     * other people's family archives, and a password alone is not a credential
     * worth that.
     */
    totpSecretEnc: text('totp_secret_enc'),
    backupCodesEnc: text('backup_codes_enc'),

    lastLoginAt: utcTimestamp('last_login_at'),

    /**
     * Deactivated, never deleted. Their audit rows and break-glass approvals
     * must keep resolving to a person long after they leave.
     */
    isActive: boolean('is_active').notNull().default(true),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('ux_admin_users_email').on(t.email),
    index('ix_admin_users_role').on(t.roleId),
  ],
).enableRLS();

// ─── The audit trail ─────────────────────────────────────────────────────────

/**
 * `audit_logs` — append-only, and a **product feature**.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  Indexed by `vault_id` because the user reads their own access log.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This is not merely an internal log. "Who opened my archive, and when" is
 * surfaced in privacy settings, which is what makes the rest of the privacy
 * claims checkable rather than promised.
 *
 * Append-only is enforced by a trigger in migration 0008 — not by the absence
 * of an UPDATE policy, because the table owner would bypass that. An audit
 * trail that privileged code can quietly rewrite is not an audit trail.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuidPk(),

    actorType: enumColumn('actor_type', AUDIT_ACTOR).notNull(),

    /** Null for `system`, and for a recipient who has no account. */
    actorId: uuidRef('actor_id'),

    /** Null for actions that are not about a vault — a login, a payment. */
    vaultId: uuidRef('vault_id'),

    action: varchar('action', { length: 64 }).notNull(),

    /** Polymorphic, and left unenforced: an audit row must survive the thing
     * it describes being deleted, so a foreign key would be wrong here. */
    resourceType: varchar('resource_type', { length: 32 }).notNull(),
    resourceId: uuidRef('resource_id'),

    /**
     * Hashed, never the address.
     *
     * The trail needs to correlate accesses — "the same place as last time" —
     * which a hash answers. Storing the address itself would make this table a
     * location history of every user, kept for two years.
     */
    ipHash: varchar('ip_hash', { length: 64 }),

    userAgent: varchar('user_agent', { length: 512 }),

    metadata: jsonb('metadata'),

    createdAt: createdAt(),
  },
  (t) => [
    /** The user's own access log, newest first. A product feature. */
    index('ix_audit_vault_time').on(t.vaultId, t.createdAt.desc()),

    index('ix_audit_actor_time').on(t.actorId, t.createdAt.desc()),
    index('ix_audit_resource').on(t.resourceType, t.resourceId, t.createdAt),

    /** The 24-month retention purge. */
    index('ix_audit_retention').on(t.createdAt),

    check('ck_audit_actor', sql.raw(enumCheck('actor_type', AUDIT_ACTOR))),
  ],
).enableRLS();

/**
 * `break_glass_access` — support reading a user's content, designed for rather
 * than improvised.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  `user_notified_at` is the column that makes this honest.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Support sometimes genuinely needs to see what a user sees. The alternative to
 * designing for it is an undocumented path that nobody logs — so this records
 * the admin, the target, the reason, the approver and an expiry, **and the user
 * is told**.
 */
export const breakGlassAccess = pgTable(
  'break_glass_access',
  {
    id: uuidPk(),

    adminId: uuidRef('admin_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'restrict' }),

    targetUserId: uuidRef('target_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    /** Required, and required to be a sentence. A CHECK enforces a length. */
    reason: text('reason').notNull(),

    /**
     * A second person. Never the requester — a CHECK in migration 0008
     * forbids self-approval, because an approval you can grant yourself is a
     * field, not a control.
     */
    approvedBy: uuidRef('approved_by').references(() => adminUsers.id, {
      onDelete: 'restrict',
    }),

    /** Access is time-boxed. An open-ended grant is a standing one. */
    expiresAt: utcTimestamp('expires_at').notNull(),

    /**
     * When the user was told. The product's privacy claim depends on this
     * being filled in, so an unfilled column is a reportable defect rather
     * than an untidy row.
     */
    userNotifiedAt: utcTimestamp('user_notified_at'),

    createdAt: createdAt(),
  },
  (t) => [
    index('ix_break_glass_target').on(t.targetUserId, t.createdAt.desc()),
    index('ix_break_glass_admin').on(t.adminId, t.createdAt.desc()),

    /** The compliance sweep: granted access that nobody has disclosed yet. */
    index('ix_break_glass_unnotified')
      .on(t.createdAt)
      .where(sql`${t.userNotifiedAt} IS NULL`),

    check('ck_break_glass_reason', sql`length(${t.reason}) >= 20`),
    check('ck_break_glass_no_self_approval', sql`${t.approvedBy} <> ${t.adminId}`),
  ],
).enableRLS();

// ─── Trust and safety ────────────────────────────────────────────────────────

/** `reports` — a user telling us something is wrong. */
export const reports = pgTable(
  'reports',
  {
    id: uuidPk(),

    reporterId: uuidRef('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    subjectType: enumColumn('subject_type', MODERATION_SUBJECT).notNull(),
    subjectId: uuidRef('subject_id').notNull(),

    reason: varchar('reason', { length: 64 }).notNull(),
    details: text('details'),

    state: enumColumn('state', REVIEW_STATE).notNull().default('open'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('ix_reports_subject').on(t.subjectType, t.subjectId),
    index('ix_reports_reporter').on(t.reporterId, t.createdAt.desc()),
    index('ix_reports_open')
      .on(t.createdAt)
      .where(sql`${t.state} = 'open'`),

    check('ck_reports_subject', sql.raw(enumCheck('subject_type', MODERATION_SUBJECT))),
    check('ck_reports_state', sql.raw(enumCheck('state', REVIEW_STATE))),

    /** One report per person per thing. Repeat reports are not votes. */
    uniqueIndex('ux_reports_once').on(t.reporterId, t.subjectType, t.subjectId),
  ],
).enableRLS();

/**
 * `moderation_flags` — the review queue.
 *
 * `sla_due_at` is what makes this a queue with a **deadline** rather than a
 * backlog. A flag that has no due date is a flag that is never late, and a
 * moderation queue nobody is late on is one nobody works.
 */
export const moderationFlags = pgTable(
  'moderation_flags',
  {
    id: uuidPk(),

    /** Nullable: an automatic flag has no report behind it. */
    reportId: uuidRef('report_id').references(() => reports.id, {
      onDelete: 'set null',
    }),

    subjectType: enumColumn('subject_type', MODERATION_SUBJECT).notNull(),
    subjectId: uuidRef('subject_id').notNull(),

    source: enumColumn('source', MODERATION_SOURCE).notNull(),

    /** Classifier scores. Kept so a disputed decision can be re-examined. */
    signal: jsonb('signal'),

    severity: enumColumn('severity', MODERATION_SEVERITY)
      .notNull()
      .default('low'),

    slaDueAt: utcTimestamp('sla_due_at').notNull(),

    state: enumColumn('state', REVIEW_STATE).notNull().default('open'),

    reviewedBy: uuidRef('reviewed_by').references(() => adminUsers.id, {
      onDelete: 'restrict',
    }),
    reviewedAt: utcTimestamp('reviewed_at'),
    actionTaken: varchar('action_taken', { length: 64 }),

    /**
     * A wrong takedown must be correctable.
     *
     * The material here is irreplaceable, so a moderation system that treats
     * its own mistakes as final is not acceptable — hence a state machine for
     * appeals rather than a boolean.
     */
    appealState: enumColumn('appeal_state', APPEAL_STATE)
      .notNull()
      .default('none'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    /** The queue, worked by deadline. Partial — closed flags are not queued. */
    index('ix_flags_queue')
      .on(t.slaDueAt)
      .where(sql`${t.state} IN ('open', 'reviewing')`),

    index('ix_flags_subject').on(t.subjectType, t.subjectId),
    index('ix_flags_severity').on(t.severity, t.slaDueAt),

    /** Appeals waiting on somebody. */
    index('ix_flags_appeals')
      .on(t.appealState)
      .where(sql`${t.appealState} = 'requested'`),

    check('ck_flags_subject', sql.raw(enumCheck('subject_type', MODERATION_SUBJECT))),
    check('ck_flags_source', sql.raw(enumCheck('source', MODERATION_SOURCE))),
    check('ck_flags_severity', sql.raw(enumCheck('severity', MODERATION_SEVERITY))),
    check('ck_flags_state', sql.raw(enumCheck('state', REVIEW_STATE))),
    check('ck_flags_appeal', sql.raw(enumCheck('appeal_state', APPEAL_STATE))),

    /** A reviewed flag names its reviewer, and an unreviewed one does not. */
    check(
      'ck_flags_reviewer_paired',
      sql`(${t.reviewedBy} IS NULL) = (${t.reviewedAt} IS NULL)`,
    ),
  ],
).enableRLS();

/**
 * `blocks` — one user refusing contact from another.
 *
 * The composite primary key is the whole table: the only question ever asked
 * of it is "has A blocked B", and that is one index descent.
 */
export const blocks = pgTable(
  'blocks',
  {
    blockerId: uuidRef('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    blockedUserId: uuidRef('blocked_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({
      name: 'pk_blocks',
      columns: [t.blockerId, t.blockedUserId],
    }),

    /** "Who has blocked me" — which the blocked user is never shown. */
    index('ix_blocks_blocked').on(t.blockedUserId),

    check('ck_blocks_not_self', sql`${t.blockerId} <> ${t.blockedUserId}`),
  ],
).enableRLS();

// ─── Operations ──────────────────────────────────────────────────────────────

/**
 * `feature_flags` — rollout percentage, segment rules, kill switches.
 *
 * The one table in this domain the application may read, because it has to
 * evaluate flags on every request. It may not write them.
 */
export const featureFlags = pgTable(
  'feature_flags',
  {
    flagKey: varchar('flag_key', { length: 64 }).primaryKey(),

    description: text('description'),

    rolloutPct: integer('rollout_pct').notNull().default(0),

    /** Which cohorts, beyond the percentage. Shape varies by flag. */
    segmentSpec: jsonb('segment_spec'),

    /**
     * A kill switch is not a rollout at 0%.
     *
     * The distinction matters operationally: a kill switch is pulled during an
     * incident and must be unambiguous in a list of forty flags, where "0%"
     * reads like a feature nobody has started rolling out yet.
     */
    isKillSwitch: boolean('is_kill_switch').notNull().default(false),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      'ck_flags_rollout_range',
      sql`${t.rolloutPct} >= 0 AND ${t.rolloutPct} <= 100`,
    ),
  ],
).enableRLS();
