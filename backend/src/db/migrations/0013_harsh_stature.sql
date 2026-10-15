CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"admin_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"mfa_completed_at" timestamp (3) with time zone,
	"user_agent" varchar(512),
	"ip_hash" varchar(64),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"revoked_at" timestamp (3) with time zone
);
--> statement-breakpoint
ALTER TABLE "admin_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_admin_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_admin_sessions_token" ON "admin_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "ix_admin_sessions_live" ON "admin_sessions" USING btree ("admin_id","expires_at") WHERE "admin_sessions"."revoked_at" IS NULL;
--> statement-breakpoint

-- ─── The admin sign-in path ─────────────────────────────────────────────────
--
-- Two factors, neither of them a password.
--
--   1. an emailed code, proving control of the corporate mailbox
--   2. a TOTP code, proving possession of the enrolled device
--
-- Both run before anybody is authenticated, so none of it can be governed by a
-- policy. `admin_sessions` has RLS enabled and no policy for `mm_app` at all —
-- the API cannot read or write it, only call the functions below.

GRANT SELECT, INSERT, UPDATE ON admin_sessions TO mm_admin;
--> statement-breakpoint

-- An admin may see and revoke their own sessions, once authenticated.
CREATE POLICY admin_sessions_own ON admin_sessions FOR SELECT TO mm_admin
  USING (admin_id = app_current_admin());
--> statement-breakpoint
CREATE POLICY admin_sessions_revoke ON admin_sessions FOR UPDATE TO mm_admin
  USING (admin_id = app_current_admin())
  WITH CHECK (admin_id = app_current_admin());
--> statement-breakpoint

-- ─── Factor one ─────────────────────────────────────────────────────────────
--
-- Deliberately NOT the user function. `app_redeem_email_code` creates an
-- account when the address is unknown, which is right for a product where
-- sign-up and sign-in are one flow — and catastrophic here: it would mean
-- anybody who can receive mail could mint themselves an admin.
--
-- This one creates nothing. An address that is not an active admin gets the
-- same empty result as a wrong code.
CREATE OR REPLACE FUNCTION app_admin_redeem_code(
  p_email      citext,
  p_code_hash  varchar,
  p_token_hash varchar,
  p_user_agent varchar,
  p_ip_hash    varchar,
  p_hours      int
) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_otp   email_otps%ROWTYPE;
  v_admin uuid;
BEGIN
  SELECT a.id INTO v_admin
    FROM admin_users a
   WHERE a.email = p_email AND a.is_active;

  SELECT * INTO v_otp
    FROM email_otps
   WHERE email = p_email AND consumed_at IS NULL
   FOR UPDATE;

  IF NOT FOUND OR v_otp.expires_at <= now() THEN
    RETURN NULL;
  END IF;

  IF v_otp.code_hash <> p_code_hash THEN
    UPDATE email_otps
       SET attempts    = attempts + 1,
           consumed_at = CASE WHEN attempts + 1 >= 5 THEN now() ELSE NULL END
     WHERE id = v_otp.id;
    RETURN NULL;
  END IF;

  -- The code is spent whether or not it belonged to an admin, so a valid code
  -- cannot be replayed while somebody works out which addresses are staff.
  UPDATE email_otps SET consumed_at = now() WHERE id = v_otp.id;

  IF v_admin IS NULL THEN
    RETURN NULL;
  END IF;

  -- mfa_completed_at stays NULL. This session can do exactly one thing:
  -- present a TOTP code.
  INSERT INTO admin_sessions (id, admin_id, token_hash, user_agent, ip_hash, expires_at)
  VALUES (uuid_generate_v7(), v_admin, p_token_hash, p_user_agent, p_ip_hash,
          now() + make_interval(hours => p_hours));

  RETURN v_admin;
END;
$$;
--> statement-breakpoint

