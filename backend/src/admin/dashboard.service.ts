import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DbService } from '../db/db.service.js';

/**
 * Everything the console's home screen shows, in one query pass.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  Every figure here is computed. None of it is seeded or invented.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Where the product cannot yet answer something the design asks for — p95
 * latency, replica lag, revenue — the field comes back `null` and the console
 * renders it as unavailable. A dashboard that fabricates a number is worse
 * than one with a gap in it: the gap prompts somebody to go and build the
 * measurement, and the fabrication prompts nobody.
 *
 * One endpoint rather than a dozen, because this is a single screen that is
 * refreshed as a whole. Twelve round trips would also mean twelve chances for
 * one slow query to make the page look broken.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly db: DbService) {}

  async load() {
    return this.db.adminTx(async (tx) => {
      const one = async <T extends Record<string, unknown>>(
        query: Parameters<typeof tx.execute>[0],
      ) => (await tx.execute<T>(query)).rows;

      const [counters] = await one<{
        sev0: string;
        failed_today: string;
        moderation_queue: string;
        approvals: string;
      }>(sql`
        SELECT
          (SELECT count(*) FROM capsules
            WHERE state = 'sealed' AND delivered_at IS NULL
              AND unlock_at IS NOT NULL AND unlock_at < now())        AS sev0,
          (SELECT count(*) FROM capsules
            WHERE state = 'failed' AND updated_at >= date_trunc('day', now())) AS failed_today,
          (SELECT count(*) FROM moderation_flags
            WHERE state IN ('open', 'reviewing'))                     AS moderation_queue,
          (SELECT count(*) FROM break_glass_access
            WHERE approved_by IS NULL AND expires_at > now())         AS approvals
      `);

      /**
       * The overdue capsules themselves — id and schedule only.
       *
       * The column grant in migration 0014 means this query *cannot* select
       * the message even if somebody added it to the SELECT list. An operator
       * gets an id to act on, not a letter to read.
       */
      const overdue = await one<{
        id: string;
        unlock_at: Date;
        unlock_timezone: string | null;
        overdue_seconds: string;
        attempts: string;
        last_error: string | null;
      }>(sql`
        SELECT c.id, c.unlock_at, c.unlock_timezone,
               extract(epoch FROM now() - c.unlock_at) AS overdue_seconds,
               count(d.id) AS attempts,
               max(d.error_code) AS last_error
          FROM capsules c
          LEFT JOIN delivery_attempts d ON d.capsule_id = c.id
         WHERE c.state = 'sealed' AND c.delivered_at IS NULL
           AND c.unlock_at IS NOT NULL AND c.unlock_at < now()
         GROUP BY c.id, c.unlock_at, c.unlock_timezone
         ORDER BY c.unlock_at
         LIMIT 5
      `);

      const [kpis] = await one<{
        due_today: string;
        due_sent: string;
        due_queued: string;
        due_failed: string;
        success_30d: string | null;
        success_prev_30d: string | null;
        active_users: string;
        active_users_prev: string;
      }>(sql`
        SELECT
          (SELECT count(*) FROM capsules
            WHERE unlock_at >= date_trunc('day', now())
              AND unlock_at <  date_trunc('day', now()) + interval '1 day') AS due_today,
          (SELECT count(*) FROM capsules
            WHERE delivered_at >= date_trunc('day', now()))                 AS due_sent,
          (SELECT count(*) FROM capsules
            WHERE state IN ('sealed','delivering') AND delivered_at IS NULL
              AND unlock_at < date_trunc('day', now()) + interval '1 day')  AS due_queued,
          (SELECT count(*) FROM capsules
            WHERE state = 'failed')                                         AS due_failed,

          (SELECT round(100.0 * count(*) FILTER (
                    WHERE status IN ('delivered','acknowledged')) / nullif(count(*),0), 2)
             FROM delivery_attempts
            WHERE attempted_at >= now() - interval '30 days')                AS success_30d,
          (SELECT round(100.0 * count(*) FILTER (
                    WHERE status IN ('delivered','acknowledged')) / nullif(count(*),0), 2)
             FROM delivery_attempts
            WHERE attempted_at >= now() - interval '60 days'
              AND attempted_at <  now() - interval '30 days')                AS success_prev_30d,

          (SELECT count(*) FROM users
            WHERE last_seen_at >= now() - interval '30 days'
              AND deleted_at IS NULL)                                       AS active_users,
          (SELECT count(*) FROM users
            WHERE last_seen_at >= now() - interval '60 days'
              AND last_seen_at <  now() - interval '30 days'
              AND deleted_at IS NULL)                                       AS active_users_prev
      `);

      /** Hour buckets for the last 24 hours, with empty hours kept. */
      const deliveries = await one<{
        hour: Date;
        delivered: string;
        retrying: string;
        failed: string;
      }>(sql`
        SELECT h.hour,
               count(d.id) FILTER (WHERE d.status IN ('delivered','acknowledged','sent')) AS delivered,
               count(d.id) FILTER (WHERE d.status = 'queued')                              AS retrying,
               count(d.id) FILTER (WHERE d.status IN ('failed','bounced'))                 AS failed
          FROM generate_series(
                 date_trunc('hour', now()) - interval '23 hours',
                 date_trunc('hour', now()), interval '1 hour') AS h(hour)
          LEFT JOIN delivery_attempts d
                 ON date_trunc('hour', d.attempted_at) = h.hour
         GROUP BY h.hour ORDER BY h.hour
      `);

      const channels = await one<{ channel: string; success: string | null }>(sql`
        SELECT channel,
               round(100.0 * count(*) FILTER (
                 WHERE status IN ('delivered','acknowledged')) / nullif(count(*),0), 1) AS success
          FROM delivery_attempts
         WHERE attempted_at >= now() - interval '30 days'
         GROUP BY channel ORDER BY channel
      `);

      /** The next seven days of unlocks — what the engine is about to owe. */
      const unlockLoad = await one<{ day: Date; count: string }>(sql`
        SELECT d.day, count(c.id) AS count
          FROM generate_series(
                 date_trunc('day', now()),
                 date_trunc('day', now()) + interval '6 days',
                 interval '1 day') AS d(day)
          LEFT JOIN capsules c
                 ON date_trunc('day', c.unlock_at) = d.day
                AND c.state IN ('sealed','delivering')
         GROUP BY d.day ORDER BY d.day
      `);

      /** The live timeline, straight from the append-only audit trail. */
      const timeline = await one<{
        id: string;
        created_at: Date;
        actor_type: string;
        action: string;
        resource_type: string;
        actor_email: string | null;
      }>(sql`
        SELECT a.id, a.created_at, a.actor_type, a.action, a.resource_type,
               COALESCE(ad.email, u.email::text) AS actor_email
          FROM audit_logs a
          LEFT JOIN admin_users ad ON ad.id = a.actor_id
          LEFT JOIN users u       ON u.id  = a.actor_id
         ORDER BY a.created_at DESC
         LIMIT 12
      `);

      /** Approvals waiting on the person reading the screen. */
      const tasks = await one<{
        id: string;
        reason: string;
        created_at: Date;
        expires_at: Date;
        requested_by: string | null;
      }>(sql`
        SELECT b.id, b.reason, b.created_at, b.expires_at, a.email AS requested_by
          FROM break_glass_access b
          JOIN admin_users a ON a.id = b.admin_id
         WHERE b.approved_by IS NULL
           AND b.expires_at > now()
           AND b.admin_id <> app_current_admin()
         ORDER BY b.created_at
         LIMIT 10
      `);

      const [jobs] = await one<{
        pending: string;
        dead: string;
        oldest_due_seconds: string | null;
      }>(sql`
        SELECT count(*) FILTER (WHERE state = 'pending')                      AS pending,
               count(*) FILTER (WHERE state = 'dead')                         AS dead,
               -- FILTER attaches to the AGGREGATE, not to extract() around it.
               extract(epoch FROM now() - min(run_at) FILTER (
                 WHERE state = 'pending' AND run_at < now()))                 AS oldest_due_seconds
          FROM scheduled_jobs
      `);

      const [media] = await one<{
        pending: string;
        processing: string;
        failed: string;
      }>(sql`SELECT * FROM app_admin_media_pipeline()`);

      const n = (v: string | null | undefined) =>
        v === null || v === undefined ? null : Number(v);

      return {
        generatedAt: new Date().toISOString(),

        counters: {
          sev0: n(counters.sev0) ?? 0,
          failedToday: n(counters.failed_today) ?? 0,
          moderationQueue: n(counters.moderation_queue) ?? 0,
          approvals: n(counters.approvals) ?? 0,
        },

        overdue: overdue.map((o) => ({
          capsuleId: o.id,
          unlockAt: o.unlock_at,
          overdueSeconds: n(o.overdue_seconds) ?? 0,
          timezone: o.unlock_timezone,
          attempts: n(o.attempts) ?? 0,
          lastError: o.last_error,
        })),

        kpis: {
          deliverySuccess30d: {
            value: n(kpis.success_30d),
            previous: n(kpis.success_prev_30d),
          },
          capsulesDueToday: {
            value: n(kpis.due_today) ?? 0,
            sent: n(kpis.due_sent) ?? 0,
            queued: n(kpis.due_queued) ?? 0,
            failed: n(kpis.due_failed) ?? 0,
          },
          activeUsers: {
            value: n(kpis.active_users) ?? 0,
            previous: n(kpis.active_users_prev) ?? 0,
          },

          /**
           * Revenue is deliberately null.
           *
           * `payments` exists and holds nothing: no gateway is wired, so any
           * figure the console showed would be a number somebody might repeat
           * in a meeting. It returns `null` until there is money to count.
           */
          mrr: null as { value: number; currency: string } | null,
        },

        deliveries24h: deliveries.map((d) => ({
          hour: d.hour,
          delivered: n(d.delivered) ?? 0,
          retrying: n(d.retrying) ?? 0,
          failed: n(d.failed) ?? 0,
        })),

        channels: channels.map((c) => ({
          channel: c.channel,
          successPct: n(c.success),
        })),

        unlockLoad7d: unlockLoad.map((u) => ({
          day: u.day,
          count: n(u.count) ?? 0,
        })),

        timeline: timeline.map((t) => ({
          id: t.id,
          at: t.created_at,
          actorType: t.actor_type,
          actor: t.actor_email,
          action: t.action,
          resourceType: t.resource_type,
        })),

        tasks: tasks.map((t) => ({
          id: t.id,
          kind: 'break_glass' as const,
          reason: t.reason,
          requestedBy: t.requested_by,
          createdAt: t.created_at,
          expiresAt: t.expires_at,
        })),

        health: {
          scheduler: {
            pending: n(jobs.pending) ?? 0,
            dead: n(jobs.dead) ?? 0,
            lagSeconds: n(jobs.oldest_due_seconds),
          },
          media: {
            pending: n(media.pending) ?? 0,
            processing: n(media.processing) ?? 0,
            failed: n(media.failed) ?? 0,
          },

          /**
           * Not measured yet, and said so rather than guessed.
           *
           * p95 latency needs request instrumentation; replica lag needs a
           * replica; provider status needs the webhook handlers. Each `null`
           * is a measurement somebody still has to build.
           */
          apiP95Ms: null as number | null,
          replicaLagSeconds: null as number | null,
          email: null as string | null,
          push: null as string | null,
        },
      };
    });
  }
}
