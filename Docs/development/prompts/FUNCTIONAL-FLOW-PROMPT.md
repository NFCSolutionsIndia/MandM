# Prompt — End-to-end functional flow & page-by-page flow diagrams (Moments & Memories)

> Paste everything below the line into a fresh session run from the repository root.
> The deliverable is **added into an existing artifact**, not written as new markdown files.

---

## 0. What you are working on

**Moments & Memories (M&M)** — private native **iOS and Android apps** for keeping a family's memories and,
distinctively, **delivering a message on a date that may be decades away**. Monorepo at
`e:\M&M\MandM-PWA` (pnpm + turbo): `apps/api` (Next.js App Router — marketing + app + admin route
groups), `apps/workers` (delivery engine + media pipeline), `packages/shared`, `packages/db`,
`packages/emails`, `packages/config`.

**Where the output goes:** the existing artifact
**`https://claude.ai/code/artifact/ec2f57f7-68d6-4ff3-9034-f6c12a7dd034`** — *"Moments & Memories
Architecture"*, the Technical & Product Documentation site. You are **extending that document in
place**, matching its existing structure, markup and voice exactly. Full mechanics in §8. Read §8
before you start writing, because it constrains the form everything else takes.

**Read these before you write a single diagram. Do not work from memory or assumption:**

| Source | What to take from it |
|---|---|
| The artifact itself (read it first) | Existing sections 00–20, the 29 diagrams already there, its markup conventions and voice |
| `Docs/client/01-PRODUCT-AND-FEATURES.md` | Feature set M1–M17, release scoping R1/R2/R3, journeys §5.1, offline rules §5.3, anti-features §7 |
| `Docs/client/03-SYSTEM-DESIGN.md` | Actors (incl. the account-less recipient), container boundaries, the four flows, failure behaviour |
| `Docs/client/05-SECURITY-AND-COMPLIANCE.md` | Authorization chokepoint, session rules, audit trail, data-subject flows |
| `MM_PWA_BLUEPRINT.md` §8 | Early screen architecture (superseded in detail, still useful for purpose/CTA/states) |
| `MM_PWA_BLUEPRINT.md` **§28.5** | **Authoritative consolidated route map, R1→R3** |
| `MM_PWA_BLUEPRINT.md` §29 | App screens, ~115 screens with states — the primary inventory source |
| `MM_PWA_BLUEPRINT.md` §30 | Marketing site screens |
| `MM_PWA_BLUEPRINT.md` §31 | Admin console screens (§31.1–§31.13) |
| `MM_PWA_BLUEPRINT.md` §32 | The eight existing end-to-end flows — extend and formalise these, do not contradict them |
| `MM_PWA_BLUEPRINT.md` §33 | Binding validation and micro-interaction rules — every validation branch you draw must obey these |
| `MM_PWA_BLUEPRINT.md` Appendix C | Conflict register — C-1…C-18 are settled decisions; honour the resolutions |
| `packages/shared/src/enums.ts` | The real state values. Use these literally, never invented synonyms |
| `packages/shared/src/errors.ts` | The real error-code registry. Every failure branch cites a code from here |
| `Docs/development/CONVENTIONS.md` | Naming, copy rules, repo layout |
| `apps/site/src/app/**` | What is actually built today |

**Critical framing:** the codebase is currently an early **scaffold** — only a handful of route
files exist (`(marketing)/page.tsx`, `(auth)/login/page.tsx`, `(app)/app/page.tsx`, `admin/page.tsx`,
`c/[token]`, `s/[token]`, `not-found`). So you must **derive the inventory from the specifications**,
and tag every screen with an implementation status:

- `BUILT` — a route file exists today
- `SPECIFIED` — defined in the blueprint/client docs, not yet built
- `ASSUMPTION` — you inferred it because a flow would otherwise dead-end (must be labelled as such, inline)

Never silently invent a screen. If a flow needs a screen nothing specifies, add it under `ASSUMPTION`
with one line of justification. The artifact already marks what exists in code today versus what is
designed — keep that discipline.

---

## 1. Scope — four surfaces, four actors, three releases

This is **not** a single "register → login → dashboard → logout" application. Cover all surfaces:

