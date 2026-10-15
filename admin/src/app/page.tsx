import { redirect } from 'next/navigation';

import { signOut } from '@/app/login/actions';
import { Incidents } from '@/components/incidents';
import { CalendarIcon, SearchIcon } from '@/components/icons';
import {
  Deliveries,
  Kpis,
  Sev0Banner,
  SystemHealth,
  Tasks,
  Timeline,
  UnlockLoad,
} from '@/components/panels';
import { Rail } from '@/components/rail';
import { apiGetAuthed, type AdminIdentity } from '@/lib/api';
import { loadDashboard } from '@/lib/dashboard';
import { getSessionToken } from '@/lib/session';

export const metadata = { title: 'Overview · M&M Admin' };

/**
 * Blocking, so the session gate is a real redirect rather than one streamed
 * into a 200. The whole screen is request data anyway — there is no static
 * shell worth prerendering for an operations console.
 */
export const instant = false;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function initialsOf(email: string): string {
  return email
    .split(/[\s.@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export default async function Overview() {
  const token = await getSessionToken();
  if (!token) redirect('/login');

  const me = await apiGetAuthed<AdminIdentity>(
    '/api/v1/admin/v1/auth/me',
    token,
  );

  // Revoked, expired, or deactivated. /logout can clear the cookie; a Server
  // Component cannot.
  if (!me.ok || !me.data) redirect('/logout');

  const dashboard = await loadDashboard(token);

  const first = me.data.email.split('@')[0].split('.')[0];
  const name = first.charAt(0).toUpperCase() + first.slice(1);
  const initials = initialsOf(me.data.email);

  return (
    <div className="bg-mm-black flex min-h-screen gap-2 p-2">
      <Rail initials={initials} />

      {dashboard.ok && dashboard.data ? (
        <Incidents data={dashboard.data} />
      ) : (
        <aside className="w-[300px] shrink-0 py-5">
          <p className="bg-mm-ink-raised border-mm-ink-line text-mm-on-dark-soft rounded-2xl border p-4 text-[13px]">
            The API is not reachable, so there is nothing to report.
          </p>
        </aside>
      )}

      <main className="bg-mm-paper min-w-0 flex-1 rounded-[26px] px-7 py-7">
        <header className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <h1 className="text-mm-text font-display text-[32px] leading-tight font-medium tracking-[-0.02em]">
              {greeting()}, {name}
            </h1>
            <p className="text-mm-text-soft mt-1.5 text-[13.5px]">
              {new Date().toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}{' '}
              ·{' '}
              {new Date().toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              · reads the primary — no replica yet
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Drawn as the comp shows, disabled: there is no search endpoint
                yet, and a box that swallows what you type is worse than none. */}
            <span
              title="Search — not built yet"
              aria-disabled="true"
              className="bg-mm-card text-mm-text-soft/50 flex w-[250px] cursor-not-allowed items-center gap-2.5 rounded-full border border-black/[0.06] px-4 py-2.5 text-[13.5px]"
            >
              <SearchIcon className="h-4 w-4" />
              Search users, capsules, jobs…
            </span>

            <span
              title="Date range — not built yet"
              aria-disabled="true"
              className="bg-mm-card text-mm-text-soft/60 flex cursor-not-allowed items-center gap-2 rounded-full border border-black/[0.06] px-4 py-2.5 text-[13.5px]"
            >
              <CalendarIcon className="h-4 w-4" />
              Today
            </span>

            <div className="bg-mm-card flex items-center gap-2.5 rounded-full border border-black/[0.06] py-1.5 pr-3 pl-1.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-200 text-[12px] font-semibold text-violet-900">
                {initials}
              </span>
              <span className="leading-tight">
                <span className="text-mm-text-soft block text-[11px] capitalize">
                  {me.data.role}
                </span>
                <span className="text-mm-text block text-[13px] font-medium">
                  {me.data.email}
                </span>
              </span>
              <form action={signOut}>
                <button
                  type="submit"
                  className="text-mm-text-soft hover:text-mm-text ml-1 text-[13px]"
                  title="Sign out"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </header>

        {dashboard.ok && dashboard.data ? (
          <>
            <div className="mt-6">
              <Sev0Banner data={dashboard.data} />
            </div>

            <div className="mt-6">
              <Kpis data={dashboard.data} />
            </div>

            <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                <Deliveries data={dashboard.data} />
                <Timeline data={dashboard.data} />
              </div>

              <div className="flex flex-col gap-5">
                <UnlockLoad data={dashboard.data} />
                <Tasks data={dashboard.data} />
                <SystemHealth data={dashboard.data} />
              </div>
            </div>
          </>
        ) : (
          <div className="bg-mm-card mt-8 rounded-[20px] border border-black/[0.06] p-8">
            <p className="text-mm-text text-[15px] font-medium">
              The dashboard could not load.
            </p>
            <p className="text-mm-text-soft mt-2 text-[13.5px]">
              {dashboard.error ?? 'Unknown error'} — start the API with{' '}
              <code className="font-mono">npm run dev:backend</code>.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
