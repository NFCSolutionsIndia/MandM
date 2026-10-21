import 'dotenv/config';
import { Pool } from 'pg';

/**
 * Grant, revoke and inspect admin-console access.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  There is no endpoint for this, and that is the design.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Staff cannot sign themselves up, and no admin can promote anybody — not
 * even to their own role. Becoming staff requires database access, which
 * means it requires the people who hold the database. An "invite an admin"
 * button is a button an attacker who takes one console session can press.
 *
 * This script is a safer hand than raw SQL for the same operations: it
 * refuses unknown roles, it deactivates rather than deletes, and it says what
 * it changed.
 *
 *   npm run admin -- list
 *   npm run admin -- grant someone@company.com [role]
 *   npm run admin -- revoke someone@company.com
 *   npm run admin -- restore someone@company.com
 *   npm run admin -- reset-mfa someone@company.com
 */

const [command, email, roleName] = process.argv.slice(2);

/**
 * The OWNER connection. `mm_admin` deliberately cannot write this table —
 * the console must not be able to change who the console lets in.
 */
const url = process.env.MIGRATION_DATABASE_URL;

if (!url) {
  console.error('MIGRATION_DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
const db = url.includes('mm_dev') ? 'mm_dev' : url.split('/').pop();

async function list() {
  const { rows } = await pool.query(
    `SELECT a.email, r.name AS role, a.is_active,
            a.totp_secret_enc IS NOT NULL AS enrolled, a.last_login_at
       FROM admin_users a JOIN roles r ON r.id = a.role_id
      ORDER BY a.created_at`,
  );

  if (!rows.length) {
    console.log('\n  No admin users. Nobody can sign in to the console.\n');
    return;
  }

  console.log(`\n  Admin access on ${db}:\n`);
  for (const r of rows) {
    const state = r.is_active ? 'active ' : 'REVOKED';
    const mfa = (r.enrolled ? 'enrolled' : 'NOT ENROLLED').padEnd(12);
    const seen = r.last_login_at
      ? new Date(r.last_login_at).toISOString().slice(0, 16).replace('T', ' ')
      : 'never';
    console.log(`  ${state}  ${mfa}  ${String(r.email).padEnd(34)} ${String(r.role).padEnd(10)} last seen ${seen}`);
  }
  console.log();
}

async function grant() {
  const wanted = roleName ?? 'support';

  const { rows: roles } = await pool.query(
    `SELECT id, name FROM roles WHERE name = $1`,
    [wanted],
  );

  if (!roles[0]) {
    const { rows: all } = await pool.query(`SELECT name FROM roles ORDER BY name`);
    console.error(
      `\n  No role named "${wanted}". Available: ${all.map((r) => r.name).join(', ')}\n`,
    );
    process.exit(1);
  }

  // Re-granting an existing admin changes their role and reactivates them,
  // but never touches totp_secret_enc — losing somebody's second factor
  // because you corrected their role would be a nasty surprise.
  const { rows } = await pool.query(
    `INSERT INTO admin_users (id, email, role_id)
     VALUES (uuid_generate_v7(), $1, $2)
     ON CONFLICT (email)
       DO UPDATE SET role_id = excluded.role_id, is_active = true, updated_at = now()
     RETURNING email, is_active, totp_secret_enc IS NOT NULL AS enrolled`,
    [email, roles[0].id],
  );

  const a = rows[0];
  console.log(`\n  ${a.email} can now sign in to the console as "${wanted}".`);
  console.log(
    a.enrolled
      ? '  They are already enrolled; their existing authenticator still works.\n'
      : '  On first sign-in they will be shown a TOTP secret ONCE. It cannot be recovered.\n',
  );
}

async function setActive(active: boolean) {
  const { rows } = await pool.query(
    `UPDATE admin_users SET is_active = $2, updated_at = now()
      WHERE email = $1 RETURNING email`,
    [email, active],
  );

  if (!rows[0]) {
    console.error(`\n  ${email} is not an admin.\n`);
    process.exit(1);
  }

  if (active) {
    console.log(`\n  ${email} can sign in again.\n`);
    return;
  }

  /**
   * Deactivated, never deleted.
   *
   * `moderation_flags.reviewed_by` and `break_glass_access.admin_id` are both
   * ON DELETE RESTRICT, so the database refuses to remove anybody who has
   * reviewed a flag or opened a vault under break-glass. That refusal is the
   * point: deleting staff would erase who approved what, and the audit trail
   * is the only thing that makes those powers accountable.
   *
   * `is_active = false` is checked inside `app_admin_redeem_code`, so it
   * takes effect on the next sign-in attempt whatever the application does.
   */
  const { rowCount } = await pool.query(
    `UPDATE admin_sessions SET revoked_at = now()
      WHERE admin_id = (SELECT id FROM admin_users WHERE email = $1)
        AND revoked_at IS NULL AND expires_at > now()`,
    [email],
  );

  console.log(`\n  ${email} can no longer sign in.`);
  console.log(`  ${rowCount} live session(s) revoked — they are out now, not in 8 hours.\n`);
}

async function resetMfa() {
  /**
   * For a lost phone. Enrolment is refused while a secret exists — otherwise
   * anybody holding a first-factor token could replace the second factor with
   * one of their own — so re-enrolling means clearing it here first.
   */
  const { rows } = await pool.query(
    `UPDATE admin_users
        SET totp_secret_enc = NULL, backup_codes_enc = NULL, updated_at = now()
      WHERE email = $1 RETURNING email`,
    [email],
  );

  if (!rows[0]) {
    console.error(`\n  ${email} is not an admin.\n`);
    process.exit(1);
  }

  console.log(`\n  Second factor cleared for ${email}.`);
  console.log('  Their next sign-in will show a new secret, once.\n');
}

const needsEmail = ['grant', 'revoke', 'restore', 'reset-mfa'];

if (needsEmail.includes(command ?? '') && !email) {
  console.error(`\n  Usage: npm run admin -- ${command} <email>\n`);
  process.exit(1);
}

switch (command) {
  case 'list':
    await list();
    break;
  case 'grant':
    await grant();
    break;
  case 'revoke':
    await setActive(false);
    break;
  case 'restore':
    await setActive(true);
    break;
  case 'reset-mfa':
    await resetMfa();
    break;
  default:
    console.error(
      [
        '',
        '  npm run admin -- list',
        '  npm run admin -- grant <email> [role]    default role: support',
        '  npm run admin -- revoke <email>          deactivate + kill live sessions',
        '  npm run admin -- restore <email>',
        '  npm run admin -- reset-mfa <email>       for a lost authenticator',
        '',
      ].join('\n'),
    );
    process.exit(1);
}

await pool.end();
