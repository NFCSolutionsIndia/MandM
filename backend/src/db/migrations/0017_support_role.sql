-- ─── The first console role, as data the pipeline owns ──────────────────────
--
-- Hand-written; no schema change. Journal entry added alongside.
--
-- `npm run admin -- grant` refuses a role that does not exist, rather than
-- creating one by accident. Correct — but `support` was only ever inserted by
-- hand on a developer machine, so a database built from the migrations alone
-- had no roles at all, and nobody could be granted the console. The first
-- server found it.
--
-- A role is reference data the product cannot run without, so it is defined
-- here like everything else a fresh database needs. Idempotent on purpose:
-- databases that already hold the hand-inserted row keep it unchanged, id and
-- all, so no admin_users row is orphaned.
--
-- `users:read` and nothing more. It lists accounts; it opens no vault — that
-- is `read_content`, and it stays behind break-glass.

INSERT INTO roles (id, name, description)
VALUES (uuid_generate_v7(), 'support', 'Account lookup. No access to content.')
ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint

INSERT INTO permissions (role_id, module, action)
SELECT id, 'users', 'read' FROM roles WHERE name = 'support'
ON CONFLICT DO NOTHING;
