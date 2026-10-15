import { NextResponse, type NextRequest } from 'next/server';

/**
 * The session gate, before rendering.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  Why this exists rather than a `redirect()` in the page.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * With `cacheComponents` enabled, a page renders in a streaming context — and
 * in a streaming context `redirect()` is documented to emit a **meta tag**
 * rather than an HTTP redirect. A browser follows it; curl, a probe, a crawler
 * and a misconfigured proxy all see HTTP 200 and a page that looks successful.
 *
 * Proxy runs *before* routes are rendered, so a signed-out request gets a real
 * 307 to `/login`. (Note the rename: `middleware.ts` is deprecated in favour
 * of `proxy.ts` in this version.)
 *
 * ─── What this is NOT ───────────────────────────────────────────────────────
 *
 * It checks that a session cookie is **present**. It does not check that the
 * session is valid, and it must not: that would mean an API round trip on
 * every request, from a layer meant to be cheap enough to run at a CDN edge.
 *
 * Validity is still established where it matters — the dashboard calls
 * `/admin/v1/auth/me` with the token and clears the cookie if the API refuses
 * it, and every admin query runs on a connection whose `app.admin_id` came
 * from a session the database itself resolved. This gate is a courtesy that
 * keeps signed-out people out of a page that would only redirect them anyway.
 */

const SESSION_COOKIE = 'mm_admin_session';

export function proxy(request: NextRequest): NextResponse {
  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Everything except the sign-in flow, Next's own assets, and the favicon.
   *
   * Written as an exclusion rather than a list of protected routes on purpose:
   * a page added next month is protected by default, and opting it out is a
   * deliberate edit somebody makes here where a reviewer can see it.
   */
  matcher: ['/((?!login|_next/static|_next/image|favicon.ico).*)'],
};
