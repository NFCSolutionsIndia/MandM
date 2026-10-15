import { NextResponse, type NextRequest } from 'next/server';

import { clearSession } from '@/lib/session';

/**
 * Clears a stale session and sends the visitor back to sign in.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  This exists because cookies cannot be modified in a Server Component.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Next allows cookie writes only in a Server Action or a Route Handler. The
 * dashboard discovers a dead session while *rendering* — the API refuses the
 * token — and at that moment it cannot clear the cookie itself. So it
 * redirects here, which can.
 *
 * A Route Handler is not a streaming context either, so this returns a real
 * HTTP redirect rather than a meta tag.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  await clearSession();
  return NextResponse.redirect(new URL('/login', request.url));
}
