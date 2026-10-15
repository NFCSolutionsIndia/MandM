import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Token and code generation.
 *
 * One rule governs this whole file: **what the database stores is never what
 * the user holds.** Every value here is generated, handed out once, and kept
 * only as a SHA-256 digest — so a leaked backup contains nothing that opens
 * anything.
 */

/** SHA-256, hex. The only form in which a secret reaches the database. */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * A session token: 32 bytes from the CSPRNG, base64url.
 *
 * Not derived from the session id. Ids are UUIDv7 and therefore time-ordered,
 * so a token derived from one would be guessable from a neighbouring token.
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * A six-digit sign-in code.
 *
 * `randomInt` rather than `Math.random()`: the latter is not a CSPRNG, and a
 * predictable sign-in code is an account takeover rather than a nuisance.
 *
 * Six digits is weak on its own — one in a million. Its security comes from
 * the ten-minute expiry and the five-attempt limit enforced in
 * `app_redeem_email_code`, not from the number itself.
 */
export function generateEmailCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Constant-time comparison for two hex digests.
 *
 * The database comparison inside `app_redeem_email_code` is not constant-time,
 * and that is acceptable there: the attempt counter closes the attack long
 * before a timing signal becomes usable. This exists for comparisons made in
 * the application, where no counter is watching.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
