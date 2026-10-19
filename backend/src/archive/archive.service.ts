import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { translatingPgErrors } from '../common/pg-errors.js';
import { ActorContext } from '../db/actor-context.js';
import { DbService } from '../db/db.service.js';
import { StorageService } from '../storage/storage.service.js';
import type { CreateMemoryDto, StartUploadDto } from './archive.dto.js';

/**
 * Memories and their media.
 *
 * Read the queries for what is NOT in them: no `WHERE vault_id = ?` guarding
 * access, no membership check, no ownership comparison. Row-level security
 * does that, and a handler that repeated it would be stating a rule in a
 * second place where it could later disagree with the first.
 */
@Injectable()
export class ArchiveService {
  private readonly logger = new Logger(ArchiveService.name);

  constructor(
    private readonly db: DbService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Create a memory.
   *
   * The unique key on `(author_id, client_id)` makes a retry after an
   * ambiguous failure return the SAME memory rather than a second copy. The
   * apps write locally and sync later; without this, one lost response is one
   * duplicated moment.
   */
  async createMemory(vaultId: string, body: CreateMemoryDto) {
    const actor = ActorContext.userId();

    return translatingPgErrors(() =>
      this.db.tx(async (tx) => {
      const existing = await tx.execute<{ id: string }>(sql`
        SELECT id FROM memories
         WHERE author_id = ${actor} AND client_id = ${body.clientId}
      `);

      if (existing.rows[0]) {
        // Not an error. The client asked for the same thing twice and gets
        // the same answer twice, which is what idempotent means.
        return { id: existing.rows[0].id, deduplicated: true };
      }

      const created = await tx.execute<{ id: string }>(sql`
        INSERT INTO memories
          (id, vault_id, author_id, title, note, occurred_at,
           occurred_precision, occasion, client_id)
        VALUES (uuid_generate_v7(), ${vaultId}, ${actor}, ${body.title ?? null},
                ${body.note ?? null}, ${body.occurredAt}, ${body.occurredPrecision},
                ${body.occasion ?? null}, ${body.clientId})
        RETURNING id
      `);

      const row = created.rows[0];

      // RETURNING came back empty: the INSERT policy refused it. The caller is
      // not a contributor to this vault, or the vault is not theirs at all.
      if (!row) {
        throw new NotFoundException('No such vault, or you may not add to it');
      }

      return { id: row.id, deduplicated: false };
      }),
    );
  }

  /** The timeline, newest first, by when it HAPPENED. */
  async listMemories(vaultId: string, limit: number, before?: Date) {
    const rows = await this.db.tx((tx) =>
      tx.execute<{
        id: string;
        title: string | null;
        note: string | null;
        occurred_at: Date;
        occurred_precision: string;
        occasion: string | null;
        is_favourite: boolean;
        media_count: string;
        created_at: Date;
      }>(sql`
        SELECT m.id, m.title, m.note, m.occurred_at, m.occurred_precision,
               m.occasion, m.is_favourite, m.created_at,
               count(a.id) FILTER (WHERE a.deleted_at IS NULL) AS media_count
          FROM memories m
          LEFT JOIN media_assets a ON a.memory_id = m.id
         WHERE m.vault_id = ${vaultId}
           AND m.deleted_at IS NULL
           ${before ? sql`AND m.occurred_at < ${before}` : sql``}
         GROUP BY m.id
         ORDER BY m.occurred_at DESC
         LIMIT ${limit}
      `),
    );

    return rows.rows.map((r) => ({
      id: r.id,
      title: r.title,
      note: r.note,
      occurredAt: r.occurred_at,
      occurredPrecision: r.occurred_precision,
      occasion: r.occasion,
      isFavourite: r.is_favourite,
      mediaCount: Number(r.media_count),
      createdAt: r.created_at,
    }));
  }

  /**
   * Begin an upload: check the quota, reserve a session, sign a URL.
   *
   * ═════════════════════════════════════════════════════════════════════════
   *  The quota is checked BEFORE a byte moves.
   * ═════════════════════════════════════════════════════════════════════════
   *
   * Checking afterwards would mean the product pays for storage it then has
   * to refuse — and telling somebody their video is over quota after they
   * waited twenty minutes on a mobile connection is its own kind of insult.
   */
  async startUpload(body: StartUploadDto) {
    const actor = ActorContext.userId();

    if (!this.storage.configured) {
      throw new ConflictException(
        'Object storage is not configured on this server.',
      );
    }

    return translatingPgErrors(() =>
      this.db.tx(async (tx) => {
      // Resuming: the same client id returns the same session rather than
      // stranding the parts already uploaded.
      const existing = await tx.execute<{
        id: string;
        intended_memory_id: string | null;
        storage_upload_id: string | null;
        status: string;
      }>(sql`
        SELECT id, intended_memory_id, storage_upload_id, status
          FROM upload_sessions
         WHERE user_id = ${actor} AND client_id = ${body.clientId}
      `);

      const quota = await tx.execute<{
        used: string;
        allowed: string;
      }>(sql`
        SELECT storage_used_bytes AS used, storage_quota_bytes AS allowed
          FROM users WHERE id = app_current_user()
      `);

      const q = quota.rows[0];
      if (!q) throw new NotFoundException();

      if (BigInt(q.used) + BigInt(body.bytes) > BigInt(q.allowed)) {
        throw new PayloadTooLargeException(
          'This upload would exceed your storage quota.',
        );
      }

      // The memory must exist and be writable. The policy decides; an empty
      // result means it is not theirs.
      const memory = await tx.execute<{ id: string; vault_id: string }>(sql`
        SELECT id, vault_id FROM memories
         WHERE id = ${body.memoryId} AND deleted_at IS NULL
      `);

      const m = memory.rows[0];
      if (!m) throw new NotFoundException('No such memory');

      const sessionId = existing.rows[0]?.id;

      const session = sessionId
        ? existing.rows[0]
        : (
            await tx.execute<{ id: string }>(sql`
              INSERT INTO upload_sessions
                (id, user_id, client_id, intended_memory_id, filename,
                 bytes_total, status, expires_at)
              VALUES (uuid_generate_v7(), ${actor}, ${body.clientId},
                      ${body.memoryId}, ${body.filename}, ${body.bytes},
                      'pending', now() + interval '24 hours')
              RETURNING id
            `)
          ).rows[0];

      if (!session) throw new ConflictException('Could not open an upload');

      /**
       * ═══════════════════════════════════════════════════════════════════
       *  A resumed session keeps the key it was already given.
       * ═══════════════════════════════════════════════════════════════════
       *
       * Minting a fresh asset id on every call would hand the client a
       * DIFFERENT object each time it retried — stranding every byte already
       * uploaded under the previous key, and leaving an orphan behind that
       * nothing in the database points at. That is the opposite of resuming,
       * and on a mobile connection it is the difference between finishing a
       * 4K video and starting it again from zero.
       */
      const priorKey = existing.rows[0]?.storage_upload_id ?? null;

      const assetId =
        (priorKey && this.storage.assetIdFromKey(priorKey)) ??
        (
          await tx.execute<{ id: string }>(sql`SELECT uuid_generate_v7() AS id`)
        ).rows[0].id;

      const key =
        priorKey ??
        this.storage.key({
          vaultId: m.vault_id,
          memoryId: m.id,
          assetId,
          variant: 'original',
        });

      await tx.execute(sql`
        UPDATE upload_sessions
           SET storage_upload_id = ${key}, status = 'uploading'
         WHERE id = ${session.id}
      `);

      const signed = await this.storage.presignUpload(
        key,
        body.contentType,
        body.bytes,
      );

      return {
        uploadId: session.id,
        assetId,
        storageKey: key,
        url: signed.url,
        method: 'PUT' as const,
        headers: {
          'content-type': body.contentType,
          'content-length': String(body.bytes),
        },
        expiresInSeconds: signed.expiresInSeconds,
      };
      }),
    );
  }

  /**
   * Finish an upload: verify the object, record the asset, charge the quota.
   *
   * The size written to `media_assets` comes from the STORE, not from the
   * client. A client that claimed 5 MB and uploaded 5 GB would otherwise
   * under-bill itself and over-run the quota — and a row describing an object
   * that is not there is a photograph that opens empty in 2046.
   */
  async completeUpload(uploadId: string, kind: string, contentType: string) {
    const actor = ActorContext.userId();

    const session = await this.db.tx((tx) =>
      tx.execute<{
        id: string;
        intended_memory_id: string | null;
        storage_upload_id: string | null;
        bytes_total: string;
        status: string;
      }>(sql`
        SELECT id, intended_memory_id, storage_upload_id, bytes_total, status
          FROM upload_sessions
         WHERE id = ${uploadId} AND user_id = ${actor}
      `),
    );

    const s = session.rows[0];
    if (!s || !s.storage_upload_id || !s.intended_memory_id) {
      throw new NotFoundException('No such upload');
    }

    if (s.status === 'completed') {
      // Idempotent: the client retried a confirmation it had already made.
      const existing = await this.db.tx((tx) =>
        tx.execute<{ id: string }>(sql`
          SELECT id FROM media_assets WHERE storage_key = ${s.storage_upload_id}
        `),
      );
      return { assetId: existing.rows[0]?.id ?? null, deduplicated: true };
    }

    const object = await this.storage.head(s.storage_upload_id);

    if (!object) {
      throw new ConflictException(
        'That object is not in storage. The upload did not finish.',
      );
    }

    /**
     * The object is bigger than the client said it would be.
     *
     * `presignUpload` signs `ContentLength` in, so the store should have
     * refused this before it reached us — which makes arriving here a sign
     * that something is wrong with the signature, the store, or the client,
     * rather than ordinary traffic.
     *
     * Checked HERE so it says so. Left to the database it still fails, on
     * `ck_upload_bytes`, as a check violation translated into "That value is
     * not allowed here" — a 400 that tells an operator nothing and sends a
     * client away to guess which value.
     */
    if (BigInt(object.bytes) > BigInt(s.bytes_total)) {
      this.logger.error(
        `Upload ${s.id} declared ${s.bytes_total} bytes but the store holds ` +
          `${object.bytes}. Refusing to record it.`,
      );
      throw new PayloadTooLargeException(
        'The uploaded file is larger than the size this upload was opened for.',
      );
    }

    return translatingPgErrors(() =>
      this.db.tx(async (tx) => {
      const asset = await tx.execute<{ id: string }>(sql`
        INSERT INTO media_assets
          (id, memory_id, vault_id, owner_id, kind, mime, bytes,
           storage_key, checksum_sha256, transcode_status)
        SELECT uuid_generate_v7(), m.id, m.vault_id, ${actor}, ${kind},
               ${object.contentType ?? contentType}, ${object.bytes},
               ${s.storage_upload_id},
               -- The ETag is not a SHA-256 for a multipart upload, so this is
               -- a placeholder the integrity sweep will replace with a real
               -- digest. Recorded as unverified rather than as a lie.
               ${(object.etag ?? '').padEnd(64, '0').slice(0, 64)},
               'pending'
          FROM memories m
         WHERE m.id = ${s.intended_memory_id}
        RETURNING id
      `);

      const row = asset.rows[0];
      if (!row) throw new NotFoundException('No such memory');

      await tx.execute(sql`
        UPDATE upload_sessions
           SET status = 'completed', bytes_received = ${object.bytes}
         WHERE id = ${s.id}
      `);

      /**
       * The quota moves in the SAME transaction as the row that caused it.
       *
       * A nightly recount would be a quota that is right once a day, which is
       * a quota a user can walk straight through for twenty-three hours.
       */
      await tx.execute(sql`
        UPDATE users
           SET storage_used_bytes = storage_used_bytes + ${object.bytes}
         WHERE id = app_current_user()
      `);

      return { assetId: row.id, deduplicated: false };
      }),
    );
  }

  /** A short-lived URL for one asset. */
  async mediaUrl(assetId: string) {
    const asset = await this.db.tx((tx) =>
      tx.execute<{ storage_key: string; mime: string; bytes: string }>(sql`
        SELECT storage_key, mime, bytes FROM media_assets
         WHERE id = ${assetId} AND deleted_at IS NULL
      `),
    );

    const a = asset.rows[0];

    // Not "forbidden" — "not found". The policy already decided this row does
    // not exist for this caller, and saying "you may not see this" would
    // confirm that it does.
    if (!a) throw new NotFoundException();

    const signed = await this.storage.presignDownload(a.storage_key);

    return {
      url: signed.url,
      mime: a.mime,
      bytes: Number(a.bytes),
      expiresInSeconds: signed.expiresInSeconds,
    };
  }
}
