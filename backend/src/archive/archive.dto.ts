import { z } from 'zod';

import { MEDIA_KIND, OCCURRED_PRECISION } from '../shared/enums.js';

/**
 * Request shapes for the archive endpoints.
 *
 * Declared here and nowhere else, so the OpenAPI document and the generated
 * Swift and Kotlin clients cannot drift from what the server accepts.
 */

export const createMemorySchema = z.object({
  title: z.string().trim().max(300).optional(),
  note: z.string().trim().max(20_000).optional(),

  /**
   * When it HAPPENED. Required, and the one field a client cannot shrug at:
   * defaulting it to "now" is how a scanned 1974 photograph ends up filed
   * under the Tuesday somebody digitised it.
   */
  occurredAt: z.coerce.date(),

  occurredPrecision: z.enum(OCCURRED_PRECISION).default('exact'),
  occasion: z.string().trim().max(32).optional(),

  /**
   * The id the DEVICE assigned, which makes a retry idempotent.
   *
   * Required, not optional. An optional idempotency key is one the client
   * will omit, and then an ambiguous failure becomes two copies of the same
   * moment.
   */
  clientId: z.string().uuid(),
});

export const listMemoriesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),

  /** Keyset pagination: the `occurredAt` of the last row you saw. */
  before: z.coerce.date().optional(),
});

export const startUploadSchema = z.object({
  memoryId: z.string().uuid(),
  filename: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(128),

  /**
   * Declared up front so the quota can be checked BEFORE a byte moves, and so
   * the signed URL can commit the client to it.
   */
  bytes: z.coerce
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024 * 1024, 'a single file may not exceed 5 GiB'),

  kind: z.enum(MEDIA_KIND),

  /** The device's own id for this upload, so a retry resumes rather than restarts. */
  clientId: z.string().uuid(),
});

export type CreateMemoryDto = z.infer<typeof createMemorySchema>;
export type ListMemoriesDto = z.infer<typeof listMemoriesSchema>;
export type StartUploadDto = z.infer<typeof startUploadSchema>;
