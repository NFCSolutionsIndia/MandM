-- ─── The grants migration 0011 missed ──────────────────────────────────────
--
-- Hand-written; no schema change. Journal entry added alongside.
--
-- ═══════════════════════════════════════════════════════════════════════════
--  A policy belonging to another role is still EVALUATED for yours.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Every policy written before migration 0011 applies to PUBLIC, which includes
-- `mm_worker` and `mm_admin`. PostgreSQL ORs permissive policies together, so
-- those older policies are evaluated for the new roles as well — and the first
-- thing most of them do is call `app_vault_role()`.
--
-- EXECUTE on those helpers was granted only to `mm_app`. So the new roles did
-- not quietly get `false` from a policy that was not theirs; they got
--
--     ERROR: permission denied for function app_vault_role
--
-- on any query touching `memories`, `albums`, `capsules` or half a dozen other
-- tables. The policies in 0011 were correct and unreachable.
--
-- The lesson generalises: **a role needs EXECUTE on every function used by any
-- policy on a table it touches, not merely by its own policies.** A new role
-- added later will need this same block.

GRANT EXECUTE ON FUNCTION app_vault_role(uuid)          TO mm_worker, mm_admin;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_is_vault_owner(uuid)      TO mm_worker, mm_admin;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_shares_vault(uuid)        TO mm_worker, mm_admin;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_owns_event(uuid)          TO mm_worker, mm_admin;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_owns_member(uuid)         TO mm_worker, mm_admin;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_memory_vault(uuid)        TO mm_worker, mm_admin;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_album_vault(uuid)         TO mm_worker, mm_admin;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_capsule_vault(uuid)       TO mm_worker, mm_admin;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_owns_capsule(uuid)        TO mm_worker, mm_admin;
