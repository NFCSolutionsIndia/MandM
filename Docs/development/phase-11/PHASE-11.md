# PHASE-11 — Release 2 — "Together" (Shared Vaults, Collaboration, Broadcasts & AI)

[← Development Index](../DEVELOPMENT_INDEX.md) · [Project Plan](../00_PROJECT_PLAN.md) · [Blueprint](../../../MM_PWA_BLUEPRINT.md)

## Phase Metadata

| Field | Value |
|---|---|
| Phase ID | PHASE-11 |
| Phase name | Release 2 — "Together" (Shared Vaults, Collaboration, Broadcasts & AI) |
| Release | Release 2 |
| Phase objective | Turn a private archive into a shared one, and add the intelligence layer that needs an archive to work on. |
| Business objective | Release 1 proves one person will seal a memory and another will open it. Release 2 makes the product multi-player, which is where organic growth comes from. |
| Technical objective | Shared vaults with roles, collaborative capsules with no-signup contribution, broadcasts with a festivals engine, WhatsApp and SMS delivery, and the AI layer (semantic search, transcription, grouping, recaps, suggested capsules). |
| Priority | high |
| Status | pending |
| Dependencies | PHASE-10 |
| Estimated effort | ~12–16 weeks |
| Modules | 4 |
| Sprints | 0 |
| Epics | 0 |
| Tasks | 0 |
| Expected outcome | Families contribute to shared archives, group capsules become possible, festival broadcasts work, and the archive becomes searchable by meaning. |

---

## 1. Phase Purpose

**Task decomposition for this phase is deliberately deferred until Release 1 has shipped.** The reasoning is recorded in [00_PROJECT_PLAN.md](../00_PROJECT_PLAN.md) §6 and in the gap analysis, and it is not procrastination:

- **Task decomposition ages badly.** R2 tasks written today would be rewritten after R1 ships and real usage data exists. The activation funnel from PHASE-10 will tell us whether collaborative capsules or semantic search matters more, and that changes the sprint order.
- **Music licensing (open question A-5) is unresolved**, and it blocks the memory editor's music library and the recap soundtrack. Decomposing those tasks before the licence terms are known would produce fiction.
- **The AI cost model needs real data.** Blueprint §15 estimates per-user AI cost, but the actual figure depends on how much media a real user uploads — which Release 1 will measure.

What *is* decided, and recorded below, is the module set, the objectives, and the constraints each module inherits. Decomposition to sprint, epic, and task level is an explicit gate at the end of Release 1.

---

## 2. Phase Goals

- Multiple family members contribute to one shared archive with roles.
- A group can assemble one montage from many contributors, none of whom needs an account.
- A festival broadcast reaches a family with merge-tagged personalisation and enforced abuse controls.
- Capsules deliver over WhatsApp and SMS with the full channel cascade.
- The archive becomes searchable by meaning, and voices become searchable text.
- The product begins suggesting capsules rather than waiting to be asked.

---

## 3. Features Delivered

- Shared vaults and albums with the full role model.
- Collaborative capsules with no-signup web capture.
- Broadcasts with festival packs, merge tags, and mandatory opt-out controls.
- Localization and festivals engine with lunar and movable-feast date rules.
- WhatsApp Business API and SMS delivery with failover.
- Family plan tier.
- Semantic search over captions and transcripts (OpenSearch k-NN).
- Voice and video transcription.
- Auto event grouping.
- Auto recaps (Year in Review, monthly).
- Suggested capsules and AI memory prompts.
- Wishlists as curated links.
- Streaks, badges, and the referral programme.
- Annual reassurance report.
- Comments and reactions in shared vaults.
- Backup guardians for capsules.
- Milestone-based delivery conditions.
- Biometric app lock refinements and print/PDF export.

---

## 4. Architecture Impact

