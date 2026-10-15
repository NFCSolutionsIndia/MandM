'use server';

import { redirect } from 'next/navigation';

import { apiPost, type FirstFactor } from '@/lib/api';
import {
  clearSignInProgress,
  getMfaToken,
  getPendingEmail,
  setMfaCookie,
  setPendingEmail,
  setSessionCookie,
} from '@/lib/session';

/**
 * The sign-in flow, as Server Actions.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  No client JavaScript anywhere in this flow.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Plain `<form action={...}>` posting to the server. The tokens never enter a
 * client bundle, never land in `localStorage`, and never pass through a prop —
 * they go straight from the API response into an httpOnly cookie, on the
 * server, in the same function.
 *
 * It also means the console signs in with JavaScript disabled, which is a
 * small thing until the one evening the bundle fails to load and somebody
 * needs to read an incident.
 */

/** Step one: ask for a code. */
export async function requestCode(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();

  if (!email.includes('@')) {
    redirect('/login?error=email');
  }

  const result = await apiPost('/api/v1/admin/v1/auth/request-code', { email });

  if (!result.ok) {
    redirect('/login?error=unreachable');
  }

  // The address goes in a cookie rather than the URL: a query string reaches
  // server logs, browser history and any Referer header that leaves the page.
  await setPendingEmail(email);

  redirect('/login/code');
}

/** Step two: redeem it, and find out whether a device is enrolled yet. */
export async function verifyEmail(formData: FormData): Promise<void> {
  const email = await getPendingEmail();
  if (!email) redirect('/login');

  const code = String(formData.get('code') ?? '').trim();

  const result = await apiPost<FirstFactor>(
    '/api/v1/admin/v1/auth/verify-email',
    { email, code },
  );

  if (!result.ok || !result.data) {
    // One message for every failure, matching the API. Saying "that address is
    // not an admin" here would undo the care taken on the server.
    redirect('/login/code?error=code');
  }

  await setMfaCookie(result.data.mfaToken);

  // The enrolment material exists in this response and nowhere else, ever
  // again. It is handed to the next screen through the redirect rather than
  // stored, so it lives exactly as long as the page that shows it.
  if (result.data.enrolmentRequired && result.data.enrolment) {
    const params = new URLSearchParams({
      uri: result.data.enrolment.uri,
      secret: result.data.enrolment.secret,
      codes: result.data.enrolment.backupCodes.join(','),
    });
    redirect(`/login/enrol?${params.toString()}`);
  }

  redirect('/login/totp');
}

/** Step three: the second factor. */
export async function verifyTotp(formData: FormData): Promise<void> {
  const mfaToken = await getMfaToken();
  if (!mfaToken) redirect('/login');

  const code = String(formData.get('code') ?? '').trim();

  const result = await apiPost<{ token: string }>(
    '/api/v1/admin/v1/auth/verify-totp',
    { code },
    mfaToken,
  );

  if (!result.ok || !result.data) {
    redirect('/login/totp?error=code');
  }

  await setSessionCookie(result.data.token);
  await clearSignInProgress();

  redirect('/');
}

/** Sign out, server-side, so the session is revoked rather than forgotten. */
export async function signOut(): Promise<void> {
  const { getSessionToken, clearSession } = await import('@/lib/session');
  const token = await getSessionToken();

  if (token) {
    // Revoking at the API matters: clearing the cookie alone would leave a
    // live session that anybody holding the token could still use.
    await apiPost('/api/v1/admin/v1/auth/sign-out', {}, token);
  }

  await clearSession();
  redirect('/login');
}
