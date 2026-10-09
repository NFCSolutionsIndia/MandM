# PHASE-02 — Identity, Authorization & Onboarding

[← Development Index](../DEVELOPMENT_INDEX.md) · [Project Plan](../00_PROJECT_PLAN.md) · [Blueprint](../../../MM_PWA_BLUEPRINT.md)

## Phase Metadata

| Field | Value |
|---|---|
| Phase ID | PHASE-02 |
| Phase name | Identity, Authorization & Onboarding |
| Release | Release 1 |
| Phase objective | Establish who a user is, what they may reach, and give them a first session that ends somewhere meaningful. |
| Business objective | Nothing in the product is reachable without an account, and the first three minutes decide whether a user ever returns. |
| Technical objective | Passwordless auth, opaque revocable sessions, the `lib/authz` chokepoint, scope enforcement, the vault entity, and a three-step onboarding. |
| Priority | critical |
| Status | pending |
| Dependencies | PHASE-01 |
| Estimated effort | ~2.5 weeks |
| Modules | 3 |
| Sprints | 4 |
| Epics | 6 |
| Tasks | 13 |
| Expected outcome | A user can sign up, verify, complete onboarding, and land in an empty app — and every read and write in the system already passes through a tested authorization chokepoint. |

---

## 1. Phase Purpose

Two things happen in this phase, and the second matters more than it looks.

The first is ordinary: passwordless authentication, sessions, and onboarding.

The second is that **`lib/authz` is built here, before a single memory exists.** Blueprint §20.2 and ADR-009 make it the single chokepoint through which every read and write resolves the actor to a vault role, an active share, or a delivered capsule recipient. Gap analysis R-2 ranks a cross-tenant leak as one of two critical risks in the product. Authorization retrofitted onto existing content is how that leak happens; authorization built first, with a test per permission-matrix cell, is how it does not.

The phase also settles a question the blueprint leaves open (gap G-1): what happens when a user loses their only passkey *and* access to their email. A lifetime vault needs an answer that is neither "you lose everything" nor "call support and they'll let you in".

---

## 2. Phase Goals

- A user can create an account with an email code and no password.
- A user can add a passkey and sign in with biometrics on a supported device.
- A session can be revoked from another device and stops working immediately.
- Every data access in the codebase routes through `lib/authz`, enforced by review and by the absence of any other path.
- The blueprint §11.2 permission matrix is encoded as an executable table with a test per cell.
- scope enforcement exist for every table created in this phase.
- Onboarding reaches a meaningful first action in under three minutes.

---

## 3. Features Delivered

- Email OTP signup and login.
- Passkey registration and login (WebAuthn).
- Google and Apple OAuth.
- Opaque server-side sessions with a device list and instant revocation.
- Mobile number and email verification, with a documented "verify later" grace state.
- Account recovery path resistant to social engineering.
- Personal vault auto-created at signup.
- `lib/authz` chokepoint plus tenant isolation.
- Three-step onboarding with a personalization quiz that has real consequences.

---

## 4. Architecture Impact

- Introduces the authentication realm and the session contract every later request depends on.
- Introduces `lib/authz` — the single most security-critical module in the system (ADR-009).
- Introduces the `Vault` / `VaultMember` ownership root that every content query is scoped by.
- Applies the scope convention established in PHASE-01 to the first real tables: scope column, index, repository module, matrix cells.
- Introduces application-level rate limiting (ADR-011) ahead of the edge rules added in PHASE-09.

---

## 5. Modules

| Module | Name | Objective | Priority | Status |
|---|---|---|---|---|
| [MOD-02-01](module-01/MOD-02-01.md) | Authentication & Sessions | Let a user prove who they are with the least friction compatible with holding their family archive for decades — and let them take that access away from a lost device. | critical | pending |
| [MOD-02-02](module-02/MOD-02-02.md) | Authorization Chokepoint & Vault Ownership | Guarantee that every read and write in the system resolves through one tested authorization function, with the four compensating controls of ADR-009 as the substitute for row-level security. | critical | pending |
| [MOD-02-03](module-03/MOD-02-03.md) | Onboarding & Personalization | Learn just enough to make the first memory feel personal, and ensure the quiz answers change real behaviour rather than being decorative. | high | pending |

---

## 6. Phase Dependencies

**Prerequisite phases:** PHASE-01

- **PHASE-01** must be complete: migrations, shared enums, form primitives, and the app shell are all prerequisites.
- **External:** Google and Apple OAuth applications registered; a transactional email sender configured (Resend) with a verified domain.
- **Technical:** the `@mm/shared` error registry must already contain the non-enumerating auth codes.

---

## 7. Phase Deliverables

- Auth, session, vault, and membership schema scoped through `lib/authz`.
- `lib/authz` with the permission matrix encoded and one test per cell.
- Signup, login, verification, reset, and onboarding screens.
- Device and session management UI.
- A written account-recovery policy committed alongside the code.

---

## 8. Phase Acceptance Criteria

- [ ] A new user completes signup, verification, and onboarding on a real mobile device.
- [ ] A passkey created on a device signs that user in on a later visit.
- [ ] Revoking a session from one device causes the other to be signed out on its next request.
- [ ] Every cell of the §11.2 permission matrix has a passing test; deliberately inverting one cell fails CI.
- [ ] Attempting to read another user's vault fails at both the `authz` layer and the tenant isolation layer, verified independently.
- [ ] Rate limits on OTP issue and verification are enforced and observable.

---

## 9. Phase Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Authorization gaps that only appear once content exists | critical | `lib/authz` built before content; matrix test per cell; the four compensating controls of ADR-009 as the substitute for row-level security; a negative-path E2E in PHASE-09 attempts every cross-tenant read. |
| Passwordless lockout — user loses passkey and email access | high | Gap G-1 addressed by an explicit recovery task with a written, abuse-resistant policy. Multiple sign-in factors offered at signup rather than one. |
| OTP abuse and SMS/email cost | medium | Per-email and per-IP rate limits with lockout, plus CAPTCHA after repeated failures. |
| Account enumeration through error copy | medium | Non-enumerating codes in the shared registry; a test asserting the reset and login responses are identical for existing and non-existing accounts. |
| Onboarding quiz that changes nothing, becoming theatre | low | The quiz answer maps to concrete notification defaults; a test asserts the mapping. |

---

## 10. Phase Completion Checklist

- [ ] All modules completed
- [ ] All sprints completed
- [ ] All epics completed
- [ ] All tasks completed
- [ ] All required tests written and passing
- [ ] Acceptance criteria satisfied
- [ ] A stakeholder can create an account on their own phone and reach the empty Home screen
- [ ] [PROJECT_PROGRESS.md](../PROJECT_PROGRESS.md) updated

---

## Blueprint Traceability

- `§20.1`
- `§20.2`
- `§11.1`
- `§11.2`
- `§29.2`
- `§29.3`
- `§29.4`
- `§29.5`
- `§29.6`
- `ADR-008`
- `ADR-009`
