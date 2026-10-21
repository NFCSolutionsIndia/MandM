import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { generateSessionToken, hashToken } from '../auth/tokens.js';
import { translatingPgErrors } from '../common/pg-errors.js';
import { ActorContext } from '../db/actor-context.js';
import { DbService } from '../db/db.service.js';
import type {
  AddRecipientDto,
  AttachMemoriesDto,
  CreateCapsuleDto,
  UpdateCapsuleDto,
} from './capsules.dto.js';

/**
 * Capsules — a message sealed today and opened on a date that may be twenty
 * years away.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  Everything else in this API is storage. This is the part that has to still
 *  work in 2046.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * As in the archive service, read these queries for what is NOT in them: no
 * ownership comparison, no membership check. Row-level security decides, and
 * a handler repeating the rule would be stating it in a second place where it
 * could later disagree with the first.
 */
@Injectable()
export class CapsulesService {
  private readonly logger = new Logger(CapsulesService.name);

  /**
   * How long after sealing the sender may still change their mind.
   *
   * Short on purpose. The grace window is for "I spelled her name wrong", not
   * for second thoughts — a promise you can rewrite for a week is not a
   * promise, and the whole value of a sealed capsule is that it cannot be
   * quietly revised later. Cancelling outright remains possible; editing does
   * not, which is the distinction that matters.
   */
  private static readonly SEAL_GRACE_MINUTES = 15;

  constructor(private readonly db: DbService) {}

  async create(vaultId: string, body: CreateCapsuleDto) {
    const actor = ActorContext.userId();

    return translatingPgErrors(() =>
      this.db.tx(async (tx) => {
        const created = await tx.execute<{ id: string; state: string }>(sql`
          INSERT INTO capsules
            (id, vault_id, owner_id, title, sender_note, state, unlock_kind,
             unlock_at, unlock_timezone, milestone_member_id, milestone_spec)
          VALUES (uuid_generate_v7(), ${vaultId}, ${actor}, ${body.title ?? null},
                  ${body.note ?? null}, 'draft', ${body.unlockKind},
                  ${body.unlockAt ?? null}, ${body.unlockTimezone ?? null},
                  ${body.milestoneMemberId ?? null},
                  ${body.milestoneSpec ? JSON.stringify(body.milestoneSpec) : null})
          RETURNING id, state
        `);

        const row = created.rows[0];

        // RETURNING came back empty: the INSERT policy refused it. Not an
        // owner or contributor of this vault — or not a member of it at all.
        if (!row) {
          throw new NotFoundException('No such vault, or you may not write to it');
        }

        return { id: row.id, state: row.state };
      }),
    );
  }

  async list(vaultId: string, limit: number, state?: string) {
    const rows = await this.db.tx((tx) =>
      tx.execute(sql`
        SELECT c.id, c.title, c.state, c.unlock_kind, c.unlock_at,
               c.unlock_timezone, c.sealed_at, c.editable_until,
               c.delivered_at, c.first_opened_at, c.cancelled_at, c.created_at,
               (SELECT count(*) FROM capsule_recipients r WHERE r.capsule_id = c.id)
                 AS recipient_count,
               (SELECT count(*) FROM capsule_memories m WHERE m.capsule_id = c.id)
                 AS memory_count
          FROM capsules c
         WHERE c.vault_id = ${vaultId}
           ${state ? sql`AND c.state = ${state}` : sql``}
         ORDER BY COALESCE(c.unlock_at, c.created_at) DESC
         LIMIT ${limit}
      `),
    );

    return { capsules: rows.rows.map((r) => this.present(r)) };
  }

