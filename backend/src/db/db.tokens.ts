/**
 * Injection tokens for things that have no class to name them.
 *
 * A Drizzle instance and a `pg.Pool` are plain objects, so Nest cannot use a
 * class as the token. Symbols are kept here rather than inline so that a typo
 * is a missing export at compile time instead of an unresolved dependency at
 * boot.
 */

/** The Drizzle query interface, bound to the schema. */
export const DRIZZLE = Symbol('DRIZZLE');

/** The underlying `pg` connection pool. Needed to close it on shutdown. */
export const PG_POOL = Symbol('PG_POOL');

/**
 * The console’s Drizzle instance, connected as `mm_admin`.
 *
 * A second pool rather than a second role on one pool: `SET ROLE` would
 * have to be reset on every release back to the pool, and a single missed
 * reset hands admin privileges to the next request that borrows the
 * connection.
 */
export const ADMIN_DRIZZLE = Symbol('ADMIN_DRIZZLE');
export const ADMIN_PG_POOL = Symbol('ADMIN_PG_POOL');

/** The delivery engine’s instance, connected as `mm_worker`. */
export const WORKER_DRIZZLE = Symbol('WORKER_DRIZZLE');
export const WORKER_PG_POOL = Symbol('WORKER_PG_POOL');