| Surface | Auth | Routes |
|---|---|---|
| **Marketing** | public, indexable | `/`, `/features`, `/how-it-works`, `/gifts`, `/pricing`, `/blog[/slug]`, `/faq`, `/contact`, `/terms`, `/privacy`, `/refund` |
| **Auth & onboarding** | anonymous → authenticated | `/signup`, `/login`, `/verify/phone`, `/verify/email`, `/forgot`, `/reset/[token]`, `/welcome/[step]` |
| **App (iOS / Android)** | authenticated, vault-scoped | `/app`, `/app/timeline`, `/app/occasions[/id]`, `/app/new` (sheet), `/app/memory/[id]`, `/app/capsule/new`, `/app/capsule/[id]`, `/app/members[/id]`, `/app/search`, `/app/notifications`, `/app/settings/*`, `/app/broadcast/new` [R2], `/app/collab/[id]` [R2], `/app/vault` [R3], `/app/gifts/*` [R3], `/app/orders/*` [R3] |
| **Public tokenised** | **no account, ever** | `/c/[token]` capsule unlock · `/s/[token]` shared memory · `/j/[token]` collab capture [R2] · `/g/[token]` group gift [R3] · `/n/[token]` nominee invite [R3] |
| **Admin console** | staff, role-gated | `/admin/*` — per §31.1–§31.13 |

**Four actors, and the third one is the whole point:**

1. **Vault owner** — has an account, owns a vault
2. **Vault member** — has an account; role is one of `owner` / `admin` / `contributor` / `viewer`
   (ranked in `VAULT_ROLE_RANK`: `viewer:0 < contributor:1 < admin:2 < owner:3`) [shared vaults are R2]
3. **Recipient — has NO account and never needs one.** They arrive by email link at `/c/[token]`.
   This is a first-class actor, the emotional core of the product, and the growth loop. Requiring
   sign-up at that moment is explicitly forbidden. Diagram their journey as fully as the owner's.
4. **Operator / admin** — internal console, role matrix; break-glass access is audit-logged and
   notifies the content owner

**Release tagging is mandatory.** Tag every screen, flow and edge `[R1]`, `[R2]` or `[R3]`. Do not
present R3 gift commerce or the legacy vault as if they ship next — the legacy vault is legally gated
(Appendix C-14, open question A-4) and commerce is deliberately unvalidated.

---

## 2. Deliverable 1 — complete screen inventory

Produce the inventory **per surface**, in the order above. For every screen:

- Screen name · route · release tag · implementation status (`BUILT` / `SPECIFIED` / `ASSUMPTION`)
- Purpose in one sentence, in product language
- Entry points (every route that can reach it — including deep links, email links, push notification
  taps, and app shortcut / share-sheet entries)
- Exits (every route reachable from it)
- Auth requirement: anonymous / authenticated / **verified** / vault-role ≥ X / staff role
- Primary CTA and main components
- Fields, with the validation rules from §33 (validate on blur, re-validate on change after first
  error, primary button disabled until valid, fix-oriented copy)
- Server actions / route handlers / worker interactions touched
- **All eight state variants: default · loading (skeleton) · empty · validation-error · API-error ·
  offline · unauthorised · success.** §29 requires each in light and dark; you specify the behaviour,
  not the visuals.
- What happens after each action

Do not skip modal routes (`/app/new` is a sheet over the current screen), bottom sheets, confirmation
dialogs, the paywall interstitial, verification interstitials, countdown / pre-unlock pages, or the
error and utility pages (`not-found`, offline fallback, maintenance mode, rate-limited, deactivated
account). **Distinguish clearly between a screen and a state of a screen** — `/c/[token]` before its
unlock date is a *state*, not a separate route; the sealed / countdown / expired / revoked variants all
live at one URL.

Also list **reusable components with their own flow logic** separately (upload-queue widget, capsule
countdown, recipient picker, member picker, date-with-precision picker, share sheet, PIN gate) so they
are specified once and referenced.

In the artifact this becomes section **21**, rendered as `<table class="tight">` blocks grouped by
surface — one table per surface, not one 115-row table.

---

## 3. Deliverable 2 — the master journeys

Formalise and extend the eight flows in blueprint §32. At minimum:

**J1 — First-time user → first sealed capsule** (the flow the product lives or dies on)

