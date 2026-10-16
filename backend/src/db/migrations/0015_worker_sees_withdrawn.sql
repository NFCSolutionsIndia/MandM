-- ─── The worker must be able to see a promise that was withdrawn ────────────
--
-- Hand-written; no schema change. Journal entry added alongside.
--
-- ═══════════════════════════════════════════════════════════════════════════
--  A policy that is too narrow fails in the same direction as no policy at
--  all: silently, and in production.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `capsules_worker` from migration 0011 admitted only
--
--     state IN ('sealed', 'delivering', 'delivered')
--
-- which was deliberate: the delivery engine has no business reading a draft
-- somebody is still writing. But it also made a **cancelled** capsule
-- invisible to the worker — and the worker still has a job row pointing at it,
-- because cancelling a capsule does not delete its scheduled delivery.
--
-- So the handler read zero rows and could not tell "this promise was
-- withdrawn" from "this capsule has no recipients". It raised, the job
-- retried, and after five days of backoff it would have gone `dead` — which
-- for `capsule_delivery` is a Sev-0 page, at 3am, for a capsule the owner
-- cancelled on purpose weeks earlier.
--
-- Caught by a test asserting the job completes quietly. `cancelled` and
-- `failed` are now visible: the engine can read that there is nothing to do
-- and say so, instead of inferring it from an empty result.
--
-- `draft` remains invisible, which was the point of the original policy.

DROP POLICY capsules_worker ON capsules;
--> statement-breakpoint

CREATE POLICY capsules_worker ON capsules FOR SELECT TO mm_worker
  USING (state IN ('sealed', 'delivering', 'delivered', 'cancelled', 'failed'));
--> statement-breakpoint

-- The same reasoning for the memories a capsule carries. A cancelled capsule's
-- memories need not be readable — nothing will be sent — so that policy is
-- left as it is. Narrow is correct there; it was only wrong where the engine
-- had to make a decision from what it could see.
--
-- Recipients, though, are read in the same query as the capsule state, so the
-- worker needs them for a cancelled capsule too.
DROP POLICY recipients_worker ON capsule_recipients;
--> statement-breakpoint

CREATE POLICY recipients_worker ON capsule_recipients FOR SELECT TO mm_worker
  USING (
    EXISTS (
      SELECT 1 FROM capsules c
      WHERE c.id = capsule_recipients.capsule_id
        AND c.state IN ('sealed', 'delivering', 'delivered', 'cancelled', 'failed')
    )
  );
