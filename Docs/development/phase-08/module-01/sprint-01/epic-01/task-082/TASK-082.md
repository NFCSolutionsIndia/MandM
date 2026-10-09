# TASK-082 — Build Privacy Centre with Access Log, App Lock and Vault PIN

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-082 |
| Phase | [PHASE-08 — Privacy, Data Rights, Billing, Trust & Safety, Admin](../../../../PHASE-08.md) |
| Module | [MOD-08-01 — Privacy Centre, Audit Log & App Lock](../../../MOD-08-01.md) |
| Sprint | [SPR-08-01-01 — Audit Log, Access Visibility & App Lock](../../SPR-08-01-01.md) |
| Epic | [EPIC-08-01-01-01 — Audit Log & User-Visible Access Log](../EPIC-08-01-01-01.md) |
| Type | fullstack |
| Priority | high |
| Status | pending |
| Dependencies | `TASK-081`, `TASK-023` |
| Blueprint refs | `§29.10`, `§11.5`, `§24.1` |

---

## 1. Objective

Build the privacy settings screen: default visibility, active links, the user-visible access log, WebAuthn app lock, and a vault PIN.

---

## 2. Context

Blueprint §29.10 lists the contents of Privacy & Security, and §24.1 frames the access log as a competitive differentiator: showing the receipts rather than claiming encryption.

---

## 3. Problem Statement

The app lock has a specific and slightly unusual justification in this product: blueprint §2.1 notes it protects "intimate content on a shared or family device". A family tablet is a genuinely common context here, and a locked vault on it is meaningfully different from account-level auth.

---

## 4. Expected Outcome

A privacy screen where a user can set defaults, see and revoke every share, read who accessed what, and lock the app behind a biometric with a PIN fallback.

---

## 5. Requirements

### Functional Requirements

- Default per-memory visibility setting.
- Active share links list with revoke (reusing the PHASE-05 component).
- Access log at country granularity, grouped and paginated.
- WebAuthn app lock with a configurable timeout.
- Vault PIN as a fallback and for devices without a platform authenticator.
- Blocked users list.
- AI-processing opt-out placeholder, clearly marked as Release 2.

### Technical Requirements

- App lock reuses the PHASE-02 WebAuthn verification function, which was built to be reusable outside login.
- Lock state is per device and survives a reload; it must not be defeatable by clearing a client flag, so re-verification gates a server-side session capability.
- PIN stored hashed with a slow KDF and rate-limited.
- Access log rendered from the audit log, filtered to entries about the user's own resources.

---

## 6. Implementation Instructions

1. Build the settings screen with the sections from §29.10.
2. Implement the default-visibility setting and make the create flow read it.
3. Mount the PHASE-05 active-links component here for account-wide management.
4. Build the access log view: grouped by day, actor described in human terms ("You", "Ella via a share link", "M&M system"), country granularity only, with a plain explanation of what is and is not recorded.
5. Implement the app lock: on resume past the timeout, require WebAuthn re-verification. **Gate a server-side session capability rather than a client flag**, so the lock cannot be bypassed by editing local storage.
6. Implement the vault PIN with a slow KDF, rate limiting, and lockout — it is a fallback, so it must not be the weak link.
7. Build the blocked-users list (populated by MOD-08-04).
8. Add the AI-processing opt-out control, disabled and labelled as Release 2, since §11.6 promises it and it should be visible as a commitment. **Or omit it entirely** — decide, and prefer omission if a disabled control would read as broken (§28.4).

---

## 7. Architecture

```text
Clients: iOS (Swift) · Android (Kotlin) · web (marketing, /c/[token], admin)
  ↓ /api/v1
lib/authz  ← every read and write passes here
  ↓
feature service (src/features/*)
  ↓ Drizzle
PostgreSQL + RLS   R2 (media, private, signed URLs only)
  ↑
apps/workers (delivery engine, media pipeline)
```


---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

```text
apps/<ios|android>/features/settings/privacy/page.tsx
apps/<ios|android>/features/settings/security/page.tsx
apps/api/src/features/privacy/components/AccessLog.tsx
apps/api/src/features/privacy/components/AppLockSettings.tsx
apps/api/src/features/privacy/app-lock.ts
apps/api/src/features/privacy/pin.ts
apps/api/src/features/privacy/__tests__/app-lock.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

**Access log** — human-readable, not raw rows:

```
Today
  You opened "Ella's first steps"                    2:14 pm
  Ella opened a shared link                          9:02 am · India
Yesterday
  M&M delivered a capsule to Ravi                    9:00 am
