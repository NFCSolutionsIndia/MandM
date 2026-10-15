import { Suspense } from 'react';

import { apiBaseUrl, apiGet, type Readiness } from '@/lib/api';

/**
 * The admin console, as far as it goes today: a status page.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  There is no sign-in here yet, and that is on purpose.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The admin realm is deliberately separate from the user realm — `admin_users`
 * is its own table with its own role, its own mandatory MFA and its own audit
 * expectation. Bolting this console onto the user session would be exactly the
 * mistake the schema was shaped to prevent: a compromised customer account
 * becoming a compromised console.
 *
 * So this page proves the two halves run together and nothing more. The real
 * console starts with the `mm_admin` database role.
 */

export const metadata = {
  title: 'M&M Admin',
  description: 'Moments & Memories — operations console',
};

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
 * The only part of this page that touches the network.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  No `export const dynamic`. With `cacheComponents` enabled — which this
 *  template turns on — that config is rejected outright at build time.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The replacement is better anyway: isolate the uncached work in its own
 * component and wrap it in `<Suspense>`. The shell is prerendered and ships
 * immediately; the health check streams in when it answers. A console that
 * blanks for five seconds because the backend is slow is a console nobody can
 * use during the incident they opened it for.
 */
async function BackendStatus() {
  const result = await apiGet<Readiness>('/health/ready');
  const db = result.data?.database;

  if (!result.ok || !db) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30">
        <p className="text-sm font-medium text-red-800 dark:text-red-300">
          The API is not reachable.
        </p>
        <p className="mt-1 font-mono text-xs text-red-700 dark:text-red-400">
          {result.error}
        </p>
        <p className="mt-3 text-xs text-red-700/80 dark:text-red-400/80">
          Start it with <code className="font-mono">npm run dev:backend</code>{' '}
          from the repository root.
        </p>
      </div>
    );
  }

  return (
    <>
      <dl>
        <Row label="API" value="reachable" tone="good" />
        <Row
          label="Database"
          value={db.connected ? 'connected' : 'unreachable'}
          tone={db.connected ? 'good' : 'bad'}
        />
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

      {!db.rlsEnforced ? (
        <p className="mt-4 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <strong>The API is connected as a superuser.</strong> Every row-level
          security policy is being bypassed —{' '}
          <code className="font-mono">DATABASE_URL</code> must point at{' '}
          <code className="font-mono">mm_app</code>.
        </p>
      ) : null}
    </>
  );
}

function StatusSkeleton() {
  return (
    <div className="space-y-3 py-1" aria-busy="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-4 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800"
        />
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16">
      <header className="mb-10">
        <p className="font-mono text-xs uppercase tracking-[0.15em] text-zinc-400">
          Moments &amp; Memories
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Operations console
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Scaffold only. Sign-in arrives with the{' '}
          <code className="font-mono">mm_admin</code> database role — the admin
          realm is separate from the user realm by design, so this console will
          never accept a customer session.
        </p>
      </header>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Backend
        </h2>
        <p className="mb-4 font-mono text-xs text-zinc-400">{apiBaseUrl()}</p>

        <Suspense fallback={<StatusSkeleton />}>
          <BackendStatus />
        </Suspense>
      </section>
    </main>
  );
}