```
splash / app shell → onboarding carousel → personalization quiz → sign up
  → mobile OTP → email verify (or "verify later" → limited access, scheduling gated)
  → Home (empty state) → add members (4 co-equal paths) → create memory (capture → compose)
  → "when did this happen?" (precision: exact/day/month/year) → save locally FIRST
  → seal for a person + date → plain-language summary → seal → success
```

Branches to draw: skip quiz · verify-later gating · camera/mic permission denied → upload path ·
**offline at signup (blocked, explained)** · abandoned draft → resume prompt on next launch ·
free-tier horizon exceeded → contextual paywall.

**J2 — Capsule delivery lifecycle** (spans web + workers + external channels)

```
seal (capsule row + scheduled_job row, ONE commit) → scheduler tick (minute granularity,
timezone-aware, humane window 09:00–20:00 local) → channel cascade: in-app push → email → SMS [R2]
→ WhatsApp [R2] → notify sender to intervene → receipt states Sent → Delivered → Opened → Reacted
→ reply → sender notified
```

Branches: every channel fails → sender alerted with a fix-it action · recipient contact stale →
pre-delivery nudge at **T-18 months** · owner cancels before delivery · **watchdog fires on a missed
unlock and pages a human** · integrity sweep finds an orphaned schedule.

This one must reconcile with the artifact's existing section 09 (the delivery engine) and section 10
(jobs & worker flows) rather than restating them — link to those anchors and add only the
**user-facing** half of the story that those sections deliberately leave out.

**J3 — Recipient (no account)** — email arrives → `/c/[token]` → before unlock: countdown showing
only the sender's name and the date, **never the media** → on the date: open ceremony → reply →
optional "save a copy" → soft, non-blocking sign-up invitation. Failure branches: expired link ·
revoked link · PIN-protected link · token not found · media still transcoding · **JavaScript disabled
(the page is server-rendered and must still work)**.

**J4 — Returning user** — installed app opens from cache with no network → On This Day, upcoming
occasions, pending capsule countdowns → outbox sync → conflict resolution.

**J5 — Memory lifecycle** — create → optimistic local save → chunked resumable upload (background-sync
owned, survives navigation) → transcode → derivative ladder ready → view → edit → share → delete
(and what the recipient of an already-delivered capsule sees after a delete).

**J6 — Sharing** — private share link creation → expiry + PIN options → recipient view at `/s/[token]`
→ revocation → access-log entry.

**J7 — Subscription** — hit the free limit → contextual paywall naming the locked feature → plan
compare → web checkout (Stripe / Razorpay) → unlock immediately → renewal / dunning / cancel →
**downgrade over quota → read-only grace period. Memories are NEVER deleted for non-payment (C-18),
and a sealed capsule is NEVER cancelled for non-payment (C-8).**

**J8 — Account lifecycle** — session expiry → re-auth → sign out · sign out everywhere · app lock
(WebAuthn / vault PIN) · export everything · two-step account deletion with a grace period.

**J9 — Admin moderation** — auto-flag or user report → queue with SLA timer → review → approve /
remove / warn / suspend → user notified with reason → appeal → second reviewer → resolution. Every
step audit-logged.

**J10 — R2/R3, drawn but explicitly gated** — collaborative memory `/j/[token]`, broadcast, group
gifting, nominee / legacy release protocol. Mark the gate on the diagram itself.

---

## 4. Deliverable 3 — per-screen functional flow diagrams

One **Mermaid plate** per screen (`flowchart TD`), following this shape:

```
entry → auth/authz check → shell render (cached) → data fetch
  → [success | empty | error | offline-cached] → user interaction → client validation
  → server action → [success | validation error | authz denied | quota | conflict | timeout]
  → UI response → next route
```

Every diagram must resolve these explicitly — they are the ones this product actually gets wrong in
production:

1. Valid input? Invalid input? Missing required field?
2. Server action fails / times out / returns 5xx?
3. No data? Partially available data (thumbnail ready, original still transcoding)?
4. Caller lacks the vault role for this action?
5. Session expired mid-action?
6. **Device is offline** — does this screen read from the on-device store, queue the write to the outbox, or
   block with an explanation? (Sealing a capsule is **deliberately blocked offline** — a promise that
   cannot be confirmed server-side must never be shown as sealed.)