```

With a plain line beneath: "We record when your memories are opened, and by whom. We do not record precise locations."

**App lock** — toggle plus timeout selector. On resume: a full-screen lock with the biometric prompt and a "use PIN instead" option.

---

## 12. Business Rules

- The access log shows country granularity only — precise location on a family member would be creepy and serves no purpose.
- The app lock gates a server-side capability, not a client flag.
- The PIN is rate-limited and slow-hashed.
- A control for an unbuilt feature is omitted, not disabled (§28.4).

---

## 13. Edge Cases

- A device with no platform authenticator — PIN only; the biometric option must be absent, not broken.
- App lock enabled then the passkey removed — the PIN must still work, or the user is locked out of their own vault.
- Forgotten PIN — must fall back to full re-authentication, not to nothing; this is a lock, not a second account barrier.
- Lock triggering mid-upload — the upload must continue in the background; a lock is not a stop.
- A very long access log — paginate; group by day.
- An access log entry for a deleted memory — show the action with the memory marked as deleted rather than hiding it.
- Lock timeout of zero (lock immediately) — allowed, but warn that it applies on every resume.

---

## 14. Error Handling

- A failed lock verification must not lock the user out permanently; PIN and full re-auth are both escape paths.

---

## 15. Security Considerations

- The lock must not be bypassable by clearing client storage — hence the server-side capability.
- PIN attempts rate-limited with lockout.
- The access log must not expose IPs or precise locations.

---

## 16. Testing Requirements

### Integration Tests

- **Clearing client storage does not bypass the app lock.**
- PIN fallback works when the passkey is removed.
- PIN attempts are rate-limited and lock out.
- Lock during an upload does not stop the upload.
- Default visibility is honoured by the create flow.

### Component Tests

- Access log renders human-readable actors and country-only location.
- Biometric option absent without a platform authenticator.

### Accessibility Tests

- axe on both screens and the lock screen; the lock screen is operable by keyboard.

---

## 17. Acceptance Criteria

- [ ] Privacy and security screens implemented per §29.10.
- [ ] Access log human-readable, country granularity, with an honest explanation.
- [ ] **App lock cannot be bypassed client-side, proven by test.**
- [ ] PIN fallback works and is rate-limited.
- [ ] Lock does not interrupt uploads.
- [ ] Default visibility honoured.
- [ ] Unbuilt AI control omitted rather than disabled.
- [ ] axe clean.

---

## 18. Definition of Done

- [ ] Implementation complete and matches §4 Expected Outcome
- [ ] Tests from §16 implemented
- [ ] All tests passing locally and in CI
- [ ] Error handling from §14 implemented
- [ ] Security considerations from §15 satisfied
- [ ] All §17 acceptance criteria verified
- [ ] Lint and typecheck clean (`pnpm lint`, `pnpm typecheck`)
- [ ] No regression in existing tests
- [ ] Status updated to `completed` in §22 and in [PROJECT_PROGRESS.md](../../../../../PROJECT_PROGRESS.md)

---

## 19. Dependencies

```text
TASK-081
    ↓
TASK-023
    ↓
TASK-082
```


---

## 20. Implementation Notes

- The family-tablet scenario is the real use case for the app lock. Test it: one household, one device, two people who should not see each other's vaults.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-08-01-01-01](../EPIC-08-01-01-01.md).
3. Read the parent Sprint — [SPR-08-01-01](../../SPR-08-01-01.md).
4. Read the parent Module — [MOD-08-01](../../../MOD-08-01.md).
5. Read the parent Phase — [PHASE-08](../../../../PHASE-08.md).
6. Read the relevant blueprint sections: `§29.10`, `§11.5`, `§24.1` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
7. Read [ARCHITECTURE_DECISIONS.md](../../../../../ARCHITECTURE_DECISIONS.md) and confirm the choices this task depends on.
8. **This Next.js release has breaking changes from earlier conventions — read the relevant guide in `node_modules/next/dist/docs/` before writing framework code** (project `AGENTS.md`).

While implementing:

9. Implement **only** the scope of this task. Do not opportunistically refactor unrelated code.
10. Do not modify files owned by other tasks unless this task's §8 lists them.
11. Create or update the tests named in §16.
12. Run `pnpm lint`, `pnpm typecheck`, and the relevant test command.
13. Verify every §17 acceptance criterion explicitly, one at a time.

After implementing:

14. Update §22 of this document to `completed`.
15. Update the counts in [PROJECT_PROGRESS.md](../../../../../PROJECT_PROGRESS.md).
16. Report which acceptance criteria were verified and how.

**Do not mark this task `completed` until every §17 acceptance criterion has been verified.** If a criterion cannot be met, leave the status as `progress` and record the blocker in §20.

---

## 22. Completion Status

```text
pending
```

Allowed statuses: `pending` · `progress` · `completed`
