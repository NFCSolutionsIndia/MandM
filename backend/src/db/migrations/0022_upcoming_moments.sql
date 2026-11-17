-- ─── Upcoming moments (BE-06) ───────────────────────────────────────────────
--
-- Date arithmetic for the Home screen's "next 5 moments", kept in the
-- database so one query can rank capsules, birthdays, anniversaries and
-- events together and stop at the fifth.
--
-- Functions only. No index: the query reads one owner's rows through the
-- existing owner indexes (ix_members_owner_name, ix_events_owner_date,
-- ix_capsules_owner_pending); EXPLAIN in test/moments.e2e-spec.ts checks it.

-- `p_date`'s month and day in year `p_year`. A day the month does not have
-- falls on its last day — so 29 February is 28 February in a common year.
CREATE FUNCTION app_date_in_year(p_date date, p_year int)
  RETURNS date
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  SET search_path = public, pg_temp
AS $$
  SELECT make_date(
    p_year,
    extract(month FROM p_date)::int,
    LEAST(
      extract(day FROM p_date)::int,
      extract(day FROM make_date(p_year, extract(month FROM p_date)::int, 1)
                       + interval '1 month - 1 day')::int))
$$;
--> statement-breakpoint

-- `p_date`'s day in the month of `p_month` (any date in that month), clipped
-- to the month's last day: the 31st of every month is the 30th in April.
CREATE FUNCTION app_date_in_month(p_date date, p_month date)
  RETURNS date
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  SET search_path = public, pg_temp
AS $$
  SELECT (date_trunc('month', p_month)::date
          + (LEAST(extract(day FROM p_date)::int,
                   extract(day FROM date_trunc('month', p_month) + interval '1 month - 1 day')::int)
             - 1))
$$;
--> statement-breakpoint

-- The first occurrence of a dated thing on or after `p_today`, or NULL if it
-- has none. `p_recurrence` is events.recurrence: none | yearly | monthly.
-- A recurring thing never occurs before its own first date.
CREATE FUNCTION app_next_occurrence(p_date date, p_recurrence varchar, p_today date)
  RETURNS date
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_date IS NULL OR p_today IS NULL THEN NULL
    WHEN p_date >= p_today THEN p_date
    WHEN p_recurrence = 'yearly' THEN
      CASE WHEN app_date_in_year(p_date, extract(year FROM p_today)::int) >= p_today
           THEN app_date_in_year(p_date, extract(year FROM p_today)::int)
           ELSE app_date_in_year(p_date, extract(year FROM p_today)::int + 1)
      END
    WHEN p_recurrence = 'monthly' THEN
      CASE WHEN app_date_in_month(p_date, p_today) >= p_today
           THEN app_date_in_month(p_date, p_today)
           ELSE app_date_in_month(p_date, (p_today + interval '1 month')::date)
      END
    ELSE NULL
  END
$$;
--> statement-breakpoint

-- The age in a milestone capsule's spec, or NULL if it is not one this
-- understands. Two shapes are in the wild: the string `"age:18"` (TASK-058)
-- and the object `{"age": 18}` (what the API's DTO accepts).
CREATE FUNCTION app_milestone_age(p_spec jsonb)
  RETURNS int
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  SET search_path = public, pg_temp
AS $$
  SELECT CASE jsonb_typeof(p_spec)
    WHEN 'string' THEN substring(p_spec #>> '{}' FROM '^age:(\d{1,3})$')::int
    WHEN 'object' THEN substring(p_spec ->> 'age' FROM '^(\d{1,3})$')::int
  END
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app_date_in_year(date, int) TO mm_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_date_in_month(date, date) TO mm_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_next_occurrence(date, varchar, date) TO mm_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_milestone_age(jsonb) TO mm_app;
