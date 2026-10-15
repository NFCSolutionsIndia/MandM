import { Suspense } from 'react';

import { apiGet, type Readiness } from '@/lib/api';

/**
 * The sign-in frame: dark panel on the left, card on the right.
 *
 * A layout rather than four copies, so the left half stays perfectly still
 * while the card steps from email to code to authenticator. Nothing reflows
 * between steps, which is what makes a three-screen flow feel like one screen.
 */

function Logo() {
  return (
    <div className="flex items-center gap-3.5">
      <div className="bg-mm-lime text-mm-on-lime flex h-12 w-12 items-center justify-center rounded-2xl text-[15px] font-semibold tracking-tight">
        m&amp;m
      </div>
      <div>
        <p className="text-[15px] leading-tight font-semibold">
          Moments &amp; Memories
        </p>
        <p className="text-mm-on-dark-soft text-[13px] leading-tight">
          Admin console
        </p>
      </div>
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden>
      <path
        d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6l7-3z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The four figures from the comp.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  These are PLACEHOLDERS, and deliberately not wired to anything.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * They are also worth a conversation before they ever become real. This page
 * is reachable without signing in, so live figures here would publish the
 * delivery backlog and the active-user count to anybody who finds the URL —
 * including a competitor and anybody probing for a staff console.
 *
 * If they should be live, they belong behind the session, on the dashboard.
 */
const STATS = [
  { label: 'Due today', value: '1,284', dot: 'bg-mm-lime' },
  { label: 'Delivered', value: '99.82%', dot: 'bg-emerald-400' },
  { label: 'Pending', value: '412.9K', dot: 'bg-violet-400' },
  { label: 'Active users', value: '1.02M', dot: 'bg-mm-coral' },
];

function StatCard({ label, value, dot }: (typeof STATS)[number]) {
  return (
    <div className="bg-mm-ink-raised border-mm-ink-line rounded-2xl border px-5 py-5">
      <div className="flex items-center gap-2.5">
        <span className={`h-3 w-3 rounded-[5px] ${dot}`} aria-hidden />
        <span className="text-mm-on-dark-soft text-[13px]">{label}</span>
      </div>
      <p className="mt-6 text-[34px] leading-none font-light tracking-tight">
        {value}
      </p>
    </div>
  );
}

export default function LoginLayout({ children }: LayoutProps<'/login'>) {
  return (
    <div className="bg-mm-black min-h-screen p-3 sm:p-5">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] w-full max-w-[1400px] gap-5 sm:min-h-[calc(100vh-2.5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* ─── Left: the pitch, and what this place is ─── */}
        <section className="flex flex-col justify-between px-4 py-8 sm:px-8 sm:py-10">
          <Logo />

          <div className="my-12 lg:my-0">
            <p className="bg-mm-ink-raised text-mm-lime border-mm-ink-line inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium">
              <ShieldIcon />
              Restricted · Staff only
            </p>

            <h1 className="font-display mt-7 text-[clamp(2.4rem,4.6vw,3.6rem)] leading-[1.08] font-light tracking-[-0.02em]">
              Every capsule,
              <br />
              delivered on
              <br />
              the day promised.
            </h1>

            <div className="mt-12 grid max-w-md grid-cols-2 gap-3.5">
              {STATS.map((s) => (
                <StatCard key={s.label} {...s} />
              ))}
            </div>
          </div>

          <p className="text-mm-on-dark-soft text-[13px] leading-relaxed">
            Every sign-in, view and export is written to an append-only audit
            log.
            <br />
            <span className="font-mono text-[12px]">
              momentsandmemories.in · {process.env.MM_VERSION ?? 'v0.1.0'} ·{' '}
              {process.env.MM_REGION ?? 'ap-south-1'}
            </span>
          </p>
        </section>

        {/* ─── Right: the card ─── */}
        <section className="bg-mm-paper flex items-center justify-center rounded-[28px] px-4 py-10 sm:px-8 sm:py-14">
          <div className="bg-mm-card w-full max-w-[460px] rounded-[26px] p-7 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.12)] sm:p-9">
            <Suspense fallback={<EnvBadgeFallback />}>
              <EnvBadge />
            </Suspense>
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}

function EnvBadgeFallback() {
  return <div className="mb-6 h-5" />;
}

/**
 * The environment pill, and it tells the truth.
 *
 * The comp shows `PROD`. Hard-coding that would mean a console pointed at a
 * staging database still claiming to be production — which is exactly the
 * confusion the badge exists to prevent. It reads `NODE_ENV`, and the host
 * comes from the configured API rather than a string in the markup.
 */
async function EnvBadge() {
  const isProd = process.env.NODE_ENV === 'production';
  const host = process.env.MM_ADMIN_HOST ?? 'admin.momentsandmemories.in';

  // Live, because "all systems normal" is a claim and claims should be checked.
  const health = await apiGet<Readiness>('/health/ready');

  return (
    <div className="mb-6 flex items-center gap-3">
      <span
        className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide ${
          isProd
            ? 'bg-mm-coral text-white'
            : 'bg-mm-field text-mm-text-soft border border-black/10'
        }`}
      >
        {isProd ? 'PROD' : 'DEV'}
      </span>
      <span className="text-mm-text-soft truncate text-[13px]">{host}</span>
      <span
        className="ml-auto h-2 w-2 shrink-0 rounded-full"
        style={{ background: health.ok ? '#16a34a' : '#dc2626' }}
        title={health.ok ? 'All systems normal' : 'API unreachable'}
        aria-label={health.ok ? 'All systems normal' : 'API unreachable'}
      />
    </div>
  );
}
