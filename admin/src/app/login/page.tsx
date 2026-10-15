import { AuthCard, FieldError, SubmitButton } from '@/components/shell';
import { requestCode } from './actions';

export const metadata = { title: 'Sign in · M&M Admin' };

/**
 * Blocking, not prerendered.
 *
 * Every meaningful thing on this page is request data — the error from the
 * last attempt, the address being signed in. There is no useful static shell
 * to ship first, so the documented `block` option is the honest one: it
 * renders on the server at request time instead of pretending otherwise.
 *
 * The dashboard does the opposite, because it HAS a shell worth sending
 * early and streams the session behind <Suspense>.
 */
export const instant = false;

export default async function LoginPage({
  searchParams,
}: PageProps<'/login'>) {
  const { error } = await searchParams;

  return (
    <AuthCard
      step="Step 1 of 2"
      title="Sign in to the console"
      blurb={
        <>
          Two factors, neither of them a password: a code to your mailbox, then
          a code from your authenticator.
        </>
      }
    >
      {error === 'email' ? (
        <FieldError>That does not look like an email address.</FieldError>
      ) : null}
      {error === 'unreachable' ? (
        <FieldError>
          The API is not reachable. Start it with{' '}
          <code className="font-mono">npm run dev:backend</code>.
        </FieldError>
      ) : null}

      <form action={requestCode} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Work email
          </span>
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            placeholder="you@mm.internal"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </label>

        <SubmitButton>Send me a code</SubmitButton>
      </form>

      <p className="mt-5 border-t border-zinc-200 pt-4 text-xs leading-relaxed text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        You will get the same answer whether or not this address belongs to an
        admin. That is deliberate — the staff list is worth having if you intend
        to phish somebody.
      </p>
    </AuthCard>
  );
}