7. Page refresh mid-flow? Back button? Two tabs open on the same draft?
8. **Double submission** — every queued write carries an idempotency key, so show that a retry after
   an ambiguous failure cannot create a duplicate.
9. User cancels? Abandons a draft?
10. Storage quota exceeded / pending-capsule cap reached / scheduling horizon exceeded?
11. Email or phone not yet verified — which actions are gated?
12. Where does the user go on success?

**Plate discipline.** The artifact's existing plates are dense but readable; a 60-node flowchart is
not. Where a screen's flow exceeds roughly 25 nodes, split it into two plates (happy path + failure
and edge branches) rather than shipping one unreadable graph. Every plate gets a `plate-note` and a
`figcaption` that says something a reader could not get from the diagram alone — see §8.4.

---

## 5. Binding rules your diagrams must not violate

These are not stylistic preferences. A diagram that breaks one of them is wrong.

**5.1 Use the real state machines.** From `packages/shared/src/enums.ts`:

- `CapsuleState`: `draft → sealed → delivering → delivered → opened`, plus `cancelled` and `failed`.
  Draw the legal transitions as a `stateDiagram-v2` and mark which are irreversible.
- `UnlockKind`: `datetime` | `milestone` | `manual` (note: `posthumous` is deliberately absent — do
  not add it)
- `MemoryVisibility`: `private` | `vault` | `link` | `recipients`
- `OccurredPrecision`: `exact` | `day` | `month` | `year` — the "when did this happen" field is
  load-bearing; an imported 1974 photo has a *year*, not a timestamp
- `MediaKind`: `image` | `video` | `audio`
- `VaultRole` + `VAULT_ROLE_RANK` — role checks resolve through `lib/authz` only

**5.2 Cite error codes, never invent messages.** Every failure edge is labelled with a code from
`packages/shared/src/errors.ts` (`AUTH_CODE_EXPIRED`, `AUTHZ_DENIED`, `AUTHZ_SHARE_REVOKED`,
`AUTHZ_PIN_REQUIRED`, `QUOTA_STORAGE_EXCEEDED`, `QUOTA_CAPSULE_HORIZON_EXCEEDED`,
`CAPSULE_ALREADY_SEALED`, `CAPSULE_EDIT_WINDOW_CLOSED`, …). If a branch needs a code that does not
exist, label it `NEW-CODE-NEEDED: <proposed_name>` and collect all of them in the gap section.

**5.3 Never draw an enumeration oracle.** Sign-in failure has exactly one outcome regardless of
whether the account exists (`AUTH_CREDENTIALS_REJECTED`). The forgot/recovery flow always shows the
same success state. `AUTHZ_DENIED` is identical whether the resource is missing or forbidden. If your
flowchart has a branch labelled "account not found" or "memory does not exist → 404" on a private
resource, that is a security defect — draw the merged branch instead. This is the user-facing
consequence of the artifact's own section 17; stay consistent with it.

**5.4 Offline behaviour is functional, not decorative.** Mark on each diagram: works offline
from cache / queues to outbox / blocked offline. Uploads are owned by the background sync layer and continue
across navigations. Show install promotion where it is a functional prerequisite.

**5.5 Honour the platform limits (§29.0, C-9, C-10).** iOS/Safari: APNs / FCM requires an *installed*
the apps — **email is the guaranteed fallback for every critical notification**, because push permission can be declined and a device token can quietly die; the system contact picker is
unavailable, so member import needs **four co-equal paths** (manual, vCard/CSV, invite link, Contact
Picker where it exists); no WebOTP auto-read and no haptics, so OTP entry is designed for manual
typing and no state depends on vibration.

**5.6 Free-tier gates (C-6, C-8).** Free = 10 GB storage, unlimited memories created, no quality
tiering, **3 pending capsules at a time** (delivered ones never count), **12-month scheduling
horizon**. The paywall is triggered by horizon and concurrency, not by upload count. Draw the
contextual paywall as an interstitial that names the specific locked capability. Cross-check the
numbers against the artifact's section 19 and do not contradict it.

**5.7 Copy rules (CONVENTIONS, §01 5.4).** Never call a memory a "file", an "asset" or a "record" in
anything a user reads. Real-feel content in every example — Indian and global names, realistic dates.
Never lorem ipsum. Error copy states **what is wrong AND how to fix it**.

