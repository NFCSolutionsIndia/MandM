CREATE TABLE "email_otps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" "citext" NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"ip_hash" varchar(64),
	"expires_at" timestamp (3) with time zone NOT NULL,
	"consumed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_email_otps_attempts" CHECK ("email_otps"."attempts" >= 0 AND "email_otps"."attempts" <= 5)
);
--> statement-breakpoint
ALTER TABLE "email_otps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_email_otps_live" ON "email_otps" USING btree ("email") WHERE "email_otps"."consumed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "ix_email_otps_expiry" ON "email_otps" USING btree ("expires_at");
--> statement-breakpoint

-- ─── The sign-in path ───────────────────────────────────────────────────────
--
-- Sign-in happens before an actor exists, so none of it can be governed by a
-- policy. `email_otps` therefore has RLS enabled and NO policy at all — the
-- application cannot read or write it directly, only through the two functions
-- below.
--
-- That is deliberate. A table of live sign-in codes readable by request code
-- would be the single best thing to steal in the whole database.

-- Issue a code. Invalidates any live code for the address first, so a stolen
-- code cannot be held in reserve while the real owner requests another.
--
-- Returns nothing of use: the caller already knows the code, and anyone else
-- learns only that the call succeeded.
CREATE OR REPLACE FUNCTION app_issue_email_code(
  p_email       citext,
  p_code_hash   varchar,
  p_ip_hash     varchar,
  p_ttl_seconds int
) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE email_otps
     SET consumed_at = now()
   WHERE email = p_email AND consumed_at IS NULL;

  INSERT INTO email_otps (id, email, code_hash, ip_hash, expires_at)
  VALUES (gen_random_uuid(), p_email, p_code_hash, p_ip_hash,
          now() + make_interval(secs => p_ttl_seconds));
END;
$$;
--> statement-breakpoint

-- Redeem a code, find or create the account, and open a session — all in one
-- call, because every step of it needs privileges the caller does not have and
-- splitting them would mean exposing `users` and `sessions` to a request with
-- no actor.
--
-- Returns NULL for every failure mode: wrong code, expired code, too many
-- attempts, no code at all. The caller cannot tell which, and neither can an
-- attacker — the difference between "wrong code" and "no such account" is
-- exactly the information an enumeration attack is after.
--
-- A wrong guess increments `attempts`, and the fifth one spends the code. A
-- six-digit code is one in a million; without that counter it is brute-forced
-- in an afternoon.
CREATE OR REPLACE FUNCTION app_redeem_email_code(
  p_email        citext,
  p_code_hash    varchar,
  p_token_hash   varchar,
  p_user_agent   varchar,
  p_ip_hash      varchar,
  p_session_days int
) RETURNS TABLE (user_id uuid, is_new_account boolean)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_otp     email_otps%ROWTYPE;
  v_user    uuid;
  v_created boolean := false;
BEGIN
  SELECT * INTO v_otp
    FROM email_otps
   WHERE email = p_email AND consumed_at IS NULL
   FOR UPDATE;

  IF NOT FOUND OR v_otp.expires_at <= now() THEN
    RETURN;
  END IF;

  IF v_otp.code_hash <> p_code_hash THEN
    UPDATE email_otps
       SET attempts    = attempts + 1,
           consumed_at = CASE WHEN attempts + 1 >= 5 THEN now() ELSE NULL END
     WHERE id = v_otp.id;
    RETURN;
  END IF;

  UPDATE email_otps SET consumed_at = now() WHERE id = v_otp.id;

  SELECT u.id INTO v_user FROM users u
   WHERE u.email = p_email AND u.deleted_at IS NULL;

  IF v_user IS NULL THEN
    INSERT INTO users (id, email, name, email_verified_at)
    VALUES (gen_random_uuid(), p_email, split_part(p_email::text, '@', 1), now())
    RETURNING id INTO v_user;
    v_created := true;
  ELSE
    -- Redeeming a code proves the address. Recording it here means
    -- verification cannot drift from the only act that establishes it.
    UPDATE users
       SET email_verified_at = COALESCE(email_verified_at, now()),
           last_seen_at      = now()
     WHERE id = v_user;
  END IF;

  INSERT INTO sessions (id, user_id, token_hash, user_agent, ip_hash, expires_at)
  VALUES (gen_random_uuid(), v_user, p_token_hash, p_user_agent, p_ip_hash,
          now() + make_interval(days => p_session_days));

  RETURN QUERY SELECT v_user, v_created;
END;
$$;
--> statement-breakpoint

-- How many codes this address has been sent recently. The application layer
-- uses it to refuse a sixth in an hour, so that the endpoint cannot be turned
-- into a way to send somebody a hundred emails.
CREATE OR REPLACE FUNCTION app_recent_email_code_count(
  p_email   citext,
  p_minutes int
) RETURNS bigint
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT count(*) FROM email_otps
   WHERE email = p_email
     AND created_at > now() - make_interval(mins => p_minutes)
$$;
--> statement-breakpoint

-- Extend a live session on use, so an active user is not signed out every
-- thirty days. Separate from resolving one: resolution happens on every
-- request and must stay a read.
CREATE OR REPLACE FUNCTION app_touch_session(
  p_token_hash varchar,
  p_days       int
) RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  UPDATE sessions
     SET expires_at = now() + make_interval(days => p_days)
   WHERE token_hash = p_token_hash
     AND revoked_at IS NULL
     AND expires_at > now()
     AND expires_at < now() + make_interval(days => p_days) - interval '1 day'
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_issue_email_code(citext, varchar, varchar, int) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_redeem_email_code(citext, varchar, varchar, varchar, varchar, int) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_recent_email_code_count(citext, int) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_touch_session(varchar, int) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_issue_email_code(citext, varchar, varchar, int) TO mm_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_redeem_email_code(citext, varchar, varchar, varchar, varchar, int) TO mm_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_recent_email_code_count(citext, int) TO mm_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_touch_session(varchar, int) TO mm_app;
