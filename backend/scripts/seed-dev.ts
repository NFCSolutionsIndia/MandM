import 'dotenv/config';
import { Pool } from 'pg';

/**
 * Development seed data.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  This exists so the console has something to draw. It is NOT fixtures for
 *  the test suite, and it must never run anywhere but a developer machine.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The tests build their own data and truncate it; this is for looking at the
 * UI with realistic shapes — a Sev-0 that is genuinely overdue, a delivery
 * curve with a visible evening peak, a moderation flag against its SLA.
 *
 * Everything it writes is computed from `now()`, so the dashboard looks alive
 * whenever it is run rather than showing a frozen afternoon in October.
 *
 *   npm run seed:dev
 */

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error('MIGRATION_DATABASE_URL is not set.');
}

// A guard, not a formality. This script deletes and rewrites rows.
if (url.includes('mm_test')) {
  throw new Error('Refusing to seed mm_test — the suite owns that database.');
}
if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to seed in production.');
}

const pool = new Pool({ connectionString: url });

async function main() {
  console.log('Seeding development data…');

  // Only the product tables. Admin accounts and their enrolment survive, so
  // re-seeding does not sign you out or make you scan a new QR.
  await pool.query(`
    TRUNCATE capsules, capsule_recipients, capsule_memories, delivery_attempts,
             scheduled_jobs, memories, media_assets, vaults, vault_members,
             users, moderation_flags, reports, upload_sessions CASCADE
  `);

  const { rows: users } = await pool.query<{ id: string }>(`
    INSERT INTO users (id, email, name, last_seen_at, plan)
    SELECT uuid_generate_v7(),
           'user' || g || '@example.com',
           (ARRAY['Priya','Aarav','Bina','Rahul','Meera','Vikram','Anjali','Dev'])[1 + (g % 8)] || ' ' || g,
           -- Most seen recently, a tail that has drifted away: enough spread
           -- that "active users" and its 30-day comparison both mean something.
           now() - (random() * interval '55 days'),
           (ARRAY['free','free','free','premium','family'])[1 + (g % 5)]::varchar
      FROM generate_series(1, 240) g
    RETURNING id
  `);

  const owner = users[0].id;

  const { rows: vaults } = await pool.query<{ id: string }>(
    `INSERT INTO vaults (id, owner_id, name, type)
     VALUES (uuid_generate_v7(), $1, 'Family', 'shared') RETURNING id`,
    [owner],
  );
  const vault = vaults[0].id;

  await pool.query(
    `INSERT INTO vault_members (vault_id, user_id, role) VALUES ($1,$2,'owner')`,
    [vault, owner],
  );

  const { rows: memories } = await pool.query<{ id: string }>(
    `INSERT INTO memories (id, vault_id, author_id, title, occurred_at, client_id)
     SELECT uuid_generate_v7(), $1, $2, 'Memory ' || g,
            now() - (g || ' days')::interval, gen_random_uuid()
       FROM generate_series(1, 12) g
     RETURNING id`,
    [vault, owner],
  );

  /**
   * Capsules across every state the dashboard reports on.
   *
   * One is deliberately **past its unlock with no delivery** — that is the
   * Sev-0 the design shows, and it has to be real for the banner to appear.
   */
  await pool.query(
    `INSERT INTO capsules (id, vault_id, owner_id, title, state, unlock_kind, unlock_at, unlock_timezone, sealed_at, delivered_at)
     SELECT uuid_generate_v7(), $1, $2, 'Capsule ' || g,
            CASE
              WHEN g = 1 THEN 'sealed'                      -- the Sev-0
              WHEN g <= 40 THEN 'delivered'
              WHEN g <= 46 THEN 'failed'
              ELSE 'sealed'
            END::varchar,
            'datetime',
            CASE
              WHEN g = 1 THEN now() - interval '32 minutes' -- overdue, on purpose
              WHEN g <= 40 THEN now() - (random() * interval '30 days')
              WHEN g <= 46 THEN now() - (random() * interval '2 days')
              WHEN g <= 120 THEN now() + (random() * interval '9 hours')
              ELSE now() + (random() * interval '7 days')
            END,
            'Asia/Kolkata',
            now() - interval '40 days',
            CASE WHEN g BETWEEN 2 AND 40 THEN now() - (random() * interval '30 days') END
       FROM generate_series(1, 300) g`,
    [vault, owner],
  );

  await pool.query(`
    INSERT INTO capsule_recipients (id, capsule_id, vault_id, name, email, access_token_hash, delivered_at)
    SELECT uuid_generate_v7(), c.id, c.vault_id, 'Recipient',
           'recipient' || row_number() OVER () || '@example.com',
           encode(sha256(c.id::text::bytea), 'hex'),
           c.delivered_at
      FROM capsules c
  `);

  /**
   * Delivery attempts over the last 24 hours, with a shape.
   *
   * Weighted towards the evening so the chart has the peak the design shows,
   * and with a realistic failure rate rather than a uniform scatter — a flat
   * chart tells you nothing about whether the chart works.
   */
  /**
   * Delivery attempts, derived from the recipients rather than scattered.
   *
   * The first version picked a random recipient and a random attempt number,
   * and `ux_attempt_idempotent (capsule_id, recipient_id, channel, attempt_no)`
   * rejected it — correctly. That constraint is the delivery engine's promise
   * that a crashed-then-retried worker cannot send twice, and seed data does
   * not get an exemption from it.
   *
   * So each recipient gets a deterministic fan of attempts: the channel is
   * derived from the attempt number, which makes every row unique by
   * construction. Timestamps are squared towards `now()` so the chart has the
   * evening peak the design shows instead of a flat scatter.
   */
  await pool.query(`
    INSERT INTO delivery_attempts
      (id, capsule_id, recipient_id, channel, attempt_no, provider, status, attempted_at)
    SELECT uuid_generate_v7(), r.capsule_id, r.id,
           (ARRAY['email','push','sms','whatsapp'])[1 + (n % 4)]::varchar,
           n,
           (ARRAY['resend','apns','ses','fcm'])[1 + (n % 4)]::varchar,
           CASE WHEN random() < 0.982 THEN 'delivered'
                WHEN random() < 0.6  THEN 'bounced'
                ELSE 'failed' END::varchar,
           now() - (random() * random() * interval '24 hours')
      FROM capsule_recipients r
      CROSS JOIN generate_series(1, 1 + (abs(hashtext(r.id::text)) % 4)) n
     WHERE abs(hashtext(r.id::text || 'recent')) % 3 <> 0
    ON CONFLICT DO NOTHING
  `);

  // An older cohort, so the 30-day figure has a previous period to compare to.
  await pool.query(`
    INSERT INTO delivery_attempts
      (id, capsule_id, recipient_id, channel, attempt_no, provider, status, attempted_at)
    SELECT uuid_generate_v7(), r.capsule_id, r.id,
           (ARRAY['email','push'])[1 + (n % 2)]::varchar,
           50 + n, 'resend',
           CASE WHEN random() < 0.978 THEN 'delivered' ELSE 'failed' END::varchar,
           now() - interval '31 days' - (random() * interval '25 days')
      FROM capsule_recipients r
      CROSS JOIN generate_series(1, 2) n
     WHERE abs(hashtext(r.id::text || 'old')) % 2 = 0
    ON CONFLICT DO NOTHING
  `);

  await pool.query(`
    INSERT INTO scheduled_jobs (id, kind, run_at, payload, state)
    SELECT uuid_generate_v7(), 'capsule_delivery',
           now() + (random() * interval '7 days'),
           jsonb_build_object('capsuleId', c.id), 'pending'
      FROM capsules c WHERE c.state = 'sealed' LIMIT 160
  `);

  // One job genuinely overdue, so "scheduler lag" is a measurement.
  await pool.query(`
    INSERT INTO scheduled_jobs (id, kind, run_at, payload, state)
    VALUES (uuid_generate_v7(), 'capsule_delivery',
            now() - interval '4 minutes 10 seconds', '{}'::jsonb, 'pending')
  `);

  await pool.query(
    `INSERT INTO media_assets
       (id, memory_id, vault_id, owner_id, kind, mime, bytes, storage_key, checksum_sha256, transcode_status)
     SELECT uuid_generate_v7(), $1::uuid, $2::uuid, $3::uuid, 'video', 'video/mp4', 48000000,
            'vault/' || $2::text || '/asset/' || g, repeat('a', 64),
            CASE WHEN g <= 240 THEN 'pending' WHEN g <= 246 THEN 'processing' ELSE 'ready' END::varchar
       FROM generate_series(1, 260) g`,
    [memories[0].id, vault, owner],
  );

  await pool.query(`
    INSERT INTO moderation_flags (id, subject_type, subject_id, source, severity, sla_due_at, state)
    SELECT uuid_generate_v7(), 'memory', m.id, 'auto',
           (ARRAY['low','medium','high'])[1 + (g % 3)]::varchar,
           now() + ((g % 5) || ' hours')::interval,
           'open'
      FROM generate_series(1, 17) g
      JOIN LATERAL (SELECT id FROM memories ORDER BY random() LIMIT 1) m ON true
  `);

  await pool.query(`
    INSERT INTO audit_logs (id, actor_type, actor_id, action, resource_type, created_at)
    SELECT uuid_generate_v7(), 'system', NULL,
           (ARRAY['capsule.delivered','delivery.failover','job.requeued',
                  'moderation.appeal_overturned','capsule.opened'])[1 + (g % 5)],
           'capsule', now() - (g || ' minutes')::interval
      FROM generate_series(1, 20) g
  `);

  const { rows: counts } = await pool.query(`
    SELECT (SELECT count(*) FROM users)             AS users,
           (SELECT count(*) FROM capsules)          AS capsules,
           (SELECT count(*) FROM delivery_attempts) AS attempts,
           (SELECT count(*) FROM moderation_flags)  AS flags
  `);

  console.log('Seeded:', counts[0]);
  console.log('One capsule is deliberately 32 minutes past its unlock — that is the Sev-0.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
