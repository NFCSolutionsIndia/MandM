import 'server-only';

import { cookies } from 'next/headers';

/**
 * The console's session, in httpOnly cookies.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  The admin token must never be readable by browser JavaScript.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Not `localStorage`, not a JS-readable cookie, not a prop passed into a
 * Client Component. This token opens a console that can read other people's
 * family archives under break-glass — anything that puts it in reach of an
 * extension, an XSS, or a screenshot of devtools is the wrong place for it.
 *
 * `httpOnly` means the browser will send it and the page cannot read it. Every
 * API call that uses it happens on the server.
 */

const SESSION = 'mm_admin_session';
const MFA = 'mm_admin_mfa';
const EMAIL = 'mm_admin_email';

const secure = process.env.NODE_ENV === 'production';

const base = {
  httpOnly: true,
  secure,
  /**
   * `strict`, not `lax`.
   *
   * The console is never linked to from anywhere, so there is no navigation
   * this breaks — and it removes a whole class of cross-site request forgery
   * without relying on a token the forms would otherwise have to carry.
   */
  sameSite: 'strict' as const,
  path: '/',
};

/** The fully authenticated session. Eight hours, matching the server. */
export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION, token, { ...base, maxAge: 8 * 60 * 60 });
}

export async function getSessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION)?.value ?? null;
}

/**
 * The half-authenticated token, between the emailed code and the TOTP.
 *
 * Ten minutes: long enough to open an authenticator app, short enough that an
 * abandoned half-sign-in does not sit in a browser all day. It is useless on
 * its own — the server refuses it on every route but the TOTP one — but there
 * is no reason to keep it around either.
 */
export async function setMfaCookie(token: string): Promise<void> {
  (await cookies()).set(MFA, token, { ...base, maxAge: 10 * 60 });
}

export async function getMfaToken(): Promise<string | null> {
  return (await cookies()).get(MFA)?.value ?? null;
}

/**
 * The address being signed in, so the second screen can submit it without
 * putting it in a URL where it would reach server logs and browser history.
 */
export async function setPendingEmail(email: string): Promise<void> {
  (await cookies()).set(EMAIL, email, { ...base, maxAge: 10 * 60 });
}

export async function getPendingEmail(): Promise<string | null> {
  return (await cookies()).get(EMAIL)?.value ?? null;
}

/** Clears everything. Used on sign-out and whenever a step fails. */
export async function clearSession(): Promise<void> {
  const store = await cookies();
  for (const name of [SESSION, MFA, EMAIL]) store.delete(name);
}

/** Clears only the in-progress sign-in, leaving any live session alone. */
export async function clearSignInProgress(): Promise<void> {
  const store = await cookies();
  for (const name of [MFA, EMAIL]) store.delete(name);
}
