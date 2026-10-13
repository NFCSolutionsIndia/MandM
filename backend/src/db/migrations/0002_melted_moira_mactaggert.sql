ALTER TABLE "devices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "passkey_credentials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vault_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vaults" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ─── Row-level security ─────────────────────────────────────────────────────
--
-- Hand-written, appended to the generated migration. drizzle-kit emits the
-- ENABLE statements above and cannot model roles, functions or policies.
--
-- The six tables above now deny every row to any role that is not the table
-- owner. That is the safe direction, and the rest of this file decides what to
-- let back in.

-- ─── The application role ───────────────────────────────────────────────────
--
-- NOSUPERUSER and NOBYPASSRLS, and it does not own these tables. All three
-- matter: PostgreSQL bypasses RLS for a superuser AND for a table's owner, so
-- policies enforced against `postgres` enforce nothing at all.
--
-- NOLOGIN here on purpose. A password in a migration is a password in git
-- history forever; LOGIN and a password are granted per environment -- from
-- Secrets Manager on a server, by hand on a laptop.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mm_app') THEN
    CREATE ROLE mm_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO mm_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mm_app;
--> statement-breakpoint

-- Tables created by later migrations get the same grants automatically.
-- Without this, every new domain would silently be unreadable by the API until
-- somebody noticed and wrote a GRANT by hand.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mm_app;
--> statement-breakpoint

-- ─── The actor ──────────────────────────────────────────────────────────────
--
-- Who the current transaction is acting as. The application sets it with
--
--     SET LOCAL app.user_id = '<uuid>';
--
-- SET LOCAL, never SET. The connection pool hands the same physical connection
-- to the next request, so a session-level setting would leak one actor's
-- identity into another request's query -- the exact bug RLS is here to stop.
--
-- Returns NULL when unset, and NULL is not TRUE, so every policy below denies
-- by default. Forgetting to set the actor fails closed.
CREATE OR REPLACE FUNCTION app_current_user() RETURNS uuid
  LANGUAGE sql STABLE
  SET search_path = pg_catalog
AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;
--> statement-breakpoint