**5.8 Trust & safety and audit.** Report/block paths, the moderation queue, CSAM hash-matching on
upload, and the per-memory access log are R1, not later. Every privacy-relevant action writes an audit
entry — show that edge.

---

## 6. Deliverable 4 — matrices

Rendered as HTML tables in the artifact (section 29), using its existing `<table>` / `<table class="tight">` styling.

**A. Navigation matrix** — every meaningful transition:

| From | Action | Condition | Destination | Outcome | Release |
|---|---|---|---|---|---|
| `/app/capsule/new` | Seal | valid, within horizon | `/app/capsule/[id]` | success | R1 |
| `/app/capsule/new` | Seal | unlock date in past | stays | `VALIDATION_DATE_IN_PAST` | R1 |
| `/app/capsule/new` | Seal | horizon > 12 mo, free tier | paywall sheet | `QUOTA_CAPSULE_HORIZON_EXCEEDED` | R1 |
| `/app/capsule/new` | Seal | offline | stays | blocked, explained | R1 |
| `/c/[token]` | Open | before unlock date | stays | countdown, media withheld | R1 |
| `/c/[token]` | Open | link revoked | stays | `AUTHZ_SHARE_REVOKED` | R1 |

**B. State matrix** — one row per screen, one column per state (initial, loading, loaded, empty,
validation error, API error, offline, unauthorised, forbidden, session expired, submitting, retry,
confirmation, success), saying what the user sees and what actions remain available.

**C. Scenario matrix** — for every major action:
`action → validation → server action → success → failure → error code → retry policy → idempotency →
audit entry → next screen`.

**D. Role × capability matrix** — `owner` / `admin` / `contributor` / `viewer` / recipient / anonymous
/ staff against every guarded action, showing which produce `AUTHZ_ROLE_INSUFFICIENT` vs
`AUTHZ_NOT_A_MEMBER` vs a merged `AUTHZ_DENIED`.

---

## 7. Deliverable 5 — counts, checklist, gap report

**A. Screen count**, broken down by: marketing · auth & onboarding · onboarding quiz · home &
timeline · memory · capsule · members & occasions · search & notifications · settings · public
tokenised · subscription & paywall · admin · error & utility. Cross-total by release (R1/R2/R3) and by
implementation status (BUILT / SPECIFIED / ASSUMPTION). Reconcile your total against the blueprint's
stated "~115 screens" and explain any difference. Present the headline numbers as a `.cards c3` row
and the breakdown as a table, matching how the artifact presents counts elsewhere.

**B. Numbered screen list** with route, purpose, release, status.

**C. One master flowchart** connecting all surfaces (a subgraph per surface; keep R2/R3 in a visually
distinct subgraph).

**D. Per-screen diagrams**, grouped by surface.

**E. The four matrices.**

**F. Implementation & QA checklist** — one line per flow, per state, per error code, phrased so a QA
engineer can turn each line into a test case directly.

**G. Gap report.** Explicitly list:

- Unreachable screens (no entry point), dead ends (no exit), and inconsistent navigation
- Flows specified in one document and contradicted in another
- Every `NEW-CODE-NEEDED` from §5.2
- Every `ASSUMPTION` you introduced
- Open questions that block a flow (A-4 legacy verification, A-5 music licensing, A-6 fulfilment,
  A-7 wind-down policy) — cross-reference the artifact's existing section 20, "Decisions still open",
  and do not duplicate what is already listed there

**Known conflict you must address, not paper over:** `Docs/client/01` §2.1 M1 specifies **passwordless
auth** (email OTP, passkeys/WebAuthn, Google/Apple OAuth), and `packages/shared/src/errors.ts` carries
no password-reset codes at all. But blueprint §29.3 / §29.5 / §29.6 specify a password field, a
strength meter, "Forgot password?" and a `/reset/[token]` flow. These cannot both be built. Treat the
client documentation as authoritative (passwordless), diagram the passwordless recovery paths (lost
passkey → email OTP fallback → new passkey enrolment; lost access to the email address → support
path), and raise the discrepancy at the top of the gap section with a recommended resolution. Do not
quietly pick one.

---

