# TASK-097 — Conduct WCAG 2.2 AA Audit with Screen Reader and Device Lab Verification

## Metadata

| Field | Value |
|---|---|
| Task ID | TASK-097 |
| Phase | [PHASE-09 — Hardening — Security, Accessibility, Performance & Resilience](../../../../PHASE-09.md) |
| Module | [MOD-09-02 — Quality, Accessibility & Performance](../../../MOD-09-02.md) |
| Sprint | [SPR-09-02-01 — E2E Coverage, Accessibility Audit & Device Lab](../../SPR-09-02-01.md) |
| Epic | [EPIC-09-02-01-01 — End-to-End, Accessibility & Device Verification](../EPIC-09-02-01-01.md) |
| Type | testing |
| Priority | critical |
| Status | pending |
| Dependencies | `TASK-096` |
| Blueprint refs | `§26.8`, `§29.0`, `§21 Phase 9` |

---

## 1. Objective

Audit every shipped screen against WCAG 2.2 AA with automated and manual testing, verify with a screen reader on real devices, and confirm the documented platform gaps behave as designed.

---

## 2. Context

Blueprint §26.8 makes WCAG 2.2 AA binding and names the specifics: 4.5:1 contrast, 44×44px targets, full keyboard operability, visible focus, live regions for upload and delivery status, and the rule that coral `#FF6B5E` is never used for small text on white. §29.0 documents the platform gaps that only appear on real hardware.

---

## 3. Problem Statement

Automated tools catch perhaps a third of accessibility problems. The rest — focus order that technically works but is incomprehensible, live regions that flood a screen reader, a countdown announced every second — are only found by using the product with assistive technology. And §26.8 puts grandparents in the core audience, not the margins.

---

## 4. Expected Outcome

An audit report with zero serious or critical automated violations, a screen-reader pass on real devices, a device-lab matrix confirming the §29.0 gaps degrade as designed, and both gates wired into CI.

---

## 5. Requirements

### Functional Requirements

- axe run on every shipped screen in both themes, in CI.
- Manual keyboard traversal of every flow.
- Screen-reader pass: VoiceOver on iOS and macOS, TalkBack on Android, NVDA on Windows.
- Contrast verification including the coral small-text prohibition.
- Touch-target verification.
- Reduced-motion verification for every animation including confetti and the capsule reveal.
- Device lab: iOS Safari, Android Chrome, a mid-range Android, a five-year-old Android, a tablet, and desktop.
- Confirmation that the §29.0 gaps (no haptics, no WebOTP, no contact picker on iOS) degrade gracefully.

### Technical Requirements

- axe integrated into Playwright so the gate is automated and per-screen.
- Screen-reader testing performed by someone who uses one regularly, or with structured guidance — an unfamiliar tester produces misleading results.
- Performance benchmarks re-run with real media, since PHASE-04 changed the numbers from the PHASE-03 baseline.

---

## 6. Implementation Instructions

1. Integrate axe into the Playwright suites and assert zero serious or critical violations per screen, in both themes. Wire it as a blocking gate.
2. Perform manual keyboard traversal of every flow, checking focus order, focus visibility, and focus return from sheets and dialogs (§33.17).
3. Perform the screen-reader pass. Pay particular attention to: the countdown live region (it must not announce every second), the upload progress region (coarse announcements), the timeline's virtualised list, and the capsule reveal.
4. Verify contrast programmatically and by inspection, including the specific coral prohibition. Fix any small coral text found.
5. Verify touch targets at 44×44px with 8px separation, particularly the bottom tab bar and the OTP inputs.
6. Verify every animation has a reduced-motion variant: confetti, the sealing ceremony, the capsule reveal, the carousel, scroll-away nav, and the countdown ring.
7. Run the device lab. **Confirm the §29.0 gaps degrade as designed:** no haptics on iOS with visual state intact, no WebOTP on iOS with paste working, no contact picker on iOS with the file and invite paths prominent.
8. **Re-run the PHASE-03 timeline benchmark with real media** and set the regression gate from the new number, recording both.
9. Write the audit report with findings, fixes, and any accepted limitations.

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
apps/site/e2e/a11y.spec.ts
docs/ACCESSIBILITY_AUDIT.md
docs/DEVICE_LAB.md
apps/site/e2e/performance.spec.ts
.github/workflows/ci.yml  (a11y + perf gates)
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

- Zero serious or critical axe violations on every shipped screen (§26.8).
- Coral is never used for small text on white.
- Every animation has a reduced-motion variant.
- Live regions announce coarsely, never per-second or per-percent.
- The documented platform gaps must degrade gracefully, with the visual state always sufficient.

---

## 13. Edge Cases

- The countdown live region announcing every second — must be coarse; this is the most likely screen-reader failure in the product.
- The virtualised timeline confusing a screen reader as rows unmount — verify and fix.
- The capsule reveal animation with reduced motion — must be a clean cross-fade, not an instant jump that loses the moment.
- Coral small text found somewhere late in a flow — fix rather than accept; it is an explicit prohibition.
- A five-year-old Android failing on memory during timeline scroll — either fix or document a minimum-spec limitation honestly.
- iOS with no haptics — every state that used a haptic must be visually complete; verify each.
- A tablet in landscape where the two-pane layout was never tested — include it in the matrix.
- Forced-colors mode — the UI must remain usable.

---

## 14. Error Handling

- A serious or critical violation blocks launch. A moderate violation is fixed or formally accepted with a rationale in the audit report.

---

## 15. Security Considerations

- Not applicable directly, though a keyboard trap is both an accessibility and an availability problem.

---

## 16. Testing Requirements

### Accessibility Tests

- **axe: zero serious or critical violations on every shipped screen, both themes.**
- Keyboard traversal of every flow with visible focus and correct focus return.
- Screen-reader pass on iOS, Android, and Windows.
- Contrast verified; no coral small text.
- Touch targets ≥ 44×44px with adequate separation.
- Every animation has a reduced-motion variant.

### Performance Tests

- **Timeline benchmark re-run with real media; the gate is set from the new number.**
- Lighthouse performance on a mid-range Android profile.

---

## 17. Acceptance Criteria

- [ ] axe gate wired into CI; zero serious or critical violations.
- [ ] Manual keyboard and screen-reader passes completed and documented.
- [ ] Coral small-text prohibition verified.
- [ ] Reduced-motion variants verified for every animation.
- [ ] Device-lab matrix completed, including a five-year-old Android.
- [ ] **The §29.0 gaps confirmed to degrade gracefully on real iOS hardware.**
- [ ] Performance benchmark re-run with real media and the gate set.
- [ ] `docs/ACCESSIBILITY_AUDIT.md` and `docs/DEVICE_LAB.md` written.

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
TASK-096
    ↓
TASK-097
```


---

## 20. Implementation Notes

- Do the screen-reader pass with someone who actually uses one. An unfamiliar tester will report the wrong problems and miss the real ones.
- The countdown live region is the specific thing to check first — it is central to the product and it is the classic over-announcement bug.

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [EPIC-09-02-01-01](../EPIC-09-02-01-01.md).
3. Read the parent Sprint — [SPR-09-02-01](../../SPR-09-02-01.md).
4. Read the parent Module — [MOD-09-02](../../../MOD-09-02.md).
5. Read the parent Phase — [PHASE-09](../../../../PHASE-09.md).
6. Read the relevant blueprint sections: `§26.8`, `§29.0`, `§21 Phase 9` in [MM_PWA_BLUEPRINT.md](../../../../../../../MM_PWA_BLUEPRINT.md).
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
