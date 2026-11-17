-- ─── Username rules (BE-03) ─────────────────────────────────────────────────
--
-- Migration 0018 gave every account a handle. This one finishes the ticket:
--
--   • citext, so `Aarav.K` and `aarav.k` are one handle in the unique index;
--   • no `..`, and a trailing `_` is allowed (`aarav.k_`, the ticket's own
--     example) — only `.` is barred from the ends;
--   • reserved names, in ONE list: `app_username_reserved`;
--   • the name as a fallback source, for an account with no email (phone);
--   • `username_changed_at` and `app_change_username`, for D-5 = yes:
--     a user may choose a new handle at most once every N days.
--
-- (0018's header says "BE-05". It was BE-03; 0018 is applied, so it stays.)
--
-- Safe for the previous release: the column still reads back as a string,
-- and every function keeps its signature.

ALTER TABLE "users" DROP CONSTRAINT "ck_users_username";--> statement-breakpoint
-- Its WHEN clause names the column, which blocks the type change. Recreated
-- below; the migration is one transaction, so no insert ever sees it missing.
DROP TRIGGER trg_users_default_username ON users;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username" SET DATA TYPE citext USING "username"::citext;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username_changed_at" timestamp (3) with time zone;--> statement-breakpoint

-- ─── The reserved list ──────────────────────────────────────────────────────
--
-- The one place it lives. Compared with `.` and `_` removed, so `ad.min`,
-- `support_` and `m.m` are refused too — a handle that only LOOKS official
-- is the whole problem.
--
-- Not used in the CHECK constraint on purpose: growing this list must not
-- make existing rows invalid (a restore would fail on them). New handles are
-- checked against it by the generator and by app_change_username, which is
-- every way a handle is ever written.
CREATE FUNCTION app_username_reserved(p_username text)
  RETURNS boolean
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  SET search_path = public, pg_temp
AS $$
  SELECT regexp_replace(lower(p_username), '[._]', '', 'g') = ANY (ARRAY[
    -- the service and its staff
    'admin', 'administrator', 'admins', 'root', 'superuser', 'sysadmin', 'system',
    'support', 'help', 'helpdesk', 'staff', 'team', 'official', 'owner',
    'mod', 'moderator', 'moderators', 'security', 'abuse', 'privacy', 'legal',
    'mm', 'mandm', 'moments', 'memories', 'momentsandmemories', 'momentsmemories',
    -- infrastructure and mail
    'api', 'www', 'web', 'app', 'apps', 'mail', 'email', 'noreply', 'postmaster',
    'webmaster', 'hostmaster', 'status', 'dev', 'developer', 'docs', 'console',
    'dashboard',
    -- routes and product words a handle could be mistaken for
    'me', 'you', 'user', 'users', 'username', 'profile', 'account', 'accounts',
    'settings', 'about', 'contact', 'info', 'terms', 'tos', 'billing', 'payments',
    'login', 'logout', 'signin', 'signout', 'signup', 'register', 'auth', 'oauth',
    'verify', 'verified', 'vault', 'vaults', 'capsule', 'capsules', 'archive',
    'blog', 'news', 'press', 'careers', 'jobs', 'store', 'shop', 'download',
    -- words that are not a person
    'null', 'undefined', 'none', 'nobody', 'anonymous', 'everyone', 'all', 'here',
    'test', 'testing'
  ])
$$;
--> statement-breakpoint

-- ─── The generator ──────────────────────────────────────────────────────────
--
-- The email's local part, else the name, else nothing — lower-cased, spaces
-- to `.`, everything outside `a-z 0-9 . _` removed, `..` collapsed, separators
-- trimmed, at most 24 characters. Shorter than three and it becomes `user…`.
-- Reserved or taken, and random digits are appended until it is neither:
-- four digits for the first twenty tries, then six.
--
-- The advisory lock on each candidate is what makes concurrent sign-ups safe.
-- Without it, two transactions both see `aarav` free, both insert it, and one
-- sign-up dies on the unique index. With it, the second waits for the first
-- to commit, then sees `aarav` taken and moves on.
CREATE FUNCTION app_generate_username(p_email citext, p_name varchar)
  RETURNS varchar
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_base      text;
  v_candidate text;
  v_tries     int := 0;
BEGIN
  v_base := lower(COALESCE(
    NULLIF(split_part(COALESCE(p_email::text, ''), '@', 1), ''),
    p_name,
    ''));
  v_base := regexp_replace(v_base, '\s+', '.', 'g');
  v_base := regexp_replace(v_base, '[^a-z0-9._]', '', 'g');
  v_base := regexp_replace(v_base, '\.{2,}', '.', 'g');
  v_base := regexp_replace(v_base, '^[._]+', '', 'g');
  -- Leaves room for a six-digit suffix inside the 30-character limit.
  v_base := regexp_replace(left(v_base, 24), '[._]+$', '', 'g');

  IF length(v_base) < 3 THEN
    v_base := 'user' || v_base;
  END IF;

  v_candidate := v_base;
  LOOP
    IF NOT app_username_reserved(v_candidate) THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('username:' || v_candidate, 0));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM users u WHERE u.username = v_candidate::citext);
    END IF;

    v_tries := v_tries + 1;
    v_candidate := v_base || CASE
      WHEN v_tries <= 20 THEN (1000 + floor(random() * 9000))::int::text
      ELSE (100000 + floor(random() * 900000))::int::text
    END;
  END LOOP;

  RETURN v_candidate;
