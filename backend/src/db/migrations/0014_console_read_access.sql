-- ─── What the console may read for its dashboard ────────────────────────────
--
-- Hand-written; no schema change. Journal entry added alongside.
--
-- The dashboard needs delivery metrics, the job queue and the unlock load.
-- `mm_admin` had table privileges on all three from the blanket GRANT in 0011
-- and **no row policy on any of them**, so every figure would have rendered as
-- zero.
--
-- Adding the policies naively would have opened something that must not open:
--
--     SELECT has_column_privilege('mm_admin','capsules','sender_note','SELECT')
--      → true
--
-- ═══════════════════════════════════════════════════════════════════════════
--  Counting capsules is operations. Reading one is somebody's last letter.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A row policy cannot express that difference — it admits or denies whole
-- rows. **Column-level privileges can**, so the console's access to `capsules`
-- is granted column by column, and the message is simply not among them.
--
-- The console can therefore answer "1,284 due today" and "one is overdue, here
-- is its id" while being unable to select what any of them say. Content stays
-- behind break-glass, where `app_admin_may_read_content()` already governs
-- `memories` and `media_assets`.

REVOKE SELECT, INSERT, UPDATE ON capsules FROM mm_admin;
--> statement-breakpoint

-- Operational columns only. `title`, `sender_note` and `milestone_spec` are
-- deliberately absent: those are the promise itself.
GRANT SELECT (
  id, vault_id, owner_id, state, unlock_kind, unlock_at, unlock_timezone,
  milestone_member_id, sealed_at, editable_until, delivered_at,
  first_opened_at, cancelled_at, created_at, updated_at
) ON capsules TO mm_admin;
--> statement-breakpoint

-- Recipients: the same distinction. The console may see that a delivery is
-- addressed and whether it arrived; it may not harvest the address book.
REVOKE SELECT, INSERT, UPDATE ON capsule_recipients FROM mm_admin;
--> statement-breakpoint

GRANT SELECT (
  id, capsule_id, vault_id, member_id, preferred_channel, token_version,
  delivered_at, opened_at, last_verified_at, created_at, updated_at
) ON capsule_recipients TO mm_admin;
--> statement-breakpoint

-- Delivery attempts and jobs are operational through and through: a provider,
-- a status, an error code, a timestamp. Nothing a family wrote.
REVOKE INSERT, UPDATE ON delivery_attempts, scheduled_jobs FROM mm_admin;
--> statement-breakpoint

-- ─── Row policies ───────────────────────────────────────────────────────────
--
-- Read-only, all of them. The console reports on the delivery engine and does
-- not operate it: requeuing a job or retrying a send is an action with its own
-- audit trail, and it will go through a function when it is built rather than
-- through a blanket UPDATE policy added now "in case".

CREATE POLICY capsules_admin_ops ON capsules FOR SELECT TO mm_admin
  USING (true);
--> statement-breakpoint

CREATE POLICY recipients_admin_ops ON capsule_recipients FOR SELECT TO mm_admin
  USING (true);
--> statement-breakpoint

CREATE POLICY attempts_admin_ops ON delivery_attempts FOR SELECT TO mm_admin
  USING (true);
--> statement-breakpoint

CREATE POLICY jobs_admin_ops ON scheduled_jobs FOR SELECT TO mm_admin
  USING (true);
--> statement-breakpoint

-- Counts for the moderation and upload panels. `upload_sessions` is a user's
-- own in-flight upload; the console sees that one is stuck, not what is in it.
CREATE POLICY uploads_admin_ops ON upload_sessions FOR SELECT TO mm_admin
  USING (true);
--> statement-breakpoint

REVOKE SELECT ON upload_sessions FROM mm_admin;
--> statement-breakpoint

GRANT SELECT (
  id, user_id, intended_memory_id, bytes_total, bytes_received,
  storage_upload_id, status, expires_at, created_at, updated_at
) ON upload_sessions TO mm_admin;
--> statement-breakpoint

-- `media_assets` already sits behind break-glass, but the media pipeline panel
-- needs a count of what is transcoding. One narrow function answers exactly
-- that and nothing else — it returns numbers, never a row.
CREATE OR REPLACE FUNCTION app_admin_media_pipeline()
  RETURNS TABLE (pending bigint, processing bigint, failed bigint)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT count(*) FILTER (WHERE transcode_status = 'pending'),
         count(*) FILTER (WHERE transcode_status = 'processing'),
         count(*) FILTER (WHERE transcode_status = 'failed')
  FROM media_assets
  WHERE deleted_at IS NULL
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_admin_media_pipeline() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_admin_media_pipeline() TO mm_admin;
