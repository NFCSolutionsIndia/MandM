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

/**
 * Mobile number in E.164: `+`, country code, subscriber number, 8–15 digits
 * in all. Spaces, dashes, dots and brackets are removed first, so
 * `+1 (512) 555-0134` is stored as `+15125550134`.
 */
const phoneField = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s\-().]/g, ''))
  .pipe(
    z
      .string()
      .regex(
        /^\+[1-9]\d{7,14}$/,
        'must be in international format, e.g. +15125550134',
      ),
  );

export const requestCodeSchema = z.object({
  email: emailField,

  /**
   * Optional sign-up details. Used only if verifying this code CREATES the
   * account. An existing account's profile is never changed by them.
   */
  fullName: z
    .string()
    .trim()
    .min(1, 'must not be empty')
    .max(200, 'must be at most 200 characters')
    .optional(),
  mobileNumber: phoneField.optional(),
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

export const refreshSchema = z.object({
  /**
   * The raw refresh token from `/auth/verify` or the previous `/auth/refresh`.
   * 43 characters of base64url today; the bound only keeps an absurd body
   * from reaching the hash.
   */
  refreshToken: z.string().trim().min(1, 'is required').max(256),
});

export type RequestCodeDto = z.infer<typeof requestCodeSchema>;
export type VerifyCodeDto = z.infer<typeof verifyCodeSchema>;
export type RefreshDto = z.infer<typeof refreshSchema>;
