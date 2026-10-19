import { createHash } from 'node:crypto';
import 'dotenv/config';
import { Pool } from 'pg';

/**
 * Recover the live sign-in code for an address. **Development only.**
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  Why this has to brute-force rather than read a column.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `email_otps` stores a SHA-256 of the code and nothing else, so the code
 * cannot be read back out — not by an attacker with the database, and not by
 * this script either. It tries all one million six-digit strings against the
 * stored digest, which takes about a second.
 *
 * That is the same thing the integration suites do, and it is worth keeping
 * slow and obvious rather than adding a "dev mode" column to the table: a
 * column that holds the plaintext in development is a column somebody
 * eventually ships.
 *
 * Exists because configuring real SMTP means codes go to an inbox instead of
 * the terminal, which makes clicking through Postman tedious. This is for
 * that; the real delivery test is still sending to a real address.
 *
 *   npm run dev:code -- someone@example.com
 */

const email = process.argv[2];

if (!email) {
  console.error('Usage: npm run dev:code -- <email>');
  process.exit(1);
}

/**
 * The OWNER connection, and it has to be.
 *
 * `email_otps` is behind row-level security and `mm_app` cannot select from
 * it — which is the correct answer to "can the API read anybody's sign-in
 * code" and the reason this script needs the owner role instead.
 */
const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;

if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

// This reads a secret out of a database by exhausting its key space. It has no
// business pointing anywhere but a developer's own machine.
if (!url.includes('mm_dev')) {
  console.error('Refusing to run against anything but mm_dev.');
  process.exit(1);
}

const pool = new Pool({ connectionString: url });

const { rows } = await pool.query<{
  code_hash: string;
  expires_at: Date;
  attempts: number;
}>(
  `SELECT code_hash, expires_at, attempts
     FROM email_otps
    WHERE email = $1 AND consumed_at IS NULL AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1`,
  [email],
);

await pool.end();

if (!rows[0]) {
  console.error(`No live code for ${email}. Request one first.`);
  process.exit(1);
}

const { code_hash, expires_at, attempts } = rows[0];

for (let i = 0; i < 1_000_000; i++) {
  const candidate = String(i).padStart(6, '0');

  if (createHash('sha256').update(candidate, 'utf8').digest('hex') === code_hash) {
    const seconds = Math.round((expires_at.getTime() - Date.now()) / 1000);

    console.log(`\n  code     ${candidate}`);
    console.log(`  expires  in ${seconds}s`);
    console.log(`  attempts ${attempts} used of 5\n`);
    process.exit(0);
  }
}

console.error('Hash did not match any six-digit code.');
process.exit(1);