END;
$$;
--> statement-breakpoint

-- Kept for anything that still calls it by its 0018 name.
CREATE OR REPLACE FUNCTION app_username_for_email(p_email citext)
  RETURNS varchar
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT app_generate_username(p_email, NULL)
$$;
--> statement-breakpoint

-- The trigger that guarantees no account exists without a handle. It fires
-- inside the INSERT that app_redeem_email_code (and any later phone sign-up)
-- makes, so the handle is there before that function returns.
CREATE OR REPLACE FUNCTION app_users_default_username()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.username := app_generate_username(NEW.email, NEW.name);
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_users_default_username
  BEFORE INSERT ON users
  FOR EACH ROW
  WHEN (NEW.username IS NULL)
  EXECUTE FUNCTION app_users_default_username();
--> statement-breakpoint

-- ─── Existing handles the new rules refuse ──────────────────────────────────
--
-- `..`, or reserved. Oldest first, each re-generated, and each change
-- recorded — somebody whose handle moved deserves to be able to find out why.
DO $$
DECLARE
  r     record;
  v_new varchar;
BEGIN
  FOR r IN
    SELECT id, email, name, username FROM users
     WHERE position('..' in username::text) > 0
        OR app_username_reserved(username::text)
     ORDER BY created_at, id
  LOOP
    v_new := app_generate_username(r.email, r.name);
    UPDATE users SET username = v_new WHERE id = r.id;
    INSERT INTO audit_logs (id, actor_type, actor_id, action, resource_type, resource_id, metadata)
    VALUES (uuid_generate_v7(), 'system', NULL, 'user.username_reassigned', 'user', r.id,
            jsonb_build_object('old', r.username::text, 'new', v_new,
                               'reason', 'migration 0021: reserved or contains ..'));
  END LOOP;
END;
$$;
--> statement-breakpoint

ALTER TABLE "users" ADD CONSTRAINT "ck_users_username" CHECK ("users"."username"::text ~ '^[a-z0-9_][a-z0-9._]{1,28}[a-z0-9_]$' AND position('..' in "users"."username"::text) = 0);--> statement-breakpoint