## 8. Output — extending the existing artifact

**The artifact:** `https://claude.ai/code/artifact/ec2f57f7-68d6-4ff3-9034-f6c12a7dd034`
— *"Moments & Memories Architecture"*. Roughly 3.6 MB, sections 00–20, 29 diagrams, a left nav rail
with grouped links, and a hand-built design system in a single inline `<style>` block.

### 8.1 Working method — additive, never a rewrite

1. `Artifact` with `action: "read"` and that `url`. Because the page is large it is saved to a local
   HTML file and the result tells you the path. **Read that file** — do not work from the head excerpt.
2. Copy it to a working path you control (e.g. `Docs/development/prompts/.work/architecture.html`, or
   your scratchpad) and make **surgical insertions** with `Edit`. The file is ~3.6 MB: never
   regenerate it, never `Write` it wholesale, never truncate it, never "summarise" existing sections.
   Every existing byte you did not deliberately change must survive.
3. Publish with `Artifact`, passing the working `file_path` **and** `url` set to the artifact URL
   above, so it updates in place instead of creating a second artifact. Keep `<title>Moments &amp;
   Memories Architecture</title>` and the existing favicon unchanged — a changed title or icon reads
   as a different document.
4. Because this is a large multi-pass edit, publish once at the end of each surface's section rather
   than after every plate, and re-read the artifact if a republish notice arrives.
5. Load the `artifact-design` skill before writing, and `artifact-diagramming` before drawing.

**Budget:** the rendered page must stay under 16 MB. The additions below are text and Mermaid source,
so this is not tight — but do not embed images, and do not inline any external library. Mermaid
renders natively in artifacts; `<pre class="mermaid">` is all that is needed.

### 8.2 Where the new material goes

Add **eleven new sections, numbered 21–31**, appended after the existing section 20. **Do not
renumber sections 00–20** — their numbers are literal text in twenty `.eyebrow` paragraphs and twenty
nav links, and renumbering them is pure risk for no reader benefit.

| # | Section id | Title | Contains |
|---|---|---|---|
| 21 | `screens` | Every screen, every state | Deliverable §2 — inventory tables per surface |
| 22 | `flowmap` | The application as one map | Master flowchart + navigation matrix |
| 23 | `flow-auth` | Sign-up, verification, sign-in | Auth & onboarding per-screen plates |
| 24 | `flow-app` | Home, timeline, memory, capture | App core per-screen plates |
| 25 | `flow-capsule` | Seal, deliver, unlock | Capsule plates + `CapsuleState` state machine |
| 26 | `flow-public` | The recipient who has no account | `/c/[token]`, `/s/[token]` plates |
| 27 | `flow-account` | Settings, account, subscription | Settings/plan/export/delete plates |
| 28 | `flow-admin` | The admin console | Moderation, users, health plates |
| 29 | `matrices` | Navigation, state and role matrices | Deliverable §6 |
| 30 | `qa` | Implementation & QA checklist | Deliverable §7F |
| 31 | `flowgaps` | Flow gaps & unresolved conflicts | Deliverable §7G |

Add **two new nav groups at the end of `<nav id="nav">`**, after the existing "Business" group,
following the exact existing markup:

```html
<div class="rail-group">Functional flows</div>
<a href="#screens"><span class="n">21</span><span>Every screen, every state</span></a>
<a href="#flowmap"><span class="n">22</span><span>The application as one map</span></a>
<a href="#flow-auth"><span class="n">23</span><span>Sign-up, verification, sign-in</span></a>
<a href="#flow-app"><span class="n">24</span><span>Home, timeline, memory, capture</span></a>
<a href="#flow-capsule"><span class="n">25</span><span>Seal, deliver, unlock</span></a>
<a href="#flow-public"><span class="n">26</span><span>The recipient with no account</span></a>
<a href="#flow-account"><span class="n">27</span><span>Settings, account, subscription</span></a>
<a href="#flow-admin"><span class="n">28</span><span>The admin console</span></a>

<div class="rail-group">Flow assurance</div>
<a href="#matrices"><span class="n">29</span><span>Navigation &amp; state matrices</span></a>
<a href="#qa"><span class="n">30</span><span>Implementation &amp; QA checklist</span></a>
<a href="#flowgaps"><span class="n">31</span><span>Flow gaps &amp; conflicts</span></a>
```

