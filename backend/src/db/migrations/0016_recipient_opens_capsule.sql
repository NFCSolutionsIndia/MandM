-- ─── Opening a capsule when you are nobody the system knows ────────────────
--
-- Hand-written; no schema change. Journal entry added alongside.
--
-- ═══════════════════════════════════════════════════════════════════════════
--  Row-level security asks "who are you?". The recipient's answer is nobody.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Every policy in this schema resolves through `app_current_user()`. The
-- person opening a capsule has no account, no session and no actor — they may
-- have been eleven years old when it was written, and the sender may be dead.
-- So every policy correctly refuses them, and the capsule written FOR them is
-- the one thing they cannot read.
--
-- `app_resolve_recipient` already answers "is this token good?". It does not
-- return the message, so the handler went on to read `capsules` through the
-- ordinary actor-scoped connection and got nothing back.
--
-- This function closes that gap the same way `app_post_reply` does: SECURITY
-- DEFINER, with the token as the entire credential, and the authorisation
-- decision made once, here, rather than by whichever handler calls it.
--
-- Three properties worth stating, because they are the reason this is a
-- function rather than a query in TypeScript:
--
--   1. It refuses any capsule that is not already `delivered` or `opened`, so
--      a token that leaks years early opens nothing. There is no window in
--      which an early holder can read ahead.
--
--   2. It records the opening in the SAME call that returns the content. A
--      read that forgot to record would quietly lose "she opened it on her
--      eighteenth birthday", which is the fact the sender will never get to
--      hear but which the family keeps.
--
--   3. `COALESCE` on both timestamps, so the FIRST opening is the one kept.
--      Overwriting on every refresh would replace that birthday morning with
--      "she last looked at it on a Tuesday".
--
-- Returns NULL for a bad token, an unknown token, and a capsule that has not
-- been delivered alike — one flat answer, so the holder of a bad token learns
-- nothing about a capsule they cannot see.

CREATE OR REPLACE FUNCTION app_open_capsule(p_token_hash varchar(64))
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_recipient uuid;
  v_capsule   uuid;
  v_result    jsonb;
BEGIN
  SELECT r.id, r.capsule_id
    INTO v_recipient, v_capsule
    FROM capsule_recipients r
    JOIN capsules c ON c.id = r.capsule_id
   WHERE r.access_token_hash = p_token_hash
     AND c.state IN ('delivered', 'opened');

  IF v_recipient IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE capsule_recipients
     SET opened_at = COALESCE(opened_at, now())
   WHERE id = v_recipient;

  UPDATE capsules
     SET state = 'opened',
         first_opened_at = COALESCE(first_opened_at, now())
   WHERE id = v_capsule
     AND state = 'delivered';

  SELECT jsonb_build_object(
           'id',            c.id,
           'title',         c.title,
           'note',          c.sender_note,
           'from',          u.name,
           'unlockAt',      c.unlock_at,
           'deliveredAt',   c.delivered_at,
           'firstOpenedAt', c.first_opened_at,
           'memories',      COALESCE(
             (SELECT jsonb_agg(
                       jsonb_build_object(
                         'id',                m.id,
                         'title',             m.title,
                         'note',              m.note,
                         'occurredAt',        m.occurred_at,
                         'occurredPrecision', m.occurred_precision
                       ) ORDER BY m.occurred_at)
                FROM capsule_memories cm
                JOIN memories m ON m.id = cm.memory_id
               WHERE cm.capsule_id = c.id),
             '[]'::jsonb)
         )
    INTO v_result
    FROM capsules c
    JOIN users u ON u.id = c.owner_id
   WHERE c.id = v_capsule;

  RETURN v_result;
END;
$$;
--> statement-breakpoint

-- The API role calls it; nothing else needs to.
GRANT EXECUTE ON FUNCTION app_open_capsule(varchar) TO mm_app;
