import { z } from 'zod';

/**
 * Request shapes for the auth endpoints.
 *
 * Declared here and nowhere else, so that the OpenAPI document and the
 * generated Swift and Kotlin clients cannot drift from what the server
 * actually accepts.
 */

/**
 * Lower-cased before it reaches the database.
 *
 * `users.email` is `citext`, so this is belt and braces — but it also means
 * the rate-limit counter and the log line agree with the stored row, which
 * they would not if one said `Aarav@x.com` and the other `aarav@x.com`.
 */
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email('must be a valid email address')
  .max(320, 'must be at most 320 characters');

export const requestCodeSchema = z.object({
  email: emailField,
});

export const verifyCodeSchema = z.object({
  email: emailField,

  /**
   * Exactly six digits.
   *
   * Rejecting anything else here costs a database round trip that would
   * otherwise burn one of the five allowed attempts — so a typed letter does
   * not spend a guess.
   */
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'must be six digits'),
});

export type RequestCodeDto = z.infer<typeof requestCodeSchema>;
export type VerifyCodeDto = z.infer<typeof verifyCodeSchema>;
