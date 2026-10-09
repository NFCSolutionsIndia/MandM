# 01 — Product & Features

← [Documentation index](README.md)

---

## 1. What the product is

### 1.1 The proposition

Moments & Memories is a pair of private native mobile apps for keeping a family's memories — and,
distinctively, for **delivering a message on a date that may be decades away**.

Three promises, in the order the product emphasises them:

| # | Promise | What it means in practice |
|---|---|---|
| 1 | **Preserve** | Photos, video and voice recordings kept privately, at original quality, with the story attached — not just the file. |
| 2 | **Deliver later** | Seal a memory for a named person and a chosen future moment. It arrives. They open it. They can reply. |
| 3 | **Pass on** | The archive outlives the person who built it, and can be inherited. *(Release 3, legally gated — see §6.)* |

### 1.2 The problem it solves

Consumer photo storage solved *storage* and left *meaning* unsolved. A phone camera roll is
forty thousand undifferentiated images with no note about why any of them mattered, no
structure a grandchild could navigate, and no mechanism for the one thing people most want to
do with a memory: give it to someone at the right moment in the future.

Moments & Memories treats the note, the date it happened, and the person it was for as
first-class data — not metadata bolted onto a file.

### 1.3 Who it is for

| Segment | Why they come | What they need most |
|---|---|---|
| **Parents of young children** | Wanting to speak to a child at 18, 21, at their wedding | Long-horizon scheduling that they trust |
| **Adult children of ageing parents** | Capturing a parent's voice and stories before they are lost | Voice notes on old photos; easy capture for a non-technical relative |
| **Extended families, India-first** | Festivals, anniversaries, distributed relatives | Occasions engine, multi-channel delivery, shared collections |
| **The archivist of the family** | The one person who holds the shoebox of photographs | Bulk import, dates with imprecision, a structure that survives them |

Accessibility is a functional requirement, not a checkbox: **grandparents are core users.**
That is why the UI is built on Radix primitives and holds to WCAG 2.2 AA with a 44×44px
minimum touch target, and why heavyweight scroll-hijacking and WebGL effects were rejected
outright for the app surface.

### 1.4 The core loop

Everything in the early phases exists to serve this loop, and the loop is also the growth
engine — every delivered capsule introduces the product to someone who did not sign up for it:

```
capture a moment
   → seal it for a person and a date
      → it reliably arrives
         → they open it (no account needed)
            → they reply
               → they seal one of their own
```

---

## 2. Release 1 — "The Promise"

**~26–30 weeks** for 2–3 engineers, 1 designer, part-time PM. Compressed realistic target
~22–24 weeks. Detail and dependencies: [06 — Delivery Roadmap](06-DELIVERY-ROADMAP-AND-BUSINESS-PLAN.md).

### 2.1 The MVP feature set

Seventeen features, deliberately tight. Complexity scale: **S** days · **M** 1–2 weeks ·
**L** 3–6 weeks.

| # | Feature | What it does | Why it is in the MVP | Cx |
|---|---|---|---|---|
| M1 | **Passwordless auth** | Email OTP, passkeys (WebAuthn), Google/Apple OAuth | Nothing works without identity, and a password is a liability on a lifetime vault — something to phish, leak, reuse or forget | M |
| M2 | **Personal vault** | The private container that owns every memory | The core promise of a private place; also the single security boundary every permission check resolves to | S |
| M3 | **Create memory** | Media + title + *the date it happened* + a note | The atomic unit of the product. The "when did this happen" field is what separates an archive from an upload folder | M |
| M4 | **In-app capture** | Photo, video and voice recorded inside the app | The emotional payload is a voice or a face, not a JPEG | M |
| M5 | **Resumable, offline-tolerant upload** | Chunked multipart upload, local queue, background sync | Mobile uploads fail constantly; one lost upload destroys trust permanently | L |
| M6 | **Timeline: Past → Present → Future** | A scrollable chronology that extends *forward* to show pending capsules | The product's identity. Being able to see what is still coming is the single best idea in the concept | L |
| M7 | **Memory detail view** | Full-screen viewer — media, note, date, people | Where the memory is actually experienced | M |
| M8 | **Time capsule: seal + schedule** | Address a memory to recipients and an unlock date, then lock it | **The differentiator. Without it there is no product.** | L |
| M9 | **Durable delivery engine** | Persisted schedule, worker, email delivery, durable unlock link, retries, sender receipt | The promise *is* the delivery. It must be an engineered guarantee, not a cron job | L |
| M10 | **Recipient unlock experience** | A ceremonial, no-account-needed open page, plus a reply | The delivery moment is the product, and it is the growth loop | M |
| M11 | **Private share link** | Expiring, revocable link; viewable without an account | Family will not sign up to see one photo | M |
| M12 | **On This Day** | Date-matched resurfacing on home and in a weekly push | The cheapest and strongest retention mechanic available, and it needs no AI | S |
| M13 | **Push + email notifications** | APNs and FCM + transactional email | A scheduled-delivery product cannot function without them | M |
| M14 | **Store release + on-device store** | App Store and Play listings, on-device SQLite, cached thumbnails, offline reads | The apps are the product surface; this is what makes them usable on a train | M |
| M15 | **Privacy controls + audit trail** | Per-memory visibility, a "who can see this" panel, instant revocation, an access log | The product asks for the most sensitive data a person owns. Control has to be *verifiable*, not asserted | M |
| M16 | **Profile, export, delete** | Full data export and hard account deletion | Legally required, and a core trust signal — "I can leave and take everything with me" | M |
| M17 | **Storage quota + checkout** | Free tier limit, paid tier, hosted checkout, billing portal | Media costs real money from day one | M |

