CREATE TABLE "album_memories" (
	"album_id" uuid NOT NULL,
	"memory_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "pk_album_memories" PRIMARY KEY("album_id","memory_id")
);
--> statement-breakpoint
ALTER TABLE "album_memories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "albums" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vault_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"type" varchar(16) DEFAULT 'manual' NOT NULL,
	"cover_media_id" uuid,
	"start_date" date,
	"end_date" date,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_albums_type" CHECK ("type" IN ('manual', 'event', 'shared')),
	CONSTRAINT "ck_albums_dates" CHECK ("albums"."start_date" IS NULL OR "albums"."end_date" IS NULL OR "albums"."start_date" <= "albums"."end_date")
);
--> statement-breakpoint
ALTER TABLE "albums" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"memory_id" uuid NOT NULL,
	"vault_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"mime" varchar(128) NOT NULL,
	"bytes" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"storage_key" varchar(512) NOT NULL,
	"thumb_key" varchar(512),
	"preview_key" varchar(512),
	"poster_key" varchar(512),
	"blurhash" varchar(64),
	"checksum_sha256" varchar(64) NOT NULL,
	"perceptual_hash" varchar(32),
	"captured_at" timestamp (3) with time zone,
	"exif" jsonb,
	"transcode_status" varchar(16) DEFAULT 'pending' NOT NULL,
	"transcode_variants" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "ck_media_kind" CHECK ("kind" IN ('image', 'video', 'audio')),
	CONSTRAINT "ck_media_transcode" CHECK ("transcode_status" IN ('pending', 'processing', 'ready', 'failed', 'skipped')),
	CONSTRAINT "ck_media_bytes" CHECK ("media_assets"."bytes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vault_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"title" varchar(300),
	"note" text,
	"occurred_at" timestamp (3) with time zone NOT NULL,
	"occurred_precision" varchar(16) DEFAULT 'exact' NOT NULL,
	"occasion" varchar(32),
	"visibility" varchar(16) DEFAULT 'private' NOT NULL,
	"is_favourite" boolean DEFAULT false NOT NULL,
	"cover_media_id" uuid,
	"client_id" uuid NOT NULL,
	"sync_state" varchar(16) DEFAULT 'synced' NOT NULL,
	"search_text" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "ck_memories_precision" CHECK ("occurred_precision" IN ('exact', 'day', 'month', 'year')),
	CONSTRAINT "ck_memories_visibility" CHECK ("visibility" IN ('private', 'vault', 'link', 'recipients')),
	CONSTRAINT "ck_memories_sync_state" CHECK ("sync_state" IN ('synced', 'pending', 'conflict'))
);
--> statement-breakpoint
ALTER TABLE "memories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "memory_members" (
	"memory_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"source" varchar(16) DEFAULT 'manual' NOT NULL,
	"confidence" numeric(4, 3),
	"confirmed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_memory_members" PRIMARY KEY("memory_id","member_id"),
	CONSTRAINT "ck_memory_members_source" CHECK ("source" IN ('manual', 'auto')),
	CONSTRAINT "ck_memory_members_confidence" CHECK ("memory_members"."confidence" IS NULL OR ("memory_members"."confidence" >= 0 AND "memory_members"."confidence" <= 1)),
	CONSTRAINT "ck_memory_members_manual" CHECK ("memory_members"."source" <> 'manual' OR "memory_members"."confidence" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "memory_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "upload_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"intended_memory_id" uuid,
	"filename" varchar(255) NOT NULL,
	"bytes_total" bigint NOT NULL,
	"bytes_received" bigint DEFAULT 0 NOT NULL,
	"parts" jsonb,
	"storage_upload_id" varchar(255),
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_upload_status" CHECK ("status" IN ('pending', 'uploading', 'completed', 'aborted', 'expired')),
	CONSTRAINT "ck_upload_bytes" CHECK ("upload_sessions"."bytes_total" >= 0 AND "upload_sessions"."bytes_received" >= 0 AND "upload_sessions"."bytes_received" <= "upload_sessions"."bytes_total")
);
--> statement-breakpoint
ALTER TABLE "upload_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "album_memories" ADD CONSTRAINT "album_memories_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_memories" ADD CONSTRAINT "album_memories_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_cover_media_id_media_assets_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_cover_media_id_media_assets_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_members" ADD CONSTRAINT "memory_members_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_members" ADD CONSTRAINT "memory_members_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_intended_memory_id_memories_id_fk" FOREIGN KEY ("intended_memory_id") REFERENCES "public"."memories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_album_memories_order" ON "album_memories" USING btree ("album_id","sort_order");--> statement-breakpoint
CREATE INDEX "ix_album_memories_memory" ON "album_memories" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "ix_albums_vault_type" ON "albums" USING btree ("vault_id","type");--> statement-breakpoint
CREATE INDEX "ix_media_memory" ON "media_assets" USING btree ("memory_id","sort_order");--> statement-breakpoint
CREATE INDEX "ix_media_vault" ON "media_assets" USING btree ("vault_id");--> statement-breakpoint
CREATE INDEX "ix_media_transcode" ON "media_assets" USING btree ("transcode_status","created_at");--> statement-breakpoint
CREATE INDEX "ix_media_checksum" ON "media_assets" USING btree ("checksum_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_media_storage_key" ON "media_assets" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_memories_client" ON "memories" USING btree ("author_id","client_id");--> statement-breakpoint
CREATE INDEX "ix_memories_timeline" ON "memories" USING btree ("vault_id","occurred_at" DESC NULLS LAST) WHERE "memories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "ix_memories_on_this_day" ON "memories" USING btree ("vault_id","occurred_at") WHERE "memories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "ix_memories_author" ON "memories" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "ix_memories_trash" ON "memories" USING btree ("vault_id","deleted_at") WHERE "memories"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_memory_members_member" ON "memory_members" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "ix_memory_members_pending" ON "memory_members" USING btree ("memory_id") WHERE "memory_members"."confirmed_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_upload_sessions_client" ON "upload_sessions" USING btree ("user_id","client_id");--> statement-breakpoint
CREATE INDEX "ix_upload_sessions_user" ON "upload_sessions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "ix_upload_sessions_expiry" ON "upload_sessions" USING btree ("expires_at") WHERE "upload_sessions"."status" IN ('pending', 'uploading');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_media_id_media_assets_id_fk" FOREIGN KEY ("avatar_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaults" ADD CONSTRAINT "vaults_cover_media_id_media_assets_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_avatar_media_id_media_assets_id_fk" FOREIGN KEY ("avatar_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

-- ─── Conventions ────────────────────────────────────────────────────────────
--
-- Hand-written, appended to the generated migration: the search extension and
-- its indexes, the updated_at triggers, two ownership helpers, and the
-- policies. drizzle-kit models none of these.

-- Trigram matching, for typo tolerance in search. Installed by the migration
-- rather than the Docker init script, for the same reason citext is: the
-- migration pipeline must be the only thing that defines a database.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint

-- ─── Search ─────────────────────────────────────────────────────────────────
--
-- `search_text` is maintained by the application — title, note, people, place
-- and tags concatenated. It cannot be a generated column, because the people
-- tagged in a memory live in another table and PostgreSQL cannot reach across
-- one from a generated expression.
--
-- Two indexes, because they answer different questions. The tsvector index
-- handles words and stems; the trigram index handles the half-remembered and
-- the misspelt, which is most of how anyone searches a family archive.
--
-- 'simple' rather than 'english': this archive is India-first and multilingual,
-- and English stemming on a Marathi or Hindi phrase is worse than no stemming.
CREATE INDEX ft_memories_search
  ON memories
  USING GIN (to_tsvector('simple', coalesce(search_text, '')));
--> statement-breakpoint

CREATE INDEX ix_memories_search_trgm
  ON memories
  USING GIN (search_text gin_trgm_ops);
--> statement-breakpoint

-- ─── updated_at triggers ────────────────────────────────────────────────────
--
-- Three of the six new tables carry updated_at. `media_assets` does not, by
-- design: an original is immutable, and a derivative is a new row rather than
-- an edit to an old one.
CREATE TRIGGER trg_memories_updated_at
  BEFORE UPDATE ON "memories"
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

CREATE TRIGGER trg_albums_updated_at
  BEFORE UPDATE ON "albums"
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

CREATE TRIGGER trg_upload_sessions_updated_at
  BEFORE UPDATE ON "upload_sessions"
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- ─── Scope helpers ──────────────────────────────────────────────────────────
--
-- These return the vault a row belongs to, so a policy can compose them with
-- app_vault_role() from migration 0002 rather than restating the membership
-- rules. SECURITY DEFINER for the usual reason: without it, a policy on
-- `album_memories` would evaluate the policy on `albums` inside itself.
--
-- Note that `media_assets` needs no such helper. Its vault_id is denormalised,
-- so its policy reads one column of its own row — which is the point of the
-- denormalisation, and it applies to the security check as much as to the
-- scope guard.
CREATE OR REPLACE FUNCTION app_memory_vault(p_memory uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT m.vault_id FROM memories m WHERE m.id = p_memory
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_album_vault(p_album uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT a.vault_id FROM albums a WHERE a.id = p_album
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_memory_vault(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_album_vault(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_memory_vault(uuid) TO mm_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_album_vault(uuid) TO mm_app;
--> statement-breakpoint

-- ─── Policies ───────────────────────────────────────────────────────────────
--
-- Vault-scoped, and the first use of the role hierarchy. Reading needs any
-- membership; writing needs contributor or above, so a viewer invited to see a
-- grandmother's album cannot add to it.
--
-- NO DELETE POLICY on memories or media_assets. Deletion is a soft delete —
-- an UPDATE of deleted_at — and the purge job that eventually issues a real
-- DELETE runs under a different role with its own credential. A request
-- handler cannot destroy a family's media even if it tries.

CREATE POLICY memories_read ON memories FOR SELECT
  USING (app_vault_role(vault_id) IS NOT NULL);
--> statement-breakpoint

-- The author is recorded, so it must be the actor. Nothing stops a client
-- sending somebody else's id in the payload; the database refuses it.
CREATE POLICY memories_insert ON memories FOR INSERT
  WITH CHECK (
    author_id = app_current_user()
    AND app_vault_role(vault_id) IN ('contributor', 'admin', 'owner')
  );
--> statement-breakpoint

-- You may edit your own; an admin or owner may edit anything in their vault.
-- The WITH CHECK is evaluated against the NEW row, so moving a memory into a
-- vault you cannot write to is refused by the same policy.
CREATE POLICY memories_update ON memories FOR UPDATE
  USING (
    (author_id = app_current_user()
      AND app_vault_role(vault_id) IN ('contributor', 'admin', 'owner'))
    OR app_vault_role(vault_id) IN ('admin', 'owner')
  )
  WITH CHECK (app_vault_role(vault_id) IN ('contributor', 'admin', 'owner'));
--> statement-breakpoint

CREATE POLICY media_read ON media_assets FOR SELECT
  USING (app_vault_role(vault_id) IS NOT NULL);
--> statement-breakpoint

CREATE POLICY media_insert ON media_assets FOR INSERT
  WITH CHECK (
    owner_id = app_current_user()
    AND app_vault_role(vault_id) IN ('contributor', 'admin', 'owner')
  );
--> statement-breakpoint

CREATE POLICY media_update ON media_assets FOR UPDATE
  USING (app_vault_role(vault_id) IN ('contributor', 'admin', 'owner'))
  WITH CHECK (app_vault_role(vault_id) IN ('contributor', 'admin', 'owner'));
--> statement-breakpoint

-- An upload exists before anyone has decided which vault it belongs to, so it
-- is scoped to the person rather than the tenant.
CREATE POLICY upload_sessions_own ON upload_sessions FOR ALL
  USING (user_id = app_current_user())
  WITH CHECK (user_id = app_current_user());
--> statement-breakpoint

CREATE POLICY albums_read ON albums FOR SELECT
  USING (app_vault_role(vault_id) IS NOT NULL);
--> statement-breakpoint

CREATE POLICY albums_insert ON albums FOR INSERT
  WITH CHECK (
    owner_id = app_current_user()
    AND app_vault_role(vault_id) IN ('contributor', 'admin', 'owner')
  );
--> statement-breakpoint

CREATE POLICY albums_update ON albums FOR UPDATE
  USING (
    owner_id = app_current_user()
    OR app_vault_role(vault_id) IN ('admin', 'owner')
  )
  WITH CHECK (app_vault_role(vault_id) IN ('contributor', 'admin', 'owner'));
--> statement-breakpoint

-- An album holds no media of its own, so deleting one destroys nothing
-- irreplaceable. This is why it has a DELETE policy where memories do not.
CREATE POLICY albums_delete ON albums FOR DELETE
  USING (
    owner_id = app_current_user()
    OR app_vault_role(vault_id) = 'owner'
  );
--> statement-breakpoint

CREATE POLICY album_memories_read ON album_memories FOR SELECT
  USING (app_vault_role(app_album_vault(album_id)) IS NOT NULL);
--> statement-breakpoint

CREATE POLICY album_memories_write ON album_memories FOR ALL
  USING (
    app_vault_role(app_album_vault(album_id))
      IN ('contributor', 'admin', 'owner')
  )
  WITH CHECK (
    app_vault_role(app_album_vault(album_id))
      IN ('contributor', 'admin', 'owner')
    AND app_vault_role(app_memory_vault(memory_id)) IS NOT NULL
  );
--> statement-breakpoint

-- The one policy in the schema that spans two ownership models.
--
-- A memory belongs to a vault; a member belongs to one user. Tagging therefore
-- needs BOTH: permission to write the memory, and ownership of the person. A
-- contributor to a shared family vault may tag their own people in it and
-- never somebody else's — which is what stops a shared vault from becoming a
-- way to enumerate another family's address book.
CREATE POLICY memory_members_read ON memory_members FOR SELECT
  USING (app_vault_role(app_memory_vault(memory_id)) IS NOT NULL);
--> statement-breakpoint

CREATE POLICY memory_members_write ON memory_members FOR ALL
  USING (
    app_vault_role(app_memory_vault(memory_id))
      IN ('contributor', 'admin', 'owner')
    AND app_owns_member(member_id)
  )
  WITH CHECK (
    app_vault_role(app_memory_vault(memory_id))
      IN ('contributor', 'admin', 'owner')
    AND app_owns_member(member_id)
  );
