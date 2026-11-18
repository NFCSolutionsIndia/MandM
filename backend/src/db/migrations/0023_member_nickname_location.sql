-- What the user calls a person ("Mom") and where they live ("Austin, TX").
--
-- The Home, Search and Calendar designs show both: "Mom's birthday" over
-- "Linda Carter · Austin, TX". Both nullable and free text. No backfill: a
-- person without a nickname is shown by name, exactly as before.
--
-- Additive only. Row-level security on `members` (members_own) already covers
-- new columns, and mm_app's table grant is column-agnostic.
ALTER TABLE "members" ADD COLUMN "nickname" varchar(64);--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "location" varchar(120);
