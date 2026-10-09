# Requirement Gap Analysis

Classification used throughout:

| Tag | Meaning |
|---|---|
**`[BLUEPRINT]`** | Explicitly defined in MM_PWA_BLUEPRINT.md — implement as written |
**`[RECOMMENDED]`** | Not in the blueprint; proposed here and applied consistently. Challengeable in one place |
**`[ASSUMPTION]`** | Taken as true to make the plan executable. If wrong, listed tasks change |
**`[NEEDS CLARIFICATION]`** | Cannot be resolved by engineering. Blocks the named work |

---

## 1. Blocking open questions (carried from blueprint Appendix A)

| # | Question | Status | Blocks |
|---|---|---|---|
| A-4 | Heir/legacy death-verification model — how is death verified, who adjudicates a dispute, what waiting period, which KYC vendor? | **`[NEEDS CLARIFICATION]`** — requires legal counsel per jurisdiction | PHASE-12 entirely. Cannot be decomposed to tasks |
| A-5 | Licensed music library — which provider, what licence scope, what cost? The blueprint promises "licensed music" | **`[NEEDS CLARIFICATION]`** — commercial commitment | R2 memory editor music feature; R3 template marketplace |
| A-6 | Gift fulfilment partner, geography, returns, tax handling | **`[NEEDS CLARIFICATION]`** | PHASE-12 commerce. Mitigation: validate with affiliate/dropship first (§27.3) |
| A-7 | Company wind-down policy — what happens to vaults if the company fails? | **`[NEEDS CLARIFICATION]`** — product/legal | PHASE-10 marketing and trust copy. **The most important open question in the product** |

**Resolved before this plan:** A-1 pricing (§17.2, Appendix C-6/C-8) · A-2 platform (native apps, ADR-001) · A-3 geography (India-first, global-capable) · A-8 brand identity (§26).

---

## 2. Ambiguities resolved by decision (not invention)

| Topic | Blueprint state | Resolution | Tag |
|---|---|---|---|
| API style | "GraphQL/REST gateway" written for native clients | Server actions + narrow route handlers (ADR-022) | `[RECOMMENDED]` |
| Package manager / monorepo tool | Not specified | pnpm + Turborepo (ADR-003) | `[RECOMMENDED]` |
| Error envelope | Not specified | Discriminated result union + stable codes (ADR-023) | `[RECOMMENDED]` |
| Rate-limit store at R1 | Redis listed but deferred | Cloudflare edge + database counter (ADR-011) | `[RECOMMENDED]` |
| Feature flags | Listed for admin, no mechanism | Database table, server-evaluated (ADR-025) | `[RECOMMENDED]` |
| Session mechanism | "JWT + refresh tokens" in the designer brief | Opaque server-side sessions so revocation is instant (ADR-008, §20.1) — **overrides the brief**; a stateless JWT cannot be revoked, which is unacceptable for a lifetime vault | `[RECOMMENDED]` |
| Auth provider | "Better Auth (or Auth.js v5)" | Better Auth (ADR-008) | `[RECOMMENDED]` |

---

## 3. Conflicts inside the source material, and how the plan settles them

The blueprint's own Appendix C already reconciles 18 conflicts between Part I and the designer brief. Those resolutions are treated as settled and are not re-litigated here. Three additional conflicts surfaced during decomposition:

1. **"Delivery channels: in-app + email" (free tier, §17.2) vs "In-app → WhatsApp → SMS → Email" (§29.15 channel priority UI).**
   *Resolution:* the drag-to-reorder channel UI ships in R1 but renders only the channels the tier and the recipient's verified contact methods permit; unavailable channels appear greyed with the reason stated. This is exactly what §29.15 specifies for missing contact details, extended to tier gating. `[RECOMMENDED]`

2. **Free tier gets "semantic search only" (§17.2 table) but AI ships in R2 (§15.2, ADR-017).**
   *Resolution:* in R1 the free tier's search is a tsvector GIN index. The table's "semantic search" row becomes accurate at R2. Marketing must not claim semantic search before then (Appendix B principle). `[ASSUMPTION]`

3. **Timeline tab present in R1 nav (§28.1) but Gifts replaces it at R3.**
   *Resolution:* build the nav as a configuration-driven component from PHASE-03 so the R3 swap is a config change plus an in-app announcement, not a rewrite. §28.1 requires the change be announced, never silent. `[RECOMMENDED]`

---

## 4. Assumptions the plan rests on

