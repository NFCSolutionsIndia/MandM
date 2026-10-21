import { z } from 'zod';

import { DELIVERY_CHANNEL, UNLOCK_KIND } from '../shared/enums.js';

/**
 * Request shapes for the capsule endpoints.
 *
 * A capsule is the thing the product exists for, so these are the shapes that
 * have to still make sense in 2046. Declared here and nowhere else, so the
 * generated Swift and Kotlin clients cannot drift from what the server takes.
 */

export const createCapsuleSchema = z
  .object({
    title: z.string().trim().max(300).optional(),

    /** The message. Frozen by a trigger once sealed — see migration 0005. */
    note: z.string().trim().max(50_000).optional(),

    unlockKind: z.enum(UNLOCK_KIND).default('datetime'),

    /**
     * The instant. Required for a `datetime` capsule and checked again by
     * `ck_capsules_datetime_has_time` — a promise with no date would sit in
     * the table forever and never fire.
     */
    unlockAt: z.coerce.date().optional(),

    /**
     * The zone the sender MEANT, kept beside the instant rather than folded
     * into it.
     *
     * An instant alone cannot answer "deliver this on her birthday morning".
     * Without it, a message written for a daughter in Pune and scheduled from
     * a laptop in London arrives at 03:00 her time — which, for a message
     * from somebody who has died, is a cruelty worth preventing.
     */
    unlockTimezone: z.string().trim().max(64).optional(),

    /** "Open when Aarav turns 18." */
    milestoneMemberId: z.string().uuid().optional(),
    milestoneSpec: z.record(z.string(), z.unknown()).optional(),

    /** The device's own id, so a retry returns the same capsule. */
    clientId: z.string().uuid().optional(),
  })
  .refine((v) => v.unlockKind !== 'datetime' || v.unlockAt !== undefined, {
    path: ['unlockAt'],
    message: 'a datetime capsule needs an unlockAt',
  })
  .refine(
    (v) => v.unlockKind !== 'milestone' || v.milestoneMemberId !== undefined,
    {
      path: ['milestoneMemberId'],
      message: 'a milestone capsule needs the member whose milestone it is',
    },
  );

/**
 * Editing. Every field optional, because a PATCH that required the whole
 * capsule back would make "fix one typo" a read-modify-write race.
 */
export const updateCapsuleSchema = z.object({
  title: z.string().trim().max(300).nullish(),
  note: z.string().trim().max(50_000).nullish(),
  unlockAt: z.coerce.date().optional(),
  unlockTimezone: z.string().trim().max(64).nullish(),
});

export const addRecipientSchema = z
  .object({
    name: z.string().trim().min(1).max(200),

    /**
     * Either an address or a saved member, never neither.
     *
     * `memberId` is optional on purpose: forcing every recipient to be saved
     * to the address book first puts a form between a person and the promise
     * they are trying to make.
     */
    email: z.string().trim().email().max(320).optional(),
    phone: z.string().trim().max(32).optional(),
    memberId: z.string().uuid().optional(),

    preferredChannel: z.enum(DELIVERY_CHANNEL).default('email'),
  })
  .refine((v) => v.email !== undefined || v.phone !== undefined, {
    path: ['email'],
    message: 'a recipient needs an email address or a phone number',
  })
  .refine((v) => v.preferredChannel !== 'email' || v.email !== undefined, {
    path: ['email'],
    message: 'the preferred channel is email, so an email address is required',
  })
  .refine((v) => v.preferredChannel !== 'sms' || v.phone !== undefined, {
    path: ['phone'],
    message: 'the preferred channel is sms, so a phone number is required',
  });

export const attachMemoriesSchema = z.object({
  memoryIds: z.array(z.string().uuid()).min(1).max(100),
});

export const listCapsulesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  state: z.string().trim().max(16).optional(),
});

export const replySchema = z.object({
  body: z.string().trim().min(1).max(20_000),
  mediaId: z.string().uuid().optional(),
});

export type CreateCapsuleDto = z.infer<typeof createCapsuleSchema>;
export type UpdateCapsuleDto = z.infer<typeof updateCapsuleSchema>;
export type AddRecipientDto = z.infer<typeof addRecipientSchema>;
export type AttachMemoriesDto = z.infer<typeof attachMemoriesSchema>;
export type ListCapsulesDto = z.infer<typeof listCapsulesSchema>;
export type ReplyDto = z.infer<typeof replySchema>;
