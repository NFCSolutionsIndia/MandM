import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.schema.js';

export interface StoredObject {
  bytes: number;
  etag: string | null;
  contentType: string | null;
}

/**
 * Object storage — Cloudflare R2, which speaks the S3 API.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  Bytes never pass through this service.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The API signs a URL and the client uploads straight to R2. A 4K video
 * routed through the API would occupy a request handler for minutes, count
 * against the container's memory and bandwidth, and make a rolling deploy
 * cancel somebody's upload. Signing is milliseconds; proxying is the rest of
 * the afternoon.
 *
 * It also means the private bucket stays private: there is no public read, no
 * bucket policy opening a prefix, only URLs that expire.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  private readonly client: S3Client | null;
  private readonly bucket: string | null;
  private readonly downloadTtl: number;
  private readonly uploadTtl: number;

  constructor(private readonly config: ConfigService<Env, true>) {
    const accountId = config.get('R2_ACCOUNT_ID', { infer: true });
    const accessKeyId = config.get('R2_ACCESS_KEY_ID', { infer: true });
    const secretAccessKey = config.get('R2_SECRET_ACCESS_KEY', { infer: true });
    const bucket = config.get('R2_BUCKET', { infer: true });
    const endpoint =
      config.get('R2_ENDPOINT', { infer: true }) ??
      (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

    this.downloadTtl = config.get('MEDIA_URL_TTL_SECONDS', { infer: true });
    this.uploadTtl = config.get('UPLOAD_TTL_SECONDS', { infer: true });
    this.bucket = bucket ?? null;

    if (!accessKeyId || !secretAccessKey || !bucket || !endpoint) {
      this.client = null;
      this.logger.warn(
        'Object storage is not configured; upload and media endpoints will refuse.',
      );
      return;
    }

    this.client = new S3Client({
      // R2 has no regions, but the SDK requires one. `auto` is what Cloudflare
      // documents; anything else is ignored.
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });

    this.logger.log(`Object storage ready: ${endpoint}/${bucket}`);
  }

  get configured(): boolean {
    return this.client !== null;
  }

  private require(): { client: S3Client; bucket: string } {
    if (!this.client || !this.bucket) {
      throw new Error(
        'Object storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, ' +
          'R2_SECRET_ACCESS_KEY and R2_BUCKET.',
      );
    }
    return { client: this.client, bucket: this.bucket };
  }

  /**
   * The key layout, fixed in one place.
   *
   * Vault first, so a whole vault's objects share a prefix — which is what
   * makes "delete everything belonging to this family" a prefix operation
   * rather than a row-by-row walk, and makes per-vault usage measurable
   * without touching the database.
   */
  key(parts: {
    vaultId: string;
    memoryId: string;
    assetId: string;
    variant?: string;
  }): string {
    const variant = parts.variant ?? 'original';
    return `vault/${parts.vaultId}/memory/${parts.memoryId}/asset/${parts.assetId}/${variant}`;
  }

  /**
   * The asset id back out of a key.
   *
   * Lives here rather than at the call site because it is the same layout
   * read backwards: a parser somewhere else would be a second copy of the
   * format, free to disagree with `key()` the day the layout changes.
   */
  assetIdFromKey(key: string): string | null {
    const parts = key.split('/');
    return parts[4] === 'asset' && parts[5] ? parts[5] : null;
  }

  /**
   * A URL the client may PUT to, once.
   *
   * `ContentLength` is signed in, not merely declared: the signature covers
   * it, so a client that promised 5 MB cannot then upload 5 GB and bill the
   * product for the difference.
   */
  async presignUpload(
    key: string,
    contentType: string,
    bytes: number,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    const { client, bucket } = this.require();

    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: bytes,
      }),
      { expiresIn: this.uploadTtl },
    );

    return { url, expiresInSeconds: this.uploadTtl };
  }

  /**
   * A URL the client may GET, briefly.
   *
   * ═════════════════════════════════════════════════════════════════════════
   *  The TTL here is the bound on share-revocation exposure.
   * ═════════════════════════════════════════════════════════════════════════
   *
   * Revoking a share stops the next request at once, but a signed URL already
   * handed out keeps working until it expires. Five minutes is what makes
   * "revocation is immediate" true in practice rather than in principle.
   */
  async presignDownload(
    key: string,
    ttlSeconds?: number,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    const { client, bucket } = this.require();
    const expiresIn = ttlSeconds ?? this.downloadTtl;

    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn },
    );

    return { url, expiresInSeconds: expiresIn };
  }

  /**
   * Confirm an object is really there, and how big it actually is.
   *
   * Called before a `media_assets` row is written. The client tells us it
   * uploaded 5 MB; this asks the store. Trusting the client would let a row
   * claim an object that does not exist — and the first anyone would know is
   * a grandchild opening an empty photograph in 2046.
   */
  async head(key: string): Promise<StoredObject | null> {
    const { client, bucket } = this.require();

    try {
      const result = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );

      return {
        bytes: Number(result.ContentLength ?? 0),
        etag: result.ETag?.replaceAll('"', '') ?? null,
        contentType: result.ContentType ?? null,
      };
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === 'NotFound' || name === 'NoSuchKey') return null;
      throw error;
    }
  }

  /** Used by the purge job, never by a request handler. */
  async remove(key: string): Promise<void> {
    const { client, bucket } = this.require();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
}