| # | Assumption | If wrong |
|---|---|---|
| AS-1 | Team of 2–3 engineers + 1 designer, designer working ahead of engineering per §36 | Timeline in 00_PROJECT_PLAN §5 changes; task content does not |
| AS-2 | Design system tokens (§26) are available at PHASE-01 | PHASE-01 Sprint 2 blocks; mitigate by tokenising from §26.3–26.5 directly, which is fully specified |
| AS-3 | India is the launch market; ₹ is the primary currency; GST applies | Payment tasks change provider priority; DPDP Act 2023 compliance tasks may become GDPR-first |
| AS-4 | 10 GB free tier costs ~\$0.15/user/month on R2 at full use | Pricing model in §17.2 needs revisiting, not the task plan |
| AS-5 | WhatsApp Business template approval takes weeks and is an R2 concern | If WhatsApp is required at R1, PHASE-07 grows by a sprint and needs a lead time buffer |
| AS-6 | Existing `src/` static site is a reference only and is not migrated | PHASE-10 marketing tasks change from "build" to "refactor" |
| AS-7 | Original-quality media retention is affordable at R1 scale | Contradicts nothing in the plan, but §12.6 tiering tasks would move earlier |

---

## 5. Missing requirements the blueprint does not cover, added here

| # | Gap | Where addressed | Tag |
|---|---|---|---|
| G-1 | **Account recovery when the only passkey is lost** and email access is also lost. A lifetime vault needs a documented, abuse-resistant recovery path | PHASE-02 — recovery task with explicit anti-social-engineering rules | `[RECOMMENDED]` |
| G-2 | **Duplicate member merge** is mentioned in §29.11 but the merge semantics (which capsules follow which record) are undefined | PHASE-03 — merge task defines: capsules follow the surviving record; contact history is unioned; audit entry written | `[RECOMMENDED]` |
| G-3 | **Timezone change by a recipient** between seal and delivery over a multi-year horizon | PHASE-05 — delivery worker resolves the humane window at fire time, not seal time | `[RECOMMENDED]` |
| G-4 | **What happens to a capsule whose recipient has died** before delivery | PHASE-05 — `Member.deceased_at` gates delivery and notifies the owner instead. **Handled with care; copy needs review** | `[NEEDS CLARIFICATION]` on copy, `[RECOMMENDED]` on mechanism |
| G-5 | **Storage accounting drift** between counted bytes and actual objects | PHASE-08 — reconciliation job | `[RECOMMENDED]` |
| G-6 | **App update required during an active recording or upload** | PHASE-06 — update prompt is explicit and deferred while an upload is in flight (§33.15) | `[BLUEPRINT §29.28]` |
| G-7 | **Seed/demo data** for development and for the staged rollout | PHASE-01 — seed script with realistic Indian + global names, never lorem ipsum (§36) | `[RECOMMENDED]` |
| G-8 | **Admin break-glass second-approver workflow** is required by §16.3 but no approval mechanism is specified | PHASE-08 — approval request/grant with expiry, and user notification | `[RECOMMENDED]` |

---

## 6. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R-1 | **The delivery guarantee is not actually durable** — a bug loses a scheduled job and a capsule silently never arrives | **Critical** | DB-owned scheduler (ADR-006), transactional seal, watchdog alert, monthly integrity sweep, Sev-0 classification. Tested with injected failures in PHASE-09 |
| R-2 | **Cross-tenant data leak** | **Critical** | `lib/authz` chokepoint built first, the ADR-009 scope guard as the only line, one test per permission-matrix cell, external pen test focused on IDOR |
| R-3 | Media pipeline cost outruns revenue | High | Instrument storage cost per paying user from day one; tiering job; no "unlimited" promise |
| R-4 | Store review rejects or delays a release | Medium | Four member-import paths, email as guaranteed notification fallback, install framed as reward. Device-lab testing in PHASE-09 |
| R-5 | Scope creep from R2/R3 into R1 | High | MVP boundary test (§23.4) applied to every scope request: "if this were missing, would the core promise break?" |
| R-6 | FFmpeg RCE via malicious upload | High | Isolated containers, no DB credentials, no egress, magic-byte validation, SVG rejected |
| R-7 | Legal exposure on children's media and biometrics | High | Face recognition not built. CSAM hash-matching from day one. DMCA path staffed at launch |
| R-8 | Long-horizon churn — user forgets the product for years, card expires, capsule orphaned | Medium | Annual reassurance report (R2), contact-freshness prompts, and the never-cancel-for-non-payment policy |
| R-9 | Next.js 16 breaking changes cause repeated rework | Medium | Every framework task requires reading `node_modules/next/dist/docs/` first (ADR-002, project `AGENTS.md`) |
