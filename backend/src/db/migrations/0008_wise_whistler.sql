CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" "citext" NOT NULL,
	"role_id" uuid NOT NULL,
	"totp_secret_enc" text,
	"backup_codes_enc" text,
	"last_login_at" timestamp (3) with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_type" varchar(16) NOT NULL,
	"actor_id" uuid,
	"vault_id" uuid,
	"action" varchar(64) NOT NULL,
	"resource_type" varchar(32) NOT NULL,
	"resource_id" uuid,
	"ip_hash" varchar(64),
	"user_agent" varchar(512),
	"metadata" jsonb,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_audit_actor" CHECK ("actor_type" IN ('user', 'recipient', 'system', 'admin'))
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_user_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_blocks" PRIMARY KEY("blocker_id","blocked_user_id"),
	CONSTRAINT "ck_blocks_not_self" CHECK ("blocks"."blocker_id" <> "blocks"."blocked_user_id")
);
--> statement-breakpoint
ALTER TABLE "blocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "break_glass_access" (
	"id" uuid PRIMARY KEY NOT NULL,
	"admin_id" uuid NOT NULL,
	"target_user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"approved_by" uuid,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"user_notified_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_break_glass_reason" CHECK (length("break_glass_access"."reason") >= 20),
	CONSTRAINT "ck_break_glass_no_self_approval" CHECK ("break_glass_access"."approved_by" <> "break_glass_access"."admin_id")
);
--> statement-breakpoint
ALTER TABLE "break_glass_access" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"flag_key" varchar(64) PRIMARY KEY NOT NULL,
	"description" text,
	"rollout_pct" integer DEFAULT 0 NOT NULL,
	"segment_spec" jsonb,
	"is_kill_switch" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_flags_rollout_range" CHECK ("feature_flags"."rollout_pct" >= 0 AND "feature_flags"."rollout_pct" <= 100)
);
--> statement-breakpoint
ALTER TABLE "feature_flags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "moderation_flags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"report_id" uuid,
	"subject_type" varchar(16) NOT NULL,
	"subject_id" uuid NOT NULL,
	"source" varchar(16) NOT NULL,
	"signal" jsonb,
	"severity" varchar(16) DEFAULT 'low' NOT NULL,
	"sla_due_at" timestamp (3) with time zone NOT NULL,
	"state" varchar(16) DEFAULT 'open' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp (3) with time zone,
	"action_taken" varchar(64),
	"appeal_state" varchar(16) DEFAULT 'none' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_flags_subject" CHECK ("subject_type" IN ('memory', 'media_asset', 'capsule', 'capsule_reply', 'share', 'user')),
	CONSTRAINT "ck_flags_source" CHECK ("source" IN ('auto', 'report')),
	CONSTRAINT "ck_flags_severity" CHECK ("severity" IN ('low', 'medium', 'high', 'critical')),
	CONSTRAINT "ck_flags_state" CHECK ("state" IN ('open', 'reviewing', 'actioned', 'dismissed')),
	CONSTRAINT "ck_flags_appeal" CHECK ("appeal_state" IN ('none', 'requested', 'upheld', 'overturned')),
	CONSTRAINT "ck_flags_reviewer_paired" CHECK (("moderation_flags"."reviewed_by" IS NULL) = ("moderation_flags"."reviewed_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "moderation_flags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "permissions" (
	"role_id" uuid NOT NULL,
	"module" varchar(16) NOT NULL,
	"action" varchar(16) NOT NULL,
	CONSTRAINT "pk_permissions" PRIMARY KEY("role_id","module","action"),
	CONSTRAINT "ck_permissions_module" CHECK ("module" IN ('users', 'vaults', 'content', 'capsules', 'moderation', 'billing', 'support', 'flags', 'audit')),
	CONSTRAINT "ck_permissions_action" CHECK ("action" IN ('read', 'read_content', 'write', 'delete', 'export'))
);
--> statement-breakpoint
ALTER TABLE "permissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reporter_id" uuid NOT NULL,
	"subject_type" varchar(16) NOT NULL,
	"subject_id" uuid NOT NULL,
	"reason" varchar(64) NOT NULL,
	"details" text,
	"state" varchar(16) DEFAULT 'open' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_reports_subject" CHECK ("subject_type" IN ('memory', 'media_asset', 'capsule', 'capsule_reply', 'share', 'user')),
	CONSTRAINT "ck_reports_state" CHECK ("state" IN ('open', 'reviewing', 'actioned', 'dismissed'))
);
--> statement-breakpoint
ALTER TABLE "reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"description" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_user_id_users_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_glass_access" ADD CONSTRAINT "break_glass_access_admin_id_admin_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_glass_access" ADD CONSTRAINT "break_glass_access_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_glass_access" ADD CONSTRAINT "break_glass_access_approved_by_admin_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_flags" ADD CONSTRAINT "moderation_flags_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_flags" ADD CONSTRAINT "moderation_flags_reviewed_by_admin_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_admin_users_email" ON "admin_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "ix_admin_users_role" ON "admin_users" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "ix_audit_vault_time" ON "audit_logs" USING btree ("vault_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ix_audit_actor_time" ON "audit_logs" USING btree ("actor_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ix_audit_resource" ON "audit_logs" USING btree ("resource_type","resource_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_audit_retention" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ix_blocks_blocked" ON "blocks" USING btree ("blocked_user_id");--> statement-breakpoint
CREATE INDEX "ix_break_glass_target" ON "break_glass_access" USING btree ("target_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ix_break_glass_admin" ON "break_glass_access" USING btree ("admin_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ix_break_glass_unnotified" ON "break_glass_access" USING btree ("created_at") WHERE "break_glass_access"."user_notified_at" IS NULL;--> statement-breakpoint
CREATE INDEX "ix_flags_queue" ON "moderation_flags" USING btree ("sla_due_at") WHERE "moderation_flags"."state" IN ('open', 'reviewing');--> statement-breakpoint
CREATE INDEX "ix_flags_subject" ON "moderation_flags" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "ix_flags_severity" ON "moderation_flags" USING btree ("severity","sla_due_at");--> statement-breakpoint
CREATE INDEX "ix_flags_appeals" ON "moderation_flags" USING btree ("appeal_state") WHERE "moderation_flags"."appeal_state" = 'requested';--> statement-breakpoint
CREATE INDEX "ix_reports_subject" ON "reports" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "ix_reports_reporter" ON "reports" USING btree ("reporter_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ix_reports_open" ON "reports" USING btree ("created_at") WHERE "reports"."state" = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX "ux_reports_once" ON "reports" USING btree ("reporter_id","subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_roles_name" ON "roles" USING btree ("name");
--> statement-breakpoint

-- ─── Conventions ────────────────────────────────────────────────────────────

CREATE TRIGGER trg_roles_updated_at
  BEFORE UPDATE ON "roles"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_admin_users_updated_at
  BEFORE UPDATE ON "admin_users"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON "reports"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_moderation_flags_updated_at
  BEFORE UPDATE ON "moderation_flags"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_feature_flags_updated_at
  BEFORE UPDATE ON "feature_flags"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- ─── Append-only, for everybody ─────────────────────────────────────────────
--
-- The absence of an UPDATE policy stops `mm_app`. It does not stop the table
-- owner, a migration, or anybody with a psql prompt — and an audit trail that
-- privileged code can quietly rewrite is not an audit trail.
--
-- This trigger refuses UPDATE and DELETE on audit_logs regardless of who is
-- asking. Retention is handled by the purge job, which is the one legitimate
-- deletion and is performed by dropping old rows under a maintenance path that
-- disables this trigger explicitly and visibly.
CREATE OR REPLACE FUNCTION audit_append_only() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (attempted %)', TG_OP
    USING ERRCODE = '42501';
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_audit_append_only
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW
  EXECUTE FUNCTION audit_append_only();
--> statement-breakpoint

-- The same for break-glass records. A grant of access to somebody's private
-- archive must not be editable after the fact; corrections are new rows, and
-- `user_notified_at` is the one field that legitimately fills in later.
CREATE OR REPLACE FUNCTION break_glass_immutable() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'break_glass_access rows are permanent'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.admin_id       IS DISTINCT FROM OLD.admin_id
  OR NEW.target_user_id IS DISTINCT FROM OLD.target_user_id
  OR NEW.reason         IS DISTINCT FROM OLD.reason
  OR NEW.approved_by    IS DISTINCT FROM OLD.approved_by
  OR NEW.expires_at     IS DISTINCT FROM OLD.expires_at
  OR NEW.created_at     IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'break_glass_access is immutable except for user_notified_at'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_break_glass_immutable
  BEFORE UPDATE OR DELETE ON "break_glass_access"
  FOR EACH ROW
  EXECUTE FUNCTION break_glass_immutable();
--> statement-breakpoint

-- ─── Policies ───────────────────────────────────────────────────────────────
--
-- Most of this domain has RLS enabled and NO policy at all, which denies it to
-- `mm_app` entirely: roles, permissions, admin_users, moderation_flags. The
-- admin console connects as its own role, which is a later step.
--
-- Four things are genuinely user-facing, and only those get policies.

-- A user reads their own access log. This is a product feature in privacy
-- settings, not an internal log — "who opened my archive, and when" is what
-- makes the rest of the privacy claims checkable rather than promised.
CREATE POLICY audit_read_own ON audit_logs FOR SELECT
  USING (
    actor_id = app_current_user()
    OR (vault_id IS NOT NULL AND app_vault_role(vault_id) IS NOT NULL)
  );
--> statement-breakpoint

-- The API writes its own trail, and may only write rows that say what is true:
-- actor_type 'user', acting as itself. It cannot forge an 'admin' or 'system'
-- entry. Recipient and system rows are written by SECURITY DEFINER functions
-- and by the workers, under roles of their own.
CREATE POLICY audit_write_own ON audit_logs FOR INSERT
  WITH CHECK (actor_type = 'user' AND actor_id = app_current_user());
--> statement-breakpoint

-- The subject of a break-glass access may read the record of it. Being told is
-- the point; being able to check afterwards is what makes being told credible.
CREATE POLICY break_glass_read_subject ON break_glass_access FOR SELECT
  USING (target_user_id = app_current_user());
--> statement-breakpoint

CREATE POLICY reports_insert ON reports FOR INSERT
  WITH CHECK (reporter_id = app_current_user());
--> statement-breakpoint

-- A reporter may follow their own report. They may not edit it afterwards:
-- changing a report after it has been actioned would rewrite the basis of a
-- decision somebody already took.
CREATE POLICY reports_read_own ON reports FOR SELECT
  USING (reporter_id = app_current_user());
--> statement-breakpoint

CREATE POLICY blocks_own ON blocks FOR ALL
  USING (blocker_id = app_current_user())
  WITH CHECK (blocker_id = app_current_user());
--> statement-breakpoint

-- Flags are readable by everyone and writable by nobody through the API. The
-- app evaluates them on every request; changing one is an operational act that
-- goes through the console.
CREATE POLICY feature_flags_read ON feature_flags FOR SELECT
  USING (true);
