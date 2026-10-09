module.exports = {
  id: 'PHASE-05', name: 'Time Capsules & The Delivery Guarantee', release: 'Release 1',
  objective: 'Build the differentiating feature: seal a memory for a person and a future date, and guarantee it arrives.',
  business: 'Without this phase the product is a worse Google Photos. With it, it is the only place you can hand a moment to someone in the future.',
  technical: 'Capsule model with a transactional seal, a database-owned durable scheduler, a multi-channel delivery ladder with a watchdog, a JavaScript-free recipient unlock page, and revocable share links.',
  priority: 'critical', deps: ['PHASE-04'], effort: '~5 weeks',
  outcome: 'A user seals a memory for a date decades away and can trust it. A recipient opens it on that day, in a browser that may not exist yet, and replies.',
  purpose: `This is the phase the whole product exists for.

Blueprint §23.4 gives the boundary test — "if this were missing, would the core promise be broken?" — and §23.1 answers it for this phase in one line: **"The differentiator. Without it this is a worse Google Photos."**

Four commitments govern every task here, and none of them is negotiable:

**Sealing is transactional.** The capsule state and its scheduled job commit together (§18.4 item 1). There is no instant in which a capsule is sealed but unscheduled.

**The schedule lives in Postgres.** ADR-006 calls this "the most important architectural decision in the system": a job due in 2046 must outlive every vendor in the stack. A queue service may *execute*; it is never the record.

**\`/c/[token]\` works with JavaScript disabled.** Blueprint §29.24 makes this a hard constraint, and the project plan restates it: "a 2046 recipient must not be blocked by a 2026 framework assumption."

**A missed unlock is a Sev-0 incident.** Blueprint §12.6 and §37 put losing a sealed capsule "on the same footing as a data breach, because it is the same failure of the same promise." The watchdog that detects it is built here, and its alert must never be routine.

This phase also finally fills the two authorization branches PHASE-02 deliberately left as stubs: share-link holder and delivered capsule recipient (§11.1).`,
  goals: [
    'A memory can be sealed to named recipients with a date or an age milestone, and the seal is atomic.',
    'A sealed capsule is immutable in content, cancellable by its owner, and invisible to its recipient until delivery.',
    'The scheduler delivers on time, in the recipient\'s local humane window, and retries across days rather than minutes.',
    'A watchdog pages a human if any capsule passes its unlock time without a successful attempt.',
    'The recipient unlock page renders and functions with JavaScript disabled.',
    'A recipient can reply without an account, and the reply reaches the sender\'s vault.',
    'Share links are revocable, with residual exposure bounded by the five-minute signed-URL TTL.',
  ],
  features: [
    'Capsule sealing with date and age-milestone unlock conditions.',
    'Free-tier gates: three pending capsules, twelve-month horizon.',
    'Transactional seal with content immutability.',
    'Durable Postgres-owned scheduler with claim-and-lock.',
    'Channel ladder (push then email) with day-scale backoff and full attempt logging.',
    'Delivery watchdog and monthly integrity sweep.',
    'Decade-durable delivery email.',
    'Server-rendered recipient unlock with ceremonial reveal and reply.',
    'Revocable share links and the "who can see this" panel.',
  ],
  arch: [
    'Introduces the delivery engine — the process that must still work in ten years.',
    'Extends `lib/authz` with its two remaining grant sources (§11.1).',
    'Populates the future-band source interface built in PHASE-03.',
    'Introduces the bespoke delivery-SLA monitor that ADR-020 calls "the most important alert page in the company".',
  ],
  depDetail: [
    '**PHASE-04** must be complete: sealing a promise over media that might not have uploaded is not a promise.',
    '**PHASE-02** verified-email gate is enforced here at the seal action, honouring the §29.4 grace state.',
    '**External:** Resend with a verified domain plus AWS SES configured as a standing fallback (ADR-016).',
  ],
  deliverables: [
    'Capsule, recipient, attempt, and reply schema with RLS.',
    'Seal flow and capsule detail screens.',
    'Delivery worker, channel ladder, watchdog, integrity sweep.',
    'Decade-durable email template.',
    '`/c/[token]` and `/s/[token]` public pages.',
    '`docs/DELIVERY-GUARANTEE.md`.',
  ],
  ac: [
    'Seal a capsule for sixty seconds from now; it arrives, opens, and the reply reaches the sender.',
    'Seal one for twenty years; the job row exists, the integrity sweep verifies it, and the watchdog would fire if it were missed.',
    'A failure injected between the capsule update and the job insert rolls back both — no sealed-but-unscheduled capsule can exist.',
    'A recipient with JavaScript disabled can open a delivered capsule and read the note.',
    'Pre-delivery, the recipient token cannot reach the media through any endpoint.',
    'Revoking a share link makes the next request fail, with media exposure bounded to the signed-URL TTL.',
  ],
  risks: [
    ['A sealed capsule silently never delivering', 'critical', 'Transactional seal, DB-owned schedule, claim-and-lock with expiry, full attempt log, hourly watchdog paging a human, monthly integrity sweep. Failure injection tested in PHASE-09.'],
    ['Recipient cannot open the capsule in a future browser', 'high', '`/c/[token]` server-rendered with no client components; email is table-based with inline CSS and a plain-text alternative; a test asserts the page works with JavaScript disabled.'],
    ['Pre-delivery content leaking to the recipient', 'high', 'Enforced in `lib/authz` and at the signed-URL endpoint, not only in the UI; a security test asserts unreachability.'],
    ['Delivery at 3am local time', 'medium', 'Humane window resolved at fire time, not seal time (gap G-3), because a recipient may move timezone over twenty years.'],
    ['Capsule addressed to someone who has died', 'medium', 'Gap G-4: `Member.deceased_at` gates delivery and notifies the owner instead. Copy requires review before shipping.'],
    ['Entitlement changes invalidating an existing promise', 'high', 'Entitlements evaluated at seal time only; §17.2 item 4 makes never cancelling for non-payment a written policy.'],
  ],
  gate: 'A stakeholder seals a capsule to their own phone number for two minutes ahead, receives it, opens it, and replies',
  trace: ['§7.1 M8-M11', '§10 Capsule', '§11.4', '§18.4', '§29.15', '§29.16', '§29.24', '§34.6', 'ADR-006', 'ADR-016'],

  modules: [
    {
      id: 'MOD-05-01', name: 'Capsule Creation & Sealing',
      purpose: 'Turn a memory into a promise, atomically and immutably.',
      priority: 'critical',
      objective: 'Let an owner address a memory to people and a moment, and make that commitment structurally trustworthy.',
      business: [
        'Blueprint §7.1 M8: "the differentiator. Without it there is no product."',
        'The seal screen is where the product asks for the most trust and must therefore be the most legible.',
      ],
      functional: [
        'Seal with recipients, an unlock condition, and a channel plan.',
        'Date or age-milestone unlock.',
        'Free-tier gates: three pending, twelve-month horizon.',
        'Content immutable once sealed; cancellable until delivery.',
        'Recipient contact details updatable; recipient identity not swappable.',
      ],
      ui: ['Seal flow per §29.15 including the plain-language summary block', 'Capsule detail per §29.16 with live countdown and status history'],
      backend: ['Transactional seal', 'Entitlement evaluation at seal time', 'Authz extension for recipients'],
      db: ['`capsules`, `capsule_recipients`, `capsule_replies` with RLS; `(state, unlock_at)` index'],
      security: [
        'Pre-delivery content invisible to recipients, enforced server-side (§11.4).',
        'Verified email required to seal (§29.4 grace state).',
        'Tokens hashed and versioned.',
      ],
      testing: ['Seal atomicity under injected failure', 'Immutability enforcement', 'Entitlement gates', 'Pre-delivery invisibility'],
      ac: ['No sealed-but-unscheduled state is reachable', 'Sealed content cannot be modified', 'Pre-delivery media unreachable'],
      trace: ['§10 Capsule', '§11.4', '§29.15', '§29.16'],
      sprints: [
        {
          id: 'SPR-05-01-01', name: 'Capsule Model, Seal Transaction & Authorization',
          objective: 'The promise, made structurally sound.',
          priority: 'critical', deps: [], duration: '~5 days',
          goal: 'Sealing a capsule writes state and schedule in one commit, freezes content, evaluates entitlements once, and extends authz with the recipient grant.',
          inScope: ['Capsule schema', 'Seal transaction', 'Immutability enforcement', 'Entitlement evaluation', 'Authz recipient and share branches'],
          outScope: ['Seal UI (next sprint)', 'Delivery worker (MOD-05-02)', 'Unlock page (MOD-05-03)'],
          approach: [
            'Write the atomicity test before the seal function, because it is the property everything else depends on.',
            'Fill the two authz stub branches PHASE-02 left, rather than adding a parallel check.',
          ],
          archChanges: ['Completes `lib/authz` to its final Release-1 shape', 'Adds the `capsule_delivery` job kind'],
          deliverables: ['Schema', 'Seal function', 'Authz extension'],
          testing: ['Atomicity, immutability, entitlements, invisibility'],
          ac: ['Atomicity proven by injected failure', 'Authz branches implemented and tested'],
          dod: ['The PHASE-02 authz matrix tests still pass with the new grant sources'],
          trace: ['§10 Capsule', '§11.1', '§18.4'],
          epics: [
            {
              id: 'EPIC-05-01-01-01', name: 'Capsule Model & Transactional Seal',
              objective: 'Create the capsule entities and a seal operation that cannot leave an inconsistent state.',
              value: 'A capsule that is sealed but not scheduled is a broken promise that nobody discovers until the date passes. Atomicity is what makes the guarantee real rather than aspirational.',
              stories: [['parent', 'to address a video to my daughter for her eighteenth birthday', 'I can speak to her in 2044']],
              functional: ['Capsule CRUD with state machine', 'Recipients with contact snapshots', 'Seal transaction', 'Immutability', 'Cancellation', 'Entitlement gates'],
              technical: ['`(state, unlock_at)` index as the scheduler hot path', 'Tokens hashed and versioned', 'Entitlements snapshotted at seal'],
              db: ['`capsules`, `capsule_recipients`, `delivery_attempts`, `capsule_replies` with RLS'],
              security: ['Owner-only mutation', 'Pre-delivery invisibility server-enforced', 'Verified email required'],
              testing: ['Atomicity, immutability, gates, invisibility, state machine'],
              ac: ['Atomic seal', 'Immutable content', 'Gates enforced at seal time only'],
              trace: ['§10 Capsule', '§17.2', '§18.4'],
              tasks: [
                {
                  name: 'Create Capsule Schema with Recipients, Attempts and Replies', type: 'database', priority: 'critical',
                  deps: ['TASK-048', 'TASK-030'], trace: ['§10 Capsule', '§34.6', '§11.4'],
                  obj: 'Create `capsules`, `capsule_recipients`, `delivery_attempts`, and `capsule_replies` per blueprint §10 and §34.6, with RLS and the scheduler index.',
                  ctx: 'Blueprint §10 defines all four entities and flags one index as critical: "`(state, unlock_at)` is the hot path for the scheduler and must stay tight." Section §34.6 extends replies into the richer reaction model.',
                  why: '`delivery_attempts` is the table that makes the delivery guarantee an operational fact rather than a marketing claim — blueprint §10 says exactly that: "without this table the delivery guarantee is a marketing claim rather than an operational fact." And the recipient contact fields are a *snapshot*, not a join to the member record, because a capsule sealed in 2026 must still know where it was addressed even if the member row is later edited or merged.',
                  out: 'Four tables with RLS, the scheduler index, hashed versioned recipient tokens, and contact snapshots that survive later member edits.',
                  fr: [
                    '`capsules`: id, owner_id, memory_id, title, sender_note, state, unlock_kind, unlock_at, unlock_timezone, milestone_member_id, milestone_spec, sealed_at, editable_until, delivered_at, first_opened_at, cancelled_at, created_at.',
                    '`capsule_recipients`: id, capsule_id, member_id (nullable), name, email, phone, preferred_channel, access_token_hash, token_version, delivered_at, opened_at, last_verified_at.',
                    '`delivery_attempts`: id, capsule_id, recipient_id, channel, attempt_no, provider, provider_message_id, status, error_code, attempted_at, next_retry_at.',
                    '`capsule_replies`: id, capsule_id, recipient_id, kind, emoji, body, media_asset_id, created_at.',
                    'Entitlement snapshot fields recording the horizon and pending allowance evaluated at seal time.',
                  ],
                  tr: [
                    'Index on `(state, unlock_at)` — the scheduler claim query must use it; assert via query plan.',
                    'Unique index on `(capsule_id, recipient_id, channel, attempt_no)` so a retry cannot double-log.',
                    'Recipient contact stored as a **snapshot** alongside the nullable `member_id`.',
                    '`access_token_hash` with `token_version` so a leaked link can be rotated without destroying the capsule.',
                    'RLS: capsules and recipients readable by the owner; replies readable by the owner; `delivery_attempts` is service-and-owner readable.',
                    '`unlock_at` as `timestamptz` plus `unlock_timezone` (ADR-024).',
                  ],
                  impl: [
                    'Write the schema for all four tables from §10 and §34.6; generate and read the migration.',
                    'Add the `(state, unlock_at)` index and verify with `EXPLAIN` that the intended claim query uses it — a scheduler doing a sequential scan across millions of capsules is a latent outage.',
                    'Store recipient contact as a snapshot. Add a comment explaining why: a member edited or merged years later must not change where an existing capsule was addressed. The `member_id` remains for display and for the merge-follows-survivor rule from TASK-035.',
                    'Add the attempt uniqueness constraint, which is what makes the delivery worker safely retryable.',
                    'Add RLS policies. **The recipient-facing read path is not RLS-based** — recipients have no session; they present a token, and the unlock page resolves it server-side. Document this explicitly so nobody later "fixes" the missing recipient policy.',
                    'Add the entitlement snapshot columns so a later downgrade cannot invalidate an existing promise (§17.2 item 4).',
                    'Extend the seed fixtures with capsules in `draft`, `sealed`, `delivered`, and `opened`, including one with a twenty-year horizon.',
                  ],
                  files: [
                    'packages/db/src/schema/capsule.ts',
                    'packages/db/migrations/0010_capsules.sql',
                    'apps/web/src/features/capsule/schema.ts',
                    'packages/db/src/seed/fixtures.ts  (extend)',
                    'packages/db/src/__tests__/capsule-rls.test.ts',
                  ],
                  data: `Four tables per §10 and §34.6.

**\`(state, unlock_at)\` is the scheduler hot path.** Verify with \`EXPLAIN\` that the claim query uses it.

**Recipient contact is a snapshot, not a join.** A capsule sealed in 2026 must still know the address it was sent to, even if the member record is edited, merged, or deleted in 2035. \`member_id\` stays for display and for the merge rule (TASK-035), but delivery uses the snapshot.

**Recipients read via token, not via RLS.** They have no session. The unlock page resolves a hashed token server-side. There is deliberately no recipient RLS policy; do not add one to "fix" the asymmetry.

**Entitlement snapshot at seal time** (§17.2 item 4). A lapsed subscription must never invalidate an existing promise, so the horizon allowance is recorded when sealed and never re-evaluated.

**\`delivery_attempts\`** is the auditable proof behind the delivery guarantee. Unique on \`(capsule, recipient, channel, attempt_no)\` so retries cannot double-log.`,
                  rules: [
                    'Recipient contact is a snapshot; delivery never depends on a live member row.',
                    'Entitlements are snapshotted at seal and never re-evaluated.',
                    'Recipients authenticate by token, not by session.',
                    'The attempt log is append-only in practice: statuses update, rows are never deleted.',
                  ],
                  edge: [
                    'A member deleted after a capsule was sealed to them — the snapshot keeps delivery possible; the UI shows the name from the snapshot.',
                    'A member merged away — delivery follows the survivor per TASK-035, but the snapshot address remains authoritative unless the owner updates it.',
                    'A recipient with no `member_id` (ad-hoc email entry) — fully supported.',
                    'A capsule whose memory is deleted — blocked by the PHASE-03 guard; verify the hook is now wired.',
                    'A twenty-year `unlock_at` — no arithmetic overflow anywhere; test with a 2046 date.',
                    'Two recipients with the same email on one capsule — allowed but deduplicated at delivery; decide and document.',
                    'A token rotated (version bumped) — the old link must stop working immediately.',
                  ],
                  err: ['A constraint violation on the attempt log must be treated as "already logged" and not as a failure, since that is the correct retry semantics.'],
                  sec: [
                    'Tokens hashed with versioning.',
                    'No recipient RLS policy by design; token resolution is the access path.',
                    'Pre-delivery invisibility is enforced in authz and at the media endpoint, not by the absence of a policy here.',
                  ],
                  tests: {
                    db: [
                      'RLS: another user cannot read these capsules, recipients, or replies.',
                      'Scheduler claim query uses the `(state, unlock_at)` index (assert via plan).',
                      'Attempt uniqueness prevents double-logging.',
                      'A 2046 `unlock_at` stores and reads correctly.',
                    ],
                    integration: ['Deleting a member leaves the capsule deliverable via the snapshot.'],
                  },
                  ac: [
                    'Four tables created with RLS and the required indexes.',
                    'Scheduler index verified by query plan.',
                    'Contact snapshot behaviour proven by deleting a member and confirming deliverability.',
                    'Entitlement snapshot columns present.',
                    'Attempt uniqueness enforced.',
                    'Token versioning in place.',
                    'Recipient-token access model documented in the schema comments.',
                    'Seed fixtures include a twenty-year capsule.',
                  ],
                  notes: ['The snapshot-versus-join decision is the kind of thing a later contributor will try to normalise. The comment explaining why must be unmissable.'],
                },
                {
                  name: 'Implement Transactional Seal with Immutability and Entitlement Gates', type: 'backend', priority: 'critical',
                  deps: ['TASK-057', 'TASK-028'], trace: ['§18.4', '§17.2', '§29.15', 'ADR-006'],
                  obj: 'Implement the seal operation: validate, evaluate entitlements once, write capsule state and the scheduled job in one transaction, and freeze content thereafter.',
                  ctx: 'Blueprint §18.4 item 1: "Sealing writes a `ScheduledJob(kind=\'capsule_delivery\', run_at=unlock_at)` inside the **same transaction** that flips the capsule to `sealed`. There is no window in which a capsule is sealed but unscheduled."',
                  why: 'This is the single most consequential function in the codebase. If the capsule row commits and the job row does not, the product has silently made a promise it will not keep, and nobody finds out until the date passes. The atomicity test is therefore written first and is an acceptance criterion in its own right.',
                  out: 'A `sealCapsule()` function that is atomic, enforces the free-tier gates and the verified-email requirement, snapshots entitlements, and makes content immutable.',
                  fr: [
                    'Validate: at least one recipient, each with a usable contact method; `unlock_at` in the future; memory exists and belongs to the vault.',
                    'Enforce the verified-email gate from §29.4.',
                    'Enforce free-tier gates: at most three **pending** capsules, horizon at most twelve months.',
                    'Snapshot entitlements.',
                    'In one transaction: set `state = sealed`, `sealed_at`, `editable_until`, generate per-recipient tokens, and insert the `capsule_delivery` job.',
                    'After sealing, reject any content mutation; allow cancellation and recipient contact updates.',
                    'Support both `datetime` and `milestone` unlock kinds.',
                  ],
                  tr: [
                    'One database transaction covering every write, including the job row.',
                    '"Pending" is defined as `state = sealed AND delivered_at IS NULL` (§10 `Subscription` note).',
                    'Milestone unlock resolves an absolute `unlock_at` at seal time from the member\'s birthday and the spec (`age:18`), and stores both.',
                    'Tokens: 32 bytes CSPRNG, hashed, version 1.',
                    'Cancellation sets `cancelled_at` and cancels the job in the same transaction.',
                  ],
                  impl: [
                    '**Write the atomicity test first**: inject a failure after the capsule update and before the job insert, and assert the capsule is still `draft`.',
                    'Implement validation. The no-usable-contact case is a **hard block** — §29.15 is explicit that this is the one place friction is correct.',
                    'Enforce the verified-email gate by calling the PHASE-02 check, honouring the grace state.',
                    'Enforce the free-tier gates by counting pending capsules and comparing the horizon. Use the shared constants so the pricing decision lives in one place. **Delivered capsules are never counted** (Appendix C-8).',
                    'Resolve milestone unlocks to an absolute instant at seal time, storing both the spec and the resolved date, so the promise is fixed even if the member\'s birthday is later corrected. Note that tension in §20 — correcting a birthday after sealing is a real case and the resolution must be deliberate.',
                    'Perform every write in one transaction, including the job insert. Use the PHASE-01 job table.',
                    'Implement immutability: a guard on memory and note mutation that refuses when the referenced capsule is sealed, surfaced as a specific error the UI can explain.',
                    'Implement cancellation, cancelling the job in the same transaction.',
                    'Register the sealed-capsule provider for the PHASE-03 memory-deletion guard hook.',
                    'Register the `SealedCapsulesSource` implementation for the PHASE-03 future-band interface.',
                  ],
                  archDiagram: `sealCapsule()
  ├─ validate  (recipients · contact · future date · memory)
  ├─ verified-email gate            (PHASE-02)
  ├─ entitlement gates              3 pending · 12-month horizon (free)
  ├─ resolve milestone → absolute unlock_at
  │
  └─ BEGIN ─────────────────────────────────────────────
       capsules      state=sealed, sealed_at, editable_until
       recipients    token_hash, token_version=1
       scheduled_jobs  kind=capsule_delivery, run_at=unlock_at
     COMMIT ────────────────────────────────────────────
        ▲
        └─ both rows, or neither. There is no third outcome.`,
                  files: [
                    'apps/web/src/features/capsule/seal.ts',
                    'apps/web/src/features/capsule/entitlements.ts',
                    'apps/web/src/features/capsule/milestone.ts',
                    'apps/web/src/features/capsule/immutability.ts',
                    'apps/web/src/features/capsule/actions.ts',
                    'apps/web/src/features/capsule/__tests__/seal-atomicity.test.ts',
                    'apps/web/src/features/capsule/__tests__/entitlements.test.ts',
                  ],
                  api: {
                    method: 'internal', path: 'features/capsule/seal.ts',
                    req: '{\n  "memoryId": "uuid",\n  "recipients": [{ "memberId": "uuid", "email": "ella@example.com" }],\n  "unlockKind": "milestone",\n  "milestoneMemberId": "uuid",\n  "milestoneSpec": "age:18",\n  "unlockTimezone": "Asia/Kolkata",\n  "senderNote": "For your eighteenth."\n}',
                    res: '{ "ok": true, "data": { "capsuleId": "uuid", "unlockAt": "2044-06-04T00:00:00Z" } }',
                    validation: [
                      'Owner authorized to seal (owner-only cell)',
                      'Email verified (§29.4 gate)',
                      'At least one recipient with a usable contact method',
                      'Resolved unlock_at strictly in the future',
                      'Pending-capsule count within the tier allowance',
                      'Horizon within the tier allowance',
                    ],
                    errors: [
                      ['403', 'AUTHZ_DENIED', 'Not the capsule owner'],
                      ['403', 'CAPSULE_EMAIL_UNVERIFIED', 'Scheduling requires a verified email'],
                      ['409', 'CAPSULE_NO_USABLE_CHANNEL', 'A recipient has no email or phone — hard block with a fix link'],
                      ['409', 'CAPSULE_PENDING_LIMIT', 'Three pending capsules already; delivered ones are not counted'],
                      ['409', 'CAPSULE_HORIZON_LIMIT', 'Beyond the twelve-month free horizon'],
                      ['422', 'CAPSULE_UNLOCK_IN_PAST', 'Resolved unlock date is not in the future'],
                    ],
                  },
                  rules: [
                    '**Capsule state and job row commit together, or neither commits.**',
                    'Content is frozen once sealed; the owner may still cancel and may update recipient *contact details*, never recipient identity (§10).',
                    'Entitlements are evaluated once, at seal time, and never re-applied (§17.2 item 4).',
                    'Pending means sealed and undelivered. Delivered capsules never count against the cap.',
                    'No usable contact method is a hard block.',
                  ],
                  edge: [
                    '**Failure between the capsule update and the job insert — must roll back both.** The defining test.',
                    'A milestone whose resolved date is in the past (a member already older than the spec) — reject with a clear message naming the resolved date.',
                    'A member\'s birthday corrected after sealing — the resolved `unlock_at` stands, because the promise was made against it. Document this; it is a real and arguable case.',
                    'A free user at exactly three pending capsules who cancels one — the fourth becomes sealable immediately.',
                    'A capsule sealed at the horizon boundary (365 days) — boundary inclusive or exclusive; decide and test.',
                    'A recipient with a phone but no email on a tier where SMS is unavailable — treat as no usable channel for this tier, and say which channel is missing.',
                    'A deceased member as recipient (gap G-4) — block at seal time with careful copy, and record the copy decision in §20.',
                    'Concurrent seal attempts on the same memory from two devices — one succeeds; the second sees the sealed state and fails cleanly.',
                    'Sealing while offline — blocked by design (§9.4); the draft persists.',
                  ],
                  err: ['Every gate failure names the specific limit and the remedy. A generic "cannot seal" is unacceptable on this screen.'],
                  sec: [
                    'Owner-only, enforced through authz.',
                    'Tokens generated with a CSPRNG and stored hashed.',
                    'Immutability is enforced server-side; a client that omits the check must still be refused.',
                    'The entitlement snapshot is what prevents a billing state from breaking a promise.',
                  ],
                  tests: {
                    unit: [
                      'Milestone resolution computes the correct absolute date across timezones.',
                      'Past-resolved milestone rejected.',
                      'Pending count excludes delivered capsules.',
                      'Horizon boundary behaves as documented.',
                    ],
                    integration: [
                      '**Injected failure after the capsule update leaves the capsule `draft` and no job row** — atomicity.',
                      'Successful seal creates exactly one job row with `run_at = unlock_at`.',
                      'Post-seal content mutation is refused.',
                      'Cancellation cancels the job in the same transaction.',
                      'Unverified email blocks sealing.',
                      'No-usable-channel blocks sealing.',
                      'Concurrent seal: one succeeds, one fails cleanly.',
                      'Deceased recipient blocked.',
                    ],
                  },
                  ac: [
                    '**Atomicity proven by injected failure in both directions.**',
                    'All six documented gates enforced with specific errors.',
                    'Content immutable after seal, enforced server-side.',
                    'Cancellation atomic with job cancellation.',
                    'Entitlements snapshotted and never re-evaluated.',
                    'Milestone resolution correct and fixed at seal time.',
                    'Memory-deletion guard provider registered.',
                    'Future-band source registered.',
                    'Birthday-correction and deceased-recipient decisions recorded in §20.',
                  ],
                  notes: [
                    'Write the atomicity test before the implementation. It is the reason this task exists.',
                    'The birthday-correction case is genuinely arguable. Whatever is decided, write it down — a user will ask.',
                  ],
                },
                {
                  name: 'Extend lib/authz with Share-Link and Capsule-Recipient Grants', type: 'backend', priority: 'critical',
                  deps: ['TASK-057', 'TASK-028'], trace: ['§11.1', '§11.4', '§20.2'],
                  obj: 'Fill the two grant branches PHASE-02 left as documented stubs: share-link holder and delivered capsule recipient.',
                  ctx: 'Blueprint §11.1 states there are exactly three grant paths and "there is no fourth path". PHASE-02 built the vault-membership branch and left the other two returning deny with TODOs naming this task.',
                  why: 'Filling the stubs rather than adding a parallel check is what keeps the single-chokepoint property true. A separate capsule-access function alongside `authz` would be a fourth path in everything but name, and the matrix tests would no longer cover the real behaviour.',
                  out: 'Both branches implemented, the matrix extended to cover the two subject columns, and pre-delivery invisibility enforced inside authz rather than in the UI.',
                  fr: [
                    'Share-link branch: resolve an active, unexpired, unrevoked share for the resource; apply its permission and download flag.',
                    'Capsule-recipient branch: resolve a recipient token; grant content access **only when `delivered_at` is set**.',
                    'Pre-delivery: the recipient may see the sender name and unlock date only.',
                    'Matrix columns for share-link holder and capsule recipient tested per cell.',
                  ],
                  tr: [
                    'Both branches resolve within the same memoised per-request resolution as vault membership.',
                    'Token comparison is constant-time against the stored hash, with `token_version` honoured.',
                    'The pre-delivery restriction is a distinct denial reason, so the unlock page can render a countdown rather than an error.',
                  ],
                  impl: [
                    'Implement the share branch in `resolve-grant.ts`: look up by token hash, check expiry and revocation, and return the share\'s permission level.',
                    'Implement the recipient branch: look up by token hash and version, and return a grant **only if `delivered_at` is set**. Before delivery, return a specific `CAPSULE_NOT_YET_DELIVERED` reason.',
                    'Extend the matrix in `matrix.ts` with the two subject columns from §11.2, transcribed exactly — including that a share-link holder can comment only if granted, and a capsule recipient can reply.',
                    'Re-run the generated matrix tests; the count should grow to cover the new columns.',
                    'Wire the media signed-URL endpoint to this: **pre-delivery capsule media must be unreachable through it.** PHASE-04 left a stub test for this; make it real.',
                    'Add the negative test suite: a recipient token attempting to read the media before delivery, through every endpoint.',
                  ],
                  files: [
                    'apps/web/src/lib/authz/resolve-grant.ts  (fill stubs)',
                    'apps/web/src/lib/authz/matrix.ts  (extend)',
                    'apps/web/src/lib/authz/__tests__/matrix.generated.test.ts  (regenerated)',
                    'apps/web/src/lib/authz/__tests__/pre-delivery.test.ts',
                  ],
                  rules: [
                    '**Three grant paths, no more** (§11.1).',
                    'A capsule recipient gains content access only at delivery.',
                    'Pre-delivery denial has its own reason so the UI can be humane rather than alarming.',
                    'The matrix remains the single source; both new columns are transcribed, not interpreted.',
                  ],
                  edge: [
                    '**A recipient token used before delivery — denied for content, allowed for the countdown view.** The defining test.',
                    'A revoked share used immediately after revocation — denied on the next request.',
                    'An expired share — denied with an expiry-specific reason so the page can offer "ask for a new link".',
                    'A rotated recipient token (version bumped) — the old token denied.',
                    'A share-link holder attempting to download when the share forbids it — denied by the matrix cell.',
                    'A recipient whose capsule was cancelled before delivery — denied with a neutral reason, not an alarming one.',
                    'A token matching nothing — denied identically to a wrong token, with no existence disclosure.',
                    'Both a session and a token present (the recipient is also a user) — decide precedence and document; recommend the stronger grant wins.',
                  ],
                  err: ['Denials are specific enough for humane UI copy but never disclose whether a capsule or share exists.'],
                  sec: [
                    'Constant-time token comparison.',
                    '**Pre-delivery invisibility enforced in authz and at the media endpoint, not in the UI.** This is the property most likely to be implemented only visually.',
                    'No existence disclosure on unknown tokens.',
                  ],
                  tests: {
                    unit: ['Both branches resolve correctly; unknown tokens deny identically to wrong ones.', 'Rotated token version denies the old token.'],
                    integration: [
                      'Regenerated matrix tests pass with the two new columns.',
                      'Revoked share denies on the next request.',
                      'Expired share denies with an expiry reason.',
                    ],
                    security: ['**A recipient token cannot reach capsule media before delivery through any endpoint** — asserted against the signed-URL endpoint and the unlock page.'],
                  },
                  ac: [
                    'Both stub branches implemented inside `lib/authz`; no parallel access function exists.',
                    'Matrix extended with both columns and regenerated tests passing.',
                    '**Pre-delivery media unreachable, proven by security test.**',
                    'Revocation and expiry denials are immediate and specific.',
                    'Token rotation invalidates old links.',
                    'Session-plus-token precedence documented.',
                  ],
                  notes: ['Grep for any capsule or share access that does not route through `authorize()` before marking this done. A single bypass makes the chokepoint a fiction.'],
                },
              ],
            },
          ],
        },
        {
          id: 'SPR-05-01-02', name: 'Seal Flow & Capsule Detail Screens',
          objective: 'The most important form in the product, and the screen that reassures for twenty years.',
          priority: 'critical', deps: ['SPR-05-01-01'], duration: '~5 days',
          goal: 'A user can seal a capsule with full understanding of what will happen, and can return later to confirm the promise is intact.',
          inScope: ['Seal flow screen', 'Summary block', 'Capsule detail with countdown and status history', 'Cancel and edit affordances', 'Contact freshness prompts'],
          outScope: ['Delivery worker (MOD-05-02)', 'Recipient page (MOD-05-03)'],
          approach: ['Legibility over brevity: §29.15 requires a plain-language summary stating who, what, when, and how, before the user commits.'],
          archChanges: ['Populates the future band and the Home scheduled-deliveries strip with real data'],
          deliverables: ['Two screens'],
          testing: ['Gate copy, summary accuracy, timezone display, axe'],
          ac: ['Summary block accurate in both timezones', 'Gate errors specific and actionable'],
          dod: ['Sealing produces a real countdown on Home and the timeline'],
          trace: ['§29.15', '§29.16'],
          epics: [
            {
              id: 'EPIC-05-01-02-01', name: 'Seal Flow & Capsule Detail',
              objective: 'Build the seal screen and the sender-side capsule detail.',
              value: 'Blueprint §29.15 calls the seal screen "the most important screen in the product. Turn a memory into a promise." The detail screen is what keeps that promise credible across the years of silence that follow.',
              stories: [
                ['parent', 'to understand exactly what will happen before I commit', 'I can trust a promise I am making for eighteen years'],
                ['user years later', 'to confirm my capsule is still safe and on track', 'I do not quietly stop believing in it'],
              ],
              functional: ['Recipient picker', 'Unlock condition selector', 'Channel preview with reasons', 'Summary block', 'Seal confirmation', 'Detail with countdown, status history, edit, cancel', 'Contact freshness prompt'],
              technical: ['Both timezones displayed', 'Gate errors mapped to specific copy', 'Status history from the attempt log'],
              ui: ['Per §29.15 and §29.16'],
              security: ['Owner-only; sealed content read-only in the UI as well as the API'],
              testing: ['Summary accuracy, gate copy, timezone, history rendering, axe'],
              ac: ['Both screens complete', 'Summary accurate', 'axe clean'],
              trace: ['§29.15', '§29.16'],
              tasks: [
                {
                  name: 'Build Seal Flow Screen with Plain-Language Summary Block', type: 'frontend', priority: 'critical',
                  deps: ['TASK-058', 'TASK-012'], trace: ['§29.15', '§33.16'],
                  obj: 'Build the seal screen: recipient picker, unlock condition, channel preview, the plain-language summary, and the ceremonial confirmation.',
                  ctx: 'Blueprint §29.15 specifies every element, and singles out the summary block: *"On 4 June 2039, Ella will receive this by email and text. You can edit or cancel it any time before then."* It also states that the no-usable-channel hard block is "the one place friction is correct".',
                  why: 'This screen asks the user to make a commitment they cannot verify for years. Its job is to make the commitment completely legible before it is made — who, what, when, how, and what can still be changed. Every ambiguity here becomes a support question or a broken expectation later.',
                  out: 'A seal screen that makes the promise explicit in one readable sentence, blocks only where blocking is correct, and confirms with a real success state rather than a toast.',
                  fr: [
                    'Memory preview.',
                    'Recipient picker: saved members, or ad-hoc email/phone, multiple recipients.',
                    'Unlock condition: exact date and time, or a member age milestone.',
                    'Channel preview showing the ordered channels that will be tried, with unavailable ones greyed and the reason stated.',
                    '**Summary block** in plain language stating who, what, when, and how, plus what can still be changed.',
                    'Edit and revocation policy stated before confirmation.',
                    'Primary action `Seal this capsule` with a 1.2s ceremonial animation and a real success screen.',
                    'Gate failures render specific copy: pending limit, horizon limit, unverified email, no usable channel.',
                  ],
                  tr: [
                    'Both timezones displayed when they differ (§33.6).',
                    'Milestone selection resolves and **shows the resolved date** before sealing, so the user sees the actual day.',
                    'Channel availability derives from the recipient\'s verified contacts and the tier, per the gap-analysis resolution.',
                    'Ceremonial animation respects reduced motion.',
                    'Offline: sealing is blocked with the honest explanation from §9.4; the draft persists.',
                  ],
                  impl: [
                    'Build the screen as a multi-step sheet reusing the PHASE-01 Sheet, so it can open over the memory detail without losing context.',
                    'Build the recipient picker over the member module, showing the undeliverable badge inline and offering a one-tap fix.',
                    'Build the unlock selector with date and milestone modes. **In milestone mode, show the resolved absolute date immediately** — "Ella turns 18 on 4 June 2044" — because a user committing to a milestone deserves to see the day.',
                    'Build the channel preview with drag-to-reorder per §29.15, rendering only channels the tier and contacts permit and stating why others are unavailable.',
                    'Build the summary block. This is the screen\'s centrepiece: one or two sentences, in the user\'s own terms, naming the recipient, the date in their timezone and the recipient\'s, the channels, and the fact that it can be cancelled until then.',
                    'Map each gate error to specific copy with the remedy: upgrade for horizon and pending limits, verify for email, add contact for channel.',
                    'Implement the ceremonial seal animation with a reduced-motion variant, then a real success screen with `View scheduled` and `Create another`.',
                    'Block sealing offline with the §9.4 explanation, saving the draft.',
                  ],
                  files: [
                    'apps/web/src/app/(app)/capsule/new/page.tsx',
                    'apps/web/src/features/capsule/components/SealFlow.tsx',
                    'apps/web/src/features/capsule/components/RecipientPicker.tsx',
                    'apps/web/src/features/capsule/components/UnlockSelector.tsx',
                    'apps/web/src/features/capsule/components/ChannelPreview.tsx',
                    'apps/web/src/features/capsule/components/SummaryBlock.tsx',
                    'apps/web/src/features/capsule/components/SealCeremony.tsx',
                    'apps/web/src/features/capsule/__tests__/seal-flow.test.tsx',
                  ],
                  ui: `Per §29.15. Multi-step sheet: recipients → when → review.

**Summary block** — the centrepiece, in plain language:

${'```'}
On 4 June 2044, Ella will receive this by email.
That is 4 June 2044 at 9:00 am in Mumbai — 6,502 days from today.
You can edit or cancel this any time before then.
${'```'}

**Channel preview** — drag to reorder, with reasons for anything unavailable:

${'```'}
1. In-app        ✓
2. Email         ✓  ella@example.com
   SMS           —  Premium plan
   WhatsApp      —  Premium plan
${'```'}

**Gate copy** — specific, with the remedy:
- horizon: "This one needs to wait until 2044. Free plans schedule up to a year ahead — Premium removes the limit."
- pending: "You have 3 memories already waiting."
- channel: "Ella has no email or phone yet — add one so we can deliver this." with a fix link.

**Success** — a real screen, not a toast: "Sealed. 6,502 days to go."`,
                  rules: [
                    'The summary block appears before confirmation, always.',
                    'Both timezones shown when they differ.',
                    'Milestone mode shows the resolved absolute date.',
                    'No usable channel is a hard block with a fix link — the one correct place for friction (§29.15).',
                    'Confirmation is a real success state, not a toast (§29.15).',
                    'Sealing offline is blocked with an honest explanation, never silently queued.',
                  ],
                  edge: [
                    'Several recipients in different timezones — the summary must handle it without becoming unreadable; state the recipient-local time per recipient or state the sender time plus a note.',
                    'A milestone already passed — reject with the resolved date named.',
                    'A recipient added and then made undeliverable mid-flow — re-validate before sealing.',
                    'Horizon limit hit by one day — the copy should name the actual limit rather than being vague.',
                    'A free user at the pending limit — offer both upgrade and "cancel an existing one" as paths.',
                    'Reduced motion — the ceremony becomes a clear state change, not a jarring instant one.',
                    'A very distant date (fifty years) — the day count is large; format it readably.',
                    'Sealing interrupted by a step-up re-auth requirement — the pending seal must resume or abort cleanly, never half-commit.',
                  ],
                  err: ['Every gate failure keeps the entered state and offers the remedy in place. Losing a composed capsule to a validation error is unacceptable.'],
                  sec: ['Server-side validation is authoritative; the client copy of the gates is convenience only.'],
                  tests: {
                    component: [
                      'Summary block renders accurate recipient, date, both timezones, and channels.',
                      'Milestone mode shows the resolved date.',
                      'Unavailable channels show the reason.',
                      'Each gate failure renders its specific copy with the remedy.',
                      'Reduced motion replaces the ceremony.',
                      'Offline blocks sealing and preserves the draft.',
                    ],
                    e2e: ['Seal a capsule to a member for two minutes ahead and confirm the success screen and the countdown on Home.'],
                    a11y: ['axe on every step; focus moves through the sheet correctly; the summary is a readable region, not a decorative block.'],
                  },
                  ac: [
                    'Screen implemented per §29.15 with all five states in both themes.',
                    'Summary block accurate, including both timezones.',
                    'Milestone resolved date displayed before sealing.',
                    'All four gate errors render specific, actionable copy.',
                    'No-usable-channel hard block with a working fix link.',
                    'Real success screen; ceremony has a reduced-motion variant.',
                    'Offline blocked with the §9.4 copy and the draft preserved.',
                    'axe clean.',
                  ],
                  notes: ['Spend the time on the summary block. It is the sentence the user will remember when they wonder, years later, whether they set it up correctly.'],
                },
                {
                  name: 'Build Capsule Detail Screen with Countdown and Delivery History', type: 'frontend', priority: 'high',
                  deps: ['TASK-058', 'TASK-013'], trace: ['§29.16', '§24.2'],
                  obj: 'Build the sender-side capsule detail: live countdown, recipient list with contact freshness, delivery plan, full status history, and edit and cancel controls.',
                  ctx: 'Blueprint §29.16 specifies the screen, and §24.2 identifies the problem it solves: "the existing concept has a fatal invisible gap: a user seals a capsule and hears nothing for a decade, so they forget the product, change email, and cancel their card."',
                  why: 'This screen is the product\'s answer to twenty years of silence. It has to make an invisible promise feel present and verifiable — which means a live countdown, an honest delivery plan, and a visible nudge when the recipient\'s contact details have gone stale.',
                  out: 'A screen that answers "is my capsule safe, when will it arrive, and is there anything I should do" without the user having to ask support.',
                  fr: [
                    'Live countdown from the PHASE-01 Countdown component.',
                    'Recipient list with contact-freshness indicators.',
                    'Delivery plan showing the channel order that will be tried.',
                    'Full status history from `delivery_attempts`: sealed, reminder sent, delivered, opened, replied — with timestamps.',
                    '`Add to this capsule` while editable; `Cancel` with a consequence-stating confirmation.',
                    '"Refresh contact details" prompt when a contact is unverified for a long period.',
                    'Reply, once received, shown inline.',
                  ],
                  tr: [
                    'Countdown rendered from cache immediately, then revalidated (§29.16).',
                    'Status history derived from the attempt log, grouped per recipient.',
                    'Cancellation uses the PHASE-01 ConfirmDialog with the recipients named in the consequence text.',
                    'Contact-freshness threshold defined in one constant, shared with the Release-2 nudge job.',
                  ],
                  impl: [
                    'Build the screen with the countdown at the top — it is the emotional anchor and should render before anything else, from cache.',
                    'Render the recipient list with the freshness indicator. Define "stale" once (recommend unverified for eighteen months on a capsule more than two years out, per §14) and share the constant.',
                    'Render the delivery plan honestly: the channels that will actually be tried, in order, given the current tier and contacts. If the tier changed since sealing, show what the snapshot guarantees, not what the current tier would allow — the promise was made against the snapshot.',
                    'Render the status history from the attempt log, grouped per recipient, with human timestamps. Include failed attempts and the fallback that followed, per §29.16 ("WhatsApp failed — sent via SMS instead ✓").',
                    'Implement `Add to this capsule` while within `editable_until`, and a clear read-only state afterwards explaining why.',
                    'Implement cancellation with a ConfirmDialog whose consequence text names the recipients and the date. This is a destructive action on a promise; §33.5 requires the consequence stated.',
                    'Add the refresh-contact prompt with a one-tap path to updating the recipient contact (which the API permits, unlike changing identity).',
                    'Show the reply inline once received, with a path to the memory it was copied into.',
                  ],
                  files: [
                    'apps/web/src/app/(app)/capsule/[id]/page.tsx',
                    'apps/web/src/features/capsule/components/CapsuleDetail.tsx',
                    'apps/web/src/features/capsule/components/DeliveryHistory.tsx',
                    'apps/web/src/features/capsule/components/ContactFreshness.tsx',
                    'apps/web/src/features/capsule/queries.ts',
                    'apps/web/src/features/capsule/__tests__/detail.test.tsx',
                  ],
                  ui: `Per §29.16. Countdown at the top, large, tabular numerals.

${'```'}
        6,502 days
   until Ella opens this
   4 June 2044 · 9:00 am Mumbai

Recipients
  Ella Sharma      ella@example.com   ✓ verified 2 months ago
  Ravi Sharma      ravi@example.com   ⚠ not verified since 2026 — refresh?

Delivery plan
  1. In-app  →  2. Email

History
  Sealed                    26 Aug 2026, 4:12 pm
  (nothing further yet)
${'```'}

**Cancel** — ConfirmDialog: "Cancel this capsule? Ella will not receive it on 4 June 2044. The memory stays in your vault." Typed confirmation not required (it is reversible by re-sealing), but the consequence is stated.

**Read-only state** after \`editable_until\`, with the reason.`,
                  rules: [
                    'The delivery plan reflects the entitlement snapshot, not the current tier — the promise was made against the snapshot.',
                    'Cancellation states the consequence and names the recipients.',
                    'The countdown renders from cache first.',
                    'Failed attempts and their fallbacks are shown, not hidden.',
                  ],
                  edge: [
                    'A capsule delivering in under a minute — the countdown must transition to a delivering state without a negative value.',
                    'A capsule past its unlock with no successful attempt — the screen must show something honest and alarming enough to prompt action, since this is the watchdog condition surfaced to the user.',
                    'A cancelled capsule — read-only with the cancellation recorded in history.',
                    'A capsule with five recipients at different delivery states — group clearly per recipient.',
                    'A recipient whose contact was updated after sealing — history should show that, since it changes where delivery will go.',
                    'A twenty-year countdown — format readably ("6,502 days" rather than a seconds count).',
                    'A capsule whose owner downgraded their plan — the snapshot plan still shown, with a note that it is honoured.',
                    'Reduced motion — the countdown updates without animation.',
                  ],
                  err: ['A failed history query still renders the countdown and recipients; history degrades to a retry rather than blanking the screen.'],
                  sec: ['Owner-only; a recipient must never reach this screen.'],
                  tests: {
                    component: [
                      'Countdown renders from cache then revalidates.',
                      'Freshness indicator appears past the threshold.',
                      'Delivery plan reflects the snapshot, not the current tier.',
                      'History renders attempts including failures and fallbacks.',
                      'Read-only state after `editable_until` explains itself.',
                      'Cancel confirmation names recipients and date.',
                      'Past-unlock-without-delivery state renders honestly.',
                    ],
                    e2e: ['Seal, view detail, cancel, and confirm the read-only cancelled state with history.'],
                    a11y: ['axe; countdown exposes a machine-readable datetime; history is a navigable list.'],
                  },
                  ac: [
                    'Screen implemented per §29.16 with all five states in both themes.',
                    'Countdown renders from cache first.',
                    'Delivery plan honours the entitlement snapshot.',
                    'History shows failures and fallbacks.',
                    'Freshness prompt works with a one-tap contact update.',
                    'Cancel states the consequence.',
                    'Past-unlock-without-delivery surfaces honestly.',
                    'axe clean.',
                  ],
                  notes: ['This screen is the answer to §24.2\'s "design for the 20-year silence". The freshness prompt is the part that actually prevents the failure.'],
                },
              ],
            },
          ],
        },
      ],
    },

    {
      id: 'MOD-05-02', name: 'Delivery Engine',
      purpose: 'The process that must still work in ten years.',
      priority: 'critical',
      objective: 'Deliver every sealed capsule on time, prove it, and page a human the moment one is missed.',
      business: ['Blueprint §37: "The delivery guarantee must be real. Everything else is a photo app."'],
      functional: [
        'Minute-granularity claim loop with locking.',
        'Per-recipient, per-channel fan-out with idempotent attempts.',
        'Channel ladder with day-scale backoff.',
        'Humane local delivery window resolved at fire time.',
        'Watchdog alert on any missed unlock.',
        'Monthly integrity sweep verifying jobs, media, and contact freshness.',
      ],
      backend: ['Delivery handler', 'Email channel with SES fallback', 'Watchdog', 'Integrity sweep'],
      db: ['Reads capsules and recipients; writes attempts and state'],
      integrations: ['Resend primary, AWS SES standing fallback (ADR-016)'],
      security: ['Worker credentials scoped; delivery must not leak content into logs'],
      testing: ['Concurrency, idempotency, all-channels-fail, watchdog firing, clock skew'],
      ac: ['A capsule delivers once and only once', 'A missed unlock fires the watchdog', 'The sweep detects a deliberately orphaned job'],
      trace: ['§18.4', '§14.1', '§14.4', 'ADR-006', 'ADR-016', 'ADR-020'],
      sprints: [
        {
          id: 'SPR-05-02-01', name: 'Scheduler, Channel Ladder, Watchdog & Integrity Sweep',
          objective: 'Make the guarantee an operational fact.',
          priority: 'critical', deps: ['SPR-05-01-01'], duration: '~7 days',
          goal: 'Sealed capsules deliver on time with a full audit trail; a missed one pages a human; an orphaned job is detected within a month.',
          inScope: ['Delivery handler with claim-and-lock', 'Fan-out and idempotent attempts', 'Email channel and durable template', 'Retry ladder', 'Watchdog', 'Integrity sweep', 'DELIVERY-GUARANTEE.md'],
          outScope: ['SMS and WhatsApp (Release 2)', 'Push channel (PHASE-07 supplies the transport; this sprint calls it)'],
          approach: [
            'Boring and correct. `FOR UPDATE SKIP LOCKED`, idempotency keys, day-scale backoff, and an alert that must never be routine.',
            'Write `docs/DELIVERY-GUARANTEE.md` as part of the sprint, not after — it is the specification, including its honest limits.',
          ],
          archChanges: ['Introduces the bespoke delivery-SLA monitor'],
          deliverables: ['Delivery handler', 'Email channel', 'Watchdog', 'Sweep', 'Guarantee document'],
          testing: ['Concurrency, idempotency, failure ladder, watchdog, sweep, clock skew'],
          ac: ['Exactly-once delivery under concurrency', 'Watchdog fires on injected miss', 'Sweep detects an orphaned job'],
          dod: ['`docs/DELIVERY-GUARANTEE.md` written and reviewed'],
          trace: ['§18.4', 'ADR-006'],
          epics: [
            {
              id: 'EPIC-05-02-01-01', name: 'Scheduler & Channel Delivery',
              objective: 'Build the claim loop, the fan-out, and the email channel with a decade-durable template.',
              value: 'This is the machinery behind the product\'s only unique promise.',
              stories: [['recipient in 2044', 'to receive what my father recorded for me', 'the promise made in 2026 is kept']],
              functional: ['Claim due jobs with locking', 'Fan out per recipient and channel', 'Push then email ladder', 'Humane window at fire time', 'Sender receipt', 'Idempotent attempts'],
              technical: ['`FOR UPDATE SKIP LOCKED`', 'Database time only', 'Resend with SES fallback', 'Table-based email with plain-text alternative'],
              security: ['No capsule content in logs or telemetry'],
              testing: ['Concurrency, idempotency, provider failover, window resolution'],
              ac: ['Exactly once under concurrent workers', 'Email renders in an old client', 'Window resolved at fire time'],
              trace: ['§18.4', '§14.4', 'ADR-016'],
              tasks: [
                {
                  name: 'Implement Delivery Worker with Claim-and-Lock and Recipient Fan-Out', type: 'backend', priority: 'critical',
                  deps: ['TASK-058', 'TASK-003'], trace: ['§18.4', 'ADR-006', 'gap G-3'],
                  obj: 'Build the delivery handler: claim due jobs with `FOR UPDATE SKIP LOCKED`, fan out per recipient and channel, and record every attempt idempotently.',
                  ctx: 'Blueprint §18.4 items 2–4 specify the mechanism exactly: a tick worker running every minute, `SELECT ... WHERE state=\'pending\' AND run_at <= now() FOR UPDATE SKIP LOCKED LIMIT 100`, fanning out into per-recipient, per-channel attempts "each idempotent by `(capsule, recipient, channel, attempt_no)`".',
                  why: 'The blueprint describes this as "simple, boring, and correct under concurrency", and that is the goal. Every clever optimisation here is a risk to the only promise the product cannot break. Gap G-3 adds one refinement the blueprint does not: the humane delivery window must be resolved **at fire time**, not at seal time, because a recipient may move timezone over twenty years.',
                  out: 'A handler that delivers each capsule exactly once per recipient per channel, under concurrent workers, with a complete attempt log and no reliance on container clocks.',
                  fr: [
                    'Claim up to 100 due jobs per tick with locking and a lock expiry.',
                    'For each capsule: load recipients, resolve the humane local window, and decide whether to deliver now or defer within the day.',
                    'Fan out: for each recipient, attempt channels in ladder order.',
                    'Record every attempt with `attempt_no`, provider, and provider message id.',
                    'Set `delivered_at` on the recipient and, when all recipients are delivered, on the capsule.',
                    'Notify the sender on delivery.',
                    'Skip and notify instead of delivering when the recipient member is marked deceased (gap G-4).',
                  ],
                  tr: [
                    '**Database time only.** Never a container clock, for claiming or for window resolution.',
                    'Lock expiry so a crashed worker\'s job is reclaimable.',
                    'Idempotency by the attempt uniqueness constraint; a duplicate insert is treated as "already attempted".',
                    'Humane window 09:00–20:00 in the recipient\'s current timezone, resolved at fire time (gap G-3).',
                    'A job that cannot deliver today defers to the next window rather than failing.',
                  ],
                  impl: [
                    'Implement the handler in `apps/workers/src/handlers/capsule-delivery.ts`, registered on the PHASE-01 registry.',
                    'Write the claim query exactly as §18.4 specifies, and confirm via `EXPLAIN` that it uses the `(state, unlock_at)` index.',
                    'Resolve the humane window at fire time from the recipient\'s current timezone where known, falling back to the capsule\'s `unlock_timezone`. **Do not use the seal-time value if a newer one is available** — that is the gap-G-3 correction.',
                    'Fan out per recipient. For each, walk the channel ladder: push first (free and instant), then email (guaranteed). Record an attempt row before calling the provider, so a crash mid-call leaves evidence.',
                    'Treat a duplicate-attempt constraint violation as success-already-recorded, not as an error.',
                    'Set `delivered_at` per recipient, and on the capsule once every recipient is delivered. Notify the sender.',
                    'Implement the deceased-recipient skip: do not deliver, notify the owner instead, and record the reason. The copy needs care and review (gap G-4).',
                    'Ensure no capsule content — note text, media, or recipient address — reaches a log line or Sentry payload.',
                    'Write the concurrency test with two workers claiming simultaneously and assert exactly one delivery.',
                  ],
                  archDiagram: `every minute (apps/workers)
  SELECT ... WHERE state='pending' AND run_at <= now()      ← database time
    FOR UPDATE SKIP LOCKED LIMIT 100                        ← safe concurrency
        │
        ├─ resolve humane window in RECIPIENT'S CURRENT tz   ← at fire time (gap G-3)
        │    outside 09:00–20:00 ? ──▶ defer to next window
        │
        ├─ for each recipient:
        │     insert attempt row (before calling provider)
        │     push ──fail──▶ email ──fail──▶ escalate to sender
        │     set recipient.delivered_at
        │
        ├─ all recipients delivered ? ──▶ capsule.delivered_at
        └─ notify sender

deceased recipient (gap G-4) ──▶ do NOT deliver; notify owner; record reason`,
                  files: [
                    'apps/workers/src/handlers/capsule-delivery.ts',
                    'apps/workers/src/lib/humane-window.ts',
                    'apps/workers/src/lib/channels/index.ts',
                    'apps/workers/src/handlers/index.ts  (register)',
                    'apps/workers/src/handlers/__tests__/capsule-delivery.test.ts',
                  ],
                  rules: [
                    '**Database time only** — never a container clock.',
                    'An attempt row is written before the provider is called.',
                    'A duplicate attempt is success-already-recorded, not an error.',
                    'The humane window is resolved at fire time from the recipient\'s current timezone.',
                    'No capsule content in any log or telemetry payload.',
                    'A deceased recipient is not delivered to; the owner is notified.',
                  ],
                  edge: [
                    'Two workers claiming the same job — `SKIP LOCKED` prevents it; test with genuine concurrency.',
                    'A worker crashing mid-delivery — the lock expires and the job is reclaimed; the attempt log prevents a duplicate send.',
                    'A provider call that times out with the message actually sent — the attempt row exists; on retry, the provider message id or a dedupe key must prevent a second send. Document the approach.',
                    'A recipient whose timezone is unknown — fall back to the capsule\'s `unlock_timezone`.',
                    'A capsule due at 02:00 local — defer to 09:00 the same day, not the next.',
                    'A capsule already past its window when claimed after an outage — deliver immediately; a late delivery is far better than a missed one. Document this asymmetry against the On This Day rule, which skips late.',
                    'A cancelled capsule whose job was not cancelled — the handler must re-check state and skip.',
                    'A capsule whose media is missing — deliver the note and flag the failure loudly; do not silently deliver an empty capsule.',
                    'Clock skew between workers — irrelevant, because database time is authoritative.',
                  ],
                  err: ['A provider failure records the attempt with an error code and schedules the next rung. A handler exception is caught per capsule so one bad capsule cannot stall the queue.'],
                  sec: [
                    'Worker credentials are scoped; the handler must still verify ownership relationships rather than trusting the payload.',
                    'Content must never reach logs. Add an explicit assertion in the test suite.',
                  ],
                  tests: {
                    integration: [
                      '**Two concurrent workers: exactly one delivery, one attempt row.**',
                      'Crash mid-delivery: job reclaimed after lock expiry, no duplicate send.',
                      'Duplicate attempt insert treated as already-attempted.',
                      'Capsule due at 02:00 defers to 09:00 the same day.',
                      'Late claim after an outage delivers immediately.',
                      'Cancelled capsule is skipped.',
                      'Deceased recipient is skipped and the owner notified.',
                      'Missing media flags loudly rather than delivering empty.',
                      'No capsule content appears in captured log output.',
                    ],
                  },
                  ac: [
                    'Claim query uses the intended index, verified by plan.',
                    '**Exactly-once delivery under concurrency, proven by test.**',
                    'Attempt row written before the provider call.',
                    'Humane window resolved at fire time from the recipient\'s current timezone.',
                    'Late-versus-skip policy documented and consistent with the On This Day decision.',
                    'Deceased-recipient path implemented with reviewed copy.',
                    'No content in logs, asserted by test.',
                  ],
                  notes: [
                    'Keep this handler boring. It is the code that must still be correct when nobody who wrote it is here.',
                    'Record the provider-dedupe approach for the timeout-but-sent case in §20.',
                  ],
                },
                {
                  name: 'Build Email Channel with Decade-Durable Delivery Template', type: 'backend', priority: 'critical',
                  deps: ['TASK-062'], trace: ['§14.4', 'ADR-016', '§29.24'],
                  obj: 'Implement the email delivery channel with Resend and an SES fallback, and the delivery email built to render in clients that do not exist yet.',
                  ctx: 'Blueprint §14.4 gives the design brief in full: the subject names the sender and occasion rather than the brand, there is no marketing, and "the email must render correctly in email clients that will not exist for another 15 years: table-based layout, inline styles, a plain-text alternative, no JavaScript, no web fonts, no external CSS".',
                  why: 'Email is the guaranteed channel (§14.2) because push subscriptions die. That makes this template the most durability-critical piece of markup in the product. It also carries the emotional payload: blueprint §14.4 gives the example subject "Dad recorded this for your 18th birthday", and a template cluttered with branding would undercut the moment it exists to deliver.',
                  out: 'An email channel with automatic provider failover, and a delivery template that is plain, table-based, inline-styled, and accompanied by a plain-text alternative.',
                  fr: [
                    'Send via Resend; on failure, fall back to SES automatically and record which provider was used.',
                    'Delivery template: subject names sender and occasion; body is one sentence and one link.',
                    'Plain-text alternative for every send.',
                    'Bounce and complaint webhooks update the attempt status.',
                    'Sender receipt email on delivery and on first open.',
                  ],
                  tr: [
                    'Table-based layout, all styles inline, no web fonts, no external CSS, no JavaScript, no tracking pixel.',
                    'Images referenced only where essential and always with meaningful alt text — many clients block images by default, so the email must read completely without them.',
                    'The unlock link is the durable `/c/[token]` URL with no query parameters that could be stripped.',
                    'No `List-Unsubscribe` on the delivery email itself — it is transactional (§14.4).',
                  ],
                  impl: [
                    'Implement the channel in `apps/workers/src/lib/channels/email.ts` with Resend primary and SES fallback, recording the provider on the attempt row.',
                    'Build the template in `packages/emails/src/templates/CapsuleDelivered.tsx` using table layout and inline styles only. **Test it with images disabled and with CSS stripped** — those are the two states old and locked-down clients present.',
                    'Write the subject from the sender name and the occasion, never the brand.',
                    'Write the body as one sentence and one link. Resist adding a footer, a logo, or a "download our app" line; §14.4 forbids it and the reason is that this email is the payoff of a decades-old promise.',
                    'Generate the plain-text alternative from the same content, not as an afterthought.',
                    'Implement bounce and complaint webhook handling that updates the attempt status, so a bounced address is visible on the capsule detail screen and can trigger the next rung.',
                    'Implement the sender receipt emails for delivery and first open — the latter is described in §14.1 as "the single most valuable notification the product sends".',
                    'Verify rendering across a broad client matrix, and record the results in §20.',
                  ],
                  files: [
                    'apps/workers/src/lib/channels/email.ts',
                    'packages/emails/src/templates/CapsuleDelivered.tsx',
                    'packages/emails/src/templates/CapsuleOpened.tsx',
                    'packages/emails/src/render-text.ts',
                    'apps/web/src/app/api/webhooks/resend/route.ts',
                    'packages/emails/src/__tests__/durability.test.tsx',
                  ],
                  ui: `**Subject:** \`Dad recorded this for your 18th birthday\`

**Body** — one sentence, one link, nothing else:

${'```'}
Riya left this for you on 4 June 2026.

    [ Open your memory ]

If the button does not work, open this link:
https://…/c/xxxxxxxx
${'```'}

No logo. No footer links. No tracking pixel. No web fonts. Table layout, inline styles.

**Plain-text alternative** carries the same words and the same URL.`,
                  rules: [
                    'Table layout, inline styles, no web fonts, no external CSS, no JavaScript, no tracking pixel.',
                    'The email must read completely with images disabled.',
                    'Subject names the sender and occasion, not the brand.',
                    'No marketing, no footer clutter.',
                    'Every send has a plain-text alternative.',
                    'No `List-Unsubscribe` on transactional delivery mail.',
                  ],
                  edge: [
                    'Images blocked — the email must be fully usable; test explicitly.',
                    'CSS stripped entirely — the table layout must still be readable.',
                    'A client that mangles long URLs — keep the token URL short and also present it as text.',
                    'Resend outage — SES fallback engages and is recorded.',
                    'Both providers failing — the attempt records failure and the ladder escalates to notifying the sender.',
                    'A bounced address — status updated, capsule detail shows it, next rung attempted.',
                    'A recipient address that is a shared family mailbox — nothing to do technically, but worth noting in the guarantee document as a limit.',
                    'Dark-mode email clients inverting colours — test; avoid designs that depend on a light background.',
                    'A very long sender name or occasion in the subject — truncate sensibly rather than being cut mid-word by the client.',
                  ],
                  err: ['A send failure records the provider error code and lets the ladder proceed. A template render failure must be caught in CI, not at delivery time — hence the durability test.'],
                  sec: [
                    'No tracking pixel: it would leak open behaviour to a third party on an intimate message.',
                    'The token URL is the credential; it must not appear in any log.',
                    'Webhook signatures verified with replay protection.',
                  ],
                  tests: {
                    unit: ['Plain-text alternative contains the same URL and message.', 'Subject composed from sender and occasion.'],
                    integration: [
                      'Resend failure falls back to SES and records the provider.',
                      'Bounce webhook updates the attempt status.',
                      'Both providers failing escalates to the sender notification.',
                    ],
                    component: [
                      '**Template renders readably with images disabled.**',
                      '**Template renders readably with all CSS stripped.**',
                      'No external resource references, no script tags, no web fonts — asserted against the rendered HTML.',
                    ],
                  },
                  ac: [
                    'Email channel with automatic Resend-to-SES failover, provider recorded.',
                    'Template is table-based and inline-styled, with no external resources — asserted by test.',
                    'Readable with images disabled and with CSS stripped.',
                    'Plain-text alternative for every send.',
                    'Subject names sender and occasion.',
                    'Bounce and complaint handling wired.',
                    'Sender receipt emails for delivery and first open.',
                    'Client-matrix results recorded in §20.',
                  ],
                  notes: ['Resist every instinct to brand this email. Its value is that it looks like a message from a person, because that is what it is.'],
                },
                {
                  name: 'Implement Retry Ladder, Delivery Watchdog and Integrity Sweep', type: 'backend', priority: 'critical',
                  deps: ['TASK-063'], trace: ['§18.4', '§12.6', 'ADR-020'],
                  obj: 'Implement day-scale retry backoff, the watchdog that pages a human on any missed unlock, and the monthly integrity sweep.',
                  ctx: 'Blueprint §18.4 items 5–7: retries "with exponential backoff over days, not minutes — a bounced mailbox may come back, and there is no hurry once the date has arrived"; a watchdog that "alerts a human if any capsule is past `unlock_at` with no successful attempt" and "must never be routine"; and a monthly sweep verifying job rows, media checksums, and contact freshness.',
                  why: 'These three pieces are what convert the delivery mechanism into a guarantee. The retry ladder handles the ordinary failures. The watchdog catches the extraordinary ones. The sweep catches the silent ones — a capsule whose job row was lost, or whose media was corrupted, would otherwise be discovered only on the delivery date, which for a twenty-year capsule means twenty years too late.',
                  out: 'Day-scale retries with a bounded window, an hourly watchdog wired to a paging alert, and a monthly sweep that reports orphaned jobs, checksum failures, and stale contacts.',
                  fr: [
                    'Retry backoff measured in hours and days with a documented maximum window.',
                    'Escalation to notifying the sender when every channel is exhausted.',
                    'Hourly watchdog: any capsule past `unlock_at` with no successful attempt raises a paging alert.',
                    'Monthly sweep: every sealed capsule has a valid future job row; media objects exist and match their checksums; recipient contacts are not stale.',
                    'Sweep findings written to a report and surfaced on the admin delivery-health screen.',
                  ],
                  tr: [
                    'Backoff schedule defined in one place and unit-tested.',
                    'The watchdog queries for the condition rather than inferring it from logs, so it cannot be fooled by a missing log line.',
                    'The alert routes to a paging channel, not to an email nobody reads.',
                    'The sweep is chunked so it can run over a large dataset without long transactions.',
                  ],
                  impl: [
                    'Implement the backoff schedule: minutes for the first couple of attempts, then hours, then daily, with a documented maximum window (recommend fourteen days) after which the sender is notified and the capsule is marked failed rather than retried forever.',
                    'Implement escalation: when the ladder is exhausted for a recipient, notify the sender with a specific, actionable message naming the recipient and the reason.',
                    'Implement the watchdog handler running hourly. The query is simple: sealed capsules with `unlock_at < now()` and no `delivery_attempts` row with a successful status. **Route the alert to a paging channel.**',
                    'Add a deliberate test that injects a missed unlock and asserts the alert fires. This test is the reason the watchdog can be trusted.',
                    'Implement the monthly integrity sweep: for each sealed capsule, verify a pending job row exists with the right `run_at`; verify each media object exists and its checksum matches; flag recipients whose contact has not been verified within the freshness threshold.',
                    'Write findings to a report table and surface counts on the admin delivery-health screen (PHASE-08 builds that screen; expose the query now).',
                    'Write `docs/DELIVERY-GUARANTEE.md` describing the whole mechanism **and its honest limits** — what is guaranteed, what is best-effort, and what depends on the recipient\'s contact details remaining valid. Blueprint §37 makes publishing this a launch deliverable.',
                  ],
                  archDiagram: `RETRY LADDER (per recipient)
  push → email → (R2: SMS → WhatsApp) → notify sender
  backoff: minutes → hours → daily, max 14 days → mark failed + notify

WATCHDOG (hourly)
  SELECT capsules WHERE state='sealed' AND unlock_at < now()
    AND NOT EXISTS (successful delivery_attempt)
  ──▶ PAGE A HUMAN.  This alert must never be routine.

INTEGRITY SWEEP (monthly, chunked)
  every sealed capsule has a pending job with correct run_at?
  every media object exists and checksums correctly?
  recipient contacts verified within the freshness threshold?
  ──▶ report → admin delivery-health screen`,
                  files: [
                    'apps/workers/src/lib/backoff-schedule.ts',
                    'apps/workers/src/handlers/delivery-watchdog.ts',
                    'apps/workers/src/handlers/integrity-sweep.ts',
                    'apps/workers/src/lib/alerting.ts',
                    'packages/db/migrations/0011_integrity_reports.sql',
                    'docs/DELIVERY-GUARANTEE.md',
                    'apps/workers/src/handlers/__tests__/watchdog.test.ts',
                    'apps/workers/src/handlers/__tests__/integrity-sweep.test.ts',
                  ],
                  data: `Adds an \`integrity_reports\` table: id, run_at, capsules_checked, orphaned_jobs, checksum_failures, stale_contacts, findings (jsonb).

The sweep is chunked so it never holds a long transaction. Findings are retained so a trend is visible — a rising checksum-failure count is an early warning of storage trouble, and blueprint §12.6 asks for exactly that ("an annual integrity sweep verifying stored checksums against the objects, to catch bit rot before a user does").`,
                  rules: [
                    '**A capsule past its unlock with no successful attempt pages a human.**',
                    'Retries are measured in hours and days, not minutes.',
                    'A capsule is never retried forever; after the maximum window the sender is told.',
                    'The watchdog queries the condition directly and does not rely on logs.',
                    'The guarantee document states the limits as well as the promises.',
                  ],
                  edge: [
                    '**An injected missed unlock must fire the alert** — the defining test.',
                    'A capsule delivered to two of three recipients — the watchdog must not fire, but the sweep should flag the incomplete one.',
                    'A capsule whose job row was deleted by accident — the sweep detects the orphan; test by deleting one.',
                    'A media object whose checksum no longer matches — flagged, and worth alerting rather than only reporting.',
                    'A capsule cancelled after its unlock passed — must not trigger the watchdog.',
                    'A very large archive making the sweep slow — chunking and a bounded run window; report partial completion rather than silently truncating.',
                    'A transient provider outage lasting days — backoff should still be within the window and eventually succeed rather than escalating prematurely.',
                    'A recipient address that hard-bounced permanently — escalate to the sender rather than retrying for fourteen days.',
                  ],
                  err: ['A sweep failure must alert, because a silent sweep failure means the safety net is gone without anyone knowing.'],
                  sec: ['The alert payload must not contain capsule content — only ids and counts.'],
                  tests: {
                    unit: ['Backoff schedule matches the documented ladder and is bounded.'],
                    integration: [
                      '**Injected missed unlock fires the paging alert.**',
                      'Partially delivered capsule does not fire the watchdog but is flagged by the sweep.',
                      'Deleted job row is detected as an orphan.',
                      'Corrupted checksum is detected and alerted.',
                      'Cancelled past-unlock capsule does not fire.',
                      'Hard bounce escalates immediately rather than retrying for the full window.',
                      'Sweep chunking handles a large dataset within the run window.',
                    ],
                  },
                  ac: [
                    'Backoff ladder implemented, bounded, and unit-tested.',
                    'Escalation notifies the sender with an actionable message.',
                    '**Watchdog fires on an injected missed unlock, routed to a paging channel.**',
                    'Sweep detects orphaned jobs, checksum failures, and stale contacts.',
                    'Findings surfaced for the admin screen.',
                    '**`docs/DELIVERY-GUARANTEE.md` written, including honest limits, and reviewed.**',
                    'Alert payloads contain no capsule content.',
                  ],
                  notes: [
                    'The guarantee document is a deliverable of this task, not a follow-up. Blueprint §37 makes publishing it a launch item, and writing it here forces the limits to be understood while the mechanism is fresh.',
                    'If the watchdog ever fires in normal operation, something is wrong with the system, not with the alert threshold.',
                  ],
                },
              ],
            },
          ],
        },
      ],
    },

    {
      id: 'MOD-05-03', name: 'Recipient Experience',
      purpose: 'The moment the product exists for.',
      priority: 'critical',
      objective: 'Deliver the memory in a way worthy of the wait, to someone with no account, in a browser we cannot predict.',
      business: [
        'Blueprint §2.2: "The delivery moment *is* the product. A capsule that arrives as a plain email attachment destroys the value created over 13 years."',
        'It is also the growth loop: the recipient becomes a creator.',
      ],
      functional: ['Sealed countdown state', 'Ceremonial reveal', 'Full-screen memory', 'Reply with text, emoji, or voice', 'Save a copy', 'Soft account invitation'],
      ui: ['Per §29.24 — no chrome competing with the memory'],
      backend: ['Token resolution', 'Reply capture without an account', 'Open and reply notifications to sender'],
      security: ['Server-rendered, works without JavaScript', 'Pre-delivery invisibility', '`noindex`', 'Rate-limited by token'],
      testing: ['JavaScript-disabled rendering', 'Pre-delivery denial', 'All failure states', 'axe'],
      ac: ['Page works with JavaScript disabled', 'Reply reaches the sender', 'Pre-delivery media unreachable'],
      trace: ['§29.24', '§34.6', '§11.4'],
      sprints: [
        {
          id: 'SPR-05-03-01', name: 'Recipient Unlock Page & Reply Loop',
          objective: 'The payoff, and the loop that closes it.',
          priority: 'critical', deps: ['SPR-05-02-01'], duration: '~5 days',
          goal: 'A recipient opens a delivered capsule on any browser, watches it, replies, and the reply lands in the sender\'s vault.',
          inScope: ['`/c/[token]` page with all states', 'Ceremonial reveal', 'Reply capture (text, emoji, voice)', 'Save a copy', 'Sender notifications', 'Soft signup invitation'],
          outScope: ['Collaborative capsules (Release 2)', 'Full account linking flows'],
          approach: [
            'Server-render everything. Progressive enhancement only. The page must work with JavaScript off, which rules out a client-side reveal as the primary path.',
            'Restraint in the UI: §29.24 requires "no chrome, no branding competing for attention".',
          ],
          archChanges: ['Completes the growth loop by turning a reply into a memory in the sender\'s vault'],
          deliverables: ['Unlock page', 'Reply capture', 'Notifications'],
          testing: ['No-JS, pre-delivery denial, failure states, axe'],
          ac: ['No-JS path verified', 'Reply round trip verified'],
          dod: ['Every failure state has designed copy'],
          trace: ['§29.24', '§14.1'],
          epics: [
            {
              id: 'EPIC-05-03-01-01', name: 'Recipient Unlock & Reply',
              objective: 'Build the unlock page and the reply loop.',
              value: 'Blueprint §29.24 calls this "the most emotionally important screen in the product". §24.2 identifies the reply as what converts a one-way broadcast into a relationship — and a recipient into a user.',
              stories: [
                ['recipient', 'to open what was left for me without signing up for anything', 'nothing stands between me and the message'],
                ['recipient', 'to say something back', 'the person who made this knows it reached me'],
                ['sender', 'to know it was opened', 'the promise completed'],
              ],
              functional: ['Sealed, delivered, expired, revoked, and not-found states', 'Slow reveal', 'Full-screen media', 'Reply', 'Save a copy', 'Soft invitation'],
              technical: ['Server components only', 'Progressive enhancement', 'Media preloaded before the reveal so it never stutters'],
              ui: ['Per §29.24'],
              security: ['`noindex`', 'Rate-limited', 'Pre-delivery invisibility', 'No account required'],
              testing: ['No-JS, states, reply, notification, axe'],
              ac: ['No-JS works', 'All five states designed', 'Reply reaches sender'],
              trace: ['§29.24', '§34.6'],
              tasks: [
                {
                  name: 'Build Server-Rendered Recipient Unlock Page', type: 'fullstack', priority: 'critical',
                  deps: ['TASK-059', 'TASK-062'], trace: ['§29.24', '§11.4', 'ADR-002'],
                  obj: 'Build `/c/[token]` as a server-rendered page with all five states, a ceremonial reveal, and full functionality with JavaScript disabled.',
                  ctx: 'Blueprint §29.24 specifies the states and the reveal. ADR-002 and the project plan both make the constraint explicit: "`/c/[token]` is server-rendered and works with JavaScript disabled. A 2046 recipient must not be blocked by a 2026 framework assumption."',
                  why: 'Everything about this page is unusual because its requirements are unusual. It must work for someone with no account, on an unknown browser, possibly decades from now, at the emotional peak of the product. That combination rules out a client-rendered experience and rules out anything that depends on a framework runtime surviving.',
                  out: 'A page that resolves a hashed token server-side, renders the correct one of five states, reveals the memory with ceremony where JavaScript is available and plainly where it is not, and never leaks pre-delivery content.',
                  fr: [
                    'Sealed state (not yet due): sender name, when it was recorded, and a countdown. **No media, no note.**',
                    'Delivered state: the sender\'s note, the memory full-screen, and a reply affordance.',
                    'Expired, revoked, and not-found states, each with warm designed copy.',
                    'Ceremonial reveal (~1.2s) as a progressive enhancement, with an immediate render as the baseline.',
                    '`Save a copy` download.',
                    'A soft, non-blocking invitation to create an account.',
                  ],
                  tr: [
                    '**No client components anywhere in this route\'s tree.** The PHASE-01 scaffold added a comment saying so; honour it.',
                    'Token resolved server-side by hash with constant-time comparison and version checking.',
                    'Media preloaded (poster and first bytes) before the reveal animation runs, so it never stutters (§29.24).',
                    '`noindex, nofollow, noarchive` headers.',
                    'Rate-limited per token and per IP.',
                    'Signed media URLs minted server-side and embedded, since the client cannot be relied upon to fetch them.',
                  ],
                  impl: [
                    'Build the page as an async server component. **Do not introduce a client component**; the reveal is a CSS animation triggered by a server-rendered class, enhanced by a small optional script.',
                    'Resolve the token through `lib/authz`, using the recipient branch built in TASK-059, so pre-delivery invisibility is enforced by the same chokepoint as everything else.',
                    'Render the sealed state with the countdown as server-rendered text plus a `<time datetime>` element. Without JavaScript the countdown is static; that is acceptable and honest, and the date is what matters.',
                    'Render the delivered state: note first, then media. Mint signed URLs server-side and embed them.',
                    'Implement the reveal as a CSS transition with a `prefers-reduced-motion` variant. Where JavaScript is present, preload the poster and first media bytes before triggering it.',
                    'Strip the app chrome entirely. §29.24 requires "no chrome, no branding competing for attention" — this page is the memory and nothing else.',
                    'Implement all five states with warm, specific copy. The not-yet-due state is a countdown page, **not an error** (§29.24).',
                    'Add `Save a copy` as a plain link to a server-minted download URL, so it works without JavaScript.',
                    'Add the soft signup invitation at the bottom — present, unobtrusive, never blocking.',
                    'Record `opened_at` on first view and notify the sender. **Do this server-side on render**, since a client-side beacon would miss no-JS visitors.',
                    'Write the defining test: render with JavaScript disabled in Playwright and assert the note and media are present.',
                  ],
                  archDiagram: `GET /c/[token]        ← no client components in this tree
  ├─ resolve token (hashed, constant-time, version-checked)
  ├─ lib/authz recipient branch
  │     delivered_at IS NULL  ──▶ SEALED state: sender + date + countdown only
  │     delivered              ──▶ DELIVERED state
  │     revoked / expired / unknown ──▶ designed states
  │
  ├─ mint signed media URLs SERVER-SIDE and embed
  ├─ record opened_at + notify sender   (server-side, so no-JS visitors count)
  └─ render: note first, then media, CSS reveal, no app chrome

Works with JavaScript disabled. Asserted by test.`,
                  files: [
                    'apps/web/src/app/c/[token]/page.tsx',
                    'apps/web/src/app/c/[token]/states.tsx',
                    'apps/web/src/features/capsule/resolve-token.ts',
                    'apps/web/src/app/c/[token]/reveal.css',
                    'apps/web/src/app/c/[token]/__tests__/no-js.test.ts',
                  ],
                  ui: `Per §29.24. **No app chrome. No navigation. No logo competing with the memory.**

**Sealed (not yet due)**

${'```'}
        Riya left something for you.
        It opens on 4 June 2044.

              6,502 days
${'```'}

Nothing else. No media, no note, no hint of content.

**Delivered** — the sender's note in Fraunces, then the memory full-screen. Reveal is slow (~1.2s) and deliberate, because ceremony is the point. Under reduced motion it is a clean cross-fade.

Below: \`Reply\` · \`Save a copy\` · and, quietly, "Keep your own moments" — an invitation, never a wall.

**Expired** — "This link has expired — ask Riya to resend it."
**Revoked** — neutral, unalarming.
**Not found** — identical to revoked, so nothing is disclosed.`,
                  rules: [
                    '**No client components in this route.**',
                    'Pre-delivery: sender name and date only. No media, no note, not even a thumbnail.',
                    'The not-yet-due state is a countdown page, not an error.',
                    'No account is ever required to view.',
                    '`noindex, nofollow, noarchive`.',
                    'Revoked and not-found are indistinguishable.',
                    '`opened_at` is recorded server-side on render.',
                  ],
                  edge: [
                    '**JavaScript disabled — note and media must render.** The defining test.',
                    'A token used before delivery — countdown page, and the media must be unreachable even by guessing a URL.',
                    'A capsule cancelled before delivery — neutral revoked state.',
                    'A very old browser with no CSS grid — the layout must degrade to a readable single column.',
                    'Images blocked or media unsupported — the note must still carry the moment, and a download link must be present.',
                    'A recipient opening the link repeatedly — `opened_at` records the first only; the sender is notified once.',
                    'Several recipients sharing one link — not possible; each recipient has their own token.',
                    'A recipient forwarding their link to someone else — it works, because it is a bearer token. Note this as a stated limit in the guarantee document rather than pretending otherwise.',
                    'A media file still transcoding at delivery time — render the note and a processing state, and notify the sender; do not present a broken player at the emotional peak.',
                    'Reduced motion — cross-fade instead of reveal.',
                  ],
                  err: ['Every failure state is a designed page with warm copy. There is no scenario in which this page shows a stack trace or a bare 404.'],
                  sec: [
                    'Constant-time token comparison; version honoured.',
                    '**Pre-delivery invisibility enforced through authz, not by omitting the markup.**',
                    'Rate-limited per token and IP.',
                    '`noindex` headers.',
                    'Signed URLs minted server-side and short-lived.',
                    'Forwardability is an accepted property of a bearer token; document it rather than implying it cannot happen.',
                  ],
                  tests: {
                    e2e: [
                      '**Render with JavaScript disabled: note and media present, download link works.**',
                      'Reveal runs with JavaScript enabled and is replaced by a cross-fade under reduced motion.',
                    ],
                    integration: [
                      'Pre-delivery token shows the countdown and no content.',
                      'Cancelled capsule shows the neutral state.',
                      'Repeated opens record `opened_at` once and notify once.',
                      'Transcoding media renders the note plus a processing state.',
                    ],
                    security: [
                      '**Pre-delivery media unreachable via the signed-URL endpoint using the recipient token.**',
                      'Revoked and not-found responses are byte-identical.',
                      '`noindex` headers present.',
                    ],
                    a11y: ['axe with and without JavaScript; heading order sensible; media has accessible names; countdown exposes a machine-readable datetime.'],
                  },
                  ac: [
                    '**Page fully functional with JavaScript disabled, proven by test.**',
                    'All five states implemented with designed copy, both themes.',
                    'Pre-delivery shows sender and date only; media unreachable, proven by security test.',
                    'Reveal is a progressive enhancement with a reduced-motion variant.',
                    'No app chrome; no client components in the route.',
                    '`opened_at` recorded server-side and the sender notified once.',
                    '`noindex` headers present; revoked and not-found indistinguishable.',
                    'Forwardability documented as a stated limit.',
                    'axe clean in both JavaScript states.',
                  ],
                  notes: [
                    'This is the page where restraint matters most. Every element added competes with the reason it exists.',
                    'The no-JS requirement is not theoretical: it is what makes the twenty-year promise technically credible, and it is cheap to honour if done from the start.',
                  ],
                },
                {
                  name: 'Implement Reply Capture and Sender Notification Loop', type: 'fullstack', priority: 'high',
                  deps: ['TASK-065', 'TASK-047'], trace: ['§34.6', '§14.1', '§24.2'],
                  obj: 'Let a recipient reply with text, an emoji reaction, or a voice note — without an account — and deliver that reply into the sender\'s vault as a memory.',
                  ctx: 'Blueprint §34.6 defines the reaction model and states that a reply "triggers the sender notification (\\"Mom loved your video ❤️\\") and is copied into the sender\'s vault as a memory". Section §14.1 calls the opened notification "the single most valuable notification the product sends".',
                  why: 'Blueprint §24.2 identifies this as a product improvement over the original concept: "In the existing concept, delivery is the end. Making it two-way converts a one-way broadcast into a relationship, and converts a recipient into a user." It is also the cheapest acquisition mechanism the product has.',
                  out: 'A reply affordance on the unlock page that works without an account, produces a memory in the sender\'s vault, and notifies the sender promptly.',
                  fr: [
                    'Reply kinds: emoji reaction, text, and voice note.',
                    'No account required.',
                    'Text reply works without JavaScript (a plain form post).',
                    'Voice reply requires JavaScript and is offered only where supported.',
                    'The reply is copied into the sender\'s vault as a memory attributed to the recipient.',
                    'Sender notified on reply and on first open.',
                    'Rate-limited per token.',
                  ],
                  tr: [
                    'The text reply path is a server-action-free plain form post so it survives a no-JS visitor.',
                    'Voice reply reuses the PHASE-04 capture and upload path, but the recipient has no session — so the upload must be authorised by the capsule token, with tight limits.',
                    'The created memory is owned by the sender\'s vault but attributed to the recipient in its note.',
                    'Reply content is user input from an unauthenticated party: validate, bound, and never render as markup.',
                  ],
                  impl: [
                    'Implement the emoji reaction as a plain form post with a set of allowed values — no free-form input, so it works everywhere and cannot carry a payload.',
                    'Implement the text reply as a plain form post with a bounded length. **This must work without JavaScript**, which means a route handler rather than a client-invoked action.',
                    'Implement the voice reply behind a capability check. Authorise the upload with the capsule token rather than a session: mint a scoped, single-use upload session with a small size cap and a short expiry. **This is the only place in the product where an unauthenticated party can upload**, so the limits must be tight and explicit.',
                    'On reply, create a memory in the sender\'s vault attributed to the recipient, and link it to the capsule so the detail screen can show it.',
                    'Notify the sender on reply, and separately on first open — the two are different moments and §14.1 lists both.',
                    'Rate-limit replies per token to prevent a leaked link becoming a spam channel.',
                    'Treat every reply field as untrusted: bound the length, strip nothing but render as text, and never allow markup.',
                  ],
                  archDiagram: `recipient (no account)
  ├─ emoji  ──▶ POST form (allow-list values)     ← works without JS
  ├─ text   ──▶ POST form (bounded length)        ← works without JS
  └─ voice  ──▶ capability-gated; token-scoped upload session
                   small size cap · short expiry · single use
                          │
                          ▼
              capsule_replies row
                          │
                          ├─▶ memory created in SENDER'S vault
                          │     attributed to the recipient
                          └─▶ notify sender  ("Ella replied ❤️")

separately: first open ──▶ notify sender  (§14.1 — the most valuable notification)`,
                  files: [
                    'apps/web/src/app/c/[token]/reply/route.ts',
                    'apps/web/src/features/capsule/reply.ts',
                    'apps/web/src/features/capsule/components/ReplyForm.tsx',
                    'apps/web/src/app/api/upload/token-session/route.ts',
                    'apps/web/src/features/capsule/__tests__/reply.test.ts',
                  ],
                  api: {
                    method: 'POST', path: '/c/[token]/reply',
                    req: 'kind=text&body=Thank+you+Dad.+I+watched+it+three+times.',
                    res: '302 → /c/[token]?replied=1',
                    validation: ['Token valid and the capsule delivered', 'Kind in the allowed set', 'Emoji from the allow-list', 'Body within length bounds', 'Rate limit not exceeded'],
                    errors: [
                      ['404', 'CAPSULE_TOKEN_INVALID', 'Unknown, revoked, or not yet delivered'],
                      ['422', 'VALIDATION_FAILED', 'Body too long or emoji not allowed'],
                      ['429', 'RATE_LIMIT_REPLY', 'Too many replies against this token'],
                    ],
                  },
                  rules: [
                    'No account is required to reply.',
                    'Emoji and text replies work without JavaScript.',
                    'The reply becomes a memory in the sender\'s vault, attributed to the recipient.',
                    'The sender is notified on reply and, separately, on first open.',
                    'A token-scoped upload session is single-use, small, and short-lived — it is the only unauthenticated upload path in the product.',
                  ],
                  edge: [
                    'A reply attempted before delivery — rejected, since the capsule is not open.',
                    'A reply to a cancelled capsule — rejected neutrally.',
                    'Several replies from the same recipient — allowed; each becomes a memory, but notifications should be batched to avoid flooding the sender.',
                    'A very long text reply — bounded with a counter where JavaScript is available, and rejected with a clear message where it is not.',
                    'A voice reply on a browser without `MediaRecorder` — the option is absent, not broken.',
                    'A voice reply exceeding the size cap — rejected before upload with a stated limit.',
                    'A leaked link used to spam replies — rate limits contain it; consider notifying the owner of unusual activity.',
                    'A reply containing markup or a script — stored as text and rendered as text; never interpreted.',
                    'A reply arriving while the sender\'s account is deleted — the reply has nowhere to go; handle gracefully and do not error on the recipient\'s side.',
                  ],
                  err: ['A failed reply must not lose the typed text: re-render the form with the content intact, which matters more here than usual because the recipient may be emotional and may not retype.'],
                  sec: [
                    'Reply content is untrusted input from an unauthenticated party — bound it, store it as text, render it as text.',
                    'The token-scoped upload session is tightly limited and single-use.',
                    'Rate-limited per token.',
                    'The created memory must be attributed clearly so the sender knows it came from the recipient, not from themselves.',
                  ],
                  tests: {
                    integration: [
                      '**Text reply posted without JavaScript creates a reply and a memory in the sender\'s vault.**',
                      'Emoji reply restricted to the allow-list.',
                      'Reply before delivery rejected.',
                      'Sender notified on reply and separately on first open.',
                      'Voice reply upload session is single-use and size-capped.',
                      'Rate limit contains repeated replies.',
                      'Markup in a reply is rendered as text.',
                      'Reply to a deleted sender account handled gracefully.',
                    ],
                    a11y: ['axe on the reply form with and without JavaScript; the form has labels and a clear submit.'],
                  },
                  ac: [
                    'All three reply kinds implemented; emoji and text work without JavaScript.',
                    'Reply creates a memory in the sender\'s vault, attributed to the recipient.',
                    'Sender notified on reply and on first open, as separate events.',
                    'Token-scoped upload session is single-use, size-capped, and short-lived.',
                    'Rate limits enforced.',
                    'Reply content stored and rendered as text.',
                    'Failed reply preserves typed content.',
                    'axe clean.',
                  ],
                  notes: [
                    'The token-scoped upload path is the only unauthenticated write of media in the product. Review its limits carefully; it is worth a second reviewer.',
                    'Batch sender notifications for multiple replies so the payoff moment does not become a flood.',
                  ],
                },
              ],
            },
          ],
        },
      ],
    },

    {
      id: 'MOD-05-04', name: 'Private Sharing',
      purpose: 'Share a memory with anyone, revocably, without asking them to sign up.',
      priority: 'critical',
      objective: 'Let a user share one memory without exposing anything else, and take it back instantly.',
      business: ['Blueprint §7.1 M11: "Family will not sign up to see a photo." Without this the archive is a dead end.'],
      functional: ['Create a link with permission, expiry, password, and download flag', 'Public view without an account', 'Instant revocation', 'Who-can-see panel with active links and view counts'],
      ui: ['`/s/[token]` view', 'Share sheet', 'Who-can-see panel per §11.3'],
      backend: ['Share entity', 'Token resolution through authz', 'View counting'],
      db: ['`shares` with RLS and hashed tokens'],
      security: ['`noindex`', 'Short signed-URL TTL bounding post-revocation exposure', 'Optional password'],
      testing: ['Revocation immediacy', 'Expiry', 'Password', 'Download flag', 'noindex'],
      ac: ['Revocation effective on the next request', 'Media exposure after revocation bounded to the signed-URL TTL'],
      trace: ['§11.3', '§7.1 M11'],
      sprints: [
        {
          id: 'SPR-05-04-01', name: 'Share Links & Access Visibility',
          objective: 'Sharing that can be taken back.',
          priority: 'critical', deps: ['SPR-05-01-01'], duration: '~4 days',
          goal: 'A user shares a memory by link, sees who has viewed it, and revokes it in one tap.',
          inScope: ['Share schema', 'Create and revoke', '`/s/[token]` page', 'Who-can-see panel', 'View counting and first-view notification'],
          outScope: ['Shared vaults and albums (Release 2)', 'Comments (Release 2)'],
          approach: ['Reuse the tokenised-page pattern established by `/m/[token]` and `/c/[token]`.'],
          archChanges: ['Completes the Release-1 sharing surface'],
          deliverables: ['Share entity', 'Two UI surfaces', 'Public page'],
          testing: ['Revocation, expiry, password, download flag, noindex'],
          ac: ['Revocation immediate', 'All states designed'],
          dod: ['Who-can-see panel present on every memory'],
          trace: ['§11.3'],
          epics: [
            {
              id: 'EPIC-05-04-01-01', name: 'Share Links & Who-Can-See Panel',
              objective: 'Build revocable share links and make access visible to the owner.',
              value: 'Blueprint §24.1 lists "make privacy visible rather than merely claimed" as a UX improvement over the existing product: "Demonstrated control beats claimed encryption."',
              stories: [
                ['user', 'to send one photo to my mother without her signing up', 'sharing is not a barrier'],
                ['user', 'to see every active link and kill any of them', 'I know exactly who can reach my archive'],
              ],
              functional: ['Create link with options', 'Public view', 'Revoke', 'View count and last viewed', 'First-view notification', 'Active-links list'],
              technical: ['Hashed CSPRNG tokens', 'Signed media minted per request after authz', 'Revocation effective immediately'],
              ui: ['Share sheet', '`/s/[token]`', 'Who-can-see panel'],
              security: ['`noindex`', 'Optional password', 'Download flag enforced by the matrix', 'Rate-limited'],
              testing: ['Revocation, expiry, password, download, noindex, axe'],
              ac: ['Revocation immediate', 'Download flag enforced', 'noindex present'],
              trace: ['§11.3', '§10 Share'],
              tasks: [
                {
                  name: 'Implement Share Link Creation, Public View and Revocation', type: 'fullstack', priority: 'critical',
                  deps: ['TASK-059', 'TASK-055'], trace: ['§10 Share', '§11.3'],
                  obj: 'Create the `shares` entity, the share sheet, the public `/s/[token]` view, and instant revocation.',
                  ctx: 'Blueprint §11.3 specifies the mechanism in detail: 32-byte CSPRNG token stored hashed, permission level, optional expiry, optional password, download flag, view counter, `noindex` headers, and "revocation is immediate... because signed media URLs live 5 minutes, real-world exposure after revocation is bounded to minutes rather than forever".',
                  why: 'This is the feature that keeps the archive from being a dead end — a grandmother will not create an account to see a photograph. It is also where the product\'s privacy claims become concrete: a link that can be killed in one tap, with a bounded exposure window, is a demonstrable control rather than a promise.',
                  out: 'Share links with all documented options, a public view requiring no account, and revocation that takes effect on the next request.',
                  fr: [
                    '`shares` per §10: owner_id, resource_type, resource_id, token_hash, permission, allow_download, password_hash, expires_at, revoked_at, view_count, last_viewed_at.',
                    'Share sheet: permission, expiry, download toggle, optional password.',
                    '`/s/[token]` public view rendering the memory per the granted permission.',
                    'Revocation immediate.',
                    'View counting and last-viewed tracking.',
                    'First-view notification to the owner.',
                  ],
                  tr: [
                    '32-byte CSPRNG token, stored as SHA-256, constant-time comparison.',
                    'Resolution through the `lib/authz` share branch built in TASK-059 — not a separate check.',
                    'Media served via signed URLs minted per request after authz, honouring the download flag.',
                    '`noindex, nofollow, noarchive` headers and `robots.txt` exclusion.',
                    'Rate-limited per token and per IP; share creation limited to 20 per hour (§20.6).',
                  ],
                  impl: [
                    'Write the `shares` schema from §10; generate and read the migration; add RLS scoped by owner.',
                    'Implement create and revoke actions through authz, with the creation rate limit.',
                    'Build the share sheet with permission, expiry, download toggle, and optional password. Default expiry is a product decision — recommend no expiry by default with a prominent option, since a memory shared with family is usually meant to stay. Record the decision.',
                    'Build `/s/[token]` as a server component resolving through the authz share branch. Render per permission; honour the download flag by simply not minting a download URL when it is off.',
                    'Implement the optional password gate as a server-side form post so it works without JavaScript, consistent with the other tokenised pages.',
                    'Increment the view count and record last-viewed on each render, and notify the owner on the **first** view only (§14.1).',
                    'Add `noindex, nofollow, noarchive` headers and the `robots.txt` exclusion.',
                    'Write the revocation test: view successfully, revoke, and assert the next request fails.',
                  ],
                  api: {
                    method: 'GET', path: '/s/[token]',
                    req: '(no body; optional password via form post)',
                    res: 'Server-rendered memory view, or a designed state page',
                    validation: ['Token resolves to an active, unexpired, unrevoked share', 'Password matches when set', 'Permission covers the requested view'],
                    errors: [
                      ['404', 'SHARE_TOKEN_INVALID', 'Unknown, revoked, or expired — indistinguishable'],
                      ['401', 'SHARE_PASSWORD_REQUIRED', 'Password gate not satisfied'],
                      ['429', 'RATE_LIMIT_SHARE_VIEW', 'Too many attempts against this token'],
                    ],
                  },
                  files: [
                    'packages/db/src/schema/share.ts',
                    'packages/db/migrations/0012_shares.sql',
                    'apps/web/src/app/s/[token]/page.tsx',
                    'apps/web/src/features/sharing/actions.ts',
                    'apps/web/src/features/sharing/components/ShareSheet.tsx',
                    'apps/web/src/features/sharing/__tests__/share.test.ts',
                  ],
                  rules: [
                    'Resolution goes through the `lib/authz` share branch, never a parallel check.',
                    'Revocation is effective on the next request.',
                    'The download flag is enforced by not minting a download URL.',
                    '`noindex, nofollow, noarchive` — a shared memory must never be indexed (§11.3).',
                    'Revoked and expired are indistinguishable from unknown.',
                  ],
                  edge: [
                    '**Revoke while a viewer has the page open — the next media request fails, and exposure is bounded by the five-minute signed-URL TTL.** Test both halves.',
                    'An expired share — designed state offering "ask for a new link".',
                    'A password-protected share opened without JavaScript — the form post path must work.',
                    'A share whose memory was deleted — neutral state, not an error.',
                    'A share on a memory that is also in a sealed capsule — the share is independent and must not leak the capsule\'s existence.',
                    'A link posted publicly and hit thousands of times — rate limits contain it, and the owner should be able to see the view count and react.',
                    'A viewer with the download flag off attempting a direct media URL — denied by the matrix at the minting endpoint.',
                    'Several shares on the same memory with different permissions — each resolves independently.',
                  ],
                  err: ['Every failure is a designed page. Unknown, revoked, and expired render the same neutral state to avoid disclosure.'],
                  sec: [
                    'Hashed tokens, constant-time comparison.',
                    '`noindex` plus `robots.txt` exclusion.',
                    'Post-revocation exposure bounded by the signed-URL TTL — assert this in the test rather than assuming it.',
                    'Rate limits on both view and creation.',
                    'The share must not reveal anything about the vault beyond the shared resource.',
                  ],
                  tests: {
                    integration: [
                      '**View, revoke, then the next request fails.**',
                      'Expired share renders the designed state.',
                      'Password gate works without JavaScript.',
                      'Download flag off means no download URL is minted.',
                      'First view notifies the owner; subsequent views do not.',
                      'Deleted memory renders a neutral state.',
                      'Share creation rate limit enforced.',
                    ],
                    security: [
                      '`noindex` headers present and the path excluded in `robots.txt`.',
                      'Response discloses nothing about the vault beyond the shared memory.',
                      'Post-revocation media exposure bounded to the signed-URL TTL.',
                    ],
                    a11y: ['axe on the public view and the share sheet.'],
                  },
                  ac: [
                    'Share entity created with RLS and hashed tokens.',
                    'Share sheet supports permission, expiry, password, and download flag.',
                    'Public view works without an account and without JavaScript for the password path.',
                    '**Revocation effective on the next request, with bounded media exposure, both proven by test.**',
                    'View counting and first-view notification working.',
                    '`noindex` and `robots.txt` exclusion verified.',
                    'Default-expiry decision recorded in §20.',
                    'axe clean.',
                  ],
                  notes: ['Reuse the tokenised-page shape from `/m/[token]` and `/c/[token]`. Three pages with the same structure is a feature; three different structures is a maintenance problem.'],
                },
                {
                  name: 'Build Who-Can-See Panel with Active Links and Access Log', type: 'frontend', priority: 'high',
                  deps: ['TASK-067'], trace: ['§11.3', '§11.5', '§24.1'],
                  obj: 'Build the per-memory "who can see this" panel and the account-level active-links list, both with one-tap revocation.',
                  ctx: 'Blueprint §11.3 requires that "the owner sees a live list of every active link, its view count, and when it was last opened, and can kill any of them in one tap". Section §24.1 frames this as a competitive improvement: making privacy visible rather than merely claimed.',
                  why: 'Blueprint §24.1 puts it directly: "The existing site *asserts* \'256-bit AES\' and \'bank-level security\'. The new product shows a live panel, an access log the user can read, and one-tap revocation. Demonstrated control beats claimed encryption — and it is honest, which the current copy is not quite."',
                  out: 'A panel on every memory answering "who can reach this", and a settings screen listing every active link across the account, both allowing immediate revocation.',
                  fr: [
                    'Per-memory panel: vault members with roles, active share links with view counts, and capsule recipients with delivery state.',
                    'One-tap revoke per link.',
                    'Account-level active-links list in privacy settings.',
                    'Access log showing who viewed what and when, at country granularity.',
                    'Empty state when nothing is shared.',
                  ],
                  tr: [
                    'The panel reads through the sharing and capsule modules\' public queries (ADR-004).',
                    'Revocation is optimistic with rollback on failure, since the user expects it to be instant.',
                    'The access log is sourced from the PHASE-08 `AuditLog`; until that lands, source from share view counts and capsule opens, and note the handoff.',
                  ],
                  impl: [
                    'Build the panel as a sheet opened from the memory overflow menu, listing three groups: members, links, and capsule recipients.',
                    'For each link show the permission, expiry, view count, last viewed, and a revoke action.',
                    'For each capsule recipient show the delivery and open state, and make clear that a delivered capsule cannot be un-delivered — §11.4 states this honestly and the UI should too.',
                    'Implement optimistic revocation with rollback, and a confirmation for links that have been viewed (since revoking one someone is using is a more consequential act).',
                    'Build the account-level list in privacy settings, grouped by memory, with the same actions.',
                    'Render the access log at country granularity — enough to be meaningful, not enough to be creepy about a family member\'s location.',
                    'Write the empty state warmly: nothing shared is the default and should not read as a deficiency.',
                  ],
                  files: [
                    'apps/web/src/features/sharing/components/WhoCanSeePanel.tsx',
                    'apps/web/src/features/sharing/components/ActiveLinksList.tsx',
                    'apps/web/src/app/(app)/settings/privacy/page.tsx',
                    'apps/web/src/features/sharing/queries.ts',
                    'apps/web/src/features/sharing/__tests__/who-can-see.test.tsx',
                  ],
                  ui: `**Per-memory panel** — three groups, plainly labelled:

${'```'}
Who can see this

In your vault
  You (owner)

Links
  View only · no expiry · 4 views · last opened 2 days ago      [revoke]

Capsule recipients
  Ella Sharma · delivered 4 Jun 2044 · opened
    A delivered capsule cannot be taken back.
${'```'}

The honest line about delivered capsules matters: §11.4 says retracting a delivered gift "is not a coherent promise", and the UI should say so rather than implying more control than exists.

**Account-level list** in privacy settings, grouped by memory, same actions.

**Access log** — country granularity only.

**Empty state** — "Nothing is shared. Only you can see your memories."`,
                  rules: [
                    'The panel tells the truth, including that a delivered capsule cannot be recalled (§11.4).',
                    'Revocation is one tap, with a confirmation only for links that have been viewed.',
                    'The access log is country-granular, not precise location.',
                    'Nothing shared is the default state and reads as reassuring, not empty.',
                  ],
                  edge: [
                    'A memory with twelve active links — group and paginate rather than a wall.',
                    'A link revoked from another device while the panel is open — revalidate and reflect it.',
                    'A capsule recipient not yet delivered — show that content is not yet visible to them, which is a reassurance worth stating.',
                    'A revocation that fails — roll back the optimistic state and explain.',
                    'A member whose access came via a shared vault (Release 2) — the panel must be extensible to that source without a redesign.',
                    'An access log with no entries — say so plainly rather than showing an empty table.',
                    'A very long list at account level — group by memory and paginate.',
                  ],
                  err: ['A failed revocation must be unmistakable, because the user believes access is gone. Roll back the UI and say what happened.'],
                  sec: ['Owner-only.', 'The access log must not expose a viewer\'s precise location or IP.'],
                  tests: {
                    component: [
                      'Panel renders all three groups with correct states.',
                      'Delivered capsule shows the honest cannot-be-recalled line.',
                      'Revocation is optimistic and rolls back on failure.',
                      'Viewed links require confirmation to revoke.',
                      'Empty state reads as reassuring.',
                    ],
                    e2e: ['Share a memory, view it in another context, open the panel, see the view count, revoke, and confirm the link stops working.'],
                    a11y: ['axe; revoke actions have accessible names naming what they revoke.'],
                  },
                  ac: [
                    'Per-memory panel and account-level list both implemented, all five states, both themes.',
                    'One-tap revocation with optimistic update and rollback.',
                    'Delivered-capsule honesty line present.',
                    'Access log at country granularity.',
                    'Extensible to shared-vault membership without redesign.',
                    'Empty state reassuring.',
                    'axe clean.',
                  ],
                  notes: ['This panel is the product\'s privacy claim made concrete. The honest line about delivered capsules is more valuable than a comfortable one.'],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
