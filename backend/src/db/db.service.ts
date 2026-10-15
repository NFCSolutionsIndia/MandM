import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { ActorContext } from './actor-context.js';
import { DRIZZLE } from './db.tokens.js';
import type * as schema from './schema/index.js';

export type Db = NodePgDatabase<typeof schema>;

/** A transaction handle. Same query API as `Db`, scoped to one transaction. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * The only sanctioned way to reach the database.
 *
 * Repositories take a `Tx`, never the raw connection, because the actor is set
 * per transaction and a query outside one has no actor at all.
 */
@Injectable()
export class DbService {
  private readonly logger = new Logger(DbService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  /**
   * The connection with NO transaction and NO actor.
   *
   * Reserved for the handful of calls that cannot have an actor by
   * definition: resolving a session before anybody is authenticated, redeeming
   * a sign-in code, opening a share link. Every one of them goes through a
   * `SECURITY DEFINER` function that is narrow by construction.
   *
   * Never use this to read a table. A query through here runs as `mm_app` with
   * `app.user_id` unset, so row-level security denies everything —
   * which means a mistake here fails closed and loudly rather than quietly
   * returning rows it should not.
   */
  get raw(): Db {
    return this.db;
  }

  /**
   * Run `fn` inside a transaction, with the current actor applied.
   *
   * ═════════════════════════════════════════════════════════════════════════
   *  `set_config(..., is_local => true)` is the parameterised form of
   *  `SET LOCAL`, and the only safe one.
   * ═════════════════════════════════════════════════════════════════════════
   *
   * `SET LOCAL app.user_id = $1` is not valid: PostgreSQL's `SET` does not
   * accept bind parameters. The obvious workaround — interpolating the id into
   * the statement — turns the actor into an injection point, on the one value
   * the entire authorization model depends on. `set_config()` is an ordinary
   * function call, so the id travels as a parameter and can never be parsed as
   * SQL.
   *
   * `is_local => true` scopes it to this transaction. A session-level setting
   * would outlive the request and be inherited by whoever the pool hands this
   * connection to next, which is precisely the leak RLS exists to prevent.
   *
   * With no actor the setting is empty, `app_current_user()` returns NULL, and
   * every policy denies. Unauthenticated work sees nothing.
   */
  async tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const actor = ActorContext.userId();

    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.user_id', ${actor ?? ''}, true)`,
      );
      return fn(tx);
    });
  }

  /**
   * Run `fn` with a specific actor, ignoring the ambient one.
   *
   * For the narrow cases that act on somebody's behalf outside their request:
   * the delivery engine opening a capsule for its recipient, a scheduled job
   * finishing a user's upload. Everything else uses {@link tx}.
   */
  async txAs<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return ActorContext.run(userId, () => this.tx(fn));
  }

  /**
   * Liveness, for the health endpoint.
   *
   * Reports the role as the database sees it, which is worth surfacing: if this
   * ever says `postgres`, every policy in migration 0002 is being bypassed and
   * the service is wide open while looking perfectly healthy.
   */
  async ping(): Promise<{ role: string; latencyMs: number }> {
    const started = performance.now();
    const result = await this.db.execute<{ role: string }>(
      sql`SELECT current_user AS role`,
    );
    const latencyMs = Math.round((performance.now() - started) * 100) / 100;

    const role = result.rows[0]?.role ?? 'unknown';

    if (role === 'postgres') {
      this.logger.error(
        'Connected as a superuser. Row-level security is being bypassed — ' +
          'DATABASE_URL must point at mm_app.',
      );
    }

    return { role, latencyMs };
  }
}
