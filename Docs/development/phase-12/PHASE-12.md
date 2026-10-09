# PHASE-12 — Release 3 — "Gifting & Legacy" (Commerce, Group Gifting & Legacy Vault)

[← Development Index](../DEVELOPMENT_INDEX.md) · [Project Plan](../00_PROJECT_PLAN.md) · [Blueprint](../../../MM_PWA_BLUEPRINT.md)

## Phase Metadata

| Field | Value |
|---|---|
| Phase ID | PHASE-12 |
| Phase name | Release 3 — "Gifting & Legacy" (Commerce, Group Gifting & Legacy Vault) |
| Release | Release 3 |
| Phase objective | Add the gift business and the inheritance promise — the two largest additions, and the two that are gated on things engineering cannot decide. |
| Business objective | Gifting is a second business with its own economics. Legacy transfer is the product's boldest promise and its highest legal exposure. |
| Technical objective | Catalog, cart, checkout, orders, logistics, returns, promotions, group gifting — plus the Legacy Vault with a KYC-gated unlock protocol. |
| Priority | medium |
| Status | pending |
| Dependencies | PHASE-11 |
| Estimated effort | ~16–20 weeks, and a business decision as much as an engineering one |
| Modules | 3 |
| Sprints | 0 |
| Epics | 0 |
| Tasks | 0 |
| Expected outcome | Users can send physical gifts from within the product, and can name heirs who will inherit their vault through a verified, auditable process. |

---

## 1. Phase Purpose

**Task decomposition for this phase is deferred, and two of its modules are blocked on decisions outside engineering.**

The reasoning, from [00_PROJECT_PLAN.md](../00_PROJECT_PLAN.md) §6 and blueprint §27.3:

**Commerce should be validated before it is built.** Blueprint §27.3 is explicit: "before building inventory, fulfilment, and returns, launch gifting as **curated affiliate or dropship links** from the wishlist and occasion surfaces. It validates whether users will buy gifts *through this product* at a fraction of the cost, and the same PDP and shelf designs are reused later. Owning inventory is a decision to become a retailer — it should follow evidence, not precede it." Decomposing a catalog-and-logistics system now would produce a plan discarded if that validation fails.

**Legacy Vault is blocked on legal counsel.** Open question A-4 — how death is verified, who adjudicates a dispute, what waiting period applies, which KYC vendor — cannot be answered by engineering. Blueprint §23.3 is unambiguous about the consequence of getting it wrong: "shipping it half-built means either failing to transfer a vault or transferring one wrongly — both catastrophic."

**Scale matters too.** §34.13 notes this release adds roughly nineteen entities, "roughly a third of the entire data model, serving a business the product has not yet validated".

The module set and constraints below are decided. Decomposition is an explicit gate after Release 2, and for the legacy modules, after legal sign-off.

---

## 2. Phase Goals

- Validate gift intent with affiliate or dropship links before owning inventory.
- If validated, ship a full gift commerce experience with honest delivery-date guarantees.
- Ship group gifting with an auto-refund guarantee stated before money is collected.
- Ship the Legacy Vault with an unlock protocol that is verifiable, cancellable by the owner, and fully audited.

---

## 3. Features Delivered

- Gift catalog, PDP, cart, wishlist, checkout, orders, tracking, returns.
- Serviceability and delivery-date filtering ("arrives before the birthday").
- Promotions and group gifting with auto-refund.
- Admin catalog, orders and logistics, payments and refunds.
- Nominees with scoped permissions.
- Legacy Vault with date, inactivity, and nominee-initiated triggers.
- Unlock protocol: KYC, owner notification at every step, waiting period, second-nominee confirmation, immutable audit trail.
- Template and sticker marketplace with licensed music.
- Public memorial pages (opt-in).

---

## 4. Architecture Impact

- Commerce is the likeliest first candidate for extraction into a real service (ADR-004): different scaling, different compliance, possibly a different team.
- Adds a KYC provider integration and a human-operations workflow, neither of which exists in Releases 1 or 2.
- Introduces the first genuinely public content surface (memorial pages), which changes the privacy model's assumptions and needs its own moderation thinking.

---

## 5. Modules

| Module | Name | Objective | Priority | Status |
|---|---|---|---|---|
| [MOD-12-01](module-01/MOD-12-01.md) | Gift Commerce — Validation, Catalog & Checkout | Validate gift intent cheaply, then build the full commerce experience if the evidence supports it. | medium | pending |
| [MOD-12-02](module-02/MOD-12-02.md) | Legacy Vault, Nominees & The Unlock Protocol | Let a user name heirs and store messages that reach them after death, through a process that cannot hand a vault to the wrong person. | medium | pending |
| [MOD-12-03](module-03/MOD-12-03.md) | Marketplace, Generative Creations & Memorial Pages | Add templates, licensed music, generative cards, and opt-in memorial pages, each gated on its own open question. | low | pending |

---

## 6. Phase Dependencies

**Prerequisite phases:** PHASE-11

- **PHASE-11** must have shipped.
- **Open question A-4 (heir verification)** blocks the legacy modules entirely. Legal counsel per jurisdiction is required before decomposition.
- **Open question A-6 (fulfilment partner)** blocks owned-inventory commerce.
- **Open question A-5 (music licensing)** blocks the template and sticker marketplace.
- **Commerce validation:** affiliate/dropship evidence should precede the owned-inventory decision (§27.3).

---

## 7. Phase Deliverables

- An affiliate/dropship validation experiment and its result.
- Legal sign-off on the heir verification model, or a decision not to build it.
- A decomposed task plan for whichever modules survive those two gates.

---

## 8. Phase Acceptance Criteria

- [ ] Commerce validation completed with a recorded decision on owned inventory.
- [ ] A-4 resolved with legal sign-off, or the legacy modules formally cut.
- [ ] A-6 resolved before any fulfilment work begins.
- [ ] A-5 resolved before the marketplace is decomposed.
- [ ] Task decomposition completed only for modules whose gates have cleared.

---

## 9. Phase Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Building a retail business the product does not need | high | Validate with affiliate/dropship first (§27.3). The PDP and shelf designs are reused either way, so the design work is not wasted. |
| Shipping legacy transfer without legal grounding | critical | Blocked on A-4. §23.3: failing to transfer a vault, or transferring one wrongly, are both catastrophic. Marketing the vision while not shipping the feature is the correct interim position. |
| Handing a vault to the wrong person | critical | KYC, a mandatory unshortenable waiting period, owner notification at every step, owner cancellation, and second-nominee confirmation — the same shape as the PHASE-02 account-recovery protocol, deliberately. |
| Commerce compliance (GST, returns, consumer law) underestimated | high | Treated as a business decision with its own diligence, not an engineering task. |
| Public memorial pages introducing a moderation surface the product has never had | high | Requires its own abuse thinking; the private-by-default model does not transfer. |

---

## 10. Phase Completion Checklist

- [ ] All modules completed
- [ ] All sprints completed
- [ ] All epics completed
- [ ] All tasks completed
- [ ] All required tests written and passing
- [ ] Acceptance criteria satisfied
- [ ] A-4 resolved with legal sign-off, commerce validated, and a decomposed plan produced for the modules that survive
- [ ] [PROJECT_PROGRESS.md](../PROJECT_PROGRESS.md) updated

---

## Blueprint Traceability

- `§27.3 Release 3`
- `§7.3`
- `§23.3`
- `§29.19`
- `§29.25`
- `§34.9`
- `§34.10`
- `A-4`
- `A-5`
- `A-6`
