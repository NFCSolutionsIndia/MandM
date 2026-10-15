import type { Dashboard } from '@/lib/dashboard';
import { compact, delta, duration } from '@/lib/dashboard';
import { AlertIcon, ArrowOutIcon, CheckIcon, ClockIcon, GiftIcon } from './icons';

/* ─────────────────────────── KPI cards ─────────────────────────── */

function Spark({ values, accent }: { values: number[]; accent: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-7 items-end gap-[3px]" aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className={`w-[4px] rounded-sm ${i === values.length - 1 ? accent : 'bg-black/12'}`}
          style={{ height: `${Math.max(12, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function Kpi({
  label,
  value,
  pill,
  pillTone,
  foot,
  spark,
  sparkAccent,
  unavailable,
}: {
  label: string;
  value: string;
  pill?: string;
  pillTone?: string;
  foot: string;
  spark?: number[];
  sparkAccent?: string;
  unavailable?: boolean;
}) {
  return (
    <div className="bg-mm-card rounded-[20px] border border-black/[0.06] p-5">
      <div className="flex items-start justify-between">
        <p className="text-mm-text-soft text-[13px]">{label}</p>
        <ArrowOutIcon className="text-mm-text-soft/50 h-3.5 w-3.5" />
      </div>

      <p
        className={`mt-3 text-[34px] leading-none font-light tracking-tight ${
          unavailable ? 'text-mm-text-soft/40' : 'text-mm-text'
        }`}
      >
        {value}
      </p>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {pill ? (
            <span
              className={`inline-block rounded-md px-2 py-0.5 text-[11.5px] font-medium ${pillTone}`}
            >
              {pill}
            </span>
          ) : null}
          <p className="text-mm-text-soft mt-2 truncate text-[11.5px]">{foot}</p>
        </div>
        {spark ? <Spark values={spark} accent={sparkAccent ?? 'bg-mm-lime'} /> : null}
      </div>
    </div>
  );
}

export function Kpis({ data }: { data: Dashboard }) {
  const { kpis, deliveries24h } = data;

  const successDelta = delta(
    kpis.deliverySuccess30d.value,
    kpis.deliverySuccess30d.previous,
    'pt',
  );
  const usersDelta = delta(kpis.activeUsers.value, kpis.activeUsers.previous, '%');
  const series = deliveries24h.map((d) => d.delivered);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi
        label="Delivery success · 30d"
        value={
          kpis.deliverySuccess30d.value === null
            ? 'no data'
            : `${kpis.deliverySuccess30d.value}%`
        }
        unavailable={kpis.deliverySuccess30d.value === null}
        pill={successDelta?.label}
        pillTone={
          successDelta?.up
            ? 'bg-emerald-100 text-emerald-800'
            : 'bg-amber-100 text-amber-800'
        }
        foot="delivered and acknowledged ÷ attempted"
        spark={series}
        sparkAccent="bg-emerald-500"
      />

      <Kpi
        label="Capsules due today"
        value={compact(kpis.capsulesDueToday.value)}
        pill={kpis.capsulesDueToday.failed > 0 ? 'Attention' : 'On track'}
        pillTone={
          kpis.capsulesDueToday.failed > 0
            ? 'bg-mm-coral/15 text-red-800'
            : 'bg-mm-lime/50 text-mm-on-lime'
        }
        foot={`${kpis.capsulesDueToday.sent} sent · ${kpis.capsulesDueToday.queued} queued · ${kpis.capsulesDueToday.failed} failed`}
        spark={series}
        sparkAccent="bg-mm-lime"
      />

      <Kpi
        label="Active users · 30d"
        value={compact(kpis.activeUsers.value)}
        pill={usersDelta?.label}
        pillTone={
          usersDelta?.up
            ? 'bg-emerald-100 text-emerald-800'
            : 'bg-amber-100 text-amber-800'
        }
        foot={`${compact(kpis.activeUsers.previous)} in the previous 30 days`}
        spark={series}
        sparkAccent="bg-violet-500"
      />

      {/**
       * Revenue, and the one card that says it has nothing.
       *
       * `payments` exists and is empty because no gateway is wired. A figure
       * here would be a number somebody might repeat in a meeting, so the card
       * states the gap instead.
       */}
      <Kpi
        label="MRR (net)"
        value={kpis.mrr ? `₹${compact(kpis.mrr.value)}` : 'not measured'}
        unavailable={!kpis.mrr}
        foot="no payment gateway is connected yet"
      />
    </div>
  );
}

/* ───────────────────────── Deliveries chart ───────────────────────── */

export function Deliveries({ data }: { data: Dashboard }) {
  const { deliveries24h, channels } = data;

  const totals = deliveries24h.map((d) => d.delivered + d.retrying + d.failed);
  const max = Math.max(1, ...totals);
  const peakIndex = totals.indexOf(Math.max(...totals));
  const peak = deliveries24h[peakIndex];

  return (
    <section className="bg-mm-card rounded-[20px] border border-black/[0.06] p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-mm-text text-[19px] font-semibold tracking-tight">
          Deliveries · last 24 hours
        </h2>

        {/* The comp's range toggle. Only "Hour" is implemented, so the others
            are rendered disabled rather than as buttons that do nothing. */}
        <div className="bg-mm-field flex rounded-full p-1">
          <span className="bg-mm-text rounded-full px-3.5 py-1.5 text-[12.5px] font-medium text-white">
            Hour
          </span>
          {['Day', 'Week', 'Month'].map((r) => (
            <span
              key={r}
              title={`${r} range — not built yet`}
              aria-disabled="true"
              className="text-mm-text-soft/50 cursor-not-allowed px-3.5 py-1.5 text-[12.5px]"
            >
              {r}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-5 text-[12.5px]">
        <Legend colour="bg-zinc-300" label="Delivered" />
        <Legend colour="bg-violet-400" label="Retrying" />
        <Legend colour="bg-mm-coral" label="Failed" />
        {peak ? (
          <span className="text-mm-text font-medium">
            Peak{' '}
            {new Date(peak.hour).toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
            })}{' '}
            · {totals[peakIndex]} sends
          </span>
        ) : null}
      </div>

      <div className="mt-7 flex h-44 items-end gap-[6px]">
        {deliveries24h.map((d, i) => {
          const total = totals[i];
          const isPeak = i === peakIndex && total > 0;
          return (
            <div
              key={d.hour}
              className="flex flex-1 flex-col justify-end gap-[2px]"
              title={`${new Date(d.hour).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} — ${d.delivered} delivered, ${d.retrying} retrying, ${d.failed} failed`}
            >
              {d.failed > 0 ? (
                <span
                  className="bg-mm-coral rounded-[3px]"
                  style={{ height: `${(d.failed / max) * 100}%` }}
                />
              ) : null}
              {d.retrying > 0 ? (
                <span
                  className="rounded-[3px] bg-violet-400"
                  style={{ height: `${(d.retrying / max) * 100}%` }}
                />
              ) : null}
              <span
                className={`rounded-[3px] ${isPeak ? 'bg-mm-text' : 'bg-zinc-300'}`}
                style={{
                  height: `${Math.max(total ? 4 : 2, (d.delivered / max) * 100)}%`,
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap gap-2.5">
        {channels.length ? (
          channels.map((c) => (
            <span
              key={c.channel}
              className="bg-mm-field text-mm-text flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12.5px]"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  (c.successPct ?? 0) >= 97 ? 'bg-mm-text' : 'bg-mm-coral'
                }`}
              />
              {c.channel}
              <strong className="font-semibold">
                {c.successPct === null ? '—' : `${c.successPct}%`}
              </strong>
            </span>
          ))
        ) : (
          <p className="text-mm-text-soft text-[13px]">
            No delivery attempts recorded yet.
          </p>
        )}
      </div>
    </section>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="text-mm-text-soft flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${colour}`} />
      {label}
    </span>
  );
}

