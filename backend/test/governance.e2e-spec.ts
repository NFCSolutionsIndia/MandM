import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';

import type { DbService } from '../src/db/db.service.js';
import {
  adminUsers,
  auditLogs,
  blocks,
  featureFlags,
  moderationFlags,
  reports,
  roles,
} from '../src/db/schema/index.js';
import {
  connect,
  disconnect,
  pgCode,
  resetDatabase,
  type Harness,
} from './support/database.js';

/**
 * Governance — the domain whose question is about us rather than about a user.
 *
 * Everywhere else the question is "may this user see this row". Here it becomes
 * "which employee read a family's private archive, and why" — answerable only
 * if the answer is recorded at the moment it happens, and only trustworthy if
 * the record cannot be edited afterwards.
 */

const AARAV = '01900000-0000-7000-8000-00000000aa01';
const BINA = '01900000-0000-7000-8000-00000000bb01';
const FAMILY_VAULT = '01900000-0000-7000-8000-0000000aaaa1';

describe('governance domain', () => {
  let harness: Harness;
  let ownerPool: Pool;
  let service: DbService;

  let adminId: string;
  let approverId: string;
  let breakGlassId: string;
  let auditId: string;

  beforeAll(async () => {
    harness = await connect();
    ownerPool = harness.ownerPool;
    service = harness.service;

    await resetDatabase(ownerPool);

    await ownerPool.query(
      `INSERT INTO users (id, email, name) VALUES ($1,'a@example.com','Aarav'), ($2,'b@example.com','Bina')`,
      [AARAV, BINA],
    );
    await ownerPool.query(
      `INSERT INTO vaults (id, owner_id, name) VALUES ($1,$2,'Family')`,
      [FAMILY_VAULT, AARAV],
    );
    await ownerPool.query(
      `INSERT INTO vault_members (vault_id, user_id, role) VALUES ($1,$2,'owner')`,
      [FAMILY_VAULT, AARAV],
    );

    const role = await ownerPool.query<{ id: string }>(
      `INSERT INTO roles (id, name, description)
       VALUES (gen_random_uuid(), 'support', 'Front-line support')
       RETURNING id`,
    );
    await ownerPool.query(
      `INSERT INTO permissions (role_id, module, action) VALUES ($1,'users','read'), ($1,'support','write')`,
      [role.rows[0].id],
    );

    const admins = await ownerPool.query<{ id: string }>(
      `INSERT INTO admin_users (id, email, role_id) VALUES
         (gen_random_uuid(), 'agent@mm.internal', $1),
         (gen_random_uuid(), 'lead@mm.internal', $1)
       RETURNING id`,
      [role.rows[0].id],
    );
    adminId = admins.rows[0].id;
    approverId = admins.rows[1].id;
  }, 60_000);

  afterAll(async () => {
    // No need to disable the append-only triggers: resetDatabase() uses
    // TRUNCATE, and TRUNCATE does not fire row-level DELETE triggers. Worth
    // knowing in both directions — it is also the limit of what those triggers
    // guarantee. See the note in SETUP.md.
    await resetDatabase(ownerPool);
    await disconnect(harness);
  });

  // ── the admin realm is invisible to the API ───────────────────────────────

  it('hides the admin realm from the application entirely', async () => {
    const seenRoles = await service.txAs(AARAV, (tx) => tx.select().from(roles));
    const seenAdmins = await service.txAs(AARAV, (tx) => tx.select().from(adminUsers));
    const seenFlags = await service.txAs(AARAV, (tx) =>
      tx.select().from(moderationFlags),
    );

    // RLS enabled, no policy at all. The console connects as its own role.
    expect(seenRoles).toHaveLength(0);
    expect(seenAdmins).toHaveLength(0);
    expect(seenFlags).toHaveLength(0);

    const { rows } = await ownerPool.query('SELECT 1 FROM admin_users');
    expect(rows).toHaveLength(2);
  });

  it('refuses to let the API create an admin', async () => {
    const attempt = service.txAs(AARAV, (tx) =>
      tx.insert(roles).values({ name: 'superuser' }),
    );

    await expect(attempt).rejects.toThrow();
    expect(pgCode(await attempt.catch((e: unknown) => e))).toBe('42501');
  });

  // ── the audit trail ───────────────────────────────────────────────────────

  it('lets a user write their own trail and nobody else’s', async () => {
    const [row] = await service.txAs(AARAV, (tx) =>
      tx
        .insert(auditLogs)
        .values({
          actorType: 'user',
          actorId: AARAV,
          vaultId: FAMILY_VAULT,
          action: 'memory.view',
          resourceType: 'memory',
        })
        .returning(),
    );
    auditId = row.id;

    const forged = service.txAs(AARAV, (tx) =>
      tx.insert(auditLogs).values({
        actorType: 'admin',
        actorId: AARAV,
        action: 'break_glass.read',
        resourceType: 'vault',
      }),
    );

    // The API cannot forge an admin or system entry — it may only record what
    // is true about itself.
    await expect(forged).rejects.toThrow();
    expect(pgCode(await forged.catch((e: unknown) => e))).toBe('42501');
  });

  it('shows a user their own access log, because that is a product feature', async () => {
    const mine = await service.txAs(AARAV, (tx) => tx.select().from(auditLogs));
    expect(mine).toHaveLength(1);

    const theirs = await service.txAs(BINA, (tx) => tx.select().from(auditLogs));
    expect(theirs).toHaveLength(0);
  });

  it('refuses to rewrite the audit trail, even as the table owner', async () => {
    // The absence of an UPDATE policy stops mm_app. It does not stop the owner,
    // a migration, or anybody with a psql prompt — and a trail that privileged
    // code can quietly rewrite is not a trail. A trigger refuses both.
    const asOwner = ownerPool.query(
      "UPDATE audit_logs SET action = 'nothing.happened' WHERE id = $1",
      [auditId],
    );
    await expect(asOwner).rejects.toMatchObject({ code: '42501' });

    const deletion = ownerPool.query('DELETE FROM audit_logs WHERE id = $1', [
      auditId,
    ]);
    await expect(deletion).rejects.toMatchObject({ code: '42501' });

    const { rows } = await ownerPool.query<{ action: string }>(
      'SELECT action FROM audit_logs WHERE id = $1',
      [auditId],
    );
    expect(rows[0].action).toBe('memory.view');
  });

  // ── break glass ───────────────────────────────────────────────────────────

  it('refuses a break-glass request somebody approved for themselves', async () => {
    const attempt = ownerPool.query(
      `INSERT INTO break_glass_access (id, admin_id, target_user_id, reason, approved_by, expires_at)
       VALUES (gen_random_uuid(), $1, $2, 'Investigating a reported upload on ticket 4417', $1, now() + interval '4 hours')`,
      [adminId, AARAV],
    );

    // An approval you can grant yourself is a field, not a control.
    await expect(attempt).rejects.toMatchObject({ code: '23514' });
  });

  it('refuses a reason that is not a reason', async () => {
    const attempt = ownerPool.query(
      `INSERT INTO break_glass_access (id, admin_id, target_user_id, reason, approved_by, expires_at)
       VALUES (gen_random_uuid(), $1, $2, 'support', $3, now() + interval '4 hours')`,
      [adminId, AARAV, approverId],
    );

    await expect(attempt).rejects.toMatchObject({ code: '23514' });
  });

  it('records a proper break-glass grant', async () => {
    const { rows } = await ownerPool.query<{ id: string }>(
      `INSERT INTO break_glass_access (id, admin_id, target_user_id, reason, approved_by, expires_at)
       VALUES (gen_random_uuid(), $1, $2, 'Investigating a reported upload on ticket 4417', $3, now() + interval '4 hours')
       RETURNING id`,
      [adminId, AARAV, approverId],
    );
    breakGlassId = rows[0].id;
    expect(breakGlassId).toBeTruthy();
  });

  it('lets the subject read the record of being looked at', async () => {
    const mine = await service.txAs(AARAV, (tx) =>
      tx.execute(sql`SELECT reason, user_notified_at FROM break_glass_access`),
    );
    expect(mine.rows).toHaveLength(1);
    expect(mine.rows[0].user_notified_at).toBeNull();

    // Being told is the point; being able to check afterwards is what makes
    // being told credible. Nobody else sees it.
    const theirs = await service.txAs(BINA, (tx) =>
      tx.execute(sql`SELECT 1 FROM break_glass_access`),
    );
    expect(theirs.rows).toHaveLength(0);
  });

  it('allows the notification to be recorded and nothing else', async () => {
    const notified = await ownerPool.query(
      'UPDATE break_glass_access SET user_notified_at = now() WHERE id = $1 RETURNING user_notified_at',
      [breakGlassId],
    );
    expect(notified.rows[0].user_notified_at).not.toBeNull();

    // The grant itself is immutable. Corrections are new rows.
    const rewritten = ownerPool.query(
      "UPDATE break_glass_access SET reason = 'actually it was fine' WHERE id = $1",
      [breakGlassId],
    );
    await expect(rewritten).rejects.toMatchObject({ code: '42501' });

    const erased = ownerPool.query('DELETE FROM break_glass_access WHERE id = $1', [
      breakGlassId,
    ]);
    await expect(erased).rejects.toMatchObject({ code: '42501' });
  });

  // ── trust and safety ──────────────────────────────────────────────────────

  it('lets a user file a report and follow it', async () => {
    const [filed] = await service.txAs(BINA, (tx) =>
      tx
        .insert(reports)
        .values({
          reporterId: BINA,
          subjectType: 'memory',
          subjectId: '01900000-0000-7000-8000-00000000f001',
          reason: 'graphic_content',
          details: 'This appeared in a shared album.',
        })
        .returning(),
    );
    expect(filed.state).toBe('open');

    const mine = await service.txAs(BINA, (tx) => tx.select().from(reports));
    expect(mine).toHaveLength(1);

    const theirs = await service.txAs(AARAV, (tx) => tx.select().from(reports));
    expect(theirs).toHaveLength(0);
  });

  it('refuses to let a reporter report the same thing twice', async () => {
    const again = service.txAs(BINA, (tx) =>
      tx.insert(reports).values({
        reporterId: BINA,
        subjectType: 'memory',
        subjectId: '01900000-0000-7000-8000-00000000f001',
        reason: 'graphic_content',
      }),
    );

    // Repeat reports are not votes.
    await expect(again).rejects.toThrow();
    expect(pgCode(await again.catch((e: unknown) => e))).toBe('23505');
  });

  it('refuses to let a reporter edit a report after filing it', async () => {
    const edited = await service.txAs(BINA, (tx) =>
      tx.update(reports).set({ reason: 'something_else' }).returning(),
    );

    // Changing a report after it is actioned would rewrite the basis of a
    // decision somebody already took.
    expect(edited).toHaveLength(0);
  });

  it('refuses a report on behalf of somebody else', async () => {
    const attempt = service.txAs(BINA, (tx) =>
      tx.insert(reports).values({
        reporterId: AARAV,
        subjectType: 'user',
        subjectId: AARAV,
        reason: 'framed',
      }),
    );

    await expect(attempt).rejects.toThrow();
    expect(pgCode(await attempt.catch((e: unknown) => e))).toBe('42501');
  });

  it('refuses a moderation flag with a reviewer but no review time', async () => {
    const attempt = ownerPool.query(
      `INSERT INTO moderation_flags (id, subject_type, subject_id, source, severity, sla_due_at, reviewed_by)
       VALUES (gen_random_uuid(), 'memory', $1, 'auto', 'high', now() + interval '4 hours', $2)`,
      ['01900000-0000-7000-8000-00000000f001', adminId],
    );

    await expect(attempt).rejects.toMatchObject({ code: '23514' });
  });

  it('keeps the moderation queue a deadline rather than a backlog', async () => {
    await ownerPool.query(
      `INSERT INTO moderation_flags (id, subject_type, subject_id, source, severity, sla_due_at)
       VALUES (gen_random_uuid(), 'memory', $1, 'auto', 'critical', now() + interval '1 hour')`,
      ['01900000-0000-7000-8000-00000000f001'],
    );

    const { rows } = await ownerPool.query<{ overdue: string }>(
      `SELECT count(*) AS overdue FROM moderation_flags
        WHERE state IN ('open','reviewing') AND sla_due_at < now()`,
    );

    // sla_due_at is NOT NULL, so every flag is answerable to a clock. A flag
    // with no due date is a flag that is never late.
    expect(Number(rows[0].overdue)).toBe(0);
  });

  // ── blocks ────────────────────────────────────────────────────────────────

  it('lets a user block somebody, and hides it from them', async () => {
    await service.txAs(AARAV, (tx) =>
      tx.insert(blocks).values({ blockerId: AARAV, blockedUserId: BINA }),
    );

    const mine = await service.txAs(AARAV, (tx) => tx.select().from(blocks));
    expect(mine).toHaveLength(1);

    // "Who has blocked me" is a question the product never answers.
    const theirs = await service.txAs(BINA, (tx) => tx.select().from(blocks));
    expect(theirs).toHaveLength(0);
  });

  it('refuses a self-block', async () => {
    const attempt = service.txAs(AARAV, (tx) =>
      tx.insert(blocks).values({ blockerId: AARAV, blockedUserId: AARAV }),
    );

    await expect(attempt).rejects.toThrow();
    expect(pgCode(await attempt.catch((e: unknown) => e))).toBe('23514');
  });

  // ── feature flags ─────────────────────────────────────────────────────────

  it('lets the app read flags and never write them', async () => {
    await ownerPool.query(
      `INSERT INTO feature_flags (flag_key, rollout_pct, is_kill_switch)
       VALUES ('semantic_search', 25, false), ('ai_master', 100, true)`,
    );

    const visible = await service.txAs(AARAV, (tx) => tx.select().from(featureFlags));
    expect(visible).toHaveLength(2);

    const attempt = service.txAs(AARAV, (tx) =>
      tx.update(featureFlags).set({ rolloutPct: 100 }).returning(),
    );

    // Changing a flag is an operational act that goes through the console.
    expect(await attempt).toHaveLength(0);
  });

  it('refuses a rollout percentage that is not a percentage', async () => {
    const attempt = ownerPool.query(
      `INSERT INTO feature_flags (flag_key, rollout_pct) VALUES ('bad', 150)`,
    );

    await expect(attempt).rejects.toMatchObject({ code: '23514' });
  });
});