### 8.3 Section markup — copy the existing pattern exactly

```html
<!-- ══════════════ SCREENS ══════════════ -->
<section id="screens" class="band">
  <p class="eyebrow">21 &nbsp;/&nbsp; Every screen, every state</p>
  <h2>…a real headline, not a label…</h2>
  <p class="deck">…one paragraph saying what this section settles…</p>
  <div class="prose"> … </div>
  …tables, plates, cards…
  <hr>
</section>
```

Use only classes that already exist in the document: `.band`, `.eyebrow`, `.deck`, `.prose`,
`.cards c3` / `.card`, `.note` with `.note-h`, `<table>` and `<table class="tight">`, `.plate`,
`.figwrap`, `.plate-note`, `.atlas`, `<code>`. **Do not add new CSS, new colours, new fonts, or a new
component vocabulary.** If something genuinely cannot be expressed with the existing kit, add a
minimal rule to the end of the existing `<style>` block using the existing custom properties
(`var(--ink)`, `var(--line)`, `var(--accent-txt)`, …) — never a hard-coded hex.

### 8.4 Diagram plates — the exact required shape

```html
<figure class="plate" id="d-flow-login">
  <div class="figwrap">
    <pre class="mermaid">%%{init:{"theme":"base","themeVariables":{ … }}}%%
flowchart TD
  …
</pre>
  </div>
  <p class="plate-note"><b>Plate 25</b> &middot; …one line of orientation…</p>
  <figcaption>
    <b>A claim in bold.</b> …two or three sentences explaining what the diagram means, what to
    look at, and — best of all — what deliberately does <em>not</em> connect…
  </figcaption>
</figure>
```

Rules:

- **Plate numbering continues from 25.** Plates 01–24 are taken.
- **Copy the `%%{init:…}%%` block verbatim** from an existing plate of the same diagram type — there
  are two variants in the document, one tuned for `flowchart`/`stateDiagram` and one for
  `sequenceDiagram`. Do not invent theme variables and do not omit the init block: the plates sit on
  a constant light background in both themes by design, and an unthemed diagram will look broken in
  dark mode.
- Reuse the existing `classDef key` / `classDef store` convention to highlight the one or two nodes
  that carry each flow (the coral highlight is used sparingly and deliberately).
- `figcaption` must add information. The existing captions state a claim and then point at what the
  diagram does *not* show; match that. A caption that restates the node labels is not acceptable.
- Every `id="d-…"` must be unique and prefixed `d-flow-` for these new plates.

### 8.5 Counters you must update — the easiest thing to get wrong

Three places state the diagram count, and all three must move together:

1. Hero status bar: `<div><dt>Diagrams</dt><dd>29</dd></div>` → the new total.
2. Section 03 heading: `<h4>Diagram index &mdash; 29 diagrams</h4>` → the new total.
3. The `.atlas` grid in section 03 — **add an entry for every new plate**, in the existing format:
   `<a href="#d-flow-login"><b>Sign-in, all branches</b><span>flowchart &middot; 23</span></a>`

Also check the hero paragraph that reads "Looking for the diagrams? Every one of the 29 is indexed in
section 03" and the `.rail-foot` line, and update anything that has gone stale.

### 8.6 Voice

Match the surrounding document. It is declarative and reasoned — it states a decision, then the
constraint that forced it, and it names what was rejected. It uses em-dashes, `<code>` for
identifiers, and never hedges. It does not use bullet-point filler where a sentence works, and it
never uses marketing language about its own thoroughness. Follow the copy rules in §5.7 in every
user-facing string you quote.

### 8.7 Definition of done

- All eleven sections present, in order, each ending with `<hr>`
- Nav rail updated with both new groups; every anchor resolves
- All three counters updated; every new plate has an `.atlas` entry
- Every plate renders (valid Mermaid, init block present, unique id)
- No existing section altered except the nav, the counters and the atlas
- Published to the **same URL** with the same title and favicon
- After publishing, re-read the artifact and verify the plate count and a sample of anchors

The result must be detailed enough that an engineer can implement the flow without asking a question,
and a QA engineer can write the test suite from the diagrams alone — and it must read as though it
was part of the document from the beginning.
