-- ─── Access token + refresh token + idle logout ─────────────────────────────
--
-- One 30-day token, extended on every use, becomes two:
--
--   access   ACCESS_TOKEN_HOURS (24)   sent on every request
--   refresh  REFRESH_TOKEN_DAYS (30)   sent only to POST /auth/refresh,
--                                      exchanged for a new pair each time
--
-- and a session with no request and no refresh for SESSION_IDLE_DAYS (7) is
-- over, whichever token is presented.
--
-- Still opaque rows rather than JWTs (decision D-2): revocation has to take
-- effect on the very next request. Rolling refresh (decision D-1): each
-- refresh pushes the refresh expiry out again, so somebody who opens the app
-- every day is never signed out.
--
-- Durations live in config/env.schema.ts and arrive here as arguments. Nothing
-- in SQL hard-codes them, apart from the one-hour throttle on last_active_at.

-- ─── Columns ────────────────────────────────────────────────────────────────
--
-- Added nullable, backfilled, then tightened: the table is not empty.

ALTER TABLE "sessions" ADD COLUMN "access_token_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "access_expires_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "refresh_token_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "refresh_expires_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "last_active_at" timestamp (3) with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "rotated_at" timestamp (3) with time zone;--> statement-breakpoint

-- Sessions that already exist were issued as one 30-day token, and the client
-- holding it knows nothing about refreshing.
--
--   * That token keeps working as an ACCESS token for at most one more day,
--     so nobody is signed out mid-session by the deploy.
--   * Its refresh hash is the digest of a random value nobody was ever given.
--     It cannot be refreshed, so after that day the client gets a 401 and
--     signs in again — through the new /auth/verify, which it must speak by
--     then anyway.
UPDATE "sessions"
   SET "access_token_hash"  = "token_hash",
       "access_expires_at"  = LEAST("expires_at", now() + interval '24 hours'),
       "refresh_token_hash" = encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'),
       "refresh_expires_at" = "expires_at",
       "last_active_at"     = now();--> statement-breakpoint

ALTER TABLE "sessions" ALTER COLUMN "access_token_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "access_expires_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "refresh_token_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "refresh_expires_at" SET NOT NULL;--> statement-breakpoint

