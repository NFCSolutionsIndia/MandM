# PHASE-09 — Hardening — Security, Accessibility, Performance & Resilience

[← Development Index](../DEVELOPMENT_INDEX.md) · [Project Plan](../00_PROJECT_PLAN.md) · [Blueprint](../../../MM_PWA_BLUEPRINT.md)

## Phase Metadata

| Field | Value |
|---|---|
| Phase ID | PHASE-09 |
| Phase name | Hardening — Security, Accessibility, Performance & Resilience |
| Release | Release 1 |
| Phase objective | Prove the system is safe, usable by everyone, fast enough on a cheap phone, and recoverable. |
| Business objective | This product's failure modes are privacy incidents and broken promises. Both are cheaper to prevent here than to survive later. |
| Technical objective | Permission-matrix and tenant-isolation assurance, an IDOR-focused external penetration test, CSP and rate-limit completion, full-path E2E including offline and install, WCAG 2.2 AA audit, a device lab, load testing, a restore drill, and delivery failure injection. |
| Priority | critical |
| Status | pending |
| Dependencies | PHASE-08 |
| Estimated effort | ~3 weeks |
| Modules | 3 |
| Sprints | 3 |
| Epics | 3 |
| Tasks | 7 |
| Expected outcome | A signed-off security review, an accessibility audit, a verified restore, a tested paging alert, and a measured performance baseline. |

---

## 1. Phase Purpose

Blueprint §21 Phase 9 is blunt about this: **"do not skip; this product's failure modes are privacy incidents."**

The gap analysis ranks two risks as critical, and both are verified here rather than assumed:

**R-1, the delivery guarantee not actually being durable.** PHASE-05 built the mechanism. This phase injects the failures — a lost job row, a crashed worker mid-delivery, a corrupted media checksum — and confirms the watchdog and the sweep catch every one.

**R-2, a cross-tenant data leak.** PHASE-02 built the chokepoint and the matrix tests. This phase adds the adversarial half: an external penetration test focused specifically on IDOR and token handling, plus a negative-path suite that attempts every cross-tenant read through every endpoint.

The other three strands are less dramatic and equally necessary. WCAG 2.2 AA is binding (§26.8), and grandparents are core users rather than an edge case. The performance baseline recorded in PHASE-03 becomes a regression gate. And the restore drill exists because, as §12.6 puts it, "a backup nobody has restored is a rumour".

---

## 2. Phase Goals

- Every permission-matrix cell and scope enforcement is covered by a passing test, and inverting any one fails CI.
- An external penetration test focused on IDOR and token handling finds no exploitable cross-tenant access.
- The full critical path passes E2E, including offline and install flows.
- Zero serious or critical axe violations on every shipped screen, verified with a screen reader on real devices.
- A restore from backup is executed and documented, with measured RTO and RPO.
- Injected delivery failures are caught by the watchdog and the integrity sweep.

---

## 3. Features Delivered

- Permission-matrix and tenant-isolation assurance suite.
- IDOR and token-handling negative-path suite plus an external pen test.
- CSP with nonces, complete security headers, and edge rate limits.
- Critical-path, offline, and install E2E suites.
- WCAG 2.2 AA audit with a screen-reader pass.
- Device-lab matrix.
- Load test on upload and signed-URL minting.
- Restore drill and runbooks.
- Delivery failure injection.

---

## 4. Architecture Impact

- Adds the CSP with nonces that PHASE-01 deliberately deferred.
- Adds edge rate limiting in front of the application-level limits (ADR-011).
- Establishes the performance and accessibility regression gates every later release inherits.

---

## 5. Modules

| Module | Name | Objective | Priority | Status |
|---|---|---|---|---|
| [MOD-09-01](module-01/MOD-09-01.md) | Security Assurance | Convert the security design into verified properties, and close the platform-level controls deferred from PHASE-01. | critical | pending |
| [MOD-09-02](module-02/MOD-09-02.md) | Quality, Accessibility & Performance | Cover the critical path end to end, meet WCAG 2.2 AA in practice rather than on paper, and hold the performance baseline. | critical | pending |
| [MOD-09-03](module-03/MOD-09-03.md) | Resilience & Operational Readiness | Verify backups restore, load is survivable, and every delivery failure mode is caught. | critical | pending |

---

## 6. Phase Dependencies

**Prerequisite phases:** PHASE-08

- **PHASE-08** must be complete: admin and break-glass paths are part of the security surface under test.
- **External:** a penetration-testing vendor, a device lab or physical devices, and a staging environment that mirrors production.

---

## 7. Phase Deliverables

- Assurance suites
- Pen-test report and remediations
- CSP and rate limits
- E2E suites
- Accessibility audit
- Load-test results
- Restore-drill record
- Runbooks

---

## 8. Phase Acceptance Criteria

- [ ] Inverting one permission-matrix cell fails CI — demonstrated and reverted.
- [ ] tenant isolation independently blocks every cross-tenant read with the application layer bypassed.
- [ ] Pen-test findings are triaged, with all high and critical items remediated or formally accepted.
- [ ] CSP is enforced with nonces and no `unsafe-inline` for scripts.
- [ ] axe reports zero serious or critical violations across every shipped screen.
- [ ] A restore from backup is completed and documented with RTO and RPO.
- [ ] An injected missed unlock pages a human within the alerting window.

---

## 9. Phase Risks

| Risk | Impact | Mitigation |
|---|---|---|
| A finding discovered too late to fix before launch | high | Run the pen test at the start of the phase, not the end, so remediation has time. Book the vendor during PHASE-08. |
| Accessibility treated as a checklist rather than a usability property | medium | A screen-reader pass on real devices by someone who uses one regularly, not only automated axe runs. |
| Performance regressions from real media | medium | Re-run the PHASE-03 benchmark with real media (PHASE-04 changed the numbers) and set the gate from the new measurement. |
| A restore drill that is rehearsed rather than real | high | Restore into a clean environment from actual backups, without operator shortcuts, and measure honestly. |

---

## 10. Phase Completion Checklist

- [ ] All modules completed
- [ ] All sprints completed
- [ ] All epics completed
- [ ] All tasks completed
- [ ] All required tests written and passing
- [ ] Acceptance criteria satisfied
- [ ] A security review, an accessibility audit, and a completed restore drill are all signed off
- [ ] [PROJECT_PROGRESS.md](../PROJECT_PROGRESS.md) updated

---

## Blueprint Traceability

- `§20`
- `§26.8`
- `§12.6`
- `§21 Phase 9`
- `gap R-1`
- `gap R-2`
