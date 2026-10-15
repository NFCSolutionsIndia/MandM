import { redirect } from 'next/navigation';

import { AuthCard, CodeInput, FieldError, SubmitButton } from '@/components/shell';
import { getMfaToken } from '@/lib/session';
import { verifyTotp } from '../actions';

export const metadata = { title: 'Second factor · M&M Admin' };

export const instant = false;

export default async function TotpPage({
  searchParams,
}: PageProps<'/login/totp'>) {
  const { error } = await searchParams;

  const mfaToken = await getMfaToken();
  if (!mfaToken) redirect('/login');

  return (
    <AuthCard
      step="Step 2 of 2"
      title="Your authenticator"
      blurb="Enter the six digits currently showing for Moments & Memories."
    >
      {error === 'code' ? (
        <FieldError>That code is not valid.</FieldError>
      ) : null}

      <form action={verifyTotp} className="space-y-4">
        <CodeInput label="Code from your authenticator" />
        <SubmitButton>Sign in</SubmitButton>
      </form>

      <p className="mt-5 border-t border-zinc-200 pt-4 text-xs leading-relaxed text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        Lost the device? A backup code works here instead, once each. The token
        you are holding right now can do nothing except answer this screen.
      </p>
    </AuthCard>
  );
}
