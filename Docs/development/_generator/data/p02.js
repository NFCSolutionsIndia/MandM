module.exports = {
  id: 'PHASE-02', name: 'Identity, Authorization & Onboarding', release: 'Release 1',
  objective: 'Establish who a user is, what they may reach, and give them a first session that ends somewhere meaningful.',
  business: 'Nothing in the product is reachable without an account, and the first three minutes decide whether a user ever returns.',
  technical: 'Passwordless auth, opaque revocable sessions, the `lib/authz` chokepoint, RLS policies, the vault entity, and a three-step onboarding.',
  priority: 'critical', deps: ['PHASE-01'], effort: '~2.5 weeks',
  outcome: 'A user can sign up, verify, complete onboarding, and land in an empty app — and every read and write in the system already passes through a tested authorization chokepoint.',
  purpose: `Two things happen in this phase, and the second matters more than it looks.

The first is ordinary: passwordless authentication, sessions, and onboarding.

The second is that **\`lib/authz\` is built here, before a single memory exists.** Blueprint §20.2 and ADR-009 make it the single chokepoint through which every read and write resolves the actor to a vault role, an active share, or a delivered capsule recipient. Gap analysis R-2 ranks a cross-tenant leak as one of two critical risks in the product. Authorization retrofitted onto existing content is how that leak happens; authorization built first, with a test per permission-matrix cell, is how it does not.

The phase also settles a question the blueprint leaves open (gap G-1): what happens when a user loses their only passkey *and* access to their email. A lifetime vault needs an answer that is neither "you lose everything" nor "call support and they'll let you in".`,
  goals: [
    'A user can create an account with an email code and no password.',
    'A user can add a passkey and sign in with biometrics on a supported device.',
    'A session can be revoked from another device and stops working immediately.',
    'Every data access in the codebase routes through `lib/authz`, enforced by review and by the absence of any other path.',
    'The blueprint §11.2 permission matrix is encoded as an executable table with a test per cell.',
    'RLS policies exist for every table created in this phase.',
    'Onboarding reaches a meaningful first action in under three minutes.',
  ],
  features: [
    'Email OTP signup and login.',
    'Passkey registration and login (WebAuthn).',
    'Google and Apple OAuth.',
    'Opaque server-side sessions with a device list and instant revocation.',
    'Mobile number and email verification, with a documented "verify later" grace state.',
    'Account recovery path resistant to social engineering.',
    'Personal vault auto-created at signup.',
    '`lib/authz` chokepoint plus RLS.',
    'Three-step onboarding with a personalization quiz that has real consequences.',
  ],
  arch: [
    'Introduces the authentication realm and the session contract every later request depends on.',
    'Introduces `lib/authz` — the single most security-critical module in the system (ADR-009).',
    'Introduces the `Vault` / `VaultMember` ownership root that every content query is scoped by.',
    'Introduces the RLS policy pattern established in PHASE-01 as actual policies on real tables.',
    'Introduces application-level rate limiting (ADR-011) ahead of the edge rules added in PHASE-09.',
  ],
  depDetail: [
    '**PHASE-01** must be complete: migrations, shared enums, form primitives, and the app shell are all prerequisites.',
    '**External:** Google and Apple OAuth applications registered; a transactional email sender configured (Resend) with a verified domain.',
    '**Technical:** the `@mm/shared` error registry must already contain the non-enumerating auth codes.',
  ],
  deliverables: [
    'Auth, session, vault, and membership schema with RLS.',
    '`lib/authz` with the permission matrix encoded and one test per cell.',
    'Signup, login, verification, reset, and onboarding screens.',
    'Device and session management UI.',
    'A written account-recovery policy committed alongside the code.',
  ],
  ac: [
    'A new user completes signup, verification, and onboarding on a real mobile device.',
    'A passkey created on a device signs that user in on a later visit.',
    'Revoking a session from one device causes the other to be signed out on its next request.',
    'Every cell of the §11.2 permission matrix has a passing test; deliberately inverting one cell fails CI.',
    'Attempting to read another user\'s vault fails at both the `authz` layer and the RLS layer, verified independently.',
    'Rate limits on OTP issue and verification are enforced and observable.',
  ],
  risks: [
    ['Authorization gaps that only appear once content exists', 'critical', '`lib/authz` built before content; matrix test per cell; RLS as an independent second layer; a negative-path E2E in PHASE-09 attempts every cross-tenant read.'],
    ['Passwordless lockout — user loses passkey and email access', 'high', 'Gap G-1 addressed by an explicit recovery task with a written, abuse-resistant policy. Multiple sign-in factors offered at signup rather than one.'],
    ['OTP abuse and SMS/email cost', 'medium', 'Per-email and per-IP rate limits with lockout, plus CAPTCHA after repeated failures.'],
    ['Account enumeration through error copy', 'medium', 'Non-enumerating codes in the shared registry; a test asserting the reset and login responses are identical for existing and non-existing accounts.'],
    ['Onboarding quiz that changes nothing, becoming theatre', 'low', 'The quiz answer maps to concrete notification defaults; a test asserts the mapping.'],
  ],
  gate: 'A stakeholder can create an account on their own phone and reach the empty Home screen',
  trace: ['§20.1', '§20.2', '§11.1', '§11.2', '§29.2', '§29.3', '§29.4', '§29.5', '§29.6', 'ADR-008', 'ADR-009'],

  modules: [
    {
      id: 'MOD-02-01', name: 'Authentication & Sessions',
      purpose: 'Passwordless identity with revocable sessions and a documented recovery path.',
      priority: 'critical',
      objective: 'Let a user prove who they are with the least friction compatible with holding their family archive for decades — and let them take that access away from a lost device.',
      business: [
        'Every other feature is unreachable without this.',
        'Passwordless removes the single most common support burden and the most common breach vector.',
        'A credible recovery story is a purchase consideration for a product asking to hold irreplaceable data.',
      ],
      functional: [
        'Sign up with email and a six-digit code; no password anywhere in the system.',
        'Add and use passkeys; sign in with Google or Apple.',
        'Verify mobile number and email; scheduling is gated until email is verified.',
        'See every signed-in device and revoke any of them, or all at once.',
        'Recover an account when the primary factor is lost, without creating a social-engineering path.',
      ],
      ui: [
        'Signup (§29.3), Login (§29.5), Dual verification (§29.4), Forgot/reset (§29.6) — each with all five states in both themes.',
        'Non-enumerating error copy throughout.',
        'Passkey offered immediately after signup, framed as "skip passwords forever".',
        'Device list in settings with revoke.',
      ],
      backend: [
        'OTP issue and verify services with hashing, expiry, attempt limits, and lockout.',
        'WebAuthn registration and assertion verification.',
        'OAuth callback handling including Apple private-relay addresses.',
        'Opaque session issue, refresh, and revoke.',
        'Application-level rate limiting.',
      ],
      db: [
        '`users`, `sessions`, `credentials`, `accounts`, `otp_codes`, `rate_limits` — all with RLS.',
        '`citext` email with a unique index.',
        'Session tokens and OTP codes stored hashed, never in plaintext.',
      ],
      integrations: ['Resend (transactional email)', 'Google OAuth', 'Apple Sign In'],
      security: [
        'No passwords stored anywhere (ADR-008).',
        'Opaque server-side sessions so revocation is immediate — this overrides the designer brief\'s JWT proposal (gap analysis §2).',
        'Non-enumerating responses on login and reset.',
        'Step-up re-authentication required for changing email, adding a passkey, export, and deletion.',
        'Rate limits per identifier and per IP.',
      ],
      testing: [
        'OTP expiry, reuse, attempt cap, and lockout.',
        'WebAuthn replay rejection.',
        'Session revocation takes effect on the next request.',
        'Enumeration test: identical responses for existing and non-existing accounts.',
      ],
      ac: [
        'Signup, login, verification, and reset all work end to end on a real device.',
        'Passkey login works on at least one iOS and one Android device.',
        'Revocation is immediate.',
        'Enumeration test passes.',
        'Recovery policy written and committed.',
      ],
      trace: ['§20.1', '§29.3', '§29.4', '§29.5', '§29.6', 'ADR-008'],
      sprints: [
        {
          id: 'SPR-02-01-01', name: 'Auth Schema, Sessions & Rate Limiting',
          objective: 'The server-side foundation of identity.',
          priority: 'critical', deps: [], duration: '~4 days',
          goal: 'A session can be created, validated, listed, and revoked; OTP codes can be issued and verified safely; abuse is rate-limited.',
          inScope: ['Auth schema and migration with RLS', 'Session service', 'OTP service', 'Rate-limit service', 'Step-up re-auth primitive'],
          outScope: ['Any UI (next sprint)', 'Passkeys and OAuth (next sprint)', 'Vault and authz (MOD-02-02)'],
          approach: [
            'Model sessions as rows, not tokens carrying claims, so revocation needs no blocklist (ADR-008).',
            'Hash everything that functions as a bearer secret: session tokens, OTP codes, recovery codes.',
            'Rate limiting in Postgres for Release 1 (ADR-011); the interface is written so an edge or Redis implementation can replace it without touching callers.',
          ],
          archChanges: ['Introduces the session contract consumed by every later request', 'Introduces the rate-limit interface used by upload, share, and seal endpoints later'],
          deliverables: ['Auth migration', 'Session, OTP, and rate-limit services with tests'],
          testing: ['Unit tests on all three services', 'DB tests on RLS for auth tables'],
          ac: ['Sessions create, validate, and revoke correctly', 'OTP rules enforced', 'Rate limits enforced with correct reset windows'],
          dod: ['No plaintext secret persisted anywhere, asserted by test'],
          trace: ['§20.1', '§20.6', 'ADR-008', 'ADR-011'],
          epics: [
            {
              id: 'EPIC-02-01-01-01', name: 'Authentication Schema & Session Service',
              objective: 'Create the identity tables and a session service whose revocation is instant.',
              value: 'A stolen or stale session on a product holding family video must be killable in one tap. Stateless tokens cannot offer that; rows can.',
              stories: [['user whose phone was stolen', 'to sign that phone out from another device immediately', 'my memories are not sitting unlocked in someone else\'s pocket']],
              functional: [
                'Create a user with a case-insensitive unique email.',
                'Issue a session bound to a device fingerprint and user agent.',
                'Validate a session on every request, sliding its expiry.',
                'List active sessions with device metadata; revoke one or all.',
              ],
              technical: [
                'Session token: 32 bytes CSPRNG, stored as SHA-256, compared in constant time.',
                '30-day rolling expiry with sliding refresh (§20.1).',
                'Revocation is a row update; the next validation fails.',
              ],
              db: ['`users`, `sessions` with RLS', '`citext` unique email', 'Index on `sessions.token_hash` and `sessions.user_id`'],
              security: ['HTTP-only, Secure, SameSite=Lax cookies', 'No PII in the cookie', 'Constant-time token comparison'],
              testing: ['Session lifecycle', 'Revocation immediacy', 'Sliding expiry', 'RLS on auth tables'],
              ac: ['Revocation effective on the next request', 'No plaintext token stored', 'RLS enabled on both tables'],
              trace: ['§20.1', '§10 User'],
              tasks: [
                {
                  name: 'Create Authentication Schema Migration with RLS', type: 'database', priority: 'critical',
                  deps: ['TASK-008'], trace: ['§10 User', '§20.1', 'ADR-009'],
                  obj: 'Create the `users`, `sessions`, `credentials`, `accounts`, `otp_codes`, and `rate_limits` tables with RLS policies and correct indexes.',
                  ctx: 'These are the first real tables in the system. PHASE-01 established the RLS convention and a guard test that fails if any table lacks RLS; this migration is the first to honour it.',
                  why: 'The shape of `users` constrains everything downstream — the blueprint §10 `User` entity carries plan, storage accounting, timezone, and soft-delete fields that later phases depend on. Getting the email type wrong (plain `text` instead of `citext`) produces duplicate accounts differing only in case, which on a memory product means a user who cannot find their own archive.',
                  out: 'A migration creating six tables with RLS enabled and policies in place, unique constraints, and the indexes the session hot path needs. The PHASE-01 RLS guard test still passes.',
                  fr: [
                    '`users`: id, email (citext unique), email_verified_at, phone, phone_verified_at, name, avatar_media_id (nullable, no FK yet), locale, timezone, plan, storage_used_bytes, storage_quota_bytes, created_at, last_seen_at, deleted_at, hard_delete_after.',
                    '`sessions`: id, user_id, token_hash, user_agent, platform, ip_hash, created_at, last_used_at, expires_at, revoked_at.',
                    '`credentials` (WebAuthn): id, user_id, credential_id (unique), public_key, sign_count, transports, label, created_at, last_used_at.',
                    '`accounts` (OAuth): id, user_id, provider, provider_account_id (unique per provider), created_at.',
                    '`otp_codes`: id, identifier, channel, code_hash, purpose, attempts, expires_at, consumed_at, created_at.',
                    '`rate_limits`: key, window_start, count — with a primary key on (key, window_start).',
                  ],
                  tr: [
                    'Email column is `citext` with a unique index, so case differences collide (PHASE-01 enabled the extension for this).',
                    'All timestamps `timestamptz`. Never a naive local timestamp (ADR-024).',
                    'RLS enabled on every table in this migration, with a policy per the `packages/db/RLS.md` template.',
                    'Indexes: `sessions(token_hash)`, `sessions(user_id) WHERE revoked_at IS NULL`, `otp_codes(identifier, purpose)`, `users(deleted_at) WHERE deleted_at IS NOT NULL`.',
                    '`storage_quota_bytes` defaults to the free-tier value (10 GB) per blueprint §17.2 — **there is no memory-count column, because that limit does not exist.**',
                  ],
                  impl: [
                    'Write the Drizzle schema in `packages/db/src/schema/auth.ts`, importing enum values from `@mm/shared`.',
                    'Generate the migration and **read the SQL** before committing (PHASE-01 rule).',
                    'Add RLS policies. For `users`, a row is visible to a session belonging to that user. For `sessions`, `credentials`, and `accounts`, scope by `user_id`. `otp_codes` and `rate_limits` are service-only: enable RLS and add no permissive policy for the application role, so they are reachable only by the privileged service path — document this explicitly.',
                    'Add the indexes listed in §5. Note that `sessions(token_hash)` is the hottest index in the system: it is read on every authenticated request.',
                    'Set the free-tier quota default from a constant in `@mm/shared`, not a literal, so the pricing decision lives in one place.',
                    'Extend the PHASE-01 seed fixtures with the three-user cast described in TASK-009.',
                    'Run the RLS guard test and confirm it still passes with six new tables.',
                  ],
                  files: [
                    'packages/db/src/schema/auth.ts',
                    'packages/db/src/schema/index.ts  (register)',
                    'packages/db/migrations/0002_auth.sql',
                    'packages/db/src/seed/fixtures.ts  (extend)',
                    'packages/shared/src/constants/plans.ts',
                  ],
                  data: `Six tables. The two decisions worth stating explicitly:

**\`users.email\` is \`citext\`.** Two addresses differing only in case must be the same account. A plain \`text\` column plus a lowercasing application layer works until one code path forgets, at which point a user has two archives and can find neither.

**\`otp_codes\` and \`rate_limits\` have RLS enabled with no permissive application policy.** They are written and read by the service path only. This is deliberate: an application-layer bug must not be able to read a live OTP hash.

**No \`memories_per_month\` column exists** — blueprint §17.2 and Appendix C-6 decided the free tier is limited by storage and capsule horizon only. If a later task proposes such a column, that is a scope regression.`,
                  rules: [
                    'Email uniqueness is case-insensitive.',
                    'Every table in this migration has RLS enabled in the same migration that creates it.',
                    'Bearer secrets (session tokens, OTP codes) are stored hashed. The plaintext exists only in transit.',
                  ],
                  edge: [
                    'Two signups racing on the same email — the unique index must be the arbiter, and the application must handle the constraint violation as a friendly "already registered" rather than a 500.',
                    'A soft-deleted user signing up again with the same email — decide and document: either the address is released on hard delete only, or the soft-deleted row is reclaimed. Record the decision in §20; do not leave it to be discovered.',
                    'Apple private-relay addresses which can change — `accounts` must key on provider account id, not on email.',
                    'A very long user agent string — cap the stored length rather than failing the insert.',
                  ],
                  err: ['A unique-violation on email must surface as the non-enumerating registered-account code from `@mm/shared`, never as a database error.'],
                  sec: [
                    'No password column exists anywhere. If a later task adds one, the design has regressed (ADR-008).',
                    '`ip_hash`, not raw IP — the blueprint audit-log design hashes IPs, and the same reasoning applies here.',
                    'RLS on `otp_codes` with no application policy is a security control, not a convenience.',
                  ],
                  tests: {
                    db: [
                      'Two inserts differing only in email case violate the unique constraint.',
                      'RLS guard test passes with the six new tables.',
                      'A session row for user A is not selectable in a context scoped to user B.',
                      '`otp_codes` is not selectable by the application role.',
                    ],
                    unit: ['Free-tier quota default equals the constant in `@mm/shared`.'],
                  },
                  ac: [
                    'Migration applies and rolls back cleanly.',
                    'Case-insensitive email uniqueness proven by test.',
                    'RLS enabled with policies on all six tables; guard test green.',
                    '`otp_codes` unreadable by the application role, proven by test.',
                    'No password column exists.',
                    'Quota default sourced from a shared constant.',
                    'Soft-delete-email-reuse decision recorded in §20.',
                  ],
                  notes: ['Record the soft-delete email reuse decision here. It has real consequences for account deletion in PHASE-08.'],
                },
                {
                  name: 'Implement Session Service with Instant Revocation', type: 'backend', priority: 'critical',
                  deps: ['TASK-017'], trace: ['§20.1', 'ADR-008'],
                  obj: 'Build the session service: issue, validate with sliding refresh, list by device, and revoke individually or wholesale.',
                  ctx: 'ADR-008 chooses opaque server-side sessions over stateless JWTs specifically so revocation is immediate. The designer brief proposed JWT plus refresh tokens; gap analysis §2 records the override and the reason.',
                  why: 'A JWT is valid until it expires. On a product holding family video, "your stolen phone stays signed in for another fifteen minutes" is not an acceptable answer, and a revocation blocklist to fix it is just a slower session table. One row lookup per request buys correctness that is otherwise unobtainable.',
                  out: 'A service exposing `issueSession`, `validateSession`, `listSessions`, `revokeSession`, and `revokeAllSessions`, with cookie handling, sliding expiry, and constant-time comparison.',
                  fr: [
                    'Issue: generate a 32-byte token, store its SHA-256, set an HTTP-only cookie, record device metadata.',
                    'Validate: hash the presented token, look up a non-revoked unexpired row, update `last_used_at`, slide `expires_at` when past a refresh threshold.',
                    'List: return sessions for the current user with device, platform, first seen, last used, and a flag for the current session.',
                    'Revoke: set `revoked_at`; revoke-all excludes or includes the current session by parameter.',
                  ],
                  tr: [
                    'Cookie: HTTP-only, Secure, SameSite=Lax, path `/`, no PII in the value.',
                    'Constant-time comparison of the hash to avoid a timing oracle.',
                    'Sliding refresh only when more than a day has elapsed, to avoid a write on every request.',
                    'Validation is a single indexed lookup; the function must not perform more than one query on the hot path.',
                  ],
                  impl: [
                    'Create `apps/web/src/lib/auth/session.ts` with the five functions and a typed `SessionContext` return.',
                    'Use `crypto.randomBytes(32)` (or the Web Crypto equivalent) and base64url encoding for the token; hash with SHA-256 before storage.',
                    'Compare using a constant-time function. Never `===` on a secret.',
                    'Implement sliding refresh with a threshold so the common path is read-only.',
                    'Capture device metadata: user agent (truncated), platform hint, and a hashed IP. Do **not** store the raw IP.',
                    'Add `getCurrentSession()` for server components and server actions, returning `null` rather than throwing when absent, so callers can branch cleanly.',
                    'Write the revocation test as the primary test: issue, validate successfully, revoke, then assert the very next validation fails.',
                  ],
                  archDiagram: `request
  │ cookie: mm_session=<opaque token>
  ▼
validateSession()
  ├─ sha256(token) ──▶ sessions.token_hash  (single indexed lookup)
  ├─ reject if revoked_at IS NOT NULL or expires_at < now()
  ├─ slide expires_at if stale > 24h
  └─▶ SessionContext { userId, sessionId }
          │
          ▼
      lib/authz   ← every read and write continues from here`,
                  files: [
                    'apps/web/src/lib/auth/session.ts',
                    'apps/web/src/lib/auth/cookies.ts',
                    'apps/web/src/lib/auth/__tests__/session.test.ts',
                  ],
                  api: {
                    method: 'internal', path: 'lib/auth/session.ts',
                    req: '{ "userId": "uuid", "userAgent": "string", "ip": "string" }',
                    res: '{ "token": "opaque", "expiresAt": "2026-09-25T00:00:00Z" }',
                    validation: ['User must exist and not be soft-deleted', 'User agent truncated to a bounded length'],
                    errors: [['—', 'AUTH_SESSION_INVALID', 'Token unknown, revoked, or expired'], ['—', 'AUTH_USER_DEACTIVATED', 'User is soft-deleted or suspended']],
                  },
                  rules: [
                    'A revoked session fails on the very next request. No grace period.',
                    'A soft-deleted or suspended user\'s sessions fail validation even if not individually revoked.',
                    'The session cookie carries no user information — only the opaque token.',
                  ],
                  edge: [
                    'Concurrent requests both triggering a sliding refresh — the update must be idempotent and must not deadlock; an unconditional `SET expires_at = greatest(expires_at, ...)` is safer than read-then-write.',
                    'A token presented for a user deleted between issue and validation — validation must check the user\'s state, not only the session row.',
                    'Clock skew — always compare against database `now()`, never application time (the same rule as the workers claim loop).',
                    'Cookie absent on a public route — return null quietly, never throw.',
                    'Revoke-all invoked from the session being revoked — decide the default (keep current session alive) and make it explicit in the API.',
                  ],
                  err: ['Every failure returns the same non-enumerating invalid-session code; the reason is logged server-side but never disclosed.'],
                  sec: [
                    'Constant-time comparison.',
                    'Hashed IP only.',
                    'The token must never appear in a log line, an error message, or a Sentry payload — add it to the PHASE-01 scrubbing allow-list check.',
                    'Session fixation: issue a fresh token on privilege change, never reuse one across an authentication boundary.',
                  ],
                  tests: {
                    unit: [
                      'Issue then validate succeeds and returns the correct user.',
                      '**Revoke then validate fails immediately** — the defining test for this task.',
                      'Expired session fails.',
                      'Soft-deleted user\'s valid session fails.',
                      'Sliding refresh extends expiry only past the threshold.',
                      'Validation performs exactly one query (assert via a query counter).',
                      'Token never appears in a serialised log payload.',
                    ],
                    integration: ['Two concurrent validations both succeed without deadlock.'],
                  },
                  ac: [
                    'All five functions implemented and typed.',
                    'Revocation effective on the next request, proven by test.',
                    'Only the hash is stored; plaintext token absent from the database.',
                    'Single query on the validation hot path, asserted.',
                    'Constant-time comparison in use.',
                    'Cookie flags correct and verified in a browser context.',
                  ],
                  notes: ['This function runs on every authenticated request. Keep it to one query and resist adding joins; other data belongs in the callers.'],
                },
                {
                  name: 'Implement OTP Issue and Verify Service with Abuse Controls', type: 'backend', priority: 'critical',
                  deps: ['TASK-017'], trace: ['§29.3', '§29.4', '§20.6'],
                  obj: 'Build the one-time-code service covering issue, verify, expiry, attempt limits, lockout, and resend cooldown.',
                  ctx: 'Blueprint §29.3 and §29.4 specify the rules precisely: six digits, ten-minute expiry, five attempts then lockout, thirty-second resend countdown on mobile and sixty on email, and a non-enumerating success response.',
                  why: 'OTP is the primary signup path and, on iOS, the only auto-fill-assisted one (WebOTP is Chromium-only, §29.0). It is also the most abusable endpoint in the product: unmetered code issuance costs money and can be used to harass a third party by repeatedly texting their number.',
                  out: 'A service exposing `issueCode` and `verifyCode`, enforcing every documented limit, storing only hashes, and returning results that never reveal whether an account exists.',
                  fr: [
                    'Six-digit numeric code, cryptographically random.',
                    'Ten-minute expiry; single use; consumed on success.',
                    'Five verification attempts per code, then the code is invalidated and the identifier locked for ten minutes.',
                    'Resend cooldown: 30s for phone, 60s for email.',
                    'Rate limits: three issues per fifteen minutes per identifier, plus a per-IP limit.',
                    'Purposes are distinct: `signup`, `login`, `verify_phone`, `verify_email`, `step_up`. A code for one purpose must not satisfy another.',
                  ],
                  tr: [
                    'Codes stored as SHA-256 with the identifier and purpose as context; compared in constant time.',
                    'A code is invalidated when a newer one is issued for the same identifier and purpose.',
                    'Lockout state derives from the rate-limit table rather than a separate mechanism.',
                    'The verify response shape is identical for wrong code, expired code, and unknown identifier.',
                  ],
                  impl: [
                    'Create `apps/web/src/lib/auth/otp.ts` with `issueCode({ identifier, channel, purpose })` and `verifyCode({ identifier, purpose, code })`.',
                    'Generate the code with a CSPRNG and format to exactly six digits, allowing leading zeros — a common bug is generating an integer and losing the leading zero, producing a five-character code.',
                    'On issue: check the rate limit, invalidate prior unconsumed codes for the same identifier and purpose, insert the new hash, then hand the plaintext to the sender. **The plaintext is never persisted or logged.**',
                    'On verify: load the newest unconsumed code, check expiry, compare in constant time, increment attempts on failure, invalidate and lock at the fifth failure, and mark consumed on success.',
                    'Return a discriminated result so the caller can distinguish "locked" (which must be communicated with a countdown) from "invalid" (which must not reveal why) — the caller decides what the user sees, but the service must not leak the distinction into a generic error string.',
                    'Implement `getResendAvailableAt` so the UI can render an accurate countdown rather than guessing.',
                    'Write the abuse tests first: they are the point of this task.',
                  ],
                  files: [
                    'apps/web/src/lib/auth/otp.ts',
                    'apps/web/src/lib/rate-limit/index.ts',
                    'apps/web/src/lib/auth/__tests__/otp.test.ts',
                    'packages/emails/src/templates/OtpCode.tsx',
                  ],
                  api: {
                    method: 'internal', path: 'lib/auth/otp.ts',
                    req: '{ "identifier": "riya@example.com", "channel": "email", "purpose": "signup" }',
                    res: '{ "ok": true, "resendAvailableAt": "2026-08-26T10:01:00Z" }',
                    validation: ['Identifier valid for the channel (email format or E.164)', 'Purpose from the allowed set', 'Rate limit not exceeded'],
                    errors: [
                      ['429', 'RATE_LIMIT_OTP_ISSUE', 'More than three issues in fifteen minutes for this identifier'],
                      ['429', 'AUTH_OTP_LOCKED', 'Five failed attempts; identifier locked for ten minutes'],
                      ['400', 'AUTH_OTP_INVALID', 'Wrong, expired, consumed, or unknown — deliberately indistinguishable'],
                    ],
                  },
                  rules: [
                    'A code satisfies exactly one purpose. A `login` code must not verify an email address.',
                    'Wrong, expired, and unknown are indistinguishable to the caller-facing message.',
                    'Issuing a new code invalidates the previous one, so an attacker cannot accumulate valid codes.',
                    'The plaintext code exists only in the send call. It is never logged, never returned, never stored.',
                  ],
                  edge: [
                    'A code with leading zeros — must be preserved as a six-character string throughout.',
                    'A user requesting a resend and then entering the *first* code — the first is invalidated, so this fails. The UI must say "use the latest code we sent" rather than a bare error (§33.2).',
                    'Two devices verifying the same code simultaneously — the consume must be atomic so only one succeeds.',
                    'Clock skew between issue and verify — use database time on both sides.',
                    'An attacker enumerating by timing — constant-time comparison plus a uniform response path.',
                    'Harassment via repeated issuance to someone else\'s phone number — the per-identifier limit is what prevents this, and it must apply before any send occurs, not after.',
                    'Email delivery delayed beyond the expiry window — expiry is ten minutes, so an unusually slow send produces a genuine failure; the resend path must be obvious.',
                  ],
                  err: [
                    'A send failure after the code is stored must be reported so the user can retry, and must not consume the rate-limit budget for a code that never arrived — decide the ordering and record it in §20.',
                  ],
                  sec: [
                    'Rate limit is checked **before** sending, so cost and harassment are bounded.',
                    'Constant-time comparison.',
                    'No plaintext code in any log, error, or telemetry payload.',
                    'Purpose separation prevents a login code from being replayed as a step-up confirmation.',
                  ],
                  tests: {
                    unit: [
                      'Six-digit code with leading zeros is preserved.',
                      'Correct code verifies once; a second use fails.',
                      'Expired code fails.',
                      'Five wrong attempts lock the identifier; the sixth returns the locked result.',
                      'Issuing a new code invalidates the previous one.',
                      'A `login` code does not satisfy `verify_email`.',
                      'Rate limit blocks a fourth issue within fifteen minutes, and blocks it before any send is attempted.',
                      'Wrong, expired, and unknown identifiers produce an identical caller-facing message.',
                      'Plaintext code absent from the persisted row.',
                    ],
                    integration: ['Concurrent verification of the same code: exactly one succeeds.'],
                  },
                  ac: [
                    'All limits from §5 enforced and individually tested.',
                    'Only hashes persisted.',
                    'Purpose separation enforced.',
                    'Rate limit applied before send, proven by asserting the sender was not called.',
                    'Responses non-distinguishable across failure reasons.',
                    'Resend availability exposed for accurate UI countdowns.',
                  ],
                  notes: [
                    'The abuse controls are the substance of this task; the happy path is trivial by comparison.',
                    'Record the send-failure ordering decision in §20 — it affects whether a user with a flaky mailbox can retry.',
                  ],
                },
              ],
            },
          ],
        },
        {
          id: 'SPR-02-01-02', name: 'Auth Screens, Passkeys, OAuth & Recovery',
          objective: 'Everything a user touches to get into the product.',
          priority: 'critical', deps: ['SPR-02-01-01'], duration: '~5 days',
          goal: 'A person can sign up on their phone, verify, sign in later with a passkey, and recover access if they lose it.',
          inScope: ['Signup, login, verification, reset screens', 'Passkey registration and login', 'Google and Apple OAuth', 'Device list and revoke UI', 'Account recovery policy and flow'],
          outScope: ['Onboarding quiz (MOD-02-03)', 'Vault and authz (MOD-02-02)'],
          approach: [
            'Passkey-first for returning users, OTP as the universal fallback, OAuth as a convenience.',
            'Offer passkey creation immediately after signup and again after a successful reset, since the user has just proven control.',
            'Every screen uses the PHASE-01 form primitives so the §33 validation timing is inherited rather than reimplemented.',
          ],
          archChanges: ['Introduces the WebAuthn ceremony endpoints and the OAuth callback surface'],
          deliverables: ['Four auth screens with all five states in both themes', 'WebAuthn register and login', 'OAuth for two providers', 'Recovery policy document'],
          testing: ['E2E signup and login', 'WebAuthn with a virtual authenticator', 'Enumeration test', 'axe on every screen'],
          ac: ['End-to-end signup and login on a real device', 'Passkey login works on iOS and Android', 'Recovery policy committed'],
          dod: ['Every auth screen passes axe with zero serious or critical violations'],
          trace: ['§29.3', '§29.4', '§29.5', '§29.6'],
          epics: [
            {
              id: 'EPIC-02-01-02-01', name: 'Signup, Verification & Login Screens',
              objective: 'Build the four authentication screens to the specification in blueprint §29.3–29.6.',
              value: 'This is the first thing anyone sees after the landing page. It sets the expectation for how careful the rest of the product is.',
              stories: [
                ['new user', 'to create an account with just my email', 'I can start without inventing another password'],
                ['returning user', 'to get in with one tap', 'the app does not tax me for coming back'],
              ],
              functional: [
                'Signup: name, email, phone with country picker, terms checkbox, social options.',
                'Dual verification: phone code then email link, with a documented "verify later" state.',
                'Login: email or mobile, passkey quick-login, non-enumerating errors.',
                'Forgot/reset: always the same success message; expired-token state.',
              ],
              technical: [
                'Server actions returning the ADR-023 result union so forms render field-level errors without a boundary.',
                'Region auto-detected for the phone country picker.',
                'Async uniqueness check on email with the inline spinner-then-tick pattern.',
              ],
              ui: ['All four screens per §29.3–29.6 with five states each, both themes', 'Confetti moment on verification success (§29.4)', 'Amber "verify email to unlock scheduling" banner'],
              security: ['Non-enumerating copy', 'Rate-limit feedback with a live countdown', 'Terms acceptance recorded with a timestamp and version'],
              testing: ['Validation timing', 'Enumeration parity', 'E2E happy path and expired-code path', 'axe'],
              ac: ['All four screens complete with every state', 'Enumeration test passes', 'axe clean'],
              trace: ['§29.3', '§29.4', '§29.5', '§29.6'],
              tasks: [
                {
                  name: 'Build Signup Screen with Async Validation', type: 'frontend', priority: 'critical',
                  deps: ['TASK-011', 'TASK-019'], trace: ['§29.3', '§33.1', '§33.3'],
                  obj: 'Build `/signup` per blueprint §29.3: name, email, phone with country picker, terms acceptance, social options, and the documented validation behaviour.',
                  ctx: 'The PHASE-01 form primitives already implement the §33 timing rules. This task composes them into the first real form in the product and adds the async uniqueness checks.',
                  why: 'Signup is where the highest proportion of users abandon. Every unnecessary field, every premature validation error, and every dead disabled button costs a real account. The blueprint specifies the behaviour in detail precisely because these details compound.',
                  out: 'A working signup screen that creates a user, issues a phone OTP, and routes to verification — with inline async uniqueness feedback, a live password-free flow, and a terms checkbox that explains itself when unchecked.',
                  fr: [
                    'Fields: full name, email, mobile with country-code picker and flag, terms checkbox.',
                    'Region auto-detected from locale, overridable.',
                    'Async email uniqueness → "This email is already registered — Log in instead?" with an inline link.',
                    'Async phone uniqueness.',
                    'Social buttons for Google and Apple above an "or sign up with email" divider.',
                    'Primary button disabled until valid; tapping a disabled button explains what is missing.',
                    'Submitting locks the fields and shows a spinner in the button.',
                  ],
                  tr: [
                    'Server action returning the result union; field errors mapped onto the corresponding Field components.',
                    'Async checks debounced and cancellable, with the spinner-then-tick pattern from §33.4.',
                    'Name validation accepts Unicode, hyphens, and apostrophes — the `@mm/shared` validator already does this.',
                    'Terms acceptance persisted with a timestamp and a policy version.',
                  ],
                  impl: [
                    'Build the screen in `apps/web/src/app/(auth)/signup/page.tsx` composing `Field`, `Input`, `Select`, and `Button`.',
                    'Build the phone input with a country picker that auto-selects from locale. Validate as E.164 for the selected country using the shared validator.',
                    'Wire async uniqueness for email and phone: debounce, show the checking spinner, then tick or cross with a reason. Cancel an in-flight check when the value changes.',
                    'Implement `signUpAction` in `features/auth/actions.ts`: validate, create the user, create the personal vault (depends on the vault task), issue a phone OTP, and return the next step. **Do not sign the user in until at least one factor is verified** — decide and record whether a partial session is issued, because it affects the verify-later state.',
                    'Handle the unique-violation race by returning the non-enumerating registered-account result rather than a database error.',
                    'Record terms acceptance with the current policy version, so a future policy change can be re-consented.',
                    'Add the "skip passwords forever?" passkey offer immediately after successful signup, as a dismissible step rather than a blocker.',
                    'Build all five states: default, submitting, field-error, rate-limited with a live countdown, and server-error with retry.',
                  ],
                  files: [
                    'apps/web/src/app/(auth)/signup/page.tsx',
                    'apps/web/src/features/auth/components/SignupForm.tsx',
                    'apps/web/src/features/auth/components/PhoneInput.tsx',
                    'apps/web/src/features/auth/actions.ts',
                    'apps/web/src/features/auth/schema.ts',
                    'apps/web/src/features/auth/__tests__/signup.test.tsx',
                  ],
                  ui: `Per §29.3. Single column, generous spacing, Fraunces headline ("Start your vault"), Inter fields.

Order: name → email → phone → terms → primary. Social row above the divider, because a user who wants Google should not scroll past four fields to find it.

**Disabled primary with unchecked terms:** tapping it shows a tooltip or inline message naming the missing requirement (§29.3 specifies this behaviour explicitly). A silent dead button is the failure mode to avoid.

**Async feedback:** trailing adornment in the email field cycles spinner → ✓ or ✕. The already-registered message includes a link straight to login with the email pre-filled.

**Rate-limited state:** "Too many attempts, try again in 4:52" with a live countdown, not a static message.

All states in both themes.`,
                  rules: [
                    'No password field exists (ADR-008).',
                    'Terms must be actively checked; pre-checking a consent box is not consent.',
                    'The already-registered message is the one place enumeration is acceptable, because the user typed their own address and the alternative is a confusing dead end — but the *reset* flow must remain non-enumerating (§29.6). Record this asymmetry in §20.',
                  ],
                  edge: [
                    'A user with a Unicode name in Devanagari or Tamil script — must validate and persist correctly.',
                    'A phone number valid in one country and invalid in another when the picker changes — re-validate on country change.',
                    'Async check in flight when the user submits — submission must wait for or re-run the check server-side; never trust the client result.',
                    'Autofill populating fields after hydration, leaving the button disabled because state is stale — read DOM values on mount.',
                    'A soft-deleted account\'s email being reused, per the decision recorded in TASK-017.',
                    'Offline submission — block with a clear message; account creation cannot be queued.',
                  ],
                  err: [
                    'Field errors render inline against the field, never as a toast.',
                    'Rate limiting shows a countdown.',
                    'A server failure keeps the entered values so the user does not retype.',
                  ],
                  sec: [
                    'The server re-validates everything; the client schema is convenience only (ADR-022).',
                    'Uniqueness is decided by the database constraint, not the async check — the check is a hint to the user, not an authorization.',
                    'No credential or code is ever logged from this screen.',
                  ],
                  tests: {
                    component: [
                      'Validation fires on blur, not on the first keystroke.',
                      'Disabled primary explains itself when tapped with terms unchecked.',
                      'Async uniqueness renders spinner then result, and cancels on change.',
                      'Unicode name accepted; single-character name rejected.',
                      'Country change re-validates the phone number.',
                    ],
                    e2e: ['Playwright: complete signup and land on phone verification.', 'Duplicate email shows the login link and navigates with the email pre-filled.'],
                    a11y: ['axe clean; every field has an associated label; error text is announced politely.'],
                  },
                  ac: [
                    'Screen matches §29.3 including field order and social placement.',
                    'All five states implemented in both themes.',
                    'Async uniqueness works with cancellation.',
                    'Unicode names accepted.',
                    'Disabled primary explains itself.',
                    'Terms acceptance persisted with version and timestamp.',
                    'Passkey offer appears after success and is dismissible.',
                    'axe clean.',
                  ],
                  notes: ['Record in §20 the decision on whether a session is issued before verification, and the enumeration asymmetry between signup and reset.'],
                },
                {
                  name: 'Build Dual Verification Screens (Phone OTP + Email Link)', type: 'frontend', priority: 'critical',
                  deps: ['TASK-019', 'TASK-020'], trace: ['§29.4', '§29.0'],
                  obj: 'Build the two-step verification flow: phone OTP with six boxes and accurate resend countdown, then email verification with a documented verify-later grace state.',
                  ctx: 'Blueprint §29.4 specifies both steps, including the confetti success moment and the amber banner that appears when a user chooses "I\'ll verify later". Section §29.0 records that WebOTP auto-fill is Chromium-only, so this flow must not depend on it.',
                  why: 'The verify-later path is the interesting part. Blocking a new user entirely until they check their email loses accounts; letting them in with no verification means a capsule can be sealed by an owner nobody can reach. The blueprint resolves this by gating **scheduling specifically** — which is exactly the right trade, and it needs to be implemented as a real gate rather than a note.',
                  out: 'Step 1 verifies the phone with a six-box OTP input, auto-fill where available, paste everywhere, and an accurate resend countdown. Step 2 offers email verification with a working "verify later" that sets a gate the seal flow will later honour.',
                  fr: [
                    'Step 1: six auto-advancing boxes, `autocomplete="one-time-code"`, paste support, 30s resend countdown, "Change number" link.',
                    'Error: boxes shake once and show "Incorrect code — 2 attempts left". Lockout after five with a countdown.',
                    'Step 2: masked address ("r•••@gmail.com"), animated envelope, "Open email app", 60s resend, and "I\'ll verify later".',
                    'Success: full-screen confetti and "You\'re in! 🎉", then route onward.',
                    'Verify-later sets a persistent amber banner on Home: "Verify email to unlock scheduling."',
                  ],
                  tr: [
                    'WebOTP registered where supported; on iOS rely on keyboard autofill plus paste (§29.0). **The design must work with neither.**',
                    'Resend countdown driven by `getResendAvailableAt` from the OTP service, not a client-side guess, so a page reload shows the true remaining time.',
                    'Confetti respects `prefers-reduced-motion` — a static celebratory badge instead (§33.8, §33.13).',
                    'The verify-later gate is a server-side check on `users.email_verified_at`, not a client flag.',
                  ],
                  impl: [
                    'Build step 1 using the PHASE-01 `OtpInput`. Register the WebOTP API where available with a feature check, and make sure the manual and paste paths are fully functional without it.',
                    'Drive the resend countdown from the server-provided timestamp so a refresh does not reset it.',
                    'Show remaining attempts in the error copy, per §29.4. Do this carefully: it aids a legitimate user and reveals little, since the identifier is already known to them.',
                    'Build step 2 with the masked address, the resend cooldown, and the verify-later action. Verify-later must persist a state the rest of the app can read — the simplest correct approach is that nothing is persisted at all, since the gate derives from `email_verified_at` being null.',
                    'Build the banner component and mount it in the app shell so it appears wherever the user goes, not only on Home.',
                    'Implement the confetti success moment with a reduced-motion variant.',
                    'Handle the already-verified case idempotently and warmly, since users click old links.',
                  ],
                  files: [
                    'apps/web/src/app/(auth)/verify/phone/page.tsx',
                    'apps/web/src/app/(auth)/verify/email/page.tsx',
                    'apps/web/src/app/(auth)/verify/email/[token]/route.ts',
                    'apps/web/src/features/auth/components/VerifyPhoneForm.tsx',
                    'apps/web/src/features/auth/components/VerifyEmailPrompt.tsx',
                    'apps/web/src/components/layout/VerifyEmailBanner.tsx',
                    'apps/web/src/features/auth/components/Celebration.tsx',
                    'packages/emails/src/templates/VerifyEmail.tsx',
                  ],
                  ui: `**Step 1 of 2 — phone.** Large heading, the number shown so the user can confirm it, six generously spaced boxes, resend countdown, and a "Change number" link that returns to signup with the value pre-filled.

**Step 2 of 2 — email.** Masked address, animated envelope, "Open email app", "Resend (60s)", and "I'll verify later" as a quiet text link — present but not encouraged.

**Success.** Confetti, "You're in! 🎉", auto-advance after a beat. Under reduced motion: a static badge and the same copy.

**Banner (verify-later).** Amber, persistent, one line, with a "Verify now" action: "Verify email to unlock scheduling."

All states both themes.`,
                  rules: [
                    'Scheduling is gated on email verification. A capsule owner must be reachable, because the delivery promise depends on it.',
                    'Verify-later is allowed and must not feel punitive — the user keeps full read and create access.',
                    'Clicking an already-used verification link shows a friendly already-verified state, never an error.',
                    'Confetti is reserved for this moment and three others (§33.8). Do not add more.',
                  ],
                  edge: [
                    'iOS with no WebOTP — manual entry and paste must both be smooth; test on a real device.',
                    'Paste of a code containing spaces or a trailing newline — normalise (the primitive already does; assert it here).',
                    'A user who requested a resend entering the older code — show "use the latest code we sent" rather than a bare failure.',
                    'Verification email landing in spam — the resend path and the "change email" affordance must be easy to find.',
                    'A verification link opened on a different device from the one that signed up — must work, and must not require the original session.',
                    'A verification link opened after the account is deleted — neutral message, no leak.',
                    'Lockout during a genuine attempt — the countdown must be accurate and the copy must not accuse.',
                  ],
                  err: ['Every failure names what to do next: resend, change number, or wait with a countdown.'],
                  sec: [
                    'The email verification token is single-use, expiring, and stored hashed.',
                    'Attempt-count disclosure is limited to the code entry screen for an identifier the user has already demonstrated knowledge of.',
                    'The verify-email route must not create a session by itself — clicking a link in an email should not authenticate a different device.',
                  ],
                  tests: {
                    component: [
                      'Six-box entry auto-advances; paste of a spaced code fills correctly.',
                      'Resend countdown reflects the server timestamp and survives a remount.',
                      'Error shows remaining attempts; lockout shows a countdown.',
                      'Reduced motion replaces confetti with a static badge.',
                    ],
                    e2e: [
                      'Full signup → phone verify → email verify → app.',
                      'Verify-later path lands in the app with the banner present.',
                      'Already-verified link shows the friendly state.',
                    ],
                    integration: ['Email verification token is single-use and does not create a session.'],
                    a11y: ['axe on all three screens; OTP boxes have a group label and per-box accessible names.'],
                  },
                  ac: [
                    'Both steps implemented per §29.4 with all five states in both themes.',
                    'Works on iOS with no WebOTP, using autofill and paste — verified on a real device.',
                    'Resend countdown accurate across a page reload.',
                    'Verify-later grants access and shows the persistent banner.',
                    'Confetti has a reduced-motion variant.',
                    'Verification link is single-use and does not authenticate a new device.',
                    'axe clean.',
                  ],
                  notes: ['The verify-later gate is enforced again in PHASE-05 at the seal action. Note the dependency there so it is not forgotten.'],
                },
                {
                  name: 'Build Login and Password Reset Screens with Non-Enumerating Responses', type: 'frontend', priority: 'critical',
                  deps: ['TASK-019', 'TASK-021'], trace: ['§29.5', '§29.6'],
                  obj: 'Build `/login` with email-or-mobile entry plus passkey quick-login, and the forgot/reset flow whose responses never reveal whether an account exists.',
                  ctx: 'Blueprint §29.5 and §29.6 specify both screens, including the deliberately vague failure message and the "always show success" behaviour on reset.',
                  why: 'Account enumeration on this product is worse than usual: confirming that a given email has a Moments & Memories account reveals something personal about that person. The blueprint\'s insistence on identical responses is a privacy requirement, not just a security convention.',
                  out: 'A login screen defaulting to the fastest available method, and a reset flow that behaves identically for existing and non-existing accounts, with a clear expired-token state.',
                  fr: [
                    'Segmented control: Email / Mobile.',
                    'Passkey quick-login button shown when a credential exists for this device.',
                    'Social login row.',
                    '"Forgot?" link; failure message is "Email or password is incorrect" style — non-specific.',
                    'CAPTCHA after five failed attempts.',
                    'Deactivated account: "Your account is deactivated. Contact support" with a support link.',
                    'Reset: always "If an account exists, we\'ve sent a reset link."',
                    'Expired token: "This link has expired — request a new one" with a one-tap re-request.',
                  ],
                  tr: [
                    'Passkey availability detected via conditional mediation where supported, so the browser can surface a credential without a button press.',
                    'Reset responses identical in body, status, and **timing** — an artificial delay may be needed so a database miss is not faster than a hit.',
                    'Post-reset, offer passkey creation since the user has just proven email control.',
                  ],
                  impl: [
                    'Build the login screen with the segmented control and the passkey button gated on availability.',
                    'Implement `requestResetAction` returning the same success result regardless of whether the account exists, and **normalise response timing** — a timing difference is a working enumeration oracle even when the body is identical.',
                    'Build the reset screen reached from the emailed link, with the expired-token state and a re-request action.',
                    'After a successful reset, offer passkey creation.',
                    'Implement the CAPTCHA trigger after repeated failures, and make sure it does not appear on the first legitimate mistake.',
                    'Handle the deactivated-account state per §29.5, which is the one case where a specific message is correct because the user needs to know to contact support.',
                    'Write the enumeration test as the defining test: assert identical status, body, and comparable timing for a known and an unknown address.',
                  ],
                  files: [
                    'apps/web/src/app/(auth)/login/page.tsx',
                    'apps/web/src/app/(auth)/forgot/page.tsx',
                    'apps/web/src/app/(auth)/reset/[token]/page.tsx',
                    'apps/web/src/features/auth/components/LoginForm.tsx',
                    'apps/web/src/features/auth/components/PasskeyButton.tsx',
                    'apps/web/src/features/auth/actions.ts  (extend)',
                    'apps/web/src/features/auth/__tests__/enumeration.test.ts',
                  ],
                  ui: `**Login.** Segmented Email / Mobile. When a passkey exists for this device, show it as the prominent primary path with the code option below — a returning user should not have to wait for an email.

**Forgot.** One field, one button, then a success panel with the identical message every time.

**Reset.** Reached from the emailed link. Expired state is explanatory with a one-tap re-request. Success routes to login with the address pre-filled, plus the passkey offer.

**Deactivated.** Clear, non-blaming, with a support link.`,
                  rules: [
                    'Login failure never distinguishes unknown account from wrong credential.',
                    'Reset always reports success.',
                    'Response timing must not leak existence.',
                    'The deactivated message is the deliberate exception, because the user cannot act without it.',
                  ],
                  edge: [
                    'A reset requested for an unknown address — success shown, no email sent, and the rate limit still consumed so the endpoint cannot be used as an oracle by volume.',
                    'A reset link used twice — second use shows the expired state.',
                    'A reset link opened after the account is deleted — neutral expired state.',
                    'Passkey present on the device but the user wants a different account — the code path must remain reachable, not buried.',
                    'Passkey ceremony cancelled by the user — return to the screen cleanly with no error toast; cancellation is not a failure.',
                    'CAPTCHA appearing for a legitimate user on a shared IP — trigger on identifier plus IP, not IP alone.',
                  ],
                  err: ['A network failure during a passkey ceremony must fall back to the code path with an explanation, not leave the user stuck.'],
                  sec: [
                    'Identical response body, status, and timing on reset — the timing normalisation is a real requirement, not a nicety.',
                    'Reset token single-use, expiring, stored hashed.',
                    'A fresh session token is issued after reset; any prior session for that user is revoked.',
                  ],
                  tests: {
                    component: ['Segmented control switches modes and validates appropriately.', 'Passkey button hidden when unavailable.'],
                    integration: [
                      '**Enumeration test: identical status, body, and comparable timing for known and unknown addresses.**',
                      'Reset token single-use.',
                      'Reset revokes prior sessions.',
                    ],
                    e2e: ['Login by code; login by passkey with a virtual authenticator; reset end to end including the expired state.'],
                    a11y: ['axe on all three screens.'],
                  },
                  ac: [
                    'All three screens implemented with every state in both themes.',
                    'Enumeration test passes on body, status, and timing.',
                    'Reset token single-use; prior sessions revoked.',
                    'Passkey path primary when available, code path always reachable.',
                    'Passkey cancellation handled without an error state.',
                    'CAPTCHA triggers on identifier plus IP.',
                    'axe clean.',
                  ],
                  notes: ['The timing normalisation is easy to omit and easy to test. Do both.'],
                },
              ],
            },
            {
              id: 'EPIC-02-01-02-02', name: 'Passkeys, OAuth & Account Recovery',
              objective: 'Give users fast, durable sign-in — and a way back in when a factor is lost.',
              value: 'Passkeys remove the most common support burden and the most common breach vector. The recovery path is what makes a passwordless lifetime vault trustworthy rather than terrifying.',
              stories: [
                ['returning user', 'to sign in with my face', 'getting into my own archive takes a second'],
                ['user who replaced their phone', 'to get back in without losing everything', 'a lost device is an inconvenience rather than a catastrophe'],
              ],
              functional: [
                'Register a passkey; label it; remove it.',
                'Sign in with a passkey.',
                'Sign in with Google or Apple, including private-relay addresses.',
                'Recover access when the primary factor is lost.',
              ],
              technical: [
                'WebAuthn registration and assertion with challenge verification and replay rejection.',
                'OAuth identity linked by provider account id, never by email.',
                'Recovery codes generated once, shown once, stored hashed.',
              ],
              security: [
                'Sign-count regression rejected as a cloning signal.',
                'OAuth email collision must not permit account takeover.',
                'Recovery must not create a social-engineering path — the policy is written, not improvised by support.',
              ],
              testing: ['Virtual authenticator register and login', 'Replay rejection', 'OAuth collision handling', 'Recovery flow'],
              ac: ['Passkey works on iOS and Android', 'OAuth linking cannot take over an account', 'Recovery policy committed and implemented'],
              trace: ['§20.1', '§29.3', '§29.5', 'gap G-1'],
              tasks: [
                {
                  name: 'Implement WebAuthn Passkey Registration and Authentication', type: 'backend', priority: 'high',
                  deps: ['TASK-018'], trace: ['§20.1', '§29.0', 'ADR-008'],
                  obj: 'Implement the WebAuthn ceremonies for registering a passkey and signing in with it, including challenge handling, replay rejection, and multi-credential management.',
                  ctx: 'ADR-008 makes passkeys the primary sign-in path. Blueprint §29.0 also notes that WebAuthn is what delivers the "biometric app lock" promised in the original pricing copy — the same primitive serves both.',
                  why: 'A lifetime vault protected by an emailed code is protected by the user\'s email provider. Passkeys move the factor onto hardware the user physically holds, which is both stronger and faster. Getting the verification wrong, though — skipping origin checks or ignoring the sign counter — turns a strong factor into a decorative one.',
                  out: 'Endpoints for registration options, registration verification, authentication options, and authentication verification; a credentials list with labels; and the ability to remove a credential safely.',
                  fr: [
                    'Registration: issue options with a fresh challenge, verify the attestation, store credential id, public key, sign count, transports, and a device label.',
                    'Authentication: issue options, verify the assertion, update the sign count, issue a session.',
                    'Multiple credentials per user; list, label, and remove.',
                    'Removing the last credential is allowed only if another factor remains.',
                  ],
                  tr: [
                    'Challenges are single-use, short-lived, and bound to the session or a cookie — never accepted twice.',
                    'Relying-party id and origin verified strictly against configuration, not derived from the request.',
                    '**A sign count that does not increase is rejected** where the authenticator reports one, as a cloning signal.',
                    'User verification required, so the ceremony is genuinely biometric or PIN-backed rather than presence-only.',
                    'Discoverable credentials (resident keys) preferred so login needs no prior identifier.',
                  ],
                  impl: [
                    'Add `apps/web/src/lib/auth/webauthn.ts` wrapping a maintained server library; do not hand-roll CBOR or COSE parsing.',
                    'Store the challenge server-side keyed to a short-lived record, and delete it on use. An unconsumed challenge must expire.',
                    'Verify origin and RP id against explicit configuration. Note that preview deployments have different origins — handle this by configuration per environment, and record in §20 how preview origins are managed, since a permissive origin check is a real vulnerability.',
                    'Persist credential id (unique), public key, sign count, transports, and a human label derived from the user agent, editable later.',
                    'On authentication, look up by credential id, verify the assertion, compare and update the sign count, then issue a session via the PHASE-02 session service.',
                    'Implement removal with the safety rule: refuse to remove the last remaining factor unless the account has a verified email that can receive a code.',
                    'Test with a virtual authenticator in Playwright — this is the only practical way to get automated coverage.',
                  ],
                  archDiagram: `REGISTER                              AUTHENTICATE
POST /api/auth/passkey/options        POST /api/auth/passkey/login/options
   └─ challenge stored, single use       └─ challenge stored, single use
POST /api/auth/passkey/verify         POST /api/auth/passkey/login/verify
   ├─ verify origin + RP id              ├─ lookup by credential_id
   ├─ store pubkey + sign_count          ├─ verify assertion + origin
   └─ label from user agent              ├─ REJECT if sign_count regressed
                                         └─ issueSession()`,
                  files: [
                    'apps/web/src/lib/auth/webauthn.ts',
                    'apps/web/src/app/api/auth/passkey/options/route.ts',
                    'apps/web/src/app/api/auth/passkey/verify/route.ts',
                    'apps/web/src/app/api/auth/passkey/login/options/route.ts',
                    'apps/web/src/app/api/auth/passkey/login/verify/route.ts',
                    'apps/web/src/features/auth/components/PasskeyManager.tsx',
                    'apps/web/src/lib/auth/__tests__/webauthn.test.ts',
                  ],
                  api: {
                    method: 'POST', path: '/api/auth/passkey/login/verify',
                    req: '{\n  "credentialId": "base64url",\n  "clientDataJSON": "base64url",\n  "authenticatorData": "base64url",\n  "signature": "base64url"\n}',
                    res: '{ "ok": true, "data": { "redirectTo": "/app" } }',
                    validation: ['Challenge exists, unconsumed, and unexpired', 'Origin and RP id match configuration', 'Signature valid for the stored public key', 'Sign count not regressed'],
                    errors: [
                      ['400', 'AUTH_WEBAUTHN_CHALLENGE_INVALID', 'Challenge unknown, reused, or expired'],
                      ['400', 'AUTH_WEBAUTHN_ORIGIN_MISMATCH', 'Origin or RP id does not match configuration'],
                      ['401', 'AUTH_WEBAUTHN_VERIFICATION_FAILED', 'Signature invalid'],
                      ['409', 'AUTH_WEBAUTHN_COUNTER_REGRESSED', 'Possible cloned authenticator'],
                    ],
                  },
                  rules: [
                    'A challenge is used exactly once.',
                    'Origin and RP id come from configuration, never from the request.',
                    'A regressed sign count is treated as a security event: reject, log, and notify the user.',
                    'The last remaining factor cannot be removed.',
                  ],
                  edge: [
                    'Authenticators that always report sign count zero — handle by treating zero as "not reported" rather than rejecting every login from such a device.',
                    'A user registering the same physical authenticator twice — the unique credential id makes this a friendly no-op, not an error.',
                    'Preview-deployment origins differing per PR — configuration-driven, and the mechanism recorded in §20.',
                    'Cross-device passkey (phone authenticating a desktop) — must work; test at least once manually.',
                    'A user cancelling the browser prompt — a normal outcome, not an error state.',
                    'Removing a credential from the very device being used — must sign that device out cleanly rather than leaving a broken session.',
                    'Safari and Chrome differing in attestation formats — the chosen library must handle both; verify rather than assume.',
                  ],
                  err: ['Verification failures return a generic authentication failure to the client; the specific reason is logged server-side only.'],
                  sec: [
                    'User verification required so the factor is genuinely biometric or PIN-backed.',
                    'Sign-count regression is a cloning indicator and must be surfaced to the user, not silently tolerated.',
                    'The public key is not a secret, but the credential mapping is personal data — it is covered by RLS like every other user-scoped table.',
                  ],
                  tests: {
                    api: [
                      'Register and authenticate with a virtual authenticator.',
                      'Reused challenge rejected.',
                      'Mismatched origin rejected.',
                      'Regressed sign count rejected.',
                      'Duplicate credential registration is idempotent.',
                    ],
                    integration: ['Removing the last factor is refused when no verified email exists.', 'Removing the current device\'s credential revokes that session.'],
                    e2e: ['Playwright with a virtual authenticator: register during signup, sign out, sign in with the passkey.'],
                  },
                  ac: [
                    'Registration and authentication work end to end with a virtual authenticator.',
                    'Challenge reuse, origin mismatch, and counter regression all rejected, each proven by test.',
                    'Multiple credentials supported with labels and safe removal.',
                    'Verified manually on at least one iOS and one Android device.',
                    'Preview-origin configuration mechanism recorded in §20.',
                    'Cancellation handled as a normal outcome.',
                  ],
                  notes: [
                    'Use a maintained WebAuthn library. Hand-rolling attestation parsing is a reliable way to introduce a vulnerability.',
                    'This same primitive becomes the app lock in PHASE-08. Keep the verification function reusable outside the login flow.',
                  ],
                },
                {
                  name: 'Implement Google and Apple OAuth with Safe Account Linking', type: 'backend', priority: 'medium',
                  deps: ['TASK-018'], trace: ['§29.3', '§29.5', 'ADR-008'],
                  obj: 'Add Google and Apple sign-in, linking provider identities to accounts without creating an account-takeover path.',
                  ctx: 'Blueprint §29.3 lists both providers, noting Apple is effectively mandatory where an iOS presence is expected. The `accounts` table from TASK-017 keys on provider account id rather than email.',
                  why: 'The dangerous part of social login is linking. If an unverified provider email is trusted to attach to an existing account, anyone who can create a provider account with someone\'s address can take over their vault. Apple\'s private-relay addresses, which can change, make email-based linking additionally unreliable.',
                  out: 'Working sign-in with both providers, correct handling of Apple private relay, and a linking rule that cannot be used for takeover.',
                  fr: [
                    'Callback routes for both providers; state and PKCE verified.',
                    'New provider identity with no matching account creates a user.',
                    'Provider identity matching an existing `accounts` row signs that user in.',
                    'Provider email matching an existing account but no linked identity requires explicit verified linking.',
                    'Apple private-relay addresses supported, including a later change of relay address.',
                  ],
                  tr: [
                    'Link by `(provider, provider_account_id)`, never by email.',
                    '`state` parameter verified; PKCE where the provider supports it.',
                    'Only a provider-verified email may be used to pre-fill; it never grants a link on its own.',
                    'Apple\'s name and email are returned only on first authorisation — persist them then or lose them.',
                  ],
                  impl: [
                    'Configure both providers and implement the callback routes with state and PKCE verification.',
                    'Implement the linking decision explicitly as a small function with the four documented cases, and unit-test each. This is the part worth writing carefully.',
                    'For the "email matches, identity does not" case, do **not** auto-link. Require the user to sign in by their existing method and link from settings, or complete an emailed confirmation. Record the chosen approach in §20.',
                    'Persist Apple\'s first-authorisation name and email immediately; treat their absence on subsequent sign-ins as normal.',
                    'Handle a changed Apple relay address by keying on the stable subject identifier, so the account is found regardless.',
                    'Issue a session through the existing session service so device metadata and revocation behave identically to other paths.',
                  ],
                  files: [
                    'apps/web/src/app/api/auth/oauth/[provider]/route.ts',
                    'apps/web/src/app/api/auth/oauth/[provider]/callback/route.ts',
                    'apps/web/src/lib/auth/oauth.ts',
                    'apps/web/src/lib/auth/link-account.ts',
                    'apps/web/src/lib/auth/__tests__/link-account.test.ts',
                  ],
                  api: {
                    method: 'GET', path: '/api/auth/oauth/[provider]/callback',
                    req: '?code=...&state=...',
                    res: '302 → /app  or  /login?error=LINK_REQUIRED',
                    validation: ['`state` matches the stored value', 'PKCE verifier matches', 'Provider token exchange succeeds', 'Subject identifier present'],
                    errors: [
                      ['400', 'AUTH_OAUTH_STATE_MISMATCH', 'CSRF protection triggered'],
                      ['409', 'AUTH_OAUTH_LINK_REQUIRED', 'Email matches an existing account with no linked identity'],
                      ['502', 'AUTH_OAUTH_PROVIDER_ERROR', 'Token exchange or profile fetch failed'],
                    ],
                  },
                  rules: [
                    '**Never auto-link on email alone.** This is the account-takeover vector.',
                    'Provider account id is the identity; email is display data.',
                    'A provider email that is not marked verified by the provider is treated as unverified.',
                  ],
                  edge: [
                    'Apple private relay changing between sign-ins — the subject identifier keeps the account findable.',
                    'Apple returning name and email only once — persist on first authorisation.',
                    'A user with both Google and Apple wanting one account — supported by multiple `accounts` rows.',
                    'Provider outage mid-flow — fail gracefully back to the login screen with the code path available.',
                    'A provider email colliding with a soft-deleted account — follow the TASK-017 decision.',
                    'A user revoking access at the provider — the next sign-in fails; existing sessions remain valid, which is correct but worth documenting.',
                  ],
                  err: ['Provider failures return the user to login with a retry and an alternative method, never a stack trace or a blank page.'],
                  sec: [
                    'State and PKCE verified on every callback.',
                    'Client secrets in environment configuration only.',
                    'The link-required path must not disclose whether the email is registered — the message should be actionable without confirming existence. This is in tension with usability; record the wording decision in §20.',
                  ],
                  tests: {
                    unit: [
                      'Linking function: all four cases produce the documented outcome.',
                      '**Email match without identity match does not link.**',
                      'Apple subject identifier keys the lookup, not the relay email.',
                    ],
                    api: ['State mismatch rejected.', 'Successful callback issues a session with correct device metadata.'],
                  },
                  ac: [
                    'Both providers sign in successfully.',
                    'Auto-link on email is impossible, proven by test.',
                    'Apple private-relay change does not orphan the account.',
                    'Apple first-authorisation name and email persisted.',
                    'State and PKCE verified.',
                    'Linking wording decision recorded in §20.',
                  ],
                  notes: ['The linking function is small and security-critical. It deserves the most careful test coverage in this epic.'],
                },
                {
                  name: 'Design and Implement Account Recovery Policy and Flow', type: 'backend', priority: 'high',
                  deps: ['TASK-023', 'TASK-019'], trace: ['gap G-1', '§20.1', '§20.9'],
                  obj: 'Define and implement a recovery path for a user who has lost their passkey and their access to the registered email, without creating a social-engineering route into a family archive.',
                  ctx: 'Gap analysis G-1 records this as a requirement the blueprint does not cover. It matters because the product is passwordless and is explicitly sold as a lifetime vault: "you have permanently lost everything" and "support can let you back in" are both unacceptable answers.',
                  why: 'A recovery path is the exact point where security and compassion conflict. Too strict and a grieving user cannot reach their late parent\'s messages. Too loose and the recovery path becomes the easiest way to steal an account — and on this product, the thing stolen is someone\'s family history. The answer must be written down *before* the first support request, because improvising it under emotional pressure is how accounts get handed to the wrong person.',
                  out: 'A written policy committed to the repository, plus an implemented flow: recovery codes generated at signup, a secondary contact option, and a documented manual escalation with a waiting period and multi-signal verification.',
                  fr: [
                    'Ten single-use recovery codes generated when the first passkey is created; displayed once; stored hashed.',
                    'A recovery code plus the registered phone allows re-establishing access.',
                    'An optional secondary email or trusted contact can be added in settings.',
                    'Where no automated factor remains, a manual escalation exists: identity signals, a mandatory waiting period, notification to every known contact method, and an owner cancellation window.',
                    'Every recovery attempt is written to the audit log.',
                  ],
                  tr: [
                    'Recovery codes are 128-bit, formatted for legibility, hashed with a slow KDF because they are long-lived and low-entropy relative to a key.',
                    'A used code is consumed; the count remaining is shown; regeneration invalidates all previous codes.',
                    'Manual escalation is a state machine with recorded evidence and an owner-cancellable waiting period — deliberately mirroring the legacy-vault unlock protocol shape (§29.25).',
                    'Recovery never bypasses the waiting period, regardless of who asks.',
                  ],
                  impl: [
                    'Write `docs/ACCOUNT_RECOVERY.md` **first**. It must state: what counts as sufficient evidence, the waiting period, who may approve, what is notified, what is logged, and — explicitly — that support staff cannot shorten or bypass the process. The document is the deliverable; the code enforces it.',
                    'Implement recovery-code generation at first passkey creation: ten codes, shown once with a copy and download affordance, stored hashed.',
                    'Implement redemption: code plus a verified phone OTP re-establishes access and forces enrolment of a new factor.',
                    'Add secondary contact in settings, verified on entry.',
                    'Implement the manual escalation state machine: request, evidence recorded, waiting period (recommend 14 days), notification to every known contact at every step, and an owner cancellation that immediately terminates it.',
                    'Write every state transition to the audit log, including which admin acted.',
                    'Add a rate limit so recovery cannot be used to spam a user with alarming notifications.',
                  ],
                  archDiagram: `AUTOMATED
recovery code + phone OTP  ──▶ access restored ──▶ must enrol a new factor

MANUAL ESCALATION (no factor remains)
request ──▶ evidence recorded ──▶ notify ALL known contacts
        ──▶ 14-day waiting period  (owner can cancel at any point)
        ──▶ second approver
        ──▶ access restored + full audit trail shown to the owner

Support staff cannot shorten or bypass any step. That is the point.`,
                  files: [
                    'docs/ACCOUNT_RECOVERY.md',
                    'packages/db/src/schema/recovery.ts',
                    'packages/db/migrations/0003_recovery.sql',
                    'apps/web/src/lib/auth/recovery.ts',
                    'apps/web/src/features/auth/components/RecoveryCodes.tsx',
                    'apps/web/src/app/(auth)/recover/page.tsx',
                    'apps/web/src/lib/auth/__tests__/recovery.test.ts',
                  ],
                  data: `**\`recovery_codes\`** — id, user_id, code_hash, consumed_at, created_at, batch_id. RLS scoped by user.

**\`recovery_requests\`** — id, user_id, state (\`requested\` | \`waiting\` | \`approved\` | \`cancelled\` | \`rejected\`), evidence (jsonb), requested_at, waiting_until, notified_at[], approved_by, second_approver, cancelled_by_owner_at, resolved_at.

Both tables get RLS. \`recovery_requests\` is additionally readable by the admin role, and every read is audit-logged (PHASE-08).`,
                  rules: [
                    '**The waiting period cannot be shortened by anyone, for any reason.** If it can be waived, it provides no protection.',
                    'Every step notifies every known contact method for the account.',
                    'The owner can cancel at any point during the waiting period, and cancellation is immediate and final for that request.',
                    'Using a recovery code forces enrolment of a new factor before normal access resumes.',
                    'Regenerating codes invalidates the entire previous batch.',
                  ],
                  edge: [
                    'A legitimate user who lost their phone *and* their codes *and* their email — this is precisely what manual escalation exists for; the policy must describe it without promising a guaranteed outcome.',
                    'A deceased user\'s family attempting recovery — **this is not recovery, it is legacy transfer**, and it must be routed to that process (R3, blocked on legal counsel) rather than handled here. The flow must detect and redirect this case, because handling it as recovery would be both wrong and legally exposed.',
                    'An attacker initiating recovery to harass — rate-limit and make the notification copy calm rather than alarming, while still being clear.',
                    'The owner cancelling, then genuinely needing recovery later — a new request must be possible without prejudice.',
                    'Recovery codes screenshotted into an unencrypted photo album, then that account compromised — worth a line of guidance in the UI about where to keep them.',
                    'A recovery request outstanding when the account is deleted — the request must terminate.',
                  ],
                  err: ['Any failure in the flow must leave the account in its prior state. A partially completed recovery must never grant partial access.'],
                  sec: [
                    'Codes hashed with a slow KDF, not a bare SHA-256, because they are long-lived bearer secrets.',
                    'Every transition audit-logged with the acting identity.',
                    'Second approver required for manual approval; a single admin cannot restore an account alone.',
                    'The notification content must not itself leak information to whoever initiated the request.',
                  ],
                  tests: {
                    unit: [
                      'Ten codes generated, shown once, stored hashed.',
                      'A consumed code cannot be reused.',
                      'Regeneration invalidates the previous batch.',
                      'Waiting period cannot be set below the policy minimum, even by an admin path.',
                      'Owner cancellation terminates the request immediately.',
                      'A deceased-user request is detected and routed away from recovery.',
                    ],
                    integration: ['Full manual escalation: request → notify → wait → second approval → restore, with an audit entry at every step.'],
                    security: ['A single admin cannot approve alone.', 'Recovery attempts are rate-limited per account.'],
                  },
                  ac: [
                    '`docs/ACCOUNT_RECOVERY.md` written, reviewed, and committed **before** the code.',
                    'Recovery codes generated, displayed once, hashed at rest.',
                    'Code plus phone OTP restores access and forces new-factor enrolment.',
                    'Manual escalation implemented with an unshortenable waiting period.',
                    'Owner cancellation immediate.',
                    'Deceased-user case detected and redirected, not handled as recovery.',
                    'Two approvers required; single-admin approval impossible, proven by test.',
                    'Every transition audit-logged.',
                  ],
                  notes: [
                    'Write the policy document first and get it reviewed by someone who is not the implementer. The code is the easy half.',
                    'The shape of this flow is deliberately the same as the legacy-vault unlock protocol in §29.25. Reuse the pattern there rather than inventing a second one.',
                  ],
                },
              ],
            },
          ],
        },
      ],
    },

    {
      id: 'MOD-02-02', name: 'Authorization Chokepoint & Vault Ownership',
      purpose: 'Build `lib/authz` and the vault ownership root before any content exists.',
      priority: 'critical',
      objective: 'Guarantee that every read and write in the system resolves through one tested authorization function, with RLS as an independent second layer.',
      business: [
        'A cross-tenant leak on this product means one family\'s private photographs shown to another. It is the failure the company would not survive.',
        'Demonstrable access control is also a selling point: blueprint §11.5 turns it into a user-visible feature.',
      ],
      functional: [
        'Each user gets a personal vault at signup.',
        'Membership grants a role; roles map to capabilities per blueprint §11.2.',
        'Every query is scoped by a vault resolved from the session, never from client input.',
        'The permission matrix is executable and tested cell by cell.',
      ],
      backend: [
        '`lib/authz` exposing a single `authorize()` entry point plus typed capability checks.',
        'Route guards and middleware for the `(app)` and `admin` groups.',
        'Step-up re-authentication enforcement for sensitive capabilities.',
      ],
      db: ['`vaults`, `vault_members` with RLS', 'RLS policies mirroring the authz rules on every user-data table'],
      security: [
        'Deny by default.',
        'Client ids are filters, never authorization.',
        'RLS as defence in depth so an application bug alone cannot leak data.',
        'One test per permission-matrix cell; a failing cell fails CI.',
      ],
      testing: ['Matrix cell tests', 'RLS tests', 'Negative-path cross-tenant tests', 'Guard tests on protected routes'],
      ac: [
        'No data-access path exists that bypasses `lib/authz`.',
        'Every §11.2 matrix cell has a passing test.',
        'Cross-tenant read fails at both layers independently.',
      ],
      trace: ['§11.1', '§11.2', '§20.2', 'ADR-009'],
      sprints: [
        {
          id: 'SPR-02-02-01', name: 'Vault Model & Authorization Chokepoint',
          objective: 'The security foundation of the entire product.',
          priority: 'critical', deps: ['SPR-02-01-01'], duration: '~4 days',
          goal: 'Every read and write goes through `lib/authz`; the permission matrix is executable; RLS independently blocks cross-tenant access.',
          inScope: ['Vault and membership schema', 'Vault auto-creation', '`lib/authz` module', 'Permission matrix as code plus per-cell tests', 'RLS policies', 'Route guards', 'Step-up enforcement'],
          outScope: ['Share links and capsule recipients as grant sources (PHASE-05 extends authz)', 'Admin realm (PHASE-08)'],
          approach: [
            'Write the matrix as data, derive both the runtime check and the test suite from it, so they cannot disagree.',
            'Design `authorize()` to accept a subject, an action, and a resource, and to return a reason on denial — the reason is needed for audit logging and for honest UI copy.',
            'Add the two grant sources that do not exist yet (share link, delivered capsule recipient) as explicit, currently-empty branches, so PHASE-05 extends rather than redesigns.',
          ],
          archChanges: ['Introduces the single most security-critical module in the codebase'],
          deliverables: ['Vault schema and migration', '`lib/authz`', 'Matrix tests', 'RLS policies', 'Route guards'],
          testing: ['Per-cell matrix tests', 'RLS negative tests', 'Guard tests'],
          ac: ['Matrix fully covered', 'RLS blocks independently', 'Guards protect every app route'],
          dod: ['A deliberately inverted matrix cell fails CI — demonstrated and reverted'],
          trace: ['§11.1', '§11.2', '§20.2'],
          epics: [
            {
              id: 'EPIC-02-02-01-01', name: 'Vault Ownership Model',
              objective: 'Create the vault and membership tables and give every new user a personal vault.',
              value: 'Vault membership is the resolution target for every authorization decision in the product. Without it, `authz` has nothing to resolve against.',
              stories: [['new user', 'my own private space created automatically', 'I never have to think about where my memories live']],
              functional: ['Personal vault created in the same transaction as the user', 'Owner membership recorded', 'Vault type distinguishes personal from shared and legacy'],
              technical: ['Creation is transactional with user creation — a user without a vault is an invalid state', 'Roles from the `@mm/shared` enum'],
              db: ['`vaults`, `vault_members` with RLS', 'Unique constraint preventing duplicate membership rows'],
              security: ['RLS on both tables', 'Owner role cannot be removed from a personal vault'],
              testing: ['Transactional creation', 'RLS scoping', 'Duplicate membership rejected'],
              ac: ['Every user has exactly one personal vault', 'RLS enabled and tested'],
              trace: ['§10 Vault', '§10 VaultMember'],
              tasks: [
                {
                  name: 'Create Vault and Membership Schema with Transactional Provisioning', type: 'database', priority: 'critical',
                  deps: ['TASK-017'], trace: ['§10 Vault', '§10 VaultMember', 'ADR-009'],
                  obj: 'Create `vaults` and `vault_members` with RLS, and provision a personal vault inside the same transaction that creates a user.',
                  ctx: 'Blueprint §10 makes `Vault` the ownership root: "every authorisation check in the system resolves to vault membership". `VaultMember` carries the role.',
                  why: 'A user without a vault is a broken state that every downstream query must defend against. Creating both in one transaction removes an entire category of null-handling from the rest of the codebase. Doing it after the fact — a nightly job, or lazily on first use — guarantees that some code path eventually encounters a user with no vault.',
                  out: 'Two tables with RLS and policies, plus a `createUserWithVault` function that is atomic: either both rows exist or neither does.',
                  fr: [
                    '`vaults`: id, owner_id, name, type (personal | shared | legacy), cover_media_id (nullable), default_visibility, created_at, archived_at.',
                    '`vault_members`: id, vault_id, user_id, role, invited_by, joined_at, revoked_at — unique on (vault_id, user_id) where not revoked.',
                    'Personal vault created with the user, named from their display name, with an owner membership row.',
                    'A personal vault cannot lose its owner membership.',
                  ],
                  tr: [
                    'Single transaction for user, vault, and membership.',
                    'RLS on both tables: a vault row is visible to a session with a non-revoked membership; a membership row is visible to members of the same vault.',
                    'Partial unique index so a revoked membership does not block re-invitation later.',
                    'Role values from the `@mm/shared` enum.',
                  ],
                  impl: [
                    'Write the Drizzle schema in `packages/db/src/schema/vault.ts` and generate the migration; read the SQL.',
                    'Write RLS policies mirroring the intended authz rules, and add a comment on each policy naming the `lib/authz` rule it duplicates. The duplication is deliberate — two independent layers — and the comment prevents a future contributor from "removing the redundancy".',
                    'Add the partial unique index on (vault_id, user_id) where `revoked_at IS NULL`, so a member can be removed and later re-added.',
                    'Implement `createUserWithVault` in `packages/db` or in the auth feature, wrapping all three inserts in one transaction. Name the vault from the user\'s display name with a sensible fallback.',
                    'Add a database-level guard, or a documented invariant plus test, that a personal vault always retains an owner membership.',
                    'Extend the seed fixtures so every seeded user has a vault.',
                    'Write the atomicity test by injecting a failure after the vault insert and asserting no user row remains.',
                  ],
                  files: [
                    'packages/db/src/schema/vault.ts',
                    'packages/db/migrations/0004_vault.sql',
                    'apps/web/src/features/auth/create-user.ts',
                    'packages/db/src/seed/fixtures.ts  (extend)',
                    'packages/db/src/__tests__/vault-rls.test.ts',
                  ],
                  data: `Two tables. \`vaults.type\` distinguishes \`personal\` (one per user, created at signup), \`shared\` (Release 2), and \`legacy\` (Release 3) — the values exist now so later releases do not need a migration to add them.

**RLS policies mirror the \`lib/authz\` rules deliberately.** Each policy carries a comment naming its authz counterpart. Two independent layers is the design (ADR-009); a future contributor who "removes the duplication" removes the defence.

The partial unique index matters: \`UNIQUE (vault_id, user_id) WHERE revoked_at IS NULL\` allows a member to be removed and re-invited, which a plain unique constraint would block forever.`,
                  rules: [
                    'A user always has exactly one personal vault, created atomically with the user.',
                    'A personal vault always has an owner membership.',
                    'Every authorization decision resolves through vault membership (ADR-009).',
                  ],
                  edge: [
                    'A failure between the user insert and the vault insert — the transaction must roll back both; test this explicitly with an injected failure.',
                    'A user whose display name is empty or non-Latin — vault naming must have a sensible fallback and must not produce an empty string.',
                    'Re-inviting a previously revoked member — the partial index must permit it.',
                    'An attempt to revoke the owner\'s membership on a personal vault — must be refused.',
                    'A soft-deleted user\'s vault — must remain invisible to everyone while the account is in its grace period, and must be purged with it in PHASE-08.',
                  ],
                  err: ['Provisioning failure surfaces as a signup failure with no partial state; the user retries and gets a clean account.'],
                  sec: [
                    'RLS on both tables from this migration.',
                    'The membership table is the target of every authz resolution; an incorrect policy here has the widest possible blast radius. It warrants the most careful review in the phase.',
                  ],
                  tests: {
                    db: [
                      'RLS: user B cannot select user A\'s vault or membership rows.',
                      'Partial unique index permits re-invitation after revocation.',
                      'Duplicate active membership rejected.',
                    ],
                    integration: [
                      '**Injected failure after the vault insert leaves no user row** — the atomicity test.',
                      'Every seeded user has exactly one personal vault.',
                      'Revoking the owner of a personal vault is refused.',
                    ],
                  },
                  ac: [
                    'Migration applies with RLS enabled and policies present on both tables.',
                    'Atomic provisioning proven by an injected-failure test.',
                    'RLS blocks cross-user reads, proven by test.',
                    'Partial unique index permits re-invitation.',
                    'Owner membership on a personal vault cannot be revoked.',
                    'Policy comments name their authz counterparts.',
                  ],
                  notes: ['This is the ownership root. Every query in every later phase is scoped by it, so the RLS policies here deserve a second reviewer.'],
                },
              ],
            },
            {
              id: 'EPIC-02-02-01-02', name: 'lib/authz — The Authorization Chokepoint',
              objective: 'Build the single authorization module, encode the blueprint §11.2 permission matrix as executable data, and generate a test per cell.',
              value: 'This is the module that prevents the product-ending failure. Its value is measured in the incident that never happens.',
              stories: [['user', 'certainty that no other user can reach my vault', 'I can put my family\'s history here without reservation']],
              functional: [
                'One `authorize({ subject, action, resource })` entry point returning allow or deny with a reason.',
                'Grant sources: vault membership now; share link and delivered capsule recipient as declared-but-empty branches for PHASE-05.',
                'Route guards for the authenticated group.',
                'Step-up re-authentication required for the capabilities blueprint §20.1 lists.',
              ],
              technical: [
                'The matrix lives as data; the runtime check and the test suite are both derived from it, so they cannot diverge.',
                'Deny by default: an unknown action or resource type denies.',
                'Denial reasons are structured for audit logging.',
              ],
              security: ['Client-supplied ids are filters, never authorization', 'Every query scoped by a session-derived vault id', 'A failing matrix cell fails CI'],
              testing: ['One test per matrix cell', 'Unknown-action denial', 'Cross-tenant negative paths', 'Guard coverage on every protected route'],
              ac: ['Matrix fully covered by tests', 'Inverting a cell fails CI', 'No data-access path bypasses the module'],
              trace: ['§11.1', '§11.2', '§20.2', 'ADR-009'],
              tasks: [
                {
                  name: 'Implement lib/authz with Executable Permission Matrix', type: 'backend', priority: 'critical',
                  deps: ['TASK-026', 'TASK-018'], trace: ['§11.1', '§11.2', '§20.2', 'ADR-009'],
                  obj: 'Build `lib/authz` as the single authorization entry point, with the blueprint §11.2 permission matrix encoded as data and a generated test per cell.',
                  ctx: 'Blueprint §11.1 states the rule exactly: every read is authorised by resolving the requester to a vault role, an active share, or a delivered capsule recipient — "there is no fourth path". Section §20.2 adds deny-by-default, session-derived scoping, and one test per matrix cell.',
                  why: 'Gap analysis R-2 ranks cross-tenant leakage as critical. Scattered authorization checks fail in a predictable way: one query written in a hurry omits the vault scope, and there is no single place a reviewer can look to catch it. A chokepoint plus a generated test suite converts a judgement call into a mechanical property.',
                  out: 'A module exposing `authorize()` and typed capability helpers, backed by a matrix in data form, with a test suite generated from that matrix so every cell is covered and drift is impossible.',
                  fr: [
                    '`authorize({ subject, action, resource })` returning `{ allowed, role?, reason? }`.',
                    'Actions covering the §11.2 rows: view, download original, create, edit, delete, comment, create share, revoke share, seal capsule, cancel capsule, invite members, delete vault, transfer to heir.',
                    'Subjects covering the §11.2 columns: owner, vault admin, contributor, viewer, share-link holder, capsule recipient.',
                    'Grant resolution order: vault membership → active share → delivered capsule recipient.',
                    'Unknown action or resource type denies with a reason.',
                    'Helpers such as `requireVaultAccess()` for use in queries, so the common case is terse.',
                  ],
                  tr: [
                    'The matrix is a frozen data structure. The runtime check reads it; the test suite iterates it. **Neither hard-codes expectations separately.**',
                    'Deny by default at every branch, including the fall-through.',
                    'Denial reasons are enum values, not strings, so they can be audit-logged and asserted on.',
                    'The share and capsule-recipient branches exist now, return deny, and carry a comment naming the PHASE-05 task that implements them.',
                    'The module performs its own data access for grant resolution and must be efficient enough to sit on every request — a single query for membership resolution, cached per request.',
                  ],
                  impl: [
                    'Read blueprint §11.2 and transcribe the matrix into `apps/web/src/lib/authz/matrix.ts` exactly. **Do not paraphrase or simplify it.** Where a cell reads "own only", encode that as a distinct value rather than collapsing it to allow.',
                    'Implement `authorize()` in `apps/web/src/lib/authz/index.ts`. Resolve the subject\'s relationship to the resource\'s vault first, then look up the matrix cell, then apply any per-cell qualifier such as "own only".',
                    'Implement per-request memoisation of membership resolution so a page performing twenty checks issues one query.',
                    'Add `requireVaultAccess(vaultId)` and `assertCan(action, resource)` helpers that throw or return the result union, so feature code has an ergonomic path and is not tempted to query directly.',
                    'Add the share and delivered-recipient branches as explicit deny-returning stubs with a TODO naming the PHASE-05 tasks. **Do not omit them** — an absent branch is a redesign later; a stub branch is an edit.',
                    'Write the test generator: iterate every (subject, action) pair in the matrix and assert the runtime result matches the declared cell, including qualifiers. A pair with no declared cell must fail the test rather than defaulting.',
                    'Write the drift test: assert the matrix covers every action in the action enum and every subject in the subject enum, so adding an action without a matrix row fails CI.',
                    'Demonstrate the guard: invert one cell, watch CI fail, revert. Record the demonstration in §20.',
                  ],
                  archDiagram: `every read / write in the product
        │
        ▼
lib/authz.authorize({ subject, action, resource })
        │
        ├─ resolve grant  (memoised per request)
        │     1. vault_members  →  role
        │     2. active share            [stub → PHASE-05]
        │     3. delivered capsule recip [stub → PHASE-05]
        │     └─ none → DENY (reason: NO_GRANT)
        │
        ├─ look up matrix[subject][action]
        │     allow | deny | own_only
        │
        └─▶ { allowed, role, reason }
                │
                ▼
        Postgres RLS  ← independent second layer, mirrors these rules`,
                  files: [
                    'apps/web/src/lib/authz/index.ts',
                    'apps/web/src/lib/authz/matrix.ts',
                    'apps/web/src/lib/authz/resolve-grant.ts',
                    'apps/web/src/lib/authz/reasons.ts',
                    'apps/web/src/lib/authz/__tests__/matrix.generated.test.ts',
                    'apps/web/src/lib/authz/__tests__/drift.test.ts',
                    'apps/web/src/lib/authz/__tests__/cross-tenant.test.ts',
                  ],
                  api: {
                    method: 'internal', path: 'lib/authz/authorize()',
                    req: '{\n  "subject": { "userId": "uuid", "sessionId": "uuid" },\n  "action": "memory.edit",\n  "resource": { "type": "memory", "id": "uuid", "vaultId": "uuid", "authorId": "uuid" }\n}',
                    res: '{ "allowed": true, "role": "contributor" }\n// or\n{ "allowed": false, "reason": "NOT_OWN_RESOURCE" }',
                    validation: ['Action must exist in the action enum', 'Resource must declare a vault id', 'Subject must carry a validated session'],
                    errors: [
                      ['403', 'AUTHZ_DENIED', 'No grant, or the matrix cell denies'],
                      ['403', 'AUTHZ_NOT_OWN_RESOURCE', 'Cell is own-only and the subject is not the author'],
                      ['500', 'AUTHZ_UNKNOWN_ACTION', 'Action absent from the matrix — a programming error, denied and alerted'],
                    ],
                  },
                  rules: [
                    '**There is no fourth grant path** (§11.1). If a feature seems to need one, that is a design conversation, not a code change.',
                    'Deny by default at every branch including the fall-through.',
                    'Client-supplied ids are filters. The vault id used for scoping is always derived from the session-resolved grant, never taken from the request.',
                    'An unknown action denies and raises an alert — it means code and matrix have diverged.',
                    'RLS policies mirror this matrix. Changing one without the other is a defect.',
                  ],
                  edge: [
                    '"Own only" cells — a contributor editing another contributor\'s memory must be denied; this is the cell most likely to be implemented as a plain allow.',
                    'A resource whose vault has been archived — decide and encode whether archived vaults are read-only; record the decision.',
                    'A member whose membership was revoked mid-session — resolution must consult the current row, not a cached session claim. Per-request memoisation is fine; cross-request caching is not.',
                    'A soft-deleted user with a live session — must deny.',
                    'An owner acting on their own resource where the cell says "own only" — must allow.',
                    'A resource with a null vault id — must deny with a distinct reason, not throw.',
                    'Nested resources such as a media asset whose vault is reached via its memory — the resolution must not silently trust a vault id passed alongside; verify it against the parent.',
                  ],
                  err: ['A resolution query failure must deny, never allow. Fail closed — a database hiccup must not become an authorization bypass.'],
                  sec: [
                    'This module is the highest-value target in the codebase. Every change to it warrants a second reviewer.',
                    'Denial reasons are logged for audit but never returned verbatim to an unauthenticated caller.',
                    'Memoisation is per request only. A cross-request cache would let a revoked membership keep working, defeating the instant-revocation property built in TASK-018.',
                  ],
                  tests: {
                    unit: [
                      '**Generated: one test per (subject, action) cell of the §11.2 matrix, asserting the runtime result matches the declared value including own-only qualifiers.**',
                      'Drift test: every action in the enum has a matrix row; every subject has a column.',
                      'Unknown action denies with the unknown-action reason.',
                      'Null vault id denies with a distinct reason.',
                      'Resolution query failure denies (fail closed).',
                      'Revoked membership denies even within the same session.',
                      'Membership resolution is memoised: twenty checks issue one query.',
                    ],
                    integration: [
                      'Cross-tenant suite: user A attempts every action on every resource type belonging to user B, and every attempt is denied.',
                      'The same attempts are independently blocked by RLS with the authz layer bypassed.',
                    ],
                  },
                  ac: [
                    'Matrix transcribed from §11.2 exactly, including own-only qualifiers.',
                    'Generated test covers every cell; total count matches the matrix dimensions.',
                    '**Inverting one cell fails CI — demonstrated and recorded in §20.**',
                    'Drift test fails when an action is added without a matrix row.',
                    'Cross-tenant suite passes with all attempts denied.',
                    'RLS independently blocks the same attempts with authz bypassed.',
                    'Fail-closed behaviour on resolution error, proven by test.',
                    'Memoisation is per request only.',
                    'Share and capsule-recipient branches present as documented stubs referencing PHASE-05.',
                  ],
                  notes: [
                    'Transcribe the matrix, do not interpret it. If a cell in §11.2 looks wrong, raise it as a question rather than encoding a different answer.',
                    'The inverted-cell demonstration is the proof that this whole apparatus works. Do it, record it, revert it.',
                    'PHASE-05 will fill the two stub branches. Leaving them present with named TODOs is what makes that an edit rather than a redesign.',
                  ],
                },
                {
                  name: 'Add Route Guards, Middleware, and Step-Up Re-Authentication', type: 'backend', priority: 'critical',
                  deps: ['TASK-027'], trace: ['§20.1', '§20.2', '§28.5'],
                  obj: 'Protect the `(app)` and `admin` route groups, redirect unauthenticated users with a preserved destination, and enforce step-up re-authentication for sensitive capabilities.',
                  ctx: 'Blueprint §28.5 requires that an unauthenticated hit on an app route redirects to login with a `next` parameter and lands exactly where intended. Section §20.1 lists the capabilities requiring step-up re-authentication: changing email, adding a passkey, deleting the account, exporting all data, and later sealing a posthumous capsule or assigning an heir.',
                  why: 'Two failure modes are being prevented. The first is a protected page rendering briefly before a client-side redirect, which leaks content. The second is a long-lived session being sufficient to delete an account — a stolen unlocked phone should not be able to destroy someone\'s archive without re-proving identity.',
                  out: 'Server-side guards on every authenticated route, a login redirect that preserves the destination, and a step-up mechanism that requires a fresh factor within a bounded window for listed capabilities.',
                  fr: [
                    'Unauthenticated access to `(app)` or `admin` redirects to login with `next` preserved and honoured after sign-in.',
                    'Verified-email gating on scheduling, per the §29.4 grace state.',
                    'Step-up required for: change email, add or remove a passkey, export all data, delete account.',
                    'Step-up satisfied by a fresh passkey assertion or a fresh OTP, valid for a bounded window.',
                    'The `admin` group requires an admin session, not merely any session.',
                  ],
                  tr: [
                    'Guards run **server-side** before render. No protected content may be sent to the client and then hidden.',
                    '`next` is validated as a relative path on the same origin — an open redirect here is a phishing primitive.',
                    'Step-up freshness recorded on the session with a timestamp and the factor used; the window is short (recommend 10 minutes).',
                    'Guard failures return the ADR-023 result shape for actions, and a redirect for page requests.',
                  ],
                  impl: [
                    'Implement the guard in the `(app)` layout as a server-side session check, and add a middleware layer for early redirects where it is cheaper.',
                    'Validate `next` strictly: relative path, same origin, no protocol, no `//` prefix. **Reject anything else and fall back to `/app`.** An unvalidated `next` is an open redirect.',
                    'Implement `requireStepUp(capability)` checking the session\'s recorded step-up timestamp and factor, and initiating a step-up challenge when stale.',
                    'Build the step-up challenge UI as a sheet reusing the passkey and OTP components, so it can appear over any screen without losing context.',
                    'Add the verified-email gate as a reusable check, and reference it from the PHASE-05 seal action so the §29.4 promise is actually enforced.',
                    'Guard the `admin` group behind an admin-session check that fails closed; the full admin realm arrives in PHASE-08, so this is a placeholder that denies everyone for now — and it must deny, not allow.',
                    'Write a test enumerating every route under `(app)` and asserting each redirects when unauthenticated. Automate the enumeration so a new route added without a guard is caught.',
                  ],
                  files: [
                    'apps/web/src/middleware.ts',
                    'apps/web/src/app/(app)/layout.tsx  (server guard)',
                    'apps/web/src/lib/auth/guards.ts',
                    'apps/web/src/lib/auth/step-up.ts',
                    'apps/web/src/features/auth/components/StepUpSheet.tsx',
                    'apps/web/src/lib/auth/__tests__/guards.test.ts',
                    'apps/web/src/lib/auth/__tests__/next-param.test.ts',
                  ],
                  api: {
                    method: 'internal', path: 'lib/auth/step-up.ts',
                    req: '{ "capability": "account.delete" }',
                    res: '{ "satisfied": false, "challenge": { "methods": ["passkey", "otp"] } }',
                    validation: ['Capability must be in the step-up list', 'Session must be valid'],
                    errors: [['401', 'AUTH_STEP_UP_REQUIRED', 'No fresh factor within the window'], ['403', 'AUTHZ_DENIED', 'Session lacks the underlying capability regardless of freshness']],
                  },
                  rules: [
                    'Protected content is never sent to the client before authorization.',
                    '`next` must be a validated same-origin relative path.',
                    'Step-up is required for every capability in the §20.1 list, and the list lives in one constant so it cannot drift.',
                    'The admin guard fails closed until PHASE-08 implements the realm.',
                  ],
                  edge: [
                    'A `next` value pointing to an external origin, a protocol-relative URL, or an encoded variant — all must be rejected; test each.',
                    'A `next` pointing to a route the user cannot access after signing in — land on `/app` with an explanation rather than a denial loop.',
                    'Step-up satisfied on one device then attempted on another — freshness is per session, so it must not transfer.',
                    'A user with no passkey needing step-up — the OTP path must be available.',
                    'Step-up during an in-progress destructive action — the sheet must preserve the pending action and resume it, or abandon it cleanly; a half-completed deletion is unacceptable.',
                    'A session revoked while a step-up sheet is open — the resumed action must re-check and fail.',
                    'A new route added under `(app)` without a guard — the enumeration test must catch it.',
                  ],
                  err: ['Guard denial on a page request redirects; on a server action it returns the result union so the UI can show an inline message rather than a crash.'],
                  sec: [
                    '**Open redirect prevention is the security-critical part of this task.** Validate `next` strictly and test the bypass attempts.',
                    'Step-up freshness is short and per session.',
                    'Admin guard denies by default.',
                    'Guards run before render, always.',
                  ],
                  tests: {
                    unit: [
                      '`next` validation rejects absolute URLs, protocol-relative URLs, encoded variants, and non-same-origin paths.',
                      'Step-up window expiry requires a fresh factor.',
                      'Step-up freshness does not transfer between sessions.',
                    ],
                    integration: [
                      'Enumerated: every `(app)` route redirects when unauthenticated.',
                      'Admin routes deny for a normal user.',
                      'A destructive action interrupted by step-up resumes correctly, or aborts cleanly.',
                    ],
                    e2e: ['Unauthenticated deep link → login → lands on the originally requested route.'],
                    security: ['Open-redirect attempt suite: every documented bypass form is rejected.'],
                  },
                  ac: [
                    'Every `(app)` route is guarded, verified by an enumeration test that would catch a new unguarded route.',
                    '`next` preserved and honoured; all open-redirect bypass forms rejected.',
                    'Step-up enforced for every capability in the §20.1 list.',
                    'Step-up does not transfer between sessions.',
                    'Admin group denies by default.',
                    'No protected content reaches the client before authorization, verified by inspecting a response body.',
                  ],
                  notes: ['The route-enumeration test is what keeps this correct as thirty more routes are added in later phases. Make it automatic, not a hand-maintained list.'],
                },
              ],
            },
          ],
        },
      ],
    },

    {
      id: 'MOD-02-03', name: 'Onboarding & Personalization',
      purpose: 'Get a new user from verified account to a meaningful first action in under three minutes.',
      priority: 'high',
      objective: 'Learn just enough to make the first memory feel personal, and ensure the quiz answers change real behaviour rather than being decorative.',
      business: [
        'Blueprint §5.1 identifies the critical design finding: the first session must end with something emotionally real. Activation is the single biggest lever on retention.',
        'The quiz answers pre-populate the experience, which reduces the empty-state problem every archive product faces.',
      ],
      functional: [
        'Three skippable steps: purpose, people, first moment.',
        'Purpose answer personalises later prompts.',
        'Reminder-style answer maps to concrete notification defaults.',
        'Abandoned onboarding can be resumed.',
      ],
      ui: [
        'Carousel of three slides then the quiz, per §29.2.',
        'Chip selection, progress dots, persistent skip.',
        'Camera permission explained before the browser prompt is triggered.',
        'Release-1 substitute copy for the gifts slide, since commerce does not exist yet.',
      ],
      backend: ['Persist quiz answers', 'Map reminder style to notification preference defaults', 'Track funnel events'],
      db: ['`user_preferences` or equivalent columns for purpose and reminder style'],
      security: ['Quiz answers are personal data included in export and deletion'],
      testing: ['Skip path', 'Resume path', 'Permission-denied path', 'Mapping assertion'],
      ac: [
        'A new user reaches a first meaningful action in under three minutes.',
        'Quiz answers demonstrably change notification defaults.',
        'Every step is skippable and resumable.',
      ],
      trace: ['§29.2', '§5.1', '§27.3'],
      sprints: [
        {
          id: 'SPR-02-03-01', name: 'Onboarding Flow & Personalization Quiz',
          objective: 'A first session that ends somewhere worth returning to.',
          priority: 'high', deps: ['SPR-02-01-02', 'SPR-02-02-01'], duration: '~3 days',
          goal: 'A verified user completes a three-step onboarding whose answers visibly affect the product.',
          inScope: ['Carousel', 'Three quiz steps', 'Answer persistence', 'Notification default mapping', 'Permission primer', 'Funnel instrumentation'],
          outScope: ['The actual first memory creation (PHASE-03)', 'Member import (PHASE-03)'],
          approach: [
            'Make every step skippable, and make skipping cheap — a forced quiz is worse than no quiz.',
            'Wire the reminder-style answer to real defaults immediately, so the quiz is not theatre (risk noted in the phase risks).',
            'Explain camera permission before triggering it, per §29.2, because a denied permission on first contact is very hard to recover.',
          ],
          archChanges: ['Introduces the preference storage that PHASE-07 notification defaults read from'],
          deliverables: ['Onboarding screens', 'Preference persistence', 'Funnel events'],
          testing: ['Skip and resume', 'Mapping assertion', 'Permission denial recovery', 'axe'],
          ac: ['Flow completes and is resumable', 'Mapping proven by test', 'axe clean'],
          dod: ['Funnel events emit for step viewed, completed, and skipped'],
          trace: ['§29.2'],
          epics: [
            {
              id: 'EPIC-02-03-01-01', name: 'Onboarding Carousel & Personalization Quiz',
              objective: 'Build the three-slide carousel and three-step quiz, with answers that have real consequences.',
              value: 'Blueprint §5.1 calls the first-session outcome the highest-leverage change available. This epic is where that lands.',
              stories: [
                ['new user', 'to understand what this product is for in fifteen seconds', 'I can decide whether to invest my family\'s history in it'],
                ['new user', 'the app to already know who matters to me', 'it feels personal from the first screen instead of empty'],
              ],
              functional: [
                'Three slides with clear value propositions, swipeable, skippable.',
                'Quiz: who matters most, which occasions, reminder style.',
                'Answers persisted and used.',
                'Resume from the last incomplete step.',
              ],
              technical: ['Answers stored server-side, not only in local state', 'Reminder style maps to a documented notification default set', 'Funnel events per step'],
              ui: ['Per §29.2, including the "You can change this anytime" footnote', 'Release-1 substitute for the gifts slide', 'Chip multi-select'],
              security: ['Answers are personal data: included in export, removed on deletion'],
              testing: ['Skip, resume, mapping, funnel emission, axe'],
              ac: ['Flow complete per §29.2', 'Mapping asserted by test', 'Resumable'],
              trace: ['§29.2', '§5.1'],
              tasks: [
                {
                  name: 'Build Onboarding Carousel and Three-Step Personalization Quiz', type: 'frontend', priority: 'high',
                  deps: ['TASK-022', 'TASK-026'], trace: ['§29.2', '§5.1', '§27.3'],
                  obj: 'Build the three-slide onboarding carousel and the three-step quiz, persisting answers and mapping the reminder-style answer to real notification defaults.',
                  ctx: 'Blueprint §29.2 specifies the slides and the three quiz questions, and adds a pointed instruction: the quiz must have real, visible consequences, "or it is theatre". Section §27.3 also notes that the third slide advertises the gift shop, which does not exist until Release 3.',
                  why: 'Two things make this task more than a form. First, the third slide must not promise a shop that is not there — the blueprint provides substitute copy ("Seal them until the day that matters") and §30.1 forbids implying unreleased features. Second, the reminder-style answer must actually configure notification defaults, because a quiz that changes nothing trains users to skip everything the product asks.',
                  out: 'A three-slide carousel and three-step quiz, every step skippable and resumable, with answers persisted and the reminder-style answer demonstrably setting notification defaults.',
                  fr: [
                    'Slides: capture memories · schedule delivery · **"Seal them until the day that matters"** (Release-1 substitute for the gifts slide).',
                    'Skip in the top right; progress dots; swipe and Next.',
                    'Quiz step 1: who matters most — Family, Friends, Partner, Everyone.',
                    'Quiz step 2: which occasions — Birthdays, Anniversaries, Festivals, Just because (multi-select).',
                    'Quiz step 3: reminder style — Gentle, On-point, Minimal.',
                    'Footnote: "You can change this anytime."',
                    'Answers persisted server-side; flow resumable from the last incomplete step.',
                    'Reminder style maps to notification defaults: Gentle = weekly digest plus 3-day reminders; On-point = day-of plus 1-day; Minimal = day-of only.',
                  ],
                  tr: [
                    'Each step commits its answer on advance, so an abandoned flow retains progress.',
                    'The mapping lives in one constant consumed by PHASE-07, and is asserted by test.',
                    'Funnel events for step viewed, step completed, and skipped — with no PII in the payload (ADR-021).',
                    'Carousel respects reduced motion by cross-fading rather than sliding.',
                  ],
                  impl: [
                    'Build the carousel at `/welcome` with the three slides. **Use the Release-1 substitute copy for slide three** and add a comment referencing §27.3, so whoever ships commerce knows to restore the original.',
                    'Build the three quiz steps as separate routes (`/welcome/purpose`, `/welcome/people`, `/welcome/first`) so back and forward behave naturally and the flow is resumable by URL.',
                    'Persist each answer on advance via a server action. Store purpose and reminder style on the user, and occasions as an array.',
                    'Create `packages/shared/src/constants/notification-defaults.ts` holding the reminder-style mapping, and write the assertion test that PHASE-07 will rely on.',
                    'Step 2 collects up to three people. Because member import lands in PHASE-03, keep this to name plus optional birthday, writing rows that PHASE-03 will extend — and check with that phase\'s schema so this does not need a migration later.',
                    'Step 3 offers capture or upload and hands off to PHASE-03\'s create flow. Until that exists, route to the empty Home with the first-memory prompt visible, and note the handoff in §20.',
                    'Explain camera permission **before** triggering the browser prompt, per §29.2. On denial, offer the upload path immediately rather than dead-ending.',
                    'Emit funnel events at each step. These are the activation metrics blueprint §31.11 tracks.',
                    'Handle resume: on entry, redirect to the first incomplete step.',
                  ],
                  files: [
                    'apps/web/src/app/(auth)/welcome/page.tsx',
                    'apps/web/src/app/(auth)/welcome/purpose/page.tsx',
                    'apps/web/src/app/(auth)/welcome/people/page.tsx',
                    'apps/web/src/app/(auth)/welcome/first/page.tsx',
                    'apps/web/src/features/onboarding/components/Carousel.tsx',
                    'apps/web/src/features/onboarding/components/ChipQuestion.tsx',
                    'apps/web/src/features/onboarding/components/PermissionPrimer.tsx',
                    'apps/web/src/features/onboarding/actions.ts',
                    'packages/shared/src/constants/notification-defaults.ts',
                    'packages/db/migrations/0005_user_preferences.sql',
                    'apps/web/src/features/onboarding/__tests__/mapping.test.ts',
                  ],
                  data: `Adds preference columns (or a \`user_preferences\` table) for \`purpose\`, \`occasions\` (text[]), and \`reminder_style\`. RLS scoped by user. Included in the PHASE-08 export and removed on deletion.

**The mapping constant** — the whole point of the quiz:

| Reminder style | Notification defaults |
|---|---|
| Gentle | weekly digest + reminders 3 days before |
| On-point | day-of + 1 day before |
| Minimal | day-of only |

PHASE-07 reads this constant when creating a user's initial notification preferences. The assertion test in this task is what guarantees the two stay connected.`,
                  ui: `Per §29.2. Warm illustrations, one clear value proposition per slide, Skip top-right, progress dots.

Quiz steps use large chips, one question per screen, with the footnote "You can change this anytime." Multi-select on occasions only.

**Permission primer** — a friendly screen before the OS prompt: what is being asked for, why, and a "not now" that does not punish. Blueprint §29.2 requires this ordering, and it matters: a first-contact denial is very hard to recover.

Empty and error states inherited from the PHASE-01 templates.`,
                  rules: [
                    '**Do not advertise the gift shop before it exists** (§27.3, §30.1). Use the substitute copy.',
                    'Every step is skippable. A user who skips everything must still reach a working Home.',
                    'The quiz must change something observable, or it should not be asked (§29.2).',
                    'Camera permission is explained before it is requested.',
                  ],
                  edge: [
                    'A user who skips every step — must land on Home with the generic first-memory prompt and no broken personalisation.',
                    'Abandonment mid-quiz then return days later — resume at the first incomplete step, without repeating answered questions.',
                    'Camera permission denied — offer upload immediately; never a dead end.',
                    'A user adding three people with no contact details — allowed here, but PHASE-03 must show the delivery-blocked warning; do not silently create unusable members.',
                    'Reduced motion — carousel cross-fades.',
                    'Browser back mid-flow — must not lose a committed answer.',
                    'A returning verified user who already completed onboarding hitting `/welcome` — redirect to Home rather than restarting.',
                  ],
                  err: ['A failed answer save must not block advancing; queue it and retry, since losing a quiz answer is less bad than blocking activation. Record this trade-off in §20.'],
                  sec: ['Quiz answers are personal data: included in export, deleted with the account.', 'Funnel events carry no PII (ADR-021).'],
                  tests: {
                    component: [
                      'Carousel advances by swipe and button; skip exits at any point.',
                      'Chip questions support single and multi-select as specified.',
                      'Reduced motion cross-fades.',
                    ],
                    unit: ['**Mapping test: each reminder style produces the documented notification defaults.**'],
                    integration: ['Answers persist and are readable after a session restart.', 'Resume lands on the first incomplete step.'],
                    e2e: [
                      'Full flow from verification to Home.',
                      'Skip-everything path reaches a working Home.',
                      'Camera-denied path offers upload.',
                      'Completed user visiting `/welcome` is redirected.',
                    ],
                    a11y: ['axe on carousel and all three steps; chips are keyboard operable with clear selected state.'],
                  },
                  ac: [
                    'Carousel and three quiz steps implemented per §29.2, with the Release-1 substitute copy on slide three.',
                    'All steps skippable; skip-everything reaches a working Home.',
                    'Answers persisted server-side and resumable.',
                    '**Reminder-style mapping asserted by test** and consumed from a shared constant.',
                    'Permission primer precedes the browser prompt; denial offers upload.',
                    'Funnel events emitted with no PII.',
                    'Completed users redirected away from the flow.',
                    'axe clean on every screen.',
                  ],
                  notes: [
                    'The substitute slide copy must be reverted when commerce ships. Leave the comment that says so.',
                    'The mapping test is small and load-bearing: it is the contract between this phase and PHASE-07.',
                    'Record the answer-save failure trade-off in §20.',
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
