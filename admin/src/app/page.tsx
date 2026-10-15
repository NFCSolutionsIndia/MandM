import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { signOut } from '@/app/login/actions';
import {
  apiBaseUrl,
  apiGet,
  apiGetAuthed,
  type AdminIdentity,
  type Readiness,
} from '@/lib/api';
import { getSessionToken } from '@/lib/session';

export const metadata = { title: 'M&M Admin' };

/**
 * Blocking, so the session gate is a REAL redirect.
 *
 * With the check inside <Suspense>, an unauthenticated request got HTTP 200
 * and a redirect streamed into the body. A browser follows it; curl, a probe,
 * a crawler and a misconfigured proxy all see a successful page instead.
 *
 * The two data reads still stream behind their own boundaries, so the cost is
 * the shell arriving a few milliseconds later rather than the whole page
 * blocking on the API.
 */
export const instant = false;

function Row({
  label,
  value,
  tone = 'plain',
}: {
  label: string;
  value: string;
  tone?: 'plain' | 'good' | 'bad';
}) {
  const colour =
    tone === 'good'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'bad'
        ? 'text-red-700 dark:text-red-400'
        : 'text-zinc-900 dark:text-zinc-100';

  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-zinc-200 py-2.5 last:border-0 dark:border-zinc-800">
      <dt className="text-sm text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className={`font-mono text-sm font-medium ${colour}`}>{value}</dd>
    </div>
  );
}

/**
 * The identity, fetched with the session cookie — on the server.
 *
 * The token is read from an httpOnly cookie and used in a `fetch` that never
 * leaves this process. The browser holds a cookie it cannot read and nothing
 * else; no admin token is ever in a client bundle, a prop, or `localStorage`.
 */
function Identity({ me }: { me: AdminIdentity }) {
  return (
    <>
      <dl>
        <Row label="Signed in as" value={me.email} />
        <Row label="Role" value={me.role} />
        <Row
          label="Last sign-in"
          value={
            me.lastLoginAt
              ? new Date(me.lastLoginAt).toLocaleString('en-GB')
              : '—'
          }
        />
      </dl>

      <h3 className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
        Permissions
      </h3>
      {me.permissions.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {me.permissions.map((p) => (
            <li
              key={`${p.module}.${p.action}`}
              className="rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
            >
              {p.module}.{p.action}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">No permissions granted.</p>
      )}

      <p className="mt-5 border-t border-zinc-200 pt-4 text-xs leading-relaxed text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        <strong className="text-zinc-700 dark:text-zinc-300">
          read is not read_content.
        </strong>{' '}
        This session can find an account and read its plan. It gets zero rows
        from anybody&rsquo;s memories until a colleague approves a break-glass
        request naming that user — enforced by the database, not by this page.
      </p>
    </>
  );
}

async function BackendStatus() {
  const result = await apiGet<Readiness>('/health/ready');
  const db = result.data?.database;

  if (!result.ok || !db) {
    return (
      <p className="font-mono text-xs text-red-700 dark:text-red-400">
        unreachable — {result.error}
      </p>
    );
  }

  return (
    <dl>
      <Row
        label="Connected as"
        value={db.role}
        tone={db.role === 'mm_app' ? 'good' : 'bad'}
      />
      <Row
        label="Row-level security"
        value={db.rlsEnforced ? 'enforced' : 'BYPASSED'}
        tone={db.rlsEnforced ? 'good' : 'bad'}
      />
      <Row label="Latency" value={`${db.latencyMs} ms`} />
    </dl>
  );
}

function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 py-1" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-4 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800"
        />
      ))}
    </div>
  );
}

export default async function Home() {
  // Read before anything renders, so a signed-out visitor is redirected by the
  // server rather than by a script in a half-delivered page.
  const token = await getSessionToken();
  if (!token) redirect('/login');

  // Fetched here rather than inside <Suspense>, so a session the API refuses
  // produces a real redirect instead of one streamed into a 200. The dashboard
  // is meaningless without an identity anyway, so there is nothing lost by
  // waiting for it; the backend panel still streams.
  const me = await apiGetAuthed<AdminIdentity>(
    '/api/v1/admin/v1/auth/me',
    token,
  );

  // Revoked, expired, or the admin deactivated. /logout can clear the cookie;
  // a Server Component cannot.
  if (!me.ok || !me.data) redirect('/logout');

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16">
      <header className="mb-10 flex items-start justify-between gap-6">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.15em] text-zinc-400">
            Moments &amp; Memories
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Operations console
          </h1>
        </div>

        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Your session
        </h2>
        <Identity me={me.data} />
      </section>

      <section className="mt-5 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Backend
        </h2>
        <p className="mb-4 font-mono text-xs text-zinc-400">{apiBaseUrl()}</p>
        <Suspense fallback={<Skeleton />}>
          <BackendStatus />
        </Suspense>
      </section>
    </main>
  );
}