DROP INDEX "ux_sessions_token";--> statement-breakpoint
DROP INDEX "ix_sessions_user_live";--> statement-breakpoint
CREATE UNIQUE INDEX "ux_sessions_access_token" ON "sessions" USING btree ("access_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_sessions_refresh_token" ON "sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "ix_sessions_user_live" ON "sessions" USING btree ("user_id","refresh_expires_at") WHERE "sessions"."revoked_at" IS NULL;--> statement-breakpoint

-- The old functions read these two, so they go first.
DROP FUNCTION app_resolve_session(varchar);--> statement-breakpoint
DROP FUNCTION app_touch_session(varchar, int);--> statement-breakpoint
DROP FUNCTION app_redeem_email_code(citext, varchar, varchar, varchar, varchar, int);--> statement-breakpoint

ALTER TABLE "sessions" DROP COLUMN "token_hash";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "expires_at";--> statement-breakpoint

-- ─── Retired refresh tokens ─────────────────────────────────────────────────
--
-- A refresh token works once. Seeing one again means two parties hold it, and
-- there is no telling which is the user — so the session is revoked and both
-- must sign in again. Recognising "again" needs the old hashes, which
-- `sessions` overwrites; they are kept here.
--
-- RLS on, NO policy: only app_refresh_session ever touches it.

CREATE TABLE "retired_refresh_tokens" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"retired_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "retired_refresh_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "retired_refresh_tokens" ADD CONSTRAINT "retired_refresh_tokens_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_retired_refresh_tokens_session" ON "retired_refresh_tokens" USING btree ("session_id");--> statement-breakpoint

-- ─── Resolve: ACCESS tokens only ────────────────────────────────────────────
--
-- Still the one query that legitimately runs with no actor, and still a read.
-- A refresh token presented as a bearer finds nothing: it lives in a
-- different column.
CREATE FUNCTION app_resolve_session(
  p_access_hash varchar,
  p_idle_days   int
) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT s.user_id
    FROM sessions s
   WHERE s.access_token_hash = p_access_hash
     AND s.revoked_at IS NULL
     AND s.access_expires_at > now()
     AND s.last_active_at    > now() - make_interval(days => p_idle_days)
$$;
--> statement-breakpoint

-- ─── Touch: activity, at most once an hour ──────────────────────────────────
--
-- No longer extends anything — the 30-day extension is gone. It only records
-- that the session is in use, and only when the last record is over an hour
-- old, so a busy client costs one write an hour rather than one per request.
CREATE FUNCTION app_touch_session(p_access_hash varchar)
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  UPDATE sessions
     SET last_active_at = now()
   WHERE access_token_hash = p_access_hash
     AND revoked_at IS NULL
     AND access_expires_at > now()
     AND last_active_at < now() - interval '1 hour'
$$;
--> statement-breakpoint

-- ─── Sign-in: now opens a session with both tokens ──────────────────────────
--
-- Unchanged from migration 0010 up to the INSERT. Also returns what the
-- response needs about the user, because a caller with no actor yet cannot
-- read `users` itself.
CREATE FUNCTION app_redeem_email_code(
  p_email         citext,
  p_code_hash     varchar,
  p_access_hash   varchar,
  p_refresh_hash  varchar,
  p_user_agent    varchar,
  p_ip_hash       varchar,
  p_access_hours  int,
  p_refresh_days  int
) RETURNS TABLE (
  user_id            uuid,
  is_new_account     boolean,
  username           varchar,
  name               varchar,
  access_expires_at  timestamptz,
  refresh_expires_at timestamptz
)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_otp     email_otps%ROWTYPE;
  v_user    uuid;
  v_created boolean := false;
  v_access  timestamptz := now() + make_interval(hours => p_access_hours);
  v_refresh timestamptz := now() + make_interval(days => p_refresh_days);
BEGIN
  SELECT * INTO v_otp
    FROM email_otps o
   WHERE o.email = p_email AND o.consumed_at IS NULL
   FOR UPDATE;

  IF NOT FOUND OR v_otp.expires_at <= now() THEN
    RETURN;
  END IF;

  IF v_otp.code_hash <> p_code_hash THEN
    UPDATE email_otps o
       SET attempts    = o.attempts + 1,
           consumed_at = CASE WHEN o.attempts + 1 >= 5 THEN now() ELSE NULL END
     WHERE o.id = v_otp.id;
    RETURN;
  END IF;

  UPDATE email_otps o SET consumed_at = now() WHERE o.id = v_otp.id;

  SELECT u.id INTO v_user FROM users u
   WHERE u.email = p_email AND u.deleted_at IS NULL;

  IF v_user IS NULL THEN
    INSERT INTO users (id, email, name, email_verified_at)
    VALUES (uuid_generate_v7(), p_email, split_part(p_email::text, '@', 1), now())
    RETURNING id INTO v_user;
    v_created := true;
  ELSE
    UPDATE users u
       SET email_verified_at = COALESCE(u.email_verified_at, now()),
           last_seen_at      = now()
     WHERE u.id = v_user;
  END IF;

  INSERT INTO sessions (id, user_id, access_token_hash, access_expires_at,
                        refresh_token_hash, refresh_expires_at, last_active_at,
                        user_agent, ip_hash)
  VALUES (uuid_generate_v7(), v_user, p_access_hash, v_access,
          p_refresh_hash, v_refresh, now(),
          p_user_agent, p_ip_hash);

  RETURN QUERY
    SELECT u.id, v_created, u.username, u.name, v_access, v_refresh
      FROM users u WHERE u.id = v_user;
END;
$$;
--> statement-breakpoint

-- ─── Refresh: one use per token, and a second use is theft ──────────────────
--
-- Exchanges a live refresh token for a new access token AND a new refresh
-- token. The old access token stops working too — its hash is overwritten.
--
-- Returns no row for every failure — expired, idle, revoked, unknown, reused —
-- so the endpoint can answer with one flat 401, as every other auth failure
-- does.
--
-- A token found in `retired_refresh_tokens` has been used before. The session
-- it belonged to is revoked before returning, and that UPDATE commits: the
-- function is called as its own statement, not inside a transaction that the
-- 401 would roll back.
--
-- FOR UPDATE serialises two refreshes of the same token. The second waits,
-- then finds the hash gone from `sessions` and present in the retired table,
-- and is treated as a reuse. A client must therefore refresh single-flight.
CREATE FUNCTION app_refresh_session(
  p_refresh_hash     varchar,
  p_new_access_hash  varchar,
  p_new_refresh_hash varchar,
  p_access_hours     int,
  p_refresh_days     int,
  p_idle_days        int
) RETURNS TABLE (
  user_id            uuid,
  username           varchar,
  name               varchar,
  access_expires_at  timestamptz,
  refresh_expires_at timestamptz
)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_session sessions%ROWTYPE;
  v_reused  uuid;
  v_access  timestamptz := now() + make_interval(hours => p_access_hours);
  v_refresh timestamptz := now() + make_interval(days => p_refresh_days);
BEGIN
  SELECT * INTO v_session
    FROM sessions s
   WHERE s.refresh_token_hash = p_refresh_hash
   FOR UPDATE;

  IF NOT FOUND THEN
    SELECT r.session_id INTO v_reused
      FROM retired_refresh_tokens r
     WHERE r.token_hash = p_refresh_hash;

    IF v_reused IS NOT NULL THEN
      UPDATE sessions s
         SET revoked_at = now()
       WHERE s.id = v_reused AND s.revoked_at IS NULL;
    END IF;

    RETURN;
  END IF;

  IF v_session.revoked_at IS NOT NULL
     OR v_session.refresh_expires_at <= now()
     OR v_session.last_active_at <= now() - make_interval(days => p_idle_days) THEN
    RETURN;
  END IF;

  INSERT INTO retired_refresh_tokens (token_hash, session_id)
  VALUES (p_refresh_hash, v_session.id);

  UPDATE sessions s
     SET access_token_hash  = p_new_access_hash,
         access_expires_at  = v_access,
         refresh_token_hash = p_new_refresh_hash,
         refresh_expires_at = v_refresh,
         last_active_at     = now(),
         rotated_at         = now()
   WHERE s.id = v_session.id;

  RETURN QUERY
    SELECT u.id, u.username, u.name, v_access, v_refresh
      FROM users u WHERE u.id = v_session.user_id;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_resolve_session(varchar, int) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_touch_session(varchar) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_redeem_email_code(citext, varchar, varchar, varchar, varchar, varchar, int, int) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_refresh_session(varchar, varchar, varchar, int, int, int) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_resolve_session(varchar, int) TO mm_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_touch_session(varchar) TO mm_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_redeem_email_code(citext, varchar, varchar, varchar, varchar, varchar, int, int) TO mm_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_refresh_session(varchar, varchar, varchar, int, int, int) TO mm_app;
