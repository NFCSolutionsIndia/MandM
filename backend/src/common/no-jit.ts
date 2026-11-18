import { sql } from 'drizzle-orm';

/**
 * JIT compilation off, for the current transaction only.
 *
 * Queries that join `generate_series()` over CTE values cannot be estimated
 * (the planner assumes 1,000 rows each). The inflated cost crosses
 * `jit_above_cost`, and PostgreSQL then spends ~3 s compiling a query that
 * runs in ~100 ms. Measured on the calendar expansion: 3,071 ms with JIT, of
 * which JIT took 2,960. Request-sized queries never win from JIT, so it is
 * switched off where it misfires rather than changing it for everybody.
 *
 * Run it first in the same `db.tx()`: `await tx.execute(NO_JIT)`.
 */
export const NO_JIT = sql`SELECT set_config('jit', 'off', true)`;
