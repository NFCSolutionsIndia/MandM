type P = { className?: string };

const base = 'h-[18px] w-[18px]';

function S({ children, className }: P & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      stroke="currentColor"
      className={className ?? base}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const GridIcon = (p: P) => (
  <S {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
  </S>
);

export const PeopleIcon = (p: P) => (
  <S {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19.5c.6-3.1 2.8-4.8 5.5-4.8s4.9 1.7 5.5 4.8" />
    <path d="M16 6.4a3.2 3.2 0 0 1 0 6M17.5 15.2c2 .6 3.3 2.1 3.8 4.3" />
  </S>
);

export const SendIcon = (p: P) => (
  <S {...p}>
    <path d="M21 3 10.5 13.5M21 3l-6.8 18-3.7-7.5L3 9.8 21 3Z" />
  </S>
);

export const ShieldIcon = (p: P) => (
  <S {...p}>
    <path d="M12 3.2 19 6v5.6c0 4-2.8 7.3-7 8.6-4.2-1.3-7-4.6-7-8.6V6l7-2.8Z" />
  </S>
);

export const CardIcon = (p: P) => (
  <S {...p}>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="M3 10h18" />
  </S>
);

export const ChartIcon = (p: P) => (
  <S {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </S>
);

export const ListIcon = (p: P) => (
  <S {...p}>
    <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
  </S>
);

export const SunIcon = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </S>
);

export const BellIcon = (p: P) => (
  <S {...p}>
    <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9Z" />
    <path d="M10.3 19a2 2 0 0 0 3.4 0" />
  </S>
);

export const SearchIcon = (p: P) => (
  <S {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </S>
);

export const CalendarIcon = (p: P) => (
  <S {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
    <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
  </S>
);

export const AlertIcon = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.3v.3" />
  </S>
);

export const RefreshIcon = (p: P) => (
  <S {...p}>
    <path d="M20 11a8 8 0 1 0-1.7 6" />
    <path d="M20 4v6h-6" />
  </S>
);

export const ArrowOutIcon = (p: P) => (
  <S {...p}>
    <path d="M7 17 17 7M9 7h8v8" />
  </S>
);

export const CheckIcon = (p: P) => (
  <S {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </S>
);

export const ClockIcon = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </S>
);

export const GiftIcon = (p: P) => (
  <S {...p}>
    <rect x="3.5" y="9" width="17" height="11" rx="2" />
    <path d="M3.5 13h17M12 9v11M12 9S10.5 4 8 4a2.2 2.2 0 0 0 0 5M12 9s1.5-5 4-5a2.2 2.2 0 0 1 0 5" />
  </S>
);

export const KeyholeIcon = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="9.5" r="3" />
    <path d="M12 12.5V18" />
  </S>
);
