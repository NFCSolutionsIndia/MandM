CREATE TABLE "notification_preferences" (
	"user_id" uuid NOT NULL,
	"type" varchar(17) NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"sms_enabled" boolean DEFAULT false NOT NULL,
	"quiet_hours_start" time,
	"quiet_hours_end" time,
	"suppressible" boolean GENERATED ALWAYS AS ("type" NOT IN ('capsule_failed', 'security_alert', 'billing')) STORED NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_notification_preferences" PRIMARY KEY("user_id","type"),
	CONSTRAINT "ck_prefs_type" CHECK ("type" IN ('capsule_delivered', 'capsule_opened', 'capsule_reply', 'occasion_reminder', 'on_this_day', 'memory_added', 'vault_invite', 'storage_warning', 'capsule_failed', 'security_alert', 'billing')),
	CONSTRAINT "ck_prefs_non_suppressible_stay_on" CHECK ("notification_preferences"."suppressible" OR ("notification_preferences"."push_enabled" AND "notification_preferences"."email_enabled")),
	CONSTRAINT "ck_prefs_quiet_hours_paired" CHECK (("notification_preferences"."quiet_hours_start" IS NULL) = ("notification_preferences"."quiet_hours_end" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(17) NOT NULL,
	"payload" jsonb,
	"deep_link" varchar(512),
	"read_at" timestamp (3) with time zone,
	"channels_sent" jsonb,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_notifications_type" CHECK ("type" IN ('capsule_delivered', 'capsule_opened', 'capsule_reply', 'occasion_reminder', 'on_this_day', 'memory_added', 'vault_invite', 'storage_warning', 'capsule_failed', 'security_alert', 'billing'))
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shares" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vault_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"resource_type" varchar(16) NOT NULL,
	"resource_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"permission" varchar(16) DEFAULT 'view' NOT NULL,
	"allow_download" boolean DEFAULT false NOT NULL,
	"password_hash" varchar(255),
	"expires_at" timestamp (3) with time zone,
	"revoked_at" timestamp (3) with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_shares_resource" CHECK ("resource_type" IN ('memory', 'album')),
	CONSTRAINT "ck_shares_permission" CHECK ("permission" IN ('view', 'comment', 'contribute')),
	CONSTRAINT "ck_shares_view_count" CHECK ("shares"."view_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_notifications_user" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ix_notifications_unread" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_shares_token" ON "shares" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "ix_shares_resource" ON "shares" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "ix_shares_owner_active" ON "shares" USING btree ("owner_id","expires_at") WHERE "shares"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "ix_shares_vault" ON "shares" USING btree ("vault_id");
--> statement-breakpoint

-- ─── Conventions ────────────────────────────────────────────────────────────

CREATE TRIGGER trg_shares_updated_at
  BEFORE UPDATE ON "shares"
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

CREATE TRIGGER trg_notification_preferences_updated_at
  BEFORE UPDATE ON "notification_preferences"
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- ─── The polymorphic reference, made safe ───────────────────────────────────
--
-- `shares(resource_type, resource_id)` points at one of two tables, which
-- PostgreSQL cannot express as a foreign key. That absence is a hole rather
-- than a shrug, and it is a SECURITY hole, not only an integrity one:
--
--   The RLS policy on `shares` compares `vault_id` — and `vault_id` is whatever
--   the client sent. A share naming the sender's OWN vault_id together with
--   another family's resource_id would pass the policy, and then resolve to a
--   memory the sender cannot otherwise read.
--
-- This trigger closes it by checking that the resource exists AND belongs to
-- the vault the row claims. SECURITY DEFINER is not needed: a trigger function
-- runs with the privileges of the user, but RLS on the referenced table would
-- hide exactly the rows we are trying to catch — so it runs as the table owner
-- by being owned by it, and the lookup sees everything.
CREATE OR REPLACE FUNCTION share_resource_check() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF NEW.resource_type = 'memory' THEN
    SELECT EXISTS (
      SELECT 1 FROM memories m
      WHERE m.id = NEW.resource_id
        AND m.vault_id = NEW.vault_id
        AND m.deleted_at IS NULL
    ) INTO v_ok;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM albums a
      WHERE a.id = NEW.resource_id
        AND a.vault_id = NEW.vault_id
    ) INTO v_ok;
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION
      'share names a % that does not exist in vault %',
      NEW.resource_type, NEW.vault_id
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_shares_resource_check
  BEFORE INSERT OR UPDATE OF resource_type, resource_id, vault_id ON "shares"
  FOR EACH ROW
  EXECUTE FUNCTION share_resource_check();
--> statement-breakpoint

-- ─── The link holder with no account ────────────────────────────────────────
--
-- Same shape as the capsule unlock path: no actor, so no policy can govern it.
-- One narrow SECURITY DEFINER function that takes the token hash and returns
-- only what a viewer needs.
--
-- Expiry and revocation are checked HERE rather than in the application,
-- because this is the one place every anonymous view must pass through.
CREATE OR REPLACE FUNCTION app_resolve_share(p_token_hash varchar)
  RETURNS TABLE (
    share_id      uuid,
    vault_id      uuid,
    resource_type text,
    resource_id   uuid,
    permission    text,
    allow_download boolean,
    has_password  boolean
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT s.id, s.vault_id, s.resource_type, s.resource_id,
         s.permission, s.allow_download, s.password_hash IS NOT NULL
  FROM shares s
  WHERE s.token_hash = p_token_hash
    AND s.revoked_at IS NULL
    AND (s.expires_at IS NULL OR s.expires_at > now())
$$;
--> statement-breakpoint

-- Counting a view. Separate from resolving one, so that a resolve can be
-- cached and a view cannot: the owner is SHOWN these numbers, and a count that
-- silently misses views is a worse lie than no count at all.
CREATE OR REPLACE FUNCTION app_record_share_view(p_token_hash varchar)
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  UPDATE shares
     SET view_count     = view_count + 1,
         last_viewed_at = now()
   WHERE token_hash = p_token_hash
     AND revoked_at IS NULL
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_resolve_share(varchar) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_record_share_view(varchar) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_resolve_share(varchar) TO mm_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_record_share_view(varchar) TO mm_app;
--> statement-breakpoint

-- ─── Policies ───────────────────────────────────────────────────────────────

-- Anyone in the vault may see that a link exists — a member should be able to
-- discover their family's archive is shared outward.
CREATE POLICY shares_read ON shares FOR SELECT
  USING (app_vault_role(vault_id) IS NOT NULL);
--> statement-breakpoint

CREATE POLICY shares_insert ON shares FOR INSERT
  WITH CHECK (
    owner_id = app_current_user()
    AND app_vault_role(vault_id) IN ('contributor', 'admin', 'owner')
  );
--> statement-breakpoint

-- Revoking is an UPDATE, and a vault admin may revoke somebody else's link:
-- unlike a capsule, a share is not a promise to a third party — it is an open
-- door, and whoever is responsible for the vault must be able to close it.
CREATE POLICY shares_update ON shares FOR UPDATE
  USING (
    owner_id = app_current_user()
    OR app_vault_role(vault_id) IN ('admin', 'owner')
  )
  WITH CHECK (
    owner_id = app_current_user()
    OR app_vault_role(vault_id) IN ('admin', 'owner')
  );
--> statement-breakpoint

-- No DELETE policy. A revoked link stays in the list, because the owner needs
-- to see that it existed, who could have used it, and when it was last opened.
-- Deleting the row would erase the evidence of an exposure.

CREATE POLICY notifications_own ON notifications FOR SELECT
  USING (user_id = app_current_user());
--> statement-breakpoint

-- Marking as read is the only write a user makes. Notifications are created by
-- background jobs under their own role; a request handler cannot invent one,
-- so the product cannot be made to tell a user something it never decided.
CREATE POLICY notifications_mark_read ON notifications FOR UPDATE
  USING (user_id = app_current_user())
  WITH CHECK (user_id = app_current_user());
--> statement-breakpoint

CREATE POLICY notification_preferences_own ON notification_preferences FOR ALL
  USING (user_id = app_current_user())
  WITH CHECK (user_id = app_current_user());