-- ─── Is this handle free? ───────────────────────────────────────────────────
--
-- SECURITY DEFINER for the same reason as the generator: under row-level
-- security a request sees only itself, and would call every handle free.
-- What it reveals — that a handle is in use — is public by nature.
--
-- `yours` when it is the caller's own: keeping your handle is always allowed.
-- Format is the API's job (and the CHECK constraint's); this answers only
-- for well-formed names.
CREATE FUNCTION app_username_status(p_username citext)
  RETURNS varchar
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN app_username_reserved(p_username::text) THEN 'reserved'
    WHEN EXISTS (SELECT 1 FROM users u
                  WHERE u.username = p_username AND u.id = app_current_user()) THEN 'yours'
    WHEN EXISTS (SELECT 1 FROM users u WHERE u.username = p_username) THEN 'taken'
    ELSE 'available'
  END
$$;
--> statement-breakpoint

-- ─── Choosing a handle (D-5) ────────────────────────────────────────────────
--
-- For the signed-in user only — there is no user id parameter to forge.
--
--   • the same handle (any case)  → returned unchanged, changed = false,
--                                   and the cooldown is NOT spent;
--   • reserved                    → SQLSTATE MMU01;
--   • inside the cooldown         → SQLSTATE MMU02, DETAIL = when it ends;
--   • taken                       → 23505 from the unique index;
--   • malformed                   → 23514 from the CHECK constraint.
--
-- Every change is audit-logged with the old and new handle.
CREATE FUNCTION app_change_username(p_username citext, p_cooldown_days int)
  RETURNS TABLE (username varchar, changed boolean, changed_at timestamptz)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := app_current_user();
  v_row  users%ROWTYPE;
  v_new  text := lower(p_username::text);
  v_next    timestamptz;
  v_changed timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'app_change_username requires a user' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM users u
   WHERE u.id = v_user AND u.deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no such user' USING ERRCODE = '42501';
  END IF;

  IF v_row.username = v_new::citext THEN
    RETURN QUERY SELECT v_row.username::varchar, false, v_row.username_changed_at;
    RETURN;
  END IF;

  IF app_username_reserved(v_new) THEN
    RAISE EXCEPTION 'username is reserved' USING ERRCODE = 'MMU01';
  END IF;

  v_next := v_row.username_changed_at + make_interval(days => p_cooldown_days);
  IF v_next IS NOT NULL AND v_next > now() THEN
    RAISE EXCEPTION 'username changed too recently'
      USING ERRCODE = 'MMU02',
            DETAIL  = to_char(v_next AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  END IF;

  -- Same lock as the generator, so a sign-up cannot be handed this name
  -- between our check and our commit.
  PERFORM pg_advisory_xact_lock(hashtextextended('username:' || v_new, 0));

  -- RETURNING the stored value, which is rounded to milliseconds: what the
  -- client is told must be exactly what the cooldown is computed from.
  UPDATE users u
     SET username = v_new, username_changed_at = now()
   WHERE u.id = v_user
  RETURNING u.username_changed_at INTO v_changed;

  INSERT INTO audit_logs (id, actor_type, actor_id, action, resource_type, resource_id, metadata)
  VALUES (uuid_generate_v7(), 'user', v_user, 'user.username_changed', 'user', v_user,
          jsonb_build_object('old', v_row.username::text, 'new', v_new));

  RETURN QUERY SELECT v_new::varchar, true, v_changed;
END;
$$;
--> statement-breakpoint

-- ─── Sign-in and refresh, re-declared ───────────────────────────────────────
--
-- Unchanged from 0019 except `u.username::varchar`: both declare a varchar
-- result column, and the column is citext now.

CREATE OR REPLACE FUNCTION app_redeem_email_code(
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
    SELECT u.id, v_created, u.username::varchar, u.name, v_access, v_refresh
      FROM users u WHERE u.id = v_user;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_refresh_session(
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
    SELECT u.id, u.username::varchar, u.name, v_access, v_refresh
      FROM users u WHERE u.id = v_session.user_id;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_username_reserved(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_generate_username(citext, varchar) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_username_status(citext) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_change_username(citext, int) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_username_reserved(text) TO mm_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_username_status(citext) TO mm_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_change_username(citext, int) TO mm_app;
