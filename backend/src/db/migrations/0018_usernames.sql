-- ─── Usernames (BE-05) ──────────────────────────────────────────────────────
--
-- Every account gets a public handle — `aarav.k` — distinct from the email,
-- which is private and must never appear where another person can see it.
--
-- Added in three steps rather than one `ADD COLUMN ... NOT NULL`, because the
-- table is not empty: nullable, backfill, then the constraint.

ALTER TABLE "users" ADD COLUMN "username" varchar(30);
--> statement-breakpoint

-- A free handle derived from an email address.
--
-- The local part, lower-cased, with everything outside `a-z 0-9 . _` removed
-- and separators trimmed from both ends; shorter than three characters and it
-- becomes `user…`. If the result is taken, four random digits are appended
-- until it is not.
--
-- SECURITY DEFINER because uniqueness is a question about EVERY user, and a
-- request under row-level security can only see itself — it would happily
-- pick a handle that somebody it cannot see already holds.
CREATE OR REPLACE FUNCTION app_username_for_email(p_email citext)
  RETURNS varchar
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_base      varchar;
  v_candidate varchar;
BEGIN
  v_base := regexp_replace(lower(split_part(p_email::text, '@', 1)), '[^a-z0-9._]', '', 'g');
  -- Leaves room for a four-digit suffix inside the 30-character limit.
  v_base := left(v_base, 24);
  v_base := regexp_replace(v_base, '^[._]+|[._]+$', '', 'g');

  IF length(v_base) < 3 THEN
    v_base := 'user' || v_base;
    v_base := regexp_replace(v_base, '[._]+$', '', 'g');
  END IF;

  v_candidate := v_base;
  WHILE EXISTS (SELECT 1 FROM users WHERE username = v_candidate) LOOP
    v_candidate := v_base || (1000 + floor(random() * 9000))::int::text;
  END LOOP;

  RETURN v_candidate;
END;
$$;
--> statement-breakpoint

-- Every path that creates a user — sign-in, seeds, the test suites — gets a
-- handle without having to know how one is made.
CREATE OR REPLACE FUNCTION app_users_default_username()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.username := app_username_for_email(NEW.email);
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

-- Oldest accounts first, so when two addresses share a local part the
-- earlier one keeps the plain handle.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id, email FROM users WHERE username IS NULL ORDER BY created_at, id LOOP
    UPDATE users SET username = app_username_for_email(r.email) WHERE id = r.id;
  END LOOP;
END;
$$;
--> statement-breakpoint

ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "ux_users_username" ON "users" USING btree ("username");
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "ck_users_username" CHECK ("users"."username" ~ '^[a-z0-9][a-z0-9._]{1,28}[a-z0-9]$');
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_username_for_email(citext) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_users_default_username() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_username_for_email(citext) TO mm_app;
