import { redirect } from 'next/navigation';
import QRCode from 'qrcode';

import { CardFoot, CardHead, PrimaryButton } from '@/components/form';
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
 * second factor decorative. So the honest thing is to say there is no
 * "resend", and to put the backup codes in front of the person while they
 * still can be.
 *
 * The QR is rendered to SVG **on the server**. No client-side QR library, no
 * secret in a browser bundle: it is already pixels when it leaves this
 * function.
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
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#121212', light: '#00000000' },
  });

  return (
    <>
      <CardHead
        title="Set up your authenticator"
        blurb="Scan this with your authenticator app, then keep the backup codes somewhere safe."
      />

      <div className="bg-mm-field mt-7 flex justify-center rounded-2xl p-6">
        <div
          className="w-40 [&>svg]:h-auto [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: qr }}
        />
      </div>

      <details className="mt-4">
        <summary className="text-mm-text-soft hover:text-mm-text cursor-pointer text-[13.5px]">
          Can&rsquo;t scan it?
        </summary>
        <p className="bg-mm-field text-mm-text mt-2 rounded-xl px-4 py-3 font-mono text-[12.5px] break-all">
          {secret}
        </p>
      </details>

      <div className="mt-6 rounded-2xl border border-amber-300/70 bg-amber-50 p-5">
        <p className="text-[14px] font-semibold text-amber-900">
          Backup codes — shown once, never again
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-amber-800/90">
          Each works once, in place of your authenticator. There is no way to
          see these again and no way to re-enrol without a colleague&rsquo;s
          help.
        </p>
        <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 font-mono text-[14px] text-amber-950">
          {backupCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
      </div>

      <form action="/login/totp" className="mt-6">
        <PrimaryButton>I have saved these</PrimaryButton>
      </form>

      <CardFoot
        note="Re-enrolment needs a Super admin."
        status={
          <span className="text-mm-text-soft text-[13px]">First sign-in</span>
        }
      />
    </>
  );
}
