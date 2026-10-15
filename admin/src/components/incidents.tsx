import type { Dashboard } from '@/lib/dashboard';
import { compact, duration } from '@/lib/dashboard';
import { ArrowOutIcon, ClockIcon, KeyholeIcon } from './icons';

/**
 * The dark column: four counters, then whatever is actually wrong.
 *
 * Every card here is derived from a real query. When nothing is wrong the
 * column says so rather than inventing an incident to fill the space — an
 * empty queue is good news and should read like it.
 */

function Counter({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="bg-mm-ink-raised border-mm-ink-line rounded-2xl border px-4 py-4">
      <div className="flex items-center gap-2">
        <span className={`h-3 w-3 rounded-[5px] ${accent}`} aria-hidden />
        <span className="text-mm-on-dark-soft text-[12.5px]">{label}</span>
      </div>
      <p className="mt-5 text-[30px] leading-none font-light tracking-tight">
        {compact(value)}
      </p>
    </div>
  );
}

function Card({
  badge,
  badgeTone,
  title,
  meta,
  footLabel,
  footTone,
  foot,
  highlight,
}: {
  badge: string;
  badgeTone: string;
  title: string;
  meta: string;
  footLabel: string;
  footTone: string;
  foot: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <article
      className={`rounded-2xl border p-4 ${
        highlight
          ? 'bg-mm-lime border-transparent'
          : 'bg-mm-ink-raised border-mm-ink-line'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold ${badgeTone}`}
        >
          {badge}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-[14px] font-semibold ${
              highlight ? 'text-mm-on-lime' : 'text-mm-on-dark'
            }`}
          >
            {title}
          </p>
          <p
            className={`truncate font-mono text-[11.5px] ${
              highlight ? 'text-mm-on-lime/70' : 'text-mm-on-dark-soft'
            }`}
          >
            {meta}
          </p>
        </div>
        <ArrowOutIcon
          className={`h-4 w-4 shrink-0 ${
            highlight ? 'text-mm-on-lime/60' : 'text-mm-on-dark-soft/60'
          }`}
        />
      </div>

      <div
        className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2 ${
          highlight ? 'bg-black/10' : 'bg-black/25'
        }`}
      >
        {foot}
        <span
          className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${footTone}`}
        >
          {footLabel}
        </span>
      </div>
    </article>
  );
}

export function Incidents({ data }: { data: Dashboard }) {
  const { counters, overdue, health, tasks } = data;

  const sev0 = overdue[0];
  const schedulerLate = (health.scheduler.lagSeconds ?? 0) > 60;
  const mediaBacklog = health.media.pending > 50;

  const quiet =
    !sev0 && !schedulerLate && !mediaBacklog && tasks.length === 0;

  return (
    <aside className="flex w-[300px] shrink-0 flex-col gap-3 py-5 pr-1">
      <div className="grid grid-cols-2 gap-3">
        <Counter label="Sev-0" value={counters.sev0} accent="bg-mm-coral" />
        <Counter
          label="Failed today"
          value={counters.failedToday}
          accent="bg-amber-400"
        />
        <Counter
          label="Mod. queue"
          value={counters.moderationQueue}
          accent="bg-violet-400"
        />
        <Counter
          label="Approvals"
          value={counters.approvals}
          accent="bg-mm-lime"
        />
      </div>

      <h2 className="text-mm-on-dark mt-3 flex items-center gap-2 px-1 text-[15px] font-semibold">
        <span className="bg-mm-lime h-3 w-3 rounded-[5px]" aria-hidden />
        Incidents &amp; tasks
      </h2>

      <div className="flex flex-col gap-3">
        {sev0 ? (
          <Card
            highlight
            badge="!"
            badgeTone="bg-black/15 text-mm-on-lime"
            title="Capsule past unlock"
            meta={`${sev0.capsuleId.slice(0, 13)} · ${sev0.attempts} attempt${sev0.attempts === 1 ? '' : 's'}`}
            footLabel="Sev-0"
            footTone="bg-mm-coral text-white"
            foot={
              <>
                <ClockIcon className="text-mm-on-lime/70 h-3.5 w-3.5" />
                <span className="text-mm-on-lime/80 text-[12px]">
                  {duration(sev0.overdueSeconds)} overdue
                </span>
              </>
            }
          />
        ) : null}

        {schedulerLate ? (
          <Card
            badge="SQ"
            badgeTone="bg-mm-ink text-mm-on-dark-soft"
            title={`Scheduler lag ${duration(health.scheduler.lagSeconds)}`}
            meta={`Queue depth ${health.scheduler.pending}`}
            footLabel="Mid"
            footTone="bg-violet-300 text-violet-950"
            foot={
              <>
                <ClockIcon className="text-mm-on-dark-soft h-3.5 w-3.5" />
                <span className="text-mm-on-dark-soft text-[12px]">
                  Oldest job is due and unclaimed
                </span>
              </>
            }
          />
        ) : null}

        {mediaBacklog ? (
          <Card
            badge="MP"
            badgeTone="bg-mm-ink text-mm-on-dark-soft"
            title="Transcode backlog"
            meta={`${health.media.pending} pending · ${health.media.processing} running`}
            footLabel="Mid"
            footTone="bg-violet-300 text-violet-950"
            foot={
              <>
                <ClockIcon className="text-mm-on-dark-soft h-3.5 w-3.5" />
                <span className="text-mm-on-dark-soft text-[12px]">
                  No worker is consuming the queue yet
                </span>
              </>
            }
          />
        ) : null}

        {tasks.map((t) => (
          <Card
            key={t.id}
            badge="BG"
            badgeTone="bg-mm-ink text-mm-on-dark-soft"
            title="Break-glass request"
            meta={t.requestedBy ?? 'unknown requester'}
            footLabel="Review"
            footTone="bg-mm-lime text-mm-on-lime"
            foot={
              <>
                <KeyholeIcon className="text-mm-on-dark-soft h-3.5 w-3.5" />
                <span className="text-mm-on-dark-soft text-[12px]">
                  Awaiting second approver
                </span>
              </>
            }
          />
        ))}

        {quiet ? (
          <div className="bg-mm-ink-raised border-mm-ink-line rounded-2xl border px-4 py-7 text-center">
            <p className="text-mm-on-dark text-[14px] font-medium">
              Nothing is on fire.
            </p>
            <p className="text-mm-on-dark-soft mt-1 text-[12.5px]">
              No overdue capsule, no scheduler lag, no approvals waiting.
            </p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