/* ─────────────────────────── Timeline ─────────────────────────── */

const ACTION_TONE: Record<string, string> = {
  delivery: 'bg-violet-100 text-violet-900',
  moderation: 'bg-mm-lime/50 text-mm-on-lime',
  admin: 'bg-zinc-100 text-zinc-700',
};

export function Timeline({ data }: { data: Dashboard }) {
  return (
    <section className="mt-6">
      <h2 className="text-mm-text mb-4 text-[19px] font-semibold tracking-tight">
        Live ops timeline
      </h2>

      {data.timeline.length === 0 ? (
        <p className="bg-mm-card text-mm-text-soft rounded-[20px] border border-black/[0.06] p-6 text-[13.5px]">
          Nothing has happened yet. Every entry here comes from the append-only
          audit log.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {data.timeline.map((e) => {
            const group = e.action.split('.')[0];
            return (
              <li key={e.id} className="flex items-start gap-4">
                <div className="w-12 shrink-0 pt-4 text-right">
                  <time className="text-mm-text-soft font-mono text-[11.5px]">
                    {new Date(e.at).toLocaleTimeString('en-GB', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>

                <div className="bg-mm-card flex-1 rounded-[18px] border border-black/[0.06] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-mm-text text-[14.5px] font-semibold">
                      {e.action.replace(/[._]/g, ' ')}
                    </p>
                    <span className="text-mm-text-soft shrink-0 font-mono text-[11px]">
                      {e.actor ?? e.actorType}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                        ACTION_TONE[group] ?? 'bg-zinc-100 text-zinc-700'
                      }`}
                    >
                      {group}
                    </span>
                    <span className="text-mm-text-soft text-[12.5px]">
                      on {e.resourceType}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/* ─────────────────────────── Right rail ─────────────────────────── */

export function UnlockLoad({ data }: { data: Dashboard }) {
  const days = data.unlockLoad7d;
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((a, d) => a + d.count, 0);
  const busiest = days.reduce((a, d) => (d.count > a.count ? d : a), days[0]);

  return (
    <section className="rounded-[20px] bg-violet-200/70 p-6">
      <div className="flex items-start justify-between">
        <h2 className="text-[19px] leading-tight font-semibold tracking-tight text-violet-950">
          Unlock load
          <br />
          next 7 days
        </h2>
        <ArrowOutIcon className="h-4 w-4 text-violet-900/50" />
      </div>

      <p className="mt-5 text-[13px] text-violet-900/80">Capsules due</p>
      <p className="mt-1 text-[34px] leading-none font-light tracking-tight text-violet-950">
        {compact(total)}
      </p>

      <div className="mt-6 flex h-24 items-end gap-2">
        {days.map((d) => {
          const peak = busiest && d.day === busiest.day && d.count > 0;
          return (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-2">
              <span
                className={`w-full rounded-[4px] ${peak ? 'bg-violet-950' : 'bg-white/70'}`}
                style={{ height: `${Math.max(6, (d.count / max) * 100)}%` }}
                title={`${d.count} capsules`}
              />
              <span className="text-[11px] text-violet-900/70">
                {new Date(d.day).toLocaleDateString('en-GB', {
                  weekday: 'narrow',
                })}
              </span>
            </div>
          );
        })}
      </div>

      {busiest && busiest.count > 0 ? (
        <p className="mt-5 flex items-start gap-2.5 rounded-2xl bg-white/60 p-3.5 text-[12.5px] text-violet-950">
          <GiftIcon className="mt-px h-4 w-4 shrink-0" />
          <span>
            Busiest day{' '}
            {new Date(busiest.day).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
            })}{' '}
            · {compact(busiest.count)} capsules. No worker is consuming this
            queue yet.
          </span>
        </p>
      ) : null}
    </section>
  );
}

export function Tasks({ data }: { data: Dashboard }) {
  return (
    <section className="bg-mm-lime rounded-[20px] p-6">
      <h2 className="text-mm-on-lime text-[19px] font-semibold tracking-tight">
        My tasks
      </h2>
      <p className="text-mm-on-lime/70 mt-1 text-[13px]">
        Pending approvals for you
      </p>

      {data.tasks.length === 0 ? (
        <p className="text-mm-on-lime/80 mt-5 rounded-2xl bg-black/10 p-4 text-[13px]">
          Nothing is waiting on you. Break-glass requests from colleagues appear
          here — you cannot approve your own.
        </p>
      ) : (
        <ul className="mt-5 flex flex-col gap-2.5">
          {data.tasks.map((t) => (
            <li
              key={t.id}
              className="bg-mm-card flex items-center gap-3 rounded-2xl px-4 py-3"
            >
              <CheckIcon className="text-mm-text h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-mm-text truncate text-[13.5px] font-medium">
                  Break-glass · {t.requestedBy ?? 'unknown'}
                </p>
                <p className="text-mm-text-soft truncate text-[12px]">
                  {t.reason}
                </p>
              </div>
              <ArrowOutIcon className="text-mm-text-soft h-4 w-4 shrink-0" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SystemHealth({ data }: { data: Dashboard }) {
  const { health } = data;

  const rows: {
    label: string;
    detail: string;
    state: 'ok' | 'warn' | 'unknown';
  }[] = [
    {
      label: 'Scheduler',
      detail:
        health.scheduler.lagSeconds === null
          ? 'idle'
          : `lag ${duration(health.scheduler.lagSeconds)}`,
      state: (health.scheduler.lagSeconds ?? 0) > 60 ? 'warn' : 'ok',
    },
    {
      label: 'Dead jobs',
      detail: `${health.scheduler.dead}`,
      state: health.scheduler.dead > 0 ? 'warn' : 'ok',
    },
    {
      label: 'Media pipeline',
      detail: `${health.media.pending} queued`,
      state: health.media.pending > 50 ? 'warn' : 'ok',
    },
    { label: 'API · p95', detail: 'not measured', state: 'unknown' },
    { label: 'Email provider', detail: 'not wired', state: 'unknown' },
    { label: 'Push · APNs/FCM', detail: 'not wired', state: 'unknown' },
    { label: 'DB replica', detail: 'no replica', state: 'unknown' },
  ];

  const ok = rows.filter((r) => r.state === 'ok').length;
  const known = rows.filter((r) => r.state !== 'unknown').length;

  return (
    <section className="bg-mm-card rounded-[20px] border border-black/[0.06] p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-mm-text text-[19px] font-semibold tracking-tight">
          System health
        </h2>
        <span className="bg-mm-field text-mm-text-soft rounded-full px-2.5 py-1 text-[11.5px] font-medium">
          {ok} / {known} ok
        </span>
      </div>

      <ul className="mt-4 flex flex-col">
        {rows.map((r) => (
          <li
            key={r.label}
            className="flex items-center justify-between gap-4 border-b border-black/[0.05] py-2.5 last:border-0"
          >
            <span className="text-mm-text flex items-center gap-2.5 text-[13.5px]">
              <span
                className={`h-2 w-2 rounded-full ${
                  r.state === 'ok'
                    ? 'bg-emerald-500'
                    : r.state === 'warn'
                      ? 'bg-amber-500'
                      : 'bg-zinc-300'
                }`}
              />
              {r.label}
            </span>
            <span
              className={`font-mono text-[12px] ${
                r.state === 'unknown'
                  ? 'text-mm-text-soft/60'
                  : 'text-mm-text-soft'
              }`}
            >
              {r.detail}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-mm-text-soft/70 mt-4 text-[11.5px] leading-relaxed">
        Four of these need instrumentation that does not exist yet. They read
        &ldquo;not measured&rdquo; rather than green.
      </p>
    </section>
  );
}

/* ─────────────────────────── Sev-0 banner ─────────────────────────── */

export function Sev0Banner({ data }: { data: Dashboard }) {
  const first = data.overdue[0];
  if (!first) return null;

  // Computed by the API, not here: reading the clock during render is impure,
  // and a figure derived from the browser's clock could disagree with the data
  // it is describing.
  const overdueFor = duration(first.overdueSeconds);

  return (
    <section className="bg-mm-coral flex flex-wrap items-center gap-5 rounded-[20px] p-5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/25">
        <AlertIcon className="h-5 w-5 text-red-950" />
      </span>

      <div className="min-w-[260px] flex-1">
        <p className="text-[16px] font-semibold text-red-950">
          SEV-0 · {data.counters.sev0} capsule
          {data.counters.sev0 === 1 ? ' is' : 's are'} past unlock with no
          successful attempt
        </p>
        <p className="mt-1 text-[13px] text-red-950/80">
          <span className="font-mono">{first.capsuleId.slice(0, 13)}</span> ·{' '}
          {overdueFor} overdue · {first.attempts} attempt
          {first.attempts === 1 ? '' : 's'}
          {first.lastError ? ` · last error ${first.lastError}` : ''} · no
          delivery worker is running
        </p>
      </div>

      {/* Drawn as the comp does, disabled until the actions exist. A button
          that looks live and does nothing is worse during an incident than
          one that is honestly greyed out. */}
      <div className="flex gap-2.5">
        <span
          title="Not built yet"
          aria-disabled="true"
          className="text-mm-on-dark/70 cursor-not-allowed rounded-full bg-black/80 px-5 py-2.5 text-[13.5px] font-medium"
        >
          Open delivery
        </span>
        <span
          title="Not built yet"
          aria-disabled="true"
          className="text-mm-text-soft cursor-not-allowed rounded-full bg-white/90 px-5 py-2.5 text-[13.5px] font-medium"
        >
          Page on-call
        </span>
      </div>
    </section>
  );
}

export { ClockIcon };
