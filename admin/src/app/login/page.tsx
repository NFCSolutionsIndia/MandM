import {
  CardFoot,
  CardHead,
  ErrorStrip,
  Field,
  InfoStrip,
  MailIcon,
  PrimaryButton,
  TextInput,
} from '@/components/form';
import { requestCode } from './actions';

export const metadata = { title: 'Staff sign in · M&M Admin' };

/**
 * Blocking, not prerendered.
 *
 * Everything meaningful here is request data — the error from the last
 * attempt. There is no static shell worth shipping first, so the documented
 * `block` option is the honest one.
 */
export const instant = false;

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0" aria-hidden>
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

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { error } = await searchParams;

  return (
    <>
      <CardHead
        title="Staff sign in"
        blurb="Your M&M app account does not work here. Use your work email."
      />

      <form action={requestCode} className="mt-7 space-y-5">
        <Field label="Work email" icon={<MailIcon />}>
          <TextInput
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            placeholder="you@momentsandmemories.in"
          />
        </Field>

        <div className="flex items-baseline justify-between gap-4">
          <p className="text-mm-text-soft text-[13px]">
            No &ldquo;remember me&rdquo; — sessions end after 8&nbsp;h
          </p>
          <span
            className="text-mm-text-soft/70 text-[13px]"
            title="There is no password to forget. Sign-in is a code to your mailbox plus your authenticator."
          >
            No passwords here
          </span>
        </div>

        <PrimaryButton>Continue</PrimaryButton>
      </form>

      {error === 'email' ? (
        <ErrorStrip>That does not look like an email address.</ErrorStrip>
      ) : null}
      {error === 'unreachable' ? (
        <ErrorStrip>
          The API is not reachable. Start it with{' '}
          <code className="font-mono">npm run dev:backend</code>.
        </ErrorStrip>
      ) : null}

      <InfoStrip icon={<LockIcon />}>
        Two factors: a code to your mailbox, then your authenticator.
      </InfoStrip>

      <CardFoot
        note="Locked out? Ask a Super admin."
        status={
          <span className="text-mm-text-soft text-[13px]">
            Same answer for any address
          </span>
        }
      />
    </>
  );
}
