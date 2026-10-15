import type { ReactNode } from 'react';

/** The frame every sign-in step shares. */
export function AuthCard({
  step,
  title,
  blurb,
  children,
}: {
  step: string;
  title: string;
  blurb: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col justify-center px-4 py-20">
      <p className="font-mono text-xs uppercase tracking-[0.15em] text-zinc-400">
        Moments &amp; Memories · {step}
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        {title}
      </h1>
      <div className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        {blurb}
      </div>

      <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        {children}
      </div>
    </main>
  );
}

export function FieldError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
    >
      {children}
    </p>
  );
}

export function SubmitButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="submit"
      className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
    >
      {children}
    </button>
  );
}

/**
 * A one-time code input.
 *
 * `inputMode="numeric"` brings up a number pad on a phone and
 * `autoComplete="one-time-code"` lets iOS and Android offer the code straight
 * from the notification — both are two attributes that remove a real
 * transcription error from a six-digit flow.
 */
export function CodeInput({ label }: { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </span>
      <input
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        required
        autoFocus
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-center font-mono text-xl tracking-[0.4em] text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      />
    </label>
  );
}
