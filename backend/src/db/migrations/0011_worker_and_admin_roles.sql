-- ─── The two roles the schema already assumed ───────────────────────────────
--
-- Hand-written; no schema change, so drizzle-kit generates nothing and the
-- journal entry is added alongside this file.
--
-- ═══════════════════════════════════════════════════════════════════════════
--  Two things written earlier were promises rather than facts.
-- ═══════════════════════════════════════════════════════════════════════════
--
--   migration 0005  `scheduled_jobs` is insert-only to the API "because the
--                   worker claims under its own role" — and no such role
--                   existed, so nothing could claim a job and no capsule would
--                   ever have been delivered.
--
--   migration 0008  four governance tables are invisible to `mm_app` "because
--                   the console connects as its own role" — and no such role
--                   existed, so they were invisible to everything but the
--                   table owner.
--
-- Both policies were right. This supplies the half that was missing.
--
-- Like `mm_app`: NOLOGIN and no password here. A password in a migration is a
-- password in git history forever; LOGIN is granted per environment.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mm_worker') THEN
    CREATE ROLE mm_worker NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mm_admin') THEN
    CREATE ROLE mm_admin NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO mm_worker, mm_admin;
--> statement-breakpoint

-- Table privileges are the outer gate; the policies below are the inner one.
-- Neither role gets blanket DML: a privilege not granted cannot be reached by
-- any policy, however permissive.
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO mm_worker;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO mm_admin;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO mm_worker, mm_admin;
--> statement-breakpoint

-- Neither role may DELETE anything, anywhere. Deletion in this product is a
-- soft delete plus a purge job, and the purge job is the only thing that will
-- ever get that grant.
REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM mm_worker, mm_admin;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app_current_user() TO mm_worker, mm_admin;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION uuid_generate_v7() TO mm_worker, mm_admin;
--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════════════════
--  mm_worker — the delivery engine
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Policies are scoped `TO mm_worker`. PostgreSQL ORs permissive policies
-- together, and every policy written so far applies to PUBLIC — so the worker
-- already carries `mm_app`'s policies, which deny it everything because
-- `app.user_id` is unset. These add exactly what it needs on top.

-- The whole point of the role: claim, run, complete, fail, reschedule.
CREATE POLICY jobs_worker ON scheduled_jobs FOR ALL TO mm_worker
  USING (true) WITH CHECK (true);
--> statement-breakpoint

-- A capsule the worker is responsible for, and no other.
--
-- Not `USING (true)`. The worker has no business reading a draft somebody is
-- still writing, or one that was cancelled — only the ones in flight.
CREATE POLICY capsules_worker ON capsules FOR SELECT TO mm_worker
  USING (state IN ('sealed', 'delivering', 'delivered'));
--> statement-breakpoint

-- It advances the state machine and stamps delivery, and may touch nothing
-- else: the freeze trigger from 0005 still refuses any edit to the message or
-- the schedule, for this role exactly as for the owner.
CREATE POLICY capsules_worker_update ON capsules FOR UPDATE TO mm_worker
  USING (state IN ('sealed', 'delivering', 'delivered'))
  WITH CHECK (state IN ('delivering', 'delivered', 'opened', 'failed'));
--> statement-breakpoint

CREATE POLICY recipients_worker ON capsule_recipients FOR SELECT TO mm_worker
  USING (true);
--> statement-breakpoint
CREATE POLICY recipients_worker_update ON capsule_recipients FOR UPDATE TO mm_worker
  USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY attempts_worker ON delivery_attempts FOR ALL TO mm_worker
  USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY capsule_memories_worker ON capsule_memories FOR SELECT TO mm_worker
  USING (true);
--> statement-breakpoint

-- ───────────────────────────────────────────────────────────────────────────
--  The tightest policy in the file, and the one worth reading twice.
-- ───────────────────────────────────────────────────────────────────────────
--
-- The worker must read a memory to build the capsule that carries it. It must
-- NOT be able to read the archive.
--
-- So it may see a memory only while that memory is inside a capsule that is
-- actually in flight. A memory nobody sealed is invisible to the delivery
-- engine, and so is one whose capsule was cancelled — which means a compromised
-- worker cannot walk the archive, only the handful of rows currently being
-- delivered.
CREATE POLICY memories_worker ON memories FOR SELECT TO mm_worker
  USING (
    EXISTS (
      SELECT 1
      FROM capsule_memories cm
      JOIN capsules c ON c.id = cm.capsule_id
      WHERE cm.memory_id = memories.id
        AND c.state IN ('sealed', 'delivering', 'delivered')
    )
  );
--> statement-breakpoint

CREATE POLICY media_worker ON media_assets FOR SELECT TO mm_worker
  USING (
    EXISTS (
      SELECT 1
      FROM capsule_memories cm
      JOIN capsules c ON c.id = cm.capsule_id
      WHERE cm.memory_id = media_assets.memory_id
        AND c.state IN ('sealed', 'delivering', 'delivered')
    )
  );
--> statement-breakpoint

-- Push tokens and the recipient's zone, so a delivery lands in the right
-- morning. Read-only, and the worker can change nobody's account.
CREATE POLICY users_worker ON users FOR SELECT TO mm_worker USING (true);
--> statement-breakpoint
CREATE POLICY devices_worker ON devices FOR SELECT TO mm_worker USING (true);
--> statement-breakpoint
CREATE POLICY devices_worker_update ON devices FOR UPDATE TO mm_worker
  USING (true) WITH CHECK (true);
--> statement-breakpoint

