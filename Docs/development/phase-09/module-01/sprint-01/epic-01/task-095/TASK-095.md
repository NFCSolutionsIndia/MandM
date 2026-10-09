# TASK-095 — Implement CSP with Nonces, Security Headers and Edge Rate Limits

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-095 |
| Phase | [PHASE-09 — Hardening — Security, Accessibility, Performance & Resilience](../../../../PHASE-09.md) |
| Module | [MOD-09-01 — Security Assurance](../../../MOD-09-01.md) |
| Sprint | [SPR-09-01-01 — Authorization Assurance & Platform Security](../../SPR-09-01-01.md) |
| Epic | [EPIC-09-01-01-01 — Authorization & Tenant-Isolation Assurance](../EPIC-09-01-01-01.md) |
| Type | devops |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-002`, `TASK-019` |
| Blueprint refs | `§20.3`, `§20.6`, `ADR-011` |

---

## 1. Objective

Complete the platform security controls deferred from PHASE-01: a strict CSP with nonces, the full header set, and edge rate limiting in front of the application limits.

---

## 2. Context

PHASE-01 set baseline headers with a permissive CSP and a TODO referencing this phase. Blueprint §20.3 requires "a strict CSP with nonces, `frame-ancestors 'none'`, and `object-src 'none'`", and §20.6 specifies the full rate-limit table.

---

## 3. Problem Statement

CSP was deferred deliberately because a strict policy written before the app exists blocks development. Now that every script and style source is known, the policy can be tight — and a tight CSP is one of the few controls that turns a whole class of injection bugs into a non-event.

---

## 4. Expected Outcome

A strict nonce-based CSP with no `unsafe-inline` for scripts, the complete header set, and edge rate limits complementing the application-level ones.

---

## 5. Requirements

### Functional Requirements

- CSP with per-request nonces for scripts; `object-src 'none'`; `frame-ancestors 'none'`; `base-uri 'self'`.
- HSTS with preload, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` limiting camera and microphone to same-origin.
- Edge rate limits at Cloudflare per the §20.6 table.
- CSP violation reporting to an endpoint, monitored.
- Dependency audit and secret scanning confirmed in the blocking gate.

### Technical Requirements

- Nonces generated per request and threaded into the framework's script tags — this requires the documented approach for this Next.js release; **read `node_modules/next/dist/docs/` before implementing.**
- `unsafe-inline` is not acceptable for scripts. If a required inline script exists (the theme-flash script from PHASE-01), it must carry the nonce.
- Edge limits are the outer layer; the database-backed application limits remain (ADR-011).
- The report-only mode runs first, so violations are found before enforcement breaks the app.

---

## 6. Implementation Instructions

1. **Run CSP in report-only mode first**, collect violations across the whole app for a period, and fix them before enforcing. Enforcing a guessed policy breaks production in ways that are hard to attribute.
2. Implement nonce generation per request and attach it to script tags, including the PHASE-01 theme-flash inline script.
3. Set the remaining headers. `Permissions-Policy` must allow camera and microphone same-origin, since capture depends on them — verify capture still works after enforcement.
4. Configure edge rate limits per §20.6: auth 5/min, OTP 3 per 15 min per email, upload sessions 60/min, signed-URL minting 300/min, share creation 20/hour, capsule sealing 50/day.
5. Add a CSP report endpoint and monitor it; a spike after a deploy usually means a newly-added third-party resource.
6. Confirm dependency audit and secret scanning are in the blocking gate from PHASE-01.
7. Re-run the full E2E suite after enforcement, since CSP breakages surface as silent script failures.

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
apps/site/src/middleware.ts  (nonce + CSP)
apps/site/next.config.ts  (headers)
apps/site/src/app/api/csp-report/route.ts
infra/cloudflare/rate-limits.md
apps/site/src/__tests__/security/headers.test.ts
```

---

## 9. Data Model

_No data-model change in this task._

---

## 10. API Contract

_No API surface in this task._

---

## 11. UI/UX Specification

_No user-facing surface in this task._

---

## 12. Business Rules

- **No `unsafe-inline` for scripts.** Inline scripts carry a nonce or do not exist.
- Report-only first, enforcement second.
- Camera and microphone allowed same-origin only — capture must still work.
- Edge limits complement, not replace, application limits.

---

## 13. Edge Cases

- The theme-flash inline script from PHASE-01 — must carry the nonce, or dark mode breaks on first paint.
- Google Fonts, if used — must be allowed explicitly in `font-src` and `style-src`.
- A third-party script added later without a CSP update — the report endpoint catches it; monitor after every deploy.
- HLS playback and blob URLs — `media-src` must permit blob and the storage origin.
- Web surfaces only: CSP `worker-src` no longer applies to the apps.
- A CSP breaking only in production because of a differing script source — the report-only period must run in a production-like environment.
- Rate limits triggering for a legitimate heavy user scrolling a large gallery — batched minting should prevent it; verify with the PHASE-03 benchmark account.

---

## 14. Error Handling

- A CSP violation must be reported, not silently swallowed. A rate-limit response must carry `Retry-After` and the UI must back off.

---

## 15. Security Considerations

- CSP is one of the highest-leverage controls available; a permissive one is close to worthless.
- Rate limits at the edge protect the origin from load the application limits would still absorb.

---

## 16. Testing Requirements

### E2E Tests

- **Full E2E suite passes with CSP enforced** — including capture, HLS playback, and background-sync registration.

### Security Tests

- CSP enforced with a nonce; no `unsafe-inline` for scripts.
- All required headers present on every route class.
- `Permissions-Policy` permits camera and microphone same-origin, and capture works.
- Each §20.6 rate limit enforced with `Retry-After`.

---

## 17. Acceptance Criteria

- [ ] Report-only period completed and violations fixed before enforcement.
- [ ] Strict CSP enforced with nonces and no script `unsafe-inline`.
- [ ] Full header set verified on every route class.
- [ ] Capture, HLS, and the background sync layer all still work under CSP.
- [ ] All §20.6 edge limits configured and verified.
- [ ] CSP report endpoint live and monitored.
- [ ] E2E suite green with CSP enforced.

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
TASK-002
    ↓
TASK-019
    ↓
TASK-095
```


---

## 20. Implementation Notes

- Read the current Next.js documentation for nonce handling before implementing. This is one of the areas where the approach has changed between releases.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-09-01-01-01](../EPIC-09-01-01-01.md).
3. Read the parent Sprint — [SPR-09-01-01](../../SPR-09-01-01.md).
4. Read the parent Module — [MOD-09-01](../../../MOD-09-01.md).
5. Read the parent Phase — [PHASE-09](../../../../PHASE-09.md).
6. Read the relevant blueprint sections: `§20.3`, `§20.6`, `ADR-011` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
