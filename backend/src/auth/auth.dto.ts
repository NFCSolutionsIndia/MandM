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

/** `+` and a 1–3 digit country code: `+91`, `+1`, `+971`. */
const countryCodeField = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{0,2}$/, 'must be + and 1–3 digits, e.g. +91');

/**
 * Exactly 10 digits, without the country code. Spaces and dashes are removed
 * first, so `98765 43215` and `98765-43215` are accepted.
 */
const mobileNumberField = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^\d{10}$/, 'must be exactly 10 digits'));

export const requestCodeSchema = z
  .object({
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

    /** Sent together or not at all. Stored as one number: `+919876543215`. */
    countryCode: countryCodeField.optional(),
    mobileNumber: mobileNumberField.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.countryCode && !v.mobileNumber) {
      ctx.addIssue({
        code: 'custom',
        path: ['mobileNumber'],
        message: 'is required when countryCode is sent',
      });
    }
    if (v.mobileNumber && !v.countryCode) {
      ctx.addIssue({
        code: 'custom',
        path: ['countryCode'],
        message: 'is required when mobileNumber is sent, e.g. +91',
      });
    }
  });

/** The stored form: country code + number, e.g. `+919876543215`, or null. */
export function fullPhone(dto: RequestCodeDto): string | null {
  return dto.countryCode && dto.mobileNumber
    ? `${dto.countryCode}${dto.mobileNumber}`
    : null;
}

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
