import { redirect } from 'next/navigation';

import { AuthCard, CodeInput, FieldError, SubmitButton } from '@/components/shell';
import { getPendingEmail } from '@/lib/session';
import { verifyEmail } from '../actions';

export const metadata = { title: 'Check your mail · M&M Admin' };

export const instant = false;

export default async function CodePage({
  searchParams,
}: PageProps<'/login/code'>) {
  const { error } = await searchParams;

  // Reading the cookie is a request-time read, so this page is never
  // prerendered — which is correct: there is nothing here to cache.
  const email = await getPendingEmail();
  if (!email) redirect('/login');

  return (
    <AuthCard
      step="Step 1 of 2"
      title="Check your mail"
      blurb={
        <>
          A six-digit code is on its way to{' '}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {email}
          </span>
          . It expires in ten minutes.
        </>
      }
    >
      {error === 'code' ? (
        <FieldError>That code is not valid.</FieldError>
      ) : null}

      <form action={verifyEmail} className="space-y-4">
        <CodeInput label="Code from your mailbox" />
        <SubmitButton>Continue</SubmitButton>
      </form>

      <p className="mt-5 border-t border-zinc-200 pt-4 text-xs leading-relaxed text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        Five wrong guesses and the code is spent. In development it is printed
        in the backend log rather than emailed.
      </p>
    </AuthCard>
  );
}
