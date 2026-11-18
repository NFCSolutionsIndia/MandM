-- ─── Console: users and their sessions (BE-08) ──────────────────────────────
--
-- Hand-written; no table changes.
--
-- The Users pages need three things `mm_admin` could not do:
--
--   1. See a user's sessions. The blanket GRANT in 0011 gave table privileges
--      but no row policy, so every list came back empty. Opening it naively
--      would hand the console the token hashes — and a hash is all the
--      session resolver compares, so a hash IS a working sign-in for anyone
--      who can put it in front of `app_resolve_session`. Access is therefore
--      granted column by column, as 0014 does for capsules: device, dates and
--      revocation — never a hash, never the hashed IP.
--
--   2. End every session for a user. No UPDATE policy is added for that:
--      a policy would let the console rewrite expiry dates and un-revoke rows.
--      One function does exactly one thing — set `revoked_at` — and writes the
--      audit row in the same statement, so there is no revoke without a record.
--
--   3. Record that it looked. Searching for a person and reading their device
--      list are accesses to someone's account, so both are logged. The console
--      has no INSERT policy on `audit_logs`; it gets one narrow function that
--      fixes the actor to the signed-in admin and accepts only these actions.

REVOKE SELECT, INSERT, UPDATE ON sessions FROM mm_admin;
--> statement-breakpoint

GRANT SELECT (
  id, user_id, access_expires_at, refresh_expires_at, last_active_at,
  rotated_at, user_agent, created_at, revoked_at
) ON sessions TO mm_admin;
--> statement-breakpoint

CREATE POLICY sessions_admin_ops ON sessions FOR SELECT TO mm_admin
  USING (app_current_admin() IS NOT NULL);
--> statement-breakpoint

-- Passkeys: only whether one exists and when it was used — enough to list
-- "passkey" among a user's sign-in channels. The credential and public key
-- stay out of reach.
REVOKE SELECT, INSERT, UPDATE ON passkey_credentials FROM mm_admin;
--> statement-breakpoint

GRANT SELECT (id, user_id, created_at, last_used_at) ON passkey_credentials TO mm_admin;
--> statement-breakpoint

CREATE POLICY passkeys_admin_ops ON passkey_credentials FOR SELECT TO mm_admin
  USING (app_current_admin() IS NOT NULL);
--> statement-breakpoint

-- ─── Revoke every session of one user ───────────────────────────────────────
--
-- NULL when there is no such user (the API answers 404), otherwise how many
-- live sessions were ended. Zero is a valid answer and is still audited: the
-- record is of the decision, not of its effect.
--
-- `revoked_at` is checked by `app_resolve_session` and `app_refresh_session`,
-- so the very next request with either token is refused.

CREATE OR REPLACE FUNCTION app_admin_revoke_user_sessions(p_user_id uuid)
  RETURNS int
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin uuid := app_current_admin();
  v_count int;
BEGIN
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'app_admin_revoke_user_sessions requires an admin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
    RETURN NULL;
  END IF;

  UPDATE sessions
     SET revoked_at = now()
   WHERE user_id = p_user_id
     AND revoked_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO audit_logs (id, actor_type, actor_id, action, resource_type, resource_id, metadata)
  VALUES (uuid_generate_v7(), 'admin', v_admin, 'admin.user.sessions_revoked', 'user',
          p_user_id, jsonb_build_object('revoked', v_count));

  RETURN v_count;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_admin_revoke_user_sessions(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_admin_revoke_user_sessions(uuid) TO mm_admin;
--> statement-breakpoint

-- ─── Record a console read ──────────────────────────────────────────────────
--
-- Not a general "write an audit row" door: the actor is always the signed-in
-- admin, and the action must be one of the reads this console performs.

CREATE OR REPLACE FUNCTION app_admin_audit_read(
  p_action      varchar,
  p_resource_id uuid,
  p_metadata    jsonb
) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin uuid := app_current_admin();
BEGIN
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'app_admin_audit_read requires an admin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_action NOT IN ('admin.users.searched', 'admin.user.sessions_viewed') THEN
    RAISE EXCEPTION 'app_admin_audit_read: % is not a console read', p_action
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO audit_logs (id, actor_type, actor_id, action, resource_type, resource_id, metadata)
  VALUES (uuid_generate_v7(), 'admin', v_admin, p_action, 'user', p_resource_id, p_metadata);
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_admin_audit_read(varchar, uuid, jsonb) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_admin_audit_read(varchar, uuid, jsonb) TO mm_admin;
