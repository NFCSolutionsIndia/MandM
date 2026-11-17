/**
 * The format half of the username rules (BE-03).
 *
 * The other half — the reserved list — lives in ONE place, the SQL function
 * `app_username_reserved`, because the generator that names every new
 * account runs inside the database and has to obey it too. The CHECK
 * constraint `ck_users_username` repeats this pattern as the last word.
 */

/** 3–30 of `a-z 0-9 . _`, not starting or ending with `.`. (`..` is checked separately.) */
export const USERNAME_PATTERN = /^[a-z0-9_][a-z0-9._]{1,28}[a-z0-9_]$/;

/** What the user typed, as it would be stored: trimmed, no leading `@`, lower-case. */
export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, '').toLowerCase();
}

/** Why `u` (already normalised) is not a well-formed username, or null if it is. */
export function usernameProblem(u: string): string | null {
  if (u.length < 3) return 'must be at least 3 characters';
  if (u.length > 30) return 'must be at most 30 characters';
  if (/[^a-z0-9._]/.test(u)) return 'may contain only letters, numbers, . and _';
  if (u.startsWith('.') || u.endsWith('.')) return 'cannot start or end with .';
  if (u.includes('..')) return 'cannot contain ..';
  return USERNAME_PATTERN.test(u) ? null : 'is not a valid username';
}

function randomDigits(n: number): string {
  const low = 10 ** (n - 1);
  return String(low + Math.floor(Math.random() * 9 * low));
}

/**
 * Names to offer instead of `u`, best first: `aarav.k` → `aarav.k1`,
 * `aarav.k_`, `aaravk`, then a few with random digits. Only well-formed
 * ones; whether each is FREE is the database's question.
 */
export function suggestionCandidates(u: string): string[] {
  let base = u
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+/, '')
    .slice(0, 26)
    .replace(/\.+$/, '');
  if (base.length < 3) base = `user${base}`;
  const compact = base.replace(/[._]/g, '');

  const candidates = [
    `${base}1`,
    `${base}_`,
    compact,
    `${base}2`,
    `${base}_${randomDigits(2)}`,
    `${compact}${randomDigits(2)}`,
    `${base}${randomDigits(3)}`,
    `${base}${randomDigits(4)}`,
  ];

  return [...new Set(candidates)].filter(
    (c) => c !== u && usernameProblem(c) === null,
  );
}
