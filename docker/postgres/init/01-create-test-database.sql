-- Runs ONCE, when the mm-pgdata volume is first created.
--
-- The postgres image creates exactly one database (POSTGRES_DB, = mm_dev).
-- Integration tests need their own, because they truncate tables between runs
-- and must never be able to do that to development data.
--
-- To re-run this file: docker compose down -v && docker compose up -d
-- (`down` alone keeps the volume, so this will NOT run again.)

CREATE DATABASE mm_test
  WITH OWNER = postgres
       ENCODING = 'UTF8'
       LOCALE_PROVIDER = 'icu'
       ICU_LOCALE = 'en'
       TEMPLATE = template0;

COMMENT ON DATABASE mm_dev  IS 'Moments & Memories — local development';
COMMENT ON DATABASE mm_test IS 'Moments & Memories — integration tests. Truncated freely; never hold anything you want to keep.';

-- Extensions are NOT installed here.
--
-- `citext` and `pg_trgm` are installed by migration 0000, so that the migration
-- pipeline is the single thing that defines the schema — including the
-- extensions it depends on. Installing them here would mean a database built by
-- Docker and a database built by migrations differ, and the difference would
-- only show up on the environment that was not built by Docker: production.
