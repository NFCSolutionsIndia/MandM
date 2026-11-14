CREATE TABLE "app_versions" (
	"platform" varchar(16) PRIMARY KEY NOT NULL,
	"latest_version" varchar(32) NOT NULL,
	"min_supported_version" varchar(32) NOT NULL,
	"store_url" varchar(2048),
	"release_notes" text,
	"updated_by" uuid,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_app_versions_platform" CHECK ("platform" IN ('ios', 'android')),
	CONSTRAINT "ck_app_versions_semver" CHECK ("app_versions"."latest_version" ~ '^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$'
          AND "app_versions"."min_supported_version" ~ '^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$'),
	CONSTRAINT "ck_app_versions_order" CHECK (string_to_array("app_versions"."min_supported_version", '.')::int[] <= string_to_array("app_versions"."latest_version", '.')::int[])
);
--> statement-breakpoint
ALTER TABLE "app_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_versions" ADD CONSTRAINT "app_versions_updated_by_admin_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- ─── App versions (BE-05) ───────────────────────────────────────────────────
--
-- One row per platform, seeded here so the endpoint always has an answer.
-- 0.0.0 means "not configured yet": no build is older than it, so neither flag
-- can fire until somebody sets a real value in the console.

INSERT INTO app_versions (platform, latest_version, min_supported_version)
VALUES ('ios', '0.0.0', '0.0.0'), ('android', '0.0.0', '0.0.0')
ON CONFLICT (platform) DO NOTHING;
--> statement-breakpoint

-- Public data. The API reads it with no actor at all — an app too old to sign
-- in still has to be told to update — and the console reads it to edit it.
CREATE POLICY app_versions_read ON app_versions FOR SELECT TO mm_app USING (true);
--> statement-breakpoint
CREATE POLICY app_versions_admin_read ON app_versions FOR SELECT TO mm_admin USING (true);
--> statement-breakpoint

-- ─── The only way to change a version ───────────────────────────────────────
--
-- No INSERT or UPDATE policy exists for any role, so this function is the one
-- write path. It exists because of `audit_logs`: the console has no INSERT
-- policy there (migration 0011 — "the console cannot write its own history"),
-- so the change and its audit row have to be written together, by something
-- that stamps the actor from `app_current_admin()` rather than from input.
--
-- Returns no row for an unknown platform. Validation lives in the API and in
-- the table's check constraints; this function only refuses a caller with no
-- admin behind it.
CREATE OR REPLACE FUNCTION app_admin_set_app_version(
  p_platform      varchar,
  p_latest        varchar,
  p_min_supported varchar,
  p_store_url     varchar,
  p_release_notes text
) RETURNS SETOF app_versions
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin uuid := app_current_admin();
  v_old   app_versions%ROWTYPE;
  v_new   app_versions%ROWTYPE;
BEGIN
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'app_admin_set_app_version requires an admin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_old FROM app_versions WHERE platform = p_platform FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE app_versions
     SET latest_version        = p_latest,
         min_supported_version = p_min_supported,
         store_url             = p_store_url,
         release_notes         = p_release_notes,
         updated_by            = v_admin,
         updated_at            = now()
   WHERE platform = p_platform
  RETURNING * INTO v_new;

  INSERT INTO audit_logs (id, actor_type, actor_id, action, resource_type, metadata)
  VALUES (
    uuid_generate_v7(), 'admin', v_admin, 'app_version.updated', 'app_version',
    jsonb_build_object(
      'platform', p_platform,
      'old', jsonb_build_object(
        'latestVersion', v_old.latest_version,
        'minSupportedVersion', v_old.min_supported_version,
        'storeUrl', v_old.store_url,
        'releaseNotes', v_old.release_notes),
      'new', jsonb_build_object(
        'latestVersion', v_new.latest_version,
        'minSupportedVersion', v_new.min_supported_version,
        'storeUrl', v_new.store_url,
        'releaseNotes', v_new.release_notes)));

  RETURN NEXT v_new;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_admin_set_app_version(varchar, varchar, varchar, varchar, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_admin_set_app_version(varchar, varchar, varchar, varchar, text) TO mm_admin;
