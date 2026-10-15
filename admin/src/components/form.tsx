import type { ReactNode } from 'react';

/** The card's heading block. */
export function CardHead({
  title,
  blurb,
}: {
  title: string;
  blurb: ReactNode;
}) {
  return (
    <>
      <h2 className="font-display text-mm-text text-[30px] leading-tight font-medium tracking-[-0.02em]">
        {title}
      </h2>
      <p className="text-mm-text-soft mt-2 text-[14.5px] leading-relaxed">
        {blurb}
      </p>
    </>
  );
}

export function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" aria-hidden>
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="m4 7.5 7.1 5a1.5 1.5 0 0 0 1.8 0l7.1-5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" aria-hidden>
      <rect
        x="4"
        y="10"
        width="16"
        height="10"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M8 10V7a4 4 0 1 1 8 0v3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
      <path
        d="M7 17 17 7M9 7h8v8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * A field in the comp's style: icon on the left, filled when idle, outlined in
 * ink when focused.
 *
 * `focus-within` on the wrapper rather than `focus` on the input, so the whole
 * field reacts — which is what the comp shows and what makes the focused state
 * legible at a glance.
 */
export function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-mm-text mb-2 block text-[14px] font-medium">
        {label}
      </span>
      <div className="bg-mm-field focus-within:bg-mm-card text-mm-text-soft focus-within:border-mm-text flex items-center gap-3 rounded-2xl border border-transparent px-4 py-3.5 transition-colors focus-within:border-[1.5px]">
        {icon}
        {children}
      </div>
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="text-mm-text placeholder:text-mm-text-soft/60 w-full bg-transparent text-[15px] outline-none"
    />
  );
}

/**
 * A six-digit code input.
 *
 * `inputMode="numeric"` brings up a number pad; `autoComplete="one-time-code"`
 * lets iOS and Android offer the code straight from the notification. Two
 * attributes that remove a real transcription error from the flow.
 */
export function CodeInput({ name = 'code' }: { name?: string }) {
  return (
    <input
      name={name}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="\d{6}"
      maxLength={6}
      required
      autoFocus
      placeholder="······"
      className="text-mm-text placeholder:text-mm-text-soft/40 w-full bg-transparent font-mono text-[17px] tracking-[0.35em] outline-none"
    />
  );
}

/** The lime pill. */
export function PrimaryButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="submit"
      className="bg-mm-lime hover:bg-mm-lime-hover text-mm-on-lime focus-visible:outline-mm-text flex w-full items-center justify-center gap-2 rounded-full px-5 py-4 text-[15px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {children}
      <ArrowIcon />
    </button>
  );
}

/** The mint information strip from the comp. */
export function InfoStrip({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <p className="bg-mm-mint text-mm-mint-ink mt-5 flex items-center gap-2.5 rounded-2xl px-4 py-3.5 text-[13.5px]">
      {icon}
      <span>{children}</span>
    </p>
  );
}

export function ErrorStrip({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-5 flex items-start gap-2.5 rounded-2xl bg-red-50 px-4 py-3.5 text-[13.5px] text-red-800"
    >
      <svg viewBox="0 0 24 24" fill="none" className="mt-px h-4 w-4 shrink-0">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M12 7.5v5.5M12 16.2v.3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span>{children}</span>
    </p>
  );
}

/** The footer rule from the comp: a note on the left, status on the right. */
export function CardFoot({
  note,
  status,
}: {
  note: ReactNode;
  status?: ReactNode;
}) {
  return (
    <div className="mt-7 flex items-center justify-between gap-4 border-t border-black/[0.07] pt-5">
      <p className="text-mm-text-soft text-[13px]">{note}</p>
      {status}
    </div>
  );
}