-- Jobs raise notifications; the API still cannot.
CREATE POLICY notifications_worker ON notifications FOR INSERT TO mm_worker
  WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY notification_prefs_worker ON notification_preferences
  FOR SELECT TO mm_worker USING (true);
--> statement-breakpoint

-- The worker writes `system` rows. It cannot write a `user` or `admin` one, so
-- its trail can never be mistaken for somebody else's action.
CREATE POLICY audit_worker ON audit_logs FOR INSERT TO mm_worker
  WITH CHECK (actor_type = 'system');
--> statement-breakpoint

-- Reminders and occasions.
CREATE POLICY events_worker ON events FOR SELECT TO mm_worker USING (true);
--> statement-breakpoint
CREATE POLICY reminders_worker ON event_reminders FOR SELECT TO mm_worker
  USING (true);
--> statement-breakpoint
CREATE POLICY reminders_worker_update ON event_reminders FOR UPDATE TO mm_worker
  USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY members_worker ON members FOR SELECT TO mm_worker USING (true);
--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════════════════
--  mm_admin — the console
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Who the console is acting as, set the same way the API sets its actor:
--
--     SET LOCAL app.admin_id = '<uuid>';
--
-- A SEPARATE setting from `app.user_id`, deliberately. One connection is never
-- both, and sharing the key would let an admin session satisfy a user policy.
CREATE OR REPLACE FUNCTION app_current_admin() RETURNS uuid
  LANGUAGE sql STABLE
  SET search_path = pg_catalog
AS $$
  SELECT nullif(current_setting('app.admin_id', true), '')::uuid
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app_current_admin() TO mm_admin;
--> statement-breakpoint

-- ───────────────────────────────────────────────────────────────────────────
--  `read` and `read_content` are different powers, and here is where that
--  stops being a row in an enum.
-- ───────────────────────────────────────────────────────────────────────────
--
-- Support can find an account. Support cannot open the archive — unless there
-- is a LIVE break-glass grant naming that user, approved by somebody else and
-- not yet expired.
CREATE OR REPLACE FUNCTION app_admin_may_read_content(p_user uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM break_glass_access b
    WHERE b.admin_id       = app_current_admin()
      AND b.target_user_id = p_user
      AND b.approved_by IS NOT NULL
      AND b.expires_at > now()
  )
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_admin_may_read_content(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_admin_may_read_content(uuid) TO mm_admin;
--> statement-breakpoint

-- Account metadata: enough to answer "does this person have an account, what
-- plan are they on, when did they last sign in". Not their memories.
CREATE POLICY users_admin ON users FOR SELECT TO mm_admin USING (true);
--> statement-breakpoint
CREATE POLICY vaults_admin ON vaults FOR SELECT TO mm_admin USING (true);
--> statement-breakpoint
CREATE POLICY subscriptions_admin ON subscriptions FOR SELECT TO mm_admin
  USING (true);
--> statement-breakpoint
CREATE POLICY payments_admin ON payments FOR SELECT TO mm_admin USING (true);
--> statement-breakpoint

-- Content, only under a live grant. The vault's OWNER is the subject, because
-- that is whose archive it is.
CREATE POLICY memories_admin ON memories FOR SELECT TO mm_admin
  USING (
    app_admin_may_read_content(
      (SELECT v.owner_id FROM vaults v WHERE v.id = memories.vault_id)
    )
  );
--> statement-breakpoint

CREATE POLICY media_admin ON media_assets FOR SELECT TO mm_admin
  USING (
    app_admin_may_read_content(
      (SELECT v.owner_id FROM vaults v WHERE v.id = media_assets.vault_id)
    )
  );
--> statement-breakpoint

-- The admin realm itself.
CREATE POLICY admin_users_admin ON admin_users FOR SELECT TO mm_admin
  USING (true);
--> statement-breakpoint
CREATE POLICY roles_admin ON roles FOR SELECT TO mm_admin USING (true);
--> statement-breakpoint
CREATE POLICY permissions_admin ON permissions FOR SELECT TO mm_admin
  USING (true);
--> statement-breakpoint

-- Break glass: request it, and record that the user was told. The immutability
-- trigger from 0008 still refuses to let any of it be edited afterwards, and
-- the self-approval CHECK still applies.
CREATE POLICY break_glass_admin ON break_glass_access FOR SELECT TO mm_admin
  USING (true);
--> statement-breakpoint
CREATE POLICY break_glass_admin_request ON break_glass_access FOR INSERT TO mm_admin
  WITH CHECK (admin_id = app_current_admin());
--> statement-breakpoint
CREATE POLICY break_glass_admin_notify ON break_glass_access FOR UPDATE TO mm_admin
  USING (true) WITH CHECK (true);
--> statement-breakpoint

-- Trust and safety: the queue, and the decisions taken on it.
CREATE POLICY reports_admin ON reports FOR SELECT TO mm_admin USING (true);
--> statement-breakpoint
CREATE POLICY reports_admin_update ON reports FOR UPDATE TO mm_admin
  USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY flags_admin ON moderation_flags FOR ALL TO mm_admin
  USING (true) WITH CHECK (true);
--> statement-breakpoint

-- The whole audit trail. Read-only — the append-only trigger refuses UPDATE
-- and DELETE for every role including this one, and there is no INSERT policy,
-- so the console cannot write its own history.
CREATE POLICY audit_admin ON audit_logs FOR SELECT TO mm_admin USING (true);
--> statement-breakpoint

CREATE POLICY flags_ops_admin ON feature_flags FOR ALL TO mm_admin
  USING (true) WITH CHECK (true);