### 2.2 What Release 1 adds on top of the MVP

Five additions that are cheap now and expensive to retrofit later:

| Addition | Why it cannot wait |
|---|---|
| **Occasions / Events engine** — month and agenda views, recurrence, reminder offsets | The Event is the trigger for memory prompts, capsule scheduling, broadcasts and gift suggestions. Retrofitting a first-class recurring event after those features reference occasions is **a migration, not a feature.** |
| **Members** — relationships, birthdays, interests, manual add and vCard/CSV import | Capsules are addressed to people. Also the reason iOS support needs four co-equal import paths (see §5.2). |
| **Age-milestone unlock** — "open when Aarav turns 18" rather than a raw date | How people actually think about the future. Nearly free once Events and Members exist. |
| **Reactions and the thank-you loop**, including voice replies | Closes the emotional loop and is the primary organic growth mechanism. |
| **Minimum viable trust & safety** — report/block, admin moderation queue, CSAM hash-matching on upload | A media service without a report path and a takedown workflow is a legal exposure from its first public user. |

Plus: onboarding personalization quiz · notification centre with per-category preferences and
quiet hours · privacy centre with WebAuthn app lock and vault PIN · global search ·
Free/Premium subscription with Stripe + Razorpay · the marketing site · and the Release 1
slice of the admin console.

**Explicitly not in Release 1:** any commerce, group gifting, broadcasts, collaborative
memories, legacy vault, marketplace, referral program, streaks.

---

## 3. Release 2 — "Together"

**~12–16 weeks.** The theme is multi-player: the family archive is inherently more than one
person.

| Feature | What it does | Why now, not earlier |
|---|---|---|
| **Shared vaults & family circles** | Multiple members contribute to one collection, with roles | Drives organic growth, but needs the single-user model proven first |
| **Collaborative memories** | Invite N people to each record a clip; auto-assemble into one montage | The strongest acquisition loop in the concept — group gifts become effortless |
| **Broadcasts with festival packs and merge tags** | One message, many recipients, localized and templated | High value in an India-first market; requires the Events engine from R1 |
| **Multi-channel delivery expansion** | WhatsApp Business API and SMS with the full escalation cascade | Solves stale contact details on a 20-year horizon |
| **Family plan tier** | Pooled storage, multiple seats | Households pay far more readily than individuals |
| **Semantic search** | Natural-language search over auto-captions and transcripts | "Happy times at the beach" — the most useful AI promise, and it needs an archive to work on |
| **Transcription, auto event grouping, auto recaps** | Voice → text; same-day media clustered and auto-titled; Year in Review videos | Recurring, notification-worthy delight |
| **Suggested capsules and memory prompts** | The product asks the right question at the right moment | Converts the Events engine into engagement |
| **Wishlists per member** | Initially curated links, no inventory | Validates gift intent at near-zero cost before R3 commits to retail |
| **Streaks, badges, referrals** | Light gamification | *Design constraint: streaks must never punish.* No loss aversion, no "you broke your streak", and one switch that hides all of it |
| **Annual reassurance report** | A yearly email: what is stored, what is pending, the delivery plan, a contact-freshness check | Answers the invisible-churn problem of a decade of silence |

