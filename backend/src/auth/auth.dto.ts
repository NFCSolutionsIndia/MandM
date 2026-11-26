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
 * The 2-digit ITU country codes. Country codes are prefix-free, so the first
 * digits alone say how long the code is: `1` and `7` are one digit, these are
 * two, everything else is three. That makes "exactly 10 digits after the
 * code" exact. Without it, `+91987654321` (nine digits) would pass as `+9`
 * and ten digits.
 */
const TWO_DIGIT_COUNTRY_CODES = new Set([
  '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44',
  '45', '46', '47', '48', '49', '51', '52', '53', '54', '55', '56', '57', '58',
  '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86', '90', '91',
  '92', '93', '94', '95', '98',
]); // prettier-ignore

function countryCodeLength(digits: string): number {
  if (digits[0] === '1' || digits[0] === '7') return 1;
  return TWO_DIGIT_COUNTRY_CODES.has(digits.slice(0, 2)) ? 2 : 3;
}

/**
 * One string: `+`, the country code, then exactly 10 digits:
 * `+919876543215`, `+15125550134`, `+447911123456`. Spaces and dashes are
 * removed first, so `+91 98765 43215` is stored as `+919876543215`.
 */
const mobileNumberField = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .refine((v) => {
    const m = /^\+([1-9]\d+)$/.exec(v);
    if (!m) return false;
    return m[1].length - countryCodeLength(m[1]) === 10;
  }, 'must be + country code and exactly 10 digits, e.g. +919876543215');

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

  mobileNumber: mobileNumberField.optional(),
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
