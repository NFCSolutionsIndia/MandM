import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import type { Env } from '../config/env.schema.js';
import { DbService } from './db.service.js';
import {
  ADMIN_DRIZZLE,
  ADMIN_PG_POOL,
  DRIZZLE,
  PG_POOL,
} from './db.tokens.js';
import * as schema from './schema/index.js';

/**
 * The database connection, as one shared pool for the process.
 *
 * `@Global` because every feature module needs it and the alternative is
 * importing this into all of them. Configuration and the database are the two
 * genuinely cross-cutting concerns in this service; nothing else should be
 * global.
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const pool = new Pool({
          connectionString: config.get('DATABASE_URL', { infer: true }),
          max: config.get('DB_POOL_MAX', { infer: true }),

          /**
           * Both timeouts are enforced by PostgreSQL, not by this process, so
           * they survive a client that stops listening. See env.schema.ts for
           * why each one matters.
           */
          statement_timeout: config.get('DB_STATEMENT_TIMEOUT_MS', {
            infer: true,
          }),
          idle_in_transaction_session_timeout: config.get(
            'DB_IDLE_TX_TIMEOUT_MS',
            { infer: true },
          ),

          /**
           * Shows up in `pg_stat_activity`. During an incident, "which of our
           * services is holding these connections" is the first question, and
           * without this the answer is a row of indistinguishable `node`.
           */
          application_name: 'mm-api',
        });

        /**
         * A pool emits `error` for a connection that dies while idle — a
         * database failover, a network blip, an idle timeout at the server.
         * Node's default for an unhandled `error` event is to crash the
         * process, so this listener is not optional: without it a routine
         * failover takes the API down.
         */
        pool.on('error', (err) => {
          new Logger('PgPool').error(
            `Idle client error: ${err.message}`,
            err.stack,
          );
        });

        return pool;
      },
    },

    {
      provide: DRIZZLE,
      inject: [PG_POOL],
      useFactory: (pool: Pool) =>
        drizzle(pool, {
          schema,

          /**
           * Must match `drizzle.config.ts`. The config governs the SQL that is
           * *generated*; this governs the SQL that is *executed*. If they
           * disagree, migrations create `vault_id` while queries ask for
           * `vaultId`, and every query fails at runtime with a column that
           * does not exist.
           */
          casing: 'snake_case',
        }),
    },

    {
      provide: ADMIN_PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const url = config.get('ADMIN_DATABASE_URL', { infer: true });

        /**
         * Optional. A deployment that serves only the mobile API holds no
         * console credential at all, which is the strongest possible
         * version of "the API cannot read the governance tables".
         */
        if (!url) return null;

        const pool = new Pool({
          connectionString: url,

          /**
           * Deliberately small. The console is a handful of staff, not a
           * million phones, and these connections count against the same
           * Aurora ceiling as the application pool.
           */
          max: 4,
          statement_timeout: config.get('DB_STATEMENT_TIMEOUT_MS', { infer: true }),
          idle_in_transaction_session_timeout: config.get('DB_IDLE_TX_TIMEOUT_MS', { infer: true }),
          application_name: 'mm-admin',
        });

        pool.on('error', (err) => {
          new Logger('AdminPgPool').error(
            `Idle client error: ${err.message}`,
            err.stack,
          );
        });

        return pool;
      },
    },

    {
      provide: ADMIN_DRIZZLE,
      inject: [ADMIN_PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? drizzle(pool, { schema, casing: 'snake_case' }) : null,
    },

    DbService,
  ],
  exports: [DbService, DRIZZLE, ADMIN_DRIZZLE],
})
export class DbModule implements OnApplicationShutdown {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(ADMIN_PG_POOL) private readonly adminPool: Pool | null,
  ) {}

  /**
   * Close the pool on shutdown.
   *
   * ECS sends SIGTERM and then waits before SIGKILL. Draining here lets
   * in-flight transactions finish and returns connections to the database
   * cleanly, rather than leaving the server to time out sockets that nobody is
   * on the other end of. Requires `app.enableShutdownHooks()` in main.ts.
   */
  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
    await this.adminPool?.end();
  }
}