-- ─── Membership helpers ─────────────────────────────────────────────────────
--
-- SECURITY DEFINER, and that is the whole point.
--
-- A policy on `vaults` has to ask "is this user a member?", which reads
-- `vault_members` -- whose own policy asks the same question back. That is
-- infinite recursion, and PostgreSQL will say so at query time.
--
-- These run as the function owner, which bypasses RLS, so the recursion is cut
-- exactly once and in one reviewable place. They are narrow by construction:
-- each answers a single question about the CURRENT actor and cannot be coaxed
-- into returning anybody else's rows.
CREATE OR REPLACE FUNCTION app_vault_role(p_vault uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT m.role
  FROM vault_members m
  WHERE m.vault_id = p_vault
    AND m.user_id = app_current_user()
    AND m.revoked_at IS NULL
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_is_vault_owner(p_vault uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM vaults v
    WHERE v.id = p_vault AND v.owner_id = app_current_user()
  )
$$;
--> statement-breakpoint

-- "Does the actor share a live vault with this user?" -- what lets one family
-- member see another's display name without exposing the whole users table.
CREATE OR REPLACE FUNCTION app_shares_vault(p_user uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM vault_members mine
    JOIN vault_members theirs ON theirs.vault_id = mine.vault_id
    WHERE mine.user_id = app_current_user() AND mine.revoked_at IS NULL
      AND theirs.user_id = p_user           AND theirs.revoked_at IS NULL
  )
$$;
--> statement-breakpoint

-- ─── The pre-authentication path ────────────────────────────────────────────
--
-- A chicken-and-egg problem worth stating plainly: authentication must read
-- `sessions` to discover who the actor is, but the policy on `sessions` needs
-- an actor to already be set. Relaxing that policy would reopen the table.
--
-- Instead the single query that legitimately runs without an actor gets its own
-- narrow function. It takes a token hash and returns one uuid -- it cannot list
-- sessions, cannot be asked about a user, and reveals nothing to a caller who
-- does not already hold the token.
CREATE OR REPLACE FUNCTION app_resolve_session(p_token_hash varchar)
  RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT s.user_id
  FROM sessions s
  WHERE s.token_hash = p_token_hash
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
$$;
--> statement-breakpoint

-- The same problem for passkey login: the credential has to be found before
-- anyone is authenticated, because finding it is how they authenticate.
CREATE OR REPLACE FUNCTION app_resolve_passkey(p_credential_id varchar)
  RETURNS TABLE (user_id uuid, public_key text, sign_count bigint)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT c.user_id, c.public_key, c.sign_count
  FROM passkey_credentials c
  WHERE c.credential_id = p_credential_id
$$;
--> statement-breakpoint

-- EXECUTE is granted explicitly rather than inherited from PUBLIC. A
-- SECURITY DEFINER function runs with the owner's privileges, so who may call
-- it is part of its definition, not an afterthought.
REVOKE ALL ON FUNCTION app_vault_role(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_is_vault_owner(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_shares_vault(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_resolve_session(varchar) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_resolve_passkey(varchar) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_current_user() TO mm_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_vault_role(uuid) TO mm_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_is_vault_owner(uuid) TO mm_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_shares_vault(uuid) TO mm_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_resolve_session(varchar) TO mm_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_resolve_passkey(varchar) TO mm_app;
--> statement-breakpoint

-- ─── Policies: self-owned tables ────────────────────────────────────────────

-- A user reads their own row, and the display name of anyone they share a vault
-- with. Without the second clause a family album cannot say who added a photo.
CREATE POLICY users_read ON users FOR SELECT
  USING (id = app_current_user() OR app_shares_vault(id));
--> statement-breakpoint

-- Registration happens before an actor exists -- there is nobody to be yet.
-- This is the one deliberately permissive policy in the file, and it is safe
-- because creating a row reveals nothing; reading one is still governed above.
CREATE POLICY users_insert ON users FOR INSERT
  WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY users_update ON users FOR UPDATE
  USING (id = app_current_user())
  WITH CHECK (id = app_current_user());
--> statement-breakpoint

-- No DELETE policy on `users`, so DELETE is denied to mm_app entirely. Account
-- removal is a soft delete followed by a purge job running as a different role,
-- never a stray DELETE from a request handler.

CREATE POLICY sessions_own ON sessions FOR ALL
  USING (user_id = app_current_user())
  WITH CHECK (user_id = app_current_user());
--> statement-breakpoint

CREATE POLICY passkeys_own ON passkey_credentials FOR ALL
  USING (user_id = app_current_user())
  WITH CHECK (user_id = app_current_user());
--> statement-breakpoint

CREATE POLICY devices_own ON devices FOR ALL
  USING (user_id = app_current_user())
  WITH CHECK (user_id = app_current_user());
--> statement-breakpoint

-- ─── Policies: the tenant boundary ──────────────────────────────────────────
--
-- The owner is checked directly rather than only through membership, so a vault
-- stays reachable by its owner even if the membership row is ever missing.
CREATE POLICY vaults_read ON vaults FOR SELECT
  USING (owner_id = app_current_user() OR app_vault_role(id) IS NOT NULL);
--> statement-breakpoint

-- You may only create a vault you own. Nothing stops an actor from naming
-- somebody else as owner in a request payload, so the database refuses it.
CREATE POLICY vaults_insert ON vaults FOR INSERT
  WITH CHECK (owner_id = app_current_user());
--> statement-breakpoint

CREATE POLICY vaults_update ON vaults FOR UPDATE
  USING (owner_id = app_current_user() OR app_vault_role(id) IN ('owner', 'admin'))
  WITH CHECK (owner_id = app_current_user() OR app_vault_role(id) IN ('owner', 'admin'));
--> statement-breakpoint

-- Deleting a vault deletes other people's memories. Owner only.
CREATE POLICY vaults_delete ON vaults FOR DELETE
  USING (owner_id = app_current_user());
--> statement-breakpoint

-- `app_is_vault_owner` appears here for one specific moment: creating a vault
-- and then inserting your own owner-membership row. At that instant you are not
-- yet a member, so a membership check alone would refuse the very row that
-- makes you one.
CREATE POLICY vault_members_read ON vault_members FOR SELECT
  USING (app_vault_role(vault_id) IS NOT NULL OR app_is_vault_owner(vault_id));
--> statement-breakpoint

CREATE POLICY vault_members_insert ON vault_members FOR INSERT
  WITH CHECK (
    app_vault_role(vault_id) IN ('owner', 'admin')
    OR app_is_vault_owner(vault_id)
  );
--> statement-breakpoint

CREATE POLICY vault_members_update ON vault_members FOR UPDATE
  USING (app_vault_role(vault_id) IN ('owner', 'admin') OR app_is_vault_owner(vault_id))
  WITH CHECK (app_vault_role(vault_id) IN ('owner', 'admin') OR app_is_vault_owner(vault_id));
--> statement-breakpoint

CREATE POLICY vault_members_delete ON vault_members FOR DELETE
  USING (app_is_vault_owner(vault_id));
