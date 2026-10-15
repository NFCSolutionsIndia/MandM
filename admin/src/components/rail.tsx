import {
  BellIcon,
  CardIcon,
  ChartIcon,
  GridIcon,
  ListIcon,
  PeopleIcon,
  SendIcon,
  ShieldIcon,
  SunIcon,
} from './icons';

/**
 * The icon rail.
 *
 * Only the first item leads anywhere. The rest are drawn because the design
 * shows them and because the shape of the console is part of the design — but
 * they are rendered as **disabled**, with a tooltip saying so, rather than as
 * links that quietly do nothing.
 *
 * A navigation item that looks live and isn't costs somebody a click and a
 * moment of doubt about whether the console is broken. One that is visibly
 * not ready costs nothing.
 */
const ITEMS = [
  { icon: GridIcon, label: 'Overview', href: '/', ready: true },
  { icon: PeopleIcon, label: 'Users', ready: false },
  { icon: SendIcon, label: 'Deliveries', ready: false },
  { icon: ShieldIcon, label: 'Moderation', ready: false },
  { icon: CardIcon, label: 'Billing', ready: false },
  { icon: ChartIcon, label: 'Reports', ready: false },
  { icon: ListIcon, label: 'Audit log', ready: false },
  { icon: SunIcon, label: 'Settings', ready: false },
];

export function Rail({ initials }: { initials: string }) {
  const isProd = process.env.NODE_ENV === 'production';

  return (
    <nav
      aria-label="Console sections"
      className="flex w-[72px] shrink-0 flex-col items-center gap-2 py-5"
    >
      <div className="bg-mm-lime text-mm-on-lime flex h-11 w-11 items-center justify-center rounded-[14px] text-[13px] font-semibold">
        m&amp;m
      </div>

      <span
        className={`mb-4 rounded-full px-2 py-0.5 text-[9.5px] font-bold tracking-wider ${
          isProd
            ? 'bg-mm-coral text-white'
            : 'bg-mm-ink-raised text-mm-on-dark-soft'
        }`}
      >
        {isProd ? 'PROD' : 'DEV'}
      </span>

      {ITEMS.map(({ icon: Icon, label, href, ready }) =>
        ready && href ? (
          <a
            key={label}
            href={href}
            title={label}
            aria-current="page"
            className="bg-mm-lime text-mm-on-lime flex h-11 w-11 items-center justify-center rounded-2xl"
          >
            <Icon />
          </a>
        ) : (
          <span
            key={label}
            title={`${label} — not built yet`}
            aria-disabled="true"
            className="text-mm-on-dark-soft/45 flex h-11 w-11 cursor-not-allowed items-center justify-center rounded-2xl"
          >
            <Icon />
          </span>
        ),
      )}

      <div className="mt-auto flex flex-col items-center gap-3">
        <span
          title="Notifications — not built yet"
          aria-disabled="true"
          className="text-mm-on-dark-soft/45 flex h-11 w-11 cursor-not-allowed items-center justify-center rounded-2xl"
        >
          <BellIcon />
        </span>
        <span className="bg-mm-ink-raised text-mm-on-dark flex h-10 w-10 items-center justify-center rounded-full text-[13px] font-semibold">
          {initials}
        </span>
      </div>
    </nav>
  );
}