-- ─── Factor two ─────────────────────────────────────────────────────────────
--
-- Returns the stored secret for a half-authenticated session so the API can
-- verify a TOTP code. It returns nothing once MFA is already complete, so the
-- secret cannot be fished out with a fully valid token.
CREATE OR REPLACE FUNCTION app_admin_pending_mfa(p_token_hash varchar)
  RETURNS TABLE (admin_id uuid, totp_secret_enc text, backup_codes_enc text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT a.id, a.totp_secret_enc, a.backup_codes_enc
  FROM admin_sessions s
  JOIN admin_users a ON a.id = s.admin_id
  WHERE s.token_hash = p_token_hash
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
    AND s.mfa_completed_at IS NULL
    AND a.is_active
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_admin_complete_mfa(p_token_hash varchar)
  RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin uuid;
BEGIN
  UPDATE admin_sessions
     SET mfa_completed_at = now()
   WHERE token_hash = p_token_hash
     AND revoked_at IS NULL
     AND expires_at > now()
     AND mfa_completed_at IS NULL
  RETURNING admin_id INTO v_admin;

  IF v_admin IS NOT NULL THEN
    UPDATE admin_users SET last_login_at = now() WHERE id = v_admin;

    INSERT INTO audit_logs (id, actor_type, actor_id, action, resource_type)
    VALUES (uuid_generate_v7(), 'admin', v_admin, 'admin.signed_in', 'admin_user');
  END IF;

  RETURN v_admin;
END;
$$;
--> statement-breakpoint

-- Resolve a FULLY authenticated admin session. The middleware's one query.
--
-- Note the mfa_completed_at condition: a session that stopped after factor one
-- resolves to nothing here, so it can reach no admin route at all.
CREATE OR REPLACE FUNCTION app_resolve_admin_session(p_token_hash varchar)
  RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT s.admin_id
  FROM admin_sessions s
  JOIN admin_users a ON a.id = s.admin_id
  WHERE s.token_hash = p_token_hash
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
    AND s.mfa_completed_at IS NOT NULL
    AND a.is_active
$$;
--> statement-breakpoint

-- ─── Enrolment ──────────────────────────────────────────────────────────────
--
-- Writes the encrypted secret exactly once, and refuses to overwrite one that
-- already exists. Re-enrolling is an administrative act with its own approval,
-- not something a half-authenticated session can do to itself — otherwise
-- anybody holding a first-factor token could replace the second factor with
-- one of their own.
CREATE OR REPLACE FUNCTION app_admin_enrol_totp(
  p_admin  uuid,
  p_secret text,
  p_backup text
) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_done boolean;
BEGIN
  UPDATE admin_users
     SET totp_secret_enc  = p_secret,
         backup_codes_enc = p_backup
   WHERE id = p_admin
     AND totp_secret_enc IS NULL
  RETURNING true INTO v_done;

  IF v_done THEN
    INSERT INTO audit_logs (id, actor_type, actor_id, action, resource_type)
    VALUES (uuid_generate_v7(), 'admin', p_admin, 'admin.totp_enrolled', 'admin_user');
  END IF;

  RETURN COALESCE(v_done, false);
END;
$$;
--> statement-breakpoint

-- Consuming a backup code removes it, so each works once.
CREATE OR REPLACE FUNCTION app_admin_use_backup_code(
  p_admin     uuid,
  p_remaining text
) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE admin_users SET backup_codes_enc = p_remaining WHERE id = p_admin;

  INSERT INTO audit_logs (id, actor_type, actor_id, action, resource_type)
  VALUES (uuid_generate_v7(), 'admin', p_admin, 'admin.backup_code_used', 'admin_user');
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_admin_sign_out(p_token_hash varchar)
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  UPDATE admin_sessions SET revoked_at = now()
   WHERE token_hash = p_token_hash AND revoked_at IS NULL
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_admin_redeem_code(citext, varchar, varchar, varchar, varchar, int) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_admin_pending_mfa(varchar) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_admin_complete_mfa(varchar) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_resolve_admin_session(varchar) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_admin_enrol_totp(uuid, text, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_admin_use_backup_code(uuid, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_admin_sign_out(varchar) FROM PUBLIC;
--> statement-breakpoint

-- Granted to mm_app because the sign-in endpoints run before an admin session
-- exists, so they cannot already be connected as mm_admin.
GRANT EXECUTE ON FUNCTION app_admin_redeem_code(citext, varchar, varchar, varchar, varchar, int) TO mm_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_admin_pending_mfa(varchar) TO mm_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_admin_complete_mfa(varchar) TO mm_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_resolve_admin_session(varchar) TO mm_app, mm_admin;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_admin_enrol_totp(uuid, text, text) TO mm_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_admin_use_backup_code(uuid, text) TO mm_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_admin_sign_out(varchar) TO mm_app, mm_admin;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_issue_email_code(citext, varchar, varchar, int) TO mm_app;