  /**
   * One capsule, with who it is for and what it carries.
   *
   * `sender_note` is returned here because the caller is a vault member
   * reading their own vault. The admin console gets a different answer to the
   * same question — it has no SELECT privilege on that column at all.
   */
  async get(capsuleId: string) {
    const result = await this.db.tx(async (tx) => {
      const capsule = await tx.execute(sql`
        SELECT c.id, c.title, c.sender_note, c.state, c.unlock_kind,
               c.unlock_at, c.unlock_timezone, c.milestone_member_id,
               c.milestone_spec, c.sealed_at, c.editable_until,
               c.delivered_at, c.first_opened_at, c.cancelled_at, c.created_at,
               c.vault_id, c.owner_id
          FROM capsules c WHERE c.id = ${capsuleId}
      `);

      const c = capsule.rows[0];
      if (!c) return null;

      const recipients = await tx.execute(sql`
        SELECT id, name, email, phone, preferred_channel, member_id,
               delivered_at, opened_at, last_verified_at
          FROM capsule_recipients
         WHERE capsule_id = ${capsuleId}
         ORDER BY created_at
      `);

      const memories = await tx.execute(sql`
        SELECT m.id, m.title, m.occurred_at, m.occurred_precision
          FROM capsule_memories cm
          JOIN memories m ON m.id = cm.memory_id
         WHERE cm.capsule_id = ${capsuleId}
         ORDER BY m.occurred_at
      `);

      return { c, recipients: recipients.rows, memories: memories.rows };
    });

    if (!result) throw new NotFoundException();

    return {
      ...this.present(result.c),
      note: result.c.sender_note,
      milestoneMemberId: result.c.milestone_member_id,
      milestoneSpec: result.c.milestone_spec,

      // No access token here, in any form. It is shown once, when the
      // recipient is added, and after that only its SHA-256 exists.
      recipients: result.recipients.map((r: Record<string, unknown>) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        preferredChannel: r.preferred_channel,
        memberId: r.member_id,
        deliveredAt: r.delivered_at,
        openedAt: r.opened_at,
        lastVerifiedAt: r.last_verified_at,
      })),

