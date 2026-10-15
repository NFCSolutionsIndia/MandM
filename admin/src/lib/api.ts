import 'server-only';

/**
 * The backend, as seen from the admin console.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  `server-only`, and that import is load-bearing.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * It makes the build fail if this module is ever pulled into a Client
 * Component. The admin console reads other people's family archives; a
 * credential that reaches the browser is a credential in a browser extension's
 * reach, in a screenshot, and in the devtools of whoever is standing behind
 * the agent.
 *
 * So every call to the API happens in a Server Component or a Route Handler,
 * and the browser never holds an admin token.
 */

/**
 * Not `NEXT_PUBLIC_`. That prefix inlines a value into the client bundle,
 * which is exactly what must not happen to anything on this path.
 */
const API_URL = process.env.MM_API_URL ?? 'http://127.0.0.1:3000';

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

/**
 * One GET, with the failure modes made explicit.
 *
 * It returns a result rather than throwing, because "the API is down" is a
 * state this console has to *render* — an admin needs to know the backend is
 * unreachable, not meet an error page that could mean anything.
 */
export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  const url = `${API_URL}${path}`;

  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },

      /**
       * Explicit, though it is also the default in Next 16.
       *
       * Stating it means the next person does not have to remember which
       * version changed the default — and on an operational console, a cached
       * health check is worse than no health check.
       */
      cache: 'no-store',

      // A console that hangs is a console nobody can use during an incident.
      signal: AbortSignal.timeout(5_000),
    });

    const body = (await response.json().catch(() => null)) as T | null;

    return {
      ok: response.ok,
      status: response.status,
      data: response.ok ? body : null,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'TimeoutError'
        ? 'The API did not respond within 5 seconds'
        : error instanceof Error
          ? error.message
          : 'Unknown error';

    return { ok: false, status: 0, data: null, error: message };
  }
}

/**
 * One POST, optionally authenticated.
 *
 * The token is passed in rather than read from cookies here, so this module
 * stays a transport and the decision about WHICH credential to use belongs to
 * the caller. The half-authenticated MFA token and the full session token are
 * both bearers and must never be confused for one another.
 */
export async function apiPost<T>(
  path: string,
  body: unknown,
  token?: string | null,
): Promise<ApiResult<T>> {
  return send<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}

/** One authenticated GET. */
export async function apiGetAuthed<T>(
  path: string,
  token: string,
): Promise<ApiResult<T>> {
  return send<T>(path, { method: 'GET', token });
}

async function send<T>(
  path: string,
  options: { method: string; body?: string; token?: string | null },
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body) headers['content-type'] = 'application/json';
  if (options.token) headers.authorization = `Bearer ${options.token}`;

  try {
    const response = await fetch(`${API_URL}${path}`, {
      method: options.method,
      headers,
      body: options.body,
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });

    const parsed = (await response.json().catch(() => null)) as T | null;

    return {
      ok: response.ok,
      status: response.status,
      data: response.ok ? parsed : null,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'TimeoutError'
        ? 'The API did not respond'
        : error instanceof Error
          ? error.message
          : 'Unknown error';

    return { ok: false, status: 0, data: null, error: message };
  }
}

/** What `/admin/v1/auth/verify-email` answers with. */
export interface FirstFactor {
  mfaToken: string;
  mfaRequired: boolean;
  enrolmentRequired: boolean;
  enrolment?: { secret: string; uri: string; backupCodes: string[] };
}

/** What `/admin/v1/auth/me` answers with. */
export interface AdminIdentity {
  id: string;
  email: string;
  role: string;
  lastLoginAt: string | null;
  permissions: { module: string; action: string }[];
}

export interface Readiness {
  status: string;
  database: {
    connected: boolean;
    role: string;
    latencyMs: number;
    rlsEnforced: boolean;
  };
}

export function apiBaseUrl(): string {
  return API_URL;
}
