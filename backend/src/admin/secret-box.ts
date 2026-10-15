import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Encryption for the things `admin_users` holds in `_enc` columns.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  A TOTP secret is a bearer credential. Stored in the clear, a database dump
 *  lets the reader generate valid second factors for every admin forever.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * It cannot be hashed like a password or a token, because the server must
 * reproduce it to check a code. So it is *encrypted*, with a key that lives
 * outside the database — which means a leaked backup is not enough on its own.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt rather
 * than decrypting to something attacker-chosen. The nonce is random per
 * encryption and stored alongside, as it must be — a reused nonce under the
 * same key breaks GCM completely.
 */

const ALGORITHM = 'aes-256-gcm';
const NONCE_BYTES = 12; // 96 bits, the size GCM is defined for
const TAG_BYTES = 16;

export class SecretBox {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    const key = Buffer.from(base64Key, 'base64');

    if (key.length !== 32) {
      // Failing at construction means a misconfigured deploy cannot start.
      // The alternative is discovering it when the first admin tries to sign
      // in, which is both later and worse.
      throw new Error(
        'ADMIN_ENCRYPTION_KEY must decode to exactly 32 bytes. ' +
          "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
      );
    }

    this.key = key;
  }

  /** `nonce.ciphertext.tag`, all base64url. */
  seal(plaintext: string): string {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, nonce);

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    return [
      nonce.toString('base64url'),
      ciphertext.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
    ].join('.');
  }

  /**
   * Returns `null` rather than throwing on anything malformed or tampered.
   *
   * The caller's only sensible response is "this did not authenticate", and a
   * thrown error at this layer tends to become a stack trace in a log that
   * names the admin it belonged to.
   */
  open(sealed: string): string | null {
    const parts = sealed.split('.');
    if (parts.length !== 3) return null;

    try {
      const nonce = Buffer.from(parts[0], 'base64url');
      const ciphertext = Buffer.from(parts[1], 'base64url');
      const tag = Buffer.from(parts[2], 'base64url');

      if (nonce.length !== NONCE_BYTES || tag.length !== TAG_BYTES) return null;

      const decipher = createDecipheriv(ALGORITHM, this.key, nonce);
      decipher.setAuthTag(tag);

      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      // Authentication failure, which is exactly what GCM is for.
      return null;
    }
  }
}

/**
 * Constant-time comparison of two short strings.
 *
 * Used for backup codes, which are compared in the application rather than by
 * the database. A length check leaks length, which for fixed-format codes
 * tells an attacker nothing they did not already know.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