      memories: result.memories.map((m: Record<string, unknown>) => ({
        id: m.id,
        title: m.title,
        occurredAt: m.occurred_at,
        occurredPrecision: m.occurred_precision,
      })),
    };
  }

  /**
   * Edit a capsule.
   *
   * The handler checks nothing about sealing. `capsule_freeze()` does, and it
   * raises `23514`, which `translatingPgErrors` turns into a 400 — so the
   * rule is enforced once, in the database, for every writer including a
   * future admin tool or a migration script.
   */
  async update(capsuleId: string, body: UpdateCapsuleDto) {
    if (Object.keys(body).length === 0) {
      throw new BadRequestException('Nothing to change');
    }

    return translatingPgErrors(() =>
      this.db.tx(async (tx) => {
        const updated = await tx.execute<{ id: string; state: string }>(sql`
          UPDATE capsules SET
            title           = COALESCE(${body.title ?? null}, title),
            sender_note     = COALESCE(${body.note ?? null}, sender_note),
            unlock_at       = COALESCE(${body.unlockAt ?? null}, unlock_at),
            unlock_timezone = COALESCE(${body.unlockTimezone ?? null}, unlock_timezone),
            updated_at      = now()
          WHERE id = ${capsuleId}
          RETURNING id, state
        `);

        const row = updated.rows[0];
        if (!row) throw new NotFoundException();

        return { id: row.id, state: row.state };
      }),
    );
  }

  /**
   * Add somebody to reach, and mint the credential that will open the capsule
   * for them.
   *
   * ═════════════════════════════════════════════════════════════════════════
   *  The raw token is returned ONCE and never stored.
   * ═════════════════════════════════════════════════════════════════════════
   *
   * Only its SHA-256 reaches the database, so a leaked backup does not hand
   * over every sealed message in the system. Holding the token early is
   * harmless: `app_resolve_recipient` refuses it until the capsule is
   * actually delivered.
   */
  async addRecipient(capsuleId: string, body: AddRecipientDto) {
    const token = generateSessionToken();

    return translatingPgErrors(() =>
      this.db.tx(async (tx) => {
        const capsule = await tx.execute<{ vault_id: string; state: string }>(sql`
          SELECT vault_id, state FROM capsules WHERE id = ${capsuleId}
        `);

        const c = capsule.rows[0];
        if (!c) throw new NotFoundException();

        // Adding a recipient to a sealed capsule would change who the promise
        // was made to, after it was made. The freeze trigger does not cover
        // this table, so it is refused here.
        if (c.state !== 'draft') {
          throw new ConflictException(
            `This capsule is ${c.state}; its recipients are settled.`,
          );
        }

        const created = await tx.execute<{ id: string }>(sql`
          INSERT INTO capsule_recipients
            (id, capsule_id, vault_id, member_id, name, email, phone,
             preferred_channel, access_token_hash)
          VALUES (uuid_generate_v7(), ${capsuleId}, ${c.vault_id},
                  ${body.memberId ?? null}, ${body.name}, ${body.email ?? null},
                  ${body.phone ?? null}, ${body.preferredChannel},
                  ${hashToken(token)})
          RETURNING id
        `);

        const row = created.rows[0];
        if (!row) throw new NotFoundException();

        return { id: row.id, accessToken: token, shownOnce: true };
      }),
    );
  }

  async removeRecipient(capsuleId: string, recipientId: string) {
    return translatingPgErrors(() =>
      this.db.tx(async (tx) => {
        const capsule = await tx.execute<{ state: string }>(
          sql`SELECT state FROM capsules WHERE id = ${capsuleId}`,
        );

        const c = capsule.rows[0];
        if (!c) throw new NotFoundException();

        if (c.state !== 'draft') {
          throw new ConflictException(
            `This capsule is ${c.state}; its recipients are settled.`,
          );
        }

        const gone = await tx.execute<{ id: string }>(sql`
          DELETE FROM capsule_recipients
           WHERE id = ${recipientId} AND capsule_id = ${capsuleId}
          RETURNING id
        `);

        if (!gone.rows[0]) throw new NotFoundException();

        return { removed: true };
      }),
    );
  }

  /** Attach memories. Idempotent — the primary key makes a retry a no-op. */
  async attachMemories(capsuleId: string, body: AttachMemoriesDto) {
    return translatingPgErrors(() =>
      this.db.tx(async (tx) => {
        const capsule = await tx.execute<{ state: string }>(
          sql`SELECT state FROM capsules WHERE id = ${capsuleId}`,
        );

        const c = capsule.rows[0];
        if (!c) throw new NotFoundException();

        if (c.state !== 'draft') {
          throw new ConflictException(
            `This capsule is ${c.state}; its contents are settled.`,
          );
        }

        const ids = sql.join(
          body.memoryIds.map((id) => sql`(${capsuleId}, ${id})`),
          sql`, `,
        );

        // A memory in another vault is refused by the policy, not by a check
        // here — and `ON CONFLICT DO NOTHING` makes re-sending the same list
        // after a dropped response return the same state rather than an error.
        const added = await tx.execute(sql`
          INSERT INTO capsule_memories (capsule_id, memory_id)
          VALUES ${ids}
          ON CONFLICT DO NOTHING
          RETURNING memory_id
        `);

        const total = await tx.execute<{ n: string }>(sql`
          SELECT count(*) AS n FROM capsule_memories WHERE capsule_id = ${capsuleId}
        `);

        return {
          added: added.rows.length,
          total: Number(total.rows[0].n),
        };
      }),
    );
  }

  /**
   * Seal it. This is the moment the product is about.
   *
   * ═════════════════════════════════════════════════════════════════════════
   *  Sealing and scheduling happen in ONE transaction.
   * ═════════════════════════════════════════════════════════════════════════
   *
   * A capsule sealed without a job is a promise nothing will ever keep: it
   * would sit in the table looking perfect, and simply never arrive. Rather
   * than a second call that might not happen, both writes commit together or
   * neither does.
   */
  async seal(capsuleId: string) {
    const actor = ActorContext.userId();

    return translatingPgErrors(() =>
      this.db.tx(async (tx) => {
        const found = await tx.execute<{
          id: string;
          state: string;
          unlock_kind: string;
          unlock_at: Date | null;
          owner_id: string;
          recipients: string;
          is_future: boolean | null;
          horizon_days: string | null;
        }>(sql`
          SELECT c.id, c.state, c.unlock_kind, c.unlock_at, c.owner_id,
                 (SELECT count(*) FROM capsule_recipients r
                   WHERE r.capsule_id = c.id) AS recipients,
                 -- Asked of the DATABASE. Whether the unlock is in the future
                 -- must be decided by the clock the scheduler runs on, not by
                 -- this process's idea of now.
                 (c.unlock_at IS NOT NULL AND c.unlock_at > now()) AS is_future,
                 CASE WHEN c.unlock_at IS NOT NULL
                      THEN (EXTRACT(epoch FROM c.unlock_at - now()) / 86400)::text
                 END AS horizon_days
            FROM capsules c
           WHERE c.id = ${capsuleId}
        `);

        const c = found.rows[0];
        if (!c) throw new NotFoundException();

        // Only the owner may seal. The UPDATE policy would refuse it anyway,
        // but silently — and "nothing happened" is a poor answer to "I sealed
        // my capsule".
        if (c.owner_id !== actor) {
          throw new ForbiddenException('Only the capsule’s owner may seal it');
        }

        if (c.state !== 'draft') {
          throw new ConflictException(`This capsule is already ${c.state}.`);
        }

        /**
         * A capsule with nobody to reach cannot be delivered.
         *
         * Refused HERE rather than discovered by the worker. The worker
         * throws on an empty recipient list, which costs five days of
         * day-scale backoff before anybody sees a Sev-0 — for a mistake that
         * was visible the moment the sender pressed seal.
         */
        if (Number(c.recipients) === 0) {
          throw new BadRequestException(
            'A capsule needs at least one recipient before it can be sealed.',
          );
        }

        if (c.unlock_kind === 'datetime' && !c.is_future) {
          throw new BadRequestException(
            'That unlock time has already passed. Choose a future date.',
          );
        }

        const ent = await tx.execute<{
          max_pending_capsules: number | null;
          max_capsule_horizon_days: number | null;
          pending_now: string;
        }>(sql`SELECT * FROM app_sealing_entitlement(${actor})`);

        this.assertEntitled(ent.rows[0], c.horizon_days);

        /**
         * `editable_until` never outlives the unlock.
         *
         * `LEAST` matters: a capsule unlocking in two minutes with a
         * fifteen-minute grace window would otherwise still be editable while
         * the worker was delivering it — the sender rewriting the message as
         * it was being read.
         */
        const sealed = await tx.execute<{ id: string; editable_until: Date }>(sql`
          UPDATE capsules
             SET state = 'sealed',
                 sealed_at = now(),
                 editable_until = LEAST(
                   now() + make_interval(mins => ${CapsulesService.SEAL_GRACE_MINUTES}),
                   COALESCE(unlock_at, 'infinity'::timestamptz)
                 ),
                 updated_at = now()
           WHERE id = ${capsuleId} AND state = 'draft'
          RETURNING id, editable_until
        `);

        const row = sealed.rows[0];
        if (!row) throw new ConflictException('This capsule is no longer a draft.');

        /**
         * Only a capsule with an instant can be scheduled.
         *
         * `milestone` without a resolved date, and `manual`, are sealed but
         * not enqueued — there is nothing to schedule them for yet. Said
         * plainly in the response rather than left for somebody to discover
         * by waiting.
         */
        const scheduled = c.unlock_at !== null;

        if (scheduled) {
          await tx.execute(sql`
            INSERT INTO scheduled_jobs (id, kind, run_at, payload, state)
            VALUES (uuid_generate_v7(), 'capsule_delivery', ${c.unlock_at},
                    ${JSON.stringify({ capsuleId })}::jsonb, 'pending')
          `);
        }

        this.logger.log(
          `Capsule ${capsuleId} sealed by ${actor}` +
            (scheduled ? `, delivery scheduled` : `, awaiting a date`),
        );

        return {
          id: row.id,
          state: 'sealed',
          editableUntil: row.editable_until,
          scheduled,
          unlockAt: c.unlock_at,
        };
      }),
    );
  }

  /**
   * The free tier caps CONCURRENT obligations, never lifetime usage.
   *
   * A delivered capsule is never counted again, which is what keeps the
   * growth loop uncapped for free users. `app_sealing_entitlement` does the
   * counting, because the same rule is needed by billing and by the console.
   *
   * No subscription row means no limits are recorded for this user, and the
   * honest response to that is to allow it rather than to invent a number
   * here. Billing is not provisioned yet; when it is, this already enforces.
   */
  private assertEntitled(
    e:
      | {
          max_pending_capsules: number | null;
          max_capsule_horizon_days: number | null;
          pending_now: string;
        }
      | undefined,
    horizonDays: string | null,
  ) {
    if (!e) return;

    if (
      e.max_pending_capsules !== null &&
      Number(e.pending_now) >= e.max_pending_capsules
    ) {
      throw new ConflictException(
        `Your plan allows ${e.max_pending_capsules} capsules waiting to be ` +
          `delivered, and you have ${e.pending_now}. One has to arrive before ` +
          `you can seal another.`,
      );
    }

    if (
      e.max_capsule_horizon_days !== null &&
      horizonDays !== null &&
      Number(horizonDays) > e.max_capsule_horizon_days
    ) {
      throw new ConflictException(
        `Your plan allows scheduling up to ${e.max_capsule_horizon_days} days ` +
          `ahead. Upgrade to promise further into the future.`,
      );
    }
  }

  /**
   * Withdraw the promise.
   *
   * Allowed after sealing, unlike editing, and the distinction is deliberate:
   * a promise you may silently rewrite is not a promise, but a person must
   * always be able to stop something being sent.
   *
   * The job is NOT deleted. The worker checks state and completes without
   * sending — which keeps the record that something was scheduled and then
   * withdrawn, rather than erasing it.
   */
  async cancel(capsuleId: string) {
    const actor = ActorContext.userId();

    return translatingPgErrors(() =>
      this.db.tx(async (tx) => {
        const cancelled = await tx.execute<{ id: string; state: string }>(sql`
          UPDATE capsules
             SET state = 'cancelled', cancelled_at = now(), updated_at = now()
           WHERE id = ${capsuleId}
             AND owner_id = ${actor}
             AND state IN ('draft', 'sealed')
          RETURNING id, state
        `);

        const row = cancelled.rows[0];

        if (!row) {
          const existing = await tx.execute<{ state: string }>(
            sql`SELECT state FROM capsules WHERE id = ${capsuleId}`,
          );

          const s = existing.rows[0];
          if (!s) throw new NotFoundException();

          throw new ConflictException(
            `This capsule is ${s.state}; it can no longer be withdrawn.`,
          );
        }

        this.logger.log(`Capsule ${capsuleId} cancelled by ${actor}`);

        return { id: row.id, state: row.state };
      }),
    );
  }

  // ── the recipient's side ───────────────────────────────────────────────
  //
  // No account, no session, no actor. A token is the whole credential,
  // because the person opening this may have been eleven when it was written.

  /**
   * Open a capsule with an access token.
   *
   * `app_resolve_recipient` is SECURITY DEFINER and refuses any capsule that
   * is not `delivered` or `opened` — so a token that leaks before the unlock
   * date opens nothing, and there is no window in which an early holder can
   * read ahead.
   */
  async open(rawToken: string) {
    /**
     * One call, and it must be: every policy in this schema resolves through
     * `app_current_user()`, and here there is nobody to resolve. Reading the
     * capsule through the ordinary actor-scoped connection returns nothing —
     * correctly, which is why this goes through a SECURITY DEFINER function
     * that takes the token as the whole credential.
     *
     * It also records the opening in the same call that returns the content,
     * so a read cannot forget to.
     */
    const result = await this.db.raw.execute<{ capsule: unknown }>(
      sql`SELECT app_open_capsule(${hashToken(rawToken)}) AS capsule`,
    );

    const capsule = result.rows[0]?.capsule;

    // Not "forbidden", not "expired", not "not yet" — all of which would tell
    // the holder of a bad token something about a capsule they cannot see.
    // One flat answer for every one of those.
    if (!capsule) throw new NotFoundException();

    return capsule;
  }

  /**
   * Reply to whoever sent it.
   *
   * `app_post_reply` is SECURITY DEFINER and does the whole thing: it
   * resolves the token, refuses any capsule that is not delivered or opened,
   * and writes the reply. The handler does not get to decide any of that.
   */
  async reply(rawToken: string, body: string, mediaId?: string) {
    const result = await this.db.raw.execute<{ app_post_reply: string | null }>(
      sql`SELECT app_post_reply(${hashToken(rawToken)}, ${body}, ${mediaId ?? null}) AS app_post_reply`,
    );

    const id = result.rows[0]?.app_post_reply;
    if (!id) throw new NotFoundException();

    return { id, posted: true };
  }

  /** The row shape every capsule response shares. */
  private present(r: Record<string, unknown>) {
    return {
      id: r.id,
      title: r.title,
      state: r.state,
      unlockKind: r.unlock_kind,
      unlockAt: r.unlock_at,
      unlockTimezone: r.unlock_timezone,
      sealedAt: r.sealed_at,
      editableUntil: r.editable_until,
      deliveredAt: r.delivered_at,
      firstOpenedAt: r.first_opened_at,
      cancelledAt: r.cancelled_at,
      createdAt: r.created_at,
      ...(r.recipient_count !== undefined
        ? { recipientCount: Number(r.recipient_count) }
        : {}),
      ...(r.memory_count !== undefined
        ? { memoryCount: Number(r.memory_count) }
        : {}),
    };
  }
}
