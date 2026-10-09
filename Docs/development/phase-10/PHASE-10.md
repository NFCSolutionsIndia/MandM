# PHASE-10 — Launch — Marketing Site, Honest Claims & Staged Rollout

[← Development Index](../DEVELOPMENT_INDEX.md) · [Project Plan](../00_PROJECT_PLAN.md) · [Blueprint](../../../MM_PWA_BLUEPRINT.md)

## Phase Metadata

| Field | Value |
|---|---|
| Phase ID | PHASE-10 |
| Phase name | Launch — Marketing Site, Honest Claims & Staged Rollout |
| Release | Release 1 |
| Phase objective | Ship it, with marketing that matches what was built. |
| Business objective | The existing marketing makes ten claims the product cannot honour. Correcting them is a launch requirement, not a nicety. |
| Technical objective | Marketing site on the new design system, a working waitlist and contact backend, legal pages, feature flags, staged rollout, status page, and the published delivery guarantee. |
| Priority | critical |
| Status | pending |
| Dependencies | PHASE-09 |
| Estimated effort | ~2 weeks |
| Modules | 2 |
| Sprints | 2 |
| Epics | 2 |
| Tasks | 5 |
| Expected outcome | A public launch with honest marketing, staffed monitoring, measured activation, and a published delivery guarantee. |

---

## 1. Phase Purpose

Two things happen here, and one of them is unusual.

The ordinary part is a marketing site, legal pages, a status page, feature flags, and a staged rollout.

The unusual part is **correcting the claims**. Blueprint Appendix B lists ten specific things the existing marketing says that the product does not do: "unlimited storage", "military-grade security" implying end-to-end encryption, a fabricated "12,450" figure used as both memories saved and reviews, three named fictional testimonials, iOS and Android download buttons with no apps, facial recognition, heir assignment, and two contradictory pricing tables. §37 puts it plainly: **"never break a promise about permanence... This product sells trust as its primary feature."**

The other launch-specific commitment is publishing `docs/DELIVERY-GUARANTEE.md` (§37, §24.3). A company that publishes the engineering behind its central promise, including its limits, is making a claim competitors cannot casually match.

---

## 2. Phase Goals

- The marketing site ships on the new design system with every claim matching what exists.
- One coherent pricing page replaces the two contradictory versions.
- The contact and waitlist forms actually submit.
- Legal pages are published, including the CSAM-matching disclosure.
- The delivery guarantee is published as a public trust artifact.
- Rollout is staged behind feature flags with monitoring staffed.
- Activation and retention funnels are instrumented from the first user.

---

## 3. Features Delivered

- Marketing landing page with the §30.1 sections.
- Pricing, privacy, how-it-works, and legal pages.
- Blog with MDX.
- FAQ and a working contact form.
- Feature flags with percentage rollout.
- Status page and on-call rota.
- Published delivery guarantee.
- PostHog funnels.

---

## 4. Architecture Impact

- Adds the marketing route group's content, keeping it free of app-bundle code.
- Adds the feature-flag evaluation path (ADR-025) used for the staged rollout.
- Adds the public status page and the on-call routing.

---

## 5. Modules

| Module | Name | Objective | Priority | Status |
|---|---|---|---|---|
| [MOD-10-01](module-01/MOD-10-01.md) | Marketing Site & Honest Claims | Ship a marketing site on the new design system where every claim is true. | critical | pending |
| [MOD-10-02](module-02/MOD-10-02.md) | Production Readiness & Staged Rollout | Roll out behind flags with monitoring staffed, analytics instrumented, and the delivery guarantee published. | critical | pending |

---

## 6. Phase Dependencies

**Prerequisite phases:** PHASE-09

- **PHASE-09** must be signed off: launching before the security review and restore drill would invert the risk ordering.
- **PHASE-05** `docs/DELIVERY-GUARANTEE.md` must exist to be published.
- **PHASE-08** CSAM disclosure text must be included in the privacy policy.
- **Open questions:** A-7 (wind-down policy) affects the trust page copy and remains unresolved.

---

## 7. Phase Deliverables

- Marketing site
- Legal pages
- Working forms
- Feature flags
- Status page
- Published guarantee
- Analytics funnels
- On-call rota

---

## 8. Phase Acceptance Criteria

- [ ] Every claim on the marketing site corresponds to shipped functionality, verified line by line against Appendix B.
- [ ] One pricing page, matching §17.2 exactly.
- [ ] The contact form submits and produces a ticket id.
- [ ] The delivery guarantee is publicly reachable.
- [ ] A feature flag can gate access at a percentage, verified.
- [ ] The activation funnel reports signup → first memory → first capsule sealed.

---

## 9. Phase Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Shipping an inherited claim by accident | high | A line-by-line Appendix B review is an explicit acceptance criterion, with a checklist committed to the repository. |
| Launching without on-call cover for the delivery alert | critical | The rota is a deliverable; the alert was tested in PHASE-08 and re-verified after PHASE-09 injection. |
| Marketing bundle importing app code and harming LCP | medium | Route-group separation from PHASE-01, with a first-load-JS budget checked in CI. |
| A-7 unresolved, leaving the trust page weaker than it could be | medium | Publish the delivery guarantee now; add the wind-down policy when the business resolves it. Do not invent one. |

---

## 10. Phase Completion Checklist

- [ ] All modules completed
- [ ] All sprints completed
- [ ] All epics completed
- [ ] All tasks completed
- [ ] All required tests written and passing
- [ ] Acceptance criteria satisfied
- [ ] The product is publicly available, the claims are honest, and someone is on call for the delivery alert
- [ ] [PROJECT_PROGRESS.md](../PROJECT_PROGRESS.md) updated

---

## Blueprint Traceability

- `§30`
- `§17.2`
- `Appendix B`
- `§37`
- `ADR-025`
