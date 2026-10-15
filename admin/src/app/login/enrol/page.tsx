import { redirect } from 'next/navigation';
import QRCode from 'qrcode';

import { AuthCard, SubmitButton } from '@/components/shell';
import { getMfaToken } from '@/lib/session';

export const metadata = { title: 'Set up your authenticator · M&M Admin' };

export const instant = false;

/**
 * Enrolment — shown exactly once, on an admin's first sign-in.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  This material is not recoverable. The page says so, plainly.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The server refuses to re-enrol over an existing secret, because a
 * half-authenticated token that could replace the second factor would make the
 * second factor decorative. So the honest thing is to tell the person reading
 * this that there is no "resend" — and to put the backup codes in front of
 * them while they still can be.
 *
 * The QR is rendered to SVG **on the server**. No client-side QR library, no
 * secret passed into a browser bundle: the image is already pixels by the time
 * it leaves this function.
 */
export default async function EnrolPage({
  searchParams,
}: PageProps<'/login/enrol'>) {
  const { uri, secret, codes } = await searchParams;

  const mfaToken = await getMfaToken();
  if (!mfaToken || typeof uri !== 'string' || typeof secret !== 'string') {
    redirect('/login');
  }

  const backupCodes = typeof codes === 'string' ? codes.split(',') : [];

  const qr = await QRCode.toString(uri, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
  });

  return (
    <AuthCard
      step="First sign-in"
      title="Set up your authenticator"
      blurb="Scan this with your authenticator app, then keep the backup codes somewhere safe."
    >
      <div className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-white">
        {/* The SVG is generated here, from a string this server already has.
            Nothing about the secret reaches the client bundle. */}
        <div
          className="mx-auto w-44 [&>svg]:h-auto [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: qr }}
        />
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
          Can&rsquo;t scan it?
        </summary>
        <p className="mt-2 break-all rounded-md bg-zinc-100 px-3 py-2 font-mono text-xs text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
          {secret}
        </p>
      </details>

      <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Backup codes — shown once, never again
        </p>
        <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-300/90">
          Each works once, in place of your authenticator. There is no way to
          see these again and no way to re-enrol without a colleague&rsquo;s
          help.
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm text-amber-950 dark:text-amber-100">
          {backupCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
      </div>

      <form action="/login/totp" className="mt-6">
        <SubmitButton>I have saved these — continue</SubmitButton>
      </form>
    </AuthCard>
  );
}
