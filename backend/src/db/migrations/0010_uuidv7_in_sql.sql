-- ─── UUIDv7 on the SQL side ─────────────────────────────────────────────────
--
-- Hand-written. There is no schema change here, so drizzle-kit generates
-- nothing; the journal entry was added by hand alongside this file.
--
-- ═══════════════════════════════════════════════════════════════════════════
--  The bug this fixes: rows created INSIDE a SQL function got v4 ids.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `uuidPk()` declares application-generated UUIDv7 and `$defaultFn()` supplies
-- it — but only for inserts that go through Drizzle. The SECURITY DEFINER
-- functions insert directly, and they used `gen_random_uuid()`, which is v4.
--
-- Four tables were affected: `users`, `sessions`, `email_otps` and
-- `capsule_replies`. Two of them are the highest-insert-rate tables in the
-- product, and they are exactly where the argument for v7 lives: a random key
-- lands in a random page of the index and fragments it, while a time-ordered
-- one keeps inserts at the right-hand edge of the B-tree.
--
-- Caught by reading an id returned from a real sign-in, which no test had
-- asserted on. There is now a test that does.

-- PostgreSQL 18 ships `uuidv7()`. This is 17, so the function is ours.
--
-- The shape: 48 bits of Unix milliseconds, then the version nibble, then
-- random. Built by overwriting the first six bytes of a v4 uuid with the
-- timestamp and rewriting the version nibble — which leaves byte 8 untouched,
-- so the variant bits `gen_random_uuid()` already set stay correct.
CREATE OR REPLACE FUNCTION uuid_generate_v7() RETURNS uuid
  LANGUAGE plpgsql VOLATILE
  SET search_path = pg_catalog
AS $$
DECLARE
  v_bytes bytea;
BEGIN
  v_bytes := uuid_send(gen_random_uuid());

  -- Bytes 0-5: milliseconds since the epoch, big-endian. int8send gives 8
  -- bytes; the low 6 are the ones that matter for the next 8,900 years.
  v_bytes := overlay(
    v_bytes
    placing substring(
      int8send((extract(epoch FROM clock_timestamp()) * 1000)::bigint)
      FROM 3 FOR 6
    )
    FROM 1 FOR 6
  );

  -- Byte 6, high nibble: the version. 0111 = 7.
  v_bytes := set_byte(
    v_bytes, 6,
    (b'0111' || substring(get_byte(v_bytes, 6)::bit(8) FROM 5))::bit(8)::int
  );

  RETURN encode(v_bytes, 'hex')::uuid;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION uuid_generate_v7() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION uuid_generate_v7() TO mm_app;
--> statement-breakpoint

-- ─── The four functions that insert, corrected ──────────────────────────────
--
-- CREATE OR REPLACE rather than editing migrations 0005 and 0009: those have
-- been applied, and drizzle-kit records a hash of each file. Changing an
-- applied migration makes it look unapplied and the next `db:migrate` tries to
-- run it again.

CREATE OR REPLACE FUNCTION app_post_reply(
  p_token_hash varchar,
  p_body       text,
  p_media      uuid DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_recipient uuid;
  v_capsule   uuid;
  v_reply     uuid;
BEGIN
  SELECT r.id, r.capsule_id INTO v_recipient, v_capsule
  FROM capsule_recipients r
  JOIN capsules c ON c.id = r.capsule_id
  WHERE r.access_token_hash = p_token_hash
    AND c.state IN ('delivered', 'opened');

  IF v_recipient IS NULL THEN
    RAISE EXCEPTION 'no deliverable capsule for that token'
      USING ERRCODE = '42501';
  END IF;

  IF p_body IS NULL AND p_media IS NULL THEN
    RAISE EXCEPTION 'a reply needs a body or an attachment'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO capsule_replies (id, capsule_id, recipient_id, body, media_asset_id)
  VALUES (uuid_generate_v7(), v_capsule, v_recipient, p_body, p_media)
  RETURNING id INTO v_reply;

  UPDATE capsule_recipients
     SET opened_at = COALESCE(opened_at, now())
   WHERE id = v_recipient;

  UPDATE capsules
     SET first_opened_at = COALESCE(first_opened_at, now()),
         state           = 'opened'
   WHERE id = v_capsule AND state = 'delivered';

  RETURN v_reply;
END;
$$;
--> statement-breakpoint

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
  VALUES (uuid_generate_v7(), p_email, p_code_hash, p_ip_hash,
          now() + make_interval(secs => p_ttl_seconds));
END;
$$;
--> statement-breakpoint

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
    VALUES (uuid_generate_v7(), p_email, split_part(p_email::text, '@', 1), now())
    RETURNING id INTO v_user;
    v_created := true;
  ELSE
    UPDATE users
       SET email_verified_at = COALESCE(email_verified_at, now()),
           last_seen_at      = now()
     WHERE id = v_user;
  END IF;

  INSERT INTO sessions (id, user_id, token_hash, user_agent, ip_hash, expires_at)
  VALUES (uuid_generate_v7(), v_user, p_token_hash, p_user_agent, p_ip_hash,
          now() + make_interval(days => p_session_days));

  RETURN QUERY SELECT v_user, v_created;
END;
$$;
