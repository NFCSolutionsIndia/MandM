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