---

## 4. Release 3 — "Gifting & Legacy"

**~16–20 weeks — and a business decision as much as an engineering one.**

| Feature | Status and gating |
|---|---|
| **Full gift shop** — catalog, product pages, cart, checkout, orders, tracking, returns | Adds ~16 entities, roughly a third of the entire data model, to serve a business the product has not yet validated. **Recommendation: launch gifting as curated affiliate / dropship links from the wishlist and occasion surfaces first.** The same product-page and shelf designs are reused later. Owning inventory is a decision to become a retailer; it should follow evidence, not precede it. |
| **Group gifting** | Depends on commerce. Includes an auto-refund path, which is the part usually underestimated. |
| **Legacy Vault & Nominees**, with the full unlock protocol | **Blocked on legal counsel per jurisdiction.** Needs death verification, a KYC provider, a waiting period, a second-nominee confirmation, a dispute path, and human operations. Shipping this badly is worse than not shipping it. |
| **Template and sticker marketplace, licensed music library** | Blocked on a real commercial music licensing commitment. |

### 4.1 Longer-horizon candidates

Documented, not scheduled: AI narrative stories · AI generative cards and posters · physical
card fulfilment · family tree / multi-generation graph · **import from Google Photos, iCloud
and Instagram** (removes the single biggest adoption barrier) · duplicate detection by
perceptual hash · Kotlin Multiplatform for a shared domain layer, if the apps drift · an end-to-end
encryption tier · public memorial pages.

**Face grouping is deliberately absent from every release covered here.** It is the highest-value
organisation axis and simultaneously the single largest legal risk in the inherited feature
list. Biometric statutes in Illinois, Texas and Washington, plus GDPR, mean it requires
separate explicit consent, a retention schedule, a deletion path, and geo-gating. It must not
slip into an early release by accident.

---

## 5. The user experience

### 5.1 Journeys

**New user → first sealed capsule.** Landing page → sign up with a passkey or an emailed code
→ a three-step personalization quiz → land in an empty app with one clear invitation → capture
or select a photo → answer "when did this happen?" → save (the memory is on the device before
a single byte uploads) → the prompt to seal it for someone → pick a person and a date → see a
plain-language summary of exactly what will happen and when → seal.

**Recipient.** An email arrives — built with table layout and inline CSS so it renders in mail
clients that will not exist for fifteen years. It contains a durable link. Before the unlock
date, that link shows a countdown revealing only the sender's name and the date; **never the
media.** On the date, the same link opens the memory. There is a reply box. **No account is
ever required** — requiring one at that moment would be the cruellest possible product
decision.

**Returning user.** Open the installed app; it renders instantly from cache with no network.
Home shows On This Day, upcoming occasions, and pending capsules with live countdowns.

### 5.2 Mobile-first and the honest platform limits

The product is one native mobile apps rather than native apps. That is the right trade for a
small team, and it has consequences the design accounts for openly rather than discovering
late:

| Limit | Consequence designed in |
|---|---|
| **Push permission can be declined, and a device token can die** | Re-prompting is a one-shot on both platforms, and **email is the guaranteed fallback for every critical notification** |
| **Contact Picker is unavailable on iOS/Safari** | Member import needs four co-equal paths: manual add, vCard/CSV upload, self-service invite links, and Contact Picker where it exists |
| **No haptics on iOS** (Vibration API is Chromium-only) | No interaction depends on haptic feedback |
| **No SMS auto-read on iOS** (WebOTP is Chromium-only) | OTP entry is designed for manual typing on every platform |

**Upside of the apps choice:** web checkout instead of store billing — no 15–30% platform
commission, full pricing control, and immediate plan changes.

### 5.3 Offline behaviour

| Works offline | Deliberately blocked offline |
|---|---|
| Open the app instantly from the cached shell | **Sealing a capsule.** A promise that cannot be confirmed server-side must never be shown as sealed. |
| Read recent memories, metadata and cached thumbnails | |
| Capture photo, video and voice | |
| Create and edit memories — queued in the local outbox and synced on reconnect | |
| Uploads continue across navigations, owned by the background sync layer rather than the page | |

