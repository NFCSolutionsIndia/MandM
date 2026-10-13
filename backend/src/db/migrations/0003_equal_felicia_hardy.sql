CREATE TABLE "event_members" (
	"event_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	CONSTRAINT "pk_event_members" PRIMARY KEY("event_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "event_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "event_reminders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"offset_days" integer DEFAULT 0 NOT NULL,
	"channels" text[] DEFAULT ARRAY['push']::text[] NOT NULL,
	"last_fired_for_year" integer,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_event_reminders_offset" CHECK ("event_reminders"."offset_days" >= 0 AND "event_reminders"."offset_days" <= 365),
	CONSTRAINT "ck_event_reminders_channels" CHECK ("channels" <@ ARRAY['push', 'email']::text[])
);
--> statement-breakpoint
ALTER TABLE "event_reminders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"type" varchar(16) DEFAULT 'custom' NOT NULL,
	"event_date" date NOT NULL,
	"recurrence" varchar(16) DEFAULT 'none' NOT NULL,
	"all_day" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	CONSTRAINT "ck_events_type" CHECK ("type" IN ('birthday', 'anniversary', 'festival', 'custom')),
	CONSTRAINT "ck_events_recurrence" CHECK ("recurrence" IN ('none', 'yearly', 'monthly'))
);
--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"relationship" varchar(64),
	"avatar_media_id" uuid,
	"phone" varchar(32),
	"phone_verified_at" timestamp (3) with time zone,
	"email" "citext",
	"email_verified_at" timestamp (3) with time zone,
	"birthday" date,
	"birthday_precision" varchar(16),
	"anniversary" date,
	"notes" text,
	"self_service_token_hash" varchar(64),
	"linked_user_id" uuid,
	"deceased_at" timestamp (3) with time zone,
	"merged_into_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_members_birthday_precision" CHECK ("birthday_precision" IN ('exact', 'day', 'month', 'year')),
	CONSTRAINT "ck_members_merge_not_self" CHECK ("members"."merged_into_id" <> "members"."id")
);
--> statement-breakpoint
ALTER TABLE "members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "event_members" ADD CONSTRAINT "event_members_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_members" ADD CONSTRAINT "event_members_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reminders" ADD CONSTRAINT "event_reminders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_linked_user_id_users_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_merged_into_id_members_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_event_members_member" ON "event_members" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "ix_event_reminders_event" ON "event_reminders" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "ix_event_reminders_fired" ON "event_reminders" USING btree ("last_fired_for_year");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_event_reminders_offset" ON "event_reminders" USING btree ("event_id","offset_days");--> statement-breakpoint
CREATE INDEX "ix_events_owner_date" ON "events" USING btree ("owner_id","event_date");--> statement-breakpoint
CREATE INDEX "ix_events_owner_type" ON "events" USING btree ("owner_id","type");--> statement-breakpoint
CREATE INDEX "ix_members_owner_name" ON "members" USING btree ("owner_id","name");--> statement-breakpoint
CREATE INDEX "ix_members_owner_birthday" ON "members" USING btree ("owner_id","birthday") WHERE "members"."birthday" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_members_linked_user" ON "members" USING btree ("linked_user_id") WHERE "members"."linked_user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_members_self_service_token" ON "members" USING btree ("self_service_token_hash") WHERE "members"."self_service_token_hash" IS NOT NULL;
--> statement-breakpoint

-- ─── Conventions ────────────────────────────────────────────────────────────
--
-- Hand-written, appended to the generated migration. drizzle-kit emits table
-- DDL and the ENABLE statements above; triggers, functions and policies are
-- ours.

-- `members` and `events` both carry `updated_at`, so both need the trigger
-- defined in migration 0000. The ORM hook covers writes through Drizzle; this
-- covers everything else.
CREATE TRIGGER trg_members_updated_at
  BEFORE UPDATE ON "members"
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

CREATE TRIGGER trg_events_updated_at
  BEFORE UPDATE ON "events"
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- ─── Ownership helpers ──────────────────────────────────────────────────────
--
-- SECURITY DEFINER, for the same reason as the tenancy helpers in 0002: a
-- policy on `event_members` must read `events`, whose own policy would then be
-- evaluated inside it. These cut that once, in a reviewable place.
--
-- Each answers only about the CURRENT actor, so holding one cannot be turned
-- into a way to ask about anybody else.
CREATE OR REPLACE FUNCTION app_owns_event(p_event uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = p_event AND e.owner_id = app_current_user()
  )
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_owns_member(p_member uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM members m
    WHERE m.id = p_member AND m.owner_id = app_current_user()
  )
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_owns_event(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_owns_member(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_owns_event(uuid) TO mm_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_owns_member(uuid) TO mm_app;
--> statement-breakpoint

-- ─── Policies ───────────────────────────────────────────────────────────────
--
-- Owner-scoped, not vault-scoped. A shared vault lets several people add
-- memories to it; it does not let them read each other's address books. These
-- are records about real people who never consented to being in this database,
-- so they stay private to the one account that wrote them.

CREATE POLICY members_own ON members FOR ALL
  USING (owner_id = app_current_user())
  WITH CHECK (owner_id = app_current_user());
--> statement-breakpoint

CREATE POLICY events_own ON events FOR ALL
  USING (owner_id = app_current_user())
  WITH CHECK (owner_id = app_current_user());
--> statement-breakpoint

-- Both sides are checked on write. A member id is private and effectively
-- unguessable, but "they could not have known the id" is not an access control
-- — it is a reason the attack is inconvenient.
CREATE POLICY event_members_own ON event_members FOR ALL
  USING (app_owns_event(event_id))
  WITH CHECK (app_owns_event(event_id) AND app_owns_member(member_id));
--> statement-breakpoint

CREATE POLICY event_reminders_own ON event_reminders FOR ALL
  USING (app_owns_event(event_id))
  WITH CHECK (app_owns_event(event_id));
