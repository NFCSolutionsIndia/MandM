import { redirect } from 'next/navigation';

import {
  CardFoot,
  CardHead,
  CodeInput,
  ErrorStrip,
  Field,
  KeyIcon,
  PrimaryButton,
} from '@/components/form';
import { getPendingEmail } from '@/lib/session';
import { verifyEmail } from '../actions';

export const metadata = { title: 'Check your mail · M&M Admin' };
export const instant = false;

export default async function CodePage({
  searchParams,
}: PageProps<'/login/code'>) {
  const { error } = await searchParams;

  const email = await getPendingEmail();
  if (!email) redirect('/login');

  return (
    <>
      <CardHead
        title="Check your mail"
        blurb={
          <>
            A six-digit code is on its way to{' '}
            <span className="text-mm-text font-medium">{email}</span>. It
            expires in ten minutes.
          </>
        }
      />

      <form action={verifyEmail} className="mt-7 space-y-5">
        <Field label="Code from your mailbox" icon={<KeyIcon />}>
          <CodeInput />
        </Field>

        <PrimaryButton>Continue</PrimaryButton>
      </form>

      {error === 'code' ? (
        <ErrorStrip>That code is not valid.</ErrorStrip>
      ) : null}

      <CardFoot
        note="Five wrong guesses and the code is spent."
        status={
          <a
            href="/login"
            className="text-mm-violet text-[13px] font-medium hover:underline"
          >
            Use a different email
          </a>
        }
      />
    </>
  );
}
