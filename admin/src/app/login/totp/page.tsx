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
    <>
      <CardHead
        title="Your authenticator"
        blurb="Enter the six digits currently showing for Moments & Memories."
      />

      <form action={verifyTotp} className="mt-7 space-y-5">
        <Field label="Code from your authenticator" icon={<KeyIcon />}>
          <CodeInput />
        </Field>

        <PrimaryButton>Sign in</PrimaryButton>
      </form>

      {error === 'code' ? (
        <ErrorStrip>That code is not valid.</ErrorStrip>
      ) : null}

      <CardFoot
        note="Lost the device? A backup code works here, once each."
        status={
          <span className="text-mm-text-soft text-[13px]">Step 2 of 2</span>
        }
      />
    </>
  );
}
