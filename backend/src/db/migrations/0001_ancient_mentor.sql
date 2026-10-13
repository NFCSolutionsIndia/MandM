CREATE TABLE "vault_members" (
	"vault_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(16) DEFAULT 'viewer' NOT NULL,
	"invited_by" uuid,
	"joined_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp (3) with time zone,
	CONSTRAINT "pk_vault_members" PRIMARY KEY("vault_id","user_id"),
	CONSTRAINT "ck_vault_members_role" CHECK ("role" IN ('viewer', 'contributor', 'admin', 'owner'))
);
--> statement-breakpoint
CREATE TABLE "vaults" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"type" varchar(16) DEFAULT 'personal' NOT NULL,
	"cover_media_id" uuid,
	"default_visibility" varchar(16) DEFAULT 'vault' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	CONSTRAINT "ck_vaults_type" CHECK ("type" IN ('personal', 'shared', 'legacy')),
	CONSTRAINT "ck_vaults_default_visibility" CHECK ("default_visibility" IN ('private', 'vault', 'link', 'recipients'))
);
--> statement-breakpoint
ALTER TABLE "vault_members" ADD CONSTRAINT "vault_members_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_members" ADD CONSTRAINT "vault_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_members" ADD CONSTRAINT "vault_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaults" ADD CONSTRAINT "vaults_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_vault_members_user" ON "vault_members" USING btree ("user_id","vault_id") WHERE "vault_members"."revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_vault_members_owner" ON "vault_members" USING btree ("vault_id") WHERE "vault_members"."role" = 'owner' AND "vault_members"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "ix_vaults_owner" ON "vaults" USING btree ("owner_id");--> statement-breakpoint

-- ─── Conventions ────────────────────────────────────────────────────────────
--
-- Hand-written, appended to the generated migration. drizzle-kit emits table
-- DDL and does not model triggers, so every table that carries `updated_at`
-- has to attach the function defined in migration 0000 explicitly.
--
-- `vaults` is the first such table in the schema. Without this trigger the
-- column is maintained only by Drizzle's $onUpdate hook, which means a rename
-- applied by a migration backfill or by hand in psql leaves `updated_at`
-- claiming the row has not changed since it was created.
CREATE TRIGGER trg_vaults_updated_at
  BEFORE UPDATE ON "vaults"
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