- Extends `lib/authz` with shared-vault membership beyond the owner role — the matrix columns already exist, so this is enforcement rather than redesign.
- Adds OpenSearch k-NN and the hybrid retrieval path (ADR-010), which PHASE-01 deliberately left disabled.
- Adds the AI job pipeline with per-feature kill switches declared in PHASE-10.
- Adds the WhatsApp and SMS channels to the delivery ladder built in PHASE-05.
- Extends the future-band and notification-registry patterns rather than replacing them.

---

## 5. Modules

| Module | Name | Objective | Priority | Status |
|---|---|---|---|---|
| [MOD-11-01](module-01/MOD-11-01.md) | Shared Vaults, Albums & Collaboration | Let several people contribute to one archive with clear roles, and let a group assemble one memory together. | high | pending |
| [MOD-11-02](module-02/MOD-11-02.md) | Broadcasts, Festivals & Multi-Channel Delivery | Enable festival broadcasts with real personalisation and real abuse controls, and complete the channel cascade. | high | pending |
| [MOD-11-03](module-03/MOD-11-03.md) | AI Layer — Search, Transcription, Grouping & Recaps | Ship the AI features in the order blueprint §15.3 specifies, with cost guardrails from day one. | high | pending |
| [MOD-11-04](module-04/MOD-11-04.md) | Growth, Retention & Household Plan | Add the growth and retention mechanics blueprint §7.2 lists, with the non-manipulative constraint made binding. | medium | pending |

---

## 6. Phase Dependencies

**Prerequisite phases:** PHASE-10

- **PHASE-10** must have shipped and produced activation data.
- **Open question A-5 (music licensing)** blocks the editor music library and recap soundtracks.
- **WhatsApp Business template approval** has a multi-week lead time (assumption AS-5) and must be started before the sprint that needs it.
- **AI cost model** should be calibrated against Release-1 upload volumes before the AI sprints are planned.

---

## 7. Phase Deliverables

- A decomposed sprint, epic, and task plan for this phase, produced at the Release-1 exit gate.
- The module set and constraints below, which are already decided.

---

## 8. Phase Acceptance Criteria

- [ ] Task decomposition completed and reviewed before any Release-2 implementation begins.
- [ ] The decomposition incorporates Release-1 activation and cost data.
- [ ] A-5 resolved, or the music-dependent scope explicitly cut from this release.
- [ ] WhatsApp template approval started before the delivery-channel sprint.

---

## 9. Phase Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Decomposing too early and producing a plan that is rewritten | medium | Deliberate deferral to the Release-1 exit gate, with the reasoning recorded so the deferral is not mistaken for an oversight. |
| Broadcast becoming a spam vector | high | The abuse controls in §29.18 and `BroadcastOptOut` in §34.4 are mandatory and were added to the blueprint precisely because the source brief omitted them. |
| AI cost outrunning revenue | high | Per-tier budgets enforced in code before a call is made, per-feature kill switches (declared in PHASE-10), and the cost-per-active-user metric instrumented in PHASE-10. |
| Shared vaults widening the authorization surface | high | The matrix columns and scope-enforcement patterns already exist from PHASE-02 and PHASE-05; the assurance suites from PHASE-09 must be extended in the same sprint, not afterwards. |
| WhatsApp approval delay blocking a sprint | medium | Start approval during Release 1; the channel is additive, so the sprint can ship with SMS if approval lags. |

---

## 10. Phase Completion Checklist

- [ ] All modules completed
- [ ] All sprints completed
- [ ] All epics completed
- [ ] All tasks completed
- [ ] All required tests written and passing
- [ ] Acceptance criteria satisfied
- [ ] A decomposed task plan for this phase exists, informed by Release-1 data, and has been reviewed
- [ ] [PROJECT_PROGRESS.md](../PROJECT_PROGRESS.md) updated

---

## Blueprint Traceability

- `§27.3 Release 2`
- `§7.2`
- `§15`
- `§29.17`
- `§29.18`
- `§34.3`
- `§34.4`
- `§34.5`
- `§34.7`