Every queued write carries an idempotency key, so a retry after an ambiguous failure cannot
create a duplicate. The queue UI is honest: *"2 of 5 uploaded — we will finish when you are
back online."*

### 5.4 Screen inventory

| Surface | Scope |
|---|---|
| **App** | ~85 screens, each specified in default, loading, empty, error and success states, in light and dark (~400+ design frames) |
| **Marketing site** | Landing, how-it-works, legacy, pricing, privacy & security, blog, support — desktop / tablet / mobile |
| **Admin console** | ~30 screens including permission-locked states |
| **Flows** | 8 user-flow diagrams plus an architecture poster |

Every frame is tagged R1 / R2 / R3 so engineering builds in waves against one design file.

**Content rule, and it is enforced:** real-feel content only — Indian and global names,
realistic dates, genuine emotional copy. **Never lorem ipsum.** And **never call a memory a
"file", an "asset" or a "record"** in anything a user reads.

---

## 6. Feature availability by release

| Capability | R1 | R2 | R3 |
|---|:--:|:--:|:--:|
| Passwordless auth, personal vault | ● | | |
| Create memory, timeline, detail view, On This Day | ● | | |
| In-app capture, resumable upload, transcode pipeline | ● | | |
| **Time capsules: seal, schedule, deliver, unlock, reply** | ● | | |
| Age-milestone unlock | ● | | |
| Members, Occasions/Events engine | ● | | |
| Private share links, privacy centre, audit log | ● | | |
| Push + email notifications, notification centre | ● | | |
| Native mobile apps, offline reads, offline capture | ● | | |
| Export, account deletion | ● | | |
| Free / Premium subscription, Stripe + Razorpay | ● | | |
| Trust & safety: report, block, moderation queue, CSAM matching | ● | | |
| Keyword search | ● | | |
| Shared vaults, albums, roles | | ● | |
| Collaborative memories | | ● | |
| Broadcasts, festival packs, merge tags | | ● | |
| SMS + WhatsApp delivery cascade | | ● | |
| Semantic search, transcription, event grouping, recaps | | ● | |
| Family plan, streaks, badges, referrals, wishlists | | ● | |
| Gift commerce, group gifting | | | ● |
| Legacy Vault, nominees, unlock protocol | | | ● |
| Marketplace, licensed music, memorial pages | | | ● |
| **Face recognition** | — | — | — *(not built in any release covered here)* |

---

## 7. What we will not build

Stating this is as important as the feature list, because each of these would be an easy yes
that damages the product.

| Anti-feature | Why not |
|---|---|
| **A social feed** | No followers, no likes from strangers, no algorithmic timeline. The product's value is privacy; a feed destroys it. |
| **Public profiles** | Nothing is public by default, ever. |
| **An ad-supported free tier** | "No ads. No data mining." is a competitive asset. Keep it. |
| **A full video editor** | "No complex editing required" is a stated feature. Templates and auto-assembly only. |
| **General cloud storage / a file manager** | No documents, no folders, no arbitrary file types. Memories only. |
| **"Unlimited" storage** | Retired deliberately. A single user with 2 TB of 4K video costs real money every month, forever, against a modest subscription — and this product's users never delete anything, by design. Generous honest tiers beat an unlimited promise that must later be broken. **Breaking a storage promise is fatal for a company whose product is trust.** |

---

## 8. Claims that must be corrected before launch

The inherited marketing surface makes several claims the built product does not support. All
of them are scheduled for correction in PHASE-10, and the correction is treated as a launch
blocker rather than a copy edit:

- **"Unlimited storage forever"** → replaced by honest, generous tiers.
- **Implied end-to-end encryption** ("military-grade security ensures your private vaults
  remain strictly yours") → the privacy page must state plainly that with server-side
  thumbnailing, transcoding and search, the service *can* technically read content. E2E
  encryption is offered later as an explicit opt-in tier with its trade-offs stated.
- **The heir/inheritance feature** presented as available → it is Release 3 and legally gated.
- **Fabricated testimonials** → removed.

> Overstating what is built is both a legal risk and a betrayal of the specific trust this
> product sells. A trust product cannot afford a marketing claim it has to walk back.

---

← [Documentation index](README.md) · Next: [02 — Technology Decisions](02-TECHNOLOGY-DECISIONS.md)
