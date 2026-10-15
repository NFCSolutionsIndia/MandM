CREATE TABLE "capsule_memories" (
	"capsule_id" uuid NOT NULL,
	"memory_id" uuid NOT NULL,
	CONSTRAINT "pk_capsule_memories" PRIMARY KEY("capsule_id","memory_id")
);
--> statement-breakpoint
ALTER TABLE "capsule_memories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "capsule_recipients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"capsule_id" uuid NOT NULL,
	"vault_id" uuid NOT NULL,
	"member_id" uuid,
	"name" varchar(200) NOT NULL,
	"email" "citext",
	"phone" varchar(32),
	"preferred_channel" varchar(16) DEFAULT 'email' NOT NULL,
	"access_token_hash" varchar(64) NOT NULL,
	"token_version" integer DEFAULT 1 NOT NULL,
	"delivered_at" timestamp (3) with time zone,
	"opened_at" timestamp (3) with time zone,
	"last_verified_at" timestamp (3) with time zone,
	"guardian_contact" jsonb,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_recipient_channel" CHECK ("preferred_channel" IN ('push', 'email', 'sms', 'whatsapp')),
	CONSTRAINT "ck_recipient_contactable" CHECK ("capsule_recipients"."email" IS NOT NULL OR "capsule_recipients"."phone" IS NOT NULL OR "capsule_recipients"."member_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "capsule_recipients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "capsule_replies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"capsule_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"body" text,
	"media_asset_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_replies_not_empty" CHECK ("capsule_replies"."body" IS NOT NULL OR "capsule_replies"."media_asset_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "capsule_replies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "capsules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vault_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" varchar(300),
	"sender_note" text,
	"state" varchar(16) DEFAULT 'draft' NOT NULL,
	"unlock_kind" varchar(16) DEFAULT 'datetime' NOT NULL,
	"unlock_at" timestamp (3) with time zone,
	"unlock_timezone" varchar(64),
	"milestone_member_id" uuid,
	"milestone_spec" jsonb,
	"sealed_at" timestamp (3) with time zone,
	"editable_until" timestamp (3) with time zone,
	"delivered_at" timestamp (3) with time zone,
	"first_opened_at" timestamp (3) with time zone,
	"cancelled_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_capsules_state" CHECK ("state" IN ('draft', 'sealed', 'delivering', 'delivered', 'opened', 'cancelled', 'failed')),
	CONSTRAINT "ck_capsules_unlock_kind" CHECK ("unlock_kind" IN ('datetime', 'milestone', 'manual')),
	CONSTRAINT "ck_capsules_datetime_has_time" CHECK ("capsules"."unlock_kind" <> 'datetime' OR "capsules"."unlock_at" IS NOT NULL),
	CONSTRAINT "ck_capsules_milestone_has_member" CHECK ("capsules"."unlock_kind" <> 'milestone' OR "capsules"."milestone_member_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "capsules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "delivery_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"capsule_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"channel" varchar(16) NOT NULL,
	"attempt_no" integer NOT NULL,
	"provider" varchar(32) NOT NULL,
	"provider_message_id" varchar(255),
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"error_code" varchar(64),
	"attempted_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"next_retry_at" timestamp (3) with time zone,
	CONSTRAINT "ck_attempt_channel" CHECK ("channel" IN ('push', 'email', 'sms', 'whatsapp')),
	CONSTRAINT "ck_attempt_status" CHECK ("status" IN ('queued', 'sent', 'delivered', 'bounced', 'failed', 'acknowledged')),
	CONSTRAINT "ck_attempt_no" CHECK ("delivery_attempts"."attempt_no" >= 1)
);
--> statement-breakpoint
ALTER TABLE "delivery_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scheduled_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" varchar(16) NOT NULL,
	"run_at" timestamp (3) with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"state" varchar(16) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_by" varchar(64),
	"locked_until" timestamp (3) with time zone,
	"last_error" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp (3) with time zone,
	CONSTRAINT "ck_jobs_state" CHECK ("state" IN ('pending', 'claimed', 'running', 'completed', 'failed', 'dead')),
	CONSTRAINT "ck_jobs_kind" CHECK ("kind" IN ('capsule_delivery', 'on_this_day', 'recap', 'reassurance', 'contact_refresh', 'retention_purge', 'integrity_sweep', 'export_assembly', 'search_index'))
);
--> statement-breakpoint
ALTER TABLE "scheduled_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "capsule_memories" ADD CONSTRAINT "capsule_memories_capsule_id_capsules_id_fk" FOREIGN KEY ("capsule_id") REFERENCES "public"."capsules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capsule_memories" ADD CONSTRAINT "capsule_memories_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capsule_recipients" ADD CONSTRAINT "capsule_recipients_capsule_id_capsules_id_fk" FOREIGN KEY ("capsule_id") REFERENCES "public"."capsules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capsule_recipients" ADD CONSTRAINT "capsule_recipients_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capsule_recipients" ADD CONSTRAINT "capsule_recipients_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capsule_replies" ADD CONSTRAINT "capsule_replies_capsule_id_capsules_id_fk" FOREIGN KEY ("capsule_id") REFERENCES "public"."capsules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capsule_replies" ADD CONSTRAINT "capsule_replies_recipient_id_capsule_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."capsule_recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capsule_replies" ADD CONSTRAINT "capsule_replies_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capsules" ADD CONSTRAINT "capsules_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capsules" ADD CONSTRAINT "capsules_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capsules" ADD CONSTRAINT "capsules_milestone_member_id_members_id_fk" FOREIGN KEY ("milestone_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_capsule_id_capsules_id_fk" FOREIGN KEY ("capsule_id") REFERENCES "public"."capsules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_recipient_id_capsule_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."capsule_recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_capsule_memories_memory" ON "capsule_memories" USING btree ("memory_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_recipient_token" ON "capsule_recipients" USING btree ("access_token_hash");--> statement-breakpoint
CREATE INDEX "ix_recipient_capsule" ON "capsule_recipients" USING btree ("capsule_id");--> statement-breakpoint
CREATE INDEX "ix_recipient_member" ON "capsule_recipients" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "ix_recipient_verified" ON "capsule_recipients" USING btree ("last_verified_at");--> statement-breakpoint
CREATE INDEX "ix_replies_capsule" ON "capsule_replies" USING btree ("capsule_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_replies_recipient" ON "capsule_replies" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "ix_capsules_scheduler" ON "capsules" USING btree ("state","unlock_at");--> statement-breakpoint
CREATE INDEX "ix_capsules_vault" ON "capsules" USING btree ("vault_id","state");--> statement-breakpoint
CREATE INDEX "ix_capsules_owner_pending" ON "capsules" USING btree ("owner_id","state","delivered_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_attempt_idempotent" ON "delivery_attempts" USING btree ("capsule_id","recipient_id","channel","attempt_no");--> statement-breakpoint
CREATE INDEX "ix_attempt_recipient" ON "delivery_attempts" USING btree ("recipient_id","attempted_at");--> statement-breakpoint
CREATE INDEX "ix_attempt_retry" ON "delivery_attempts" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "ix_attempt_provider_msg" ON "delivery_attempts" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "ix_jobs_claim" ON "scheduled_jobs" USING btree ("run_at") WHERE "scheduled_jobs"."state" = 'pending';--> statement-breakpoint
CREATE INDEX "ix_jobs_reaper" ON "scheduled_jobs" USING btree ("state","locked_until");--> statement-breakpoint
CREATE INDEX "ix_jobs_kind" ON "scheduled_jobs" USING btree ("kind","state","run_at");
--> statement-breakpoint

-- ─── Conventions ────────────────────────────────────────────────────────────
--
-- Hand-written, appended to the generated migration: the freeze triggers, the
-- unauthenticated unlock path, and the policies.

CREATE TRIGGER trg_capsules_updated_at
  BEFORE UPDATE ON "capsules"
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

CREATE TRIGGER trg_capsule_recipients_updated_at
  BEFORE UPDATE ON "capsule_recipients"
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- ─── Sealed means sealed ────────────────────────────────────────────────────
--
-- The design notes say this rule is enforced in the application. It is enforced
-- here instead, because "the application remembers" is exactly the kind of
-- guarantee that survives until the second code path is written.
--
-- A sealed capsule's MESSAGE and SCHEDULE are frozen; its delivery bookkeeping
-- is not. So the trigger compares the specific columns that constitute the
-- promise and ignores state, delivered_at, first_opened_at and the rest.
--
-- `editable_until` is honoured: a sender gets a grace window after sealing in
-- which they may still change their mind. After it passes, nothing can edit the
-- promise — not the owner, not an admin, not a stray UPDATE in psql.
CREATE OR REPLACE FUNCTION capsule_freeze() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.state = 'draft' THEN
    RETURN NEW;
  END IF;

  IF OLD.editable_until IS NOT NULL AND now() <= OLD.editable_until THEN
    RETURN NEW;
  END IF;

  IF NEW.title           IS DISTINCT FROM OLD.title
  OR NEW.sender_note     IS DISTINCT FROM OLD.sender_note
  OR NEW.unlock_kind     IS DISTINCT FROM OLD.unlock_kind
  OR NEW.unlock_at       IS DISTINCT FROM OLD.unlock_at
  OR NEW.unlock_timezone IS DISTINCT FROM OLD.unlock_timezone
  OR NEW.vault_id        IS DISTINCT FROM OLD.vault_id
  OR NEW.owner_id        IS DISTINCT FROM OLD.owner_id
  THEN
    RAISE EXCEPTION
      'capsule % is sealed: its message and schedule are frozen', OLD.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_capsules_freeze
  BEFORE UPDATE ON "capsules"
  FOR EACH ROW
  EXECUTE FUNCTION capsule_freeze();
--> statement-breakpoint

-- The same promise, applied to what the capsule carries. Adding or removing a
-- memory after sealing changes the message as surely as editing the note does.
CREATE OR REPLACE FUNCTION capsule_contents_freeze() RETURNS trigger
  LANGUAGE plpgsql
AS $$
DECLARE
  v_capsule uuid;
  v_state   text;
  v_until   timestamptz;
BEGIN
  v_capsule := COALESCE(NEW.capsule_id, OLD.capsule_id);

  SELECT c.state, c.editable_until INTO v_state, v_until
  FROM capsules c WHERE c.id = v_capsule;

  IF v_state IS NULL OR v_state = 'draft' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_until IS NOT NULL AND now() <= v_until THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  RAISE EXCEPTION
    'capsule % is sealed: its contents are frozen', v_capsule
    USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_capsule_memories_freeze
  BEFORE INSERT OR DELETE ON "capsule_memories"
  FOR EACH ROW
  EXECUTE FUNCTION capsule_contents_freeze();
--> statement-breakpoint

-- ─── The recipient with no account ──────────────────────────────────────────
--
-- A capsule is opened by somebody who may never sign up, so the unlock path has
-- no actor and cannot be governed by a policy. It gets two narrow
-- SECURITY DEFINER functions instead, each doing exactly one thing.
--
-- Both take the HASH of the token. The raw token lives only in the link that
-- was emailed; the caller hashes it before asking.

-- Resolve a token to the capsule it opens. Returns nothing for a capsule that
-- is not yet delivered, so possessing a link early is worth nothing.
CREATE OR REPLACE FUNCTION app_resolve_recipient(p_token_hash varchar)
  RETURNS TABLE (recipient_id uuid, capsule_id uuid, capsule_state text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT r.id, r.capsule_id, c.state
  FROM capsule_recipients r
  JOIN capsules c ON c.id = r.capsule_id
  WHERE r.access_token_hash = p_token_hash
    AND c.state IN ('delivered', 'opened')
$$;
--> statement-breakpoint

-- Post a reply. Writes the row and marks the capsule opened, in one statement,
-- so a reply cannot exist against a capsule nobody is recorded as having read.
--
-- It returns the new reply's id, and nothing else: a caller holding a token
-- learns whether their reply was accepted and cannot use this to read anything.
CREATE OR REPLACE FUNCTION app_post_reply(
  p_token_hash varchar,
  p_body       text,
  p_media      uuid DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_recipient uuid;
  v_capsule   uuid;
  v_reply     uuid;
BEGIN
  SELECT r.id, r.capsule_id INTO v_recipient, v_capsule
  FROM capsule_recipients r
  JOIN capsules c ON c.id = r.capsule_id
  WHERE r.access_token_hash = p_token_hash
    AND c.state IN ('delivered', 'opened');

  IF v_recipient IS NULL THEN
    RAISE EXCEPTION 'no deliverable capsule for that token'
      USING ERRCODE = '42501';
  END IF;

  IF p_body IS NULL AND p_media IS NULL THEN
    RAISE EXCEPTION 'a reply needs a body or an attachment'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO capsule_replies (id, capsule_id, recipient_id, body, media_asset_id)
  VALUES (gen_random_uuid(), v_capsule, v_recipient, p_body, p_media)
  RETURNING id INTO v_reply;

  UPDATE capsule_recipients
     SET opened_at = COALESCE(opened_at, now())
   WHERE id = v_recipient;

  UPDATE capsules
     SET first_opened_at = COALESCE(first_opened_at, now()),
         state           = 'opened'
   WHERE id = v_capsule AND state = 'delivered';

  RETURN v_reply;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_capsule_vault(p_capsule uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT c.vault_id FROM capsules c WHERE c.id = p_capsule
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_owns_capsule(p_capsule uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM capsules c
    WHERE c.id = p_capsule AND c.owner_id = app_current_user()
  )
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_resolve_recipient(varchar) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_post_reply(varchar, text, uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_capsule_vault(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_owns_capsule(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_resolve_recipient(varchar) TO mm_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_post_reply(varchar, text, uuid) TO mm_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_capsule_vault(uuid) TO mm_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_owns_capsule(uuid) TO mm_app;
--> statement-breakpoint

-- ─── Policies ───────────────────────────────────────────────────────────────

CREATE POLICY capsules_read ON capsules FOR SELECT
  USING (app_vault_role(vault_id) IS NOT NULL);
--> statement-breakpoint

CREATE POLICY capsules_insert ON capsules FOR INSERT
  WITH CHECK (
    owner_id = app_current_user()
    AND app_vault_role(vault_id) IN ('contributor', 'admin', 'owner')
  );
--> statement-breakpoint

-- Only the capsule's own owner may seal or cancel — not a vault admin. A
-- promise belongs to the person who made it, and nobody else gets to revoke it.
CREATE POLICY capsules_update ON capsules FOR UPDATE
  USING (owner_id = app_current_user())
  WITH CHECK (owner_id = app_current_user());
--> statement-breakpoint

-- No DELETE policy. A capsule is cancelled, never erased: the record that a
-- promise was made and withdrawn is part of what was promised.

CREATE POLICY capsule_memories_read ON capsule_memories FOR SELECT
  USING (app_vault_role(app_capsule_vault(capsule_id)) IS NOT NULL);
--> statement-breakpoint

CREATE POLICY capsule_memories_write ON capsule_memories FOR ALL
  USING (app_owns_capsule(capsule_id))
  WITH CHECK (
    app_owns_capsule(capsule_id)
    AND app_vault_role(app_memory_vault(memory_id)) IS NOT NULL
  );
--> statement-breakpoint

CREATE POLICY capsule_recipients_read ON capsule_recipients FOR SELECT
  USING (app_vault_role(vault_id) IS NOT NULL);
--> statement-breakpoint

CREATE POLICY capsule_recipients_write ON capsule_recipients FOR ALL
  USING (app_owns_capsule(capsule_id))
  WITH CHECK (app_owns_capsule(capsule_id));
--> statement-breakpoint

-- Read-only to the API. Attempts are written by the delivery worker under its
-- own role; a request handler may show delivery status and may not invent it.
CREATE POLICY delivery_attempts_read ON delivery_attempts FOR SELECT
  USING (app_owns_capsule(capsule_id));
--> statement-breakpoint

-- The sender reads replies. Writing goes through app_post_reply(), because the
-- person writing has no account and therefore no actor to check.
CREATE POLICY capsule_replies_read ON capsule_replies FOR SELECT
  USING (app_vault_role(app_capsule_vault(capsule_id)) IS NOT NULL);
--> statement-breakpoint

-- ─── The job table ──────────────────────────────────────────────────────────
--
-- RLS is enabled and there is exactly one policy: the API may insert a delivery
-- job, which is what makes "seal the capsule and schedule its delivery in one
-- transaction" possible.
--
-- It may not read, update or delete. The worker that claims jobs runs under its
-- own role, so a compromised request handler cannot cancel a pending delivery,
-- cannot enumerate who is expecting a capsule, and cannot move a run_at.
CREATE POLICY jobs_insert_delivery ON scheduled_jobs FOR INSERT
  WITH CHECK (kind = 'capsule_delivery' AND state = 'pending');
