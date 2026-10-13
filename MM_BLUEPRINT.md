# Moments & Memories — New PWA Product Blueprint

**Source of analysis:** `e:\M&M\MomentsAndMemories` (read-only product reference — not a conversion target)
**Date:** 2026-08-26
**Status:** Product blueprint + development plan. No implementation code.

---

## 0. EVIDENCE BASE — WHAT THE EXISTING REPOSITORY ACTUALLY IS

Before any product conclusions, the honest technical read:

| Fact | Evidence |
|---|---|
| It is a **static marketing website**, not an application | `next.config.ts` → `output: 'export'`; `.github/workflows/nextjs.yml` deploys `./out` to GitHub Pages |
| **No backend exists** | Zero `route.ts`, zero `/api`, no Prisma/Drizzle/Supabase/Firebase, no `.env*` files |
| **No authentication exists** | No auth library, no login/signup route, no session handling |
| **No database exists** | No schema, migrations, or ORM anywhere |
| **It is NOT a PWA** | No `manifest.json`, no service worker, no `next-pwa`/Serwist, no offline handling, no install prompt |
| **The only form is inert** | `LeadGenForm.tsx:31` → `onSubmit={(e) => e.preventDefault()}` — name/email/message go nowhere |
| **All content is hardcoded** | Every feature, testimonial, price, and stat is a literal in a `const` array |
| **Heavy animation stack** | GSAP + ScrollTrigger, Framer Motion 12, Lenis smooth scroll, Three.js (GLSL shader hills, WebGL fluid "splash cursor"), custom cursor, image trail |
| **Component library is borrowed** | `cinematic-landing-hero.tsx` still carries default props from a sobriety-tracker template ("Days Sober", "Start your recovery.", "12-step program") |
| **Dead code present** | `HeroSection.backup.tsx`, `SendCardsSection`, `CardTemplatesSection`, `WhyChooseUsSection` are unreferenced; `BottomDockNavbar` is never mounted in `layout.tsx`; `update_paths.js` / `update_paths.py` are one-off basePath rewrite hacks |
| **Repo maturity** | 10 commits total; README is unmodified `create-next-app` boilerplate |

**Conclusion:** this repository is a *pitch*, not a product. It describes an application that has not been built. That is ideal for this exercise — the marketing copy is an unusually complete requirements document written in the voice of the customer.

**Critically: the copy positions the real product as a native mobile app** ("Simply download the M&M app", "Download for iOS", "Download for Android", "Biometric App Lock", "Available on iOS, Android, and Web"). The new PWA must therefore deliver app-class experience on the web, because the promise the audience has already been shown is an app promise.

---

## 1. UNDERSTANDING THE EXISTING PRODUCT

### What is this application?

**M&M (Moments & Memories)** is positioned as an *emotional memory preservation and future-delivery platform*. Its own metadata says it plainly:

> "M&M is an AI-powered memory platform where people preserve their life's most meaningful moments." — `src/app/layout.tsx`

It is not a photo backup tool. The copy explicitly rejects that framing:

> "Most platforms store your files. We preserve your feelings." — `StorytellingSection`
> "More than just cloud storage." — `OurApproachSection`
> "M&M is unlike any cloud storage I've ever used." — testimonial

### What does it do? Three promises, in order of emphasis

1. **Preserve** — a private, encrypted, high-resolution "Legacy Vault" holding photos, videos, and voice, organized on an interactive timeline.
2. **Send forward in time** — record a memory today, schedule it to unlock and be delivered on a future date, up to decades away ("Can I schedule a video for 20 years from now?" → "Yes").
3. **Transform** — AI turns raw media into cinematic recaps, narrated stories, posters, and greeting cards.

Underneath all three sits a fourth: **inherit** — assign heirs so the vault survives its owner ("Family Legacy", "Heir Assignment", "Legacy Transfer", "Generations").

### What problem does it solve?

Stated directly on the About page:

> "…realized their most precious memories were getting lost in endless camera rolls." — `src/app/about/page.tsx`

The problem is threefold:

- **Loss by volume.** 40,000 undifferentiated photos is not a memory; it is a landfill.
- **Loss by mortality and time.** The context, the voice, the *why* dies with the person. Cloud accounts lapse. Nobody inherits a Google Photos password.
- **Loss of intent.** You cannot currently say "give this to my daughter on her 18th birthday" with any confidence it will actually arrive.

### Who are the target users?

Inferred from the testimonial personas, which the repo names explicitly:

- **James Carter, "Father of two"** — the primary persona. A parent recording forward for children.
- **Anna Martinez, "Family Historian"** — the archivist in every family; the one who owns the shoebox of photos.
- **Emily Davis, "Grandmother"** — the elder generation sending down; also the *reason* the archivist acts.
- Implied fourth: **the recipient** — the child who opens the capsule 13 years later. Not a customer, but the person whose experience creates every referral.

Secondary signals: US-centric (Chicago `(312)` area code in the footer, USA travel-poster asset), family and life-event oriented (weddings, graduations, baby showers, anniversaries, memorials, pets).

### What is the core user experience?

The copy's own four-step description (`ProcessSection`) is the cleanest statement of the loop:

> **01 Record** — "Capture video, voice, or photos directly in the app. No complex editing required."
> **02 Schedule** — "Pick the exact date and time, whether it's tomorrow or ten years from now."
> **03 Secure Vault** — "Your memory is encrypted and stored safely until the delivery condition is met."
> **04 Perfect Delivery** — "Multi-channel routing ensures they receive it via App, WhatsApp, or Email."

That is the product. Everything else — AI, cards, galleries — is amplification.

### Primary use cases (all evidenced in the repo's own feature and asset lists)

1. Record a message for a child to receive on a milestone birthday, graduation, or wedding.
2. Build a permanent, organized family archive that outlives you.
3. Turn an event's raw media into a shareable cinematic recap.
4. Collaboratively assemble a montage from many family members' clips.
5. Send a personalized card or poster for an occasion.
6. Create a memorial tribute for someone who has died.
7. Rediscover forgotten moments ("On This Day", "Year in Review").

### What makes the product useful, and why would a user return?

This is the most important product question in the analysis, and the repo answers it — in the `ShowcaseSlider` testimonial:

> "I recorded a video for my daughter's 18th birthday when she was just five. Watching her unlock it 13 years later was the most profound experience of our lives."

**The return driver is not storage. It is anticipation and arrival.**

- Storage is a *store* — you visit once and forget. Retention is near zero.
- A **pending future delivery** is an open emotional loop. It pulls the creator back (add more, check the date, record another) and it recruits new users at the moment of delivery, because the recipient must come to the product to open it.
- **"On This Day" and Smart Recaps** are the secondary return driver — the product reaching *out* to the user rather than waiting to be visited.

Any MVP that ships the vault without the capsule ships a product with no retention mechanic. That single insight drives the MVP boundary in §23.

---

## 2. COMPLETE FEATURE EXTRACTION

Legend — **[E]** Explicit (described in repo) · **[I]** Inferred (strongly implied) · **[R]** Recommended (not present; proposed for the new product)

> **Note on CURRENT STATUS:** in this repository nothing is functionally implemented. "Marketing copy only" means the feature is described to prospective customers but has no code behind it. This is stated per-feature so that no feature is mistaken for existing capability.

### 2.1 Vault and Preservation

**FEATURE:** Legacy Vault (private encrypted container) **[E]**
- **DESCRIPTION:** A personal secure vault for life moments. "Securely upload and store your most treasured life moments in a vault designed to outlast generations, protected by bank-level encryption."
- **USER VALUE:** Confidence that irreplaceable media will not be lost, leaked, or mined.
- **WHERE DISCOVERED:** `OurApproachSection` item 01; `FAQSection` Q1; `EngineStatistics` ("256-bit AES Encryption — Military-grade security ensures your private vaults remain strictly yours"); `PricingSection`.
- **CURRENT STATUS:** Marketing copy only. No storage, encryption, or vault entity exists.
- **IMPORTANCE:** **CORE**

**FEATURE:** High-resolution / original-quality storage, no compression **[E]**
- **DESCRIPTION:** Categories "High Resolution", "No Compression"; "4K Video Quality"; "/ high-res" capture; "original quality uploads".
- **USER VALUE:** The archive is the master copy, not a degraded thumbnail — a real differentiator against free consumer clouds that recompress.
- **WHERE DISCOVERED:** `OurApproachSection`, `FeaturesSection` ("Capturing. / high-res"), `PricingSection`, `/pricing`.
- **CURRENT STATUS:** Marketing copy only.
- **IMPORTANCE:** **IMPORTANT**

**FEATURE:** Unlimited storage on paid tier **[E]**
- **DESCRIPTION:** "Unlimited Storage — Never worry about space. Your lifetime of memories is stored forever."
- **USER VALUE:** Removes quota anxiety.
- **WHERE DISCOVERED:** `EngineStatistics`, `PricingSection` ("Unlimited Memories"), `/pricing`.
- **CURRENT STATUS:** Marketing copy only. **Commercially dangerous promise — see §17.**
- **IMPORTANCE:** **OPTIONAL** as literally stated; the need it serves is IMPORTANT.

**FEATURE:** In-app capture (video / voice / photo) **[E]**
- **DESCRIPTION:** "Capture video, voice, or photos directly in the app. No complex editing required."
- **USER VALUE:** Removes the friction gap between intention and artifact. Voice and video are what make a memory *emotional* rather than documentary.
- **WHERE DISCOVERED:** `ProcessSection` step 01.
- **CURRENT STATUS:** Marketing copy only.
- **IMPORTANCE:** **CORE**

**FEATURE:** Biometric app lock **[E]**
- **DESCRIPTION:** Listed as a premium feature.
- **USER VALUE:** Device-level privacy for intimate content on a shared or family device.
- **WHERE DISCOVERED:** `PricingSection` premium list.
- **CURRENT STATUS:** Marketing copy only.
- **IMPORTANCE:** **OPTIONAL** (V1 — achievable in a PWA via WebAuthn platform authenticator)

### 2.2 Time Capsules and Future Delivery — the differentiator

**FEATURE:** Scheduled future delivery / time capsule **[E]**
- **DESCRIPTION:** "Record messages today and set them to unlock years from now for birthdays, graduations, or weddings." "Pick the exact date and time, whether it's tomorrow or ten years from now."
- **USER VALUE:** The only reliable way to speak to someone in the future. This is the product's emotional core and its moat.
- **WHERE DISCOVERED:** `OurApproachSection` item 03 ("Time Capsule", "Future Delivery", "Milestones"); `ProcessSection` 02; `FeaturesSection` ("Time Capsules. / future delivery"); `TimelineSection` ("Future — Schedule a legacy message for tomorrow"); `FAQSection` Q2; `ShowcaseSlider` ("Memory Sealed" / "Memory Unlocked").
- **CURRENT STATUS:** Marketing copy only.
- **IMPORTANCE:** **CORE**

**FEATURE:** Long-horizon durability (decades) **[E]**
- **DESCRIPTION:** "Our architecture is designed for long-term preservation. You can schedule a memory to be delivered tomorrow, or decades into the future."
- **USER VALUE:** Trust. The entire value proposition collapses if a 20-year promise is not credible.
- **WHERE DISCOVERED:** `FAQSection` Q2.
- **CURRENT STATUS:** Marketing copy only. **This is an institutional promise, not a feature — see §11 and §20.**
- **IMPORTANCE:** **CORE** as a trust requirement

**FEATURE:** Multi-channel delivery with failover (App / WhatsApp / SMS / Email) **[E]**
- **DESCRIPTION:** "We use a multi-channel delivery system (App, WhatsApp, SMS, Email). If one channel fails, we automatically attempt the next, ensuring a 99.9% delivery success rate."
- **USER VALUE:** Solves the real failure mode of a 20-year promise — the recipient's contact details change.
- **WHERE DISCOVERED:** `FAQSection` Q3; `ProcessSection` 04; `EngineStatistics` ("99.9% Delivery SLA"); `PricingSection` ("Priority Multi-channel Delivery").
- **CURRENT STATUS:** Marketing copy only.
- **IMPORTANCE:** **IMPORTANT** — MVP needs *one* reliable channel plus a durable link; the failover matrix is V1.

**FEATURE:** Delivery conditions beyond a date **[I]**
- **DESCRIPTION:** Copy repeatedly says "until the delivery condition is met" and "your specified delivery conditions" — broader than a timestamp. Implies event-triggered unlocks (a birthday, a milestone, death or inactivity).
- **USER VALUE:** "When she graduates" is how people actually think, not "2039-06-04".
- **WHERE DISCOVERED:** `ProcessSection` 03, `FAQSection` Q1 wording.
- **CURRENT STATUS:** Inferred from wording only; no mechanism described.
- **IMPORTANCE:** **IMPORTANT** (V1)

**FEATURE:** Recipient unlock experience **[I]**
- **DESCRIPTION:** `ShowcaseSlider` contrasts "Memory Sealed" and "Memory Unlocked"; the testimonial describes "watching her unlock it". A distinct, ceremonial recipient-side moment is implied.
- **USER VALUE:** The delivery moment *is* the product. A capsule that arrives as a plain email attachment destroys 13 years of accumulated value.
- **WHERE DISCOVERED:** `ShowcaseSlider`, `TestimonialSection`.
- **CURRENT STATUS:** Implied by UI states in a static slider; no recipient flow exists.
- **IMPORTANCE:** **CORE**

### 2.3 Family Legacy and Inheritance

**FEATURE:** Heir assignment / legacy transfer **[E]**
- **DESCRIPTION:** "Build a permanent digital legacy. Assign heirs to inherit your vault, ensuring your family's story is never lost." Categories: "Heir Assignment", "Legacy Transfer", "Generations". Dedicated route `/family-legacy`: "Pass down your life's story to the next generation, securely and beautifully."
- **USER VALUE:** Solves digital-estate loss — the most emotionally expensive failure in personal media today.
- **WHERE DISCOVERED:** `OurApproachSection` item 04; `src/app/family-legacy/page.tsx`; `LeadGenForm` ("seen only by authorized heirs").
- **CURRENT STATUS:** Marketing copy only. No mechanism, no verification model, no legal framework.
- **IMPORTANCE:** **IMPORTANT** — high differentiation, high legal and operational complexity. Deliberately deferred out of MVP (§23).

**FEATURE:** Family / multi-generation vaults **[E]**
- **DESCRIPTION:** "Customized legacy vaults for your unique family."
- **USER VALUE:** The archive is a household asset, not one person's folder.
- **WHERE DISCOVERED:** `AboutUsSection` step 02.
- **CURRENT STATUS:** Marketing copy only.
- **IMPORTANCE:** **IMPORTANT**

### 2.4 AI Features

**FEATURE:** AI Memory Stories / AI storytelling **[E]**
- **DESCRIPTION:** "Our engine weaves your scattered photos into beautiful, cohesive narratives." "Our advanced AI engines automatically stitch your photos and videos into emotional, cinematic recaps complete with licensed music."
- **USER VALUE:** Converts an unusable pile into something worth watching and sharing.
- **WHERE DISCOVERED:** `AiMemoriesSection`; `OurApproachSection` item 02 ("Smart Recaps", "Auto-Curation", "Facial Recognition"); `/pricing`.
- **CURRENT STATUS:** Marketing copy only.
- **IMPORTANCE:** **IMPORTANT**

**FEATURE:** Smart Recaps (auto monthly/yearly cinematic videos) **[E]**
- **DESCRIPTION:** "Monthly and yearly cinematic videos generated from your best moments." Also "Year in Review — stitch together the top 12 moments of the year into a cohesive, rhythmic recap video."
- **USER VALUE:** Zero-effort output; a recurring reason to open the app.
- **WHERE DISCOVERED:** `AiMemoriesSection`, `AICreationsSection`, `FeaturesSection` ("Cinematic Recaps. / storytelling", "Video Editing. / AI-powered").
- **CURRENT STATUS:** Marketing copy only.
- **IMPORTANCE:** **IMPORTANT**

**FEATURE:** "On This Day" resurfacing **[E]**
- **DESCRIPTION:** "Rediscover forgotten moments from exactly a year, or a decade ago."
- **USER VALUE:** Serendipity. Cheap to build, and the strongest habit-forming mechanic in the product.
- **WHERE DISCOVERED:** `AiMemoriesSection`.
- **CURRENT STATUS:** Marketing copy only.
- **IMPORTANCE:** **CORE** for retention — and note it needs no AI at all, only dates.

**FEATURE:** Emotional / semantic search **[E]**
- **DESCRIPTION:** "Search by feeling. 'Happy times at the beach' or 'Quiet winter mornings'."
- **USER VALUE:** Retrieval by how it felt, not by filename or folder — the natural way people recall memories.
- **WHERE DISCOVERED:** `AiMemoriesSection`.
- **CURRENT STATUS:** Marketing copy only.
- **IMPORTANCE:** **IMPORTANT**

**FEATURE:** Facial recognition / people grouping **[E]**
- **DESCRIPTION:** Listed as a category under AI Storytelling.
- **USER VALUE:** "Show me everything with Mum in it" — the highest-value organizing axis for family media.
- **WHERE DISCOVERED:** `OurApproachSection` item 02 categories.
- **CURRENT STATUS:** Marketing copy only. **Biometric identifier — significant legal exposure (Illinois BIPA, and the company's own footer number is a Chicago 312 area code; also Texas CUBI and GDPR Art. 9). See §11.**
- **IMPORTANCE:** **OPTIONAL / V2**, with explicit opt-in and jurisdiction gating.

**FEATURE:** AI generative creations — cards, posters, montages, reels **[E]**
- **DESCRIPTION:** 15 explicit prompt-driven categories with example prompts: Greeting Cards, Occasion Videos, Event Photos, Legacy Posters, Birthday Montages, Wedding Invitations, Anniversary Reels, Baby Showers, Graduation Recaps, Family Moments, Holiday Cards, Pet Highlights, Year in Review, Memorial Tributes, Engagements.
- **USER VALUE:** Turns a private archive into gifts and shareable artifacts — the outward-facing, viral surface of the product.
- **WHERE DISCOVERED:** `AICreationsSection` (full prompt list), `AIFeaturesCollage`, `/ai-memories`.
- **CURRENT STATUS:** Marketing copy only. The displayed assets are pre-made stock/Canva-style images, not generated output.
- **IMPORTANCE:** **IMPORTANT** — a strong V1 wedge, far too broad for MVP.

**FEATURE:** Auto-curation / smart organization **[E]**
- **DESCRIPTION:** "Smart organization for your entire timeline"; "Beautifully curated. Automatically organized."; "Supercharge your organization 10x faster."
- **USER VALUE:** The user never has to file anything.
- **WHERE DISCOVERED:** `AboutUsSection` step 01, `GallerySection`, `AIFeaturesCollage`, `CinematicHero` ("intelligent organization").
- **CURRENT STATUS:** Marketing copy only.
- **IMPORTANCE:** **IMPORTANT**

### 2.5 Collaboration, Sharing and Social

**FEATURE:** Collaborative memories (multi-contributor montage) **[E]**
- **DESCRIPTION:** "Our Collaborative Memories feature allows you to invite friends and family to record clips. We automatically stitch them together into one beautiful montage."
- **USER VALUE:** The highest-value *acquisition* feature in the product: one user's surprise-video project brings 15 contacts in.
- **WHERE DISCOVERED:** `FAQSection` Q4.
- **CURRENT STATUS:** Marketing copy only.
- **IMPORTANCE:** **IMPORTANT** — strong V1; arguably the growth engine.

**FEATURE:** Shared albums **[E]**
- **DESCRIPTION:** Category under "Emotional Connection": "Shared Albums", "Nostalgia", "Interactive Timeline".
- **USER VALUE:** Family members contribute to and view a common archive.
- **WHERE DISCOVERED:** `OurApproachSection` item 05.
- **CURRENT STATUS:** Marketing copy only.
- **IMPORTANCE:** **IMPORTANT**

**FEATURE:** Greeting cards — digital and physical **[E]**
- **DESCRIPTION:** "Turn your memories into beautiful physical or digital cards for the ones you love." Template categories in unused code: Birthday, Thank You, Anniversary, Congratulations, Graduation, Wedding. Also "interactive" / "Smart Cards".
- **USER VALUE:** A tangible gift derived from the archive; a natural paid upsell.
- **WHERE DISCOVERED:** `/greeting-cards`; `FeaturesSection` item 01; `SendCardsSection` and `CardTemplatesSection` — **both are dead code, evidence of a de-scoped or unfinished direction.**
- **CURRENT STATUS:** Marketing copy only; the two components built for it were removed from the page.
- **IMPORTANCE:** **OPTIONAL / V2** — physical fulfillment is a separate business.

**FEATURE:** Emotional connection / shared nostalgia framing **[E]**
- **DESCRIPTION:** "Create emotional connections across distance." "Every memory deserves to be shared." "Capture. Share. Relive."
- **USER VALUE:** Positions the product as relational rather than archival.
- **WHERE DISCOVERED:** `scroll-morph-hero` hero copy, `OurApproachSection` item 05.
- **CURRENT STATUS:** Positioning, not a feature.
- **IMPORTANCE:** **CORE** as a design principle.

**FEATURE:** Reviews / testimonials, "Leave a review" **[E]**
- **DESCRIPTION:** Social proof with "Verified User" badge, "12,450 reviews", "Trusted by", "Leave a review".
- **USER VALUE:** Trust signal for a product asking to hold irreplaceable data.
- **WHERE DISCOVERED:** `TestimonialSection`, `SendCardsSection`.
- **CURRENT STATUS:** Hardcoded fictional testimonials; the button is inert.
- **IMPORTANCE:** **OPTIONAL** — marketing-site concern, not app.

### 2.6 Timeline, Gallery and Discovery

**FEATURE:** Interactive visual timeline (Past / Present / Future) **[E]**
- **DESCRIPTION:** Route `/timeline`: "Travel through time. Relive every moment exactly as it felt." Three bands — Past ("Relive every feeling from years ago"), Present ("Capture the now in perfect clarity"), Future ("Schedule a legacy message for tomorrow").
- **USER VALUE:** **The Future band is the sharpest product insight in the repository.** A timeline extending *forward* — pending capsules shown alongside past memories — is a genuinely novel primary navigation surface. No major competitor does this.
- **WHERE DISCOVERED:** `TimelineSection`, `/timeline`, `CinematicHero` ("beautiful visual timelines"), `AboutUsSection`.
- **CURRENT STATUS:** Marketing copy plus a decorative three-card scroll animation.
- **IMPORTANCE:** **CORE**

**FEATURE:** Gallery / curated grid view **[E]**
- **DESCRIPTION:** "A gallery of feelings. Beautifully curated. Automatically organized."
- **USER VALUE:** Visual browsing.
- **WHERE DISCOVERED:** `GallerySection`, `InteractiveGallerySection`.
- **CURRENT STATUS:** Static image grid with a cursor image-trail effect.
- **IMPORTANCE:** **CORE**

**FEATURE:** Categories / occasion taxonomy **[I]**
- **DESCRIPTION:** The 15 AI creation categories and 6 card categories together define a de-facto occasion taxonomy: birthday, wedding, anniversary, graduation, baby, holiday, memorial, engagement, pet, travel, year-in-review.
- **USER VALUE:** Occasion is the most natural organizing dimension for family memories.
- **WHERE DISCOVERED:** `AICreationsSection`, `CardTemplatesSection`.
- **CURRENT STATUS:** Inferred from content lists; no tagging system exists.
- **IMPORTANCE:** **IMPORTANT**

### 2.7 Account, Platform and Marketing Surface

**FEATURE:** Signup / login / account **[R]**
- **DESCRIPTION:** Referenced only obliquely — "create your account" (FAQ Q5), "authorized heirs". There is **no signup or login route, UI, or logic anywhere in the repository.**
- **USER VALUE:** Prerequisite for everything.
- **WHERE DISCOVERED:** `FAQSection` Q5, mention only.
- **CURRENT STATUS:** **Does not exist in any form.**
- **IMPORTANCE:** **CORE** — must be designed from scratch.

**FEATURE:** Native mobile apps (iOS / Android) **[E as a claim]**
- **DESCRIPTION:** "Download for iOS", "Download for Android", "Available on iOS, Android, and Web", "download the M&M app".
- **CURRENT STATUS:** Buttons with no links. No mobile codebase. **The claim is aspirational.**
- **IMPORTANCE:** Directly justifies the PWA decision — a PWA satisfies this promise across all three platforms with one codebase.

**FEATURE:** Light/dark theme **[E — actually implemented]**
- **DESCRIPTION:** `next-themes` with system detection, CSS-variable token set, brand orange `#FF7C0A`.
- **CURRENT STATUS:** **Genuinely working.** One of only two functioning features.
- **IMPORTANCE:** **IMPORTANT** — carry forward.

**FEATURE:** Lead capture / early access **[E, inert]**
- **DESCRIPTION:** Name, email, message. "Interested in early access?"
- **CURRENT STATUS:** `preventDefault()` — submits nowhere.
- **IMPORTANCE:** **IMPORTANT** for launch (waitlist); trivial to build.

**FEATURE:** Journal / blog **[E, empty]**
- **DESCRIPTION:** `/blog` titled "Journal" — "Stories, tips, and reflections on preserving the moments that matter." Renders only a CTA. **No posts, no content system.**
- **IMPORTANCE:** **OPTIONAL / FUTURE** — content marketing.

**FEATURE:** Pricing tiers **[E, contradictory]**
- **DESCRIPTION:** Two different pricing models coexist:
  - `/pricing` page: **Basic $0 forever** (5GB high-res) / **Legacy $12 per month** (unlimited, original quality, AI stories, priority support)
  - Home `PricingSection`: **Free $0** (5 memory uploads per month, standard delivery, basic encryption) / **Premium $9 per month or $89 per year** (Unlimited Memories, 4K Video, Time capsules and Legacy Vault, Priority Multi-channel Delivery, Biometric App Lock)
- **CURRENT STATUS:** No payment integration of any kind. Prices conflict ($9 vs $12) and the limit metric conflicts (GB quota vs upload count).
- **IMPORTANCE:** **IMPORTANT** — **INSUFFICIENT EVIDENCE — PRODUCT DECISION REQUIRED** on the actual limit metric and price point.

**FEATURE:** Admin / moderation / analytics **[R]**
- **CURRENT STATUS:** **No evidence whatsoever.** See §16.
- **IMPORTANCE:** OPTIONAL for MVP.

**FEATURE:** Notifications (push / email / in-app) **[R, weakly I]**
- **DESCRIPTION:** No notification system exists. However, delivery by app/SMS/WhatsApp/email *requires* one, and "On This Day" is meaningless without it.
- **CURRENT STATUS:** Implied prerequisite; nothing built.
- **IMPORTANCE:** **CORE** — a scheduled-delivery product without notifications cannot function.

### 2.8 Extraction summary

| Classification | Count | Notes |
|---|---|---|
| Explicit (described in repo) | ~28 | All copy and design only |
| **Actually functioning in code** | **2** | Theme switching; static page routing |
| Inferred | 5 | Delivery conditions, recipient unlock, categories, occasion taxonomy, family vaults |
| Recommended (new) | 6+ | Auth, notifications, admin, waitlist backend, offline, data export |

---

## 3. WHAT DOES THE APPLICATION ACTUALLY DO?

### In the simplest possible language

> M&M is a private place to keep the moments that matter — and, more unusually, a way to hand one of those moments to someone at a chosen point in the future.
>
> You record a video, a voice note, or a set of photos. You write down what it meant. You either keep it in your private vault, or you seal it and choose a date: her eighteenth birthday, their wedding day, ten years from now. On that day, it arrives — and they watch it.

### "If I gave this application to a new user, what would they use it for?"

Three concrete answers, in the order the repo emphasises them:

1. **To leave something behind for a specific person at a specific moment.** A father records for a five-year-old daughter, to be opened at eighteen.
2. **To finally rescue the family archive from the camera roll** and put it somewhere organised, beautiful, private, and permanent.
3. **To make something out of it** — a recap video for an anniversary, a card for a birthday, a poster for a memorial.

### Concept-by-concept mapping (strictly what the repo supports)

| Concept | How the existing repo represents it | Evidence class |
|---|---|---|
| **Memory** | The atomic unit. A photo, video, or voice recording plus its meaning. The word is used as a countable noun throughout: "5 memory uploads per month", "Unlimited Memories", "Memories Saved: 12,450", "Memory Sealed", "Memory Unlocked". | **[E]** — this is the core entity |
| **Moment** | Used interchangeably with memory but with a temporal flavour — "the moments that define your life story", "top 12 moments of the year", "millions of preserved moments". Not modelled separately. | **[E]** as language, **[I]** as an entity |
| **Vault** | The container. Private, encrypted, per-person or per-family, inheritable. "Legacy Vault", "set up your first vault", "your private vaults remain strictly yours", "customized legacy vaults for your unique family". | **[E]** — this is the container entity |
| **Time capsule** | A memory with a sealed state and a future unlock condition and a recipient. "Time capsules", "Memory Sealed", "delivery condition is met". | **[E]** — a distinct state/entity |
| **Story** | An AI-generated *derivative* of many memories, not user-authored. "AI Memory Stories", "weaves your scattered photos into cohesive narratives". | **[E]** as output, not as a user-created entity |
| **Timeline** | The primary organising and viewing axis, explicitly spanning Past / Present / **Future**. | **[E]** |
| **People** | Present only as **recipients** and **heirs**, plus implied face-grouping. There is **no contacts, relationships, or family-tree model** anywhere. | **[I]** — needs design |
| **Event / occasion** | Implicit taxonomy from card and creation categories (birthday, wedding, graduation, memorial…). Not modelled. | **[I]** |
| **Collection / album** | "Shared Albums" mentioned once. No structure. | **[E]** as a phrase, **[I]** as an entity |
| **Place** | **No evidence.** Geography is never mentioned. | Not present |
| **Comment / reaction** | **No evidence.** No commenting or reacting anywhere in the repo. | Not present — **[R]** if wanted |

### The seven questions

- **What does the user create?** A *memory* — media plus a title, a date, a note about what it meant. Optionally sealed into a *capsule* addressed to a person and a future date.
- **What does the user save?** Photos, videos, and voice recordings at original quality, in a private vault.
- **What does the user view?** Their timeline (past → future), a gallery grid, individual memories, AI-generated recaps, and — for recipients — a delivered capsule.
- **What does the user organize?** By date primarily (timeline), then occasion, people, and albums. The stated ambition is that organisation happens *automatically*.
- **What does the user share?** Individual memories, albums, capsules addressed to specific people, and generated artifacts (cards, recaps, posters).
- **What does the user manage?** Their vault, their pending capsules and delivery dates, their recipients' contact details, their heirs, their storage plan, and their privacy settings.
- **What keeps the user coming back?** In descending strength: (1) a sealed capsule waiting to be delivered, and the delivery event itself; (2) "On This Day" and periodic recaps arriving as notifications; (3) other family members contributing to a shared vault; (4) the archive being genuinely pleasant to browse.

---

## 4. PRODUCT FEATURES BY CATEGORY

Categories the repo supports. Marked **[E]** / **[I]** / **[R]** as before.

### ACCOUNT
- Create account **[R — mentioned in FAQ only, nothing built]**
- Log in / log out **[R]**
- Profile (name, avatar) **[R]**
- Plan and billing **[E as pricing copy, R as functionality]**
- Biometric / app lock **[E]**
- Settings: theme **[E — working]**, notifications **[R]**, privacy **[R]**
- Data export and account deletion **[R — legally required, absent]**

### CORE PRODUCT
- Legacy Vault: private encrypted container **[E]**
- Create a memory (media + title + date + note) **[E]**
- In-app capture: video, voice, photo **[E]**
- Seal as a time capsule with a future unlock date **[E]**
- Choose recipients **[E]**
- Guaranteed multi-channel delivery **[E]**
- Recipient unlock experience **[I]**
- Past/Present/Future timeline **[E]**
- Heir assignment and legacy transfer **[E]**

### CONTENT
- Create, edit, view a memory **[E]**
- Auto-organisation and curation **[E]**
- Albums / collections **[E, thin]**
- Occasion categorisation **[I]**
- Favourites / highlights **[I — "your best moments", "top 12 moments"]**
- Delete / archive **[R]**
- Version history **[R]**

### MEDIA
- Photos, high-resolution, no compression **[E]**
- Video up to 4K **[E]**
- Voice recordings **[E]**
- AI-generated video recaps with licensed music **[E]**
- Posters, cards, printable artifacts **[E]**
- Documents **[Not present]**
- Thumbnails, transcoding, streaming **[R — required, never mentioned]**

### SOCIAL / SHARING
- Send a capsule to specific recipients **[E]**
- Shared albums **[E]**
- Collaborative memories: invite people to record clips, auto-stitch **[E]**
- Invitations **[I — implied by collaboration and heirs]**
- Comments **[Not present — R]**
- Reactions **[Not present — R]**
- Public sharing **[Not present — deliberately; the product is privacy-first]**

### DISCOVERY
- Emotional / semantic search **[E]**
- On This Day **[E]**
- Year in Review **[E]**
- Timeline navigation **[E]**
- People / face grouping **[E, legally sensitive]**
- Tags **[R]**
- Filters **[R]**
- Places **[Not present]**

### NOTIFICATIONS
- Delivery notification via App / WhatsApp / SMS / Email **[E]**
- On This Day resurfacing **[E, implies a notification]**
- Recap ready **[I]**
- In-app notification centre **[R]**
- Collaboration invites and reminders **[R]**

### ADMIN
- **Nothing whatsoever in the repo.** All **[R]** — see §16.

### MARKETING SURFACE (the existing repo's actual content)
- Landing page with heavy scroll animation **[E, working]**
- About / Our Story **[E]**
- Features **[E]**
- AI Memories **[E]**
- Pricing **[E, contradictory]**
- Family Legacy **[E]**
- Greeting Cards **[E]**
- Timeline **[E]**
- Journal/blog **[E, empty]**
- Contact / lead capture **[E, inert]**
- FAQ, testimonials **[E]**
- Light/dark theme **[E, working]**

---

## 5. USER JOURNEYS (reverse-engineered from the existing product)

### 5.1 NEW USER

The repo's own version of this flow (`FAQSection` Q5) is: *download the app → create account → set up your first vault → start uploading photos and recording time capsules.*

Reconstructed in full, with the friction points the existing flow would hit:

```
Landing page (emotional hero: "Every memory deserves to be shared")
  → sees the promise: preserve · schedule · inherit
  → CTA: "Start your vault" / "Get Started"
  → Signup (email)
  → Onboarding
       Q1: "Who are you preserving for?"  → self / children / parents / partner
       Q2: "Add the people who matter"     → names + birthdays
       Q3: "What is the first moment you want to keep?"
  → FIRST MEANINGFUL ACTION
       Either: upload a handful of photos      (archive intent)
       Or:     record a 60-second video message (capsule intent)
  → Add title, date, and "what this meant"
  → Choose: keep private  |  seal for the future
       If sealed: pick recipient + unlock date
  → SUCCESSFUL OUTCOME
       Timeline now shows one memory in the past
       AND (if sealed) one glowing marker in the FUTURE with a countdown
```

**The critical design finding:** the successful outcome must be *visible and emotional within 3 minutes*. The existing marketing flow drives to "download the app" and then abandons the user to a generic upload screen. The single highest-leverage change in the new product is making the first session end with a **countdown to something the user has sealed** — because that is the artifact that brings them back.

### 5.2 RETURNING USER

```
Open installed PWA (or arrive from a push notification)
  → Home / Today
       "On This Day" card — 3 years ago today
       Next capsule: "Ella's 18th — in 4,382 days"
       Recent additions by family members in shared vaults
       Draft/queued uploads finishing
  → Recent activity feed
  → CORE ACTION (one of)
       • add today's moment (camera / picker)
       • record a voice note against an existing memory
       • watch the recap that was generated this month
       • add media to a sealed capsule before it locks
       • adjust a delivery date or recipient contact detail
  → Save / update / share
  → Leaves with the loop still open
```

### 5.3 CORE PRODUCT JOURNEY — "seal a moment for the future"

This is the primary action. Everything else supports it.

```
1. INTENT      "I want to say something to my daughter for her 18th."
2. CAPTURE     Record video in-app (or upload existing).
                 → No editing required. One take is the point.
3. ENRICH      Title. Date it refers to. A written note.
                 → Optionally attach photos from that era.
4. ADDRESS     Choose recipient(s). Add their contact details
                 (email + phone + a backup guardian contact).
5. SCHEDULE    Choose the unlock condition:
                 • an exact date        ("2039-06-04, 09:00 local")
                 • a person's milestone ("Ella turns 18")
                 • an event             ("her wedding day" — manual release)
                 • after my death       [V2, requires verification]
6. SEAL        Explicit, ceremonial confirmation. Show exactly what
                 will happen, to whom, when, and how it will reach them.
                 Explain the revocation window and the edit rules.
7. CONFIRM     Timeline gains a future marker with a live countdown.
                 A one-line receipt: "Sealed. 4,382 days to go."
8. WAIT        Product periodically reassures: annual "your capsule is
                 safe, here is the delivery plan" check-in. Prompts to
                 refresh recipient contact details.
9. DELIVER     On the date: notify recipient across channels until
                 acknowledged. Notify the sender that it arrived.
10. UNLOCK     Recipient opens a dedicated, ceremonial experience.
                 They can reply. The reply returns to the sender's vault.
```

**Steps 8 and 10 are where the existing product concept is weakest and where the new product should invest.** A 13-year silence is the biggest churn and trust risk in the entire model; step 10's reply is the most powerful growth loop available (the recipient becomes a creator).

### 5.4 CONTENT / MEMORY JOURNEY

```
CREATE       Camera, microphone, or file picker. Multi-select.
ADD MEDIA    Queue uploads; originals preserved; works offline.
ADD INFO     Title · date (with "when did this happen?" not "when
             was this uploaded?") · note · people · occasion
ORGANIZE     Auto: placed on timeline by date; auto-grouped into an
             "event" if same day/place cluster.
             Manual: add to an album, tag people, mark favourite.
SAVE         Optimistic local save; background sync to server.
VIEW LATER   Timeline · gallery · album · person · On This Day · search
SHARE        Private link (expiring, revocable) · shared album ·
             sealed capsule · exported recap
```

### 5.5 SHARING JOURNEY

```
CREATE / SHARE
  → SELECT PEOPLE
       from saved people, or by email/phone, or by link
  → PERMISSIONS
       View only  |  View + comment  |  Contribute  |  Co-own
       Expiry: never / 30 days / on a date
       Download allowed: yes / no
  → RECIPIENT EXPERIENCE
       Receives notification (push / email / SMS)
       Opens link — NO ACCOUNT REQUIRED to view
         (this is essential: a grandmother will not sign up to see a photo)
       Sees a beautiful, watermark-free, mobile-first viewer
       Prompted (gently, not blocking) to save it / create their own
  → OWNER CONTROL
       Sees who viewed and when
       Can revoke instantly — the link dies, cached copies expire
```

**Design decision for the new product:** viewing shared content requires **no account**; contributing requires a lightweight account. This maximises the reach of the product's most emotional moments while keeping write access controlled.

---

## 6. WHAT SHOULD THE NEW PWA BE?

### PRODUCT VISION

> **M&M is the private home for the moments that matter — and the only place you can reliably hand one of them to someone in the future.**

Three sentences of positioning:

1. Every other product in this space is a **backup**. M&M is a **bequest**.
2. It is not competing with Google Photos on storage; it is competing with the shoebox, the letter in the safe, and the words never said.
3. Its unit of value is not the gigabyte. It is the **arrival**.

**Strategic consequence:** the new PWA should lead with the time capsule, not the vault. The vault is table stakes and a commodity; the capsule is defensible, emotionally unique, and creates its own distribution.

### CORE EXPERIENCE — what users must be able to accomplish

1. Capture a moment in under 30 seconds, on a phone, on bad Wi-Fi, without thinking about files.
2. Say what it meant — in text or in their own voice.
3. See their life laid out on a timeline that extends into the future.
4. Seal a moment for a specific person and a specific future date, and *believe* it will arrive.
5. Receive something sealed for them, and open it in a way that does the moment justice.
6. Share with family without forcing family to sign up.
7. Know, precisely and at all times, who can see what — and be able to take it back.

### DESIGN PRINCIPLES

> **See also §26** — the designer's visual direction (warm / premium / emotionally intelligent; the coral-plum-gold palette; Fraunces + Inter) is the production expression of these principles, and supersedes any colour or type reference in Part I.

1. **Emotional before functional.** The interface serves feeling. A memory is never a "file", a "record", or an "asset" in the UI. Motion is slow, warm, and reverent — not flashy. (The existing site's WebGL fluid cursor and shader hills are *impressive* but *cold*; they perform for the visitor rather than serving the memory. The new product keeps the craft and drops the spectacle.)
2. **Mobile-first, thumb-first.** Memories are made on phones, in the moment, one-handed. Every core action lives in the bottom third of the screen.
3. **Never lose anything, ever.** Optimistic UI, offline queue, resumable uploads, aggressive local durability. A lost upload in this product is not a bug, it is a betrayal.
4. **Private by default, explicitly shared.** Nothing is public. Every share is a deliberate, reversible, legible act.
5. **Fast on a bad connection.** Assume a rural 3G grandmother on a five-year-old Android. Ship thumbnails first, originals in the background.
6. **Effortless organisation.** The user should never be asked to file, fold, or tag. Dates and automation do the work; manual curation is an option, never a chore.
7. **Trustworthy about time.** A 20-year promise demands honesty about what is and is not guaranteed. Never overstate. Reassure periodically, unprompted.
8. **Quiet.** Notifications are rare and meaningful. A memory product that nags is a memory product that gets uninstalled.
9. **Accessible and legible for all ages.** Large type, high contrast, generous targets, full keyboard and screen-reader support. Grandparents are core users, not edge cases.
10. **Honest craft over spectacle.** Keep the typographic quality and the considered dark mode of the existing site. Drop the custom cursor, the fluid simulation, and the scroll hijacking — all three are hostile on touch devices and to assistive technology.

---
## 7. NEW PWA FEATURE SET

Complexity scale: **S** (days) · **M** (1–2 weeks) · **L** (3–6 weeks) · **XL** (a quarter or more)

### 7.1 MVP — only what delivers the core value

| # | Feature | What it does | Why we need it | User benefit | Priority | Complexity |
|---|---|---|---|---|---|---|
| M1 | Email + passkey/OTP auth | Account creation and sign-in without passwords | Nothing works without identity; passwords are a liability on a lifetime vault | One tap to get in; nothing to forget | P0 | M |
| M2 | Personal vault | The private container that owns all memories | The product's core promise of a private place | "My things are in one safe place" | P0 | S |
| M3 | Create memory | Media + title + the date it happened + a note | The atomic unit of the product | Captures the moment *and* its meaning | P0 | M |
| M4 | In-app capture (photo / video / voice) | `getUserMedia` + `MediaRecorder` capture inside the PWA | The emotional payload is a voice or a face, not a JPEG | Record a message in 30 seconds | P0 | M |
| M5 | Resumable, offline-tolerant upload | Chunked multipart upload with an IndexedDB queue and Background Sync | Mobile uploads fail constantly; a lost upload destroys trust | "It just uploads, eventually, always" | P0 | L |
| M6 | Timeline (Past → Present → **Future**) | The primary view; a scrollable chronology that extends forward to show pending capsules | The existing product's single best idea; the app's identity | "I can see my life, including what's still coming" | P0 | L |
| M7 | Memory detail view | Full-screen viewer with media, note, date, and people | Where the memory is actually experienced | Reliving it properly | P0 | M |
| M8 | **Time capsule: seal + schedule** | Address a memory to recipients and an unlock date; lock it | **The differentiator. Without it there is no product.** | "I can speak to her in 2039" | P0 | L |
| M9 | Durable delivery engine | Persisted schedule + worker; email delivery + a durable unlock link; retries; sender receipt | The promise is the delivery; it must be an engineered guarantee | "It will arrive" | P0 | L |
| M10 | Recipient unlock experience | A dedicated, no-account-needed ceremonial open page, plus a reply | The delivery moment *is* the product, and it is the growth loop | The moment lands properly | P0 | M |
| M11 | Private share link | Expiring, revocable link; view without an account | Family will not sign up to see a photo | Share with anyone instantly | P0 | M |
| M12 | On This Day | Date-matched resurfacing on the home screen and in a weekly push | The cheapest, strongest retention mechanic in the product; needs no AI | Delight, unprompted | P0 | S |
| M13 | Push + email notifications | Web Push (VAPID) + transactional email | A scheduled-delivery product cannot function without them | Never miss an arrival | P0 | M |
| M14 | Installable PWA + offline shell | Manifest, service worker, cached shell, cached thumbnails, offline read of recent memories | It is a PWA; this is the platform promise the marketing already made | An app on the home screen | P0 | M |
| M15 | Privacy controls + audit trail | Per-memory visibility, a "who can see this" panel, instant revocation, an access log | The product asks for the most sensitive data a person owns | Verifiable control | P0 | M |
| M16 | Account: profile, export, delete | Profile, full data export, hard account deletion | Legally required (GDPR/CCPA) and a core trust signal | "I can leave and take everything" | P0 | M |
| M17 | Storage quota + Stripe checkout | Free tier limit, paid tier, hosted checkout, billing portal | Media costs real money from day one | Clear, fair pricing | P0 | M |

**MVP total: 17 features.** Deliberately tight. It delivers: *capture a moment → keep it privately on a timeline → seal it for someone in the future → it reliably arrives → they open it beautifully.* That is a complete, defensible product.

### 7.2 V1 — important improvements after MVP

| # | Feature | What it does | Why | Benefit | Priority | Complexity |
|---|---|---|---|---|---|---|
| V1.1 | Shared vaults / albums | Multiple members contribute to one collection with roles | The family archive is inherently multi-player; drives organic growth | Everyone's photos in one place | P1 | L |
| V1.2 | Collaborative capsule | Invite N people to each record a clip; auto-assemble into one montage | The strongest acquisition loop in the whole concept (`FAQ` Q4) | Group gifts become effortless | P1 | L |
| V1.3 | People + relationships | A lightweight people model with birthdays and relationships; manual tagging | Unlocks milestone-based scheduling and person-filtered browsing | "Everything with Mum" | P1 | M |
| V1.4 | Milestone-based delivery conditions | "Ella turns 18" rather than a raw date; auto-computed | How people actually think about the future | Natural scheduling | P1 | M |
| V1.5 | Multi-channel delivery + failover | Add SMS and WhatsApp; escalate through channels until acknowledged | The literal `FAQ` Q3 promise; solves stale contact details | Delivery actually guaranteed | P1 | L |
| V1.6 | Backup guardian for capsules | A second contact who can help route a delivery if the primary is unreachable | The honest engineering answer to a 20-year promise | Real durability | P1 | M |
| V1.7 | Semantic search | Natural-language search over auto-captions and transcripts via embeddings | "Happy times at the beach" — the stated AI promise, and the most useful one | Find anything by feeling | P1 | L |
| V1.8 | Auto event grouping | Cluster same-day/same-burst media into events; auto-title | Delivers "automatically organized" without asking the user to file | Zero-effort structure | P1 | M |
| V1.9 | Auto recaps (Year in Review, monthly) | Server-rendered highlight video from selected memories with licensed music | Recurring, notification-worthy delight; strong sharing surface | Something to watch and send | P1 | L |
| V1.10 | Voice notes on existing memories | Attach spoken commentary to old photos | The single highest-value archival act — capturing the story before it is lost | Grandma narrates the 1974 album | P1 | S |
| V1.11 | Comments and reactions in shared vaults | Lightweight, private to the vault | Turns a static archive into a living conversation | Family engagement | P2 | M |
| V1.12 | Biometric app lock | WebAuthn re-authentication to open the app | Explicit premium promise in the existing pricing | Privacy on a shared device | P2 | S |
| V1.13 | Annual reassurance report | Yearly email: what is stored, pending capsules, the delivery plan, a contact-freshness check | Answers the invisible-churn problem of a decade of silence | Ongoing confidence | P1 | S |
| V1.14 | Print / physical export | High-quality PDF photo book or poster export | Monetisation and a tangible artifact; the greeting-card ambition, simplified | Something to hold | P2 | M |

### 7.3 V2 / FUTURE — advanced

| # | Feature | What it does | Why | Priority | Complexity |
|---|---|---|---|---|---|
| F1 | **Legacy transfer / heir assignment** | Named heirs inherit the vault on verified death, with an inactivity fallback and a waiting period | The existing product's boldest promise; enormous trust value | P2 | **XL** (legal + identity verification + ops) |
| F2 | Posthumous scheduled delivery | "Deliver after I am gone" | The most emotionally powerful version of the capsule | P2 | XL (depends on F1) |
| F3 | AI narrative stories | Claude-written narration over a set of memories, in the user's own voice and style | The "AI Memory Stories" promise, done well | P2 | L |
| F4 | Face grouping | On-device or opt-in server clustering of faces into people | Highest-value organisation axis | P3 | L + **legal gating (BIPA/CUBI/GDPR)** |
| F5 | AI generative cards and posters | The 15 occasion categories from `AICreationsSection` | Outward-facing, viral, monetisable | P3 | L |
| F6 | Physical card fulfilment | Print-and-mail partner integration | Revenue; the `/greeting-cards` promise in full | P3 | L + vendor ops |
| F7 | Family tree / multi-generation graph | Structured relationships across generations | Makes M&M the family's system of record | P3 | XL |
| F8 | Import from Google Photos / iCloud / Instagram | Bulk migration of an existing archive | Removes the single biggest adoption barrier | P2 | L |
| F9 | Duplicate detection | Perceptual hashing to deduplicate near-identical shots | Cost saving and a cleaner archive | P3 | M |
| F10 | Native app shells | iOS/Android wrappers over the PWA for store presence and better background upload | Satisfies the "Download for iOS/Android" claim literally | P3 | M |
| F11 | End-to-end encryption option | Client-side encryption with user-held keys for the most sensitive vaults | The ultimate trust tier; **mutually exclusive with server-side AI** | P3 | XL |
| F12 | Public memorial pages | An opt-in shareable tribute page for someone who has died | Reach and organic search; the "Memorial Tributes" category | P3 | M |

### 7.4 Explicit anti-features — what we will not build

- **A social feed.** No followers, no likes from strangers, no algorithmic timeline. The product's value is privacy; a feed destroys it.
- **Public profiles.** Nothing is public by default, ever.
- **An ad-supported free tier.** The existing copy sells "No ads. No data mining." That commitment is a competitive asset — keep it.
- **A full video editor.** "No complex editing required" is a stated feature. Templates and auto-assembly only.
- **General cloud storage / a file manager.** No documents, no folders, no arbitrary file types. Memories only.

---

## 8. NEW PWA SCREEN ARCHITECTURE

> **Superseded in detail by §29–§31.** This section establishes the minimum screen set for the Part I MVP. The full production specification — ~115 screens across app, marketing, and admin, each with default / loading / empty / error / success states in light and dark — is in §29 (app), §30 (marketing), and §31 (admin). Where routes differ, **§28.5 is authoritative**.

Two surfaces: a **marketing site** (public, indexable, static) and the **app** (authenticated, installable). They share a design system but not a shell. The existing repository can serve as the reference for the marketing surface; the app is entirely new.

### 8.1 Marketing surface (public)

| Screen | Route | Purpose | Primary CTA |
|---|---|---|---|
| Landing | `/` | Communicate the capsule promise; convert | "Seal your first memory — free" |
| How it works | `/how-it-works` | The four-step Record → Schedule → Secure → Deliver flow | Start free |
| Family legacy | `/legacy` | The inheritance promise (honest about its V2 status) | Join the waitlist |
| Pricing | `/pricing` | One clear, non-contradictory table | Start free |
| Privacy & security | `/privacy` | The trust page: encryption, ownership, no ads, durability, export | Start free |
| Journal | `/journal`, `/journal/[slug]` | Content marketing (MDX) | Start free |
| Legal | `/terms`, `/privacy-policy`, `/dpa` | Required | — |

### 8.2 Application screens

---
**SCREEN:** Sign up
**ROUTE:** `/signup`
**PURPOSE:** Create an account with the least possible friction.
**PRIMARY CTA:** "Continue with email"
**MAIN COMPONENTS:** Email field · passkey prompt (if supported) · Google/Apple OAuth · a one-line trust statement ("Private by default. Export or delete anytime.") · link to sign in
**USER ACTIONS:** Enter email → receive a 6-digit code or create a passkey → land in onboarding
**EMPTY STATE:** n/a
**LOADING STATE:** Inline button spinner; the field stays interactive
**ERROR STATE:** Field-level messages; rate-limit notice with a countdown; "code expired — resend" with a live timer

---
**SCREEN:** Log in
**ROUTE:** `/login`
**PURPOSE:** Return an existing user in one tap.
**PRIMARY CTA:** "Continue" (passkey-first, code fallback)
**MAIN COMPONENTS:** Email field · passkey button · "email me a code" fallback · trouble-signing-in link
**EMPTY STATE:** n/a · **LOADING:** button spinner · **ERROR:** a generic non-enumerating message ("If that account exists, we sent a code"), plus a lockout notice with a retry time

---
**SCREEN:** Onboarding
**ROUTE:** `/welcome` — three steps: `/welcome/purpose`, `/welcome/people`, `/welcome/first`
**PURPOSE:** Learn just enough to make the first memory meaningful, and reach the first success in under 3 minutes.
**PRIMARY CTA:** Step 3 — "Record your first moment" / "Add photos"
**MAIN COMPONENTS:** Progress dots · purpose chips (For my children / For my family / For myself / For someone I have lost) · people entry (name + birthday, skippable) · a capture-or-upload chooser · a persistent "Skip for now"
**USER ACTIONS:** Choose a purpose · add 0–3 people · capture or upload
**EMPTY STATE:** n/a — this screen *is* the empty state
**LOADING:** Skeleton steps; camera permission explained *before* the prompt fires
**ERROR:** Camera or mic denied → a clear recovery path plus an upload alternative; never a dead end

---
**SCREEN:** Home / Today
**ROUTE:** `/app`
**PURPOSE:** The daily return surface. Answer "what is happening with my memories?"
**PRIMARY CTA:** Floating "+ Add a moment"
**MAIN COMPONENTS:** On This Day card · next-capsule countdown card · upload-queue status (when pending) · recent activity in shared vaults · a "recap ready" card when applicable · bottom nav
**USER ACTIONS:** Add · open a memory · open a capsule · watch a recap · dismiss a card
**EMPTY STATE:** One warm prompt — "Your timeline starts with one moment." + Add, plus a secondary "Import from your phone" affordance
**LOADING:** Skeleton cards; cached content rendered instantly from IndexedDB while revalidating
**ERROR:** Offline banner ("Showing your saved memories — new items will sync"); per-card retry

---
**SCREEN:** Timeline
**ROUTE:** `/app/timeline` (deep-linkable: `?at=2019-06`)
**PURPOSE:** The signature view. The user's life, past *and* future, in one continuous scroll.
**PRIMARY CTA:** "+ Add a moment"
**MAIN COMPONENTS:** Sticky year/month scrubber · past memory clusters · a distinct "Now" divider · the **future band** with sealed capsules and countdowns · density toggle (year / month / day) · filter sheet (people, occasion, media type, favourites)
**USER ACTIONS:** Scroll and scrub · jump to a year · open a memory · open or edit a pending capsule · filter
**EMPTY STATE:** A stylised empty timeline showing the Now divider and a single prompt — visually communicating that the future band exists and is waiting
**LOADING:** Virtualised windowed list with skeleton rows; thumbnails progressively enhanced (blurhash → thumb → full)
**ERROR:** Per-section retry; offline serves cached ranges and clearly marks uncached ones

---
**SCREEN:** Gallery
**ROUTE:** `/app/gallery`
**PURPOSE:** Dense visual browsing for when the user wants to *look*, not read.
**PRIMARY CTA:** Select → act (share, add to album, favourite)
**MAIN COMPONENTS:** Virtualised responsive grid · sticky date headers · multi-select mode · filter chips
**EMPTY STATE:** "Nothing here yet" + Add · **LOADING:** blurhash placeholders in a stable-height grid (zero layout shift) · **ERROR:** inline per-tile retry and a broken-media indicator

---
**SCREEN:** Create / Capture
**ROUTE:** `/app/new` (modal route over the current screen)
**PURPOSE:** Get a moment in, fast, with no decisions the user does not need to make.
**PRIMARY CTA:** "Save to my vault" (secondary: "Seal for the future")
**MAIN COMPONENTS:** Mode tabs (Photo · Video · Voice · Upload) · live camera preview with record button and timer · media tray with reorder and remove · Title · **"When did this happen?"** date picker (defaults to today but explicitly asks) · "What did this mean?" note field with voice dictation · people chips · occasion chips · privacy selector
**USER ACTIONS:** Capture or pick · reorder · fill fields · save · or continue to seal
**EMPTY STATE:** The live camera view is the empty state
**LOADING:** Immediate optimistic save; per-item upload progress; the screen is dismissible while uploads continue in the background
**ERROR:** Unsupported codec → clear message plus an upload fallback; file too large → offer client-side downscale; offline → "Saved on this device, will upload when you're back" (never blocked)

---
**SCREEN:** Seal a capsule
**ROUTE:** `/app/capsule/new` (or `/app/memory/[id]/seal`)
**PURPOSE:** The most important screen in the product. Turn a memory into a promise.
**PRIMARY CTA:** "Seal this capsule"
**MAIN COMPONENTS:** Memory preview · recipient picker (saved people, or email/phone entry, multiple allowed) · unlock-condition selector (exact date / person's milestone / manual release) · delivery-channel preview showing exactly which channels will be tried, in order · backup-guardian field `[V1]` · a plain-language **summary block**: "On 4 June 2039, Ella will receive this by email and text. You can edit or cancel it any time before then." · the edit and revocation policy stated in full
**USER ACTIONS:** Choose recipients · choose the condition · review · seal
**EMPTY STATE:** n/a (always entered with a memory)
**LOADING:** The confirmation is transactional and explicit — a real success state, not a toast
**ERROR:** Invalid or unreachable contact → block sealing with a specific fix; a date in the past → inline correction; **no recipient contact method → a hard block with an explanation.** This is the one screen where friction is the correct design.

---
**SCREEN:** Capsule detail (sender view)
**ROUTE:** `/app/capsule/[id]`
**PURPOSE:** Reassure. Show that the promise is intact, and let the sender maintain it.
**PRIMARY CTA:** "Add to this capsule" (while still editable) or "Check delivery details"
**MAIN COMPONENTS:** Live countdown · recipient list with contact-freshness indicators · delivery plan · full status history (sealed / reminder sent / delivered / opened / replied) · edit and cancel controls with the rules stated · a "refresh contact details" prompt when details go stale
**EMPTY STATE:** n/a · **LOADING:** skeleton with the countdown rendered immediately from cache · **ERROR:** "we could not verify the recipient's email" as a persistent, actionable warning

---
**SCREEN:** Memory detail
**ROUTE:** `/app/memory/[id]`
**PURPOSE:** Experience one memory properly.
**PRIMARY CTA:** Contextual — Share
**MAIN COMPONENTS:** Full-bleed media viewer (swipeable, pinch-zoom, video and audio players) · title, date, note · people and occasion chips · attached voice notes · comments `[V1, shared vaults only]` · overflow menu (edit, favourite, add to album, download, seal, delete) · native Web Share
**EMPTY STATE:** n/a · **LOADING:** blurhash → thumbnail → original, with the note text rendering first · **ERROR:** "this memory could not load" with retry; a deleted memory gets a gentle explanatory page, not a raw 404

---
**SCREEN:** Album / Shared vault
**ROUTE:** `/app/album/[id]`
**PURPOSE:** A curated or collaborative subset of memories.
**PRIMARY CTA:** "Add to this album" / "Invite people"
**MAIN COMPONENTS:** Cover, title, description · member avatars with roles · grid · activity strip · share and invite sheet · permission editor
**EMPTY STATE:** "This album is empty — add the first moment", plus an Invite prompt · **LOADING:** skeleton grid · **ERROR:** a permission-revoked state that explains what happened rather than 404-ing

---
**SCREEN:** Recipient unlock (public, unauthenticated)
**ROUTE:** `/c/[token]`
**PURPOSE:** Deliver the moment. **The most emotionally important screen in the product.**
**PRIMARY CTA:** "Open" before unlock → "Reply" after
**MAIN COMPONENTS:** Sealed state (who it is from, when it was recorded, a countdown if not yet due) · a deliberate, slow open transition · the memory full-screen with no chrome and no branding competing for attention · the sender's note · "Reply with a message" · "Save a copy" · a soft, non-blocking "Keep your own moments" invitation
**USER ACTIONS:** Open · watch or listen · reply · download · optionally sign up
**EMPTY STATE:** n/a
**LOADING:** Poster frame and note first; media fully preloaded before the open animation runs so the reveal never stutters
**ERROR:** Not yet due → a countdown page, not an error · expired → "this link has expired, ask {sender} to resend" · revoked → a neutral, non-alarming message

---
**SCREEN:** Search
**ROUTE:** `/app/search`
**PURPOSE:** Retrieve anything by date, person, occasion, or `[V1]` meaning.
**PRIMARY CTA:** Submit query
**MAIN COMPONENTS:** Search field with recent queries · suggestion chips (people, years, occasions, favourites) · grouped results (memories, albums, people, capsules) · filter sheet
**EMPTY STATE:** Suggestion chips and "Try: summer 2019, Mum, birthdays" · **LOADING:** debounced skeleton rows · **ERROR:** "no results" showing which filters applied plus a one-tap clear; offline says plainly "searching your saved memories only"

---
**SCREEN:** People
**ROUTE:** `/app/people`, `/app/people/[id]` `[V1]`
**PURPOSE:** Browse by person; manage recipients, birthdays, and contact details.
**PRIMARY CTA:** "Add a person"
**MAIN COMPONENTS:** People grid · per-person memory count and next milestone · contact details with a freshness indicator · capsules addressed to them
**EMPTY STATE:** "Add the people who matter — we will help you remember their milestones" · **LOADING:** skeleton avatars · **ERROR:** inline retry

---
**SCREEN:** Notifications
**ROUTE:** `/app/notifications`
**PURPOSE:** The record of everything the product has told the user.
**MAIN COMPONENTS:** Grouped list (deliveries, arrivals, invites, recaps, system) · read/unread · deep links · a link to notification settings
**EMPTY STATE:** "Nothing new — we will tell you when something arrives" · **LOADING:** skeleton rows · **ERROR:** cached list plus an offline banner

---
**SCREEN:** Settings
**ROUTE:** `/app/settings` and children
**PURPOSE:** Control the account, privacy, and plan.
**SUB-ROUTES:**
- `/profile` — name, avatar, email, phone
- `/security` — passkeys, sessions and devices, app lock, sign out everywhere
- `/privacy` — default visibility, active share links with revoke, access log, AI-processing opt-in/out
- `/notifications` — per-channel and per-type toggles, quiet hours
- `/plan` — tier, storage used, upgrade, Stripe billing portal, invoices
- `/legacy` — heirs and guardians `[V2]`
- `/data` — export everything, delete account (two-step, with a grace period)
- `/appearance` — theme (light / dark / system), text size, reduced motion
**EMPTY STATE / LOADING / ERROR:** per section; errors are section-scoped and never block the whole page

---
**SCREEN:** Admin (internal) `[V1]`
**ROUTE:** `/admin/*` — see §16.

### 8.3 Route map summary

```
PUBLIC (marketing)          APP (authenticated)              PUBLIC (recipient)
/                           /app            Home/Today       /c/[token]   capsule unlock
/how-it-works               /app/timeline                     /s/[token]   shared memory/album
/legacy                     /app/gallery
/pricing                    /app/new                          AUTH
/privacy                    /app/memory/[id]                  /signup
/journal[/slug]             /app/capsule/new                  /login
/terms /privacy-policy      /app/capsule/[id]                 /welcome/*
                            /app/album/[id]
                            /app/search                       ADMIN
                            /app/people[/id]                  /admin/*
                            /app/notifications
                            /app/settings/*
```

---

## 9. MOBILE-FIRST PWA EXPERIENCE

### 9.1 Navigation by breakpoint

> **Superseded by §28.1.** The bottom-nav structure below was revised after the designer's brief: Release 1 ships `Home · Occasions · (+) · Timeline · Me`, with Gifts replacing Timeline at Release 3, and search moving to the top bar. Rationale in §28.1 and Appendix C-4.

**Mobile (< 768px) — the primary target.** A bottom tab bar, five items, thumb-reachable, safe-area padded:

```
┌──────────────────────────────────────────────┐
│  Today   Timeline   ( + )   Search   You     │
└──────────────────────────────────────────────┘
```

The centre **+** is a raised primary action that opens the capture sheet. The bar hides on scroll-down and reappears on scroll-up. Create, filter, and share are **sheets, not pages**, so context is never lost.

**Tablet (768–1023px).** The bottom bar persists in portrait; a left icon rail appears in landscape. Two-pane layouts: timeline list beside memory detail.

**Desktop (≥ 1024px).** A persistent left sidebar (Today, Timeline, Gallery, Search, People, Albums, Capsules, Settings), a top command bar with global search and ⌘K, and a wide three-column timeline. Keyboard shortcuts throughout (`n` new, `/` search, `j`/`k` navigate, `Esc` close).

> **Note on the existing repo:** it contains a `BottomDockNavbar` built on a macOS-style magnifying `Dock` that is never mounted in the layout. That pattern is a desktop-mouse idiom — hover magnification is meaningless on touch. The new product uses a conventional bottom tab bar, which is what mobile users actually expect.

### 9.2 Install experience

- **Manifest:** `display: standalone`, a stable `id`, `start_url: /app`, brand `theme_color` and `background_color`, maskable icons (192/512), `shortcuts` for **Add a moment** and **Timeline**, and `share_target` so the OS share sheet can send photos and videos straight into the app.
- **Prompt timing:** never on first load. Show the custom install card only *after* the first successful save — the moment the user has something worth keeping. Store the dismissal; ask at most twice.
- **iOS:** a tailored "Add to Home Screen" walkthrough (Safari still has no `beforeinstallprompt`), plus `apple-touch-icon` and splash images.
- **Post-install:** confirm in-app, then request notification permission *contextually* — at the point of sealing the first capsule ("Should we tell you when Ella opens this?"), never on arrival.

### 9.3 App-like transitions

- View Transitions API for timeline → memory, with a shared-element media morph and a graceful no-op fallback.
- Sheets and modals as intercepted routes, so Back and swipe-back behave natively.
- Optimistic navigation with skeletons; never a blank screen.
- Every animation respects `prefers-reduced-motion` and stays under 300ms — except the capsule-open reveal, which is *deliberately* slow (~1.2s), because ceremony is the point.
- **Explicitly rejected from the existing site:** Lenis scroll hijacking (breaks native momentum, accessibility, and anchor behaviour on mobile), the custom cursor (meaningless on touch), the WebGL fluid cursor (substantial battery cost for zero user value), and full-viewport GLSL shaders. These belong on a landing page, not in an app opened daily on a phone.

### 9.4 Offline behaviour — what works with no connection

| Capability | Offline behaviour |
|---|---|
| Open the app | **Full** — app shell precached |
| Browse recent timeline (last ~90 days + all favourites) | **Full** — metadata in IndexedDB, thumbnails in the Cache API |
| View a memory's text, note, date, people | **Full** |
| View thumbnails / cached media | **Full** for what is cached; a clear "not downloaded" state otherwise |
| **Capture a photo, video, or voice note** | **Full** — written to IndexedDB immediately, then queued |
| **Create a memory (all metadata)** | **Full** — an optimistic local record with a "pending" badge |
| Edit a memory's title, note, or date | **Full** — queued as a patch; last-write-wins with a conflict prompt |
| Upload media | Queued; resumes automatically via Background Sync |
| **Seal a capsule** | **Blocked by design.** It requires server confirmation of the delivery schedule. The draft is saved locally with an honest explanation: a promise that cannot be guaranteed must not be shown as sealed. |
| Search | Local-only over cached metadata, clearly labelled |
| Share links, invites, billing | Blocked, with a queued-action option where safe |
| Recipient unlock page | Requires the network — tokens must be validated server-side |

**Cache strategy:** app shell precached (stale-while-revalidate); API GETs network-first with a cache fallback; thumbnails cache-first behind an LRU cap (~200MB, honouring `navigator.storage.estimate()`); originals never cached automatically but downloadable on demand; **writes always go through the outbox queue**, never a naive network-first.

**Sync engine:** a durable outbox in IndexedDB (Dexie) with per-item state (`pending`, `uploading`, `failed`, `done`), exponential backoff, idempotency keys on every mutation, and a visible, user-controllable "3 items waiting to upload" surface. `periodicSync` where available for opportunistic drain. Call `StorageManager.persist()` so the browser cannot evict an un-uploaded memory — and warn clearly if persistence is denied.

### 9.5 Push notifications

Web Push with VAPID; subscriptions stored per device; encrypted payloads; handled in the service worker with action buttons and deep links. iOS 16.4+ supports Web Push **only for installed PWAs**, which makes install promotion a functional requirement rather than a nicety. Email is the guaranteed fallback for every critical notification. Full trigger matrix in §14.

### 9.6 Native integrations

- **Web Share API** for outbound sharing (`navigator.share`, with files where supported).
- **Web Share Target** so photos can be pushed *into* M&M from the OS share sheet — the single biggest capture-friction reduction available to a PWA.
- **File System Access API** for bulk desktop import and for saving exports.
- **`getUserMedia` + `MediaRecorder`** for in-app capture, with `<input type="file" accept="image/*,video/*" capture>` as the universal fallback.
- **WebAuthn** for passkey sign-in and biometric app lock.
- **`navigator.contacts`** where available (Android/Chrome) to speed recipient entry; manual entry always available.
- **Badging API** for unread arrivals on the installed icon.
- **Screen Wake Lock** during long uploads and capsule playback.

### 9.7 Deep links

Every meaningful object is addressable and shareable: `/app/memory/[id]`, `/app/timeline?at=2019-06`, `/app/album/[id]`, `/c/[token]`, `/s/[token]`. Unauthenticated hits on app routes redirect to login with a `next` parameter and land exactly where intended. Notification payloads always carry a canonical deep link. **`/c/[token]` links must stay valid for decades** — they are opaque, versioned, and never encode internal ids or an expiring host path.

---

## 10. NEW DATA MODEL

> **Extended by §34.** The entities below remain the core. Part II adds ~43 more across three releases — most importantly the **`Event` / `EventReminder`** engine (a genuine gap in Part I), the richer **`Member`** entity which replaces `Person`, plus broadcast, collaboration, commerce, and legacy entities. See §34, and §34.13 for the release-by-release count.

Designed from the product, not copied — the existing repo has no data layer to copy. Postgres. `[MVP]` / `[V1]` / `[V2]` marked per entity.

### `User` `[MVP]`
- **Purpose:** the authenticated identity and the root of all ownership.
- **Fields:** `id` (uuid), `email` (unique, citext), `email_verified_at`, `phone`, `phone_verified_at`, `name`, `avatar_media_id`, `locale`, `timezone`, `created_at`, `last_seen_at`, `plan`, `storage_used_bytes`, `storage_quota_bytes`, `deleted_at`, `hard_delete_after`
- **Relationships:** owns many `Vault`, `Memory`, `Capsule`, `Person`, `Device`; has one `Subscription`
- **Ownership / permissions:** self-owned. Only the user and a scoped admin role may read. Every field appears in a data export.

### `Vault` `[MVP]`
- **Purpose:** the top-level private container. Every user gets one personal vault at signup; shared vaults arrive in V1.
- **Fields:** `id`, `owner_id`, `name`, `type` (`personal` | `shared` | `legacy`), `cover_media_id`, `default_visibility`, `created_at`, `archived_at`
- **Relationships:** has many `Memory`, `VaultMember`, `Album`
- **Ownership:** `owner_id`; access strictly via `VaultMember`. **Every authorisation check in the system resolves to vault membership** — this is the single security chokepoint.

### `VaultMember` `[MVP for self, V1 for others]`
- **Purpose:** who can do what inside a vault.
- **Fields:** `vault_id`, `user_id`, `role` (`owner` | `admin` | `contributor` | `viewer`), `invited_by`, `joined_at`, `revoked_at`
- **Permissions:** owner — everything including delete and transfer; admin — manage members and content; contributor — add and edit own; viewer — read only.

### `Memory` `[MVP]`
- **Purpose:** **the atomic unit of the product** — one remembered moment: media plus meaning.
- **Fields:** `id`, `vault_id`, `author_id`, `title`, `note` (text), `occurred_at` (timestamptz — *when it happened*, not when uploaded), `occurred_precision` (`exact` | `day` | `month` | `year`), `created_at`, `updated_at`, `occasion` (enum, nullable), `is_favourite`, `visibility` (`private` | `vault` | `link` | `recipients`), `cover_media_id`, `client_id` (idempotency key for offline creation), `sync_state`, `deleted_at`
- **Relationships:** belongs to `Vault`; has many `MediaAsset`, `MemoryPerson`, `Comment`, `Reaction`; may belong to many `Album`; may be referenced by `Capsule`
- **Ownership:** `author_id` within `vault_id`. Editable by the author, the vault owner, and admins.
- **Modelling note:** the repo uses "memory" and "moment" interchangeably. This model keeps **Memory** as the single canonical entity and deliberately does *not* introduce a separate `Moment` — a second near-identical entity would add confusion with no product benefit. Event grouping is handled by `Album` with `type = 'event'`.

### `MediaAsset` `[MVP]`
- **Purpose:** one file — photo, video, or audio — plus all its derivatives.
- **Fields:** `id`, `memory_id`, `owner_id`, `kind` (`image` | `video` | `audio`), `mime`, `bytes`, `width`, `height`, `duration_ms`, `storage_key`, `thumb_key`, `preview_key`, `poster_key`, `blurhash`, `checksum_sha256`, `perceptual_hash` `[V1]`, `captured_at` (EXIF), `exif` (jsonb, GPS stripped unless opted in), `transcode_status`, `transcode_variants` (jsonb), `sort_order`, `created_at`, `deleted_at`
- **Ownership:** inherits from `Memory` → `Vault`. **Never served from a public bucket** — always short-lived signed URLs.

### `UploadSession` `[MVP]`
- **Purpose:** make resumable, offline-tolerant uploads possible and observable.
- **Fields:** `id`, `user_id`, `client_id`, `intended_memory_id`, `filename`, `bytes_total`, `bytes_received`, `parts` (jsonb), `storage_upload_id`, `status`, `expires_at`
- **Why an entity:** without server-side upload state, a mobile upload interrupted at 80% must restart. Unacceptable for a 4K video on cellular.

### `Capsule` `[MVP]` — the differentiating entity
- **Purpose:** a promise — this memory, to these people, at that moment.
- **Fields:** `id`, `owner_id`, `memory_id` (or a `capsule_memories` join for multi-memory capsules), `title`, `sender_note`, `state` (`draft` | `sealed` | `delivering` | `delivered` | `opened` | `cancelled` | `failed`), `unlock_kind` (`datetime` | `milestone` | `manual` | `posthumous` `[V2]`), `unlock_at`, `unlock_timezone`, `milestone_person_id` `[V1]`, `milestone_spec` `[V1]`, `sealed_at`, `editable_until`, `delivered_at`, `first_opened_at`, `cancelled_at`, `created_at`
- **Relationships:** has many `CapsuleRecipient`, `DeliveryAttempt`, `CapsuleReply`
- **Ownership:** `owner_id` only. **Immutability rule:** once `state = 'sealed'`, media and note are frozen; the owner may still cancel, and may update recipient *contact details* but never swap the recipient identity. Recipients gain read access only at `delivered_at`.
- **Indexes:** `(state, unlock_at)` is the scheduler's hot path and must stay tight.

### `CapsuleRecipient` `[MVP]`
- **Fields:** `id`, `capsule_id`, `person_id` (nullable), `name`, `email`, `phone`, `preferred_channel`, `access_token_hash`, `token_version`, `delivered_at`, `opened_at`, `last_verified_at`, `guardian_contact` `[V1]` (jsonb)
- **Note:** the token is stored hashed. A capsule link must survive 20 years, so it is opaque, versioned, and independent of any id or route shape.

### `DeliveryAttempt` `[MVP]`
- **Purpose:** the auditable proof behind a delivery guarantee.
- **Fields:** `id`, `capsule_id`, `recipient_id`, `channel` (`push` | `email` | `sms` | `whatsapp`), `attempt_no`, `provider`, `provider_message_id`, `status` (`queued` | `sent` | `delivered` | `bounced` | `failed` | `acknowledged`), `error_code`, `attempted_at`, `next_retry_at`
- **Why:** without this table, "99.9% delivery" is a marketing claim rather than an operational fact.

### `CapsuleReply` `[MVP]`
- **Purpose:** the recipient answers. This closes the emotional loop and is the primary growth mechanism.
- **Fields:** `id`, `capsule_id`, `recipient_id`, `body`, `media_asset_id` (nullable), `created_at`
- **Ownership:** written by the recipient (no account required), readable by the capsule owner, and copied into the owner's vault as a memory.

### `Person` `[MVP-lite / V1 full]`
- **Purpose:** someone who appears in or receives memories. **Not necessarily a user.**
- **Fields:** `id`, `owner_id`, `name`, `relationship`, `birthday`, `avatar_media_id`, `email`, `phone`, `contact_verified_at`, `linked_user_id` (nullable), `deceased_at` (nullable), `created_at`
- **MVP scope:** name plus contact details, enough to address a capsule. Full people-browsing and milestones in V1.
- **Ownership:** `owner_id`. Private to the owner — **a `Person` is not a public profile and is never discoverable by other users.**

### `MemoryPerson` `[V1]`
- **Fields:** `memory_id`, `person_id`, `source` (`manual` | `auto`), `confidence`, `bounding_box` `[V2]`, `confirmed_at`

### `Album` `[MVP-lite / V1 full]`
- **Purpose:** a named collection — a curated set, an auto-detected event, or a shared collaborative space.
- **Fields:** `id`, `vault_id`, `owner_id`, `name`, `description`, `type` (`manual` | `event` | `shared`), `cover_media_id`, `start_date`, `end_date`, `created_at`
- **Join:** `AlbumMemory` (`album_id`, `memory_id`, `sort_order`)

### `Share` `[MVP]`
- **Purpose:** a revocable grant of access to a memory or album via a link.
- **Fields:** `id`, `owner_id`, `resource_type` (`memory` | `album`), `resource_id`, `token_hash`, `permission` (`view` | `comment` | `contribute`), `allow_download`, `password_hash` (nullable), `expires_at`, `revoked_at`, `view_count`, `last_viewed_at`, `created_at`
- **Ownership:** the creator. Revocation is immediate and also invalidates already-issued signed media URLs in practice, because those TTLs are 5 minutes.

### `Invitation` `[V1]`
- **Fields:** `id`, `inviter_id`, `target_type` (`vault` | `album` | `collab_capsule`), `target_id`, `email`, `phone`, `role`, `token_hash`, `state`, `expires_at`, `accepted_at`, `accepted_user_id`

### `Notification` `[MVP]`
- **Fields:** `id`, `user_id`, `type`, `payload` (jsonb), `deep_link`, `read_at`, `created_at`, `channels_sent` (jsonb)

### `Device` `[MVP]`
- **Purpose:** a push subscription endpoint.
- **Fields:** `id`, `user_id`, `endpoint`, `p256dh`, `auth`, `user_agent`, `platform`, `is_installed_pwa`, `last_success_at`, `failure_count`, `created_at`

### `ScheduledJob` `[MVP]`
- **Purpose:** the durable clock. **This is the entity the entire product promise rests on.**
- **Fields:** `id`, `kind` (`capsule_delivery` | `on_this_day` | `recap` | `reassurance` | `contact_refresh` | `retention_purge`), `run_at`, `payload` (jsonb), `state`, `attempts`, `locked_by`, `locked_until`, `last_error`, `completed_at`
- **Why in the database rather than a queue service:** a job scheduled for 2046 must outlive every vendor in the stack. The database is the source of truth; a queue or serverless cron is only the *executor* that polls it. No third-party scheduler is trusted with a multi-decade commitment.

### `Subscription` `[MVP]`
- **Fields:** `id`, `user_id`, `stripe_customer_id`, `razorpay_customer_id`, `stripe_subscription_id`, `plan`, `status`, `currency`, `region`, `current_period_end`, `cancel_at`, `created_at`
- **Entitlements (denormalised onto the row so every check is a single read, and so a lapsed subscription's *existing* obligations remain legible):** `storage_quota_bytes`, `max_pending_capsules`, `max_capsule_horizon_days`, `max_video_seconds`, `channels_enabled` (text[]), `ai_features_enabled` (text[]), `seats`, `broadcast_recipients_per_month`
- **Enforcement notes (§17.2):**
  - **"Pending" means `state = 'sealed'` and `delivered_at IS NULL`.** Delivered capsules are never counted — the cap is on concurrent obligations, not on lifetime usage. This is what keeps the growth loop uncapped for free users (Appendix C-8).
  - **The horizon check applies at seal time only.** `unlock_at - now() <= max_capsule_horizon_days`.
  - **Neither check is ever re-applied retroactively.** A capsule sealed under an active Premium subscription stays valid and is delivered even if the subscription later lapses — enforced by evaluating entitlements **at seal time and storing nothing that would allow a later downgrade to invalidate the promise.** There is deliberately **no** `memories_per_month` field: that limit does not exist.

### `AuditLog` `[MVP]`
- **Purpose:** who did what — especially who *saw* what. A trust feature surfaced to the user, not just an internal log.
- **Fields:** `id`, `actor_type` (`user` | `recipient` | `system` | `admin`), `actor_id`, `action`, `resource_type`, `resource_id`, `ip_hash`, `user_agent`, `metadata` (jsonb), `created_at`
- **Note:** append-only, retained 24 months. Any admin access to user content **must** write an entry.

### `AiJob` / `Derivative` `[V1]`
- **Fields:** `id`, `user_id`, `kind` (`caption` | `transcript` | `embedding` | `recap` | `story` | `card`), `input_ref`, `status`, `output_media_id`, `output_json`, `model`, `token_cost`, `created_at`

### `MemoryEmbedding` `[V1]`
- **Fields:** `memory_id`, `embedding` (`vector(1536)`), `source_text`, `model`, `updated_at` — pgvector with an HNSW index. Powers semantic search.

### `LegacyPlan` / `Heir` `[V2]`
- **Fields:** `id`, `user_id`, `heir_person_id`, `heir_email`, `scope` (`full_vault` | `specific_albums`), `trigger` (`verified_death` | `inactivity`), `inactivity_days`, `waiting_period_days`, `verification_state`, `verified_by`, `activated_at`, `documents` (jsonb)
- **Deliberately V2** — this needs death verification, a legally reviewed process, a dispute path, and human operations. Shipping it badly is worse than not shipping it.

### 10.1 Entity relationship overview

```
User ─┬─ owns ──▶ Vault ──┬──▶ VaultMember ──▶ User
      │                    └──▶ Memory ──┬──▶ MediaAsset ──▶ (R2 object)
      │                                  ├──▶ MemoryPerson ──▶ Person
      │                                  ├──▶ AlbumMemory ──▶ Album
      │                                  ├──▶ MemoryEmbedding        [V1]
      │                                  └──▶ Comment / Reaction     [V1]
      ├─ owns ──▶ Capsule ──┬──▶ CapsuleRecipient ──▶ DeliveryAttempt
      │                     ├──▶ CapsuleReply
      │                     └──▶ (references Memory; frozen when sealed)
      ├─ owns ──▶ Person, Share, Invitation, Device, Notification
      ├─ has  ──▶ Subscription
      └─ has  ──▶ LegacyPlan ──▶ Heir                                [V2]

ScheduledJob ──drives──▶ capsule delivery · On This Day · recaps · purges
AuditLog     ──records──▶ every access to every resource
```

### 10.2 MVP vs future entity summary

| MVP | V1 | V2 |
|---|---|---|
| User, Vault, VaultMember, Memory, MediaAsset, UploadSession, Capsule, CapsuleRecipient, DeliveryAttempt, CapsuleReply, Person (lite), Album (lite), Share, Notification, Device, ScheduledJob, Subscription, AuditLog | MemoryPerson, Album (full), Invitation, Comment, Reaction, AiJob, MemoryEmbedding, Derivative | LegacyPlan, Heir, FaceCluster, PrintOrder, FamilyRelationship |

---

## 11. PRIVACY & PERMISSIONS

This product holds the most sensitive category of consumer data there is: undirected family photographs, video of children, voice recordings, and messages intended for after death. Privacy is not a feature here — it is the product's licence to operate.

### 11.1 Visibility model — three levels, one rule

| Level | Meaning | Who can view |
|---|---|---|
| **PRIVATE** (default) | Owner only | The owner. Nobody else, including staff, without an audited break-glass event. |
| **SHARED** | Explicitly granted | Vault members per role · holders of an active `Share` link · capsule recipients **after** delivery |
| **PUBLIC** | Deliberately world-readable | **Not available at MVP.** V2 only, for opt-in memorial pages, behind an explicit multi-step confirmation. |

**The one rule:** every read is authorised by resolving the requester to a `VaultMember` role, an active `Share`, or a delivered `CapsuleRecipient`. There is no fourth path. Nothing is readable by virtue of knowing an id.

### 11.2 Permission matrix

| Action | Owner | Vault admin | Contributor | Viewer | Share-link holder | Capsule recipient |
|---|---|---|---|---|---|---|
| View memory | ✓ | ✓ | ✓ | ✓ | ✓ if granted | ✓ after delivery |
| Download original | ✓ | ✓ | own only | if allowed | if allowed | if allowed |
| Create memory | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Edit memory | ✓ | ✓ | own only | ✗ | ✗ | ✗ |
| Delete memory | ✓ | ✓ | own only | ✗ | ✗ | ✗ |
| Comment `[V1]` | ✓ | ✓ | ✓ | if granted | if granted | ✓ as a reply |
| Create a share link | ✓ | ✓ | own only | ✗ | ✗ | ✗ |
| Revoke a share link | ✓ | ✓ | own only | ✗ | ✗ | ✗ |
| Seal a capsule | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Cancel a capsule | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Invite members | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Delete the vault | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Transfer to an heir `[V2]` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

### 11.3 Sharing links — how they work

- Token: 32 bytes from a CSPRNG, base62url, stored **hashed** (SHA-256). Never guessable, never derived from an id.
- Every link carries a permission level, an optional expiry, an optional password, a download flag, and a view counter.
- Media behind a link is served through 5-minute signed URLs minted per request after authorisation. **No object in the bucket is ever publicly readable.**
- Link pages are `noindex, nofollow, noarchive` and excluded in `robots.txt` — a shared memory must never appear in a search engine.
- **Revocation is immediate.** The token row is marked revoked and the next request fails. Because signed media URLs live 5 minutes, real-world exposure after revocation is bounded to minutes rather than forever.
- The owner sees a live list of every active link, its view count, and when it was last opened, and can kill any of them in one tap.

### 11.4 Capsule access — the special case

A capsule grants access *in the future*, which creates unique rules:

- **Before delivery:** only the owner can see the contents. The recipient's token resolves to a countdown page revealing only the sender's name and the unlock date — never the media.
- **At delivery:** the recipient's token becomes valid for content. Access is logged.
- The recipient **never needs an account.** Requiring one at that moment would be the cruellest possible product decision.
- The owner can cancel any time before delivery. After delivery, the recipient's copy persists — retracting a delivered gift is not a coherent promise.
- Tokens are versioned so a leaked link can be rotated without destroying the capsule.

### 11.5 Who can do what — the plain-language answers

- **Who can view content?** Only the owner, until the owner deliberately grants access. Grants are always to a named person or a specific link, always visible in one place, and always revocable.
- **Who can edit?** The author, plus vault owners and admins. Sealed capsules are immutable by design — that immutability is what makes the promise real.
- **Who can share?** Only owners and admins create links; contributors can share their own contributions; viewers can never re-share.
- **Who can delete?** The author and the vault owner. Deletion is soft for 30 days (recoverable from Trash), then media is purged from primary and backup storage. Deleting an account triggers a 30-day grace period, then irreversible destruction.
- **Can access be revoked?** Yes — every share link and every membership, instantly, with residual exposure bounded by the signed-URL TTL. The one honest exception, stated in the UI, is a capsule already opened by its recipient.

### 11.6 Data-handling commitments

The existing site pledges *"No ads. No data mining. Just your life, beautifully preserved."* Keep it, and make it enforceable:

- No advertising, ever. No sale or brokering of personal data. No third-party trackers inside the authenticated app — analytics is first-party, event-based, and never touches media content.
- **AI processing is opt-in and per-purpose**, with a clear statement of what leaves the device, to which provider, and for how long, plus a contractual commitment that user content is not used to train third-party models. One global "process nothing with AI" switch genuinely disables captioning, transcription, and embeddings.
- **GPS/EXIF location is stripped by default** and retained only on opt-in.
- **Children's data:** the product is *about* children by design. No behavioural profiling of minors, no facial recognition of minors, and an age gate at account creation (13+/16+ by jurisdiction).
- **Biometrics (face grouping):** deferred to V2 and, when built, requires separate explicit written consent, a retention schedule, and a deletion path — and must be geo-disabled in Illinois, Texas, and Washington absent a specific compliance review. **This is the single largest legal risk in the inherited feature list and must not slip into an early release by accident.**
- **Deceased persons:** memorial content and posthumous delivery need a documented policy on who may act for a deceased user. **INSUFFICIENT EVIDENCE — PRODUCT DECISION REQUIRED**, and legal review, before V2.

---

## 12. MEDIA ARCHITECTURE

Media *is* the product; it is also the entire cost base and the main source of failure. Designed for a phone on a bad connection.

### 12.1 Upload pipeline

```
Client                                   Edge / API                     Storage
──────                                   ──────────                     ───────
1. select or capture
2. read metadata, generate blurhash
   + a 320px local thumbnail
3. write to IndexedDB  ── the memory is now SAFE even if the app dies
4. optional client-side downscale
   (images > 4000px on cellular, opt-in)
5. request an upload session ────────────▶ create UploadSession
                                           mint presigned multipart URLs
6. PUT chunks (5–10MB) directly ─────────────────────────────────────────▶ R2
   3 in parallel, resumable, ETags recorded
7. on interruption: resume from the last
   confirmed part (never restart)
8. complete ─────────────────────────────▶ verify checksum, finalise
                                           enqueue derivative jobs
                                                    │
                                                    ▼
                                   thumb 320 · preview 1280 · poster frame
                                   video: HLS ladder 480/720/1080(/2160)
                                   audio: normalised AAC + waveform
                                   EXIF extracted, GPS stripped
                                   blurhash stored, checksum stored
                                                    │
9. push/SSE: "ready" ◀──────────────────────────────┘
```

**Non-negotiables:**
- The client never uploads *through* the application server. Presigned direct-to-storage only — an API server proxying 4K video is both a bottleneck and a cost error.
- Multipart and resumable from day one. Retrofitting resumability after launch means rewriting the client, the API, and the queue.
- Idempotent by `client_id`, so a retry after an ambiguous failure cannot create a duplicate memory.
- **The original is never modified.** Every derivative is additional. "No Compression" is an inherited promise and a genuine differentiator — honour it literally.

### 12.2 Compression and optimisation

| Asset | Stored | Delivered |
|---|---|---|
| Photo | Original, byte-for-byte | AVIF → WebP → JPEG by `Accept`; widths 320/640/1280/2048; `srcset` + `sizes`; blurhash placeholder |
| Video | Original | HLS with an adaptive ladder; a poster frame; a ~2s silent muted preview loop for grid hover |
| Audio | Original | 128kbps AAC plus a pre-computed waveform for instant scrub UI |
| Generated recap | MP4 (H.264, maximum compatibility) + HLS | Both |

Client-side downscaling before upload is **offered, never forced**, and is off by default on Wi-Fi — because the product promised originals. On a metered connection the app asks once.

### 12.3 Thumbnails and perceived performance

Four tiers, in order: **blurhash** (inline in the API payload, ~30 bytes, renders instantly) → **320px thumb** (grid) → **1280px preview** (detail) → **original** (download or zoom). This is precisely why the timeline can feel instant offline — blurhashes and thumbs are tiny and aggressively cached.

### 12.4 Metadata

Extracted server-side: dimensions, duration, codec, `DateTimeOriginal`, camera and lens, orientation, and GPS — with **GPS discarded unless the user has opted into location.** `DateTimeOriginal` pre-fills `occurred_at`, which is what makes a bulk import of an old archive land correctly on the timeline instead of collapsing into "today". A perceptual hash is stored for V1 deduplication.

### 12.5 Storage, CDN and access

- **Cloudflare R2** for objects: S3-compatible and, critically, **zero egress fees** — the decisive factor for a media product whose users repeatedly re-watch their own content. On S3, egress alone can exceed the subscription price for an engaged user.
- Layout: `vault/{vault_id}/memory/{memory_id}/{asset_id}/{variant}` — makes per-vault deletion, accounting, and export a prefix operation.
- Buckets are **entirely private.** Access is always via short-TTL signed URLs (5 minutes for viewing, 60 for a download), minted only after an authorisation check.
- Cloudflare CDN in front, `Cache-Control: private, max-age=300` on signed variants, long-lived immutable caching on content-addressed derivative paths.
- Hotlink protection and per-user rate limiting on signed-URL minting, so a leaked link cannot be turned into a public CDN.

### 12.6 Downloads, deletion and backup

- **Downloads:** a single asset via signed URL; a whole album or vault as a server-assembled ZIP delivered as a background job with an email link. Originals always available — no export tax, no watermarks.
- **Deletion:** soft-delete the row → 30-day Trash → hard delete of every variant across primary and backup storage → an `AuditLog` entry. A deletion certificate available on request.
- **Backup — the real 20-year problem.** A capsule promised for 2046 needs more than one bucket:
  1. Primary: R2, multi-region.
  2. Secondary: a **different provider** (Backblaze B2 or S3 Glacier Deep Archive), synced nightly. Cross-provider is the point — one vendor's account closure or regional failure must not be existential.
  3. Postgres: continuous archiving (PITR) plus daily encrypted logical dumps to a third location.
  4. Quarterly **restore drills** — a backup nobody has restored is a rumour.
  5. An annual integrity sweep verifying stored `checksum_sha256` against the objects, catching bit rot before a user does.
- **Cost control:** automatically tier originals older than 24 months with no access into infrequent-access storage while keeping derivatives hot. Track per-user storage cost against subscription revenue and surface the ratio on the admin dashboard — that number decides whether "unlimited" is survivable (§17).

### 12.7 Designed for slow connections

Progressive image loading with blurhash first · an adaptive video ladder that starts at 480p and climbs · `Save-Data` and `navigator.connection.effectiveType` respected (defer originals, defer autoplay, offer downscaling) · manual pause and resume for uploads · uploads that continue across navigations because they are owned by the service worker rather than the page · a persistent, honest queue UI ("2 of 5 uploaded — we will finish when you are back online") · and, underneath all of it, **the memory is never at risk while an upload is pending, because it already exists locally.**

---

## 13. SEARCH & ORGANIZATION

The existing copy promises both "automatically organized" and "search by feeling". The design principle: **automation does the organising, search is for retrieval, and manual curation is optional and pleasurable — never required.**

### 13.1 The primary organising axis is time

`occurred_at` with an `occurred_precision` flag is the backbone. Everything derives from it: the timeline is time, On This Day is time, recaps are time, and the future band is time.

`occurred_precision` matters more than it looks. A scanned 1974 wedding photo has a *year*, not a timestamp. Without precision, imported archives either lie about their dates or collapse into the upload date. This one field is the difference between a real family archive and a broken one.

### 13.2 What we build, and when

| Capability | Value | Ship |
|---|---|---|
| Timeline (past + future) | The product's identity | **MVP** |
| Chronological gallery grid | Visual browsing | **MVP** |
| On This Day | The retention mechanic | **MVP** |
| Favourites | One-tap, universally understood curation | **MVP** |
| Text search over title and note | The cheap 80% of retrieval | **MVP** (Postgres FTS) |
| Date and year jump | Direct navigation | **MVP** |
| Occasion tags (curated enum) | Matches how families think; taken from the repo's own category list | **MVP**, auto-suggested and manually confirmable |
| Filters: media type, favourite, has-voice-note, in-a-capsule | Fast narrowing | **MVP** |
| Albums (manual) | Deliberate curation | **MVP-lite** |
| Auto event grouping (same day / burst clustering) | Delivers "automatic organisation" honestly and cheaply | **V1** |
| People tagging (manual) + person filter | The second most useful axis after time | **V1** |
| **Semantic search** (embeddings over auto-captions and transcripts) | The "search by feeling" promise | **V1** |
| Free-text tags | Power-user flexibility | **V1** |
| Video and voice transcript search | Voice notes are the archive's most valuable content and are unsearchable everywhere today | **V1** — genuinely differentiating |
| Saved searches / smart albums | Living collections | **V2** |
| Face clustering | Highest organising value, highest legal risk | **V2**, opt-in, geo-gated |
| Places / map | No evidence of demand in the source product; GPS is stripped by default | **Not planned** |

### 13.3 Search architecture

**MVP — Postgres only.** A `tsvector` generated column over `title`, `note`, occasion, and person names, with a GIN index, plus trigram matching for typo tolerance. This handles thousands of memories per user with excellent latency and zero additional infrastructure. A separate search cluster at MVP would be premature.

**V1 — hybrid retrieval in the same database.** Add `pgvector` with an HNSW index over `MemoryEmbedding`. Each memory gets a composed text blob (title + note + auto-caption + transcript + people + occasion + a human-readable date), embedded once and re-embedded on edit. Queries run keyword and vector search in parallel and fuse results with reciprocal rank fusion. "Happy times at the beach" then works — and, importantly, it works over the *voice notes*, which nothing on the market does well today.

**Rejected:** Algolia / Meilisearch / Elasticsearch as a separate service. Per-user corpora are small (thousands of documents, not millions); Postgres with pgvector is faster to build, cheaper, keeps sensitive content inside one trust boundary, and eliminates a whole class of index-drift bugs. Revisit only if per-user corpora exceed roughly 100k memories.

### 13.4 The organisation promise, made concrete

On upload, with no user effort, the system produces: a position on the timeline (from EXIF), placement in the correct month and year cluster, a blurhash and thumbnails, an event grouping with same-day media `[V1]`, a suggested occasion and title `[V1]`, a caption and transcript `[V1]`, and an embedding for semantic recall `[V1]`.

The user is asked for exactly one thing — *"what did this mean?"* — because that is the one thing no machine can supply, and it is the entire point of the product.

---
## 14. NOTIFICATIONS

Guiding rule from the design principles: **be quiet.** A memory app that nags gets uninstalled, and every unnecessary notification devalues the one that actually matters — the arrival. Target: **fewer than 4 notifications per user per month** outside deliveries.

### 14.1 Trigger matrix

| Event | In-app | Push | Email | SMS | When exactly | MVP? |
|---|---|---|---|---|---|---|
| **Capsule delivered to recipient** | ✓ | ✓ | ✓ **always** | `[V1]` | At `unlock_at` in the *recipient's* timezone, adjusted into a humane window (09:00–20:00 local) | **MVP** |
| **Recipient opened your capsule** | ✓ | ✓ | ✓ | ✗ | Immediately on first open. *The single most valuable notification the product sends.* | **MVP** |
| **Recipient replied** | ✓ | ✓ | ✓ | ✗ | Immediately | **MVP** |
| Capsule delivery failed on all channels | ✓ | ✓ | ✓ | ✗ | After the retry ladder is exhausted; **must be actionable** | **MVP** |
| Capsule delivering in 7 days | ✓ | ✓ | ✓ | ✗ | Once, 7 days before — last chance to add or cancel | **MVP** |
| **On This Day** | ✓ | ✓ | ✗ | ✗ | Once per week maximum, only when there is genuinely something from a past year; 09:00 local | **MVP** |
| Upload finished after leaving the app | ✓ | ✓ (silent/badge) | ✗ | ✗ | On queue drain, only if the app is backgrounded | **MVP** |
| Storage nearly full (90%) | ✓ | ✗ | ✓ | ✗ | Once at 90%, again at 100% | **MVP** |
| Sign-in from a new device | ✓ | ✗ | ✓ | ✗ | Immediately — a security notification, never suppressible | **MVP** |
| Someone viewed your share link (first time) | ✓ | optional | ✗ | ✗ | First view only, then silent | **MVP** |
| Email/passkey/security change | ✓ | ✗ | ✓ | ✗ | Immediately, non-suppressible | **MVP** |
| Payment failed / subscription lapsing | ✓ | ✗ | ✓ | ✗ | Immediately, then day 3 and day 7 | **MVP** |
| **Annual reassurance report** | ✗ | ✗ | ✓ | ✗ | Yearly on the signup anniversary — what is stored, what is pending, the delivery plan | **V1** |
| Recipient contact details look stale | ✓ | ✗ | ✓ | ✗ | When a capsule is > 2 years out and contact is unverified for 18 months | **V1** |
| Invited to a shared vault | ✓ | ✓ | ✓ | ✗ | Immediately | **V1** |
| New memory added to a shared vault | ✓ | digest | digest | ✗ | **Digest only** — daily at most, never per-item | **V1** |
| Someone commented on your memory | ✓ | ✓ | digest | ✗ | Immediately in-app; digested by email | **V1** |
| Collaborative capsule: contribution received | ✓ | ✓ | ✓ | ✗ | Immediately to the organiser | **V1** |
| Collaborative capsule: your clip is due | ✓ | ✓ | ✓ | ✗ | 3 days and 1 day before the deadline | **V1** |
| Recap ready (monthly / Year in Review) | ✓ | ✓ | ✓ | ✗ | On generation; December for Year in Review | **V1** |
| Heir process initiated `[V2]` | ✓ | ✓ | ✓ | ✓ | Immediately to the owner, with a long cancellation window | **V2** |

### 14.2 Channel rules

- **Email is the guaranteed channel.** Push subscriptions die (browser reset, device replaced, iOS requires an installed PWA). Anything the user must not miss goes by email regardless of push state.
- **Push is the delight channel** — timely and dismissible. Never the sole carrier of critical information.
- **SMS/WhatsApp `[V1]`** is reserved for capsule delivery only. It costs money and it is intrusive; it exists solely to honour the delivery guarantee.
- **In-app is the complete record.** Everything the product ever sent is in `/app/notifications`, so nothing is lost to a cleared notification tray.

### 14.3 Controls

Per-type and per-channel toggles; quiet hours with timezone awareness; a global digest mode; one-click unsubscribe honoured in every email (including `List-Unsubscribe` headers). **Security and billing emails are not suppressible** and this is stated plainly in settings. Notifications sent per user per week are tracked as a product health metric with an alert if the mean exceeds two.

### 14.4 Delivery notification design (the important one)

The delivery notification is the payoff of a promise made possibly decades earlier. It gets special treatment:

- Subject line names the sender and the occasion, never the brand: *"Dad recorded this for your 18th birthday."*
- No marketing, no upsell, no footer clutter — one link and one sentence.
- The email must render correctly in email clients that will not exist for another 15 years: table-based layout, inline styles, a plain-text alternative, no JavaScript, no web fonts, no external CSS.
- The link goes to a page that works in any browser back to the ES5 era via progressive enhancement. **A 2046 recipient must not be blocked by a 2026 framework assumption.** This is a hard architectural constraint on `/c/[token]`: it must be server-rendered and functional without client-side JavaScript.

---

## 15. AI FEATURES

The existing product markets AI heavily (a whole route, a whole section, 15 generation categories, "AI-powered memory platform" in the metadata). But most of what it labels AI does not need AI, and the parts that do need it are not equally valuable. Assessed honestly:

### 15.1 Assessment

**A1 — Auto-captioning and tagging (vision)**
- **VALUE:** High, but mostly *indirect* — captions are the substrate that makes semantic search and recaps possible. Users rarely read them.
- **UX:** Invisible. Runs on upload; surfaces as better search and better auto-titles.
- **COMPLEXITY:** Low-medium. A vision model call per asset; batched.
- **COST:** Roughly $0.001–0.003 per image. At 500 uploads per user per month that is $0.50–1.50 per user per month — **material against a $9 subscription.** Mitigate by captioning only the first N per event cluster and by making it opt-in on the free tier.
- **PRIORITY:** **V1** — it is the foundation for A2 and A4.

**A2 — Semantic / "emotional" search**
- **VALUE:** **Highest of all the AI features.** It is the explicit promise ("search by feeling"), it is used repeatedly, and it gets better as the archive grows — which is exactly the retention dynamic the product wants.
- **UX:** A search box that understands "the summer we drove to the coast". Results explain themselves ("matched: beach, 2019, Ella").
- **COMPLEXITY:** Medium. Embeddings + pgvector + hybrid fusion. No new infrastructure.
- **COST:** Very low — around $0.00002 per embedding, and query embeddings are trivially cacheable.
- **PRIORITY:** **V1, first AI feature to ship.**

**A3 — Voice/video transcription**
- **VALUE:** **Very high and under-appreciated.** The most precious content in a family archive is someone's voice telling a story, and today it is completely unsearchable everywhere. Transcription also produces accessibility captions and feeds A2.
- **UX:** Every voice note and video gets a readable, searchable, copyable transcript. Grandma's story becomes text.
- **COMPLEXITY:** Low. A speech-to-text API call.
- **COST:** ~$0.006 per minute. A user recording 20 minutes a month costs about $0.12. Excellent value.
- **PRIORITY:** **V1.**

**A4 — Auto recaps / Smart Recaps (video assembly)**
- **VALUE:** High for engagement and sharing; this is the "cinematic recap" promise and it drives a recurring notification worth opening.
- **UX:** "Your November" appears as a card. Watch, tweak the selection, share. Auto-generated monthly and annually.
- **COMPLEXITY:** **High.** Selection logic (which 12 moments?), server-side video composition (FFmpeg workers), beat-matched cuts, and **licensed music** — the existing copy explicitly promises "licensed music", which is a real commercial and legal commitment, not a technical one.
- **COST:** Compute per render (~$0.05–0.30 depending on length), plus music licensing as a fixed cost.
- **PRIORITY:** **V1 late.** Ship a simpler version first: an auto-selected slideshow with Ken Burns motion and licensed music. Full beat-matched cinematic editing is V2.

**A5 — AI narrative stories ("AI Memory Stories")**
- **VALUE:** Medium-high and distinctive — nobody else writes the story *around* your photos. But it carries real risk: an LLM inventing emotional detail about a real family's life is worse than no feature at all.
- **UX:** "Tell the story of this trip" → a warm few paragraphs, always presented as a **draft the user edits and approves**, never as fact. Grounded strictly in the user's own notes, dates, people, and transcripts.
- **COMPLEXITY:** Medium (Claude + careful grounding + an editing UI). Prompt-engineering-heavy to avoid confabulation.
- **COST:** ~$0.02–0.10 per story. Fine.
- **PRIORITY:** **V2.** Requires the caption/transcript layer to exist first, and requires strong guardrails.

**A6 — Auto event grouping / organisation**
- **VALUE:** High — it is the "automatically organized" promise.
- **UX:** Uploads collapse into "Ella's Birthday · 14 photos" instead of 14 loose tiles.
- **COMPLEXITY:** **Low — and it needs no AI.** Timestamp and burst clustering plus simple heuristics gets 90% of the value. Only the *naming* benefits from a model.
- **COST:** Near zero.
- **PRIORITY:** **V1 — build the deterministic version first.** This is the clearest example in the whole plan of a feature marketed as AI that should be plain code.

**A7 — Face grouping**
- **VALUE:** High utility.
- **UX:** "Who is this?" once, then a person filter forever.
- **COMPLEXITY:** Medium-high technically; **very high legally** (Illinois BIPA statutory damages per violation, Texas CUBI, GDPR Article 9 special-category data — and this product's users are largely families with children).
- **COST:** Low compute; potentially enormous legal cost.
- **PRIORITY:** **V2 at the earliest**, opt-in only, on-device where possible, geo-gated, with a documented retention and deletion policy and a legal review before a single embedding is computed. **Do not build this early.**

**A8 — Generative cards, posters and invitations**
- **VALUE:** Medium. Strong for outward sharing and directly monetisable, but it is a *different product* from a memory vault — it competes with Canva rather than with Google Photos.
- **UX:** Pick a memory, pick an occasion, get three designs, edit text, send or print.
- **COMPLEXITY:** Medium-high (image generation plus a template and text-layout engine).
- **COST:** ~$0.04–0.08 per generated image, plus iteration.
- **PRIORITY:** **V2.** The existing repo's 15 categories are an ambitious wishlist; ship 3 templates well before 15 badly.
- **Risk flag:** generative images of *real family members* is an area where quality failures are unusually upsetting. Prefer template-and-layout composition over generative re-rendering of people's faces.

**A9 — Duplicate detection**
- **VALUE:** Medium — cleaner archive and lower storage cost.
- **COMPLEXITY:** Low (perceptual hashing; not AI).
- **COST:** Negligible; it *saves* money.
- **PRIORITY:** **V2**, or earlier if storage cost pressure appears.

**A10 — Suggested capsules (the sharpest AI idea available)**
- **VALUE:** **Potentially the highest-leverage AI feature in the entire product, and it is not in the existing repo at all.** The product's core problem is that people do not think to create capsules. So: notice that a person's 18th birthday is 6 months away, notice there are 400 memories of them, and prompt — *"Ella turns 18 in June. Want to make her something? We found 40 moments to start with."*
- **UX:** A single, well-timed, emotionally intelligent card on the home screen with the work pre-done.
- **COMPLEXITY:** Low-medium. Mostly date arithmetic plus memory selection; a model only for the copy and the curation.
- **COST:** Negligible.
- **PRIORITY:** **V1.** This directly attacks the product's biggest activation problem.

### 15.2 AI in the MVP?

**No.** No AI ships in the MVP, deliberately:

1. Every AI feature depends on there being an archive first. AI over an empty vault is worthless.
2. The core loop — capture → seal → deliver → open — needs zero AI and is the actual differentiator.
3. AI adds per-user variable cost before there is revenue to absorb it.
4. Privacy consent flows for AI processing must be designed properly, not rushed.
5. Auto-organisation, On This Day, and event grouping — the features users *perceive* as intelligence — are all deterministic date logic and ship in MVP or V1 without a model.

**Sequence:** V1 → A2 (semantic search), A3 (transcription), A6 (grouping, no AI), A10 (suggested capsules), then A1 (captioning) and A4-lite (slideshow recaps). V2 → A5 (stories), A4-full (cinematic recaps), A8 (generative cards), A9 (dedupe). V2+ with legal clearance → A7 (faces).

### 15.3 Cost guardrails

Per-user monthly AI budget by tier, enforced in code before a call is made; a hard kill switch per feature; caching of every derivative (a caption is computed once, ever); batched off-peak processing; free tier gets transcription and embeddings only for content it actually creates, with generation reserved for paid. Track **AI cost per active user** as a first-class business metric next to storage cost.

---

## 16. ADMIN PANEL

Does the new PWA need one? **Yes — but a small, internal, operational one, not a product surface.** The existing repository has nothing of the kind, so this is entirely new. The justification is specific: a product that promises delivery in 20 years needs humans who can *see* whether deliveries are working.

**Scope decision:** MVP gets a minimal operator console (roughly 5 screens). A fuller admin arrives in V1. There is no customer-facing "organisation admin" concept — this is a consumer product.

### 16.1 MVP operator console

| Screen | Purpose | Key content |
|---|---|---|
| **Delivery health** | The most important internal screen in the company | Capsules due today / this week · failed deliveries needing intervention · per-channel success rate · the retry backlog · the oldest pending capsule · **alerting if any capsule passes its `unlock_at` without a successful attempt** |
| **Job queue** | Confirm the durable clock is running | `ScheduledJob` by state and kind · stuck jobs (locked and expired) · attempt distribution · manual re-run |
| **User lookup** | Support | Find by email; see plan, storage, capsule count, device count, recent errors. **No content access by default** — viewing a user's media requires an explicit break-glass action, a reason string, and an `AuditLog` entry, and the user is notified |
| **System health** | Operate | Upload success rate · transcode backlog · storage totals and cost · error rate · p95 latency |
| **Abuse reports** | Legal duty | Reported content queue (CSAM reporting path, DMCA, harassment), with a documented escalation procedure |

### 16.2 V1 additions

- **Analytics dashboard** — activation funnel (signup → first memory → first capsule sealed), retention cohorts, capsule creation rate, delivery success rate, open rate on delivered capsules, share-link usage, install rate, offline usage share.
- **Storage and cost management** — cost per user, the top 100 heaviest accounts, quota overrides, tiering status, and the storage-cost-to-revenue ratio (the number that governs pricing viability).
- **Subscription management** — Stripe reconciliation, failed payments, refunds, manual grants, churn reasons.
- **Content moderation** — only for content that has been *shared* or reported. **Private vault content is never proactively scanned** beyond the legally required CSAM hash-matching on upload; this boundary is a stated privacy commitment and must be architecturally enforced, not merely policy.
- **Feature flags and configuration** — rollout percentages, AI feature kill switches, per-tier quotas, maintenance mode.
- **Audit log viewer** — searchable, immutable, including every admin action.
- **Communications** — send a targeted announcement, view email delivery and bounce rates, manage templates.

### 16.3 Admin security

A separate authentication realm with mandatory hardware-key MFA · role separation (support / operator / engineer / owner), with support having no content access at all · every action audited · break-glass content access requiring a second approver and notifying the user · IP allowlisting · a session timeout of 30 minutes · and admin routes served on a distinct subdomain with independent rate limits.

---

## 17. MONETIZATION

### 17.1 EXISTING MODEL (what the repository actually shows)

**No monetisation is implemented.** There is no Stripe, no payment library, no checkout, no webhook handler, no subscription entity. What exists is two *contradictory* pricing presentations:

| Source | Free tier | Paid tier |
|---|---|---|
| `/pricing` page | **Basic — $0 forever**, 5GB high-resolution storage | **Legacy — $12/month**: unlimited storage, original quality, AI memory stories, priority support |
| Home `PricingSection` | **Free — $0**: 5 memory uploads per month, standard delivery, basic encryption | **Premium — $9/month or $89/year**: Unlimited Memories, 4K Video, Time capsules & Legacy Vault, Priority Multi-channel Delivery, Biometric App Lock |

Two conflicts that must be resolved before launch:

1. **Price:** $12/month versus $9/month (and $89/year, which implies $7.42/month).
2. **The free-tier limit metric:** 5GB of storage versus 5 uploads per month. These are completely different products. 5GB is quiet but too tight (roughly 10 minutes of 4K — a single event exhausts it before attachment forms); 5 uploads per month is a hard wall hit in the first week, every week. **Both are rejected — see §17.2 and Appendix C-6.**

Also note that the home page gates **time capsules behind the paid tier** while the `/pricing` page does not mention them at all — meaning the product's single differentiating feature has no agreed commercial position.

**INSUFFICIENT EVIDENCE — PRODUCT DECISION REQUIRED** on price point, limit metric, and whether capsules are free.

Two further signals: the copy pledges "No ads. No data mining", ruling out ad monetisation; and "physical or digital cards" implies a transactional revenue line that was never built.

### 17.2 RECOMMENDED MODEL

> **Revised and now DECIDED — see §17.2.** Tier names follow the designer's Free / Premium / Family; pricing is region-aware (India-first). The free tier is limited by **storage volume and capsule horizon**, never by a count of memories created, and there is **no quality tiering**. Appendix C-6 and C-8 record the decisions and the rejected alternatives; this resolves open question **A-1**.

**Structure: freemium subscription. The free tier is limited by STORAGE VOLUME and CAPSULE HORIZON — never by a count of memories created.**

**Decided model (resolves Appendix A-1, C-6, C-8):**

| | **Free** | **Premium** | **Family** |
|---|---|---|---|
| Price | ₹0 / $0 | **₹399/mo · ₹3,199/yr** (≈$8 / $72) | **₹749/mo · ₹5,999/yr** (≈$15 / $120) |
| Storage | **10 GB** | **250 GB** | **2 TB pooled** |
| Memories created per month | **unlimited** | unlimited | unlimited |
| Originals preserved, never compressed | ✓ | ✓ | ✓ |
| Video length per memory | 5 min | 30 min | 30 min |
| **Pending capsules at once** | **3** | unlimited | unlimited |
| **Capsule scheduling horizon** | **up to 12 months** | **unlimited + age milestones** | unlimited + age milestones |
| Capsules already delivered | unlimited (never counted) | unlimited | unlimited |
| Delivery channels | in-app + email | + SMS, WhatsApp, priority routing | + backup guardian |
| Shared vaults | 1 (up to 3 members) | 5 (up to 10 members) | unlimited |
| Collaborative capsules | contribute only | organise 2/year | unlimited |
| Broadcasts `[R2]` | ✗ | 100 recipients/month | 500 recipients/month |
| AI `[R2]` | semantic search only | search, transcripts, recaps, prompts | + stories, priority processing |
| Heirs `[R3]` | ✗ | 1 | up to 5, with document storage |
| Seats | 1 | 1 | **6** |
| Support | community | email | priority |

**Reasoning behind each decision:**

1. **Storage-based, never upload-count-based — DECIDED.** Three converging arguments:
   - **Cost.** 10 GB on R2 costs roughly **$0.15 per month at full usage, with zero egress.** A "5 uploads per month" cap saves a rounding error while suppressing the single behaviour the entire product depends on. It is a wall that costs us revenue and saves us nothing.
   - **Wall shape.** An upload counter is a **recurring** wall, hit in week one of every month, forever — it generates monthly resentment and actively teaches the user *not* to upload. A storage cap is hit **once, late**, when the user is already attached and upgrading feels obviously rational: *"I have built something valuable here and I need more room."* Same revenue event, opposite emotional register.
   - **Compounding value.** On This Day, recaps, semantic search, and event grouping all improve with archive density. A monthly counter caps the exact variable that creates retention and switching cost. We would be charging users to stop us from becoming indispensable.
2. **No quality tiering — DECIDED, and this overrides the designer's 720p free cap.** "High resolution, no compression, originals preserved" is one of the product's strongest inherited promises and a real differentiator against every free consumer cloud. Degrading it for free users contradicts the brand at the exact moment we are asking for trust. It is also unnecessary: **10 GB already limits 4K naturally** (roughly 20 minutes), so volume does the gating without a hostile "we hold your 4K, pay to see it" mechanic. Paid differentiation lives in storage, capsule horizon, channels, AI, and seats.
3. **Capsules are free — and the paid gate is HORIZON, not count — DECIDED.** Free users get **3 pending capsules at a time** and a **12-month scheduling horizon**; delivered capsules never count against the cap. Four reasons this beats "3 capsules then pay":
   - **It never breaks the growth loop.** A lifetime cap of 3 kills the viral engine after three events. Counting only *pending* capsules lets a free user run the loop indefinitely — seal, deliver, recipient opens, recipient replies, recipient seals their own. **Every delivered capsule is distribution we did not pay for. Capping lifetime capsules is capping our own acquisition channel.**
   - **The gate matches the actual cost.** A capsule due in 20 years is a 20-year liability: storage, scheduling, contact-freshness operations, cross-provider backup, and a delivery obligation we must honour long after the subscription may have lapsed. A capsule due next month costs almost nothing. **Charging for horizon is charging for what genuinely costs us** — the fairest gate available, and the only one we can defend out loud on the pricing page.
   - **The upgrade prompt becomes emotional instead of punitive.** "You've used 3 of 3" is a wall. *"This one needs to wait until 2044 — that's what Premium is for"* is the product telling its own story, and it lands at the moment of highest emotional intent: someone trying to reach a child's eighteenth birthday.
   - **Three concurrent is still a real constraint.** Wanting capsules pending for Mum, Dad, and both children at once is a natural and frequent family moment. The cap converts — it simply does not teach restraint.
4. **A sealed promise is never cancelled for non-payment — DECIDED, and non-negotiable.** If a Premium subscription lapses while capsules are scheduled beyond the free horizon, **those capsules are still delivered.** New long-horizon capsules require an active subscription; existing ones are honoured. This costs a little and is the single most trust-building line in the entire pricing model — and it is the only position consistent with a product that sells permanence. It extends the C-18 policy that memories are never deleted for non-payment. Both must be written into the Terms, not left as implementation behaviour.
5. **Two paid tiers, not one.** The existing single-paid-tier design leaves no upgrade path. Family sharing and heirs are the natural high-tier hooks — households pay far more readily than individuals.
4. **Annual pricing is discounted ~25%.** Annual commitment is the right instinct for a product about permanence, and it materially improves cash flow against storage costs paid monthly.
5. **"Unlimited" is retired.** The existing copy promises unlimited storage forever. That is unsurvivable: a single user with 2TB of 4K video costs real money every month, forever, against a $9 subscription — and this product's users *never delete anything*, by design. Generous, honest tiers beat an unlimited promise that must later be broken. **Breaking a storage promise is fatal for a company whose product is trust.**
6. **A lifetime plan is worth offering — carefully.** A "Forever" one-time purchase (~$399, capped storage, transferable) matches the product's emotional promise better than any subscription. But it must be funded properly: the cash goes into a segregated reserve sized to cover, say, 50 years of that account's storage at conservative cost assumptions. Offer it only once unit economics are measured. Do not launch with it.

**Additional revenue lines (V1/V2):** printed photo books and posters (high margin, emotionally aligned), physical greeting-card fulfilment, and a paid extra-storage add-on.

**Explicitly rejected:** advertising (contradicts the stated promise and the product's whole reason to exist), data monetisation (the same), paid social features (there are none), and charging for data export (an export tax on a memory vault is indefensible).

**Launch recommendation:** ship Release 1 with **Free and Premium only** (₹399/mo · ₹3,199/yr) plus Stripe and Razorpay checkout and the billing portal. Add Family and lifetime once retention data exists. **Instrument two ratios from day one:** storage cost per paying user, and **the conversion rate on the capsule-horizon paywall specifically** — if horizon is the primary gate, that single funnel step decides whether the model works, and it must be measured separately from the storage paywall.

**Free-tier copy (one sentence, and it must fit on one line):**
> "Free forever: unlimited memories, 10 GB of space, and up to 3 memories scheduled a year ahead."

---

## 18. NEW TECHNICAL ARCHITECTURE

The new repository is greenfield. Nothing is carried over because it exists; each choice is justified against this product's specific demands: heavy media, mobile-first, offline-tolerant, and a scheduling guarantee measured in decades.

### 18.1 Recommended stack

> **Extended by §35.** Part II adds Razorpay (India), the WhatsApp Business API, and courier and KYC integrations, and settles the designer brief's microservice proposal in favour of a **modular monolith plus two independently deployable workers** (§35.2), with Redis and Elasticsearch deferred (§35.3).

| Layer | Choice | Why this, for this product |
|---|---|---|
| **Framework** | **Next.js 16 (App Router), React 19, TypeScript strict** | Server components give a fast first paint on mobile; server actions remove a whole API layer for mutations; and — decisive here — `/c/[token]` can be **fully server-rendered so a capsule opens with no client JavaScript**, which is exactly what a 20-year-durable link requires. Note: the existing repo uses the same versions but in `output: 'export'` static mode, which is the *opposite* configuration. **Read `node_modules/next/dist/docs/` before writing code — this Next.js release has breaking changes from prior conventions.** |
| **PWA / service worker** | **Serwist** (the maintained successor to next-pwa) + a hand-written sync layer | Generates the precache manifest and integrates with the App Router. The upload/outbox logic is written by hand, because it is core product behaviour, not boilerplate. |
| **Styling** | **Tailwind CSS v4** + CSS custom properties for theming | Already proven in the existing repo's token setup; carry that forward. Keeps the bundle small, which matters on 3G. |
| **UI primitives** | **Radix UI** (headless) + local components | Accessibility for free — non-negotiable when grandparents are core users. No heavyweight component framework. |
| **Animation** | **Motion** (Framer Motion's successor) for UI, native **View Transitions** for navigation | Keep the craft; drop GSAP, Lenis, Three.js, the custom cursor, and the WebGL fluid simulation. Together those are several hundred KB and a battery cost for zero in-app value. |
| **Client state / data** | **TanStack Query** + **Dexie** (IndexedDB) + Zustand for UI state | TanStack Query's cache and mutation model maps directly onto optimistic-offline-then-sync. Dexie is the durable local store for the outbox and cached memories. |
| **Database** | **Postgres** — Neon (serverless, branching) or Supabase | Relational integrity matters here: ownership, permissions, and delivery schedules are all relational. Postgres also gives FTS *and* pgvector, so search needs no extra service. Branching makes preview environments trivial. |
| **ORM** | **Drizzle** | SQL-first, fully typed, no runtime engine binary, excellent serverless behaviour, transparent migrations. On a schema this permission-sensitive, seeing the actual SQL is a feature. |
| **Auth** | **Better Auth** (or Auth.js v5) — email OTP + passkeys + Google/Apple OAuth | Self-hosted so identity is not rented from a vendor for a product meant to last decades. Passkeys avoid password loss on a lifetime vault. WebAuthn also gives the promised biometric app lock. |
| **Object storage** | **Cloudflare R2** | **Zero egress fees.** In a product where users re-watch their own 4K video, egress on S3 can exceed the subscription price outright. S3-compatible, so migration stays possible. |
| **CDN / edge** | **Cloudflare** | Global cache, image resizing, signed URLs, WAF, and rate limiting at the edge — before requests reach the origin. |
| **Media processing** | **FFmpeg + sharp** in containerised workers on **Fly.io** (or Cloud Run) | Video transcoding is long-running and CPU-heavy — the wrong shape for serverless. Dedicated workers pulling from the job table scale independently and predictably. |
| **Background jobs** | **Postgres-backed job table** + workers, with `pg_cron` or a scheduled worker as the tick | **The most important architectural decision in the system.** A delivery promised for 2046 must not depend on any vendor's scheduler surviving. The database owns the schedule; Inngest/Trigger.dev may *execute*, but they are never the source of truth. |
| **Email** | **Resend** (transactional), with **AWS SES configured as a standing fallback** | Deliverability matters more here than anywhere else in the product. Two independent senders is the difference between a promise kept and a promise broken. |
| **SMS / WhatsApp `[V1]`** | **Twilio** | The only realistic route to WhatsApp Business plus SMS in one integration. |
| **Push** | **Web Push (VAPID)**, self-hosted | No vendor needed; works on all modern browsers including installed iOS PWAs. |
| **Payments** | **Stripe** — Checkout + Billing Portal + webhooks | Hosted checkout keeps PCI scope near zero. |
| **AI `[V1]`** | **Claude** (Anthropic) for captions, narrative, and curation copy; **Whisper**-class ASR for transcripts; **OpenAI or Voyage embeddings** into pgvector | Claude for anything touching emotional text — the quality difference is visible in exactly this use case. Keep the provider behind an internal interface so any single model can be swapped. |
| **Search** | **Postgres FTS (MVP) → + pgvector hybrid (V1)** | No extra service, sensitive content stays in one trust boundary, and per-user corpora are small. |
| **Hosting** | **Vercel** for the Next.js app; **Fly.io** for media and job workers | Vercel's edge and image handling suit the app; long-running work belongs on real machines. |
| **Monitoring** | **Sentry** (errors, both client and server) · **Axiom** or Better Stack (logs) · **Checkly** (synthetic checks) | Plus a bespoke **delivery-SLA monitor** that alerts if any capsule passes its unlock time without a successful attempt. That alert page is the most important one in the company. |
| **Analytics** | **PostHog**, self-hostable, first-party, EU-hostable | Funnels and cohorts without third-party trackers in an authenticated privacy product. |
| **Testing** | **Vitest** (unit) · **Playwright** (E2E, including offline and install flows) · **pgTAP** or SQL-level tests for permissions | Permission logic and the delivery scheduler need tests that assert on the database, not just the UI. |
| **CI/CD** | GitHub Actions → Vercel and Fly; Neon branch per PR | Preview environments with real, isolated data. |

### 18.2 Deliberate rejections

- **Static export (`output: 'export'`)** — the existing repo's mode. Impossible for this product: it forbids server-side authorisation, signed URLs, webhooks, and server rendering of `/c/[token]`.
- **GitHub Pages** — the existing host. Static-only; no server runtime at all.
- **Firebase / Firestore** — tempting for offline sync, but document modelling fits this permission model badly, costs escalate unpredictably at media scale, and vendor lock-in is a poor fit for a multi-decade promise.
- **A separate search service** — unjustified at this corpus size (§13.3).
- **A dedicated queue service as the source of truth** — acceptable as an executor, never as the system of record for a 2046 delivery.
- **GSAP + Lenis + Three.js in the app** — appropriate on the marketing page, actively harmful inside a daily-use mobile app.
- **A native-first build (React Native / Expo)** — a PWA satisfies the "iOS, Android, and Web" promise with one codebase; native shells can wrap the same PWA later (F10) if store presence is needed.
- **Client-side E2E encryption at MVP** — it would preclude server-side thumbnails, transcoding, search, and every AI feature. Offer it as a V2 opt-in tier for users who want it instead (F11).

### 18.3 System diagram

```
                     ┌──────────────────────────────────────┐
                     │   PWA (Next.js · React · Serwist)    │
                     │  service worker · IndexedDB outbox   │
                     └───┬──────────────┬───────────────┬───┘
                         │              │               │
              server actions      presigned PUT    Web Push
                  / API              (direct)      (VAPID)
                         │              │               │
        ┌────────────────▼────┐   ┌─────▼──────┐        │
        │  Next.js on Vercel  │   │ Cloudflare │        │
        │  auth · authz ·     │   │     R2     │        │
        │  signed URL minting │   │  (private) │        │
        └───┬─────────────┬───┘   └─────┬──────┘        │
            │             │             │               │
   ┌────────▼──────┐  ┌───▼─────────────▼────────┐      │
   │   Postgres    │  │  Workers on Fly.io       │      │
   │  Drizzle      │◀─┤  · transcode (FFmpeg)    │      │
   │  FTS+pgvector │  │  · thumbnails (sharp)    │      │
   │  ScheduledJob │─▶│  · DELIVERY ENGINE ──────┼──────┘
   │  AuditLog     │  │  · AI jobs [V1]          │
   └───────┬───────┘  │  · recap render [V1]     │
           │          └───┬──────────────────────┘
           │              │
   ┌───────▼──────────────▼──────────────────────────────┐
   │ Resend/SES · Twilio [V1] · Stripe · Claude [V1]     │
   │ Sentry · PostHog · B2 cold backup                    │
   └──────────────────────────────────────────────────────┘
```

### 18.4 The delivery engine — architecture detail

This subsystem is the product. It gets designed explicitly:

1. **Sealing** writes a `ScheduledJob(kind='capsule_delivery', run_at=unlock_at)` inside the **same transaction** that flips the capsule to `sealed`. There is no window in which a capsule is sealed but unscheduled.
2. A **tick worker** runs every minute: `SELECT ... WHERE state='pending' AND run_at <= now() FOR UPDATE SKIP LOCKED LIMIT 100`. Simple, boring, and correct under concurrency.
3. Each job **fans out** into per-recipient, per-channel attempts, each recorded in `DeliveryAttempt`, each idempotent by `(capsule, recipient, channel, attempt_no)`.
4. **Channel ladder:** push (instant, free) → email (guaranteed) → SMS `[V1]` → WhatsApp `[V1]` → notify the sender to intervene. Escalation continues until acknowledged or exhausted.
5. **Retries** with exponential backoff over days, not minutes — a bounced mailbox may come back, and there is no hurry once the date has arrived.
6. **A watchdog job** runs hourly and alerts a human if any capsule is past `unlock_at` with no successful attempt. **This alert must never be routine.**
7. **Long-horizon integrity:** a monthly sweep verifies that every sealed capsule has a valid future job row, that its media objects still exist and checksum correctly, and that recipient contact details are not stale — with a nudge to the owner where they are.
8. **Timezone correctness:** `unlock_at` is stored as UTC plus the intended timezone, and delivery is shifted into a humane local window. Receiving "for your 18th birthday" at 03:00 is a bug.

---

## 19. NEW REPOSITORY STRUCTURE

> **Extended by §37.** The structure below stands. Part II adds feature modules for `member`, `event`, `broadcast`, `collab`, `commerce`, `legacy`, and `moderation`, plus `docs/DESIGN-SYSTEM.md`. The consolidated layout is in §37 under **NEW REPOSITORY STRUCTURE**.

Feature-first (not layer-first), because this product's complexity is concentrated in a few deep features — capsules, upload, timeline — rather than spread thinly across many CRUD screens.

```
moments-and-memories/
├── .github/workflows/          ci.yml · e2e.yml · deploy-app.yml · deploy-workers.yml
├── apps/
│   ├── web/                    the PWA (Next.js 16, App Router)
│   │   ├── public/
│   │   │   ├── manifest.webmanifest
│   │   │   ├── icons/          192, 512, maskable, apple-touch
│   │   │   └── offline.html
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (marketing)/            public, static, indexable
│   │   │   │   │   ├── page.tsx            landing
│   │   │   │   │   ├── how-it-works/ legacy/ pricing/ privacy/
│   │   │   │   │   └── journal/[slug]/
│   │   │   │   ├── (auth)/
│   │   │   │   │   ├── login/ signup/ welcome/[step]/
│   │   │   │   ├── (app)/                  authenticated shell
│   │   │   │   │   ├── layout.tsx           bottom nav / sidebar
│   │   │   │   │   ├── page.tsx             Today
│   │   │   │   │   ├── timeline/ gallery/ search/
│   │   │   │   │   ├── memory/[id]/
│   │   │   │   │   ├── capsule/new/ capsule/[id]/
│   │   │   │   │   ├── album/[id]/ people/[id]/
│   │   │   │   │   ├── notifications/
│   │   │   │   │   ├── settings/(profile|security|privacy|plan|data|appearance)/
│   │   │   │   │   └── @modal/(.)new/       intercepted create sheet
│   │   │   │   ├── c/[token]/               RECIPIENT UNLOCK — server-rendered,
│   │   │   │   │                            must work with JS disabled
│   │   │   │   ├── s/[token]/               public share view
│   │   │   │   ├── admin/                   operator console
│   │   │   │   ├── api/
│   │   │   │   │   ├── webhooks/(stripe|resend|twilio)/
│   │   │   │   │   ├── upload/(session|complete)/
│   │   │   │   │   ├── media/[id]/url/      signed URL minting
│   │   │   │   │   └── push/subscribe/
│   │   │   │   ├── layout.tsx  manifest.ts  sitemap.ts  robots.ts
│   │   │   │   └── globals.css
│   │   │   ├── features/                    ◀── the heart of the codebase
│   │   │   │   ├── auth/                    components · actions · hooks · schema
│   │   │   │   ├── memory/
│   │   │   │   ├── capsule/                 seal-flow · countdown · delivery-status
│   │   │   │   ├── media/                   uploader · queue · viewer · capture
│   │   │   │   ├── timeline/                virtualiser · scrubber · future-band
│   │   │   │   ├── sharing/                 links · permissions · invites
│   │   │   │   ├── search/
│   │   │   │   ├── people/
│   │   │   │   ├── notifications/
│   │   │   │   ├── billing/
│   │   │   │   └── settings/
│   │   │   │        each feature: components/ · actions.ts · queries.ts ·
│   │   │   │        hooks/ · schema.ts (zod) · types.ts · __tests__/
│   │   │   ├── components/
│   │   │   │   ├── ui/                      Button, Sheet, Dialog, Field… (Radix)
│   │   │   │   ├── layout/                  BottomNav, Sidebar, AppShell, SafeArea
│   │   │   │   └── media/                   Img (blurhash), Video (HLS), AudioPlayer
│   │   │   ├── lib/
│   │   │   │   ├── db/                      drizzle client · schema/ · migrations/
│   │   │   │   ├── auth/                    config · session · guards
│   │   │   │   ├── authz/                   ◀ ALL permission logic, one place
│   │   │   │   ├── storage/                 r2 client · signed urls · keys
│   │   │   │   ├── jobs/                    enqueue · claim · kinds
│   │   │   │   ├── offline/                 dexie schema · outbox · sync engine
│   │   │   │   ├── push/  email/  ai/       [V1]
│   │   │   │   ├── validation/  utils/  analytics/
│   │   │   ├── hooks/                        cross-feature only
│   │   │   ├── stores/                       zustand UI stores
│   │   │   ├── types/
│   │   │   ├── sw/                           service worker source
│   │   │   │   ├── index.ts  precache.ts  runtime-cache.ts
│   │   │   │   ├── background-sync.ts        upload queue drain
│   │   │   │   └── push-handler.ts
│   │   │   └── styles/                       tokens.css  themes.css
│   │   ├── e2e/                              Playwright: offline, install, capsule flow
│   │   ├── next.config.ts  tailwind.config.ts  drizzle.config.ts
│   │
│   └── workers/                              containerised, deployed to Fly.io
│       ├── src/
│       │   ├── index.ts                      tick loop + claim
│       │   ├── handlers/
│       │   │   ├── capsule-delivery.ts       ◀ THE critical path
│       │   │   ├── delivery-watchdog.ts      alert on any missed unlock
│       │   │   ├── transcode-video.ts  generate-thumbnails.ts
│       │   │   ├── on-this-day.ts  recap-render.ts [V1]
│       │   │   ├── ai-caption.ts  ai-transcribe.ts  ai-embed.ts [V1]
│       │   │   ├── integrity-sweep.ts        checksums + orphans + stale contacts
│       │   │   ├── export-archive.ts  purge-deleted.ts
│       │   └── lib/                          ffmpeg · sharp · providers
│       └── Dockerfile
│
├── packages/
│   ├── shared/                 zod schemas, domain types, constants shared web↔workers
│   ├── db/                     drizzle schema + migrations (single source of truth)
│   ├── emails/                 React Email templates — incl. the 20-year-durable
│   │                           capsule delivery email (tables, inline CSS, no JS)
│   └── config/                 eslint · tsconfig · tailwind preset
│
├── docs/
│   ├── ARCHITECTURE.md  DATA-MODEL.md  PERMISSIONS.md
│   ├── DELIVERY-GUARANTEE.md   ◀ how the promise is actually kept, and its limits
│   ├── PRIVACY.md  RUNBOOK.md  DECISIONS/ (ADRs)
├── scripts/                    seed · backup-verify · restore-drill · load-test
└── README.md  AGENTS.md  turbo.json  package.json
```

**Structural principles:**

1. **`lib/authz/` is the only place permission logic lives.** Every read and write routes through it. A permission bug in this product is a privacy incident, so the surface area is kept deliberately tiny and heavily tested.
2. **`apps/workers` is a separate deployable.** Delivery must keep running even if a web deploy is broken or rolled back.
3. **`packages/db` is the single schema source** shared by app and workers — no drift.
4. **`sw/` is first-class application source**, not generated config. The offline upload queue is core product behaviour.
5. **`docs/DELIVERY-GUARANTEE.md` is a required document.** The promise needs a written, reviewable specification including its honest limits — that is what makes it an engineering commitment rather than a slogan.
6. **Marketing and app are separate route groups** so the marketing bundle never ships app code and vice versa.

---

## 20. SECURITY

Threat model in one line: **the worst realistic outcome is one user's private family video becoming visible to another user, or to the internet.** Everything below is prioritised against that.

### 20.1 Authentication

- Passkeys (WebAuthn) as primary; email OTP as fallback; Google/Apple OAuth optional. **No passwords** — no password to phish, leak, reuse, or forget on a lifetime vault.
- Sessions: HTTP-only, `Secure`, `SameSite=Lax` cookies; opaque server-side session ids (not stateless JWTs, so revocation is instant); a 30-day rolling window with a sliding refresh; device list with individual revoke and "sign out everywhere".
- OTP codes: 6 digits, single-use, 10-minute expiry, 5 attempts, hashed at rest, and rate-limited per email *and* per IP.
- Step-up re-authentication required for: changing email, adding a passkey, deleting the account, exporting all data, sealing a posthumous capsule `[V2]`, and assigning an heir `[V2]`.
- App lock: WebAuthn platform authenticator re-verification on resume, with a configurable timeout.

### 20.2 Authorization

- **A single chokepoint.** Every data access flows through `lib/authz/`, which resolves the actor to a vault role, an active share, or a delivered capsule recipient. There is no other path to content.
- **Deny by default.** Every query is scoped by `vault_id` derived from the *session*, never from client input. Ids from the client are treated as untrusted filters, never as authorisation.
- **Postgres Row-Level Security as a second line of defence**, so an application bug alone cannot leak cross-tenant data.
- **IDOR defence:** uuids everywhere (never sequential), plus a mandatory ownership check even when an id is unguessable. Unguessable is not a permission.
- The permission matrix in §11.2 is encoded as an executable table with a test per cell — a failing cell fails CI.

### 20.3 Secure APIs

Zod validation at every boundary (server actions, route handlers, webhooks) · strict CSRF protection on mutations, with server actions' built-in origin checking · CORS locked to known origins · no user-supplied HTML rendered anywhere without sanitisation · a strict CSP with nonces, `frame-ancestors 'none'`, and `object-src 'none'` · HSTS with preload · `Referrer-Policy: strict-origin-when-cross-origin` · `Permissions-Policy` limiting camera and microphone to same-origin only · webhook signature verification (Stripe, Resend, Twilio) with replay protection via timestamp windows and event-id deduplication.

### 20.4 Secure media

- **No public bucket objects, ever.** Every byte is served via a 5-minute signed URL minted after an authorisation check.
- Signed URLs are bound to the resource and are not enumerable; minting is rate-limited per user.
- Uploads are validated by magic bytes, not by extension or client-declared MIME; a size cap per tier; SVG upload is **rejected outright** (an XSS vector disguised as an image); EXIF is stripped of GPS by default.
- CSAM hash-matching (PhotoDNA-class) on upload, as legally required — this is a specific, documented exception to the no-scanning commitment and must be disclosed in the privacy policy.
- Transcoding runs in isolated, ephemeral containers with no database credentials and no network egress beyond storage — FFmpeg parsing untrusted media is a known RCE surface and is treated as hostile.
- `/c/[token]` and `/s/[token]` responses carry `X-Robots-Tag: noindex, noarchive` and are excluded in `robots.txt`.

### 20.5 Input validation and abuse

Zod schemas shared between client and server (the client copy is convenience; the server copy is truth) · media type and size limits enforced server-side · text length caps on every field · file-count caps per memory · recipient-count caps per capsule · and email/phone verification before a capsule may be sealed to that address.

### 20.6 Rate limiting

Edge-level (Cloudflare) plus application-level, per user and per IP: auth endpoints 5/min; OTP requests 3 per 15 min per email; upload-session creation 60/min; signed-URL minting 300/min; share-link creation 20/hour; capsule sealing 50/day; share-link *access* limited per token to blunt enumeration; AI job submission capped per tier per day. Exceeding a limit returns `429` with `Retry-After` and a clear UI message, never a silent failure.

### 20.7 Encryption

- **In transit:** TLS 1.3 everywhere; HSTS preload; no mixed content.
- **At rest:** database encryption (provider-managed, AES-256); R2 server-side encryption (AES-256 — which is what makes the existing "256-bit AES" claim truthful, *provided the marketing never implies it is end-to-end*).
- **Application-level:** OTP hashes, session tokens, share tokens, and capsule tokens all stored hashed (SHA-256); Stripe ids treated as secrets; PII fields available for column-level encryption where warranted.
- **Honesty requirement:** the current copy says "Military-grade security ensures your private vaults remain strictly yours". With server-side AI and thumbnailing, the service *can* technically read content. The privacy page must state exactly that, plainly. Overstating encryption is both a legal risk and a betrayal of the trust the product sells. E2E encryption is offered later as an explicit opt-in tier (F11) with its feature trade-offs stated.

### 20.8 Secrets management

No secrets in the repository, enforced by a pre-commit scanner and CI secret scanning · environment-scoped secrets in Vercel and Fly · separate credentials per environment · a documented quarterly rotation schedule · least-privilege storage credentials (workers can write derivatives but cannot delete originals) · and no production credentials on developer machines — preview environments use branched databases with synthetic data.

### 20.9 Account deletion and data export

- **Export:** a full archive on demand — every original file plus a JSON manifest of all metadata, memories, capsules, and people, assembled as a background job and delivered as a signed download link valid 7 days. No paywall, no watermark, no degradation. **This is a trust feature, not a compliance chore.**
- **Deletion:** a two-step confirmation with step-up authentication → immediate loss of access → a 30-day grace period with recovery → then irreversible purge of database rows, all storage variants, backups on their next cycle, and search indexes, with a completion record retained. Pending capsules are surfaced explicitly during the flow, because deleting an account cancels promises the user made to other people — that consequence must never be a surprise.

### 20.10 Backups and disaster recovery

Postgres PITR with a 30-day window plus daily encrypted logical dumps to a separate provider · R2 primary with nightly cross-provider sync to B2 · **quarterly restore drills with documented RTO/RPO** · a defined incident runbook · and a documented worst case: the loss of a sealed capsule is treated as a **Sev-0** incident, on the same footing as a data breach, because it is the same failure of the same promise.

### 20.11 Audit logging

Every content access (by user, recipient, or admin), every permission change, every share creation and revocation, every capsule state transition, every delivery attempt, every admin action, and every auth event — append-only, 24-month retention, with the user's own access log **visible to the user** in privacy settings. Alerting on anomalies: bulk downloads, unusual share-link creation, repeated failed authorisation, and any admin content access.

### 20.12 Compliance posture

GDPR (lawful basis, DPA, data-subject rights, EU data-residency option) · CCPA/CPRA · COPPA considerations, since content is largely *about* children even though account holders are adults · biometric statutes as the gating factor for face grouping (§11.6) · **DMCA and CSAM reporting paths staffed from day one**, because a service hosting user media has non-negotiable legal duties · SOC 2 as a later goal, with logging and access controls built to suit it from the start rather than retrofitted.

---
## 21. DEVELOPMENT ROADMAP

Assumes a small team (2–3 engineers, 1 designer, part-time PM). Durations are engineering estimates for that shape of team, not commitments.

### PHASE 1 — Project foundation · ~1.5 weeks
**Priority: P0 (blocking everything)**

- **Features:** none user-facing.
- **Engineering tasks:** monorepo scaffold (Turborepo, `apps/web`, `apps/workers`, `packages/*`) · Next.js 16 App Router with TypeScript strict — **read `node_modules/next/dist/docs/` first, this release has breaking changes** · Tailwind v4 with the design-token set carried over from the existing repo's CSS variables · Radix primitives and the base UI kit (Button, Field, Sheet, Dialog, Toast) · Postgres provisioned (Neon) with Drizzle configured and the first migration · ESLint/Prettier/Husky/commitlint · CI (typecheck, lint, unit, build) · Vercel and Fly projects with preview deploys · Sentry wired in both apps · a per-PR database branch.
- **Dependencies:** none.
- **Deliverables:** a deployed empty shell on a real URL; green CI; a working migration pipeline; a documented ADR format in `docs/DECISIONS/`.

### PHASE 2 — Authentication & onboarding · ~2 weeks
**Priority: P0**

- **Features:** M1 (auth), M2 (vault), M16 partially (profile).
- **Engineering tasks:** Better Auth with email OTP · passkey registration and login (WebAuthn) · Google and Apple OAuth · session management with a device list and revoke · `User`, `Vault`, `VaultMember`, `Session` schema · auto-create a personal vault on signup · **`lib/authz/` built now, with the §11.2 matrix encoded and one test per cell** · route guards and middleware · the three-step onboarding flow · profile settings · transactional email templates (verify, new-device, welcome) · rate limits on all auth endpoints.
- **Dependencies:** Phase 1.
- **Deliverables:** a user can sign up, complete onboarding, and land in an empty app. **Authorization is centralised and tested before any content exists** — retrofitting it later is how privacy incidents happen.

### PHASE 3 — Core product: memory + timeline · ~4 weeks
**Priority: P0 (the largest and most important phase)**

- **Features:** M3 (create memory), M6 (timeline), M7 (detail view), M12 (On This Day), plus the app shell and navigation.
- **Engineering tasks:** `Memory`, `MediaAsset`, `Album` (lite) schema with FTS columns and indexes · the app shell (bottom nav on mobile, sidebar on desktop, safe areas) · the create form with the **"when did this happen?"** date field and `occurred_precision` · the virtualised timeline with a month/year scrubber, the Now divider, and the **future band placeholder** · the gallery grid with blurhash placeholders and no layout shift · the memory detail viewer (swipe, pinch-zoom, video and audio players) · edit and delete with soft-delete plus Trash · favourites · basic text search over title and note (Postgres FTS) · occasion tags · On This Day computation and the home card · empty, loading, and error states for every screen · View Transitions between timeline and detail · accessibility pass (keyboard, screen reader, contrast, target sizes).
- **Dependencies:** Phase 2. Media upload lands in Phase 4, so this phase works against seeded assets.
- **Deliverables:** a user can create, view, browse, search, edit, and delete memories; the timeline is the app's identity and it *feels* like an app.

### PHASE 4 — Media pipeline · ~4 weeks
**Priority: P0**

- **Features:** M4 (in-app capture), M5 (resumable offline upload).
- **Engineering tasks:** R2 buckets, key layout, lifecycle rules · `UploadSession` schema and endpoints · presigned multipart upload with 3-way parallel parts and resume-from-part · client-side blurhash and local thumbnail generation before upload · **IndexedDB (Dexie) outbox with per-item state, backoff, and idempotency keys** · in-app capture with `getUserMedia`/`MediaRecorder` for photo, video, and voice, plus the `<input capture>` fallback · permission pre-explanation UX · the upload-queue UI ("2 of 5 uploaded") · worker service on Fly: FFmpeg video transcode to an HLS ladder, poster frames, sharp thumbnail variants, audio normalisation and waveform, EXIF extraction with GPS stripping, checksum verification · signed-URL minting endpoint with authorisation and rate limits · progressive image and HLS video components · `Save-Data` and connection-aware behaviour · optional client-side downscale · magic-byte validation and SVG rejection · isolated transcode containers.
- **Dependencies:** Phase 3 (needs `Memory` to attach to).
- **Deliverables:** upload real photos and 4K video from a phone on a poor connection; kill the app mid-upload and it resumes; nothing is ever lost. **Test explicitly on airplane mode and on throttled 3G.**

### PHASE 5 — Capsules, delivery & sharing · ~5 weeks
**Priority: P0 (this is the differentiator; do not compress this phase)**

- **Features:** M8 (seal + schedule), M9 (delivery engine), M10 (recipient unlock), M11 (share links), plus `Person` (lite).
- **Engineering tasks:** `Capsule`, `CapsuleRecipient`, `DeliveryAttempt`, `CapsuleReply`, `Person` (lite), `Share`, `ScheduledJob` schema · the seal flow with the recipient picker, the unlock-date selector, the channel preview, and the plain-language summary block · sealing writes the capsule state and the scheduled job **in one transaction** · immutability enforcement on sealed capsules · the countdown component and the future band populated on the timeline · the capsule detail (sender) view with full status history · **the delivery worker**: claim with `FOR UPDATE SKIP LOCKED`, per-recipient fan-out, the push→email channel ladder, exponential backoff over days, full attempt logging · **the delivery watchdog and its alert** · timezone-aware humane delivery windows · **`/c/[token]`: server-rendered, functional with JavaScript disabled**, sealed and unlocked states, the slow ceremonial reveal, reply capture, save-a-copy · the 20-year-durable delivery email (tables, inline CSS, plain-text alternative) · Resend primary with SES fallback · share links with hashed tokens, expiry, optional password, download flag, view counting, and one-tap revocation · the "who can see this" panel and the active-links list · `noindex` on all token routes.
- **Dependencies:** Phases 3 and 4.
- **Deliverables:** seal a capsule for 60 seconds from now and watch it arrive, open, and reply. Seal one for 20 years and verify the job row, the integrity sweep, and the watchdog. **`docs/DELIVERY-GUARANTEE.md` written and reviewed.**

### PHASE 6 — PWA functionality · ~2.5 weeks
**Priority: P0**

- **Features:** M14 (installable, offline shell).
- **Engineering tasks:** manifest with icons, maskable variants, shortcuts, and `share_target` · Serwist service worker: precached shell, runtime caching strategy per route class, thumbnail LRU with a storage cap · the offline read path — timeline, memory metadata, and cached thumbnails from IndexedDB · offline create and edit through the outbox · Background Sync registration and drain, plus `periodicSync` where available · `StorageManager.persist()` with a clear warning when denied · **capsule sealing correctly blocked offline with an honest explanation** · the offline indicator and pending-state badges · the install prompt shown only after the first successful save, with iOS-specific instructions · Web Share and Web Share Target handlers · the Badging API · Screen Wake Lock during uploads and playback · service-worker update flow with a "new version available" prompt (never a silent reload mid-upload) · Playwright E2E covering offline create, resume-after-reconnect, and install.
- **Dependencies:** Phases 3–5.
- **Deliverables:** an installed app that opens instantly with no network, captures and queues memories offline, and syncs cleanly on reconnect. Lighthouse PWA and performance checks pass on a mid-range Android.

### PHASE 7 — Notifications · ~1.5 weeks
**Priority: P0**

- **Features:** M13 (push + email).
- **Engineering tasks:** VAPID keys and `Device` schema · subscription lifecycle, including cleanup of dead endpoints · service-worker push handler with actions and deep links · contextual permission request at first seal · the `Notification` entity and the `/app/notifications` centre · the trigger matrix from §14 implemented as job kinds · per-type and per-channel preferences with quiet hours · email templates for every triggered type · `List-Unsubscribe` handling · non-suppressible security and billing notifications · the weekly On This Day push with the once-per-week cap · a notification-volume metric with an alert if the mean exceeds two per user per week.
- **Dependencies:** Phases 5 and 6.
- **Deliverables:** every §14 MVP trigger fires correctly, exactly once, with email as a guaranteed fallback.

### PHASE 8 — Monetisation & admin · ~2.5 weeks
**Priority: P0 for billing, P1 for the fuller admin**

- **Features:** M17 (quota + Stripe), M15 (privacy controls), M16 (export/delete), plus the MVP operator console.
- **Engineering tasks:** `Subscription` schema · Stripe products, prices, Checkout, and the Billing Portal · webhook handling with signature verification and event deduplication · storage accounting (`storage_used_bytes` maintained transactionally) and quota enforcement at upload-session creation · the upgrade flow and paywall states · the plan settings screen · **the data export job** (originals plus a JSON manifest, signed download) · **account deletion** with step-up auth, a pending-capsule warning, a 30-day grace period, and a purge job · the privacy settings screen with the access log · `AuditLog` writes across all sensitive paths · the operator console: delivery health, job queue, user lookup with break-glass, system health, abuse reports · admin auth realm with mandatory hardware MFA and full auditing.
- **Dependencies:** Phase 5 (capsules must exist before deletion can warn about them).
- **Deliverables:** a user can pay, hit a quota, export everything, and delete everything. Operators can see whether deliveries are working.

### PHASE 9 — Testing, security & hardening · ~3 weeks
**Priority: P0 (do not skip; this product's failure modes are privacy incidents)**

- **Engineering tasks:** unit coverage on `authz`, the delivery engine, and the sync engine · **one test per cell of the permission matrix** · Postgres RLS policies enabled and tested · Playwright E2E for the full critical path (signup → capture → seal → deliver → open → reply), plus offline and install flows · load testing on upload and signed-URL minting · an **external penetration test focused on IDOR and token handling** · a dependency and secret-scanning pass · CSP and security headers verified · WCAG 2.2 AA audit with a screen reader on real devices · device-lab testing (iOS Safari, Android Chrome, mid-range Android, a slow tablet, desktop) · **the first restore drill executed and documented** · runbooks for delivery failure, storage outage, and data-breach response · the delivery-SLA monitor and alerting live · error budgets and dashboards.
- **Dependencies:** Phases 1–8.
- **Deliverables:** a signed-off security review, an accessibility audit, a verified restore, and staffed alerting.

### PHASE 10 — Production launch · ~2 weeks
**Priority: P0**

- **Engineering tasks:** the marketing site built on the new design system, reusing the existing repo's strongest copy — with **every claim corrected to match what is actually built** (no "unlimited", no unbuilt heir feature, honest encryption wording) · one coherent pricing page replacing the two contradictory versions · a real waitlist and contact backend (replacing `preventDefault()`) · legal pages: terms, privacy policy, DPA, and cookie notice · SEO, sitemap, OpenGraph, and structured data · status page · support inbox and help centre · PostHog funnels for activation and retention · a staged rollout (internal → 50 friends and family → waitlist → open) · **`docs/DELIVERY-GUARANTEE.md` published publicly as a trust artifact** · on-call rota.
- **Dependencies:** Phase 9.
- **Deliverables:** public launch with honest marketing, staffed monitoring, and measured activation.

### Timeline summary

| Phase | Weeks | Cumulative |
|---|---|---|
| 1 Foundation | 1.5 | 1.5 |
| 2 Auth & onboarding | 2 | 3.5 |
| 3 Core product | 4 | 7.5 |
| 4 Media pipeline | 4 | 11.5 |
| 5 Capsules & delivery | 5 | 16.5 |
| 6 PWA | 2.5 | 19 |
| 7 Notifications | 1.5 | 20.5 |
| 8 Billing & admin | 2.5 | 23 |
| 9 Hardening | 3 | 26 |
| 10 Launch | 2 | **28 weeks (~6.5 months)** |

Phases 3 and 4 can partially overlap once the `MediaAsset` contract is fixed, and Phase 6 can start during Phase 5. Realistic compressed target: **~22–24 weeks.**

**Post-launch:** V1 features (§7.2) in roughly this order — shared vaults → suggested capsules (A10) → semantic search and transcripts → collaborative capsules → multi-channel delivery → recaps.

---

## 22. DEVELOPMENT BACKLOG

Full MVP backlog: EPIC → FEATURE → USER STORY → TASKS. Ten epics covering every MVP feature (M1–M17).

---

### EPIC 1: Authentication & Account

**FEATURE 1.1 — Email OTP signup**
> **USER STORY:** As a new user, I want to create an account with just my email so I can start preserving memories without inventing another password.

**TASKS:**
- Build the `/signup` screen (email field, trust statement, link to login)
- Client + server Zod validation for the email
- `users` and `sessions` tables via Drizzle migration
- Generate, hash, and store a 6-digit OTP with a 10-minute expiry
- Send the OTP email (React Email template)
- Code-entry screen with auto-advance, paste support, and a resend timer
- Verify the code; enforce 5 attempts then invalidate
- Create the session cookie (HTTP-only, Secure, SameSite=Lax)
- **Auto-create the user's personal vault in the same transaction**
- Rate-limit per email (3 per 15 min) and per IP
- Non-enumerating error copy
- Unit tests: expiry, reuse, attempt cap, rate limits
- E2E: signup happy path plus expired-code path

**FEATURE 1.2 — Passkey registration and login**
> **USER STORY:** As a returning user, I want to sign in with my face or fingerprint so access is instant and there is nothing to lose.

**TASKS:**
- Add WebAuthn registration (`navigator.credentials.create`) after first signup
- `credentials` table (credential id, public key, counter, transports, device label)
- Verification endpoint for attestation
- Login with `navigator.credentials.get` and challenge verification
- Capability detection with graceful fallback to OTP
- Manage multiple passkeys; label and remove them
- Copy explaining what a passkey is, for non-technical users
- Tests: registration, login, replay rejection, unsupported-browser fallback

**FEATURE 1.3 — OAuth (Google, Apple)**
> **USER STORY:** As a user, I want to continue with Google or Apple so I can skip email entirely.

**TASKS:**
- Configure both providers; add callback routes
- Link an OAuth identity to an existing email account safely (no account takeover)
- `accounts` table for provider identities
- Handle Apple's private-relay email addresses
- Provider buttons on signup and login
- Tests: new account, link-to-existing, email-collision handling

**FEATURE 1.4 — Session and device management**
> **USER STORY:** As a security-conscious user, I want to see and revoke every device signed into my vault.

**TASKS:**
- Record device metadata per session (UA, platform, first seen, last seen, approximate location from IP)
- `/app/settings/security` device list UI
- Revoke a single session; "sign out everywhere"
- New-device sign-in email notification (non-suppressible)
- 30-day rolling session with sliding refresh
- Step-up re-auth guard for sensitive actions
- Tests: revocation takes effect immediately; step-up enforced

**FEATURE 1.5 — Onboarding**
> **USER STORY:** As a new user, I want a short guided start so my first memory is meaningful rather than a blank upload screen.

**TASKS:**
- Three-step route group with progress indicator and skip
- Step 1: purpose chips; persist the answer for later personalisation
- Step 2: add up to 3 people (name + birthday), writing `Person` rows
- Step 3: capture-or-upload chooser leading into the create flow
- Explain camera permission *before* triggering the browser prompt
- Resume onboarding if abandoned mid-flow
- Track funnel events (step viewed, step completed, skipped)
- Tests: skip path, resume path, permission-denied path

---

### EPIC 2: Vault & Memory

**FEATURE 2.1 — Create a memory**
> **USER STORY:** As a user, I want to save a moment with its media, its date, and what it meant, so the meaning is preserved and not just the file.

**TASKS:**
- `memories` table with `occurred_at`, `occurred_precision`, `client_id`, `visibility`, `sync_state`
- Create sheet at `/app/new` as an intercepted modal route
- Media tray with reorder, remove, and per-item progress
- Title field with optional AI-free auto-title from the date
- **"When did this happen?" date picker with precision selector (exact / day / month / year)**
- Pre-fill the date from EXIF `DateTimeOriginal` when available
- "What did this mean?" note field with voice dictation where supported
- Occasion chips from the curated enum
- Privacy selector with private as the default
- Server action with Zod validation and idempotency on `client_id`
- Optimistic local insert into Dexie before the network call
- Tests: idempotent double-submit, EXIF date precedence, offline create

**FEATURE 2.2 — View a memory**
> **USER STORY:** As a user, I want to open a memory and experience it fully.

**TASKS:**
- `/app/memory/[id]` route with an authorisation check via `lib/authz`
- Full-bleed viewer: swipe between assets, pinch-zoom images
- HLS video player with a poster frame and captions track slot
- Audio player with waveform and scrubbing
- Note, date (formatted by precision), people, and occasion display
- Overflow menu: edit, favourite, add to album, download, seal, delete
- Native Web Share integration
- Progressive load: blurhash → thumb → preview → original
- Deleted-memory state (a gentle explanatory page, not a 404)
- Tests: authorisation denial, missing asset, precision formatting

**FEATURE 2.3 — Edit and delete**
> **USER STORY:** As a user, I want to fix a wrong date or title, and delete things I do not want, without fear of a permanent mistake.

**TASKS:**
- Edit sheet reusing the create form
- Patch server action with field-level validation
- Offline edit queued as a patch with last-write-wins and a conflict prompt
- Soft delete (`deleted_at`) with a Trash view
- Restore from Trash
- 30-day purge job removing rows and all storage variants
- Warn on deleting a memory referenced by a sealed capsule (**block it**)
- Tests: soft delete hides from all lists; purge removes every variant; capsule reference blocks deletion

**FEATURE 2.4 — Timeline**
> **USER STORY:** As a user, I want to scroll through my life in order — including what is still coming.

**TASKS:**
- Cursor-paginated timeline query grouped by month, indexed on `(vault_id, occurred_at)`
- Virtualised list with stable item heights and no layout shift
- Sticky month/year headers and a scrubber with jump-to-year
- Density toggle (year / month / day)
- **The "Now" divider and the future band rendering sealed capsules with countdowns**
- Deep link support via `?at=YYYY-MM`
- Filter sheet: media type, favourites, occasion, has-voice-note, in-a-capsule
- Prefetch adjacent ranges; serve cached ranges offline and mark uncached ones
- Empty state that visually shows the future band waiting
- Tests: pagination correctness, deep-link restore, offline range marking

**FEATURE 2.5 — Gallery**
> **USER STORY:** As a user, I want a dense visual grid when I just want to look.

**TASKS:**
- Virtualised responsive grid with sticky date headers
- Blurhash placeholders at correct aspect ratios
- Multi-select mode with a batch action bar (favourite, album, share, delete)
- Filter chips shared with the timeline
- Tests: selection state across scroll, batch action correctness

**FEATURE 2.6 — Favourites, occasions and text search**
> **USER STORY:** As a user, I want to find things by typing a word or narrowing to what I marked as special.

**TASKS:**
- `is_favourite` with an optimistic one-tap toggle
- Occasion enum, chips, and filters
- Generated `tsvector` column over title, note, occasion, and person names
- GIN index plus `pg_trgm` for typo tolerance
- `/app/search` screen with recent queries and suggestion chips
- Grouped results (memories, albums, capsules)
- Offline local search over cached Dexie metadata, clearly labelled
- Tests: ranking sanity, typo tolerance, offline labelling

**FEATURE 2.7 — On This Day**
> **USER STORY:** As a user, I want to be shown a memory from a past year without asking, so I rediscover things I had forgotten.

**TASKS:**
- Query matching month and day across prior years, respecting `occurred_precision`
- Home card with a year badge ("3 years ago today")
- Suppress the card when there is nothing genuinely from a past year
- Weekly job selecting the best day and enqueuing a push
- Once-per-week cap per user, delivered at 09:00 local
- Tests: precision handling (a year-only memory must not match a specific day), cap enforcement

---

### EPIC 3: Media Pipeline

**FEATURE 3.1 — In-app capture**
> **USER STORY:** As a user, I want to record a video or voice message inside the app so I can capture the moment without leaving.

**TASKS:**
- Capture component with Photo / Video / Voice modes
- `getUserMedia` with constraint negotiation and camera switching
- `MediaRecorder` with codec detection (VP9/H.264, Opus/AAC) and a chosen fallback chain
- Live preview, record button, elapsed timer, and a soft length cap by tier
- Voice mode with a live waveform
- Permission pre-explanation screen, then the prompt
- `<input type="file" capture>` fallback for unsupported browsers
- Immediate write of the recorded blob to Dexie before anything else
- Screen Wake Lock while recording
- Tests: codec fallback, permission denial recovery, blob durability after a forced reload

**FEATURE 3.2 — Resumable upload**
> **USER STORY:** As a user on a bad connection, I want my upload to survive interruption so a memory is never lost.

**TASKS:**
- `upload_sessions` table and create/complete endpoints
- Presigned R2 multipart URL minting with a part manifest
- Client chunker (5–10MB parts) with 3-way parallelism and ETag tracking
- Resume from the last confirmed part after interruption
- Dexie outbox with per-item state, attempt count, and backoff
- Idempotency keys on every mutation
- Client-side blurhash and 320px thumbnail generation pre-upload
- Optional client downscale for very large images, off by default on Wi-Fi
- Upload-queue UI with per-item progress, pause, resume, cancel, and retry
- Background Sync registration; drain from the service worker
- `StorageManager.persist()` request plus a denial warning
- Quota check before session creation, with a clear paywall state
- Magic-byte validation; reject SVG; enforce per-tier size caps
- Tests: kill mid-upload and resume; airplane-mode create then reconnect; duplicate-submit safety; quota rejection

**FEATURE 3.3 — Derivative processing**
> **USER STORY:** As a user, I want my media to look right and load fast everywhere, without doing anything.

**TASKS:**
- Worker service scaffold on Fly with a job claim loop
- Thumbnail and preview generation with sharp (320/640/1280/2048, AVIF + WebP + JPEG)
- Video transcode to an HLS ladder with FFmpeg; poster frame extraction
- Audio normalisation to AAC plus waveform JSON
- EXIF extraction with **GPS stripped unless opted in**
- Blurhash computation server-side as the authoritative value
- `checksum_sha256` verification against the client-declared value
- `transcode_status` state machine with failure reporting to the UI
- Isolated container with no DB credentials and no egress beyond storage
- Concurrency limits and a backlog metric
- Tests: corrupt-file handling, oversized-file handling, HDR/rotation correctness, failure surfacing

**FEATURE 3.4 — Secure media delivery**
> **USER STORY:** As a user, I want to be certain nobody can reach my photos by guessing a URL.

**TASKS:**
- Signed-URL minting endpoint gated by `lib/authz`
- 5-minute TTL for viewing, 60 minutes for downloads
- Per-user rate limits on minting
- `Img` component with `srcset`, `sizes`, blurhash placeholder, and lazy loading
- `Video` component with HLS, adaptive start quality, and `Save-Data` awareness
- Verify no bucket object is publicly readable (an automated test asserting a 403 on a direct URL)
- Tests: expired URL rejected; cross-user access denied; rate limit enforced

---

### EPIC 4: Time Capsules

**FEATURE 4.1 — Seal a capsule**
> **USER STORY:** As a parent, I want to address a memory to my daughter and set it to unlock on her 18th birthday, so I can speak to her in the future.

**TASKS:**
- `capsules` and `capsule_recipients` tables with the `(state, unlock_at)` index
- Seal flow screen with memory preview
- Recipient picker: saved people, or new email/phone entry, multiple recipients
- Contact validation and verification before sealing is permitted
- Unlock-condition selector (exact date and time, with timezone)
- Channel preview showing the ordered channels that will be tried
- **Plain-language summary block** stating who, what, when, and how
- Edit and revocation policy shown before confirmation
- **Transactional seal:** set `state='sealed'` and insert the `ScheduledJob` atomically
- Immutability enforcement: reject media and note changes on a sealed capsule
- Generate a per-recipient token; store only its hash; record `token_version`
- Free-tier enforcement at seal time: **3 pending capsules** (delivered ones excluded from the count) and a **12-month horizon**, each with its own contextual paywall copy
- **Hard block when no valid recipient contact method exists**
- Tests: atomicity under failure injection, immutability enforcement, date-in-past rejection, tier limit, offline block

**FEATURE 4.2 — Capsule detail and countdown**
> **USER STORY:** As a sender, I want to see that my capsule is safe and on track, years before it is due.

**TASKS:**
- `/app/capsule/[id]` with a live countdown
- Recipient list with contact-freshness indicators
- Delivery plan display and full status history from `DeliveryAttempt`
- Add-to-capsule while still editable; cancel at any time before delivery
- Countdown cards on Home and in the timeline future band
- "Refresh contact details" prompt when a contact is stale
- Tests: state transitions rendered correctly; cancel path; stale-contact prompt logic

**FEATURE 4.3 — Delivery engine**
> **USER STORY:** As a sender, I want absolute confidence that my capsule will arrive on the day, even in 20 years.

**TASKS:**
- `scheduled_jobs` and `delivery_attempts` tables
- Tick worker with `FOR UPDATE SKIP LOCKED` claiming and lock expiry
- Per-recipient, per-channel fan-out with idempotency on `(capsule, recipient, channel, attempt_no)`
- Channel ladder: push → email, escalating until acknowledged
- Exponential backoff over days; a defined maximum attempt window
- Timezone-aware humane delivery windows (09:00–20:00 local)
- Mark `delivered_at`; notify the sender of delivery
- **Watchdog job: alert if any capsule passes `unlock_at` with no successful attempt**
- Monthly integrity sweep: every sealed capsule has a valid future job, its media exists and checksums, contacts are fresh
- 7-day-before reminder to the sender
- Bounce and complaint handling from the email provider webhook
- SES configured as a standing fallback sender
- Tests: clock-skew handling, duplicate-prevention under concurrent workers, all-channels-fail path, watchdog firing

**FEATURE 4.4 — Recipient unlock experience**
> **USER STORY:** As a recipient, I want to open what was left for me in a way that does the moment justice — without creating an account.

**TASKS:**
- **`/c/[token]` server-rendered and fully functional with JavaScript disabled**
- Token lookup by hash, with constant-time comparison
- Pre-unlock state: sender name and unlock date only; **never the media**
- Post-unlock state: slow ceremonial reveal (~1.2s), respecting `prefers-reduced-motion`
- Full-screen media with no competing chrome or branding
- Sender's note displayed prominently
- Reply capture (text, optional media) with no account required
- "Save a copy" download
- Soft, non-blocking invitation to create an account
- Record `opened_at`; notify the sender immediately
- States: not-yet-due (countdown), expired, revoked, invalid — each with humane copy
- `noindex, noarchive` headers
- Progressive enhancement verified back to a very old browser baseline
- Tests: JS-disabled rendering, pre-unlock media inaccessibility (including the API), token-not-found, reply delivery

**FEATURE 4.5 — Capsule delivery email**
> **USER STORY:** As a recipient in 2046, I want the email to work in whatever client I am using.

**TASKS:**
- Table-based, inline-CSS template with no JavaScript and no web fonts
- Plain-text alternative
- Subject line naming the sender and occasion, not the brand
- Single link, single sentence, no marketing
- Tested in a broad client matrix (Litmus-class)
- `List-Unsubscribe` where applicable (not on delivery emails, which are transactional)
- Tests: rendering snapshots, link validity, plain-text fallback

---

### EPIC 5: Sharing & Privacy

**FEATURE 5.1 — Private share links**
> **USER STORY:** As a user, I want to send a memory to my mother without making her sign up.

**TASKS:**
- `shares` table with hashed token, permission, expiry, password, download flag, view count
- Share sheet: permission, expiry, download toggle, optional password
- 32-byte CSPRNG token generation; store the hash only
- `/s/[token]` public view with authorisation from the token
- Optional password gate
- View counting and last-viewed tracking
- First-view notification to the owner
- `noindex, nofollow, noarchive` plus `robots.txt` exclusion
- Native Web Share for distributing the link
- Tests: expired token, revoked token, wrong password, download flag enforcement

**FEATURE 5.2 — Privacy controls and access log**
> **USER STORY:** As a user, I want to see exactly who can reach my content and cut off access instantly.

**TASKS:**
- "Who can see this" panel on every memory
- `/app/settings/privacy`: default visibility, active links list, access log, AI opt-out (V1 placeholder)
- One-tap revoke per link, with immediate effect
- `AuditLog` writes on every content access, share creation, and revocation
- User-visible access log (who, when, from where at country granularity)
- Verify residual exposure after revocation is bounded by the signed-URL TTL
- Tests: revoke → next request fails; audit entries written on every access path

**FEATURE 5.3 — Permission enforcement**
> **USER STORY:** As a user, I need certainty that no other user can ever reach my vault.

**TASKS:**
- `lib/authz/` as the single authorisation module
- Encode the §11.2 matrix as an executable table
- **One automated test per matrix cell**
- All queries scoped by `vault_id` derived from the session, never from client input
- Postgres RLS policies as a defence-in-depth layer, with tests
- UUID primary keys throughout; ownership checks even on unguessable ids
- Negative-path E2E: user A attempts to read every one of user B's resource types
- Tests: cross-tenant denial on every route, RLS blocking a deliberately buggy query

---

### EPIC 6: PWA & Offline

**FEATURE 6.1 — Installable app**
> **USER STORY:** As a mobile user, I want M&M on my home screen so it feels like an app.

**TASKS:**
- `manifest.webmanifest`: standalone, id, `start_url: /app`, theme and background colours
- Icon set: 192, 512, maskable, apple-touch, plus iOS splash images
- App shortcuts for Add a moment and Timeline
- `beforeinstallprompt` captured; a custom install card shown only after the first successful save
- iOS-specific Add to Home Screen walkthrough
- Dismissal persistence; a maximum of two asks
- Post-install confirmation and contextual notification prompt at first seal
- Track install rate as a funnel metric
- Tests: prompt suppression rules, iOS instruction path

**FEATURE 6.2 — Offline shell and reads**
> **USER STORY:** As a user with no signal, I want the app to open and show my recent memories.

**TASKS:**
- Serwist configuration with an app-shell precache manifest
- Route-class caching strategies (shell SWR, API network-first, thumbnails cache-first)
- Thumbnail LRU with a ~200MB cap honouring `storage.estimate()`
- Dexie schema for cached memories, capsules, and people
- Sync of the last ~90 days plus all favourites and all capsules
- Offline indicator and "not downloaded" states for uncached media
- `offline.html` fallback for uncached navigations
- Service-worker update flow with an explicit prompt (**never a silent reload during an upload**)
- Tests: cold offline launch, cache eviction behaviour, update prompt timing

**FEATURE 6.3 — Offline writes and sync**
> **USER STORY:** As a user, I want to capture and save a memory with no connection and have it upload itself later.

**TASKS:**
- Outbox pattern for create, patch, and delete operations
- Optimistic UI with pending badges on affected items
- Background Sync drain; `periodicSync` where available
- Conflict resolution: last-write-wins with a user prompt on divergence
- Explicit block on sealing a capsule offline, with honest copy and a saved draft
- Queue visibility and manual retry
- Reconciliation of server ids back onto local records
- Tests: airplane-mode create then reconnect; conflicting edit on two devices; queue survives a browser restart

**FEATURE 6.4 — Native integrations**
> **USER STORY:** As a mobile user, I want to send photos into M&M straight from my phone's share sheet.

**TASKS:**
- `share_target` manifest entry and its handler route
- Ingest shared files directly into the create flow
- Web Share for outbound sharing including files
- Badging API for unread arrivals
- File System Access API for desktop bulk import and export saving
- `navigator.contacts` for recipient entry where available
- Tests: share-target ingest, graceful degradation on unsupported browsers

---

### EPIC 7: Notifications

**FEATURE 7.1 — Push infrastructure**
> **USER STORY:** As a user, I want to know the instant my capsule is opened.

**TASKS:**
- VAPID key generation and secure storage
- `devices` table; subscribe, refresh, and unsubscribe endpoints
- Service-worker push handler with actions and deep links
- Dead-endpoint cleanup on repeated failure
- Contextual permission request at first seal
- Notification click handling and focus-or-open logic
- Tests: subscription lifecycle, payload deep-link correctness, dead-endpoint pruning

**FEATURE 7.2 — Notification centre and preferences**
> **USER STORY:** As a user, I want a record of everything the app told me, and control over what it tells me.

**TASKS:**
- `notifications` table; write on every triggered event
- `/app/notifications` grouped list with read/unread and deep links
- Per-type and per-channel preferences; quiet hours with timezone awareness
- Global digest mode
- Non-suppressible security and billing types, clearly labelled as such
- Unread badge in nav and on the installed icon
- Tests: preference suppression, quiet-hours deferral, non-suppressible types cannot be disabled

**FEATURE 7.3 — Email notifications**
> **USER STORY:** As a user, I want critical notifications to reach me even if push is broken.

**TASKS:**
- React Email templates for every MVP trigger
- Resend integration with SES fallback on failure
- `List-Unsubscribe` headers on non-transactional mail
- Bounce and complaint webhook handling; mark addresses undeliverable
- Notification-volume metric with an alert above two per user per week
- Tests: fallback provider path, unsubscribe handling, volume metric accuracy

---

### EPIC 8: Billing & Quotas

**FEATURE 8.1 — Subscription checkout**
> **USER STORY:** As a user near my storage limit, I want to upgrade in a few taps.

**TASKS:**
- `subscriptions` table; Stripe products and prices configured
- Stripe Checkout session creation
- Webhook handler with signature verification and event-id deduplication
- Handle `created`, `updated`, `deleted`, `payment_failed`, `payment_succeeded`
- Billing Portal link for card and plan management
- `/app/settings/plan`: current tier, usage, upgrade, invoices
- Paywall states at the point of limitation, not as an interstitial
- Dunning emails on payment failure (immediately, day 3, day 7)
- Tests: webhook idempotency, downgrade behaviour, quota applied on plan change

**FEATURE 8.2 — Storage quota**
> **USER STORY:** As a free user, I want to know clearly where I stand on storage.

**TASKS:**
- Maintain `storage_used_bytes` transactionally on asset create and purge — **storage is the only volume limit; there is no monthly memory counter to build** (§17.2)
- Enforce the quota at upload-session creation, before any bytes move
- Usage meter in settings and a warning at 90%
- Email at 90% and at 100%
- Free-tier capsule gates enforced at seal time: 3 **pending** capsules (delivered excluded) and a 12-month scheduling horizon
- Per-tier video length caps enforced client- and server-side
- Reconciliation job comparing counted usage against actual storage
- Tests: quota boundary conditions, reconciliation drift detection

---

### EPIC 9: Account Data Rights

**FEATURE 9.1 — Data export**
> **USER STORY:** As a user, I want to download everything I have ever put in, so I know I am never locked in.

**TASKS:**
- Export job assembling all originals plus a JSON manifest of every entity
- Streaming ZIP construction to avoid memory blowups on large vaults
- Signed download link valid 7 days; email on completion
- Progress indication and a re-request cooldown
- Include capsules, replies, people, albums, and audit history
- Step-up authentication required to request
- Tests: manifest completeness against a seeded account, large-vault memory profile

**FEATURE 9.2 — Account deletion**
> **USER STORY:** As a user, I want to delete my account completely and be told what that will break.

**TASKS:**
- Two-step confirmation with step-up authentication
- **Explicitly list pending capsules that will be cancelled, with recipient names**
- Immediate access revocation; set `hard_delete_after = now() + 30 days`
- Recovery path during the grace period
- Purge job: rows, all storage variants, search indexes, push subscriptions, then backups on their next cycle
- Cancel the Stripe subscription
- Retain a minimal deletion record for compliance
- Confirmation email at initiation and at completion
- Tests: grace-period recovery, purge completeness, capsule cancellation notifications

---

### EPIC 10: Operations & Admin

**FEATURE 10.1 — Delivery health console**
> **USER STORY:** As an operator, I need to know at a glance whether every promised delivery is on track.

**TASKS:**
- Admin auth realm with mandatory hardware MFA, separate from user auth
- Role separation (support / operator / engineer / owner)
- Delivery health screen: due today and this week, failures needing action, per-channel success rate, retry backlog, oldest pending capsule
- Job queue screen: state and kind breakdown, stuck jobs, manual re-run
- **Alerting: any capsule past `unlock_at` without a successful attempt pages a human**
- System health: upload success rate, transcode backlog, storage totals and cost, error rate, p95 latency
- All admin actions written to `AuditLog`
- Tests: alert fires on an injected missed delivery; role restrictions enforced

**FEATURE 10.2 — Support tooling**
> **USER STORY:** As support, I need to help a user without being able to browse their private memories.

**TASKS:**
- User lookup by email showing plan, usage, counts, and recent errors — **no content**
- Break-glass content access: requires a reason string, a second approver, an audit entry, and **a notification to the user**
- Abuse report queue with a documented escalation procedure (CSAM, DMCA, harassment)
- Tests: content access impossible without break-glass; user notified on every break-glass event

**FEATURE 10.3 — Analytics instrumentation**
> **USER STORY:** As the team, we need to know whether people activate and stay.

**TASKS:**
- PostHog (first-party, self-hostable) integration with no third-party trackers in the app
- Activation funnel: signup → onboarding complete → first memory → **first capsule sealed**
- Retention cohorts; capsule creation rate; delivery success rate; **open rate on delivered capsules**
- Install rate; offline usage share; upload failure rate
- Storage cost per paying user and AI cost per active user
- Explicit event taxonomy documented in `docs/`
- Tests: no PII in event payloads; no media content ever sent

---

### Backlog summary

| Epic | Features | Stories | Est. tasks |
|---|---|---|---|
| 1 Authentication & Account | 5 | 5 | 58 |
| 2 Vault & Memory | 7 | 7 | 73 |
| 3 Media Pipeline | 4 | 4 | 55 |
| 4 Time Capsules | 5 | 5 | 63 |
| 5 Sharing & Privacy | 3 | 3 | 30 |
| 6 PWA & Offline | 4 | 4 | 39 |
| 7 Notifications | 3 | 3 | 25 |
| 8 Billing & Quotas | 2 | 2 | 20 |
| 9 Account Data Rights | 2 | 2 | 18 |
| 10 Operations & Admin | 3 | 3 | 22 |
| **Total** | **38** | **38** | **~403** |

---

## 23. MVP BOUNDARY

> **Superseded by §27.3.** The three-way boundary below was recast as a **three-release plan** once the designer's scope was integrated: Release 1 "The Promise", Release 2 "Together", Release 3 "Gifting & Legacy". The reasoning here is what §27.3 is built on, and the §23.4 boundary test still decides every placement.

The single most important section for shipping. Each placement is justified.

### 23.1 BUILD NOW (MVP)

| Feature | Why it must be in the MVP |
|---|---|
| Auth (email OTP + passkeys) | Nothing else can exist without identity. Passkeys because a lifetime vault must not hinge on a remembered password. |
| Personal vault | The container. Trivial, and everything hangs off it. |
| Create memory (media + date + note) | The atomic unit. **The note is not optional** — "what did this mean" is the entire difference between this product and a photo backup. |
| In-app capture (photo/video/voice) | The emotional payload is a face or a voice. Upload-only would make the MVP a file manager. |
| Resumable offline upload | Not a nicety. Mobile uploads fail constantly, and one lost memory destroys the trust the product sells. Cannot be retrofitted — it shapes the client, the API, and the schema. |
| Timeline with a future band | The product's identity, and the only place a pending capsule can be *felt*. |
| Memory detail view | Where the value is actually experienced. |
| **Time capsule: seal + schedule** | **The differentiator.** Without it this is a worse Google Photos. |
| **Durable delivery engine** | The promise. A capsule that might not arrive is worse than no capsule. |
| **Recipient unlock + reply** | The delivery moment *is* the product, and the reply is the growth loop. Cutting this would ship the setup without the punchline. |
| Private share links (no account to view) | Family will not sign up to see a photo. Without this the archive is a dead end. |
| On This Day | The cheapest strong retention mechanic available. Needs no AI — only dates. |
| Push + email notifications | A scheduled-delivery product literally cannot function without them. |
| Installable PWA + offline shell | It is a PWA; this is the platform promise, and the marketing already made it. |
| Privacy controls + audit log | The product asks for the most sensitive data a person owns. Retrofitting authorisation is how privacy incidents happen. |
| Export + delete | Legally required, and a core trust signal for a product about permanence. |
| Quota + Stripe checkout | Media costs real money from the first user. Launching without billing means launching a liability. |

### 23.2 BUILD AFTER MVP (V1 — the following 3–4 months)

| Feature | Why it waits |
|---|---|
| Shared vaults and albums | Multi-user permissions are a large surface. The single-user loop must be proven first, and shared vaults are far more compelling once there is content to share. |
| Collaborative capsules | The strongest growth loop, but it depends on shared vaults, invitations, and montage assembly. Powerful and expensive — deserves its own cycle. |
| People, relationships, milestones | MVP needs only a name and a contact to address a capsule. Full people-browsing and milestone scheduling add real value but no new capability. |
| Milestone delivery conditions | "Ella turns 18" is nicer than a date, but a date works. Pure refinement. |
| SMS and WhatsApp delivery | Email plus push satisfies the guarantee at launch scale. Twilio adds cost, compliance, and per-country complexity. Add when volume justifies it. |
| Backup guardian | Matters for 20-year capsules, and no MVP capsule is 20 years old yet. Ship before the first long-horizon deliveries mature. |
| Semantic search and transcripts | Needs an archive to search. Also the first AI cost centre — introduce with revenue in place. |
| Auto event grouping | Real value, no new capability, and cheap to add later. |
| Auto recaps | High complexity (video composition plus music licensing) for engagement rather than core value. |
| Voice notes on existing memories | Genuinely valuable and cheap; it lands early in V1 rather than in MVP only because MVP capture already covers voice as a primary memory. |
| Comments and reactions | Meaningless without shared vaults. |
| Biometric app lock | A premium promise, but the app is private behind auth already. |
| Annual reassurance report | Nothing to reassure about in year one. Must exist before year two. |
| Print and PDF export | A revenue line, not a core loop. |
| Suggested capsules (A10) | Attacks the biggest activation problem, but needs a populated archive and a people model. First V1 priority once those exist. |

### 23.3 DO NOT BUILD YET

| Feature | Why not |
|---|---|
| **Heir assignment / legacy transfer** | The boldest promise and the biggest trap. It needs death verification, a legally reviewed process, dispute handling, identity verification, and human operations. Shipping it half-built means either failing to transfer a vault or transferring one wrongly — both catastrophic. Market the *vision*, build it properly in V2. |
| **Posthumous delivery** | Depends entirely on the above. |
| **Face recognition** | Highest legal risk in the inherited feature set (Illinois BIPA statutory damages per violation, and this product's content is largely children). Requires legal review, jurisdiction gating, and separate consent before a single embedding is computed. |
| **AI generative cards and posters** | A different product competing with Canva. The two dead components in the existing repo suggest the team already sensed this. Ship 3 templates well in V2, not 15 badly at launch. |
| **Physical card fulfilment** | Print vendors, shipping, addresses, returns, and tax. A separate business, not a feature. |
| **AI narrative stories** | Depends on captions and transcripts, and confabulating emotional detail about a real family is worse than no feature. Needs strong grounding and an approval UI. |
| **Family tree / relationship graph** | Large modelling effort with no MVP payoff. |
| **Public memorial pages** | Introduces a public surface into a private-by-default product. Needs its own moderation and abuse thinking. |
| **End-to-end encryption** | Would preclude thumbnails, transcoding, search, and all AI. Offer as an opt-in tier later with the trade-offs stated. |
| **Native app shells** | The PWA satisfies "iOS, Android, and Web". Add only if store presence proves necessary. |
| **Import from Google Photos / iCloud** | High value for adoption, but OAuth scopes, quotas, and multi-gigabyte migrations are a project in themselves. Early V2. |
| **"Unlimited" storage** | Not a feature to build but a promise to *retire*. Unsurvivable economics for a product whose users never delete anything. Breaking a storage promise later would be fatal for a company selling trust. |
| **A social feed, public profiles, ads** | Contradict the product's reason to exist. Never. |

### 23.4 The boundary test

Every MVP feature answers yes to: *"If this were missing, would the core promise — record a moment now, and have it reliably reach someone later — be broken?"*

- Remove resumable upload → memories get lost → **broken.**
- Remove the recipient unlock page → the capsule cannot be received → **broken.**
- Remove semantic search → the promise still works. **Not MVP.**
- Remove heir transfer → the promise still works. **Not MVP.**

---

## 24. COMPETITIVE / PRODUCT IMPROVEMENTS

### 24.1 Five UX improvements over the existing product

1. **Ask "when did this happen?", not "when was this uploaded?"** The existing product never distinguishes them. Adding `occurred_at` with a precision flag is a small change that makes importing a 40-year archive actually work — every competitor collapses scanned photos into the upload date, and every family archivist is quietly furious about it.
2. **Make the first session end with a countdown, not a confirmation.** The current funnel ends at "download the app". The new onboarding ends with a sealed capsule and a live countdown on the timeline — the user leaves with an open emotional loop rather than an empty folder.
3. **Let people view without an account.** The existing model implies everyone downloads the app. A grandmother will not. Account-free viewing for shares and capsules removes the single largest barrier to the product's most emotional moments.
4. **Replace scroll spectacle with scroll substance.** The existing site uses scroll hijacking, a custom cursor, and a WebGL fluid simulation. In an app opened daily on a phone, those cost battery, break accessibility, and fight native gestures. Keep the typographic craft and the excellent dark mode; drop the theatre.
5. **Make privacy visible rather than merely claimed.** The existing site *asserts* "256-bit AES" and "bank-level security". The new product shows a live "who can see this" panel, an access log the user can read, and one-tap revocation. Demonstrated control beats claimed encryption — and it is honest, which the current copy is not quite.

### 24.2 Five product improvements

1. **Design for the 20-year silence.** The existing concept has a fatal invisible gap: a user seals a capsule and hears nothing for a decade, so they forget the product, change email, and cancel their card. The fix is a deliberate long-horizon relationship — an annual reassurance report, contact-freshness prompts, and a backup guardian. **No competitor has solved this, because no competitor has taken the long promise seriously.**
2. **Make the reply a first-class feature.** In the existing concept, delivery is the end. Making it two-way — the recipient replies, and the reply lands in the sender's vault as a memory — converts a one-way broadcast into a relationship, and converts a recipient into a user.
3. **Retire "unlimited" for honest, generous tiers.** Unlimited storage for users who never delete is a promise that must eventually be broken, and breaking it destroys the only thing this product sells. Generous, clearly priced tiers are both more honest and more durable.
4. **Suggest capsules instead of waiting for them.** People do not spontaneously think "I should record something for my daughter's 18th". The product knows the birthdays and holds the memories, so it should notice and prompt at the right moment. This directly attacks the activation problem the existing funnel ignores entirely.
5. **Ship deterministic "intelligence" before AI.** The existing product markets AI everywhere, yet the features users would experience as intelligent — On This Day, event grouping, auto-titles, the timeline — are date arithmetic. Shipping those first delivers the perceived magic at near-zero cost and risk, and buys time to do the real AI well.

### 24.3 Five unique differentiators

1. **A timeline that extends into the future.** Every memory product shows the past. Showing pending capsules on the same continuous axis — your life, plus what you have promised to it — is a genuinely novel primary interface, and it is latent in the existing repo's own Past/Present/Future design.
2. **Delivery as an engineered guarantee, published.** Not a "99.9%" marketing number but a real architecture — durable database-owned schedules, a channel ladder, a watchdog, integrity sweeps, cross-provider backups — documented publicly in `DELIVERY-GUARANTEE.md`. In a category built on vague assurances, verifiable specificity is the differentiator.
3. **Searchable voices.** Transcribed, indexed voice notes make the most precious content in any family archive findable for the first time. Google Photos indexes your objects; M&M indexes your grandmother's stories.
4. **A recipient experience worth the wait.** Competitors treat delivery as an email with an attachment. Making the open ceremonial, account-free, JavaScript-optional, and repliable turns the product's payoff moment into its best marketing.
5. **Privacy as a demonstrated product surface.** An access log the user can actually read, active-link management, instant revocation, no ads, no data mining, honest encryption language, and free full export. In a market where everyone claims privacy, showing the receipts is a position.

### 24.4 Five potential future features

1. **The living archive interview.** Periodic, gentle prompts that draw out stories which would otherwise be lost — "You have 40 photos from 1998 with no story. Want to talk about that summer?" — recorded as voice, transcribed, attached. This is the product doing the archivist's work, and it is the strongest AI application in the whole space.
2. **Generational handover.** When a vault transfers to an heir, do not just move files: generate a guided introduction to the archive — who these people are, what these years were, what the deceased wanted their heir to see first. The moment of inheritance is the product's highest-stakes experience and nobody has designed it.
3. **Family collaborative history.** Multiple generations contributing to one shared timeline, with each person's memories of the same event sitting side by side. The same wedding from five perspectives is something no single-user archive can produce.
4. **Physical time capsule.** A printed, beautifully made book or box that arrives by post on the unlock date, alongside the digital capsule. It closes the loop from the existing product's greeting-card ambition, and physical artifacts are the strongest emotional and margin play available.
5. **Legacy-aware storage economics.** A one-time "Forever" endowment plan with a segregated reserve fund, published assumptions, and a documented wind-down policy stating what happens to vaults if the company fails. **A memory company that publishes its own failure plan would be the most trustworthy operator in the category** — and it is the logical endpoint of everything this product claims to be.

---

## 25. FINAL PRODUCT BLUEPRINT — PART I VIEW

> **⚠ Superseded by §37.** This section summarises the product-only analysis of Part I. After the UI/UX designer's specification was integrated (Part II, §26–§37), the authoritative consolidated blueprint is **§37**, which covers the design system, the extended scope (occasions engine, broadcasts, gift commerce, legacy vault), and the three-release plan. This section is retained because it records the tight, pre-design MVP reasoning that §23 and §27 both build on. Every difference between the two is logged in **Appendix C**.

**PRODUCT:**
M&M — Moments & Memories. A private, mobile-first Progressive Web App for preserving life's meaningful moments and delivering them to specific people at specific moments in the future.

**ONE-LINE DESCRIPTION:**
The private home for the moments that matter — and the only place you can reliably hand one of them to someone years from now.

**TARGET USERS:**
Parents recording forward for their children (the primary persona — "James Carter, father of two"); family archivists holding the household's photo history ("Anna Martinez, family historian"); grandparents passing stories down ("Emily Davis, grandmother"); and recipients, who arrive through a delivered capsule and become the next generation of creators. US-first, family-and-life-event centred, ages roughly 30–70, with grandparents treated as core users rather than edge cases.

**CORE PROBLEM:**
Meaningful memories are lost three ways: by volume (buried in a camera roll of 40,000 undifferentiated photos), by time and mortality (the context and the voice die with the person; accounts lapse; nobody inherits a password), and by intent (there is no reliable way to say "give this to my daughter on her 18th birthday" and be confident it will arrive).

**CORE SOLUTION:**
A private encrypted vault where a memory is media *plus its meaning*, laid out on a timeline that extends into the future — combined with an engineered delivery guarantee that carries a sealed capsule to a named person on a chosen date, and a recipient experience worthy of the wait.

**EXISTING PRODUCT FEATURES:**
The existing repository is a static Next.js marketing site deployed to GitHub Pages. **Only two things function: light/dark theming and static page routing.** Everything else is copy and design: Legacy Vault, high-resolution no-compression storage, unlimited storage, in-app photo/video/voice capture, biometric app lock, time capsules with future delivery, decade-scale durability, multi-channel delivery with failover (App/WhatsApp/SMS/Email), heir assignment and legacy transfer, family vaults, AI memory stories, smart recaps, On This Day, emotional search, facial recognition, auto-curation, 15 categories of AI generative creations, collaborative memories, shared albums, digital and physical greeting cards, a Past/Present/Future timeline, a gallery, testimonials, an FAQ, an empty journal, and two mutually contradictory pricing tables. There is no auth, no database, no API, no PWA manifest, no service worker, and the only form calls `preventDefault()`.

**NEW PWA MVP:**
Email OTP + passkey auth · personal vault · create memory (media + when-it-happened date + what-it-meant note) · in-app photo/video/voice capture · resumable offline-tolerant upload · Past→Present→**Future** timeline · memory detail view · **time capsule seal + schedule** · **durable delivery engine** · **account-free recipient unlock + reply** · revocable private share links · On This Day · push + email notifications · installable PWA with offline shell and offline capture · privacy controls with a user-visible access log · data export and account deletion · storage quota with Stripe checkout. **No AI in the MVP, deliberately.**

**NEW PWA V1:**
Shared vaults and albums · collaborative capsules · people, relationships and milestones · milestone-based delivery conditions · SMS and WhatsApp delivery with failover · backup guardians · semantic search · voice and video transcription · auto event grouping · auto recaps (Year in Review, monthly) · voice notes on existing memories · comments and reactions · biometric app lock · annual reassurance report · print and PDF export · **suggested capsules** (the highest-leverage new idea).

**FUTURE FEATURES:**
Legacy transfer and heir assignment (XL — legal, identity verification, and operations) · posthumous delivery · AI narrative stories · face grouping (opt-in, geo-gated, legally reviewed) · AI generative cards and posters · physical card fulfilment · family tree · import from Google Photos and iCloud · duplicate detection · native app shells · opt-in end-to-end encryption · public memorial pages · the living archive interview · generational handover · physical time capsules · a "Forever" endowment plan with a published wind-down policy.

**MAIN SCREENS:**
*Marketing:* Landing, How it works, Family legacy, Pricing, Privacy & security, Journal, Legal.
*App:* Sign up, Log in, Onboarding (3 steps), **Home/Today**, **Timeline**, Gallery, **Create/Capture**, **Seal a capsule**, **Capsule detail**, Memory detail, Album/Shared vault, Search, People, Notifications, Settings (profile, security, privacy, notifications, plan, data, appearance).
*Public:* **Recipient unlock `/c/[token]`** (server-rendered, works without JavaScript), Shared view `/s/[token]`.
*Internal:* Admin operator console.

**CORE USER JOURNEYS:**
1. **New user:** Landing → signup → onboarding (purpose, people, first moment) → capture or upload → add title, date, meaning → keep private or seal → **leaves with a live countdown on the timeline.**
2. **Returning user:** Open the installed app or arrive from a push → Today (On This Day, next capsule countdown, family activity) → add a moment, watch a recap, or top up a capsule → save.
3. **Core journey (seal a moment for the future):** Intent → capture → enrich → address recipients → choose the unlock condition → seal (ceremonial, with a plain-language summary) → confirm → wait (with annual reassurance and contact-freshness prompts) → deliver across channels until acknowledged → **recipient opens and replies.**
4. **Content journey:** Create → add media (offline-safe) → add information → auto-organise by date and event → save optimistically → view later via timeline, gallery, On This Day, or search → share.
5. **Sharing journey:** Create → select people or generate a link → set permission, expiry, and download → recipient views **without an account** → owner sees who viewed and revokes in one tap.

**CORE DATA MODELS:**
*MVP:* User · Vault · VaultMember · **Memory** (with `occurred_at` + `occurred_precision`) · MediaAsset · UploadSession · **Capsule** · CapsuleRecipient · DeliveryAttempt · CapsuleReply · Person (lite) · Album (lite) · Share · Notification · Device · **ScheduledJob** (the durable clock) · Subscription · AuditLog.
*V1:* MemoryPerson · Album (full) · Invitation · Comment · Reaction · AiJob · MemoryEmbedding (pgvector) · Derivative.
*V2:* LegacyPlan · Heir · FaceCluster · PrintOrder · FamilyRelationship.

**PWA FEATURES:**
Installable with a manifest, maskable icons, shortcuts, and `share_target` · install prompted only after the first successful save, with an iOS-specific path · offline app shell, offline reads of recent memories and thumbnails, **offline capture and creation via an IndexedDB outbox** · Background Sync and resumable uploads owned by the service worker · capsule sealing honestly blocked offline · Web Push (VAPID) with email as the guaranteed fallback · Web Share and Web Share Target · WebAuthn passkeys and app lock · Badging API · Screen Wake Lock · File System Access for bulk import and export · View Transitions and native-feeling sheets · bottom tab navigation on mobile, a sidebar with ⌘K on desktop · deep links throughout, with `/c/[token]` durable for decades · `Save-Data` and connection-aware media loading.

**PRIVACY MODEL:**
**Private by default** (owner only) · **Shared** by explicit grant (vault role, active share link, or delivered capsule recipient) · **Public** not available at MVP. One authorisation rule: every read resolves to a vault role, an active share, or a delivered recipient — there is no fourth path, and nothing is readable by knowing an id. Hashed CSPRNG tokens; 5-minute signed media URLs; no publicly readable objects; instant revocation with exposure bounded to minutes; `noindex` on every token route. A user-visible access log and active-link manager. Free full export; two-step deletion with a 30-day grace period that explicitly warns about the capsule promises being cancelled. Opt-in AI processing with a global off switch; GPS stripped by default; no ads, no data mining, no third-party trackers in the app. Face recognition deferred and geo-gated (BIPA/CUBI/GDPR). Honest encryption language — server-side AES-256, explicitly **not** end-to-end, stated plainly.

**TECH STACK:**
Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 · Radix UI · Motion + View Transitions · Serwist service worker · TanStack Query + Dexie (IndexedDB) + Zustand · Postgres (Neon) with Drizzle, FTS, and pgvector · Better Auth (email OTP, passkeys, OAuth) · **Cloudflare R2** (zero egress) behind Cloudflare CDN with signed URLs · FFmpeg + sharp workers on Fly.io · **a Postgres-backed job table as the durable scheduler** (never a third-party scheduler as the source of truth) · Resend with SES as a standing fallback · Twilio `[V1]` · Web Push (VAPID) · Stripe · Claude for narrative and curation copy plus Whisper-class ASR and embeddings `[V1]` · Vercel + Fly hosting · Sentry, Axiom, Checkly, and a bespoke delivery-SLA monitor · PostHog (first-party) · Vitest, Playwright, and SQL-level permission tests · GitHub Actions with per-PR database branches. **Explicitly rejected:** static export, GitHub Pages, Firebase, a separate search service, GSAP/Lenis/Three.js inside the app, and native-first.

**NEW REPOSITORY STRUCTURE:**
A Turborepo monorepo: `apps/web` (the PWA — route groups for `(marketing)`, `(auth)`, `(app)`, plus public `c/[token]` and `s/[token]`, an `admin` console, and `api/webhooks`; a **feature-first `src/features/`** covering auth, memory, capsule, media, timeline, sharing, search, people, notifications, billing, settings; shared `components/ui`, `components/media`; `lib/` with **`authz/` as the single permission chokepoint**, plus `db/`, `storage/`, `jobs/`, `offline/`, `push/`, `email/`, `ai/`; a first-class `sw/` service-worker source; and `e2e/`) · `apps/workers` (the deployable delivery engine, transcode, integrity sweep, AI jobs, purge) · `packages/` (`shared` zod schemas, `db` as the single schema source, `emails` including the decade-durable delivery template, `config`) · `docs/` (ARCHITECTURE, DATA-MODEL, PERMISSIONS, **DELIVERY-GUARANTEE**, PRIVACY, RUNBOOK, ADRs) · `scripts/` (seed, backup-verify, **restore-drill**, load-test).

**DEVELOPMENT PHASES:**
1. Foundation (1.5w) — monorepo, Next.js 16, Tailwind, Postgres/Drizzle, CI, deploys, Sentry.
2. Auth & onboarding (2w) — OTP, passkeys, OAuth, sessions, vault creation, **`authz` built and tested before any content exists**, 3-step onboarding.
3. Core product (4w) — Memory schema, app shell, timeline with the future band, gallery, detail view, edit/delete, favourites, text search, On This Day, accessibility.
4. Media pipeline (4w) — R2, presigned resumable multipart upload, Dexie outbox, in-app capture, FFmpeg/sharp workers, signed-URL delivery, progressive media components.
5. **Capsules & delivery (5w)** — seal flow, transactional scheduling, immutability, the delivery worker and channel ladder, the watchdog, integrity sweeps, `/c/[token]` server-rendered, the durable delivery email, share links.
6. PWA (2.5w) — manifest, Serwist, offline reads, offline writes and sync, install prompt, share target, E2E offline tests.
7. Notifications (1.5w) — VAPID, devices, the notification centre, preferences and quiet hours, email templates, the volume guardrail.
8. Billing & admin (2.5w) — Stripe, quotas, export, deletion, privacy settings, the operator console.
9. Hardening (3w) — permission-matrix tests, RLS, E2E critical path, load testing, an external pen test focused on IDOR, WCAG 2.2 AA, device lab, **the first restore drill**, runbooks and alerting.
10. Launch (2w) — the marketing site with **corrected claims**, one coherent pricing page, a real waitlist backend, legal pages, staged rollout, public `DELIVERY-GUARANTEE.md`, on-call.
**Total ~28 weeks, ~22–24 with overlap.**

**MVP BACKLOG:**
10 epics · 38 features · 38 user stories · ~403 tasks.
1. Authentication & Account (5 features, 58 tasks) — OTP signup, passkeys, OAuth, sessions and devices, onboarding.
2. Vault & Memory (7, 73) — create, view, edit/delete, timeline, gallery, favourites/occasions/search, On This Day.
3. Media Pipeline (4, 55) — in-app capture, resumable upload, derivative processing, secure delivery.
4. **Time Capsules (5, 63)** — seal, detail and countdown, the delivery engine, the recipient unlock experience, the durable delivery email.
5. Sharing & Privacy (3, 30) — share links, privacy controls and the access log, permission enforcement with one test per matrix cell.
6. PWA & Offline (4, 39) — installability, offline shell and reads, offline writes and sync, native integrations.
7. Notifications (3, 25) — push infrastructure, the notification centre and preferences, email.
8. Billing & Quotas (2, 20) — Stripe checkout, storage quota.
9. Account Data Rights (2, 18) — export, deletion.
10. Operations & Admin (3, 22) — delivery health console, support tooling with break-glass, analytics instrumentation.

---

## APPENDIX A — Open product decisions

Items where the repository does not provide enough evidence:

1. **Pricing.** $9/month vs $12/month; 5GB vs 5 uploads per month; whether time capsules are gated behind the paid tier (the home page says yes, the pricing page is silent). — **RESOLVED. See §17.2 and Appendix C-6 / C-8.** Decided: Free / Premium ₹399 / Family ₹749; the free tier is limited by **storage (10 GB) and capsule horizon (3 pending, 12 months)**, never by a count of memories; **no quality tiering**; and a sealed capsule is never cancelled for non-payment.
2. **Do native apps exist or are they planned?** The copy sells iOS and Android downloads with no links and no mobile codebase. — **INSUFFICIENT EVIDENCE — PRODUCT DECISION REQUIRED.**
3. **Geographic scope and launch market.** Signals point to the US (a Chicago area code, a USA travel asset), but nothing is stated. This determines GDPR posture, SMS/WhatsApp costs, and biometric legality. — **INSUFFICIENT EVIDENCE — PRODUCT DECISION REQUIRED.**
4. **Heir verification model.** How is death verified? Who adjudicates a dispute? What waiting period applies? — **INSUFFICIENT EVIDENCE — PRODUCT DECISION REQUIRED**, and legal review needed before V2.
5. **Music licensing for recaps.** The copy explicitly promises "licensed music", which is a commercial commitment with a real cost. — **INSUFFICIENT EVIDENCE — PRODUCT DECISION REQUIRED.**
6. **Physical card fulfilment partner.** `/greeting-cards` promises physical cards; no vendor, geography, or pricing exists. — **INSUFFICIENT EVIDENCE — PRODUCT DECISION REQUIRED.**
7. **Company longevity commitment.** The product sells 20-year durability. What happens to vaults if the company fails? This needs a written, published policy — see §24.4 item 5. — **PRODUCT DECISION REQUIRED.**
8. **Brand identity carry-over.** Keep `#FF7C0A` orange and the Instrument Serif / Inter / Caveat pairing, or rebrand? The existing dark mode collapses `--primary` to pure white, losing the brand colour entirely — likely unintentional. — **DESIGN DECISION REQUIRED.**

## APPENDIX B — Claims in the existing marketing that must be corrected before launch

The new marketing site should reuse the existing copy's considerable strengths, but these specific claims cannot ship as-is:

| Existing claim | Problem | Correction |
|---|---|---|
| "Unlimited Storage — stored forever" | Economically unsurvivable; a promise that must be broken | Generous, explicit tiers (§17.2) |
| "Military-grade security ensures your private vaults remain strictly yours" | Implies end-to-end encryption, which the architecture does not provide | "Encrypted in transit and at rest with AES-256" plus a plain statement of what the service can and cannot see |
| "99.9% Delivery SLA" | An unmeasured number presented as a guarantee | Publish the actual measured rate and the engineering behind it (`DELIVERY-GUARANTEE.md`) |
| "12,450 Memories Saved" / "12,450 reviews" | Fabricated, and reused as two different metrics | Real numbers, or no numbers |
| Three named testimonials with photos and roles | Fictional attributed quotes | Real testimonials, or clearly labelled illustrative scenarios |
| "Download for iOS / Android" | No apps exist | "Install the app" (PWA), or remove |
| "Facial Recognition" | Not built; significant legal exposure | Remove until legally cleared and shipped |
| "Assign heirs to inherit your vault" | Not built; V2 with legal dependencies | Present as the roadmap, clearly labelled |
| "5 memory uploads per month" vs "5GB" | Two contradictory free tiers, and **both metrics are wrong** | One coherent pricing page stating the decided model: **10 GB, unlimited memories, 3 pending capsules within 12 months** (§17.2, Appendix C-6/C-8) |
| "Bank-level encryption" | Vague marketing idiom | Specific, verifiable language |

---

*End of Part I. Part II — the design specification and extended scope — continues below.*
---
---

# PART II — DESIGN SPECIFICATION & EXTENDED SCOPE

*Integrated from the UI/UX designer's "World-Class Product Mega Prompt" (Parts 0–9), reconciled against Part I of this blueprint and adapted for a Progressive Web App.*

**How the two halves relate:**

- **Part I (§0–§25)** established what the existing repository actually is, what the product does, and a tight, defensible MVP built around one differentiating loop: *record now → seal → reliably deliver → open beautifully.*
- **Part II (§26–§37)** is the production design specification: visual system, ~115 screens across three surfaces, extended data model, and the additional product territory the designer's brief introduces — most significantly a **full gift commerce business**, an **occasions/events engine**, **broadcasts**, and **group gifting**.
- Where the two conflict, **Part II supersedes Part I on design, visual, and screen-level decisions**, and **Part I supersedes Part II on architecture, platform, and release sequencing** (because Part II assumes native apps, and this product is a PWA). Every conflict is recorded and resolved in **Appendix C**.
- **§37 is the authoritative consolidated blueprint.**

---

## 26. DESIGN SYSTEM & VISUAL DIRECTION

### 26.1 Product one-liner (adopted — supersedes §25's phrasing for design use)

> "Moments & Memories is an emotional-tech platform where people capture memories today and deliver them at the perfect moment tomorrow — a birthday video that arrives at midnight, a voice note from a grandparent unlocked on a graduation day, a gift that lands on an anniversary."

### 26.2 Design personality

Warm, premium, emotionally intelligent. **Airbnb's warmth × Apple Photos' polish × Calendly's scheduling clarity.** Mood: soft, nostalgic, celebratory.

This is a deliberate and welcome correction to the existing repository's direction, which is technically impressive but emotionally cold (WebGL fluid cursor, shader hills, scroll hijacking — spectacle performing *at* the visitor rather than serving the memory). See §6 design principle 10 and §9.3.

### 26.3 Color tokens

**⚠ This palette supersedes the existing repository's `#FF7C0A` orange and its single-token theme.** See Appendix C-1.

| Token | Light | Role |
|---|---|---|
| `--primary` | `#FF6B5E` | Warm coral/sunset — primary actions, active nav, brand |
| `--primary-hover` | `#F2564A` | Hover/pressed |
| `--primary-soft` | `#FFF0EE` | Tinted backgrounds, selected chips |
| `--secondary` | `#4A2545` | Deep plum — headers, high-emphasis surfaces, gradient anchor |
| `--secondary-soft` | `#EDE4EB` | Plum tint |
| `--accent` | `#F4C95D` | Soft gold — celebration, premium badges, seals, confetti |
| `--bg` | `#FAF9F7` | Warm off-white page background |
| `--surface` | `#FFFFFF` | Cards, sheets |
| `--surface-alt` | `#F4F2EF` | Nested surfaces, disabled fills |
| `--text-primary` | `#1C1B1A` | Body and headings |
| `--text-secondary` | `#6B6763` | Secondary copy, captions |
| `--text-tertiary` | `#9C9793` | Placeholders, metadata |
| `--border` | `rgba(28,27,26,0.10)` | Hairlines, input borders |
| `--success` | `#2E9E6B` | Delivered, verified, in-stock |
| `--error` | `#E0453A` | Validation, failures |
| `--warning` | `#F2A03D` | Quota, at-risk delivery, unverified email |
| `--info` | `#3D7DD8` | Neutral system messages |

**Dark mode (full support, plum-charcoal base):**

| Token | Dark |
|---|---|
| `--bg` | `#17121A` |
| `--surface` | `#211A24` |
| `--surface-alt` | `#2C2331` |
| `--text-primary` | `#F7F4F2` |
| `--text-secondary` | `#B4ACB0` |
| `--primary` | `#FF7F73` (lifted for contrast on dark) |
| `--accent` | `#F6D27E` |
| `--border` | `rgba(247,244,242,0.12)` |

**Implementation rule (from §9 / Part I):** define the complete light palette on bare `:root`; redefine only changed tokens under `@media (prefers-color-scheme: dark)` guarded as `:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]`. **Never give a color its only definition inside a media query.** The existing repository's dark mode collapses `--primary` to pure white, losing the brand colour entirely — that bug must not be reproduced (Appendix A-8, now resolved).

**Status chip colors (used across memory delivery, orders, moderation):**
`Scheduled` info · `Processing` warning · `Delivered` success · `Opened` primary · `Reacted` accent · `Failed` error · `Cancelled` text-tertiary · `Sealed/Locked` secondary.

### 26.4 Typography

| Role | Family | Size/Line | Weight |
|---|---|---|---|
| Display / H1 | **Fraunces** (fallback: Recoleta → Instrument Serif → Georgia, serif) | 32/40 | 600 |
| H2 | Fraunces | 24/32 | 600 |
| H3 | Inter | 20/28 | 600 |
| Body | **Inter** (fallback: SF Pro → system-ui, sans-serif) | 16/24 | 400 |
| Body strong | Inter | 16/24 | 600 |
| Caption | Inter | 13/18 | 400 |
| Micro | Inter | 11/14 | 500 |
| Numeric/countdown | Inter tabular-nums | 20/28 → 40/44 | 600 |

Serif is reserved for **emotional moments** — headers, capsule reveals, sealed states, celebratory copy. UI chrome, forms, tables, and admin are always Inter. Fraunces is a variable font: load only the axes used, `font-display: swap`, subset to Latin + the currency glyphs (₹, $, €).

Dynamic type: all sizes in `rem`, respecting the OS/browser text-size setting; layouts tested at 200% zoom without horizontal scroll.

### 26.5 Spacing, radius, elevation, motion

- **Spacing:** 8pt system — `4, 8, 12, 16, 24, 32, 40, 48, 64, 80`.
- **Radius:** inputs and chips `12px`; cards and sheets `20px`; hero/modal `24px`; pills and avatars `999px`; media thumbnails `16px`.
- **Elevation:** `sm` `0 2px 8px rgba(28,27,26,.06)` · `md` `0 4px 24px rgba(28,27,26,.08)` (the designer's specified default) · `lg` `0 12px 40px rgba(28,27,26,.12)` · dark mode uses a `1px` border plus a lower-opacity shadow, since shadows read poorly on dark surfaces.
- **Motion:** micro `120ms ease-out` (toggles, chips) · standard `240ms cubic-bezier(.2,.8,.2,1)` (sheets, cards, nav) · expressive `480ms` (page/view transitions) · **ceremonial `1200ms`** (capsule seal and unwrap — deliberately slow; ceremony is the point, per §9.3).
- **Reduced motion:** every animation has a `prefers-reduced-motion: reduce` variant that cross-fades or snaps. Confetti becomes a static badge. **This is not optional** — it is both an accessibility requirement and a vestibular-safety one.

### 26.6 Iconography and imagery

- Icons: rounded, 2px stroke, 24px default (20px dense, 28px nav); **filled variant for active tab state**. One family throughout (Lucide or Phosphor); never mixed.
- Imagery: real human warmth — candid family photos, soft grain, golden-hour tones. **No stock-corporate imagery.** The existing repo's asset set (family videos, polaroid stacks, warm posters) is directionally right and can be reused for marketing.
- Celebration: confetti and spark micro-animations, used **sparingly** — account creation, first memory, delivery confirmation, and capsule unwrap only (§33).

### 26.7 Grid and breakpoints

| Surface | Grid | Margins | Gutters |
|---|---|---|---|
| Mobile (≤ 767px) | 4 columns | 16px | 8px |
| Tablet (768–1023px) | 8 columns | 32px | 16px |
| Web/desktop (≥ 1024px, frame 1440) | 12 columns | 80px | 24px |
| Admin (≥ 1280px) | 12 columns + **240px fixed left nav** | 32px | 24px |

### 26.8 Accessibility (WCAG 2.2 AA — binding)

Minimum contrast 4.5:1 for text and 3:1 for large text and UI boundaries (the coral `#FF6B5E` **fails 4.5:1 against white for body text** — it is valid for large text, icons, and fills, but body copy and small labels must use `--text-primary`; coral-on-white small text is prohibited). Touch targets ≥ 44×44px with ≥ 8px separation. Full keyboard operability with a visible focus ring (2px `--primary`, 2px offset). Semantic landmarks and headings in order. Screen-reader labels on every interactive element, including icon-only buttons. Live regions for upload progress, delivery status, and toasts. Captions on all video; transcripts on all voice memories (which the V1 transcription feature produces for free — §15 A3). Never colour alone to convey status: always an icon or text label alongside.

### 26.9 Component library (the design file's foundation)

Buttons (primary, secondary, tertiary, destructive, icon) × 5 states (default, hover, pressed, disabled, loading) · Inputs (text, password with reveal, textarea with counter, select, date, time, phone with country picker, OTP boxes, search, file/upload) × 6 states (default, focus, filled, error, disabled, async-checking) · Chips (filter, selectable, relationship, status) · Cards (memory, member, event, product, order, capsule sealed, KPI) · Bottom sheets · Modals and confirmation dialogs · Toasts and undo snackbars · Bottom tab bar and desktop sidebar · Tables (sticky header, sortable, selectable, paginated) · Steppers · Avatars and avatar groups · Progress (bar, ring, upload) · Status chips · Countdown component · Skeleton, empty, and error templates · Paywall sheet · Permission primer.

---

## 27. SCOPE RECONCILIATION — DESIGNER BRIEF vs PART I MVP

This section exists because the two documents describe **materially different product sizes**, and pretending otherwise would produce a plan that cannot ship.

### 27.1 What the designer brief adds beyond Part I

| # | Addition | Assessment |
|---|---|---|
| 1 | **Full gift commerce** — catalog, variants, cart, checkout, payments, orders, couriers, returns, promotions, inventory | **The single largest addition.** This is a second business (retail ops, GST/tax, logistics, returns, working capital), not a feature. See §27.3. |
| 2 | **Occasions / Events engine** — recurring events, reminder offsets, calendar views, festival packs | **Excellent addition and a genuine gap in Part I.** Part I had only an `occasion` enum on a memory; the designer correctly identifies that *the event is a first-class entity* and is the natural trigger for both memories and gifts. **Adopted into MVP.** |
| 3 | **Members** (family & friends with relationships, birthdays, interests, wishlists) | Refines Part I's `Person`. **Merged** — see §34.1. |
| 4 | **Broadcasts** — festival/occasion messages to many recipients with merge tags | Strong V1 feature with real emotional and viral value. Also the highest abuse/spam risk in the product. |
| 5 | **Group gifting** — split cost, progress ring, auto-refund | Depends entirely on commerce. V2. |
| 6 | **Wishlists / gift registry per member** | Valuable and cheap; can ship before full commerce as curated external links. |
| 7 | **Festivals & localization engine** — region-aware packs (Diwali, Eid, Christmas, Lunar New Year) | Adopted. Confirms an **India-first, global-capable** market (also indicated by ₹ pricing, UPI, Razorpay, COD, E.164 country picker, "Indian + global names"). **This resolves open question A-3.** |
| 8 | **Streaks / thoughtfulness score / badges** | Adopted as V1, explicitly non-manipulative and optional (the brief's own "never gamble-y" instruction). |
| 9 | **Referral program** — "gift a month of Premium" | V1. Cheap, on-brand. |
| 10 | **Template & sticker marketplace** — frames, licensed music, animated text | V2. Music licensing is a real commercial commitment (open question A-5). |
| 11 | **AI Memory Assistant** — captions, greeting scripts, gift recommendations, memory prompts | Aligns with §15. Note the brief places memory prompts on the *Home* screen, which is a better placement than Part I had. |
| 12 | **Trust & safety** — moderation flags, report/block, admin queue | **Adopted into MVP as a minimum viable version.** Part I under-weighted this: any service accepting user media has non-negotiable legal duties (§20.12). |
| 13 | **Onboarding personalization quiz** | Adopted into MVP. Cheap, and it makes the first memory meaningful. |
| 14 | **Reactions & thank-you loop** | Already Part I's `CapsuleReply`, but the designer's version is richer (emoji + voice reply + "your memory made them smile" notification). **Adopted as specified.** |
| 15 | **Delivery Confidence System** with per-recipient status timeline | Matches Part I's `DeliveryAttempt` exactly. Same design, independently arrived at. Good signal. |
| 16 | **~115 screens across 3 surfaces + 8 flow diagrams + architecture poster** | This is the design deliverable, and it is the right scope *for design*. It is not the right scope for a first build. See §27.2. |

### 27.2 The honest scope statement

The designer brief describes roughly **85 mobile screens + 30 admin screens + a full marketing site**, spanning memory delivery, e-commerce, subscriptions, moderation, CMS, and analytics. Built as one release with a small team, that is a **12–18 month project** — not the ~24 weeks Part I's roadmap targets.

**The resolution is to separate design scope from build scope:**

- **Design all of it now.** A complete design system and screen library is genuinely valuable up front: it prevents the visual and interaction drift that comes from designing feature-by-feature, and it lets engineering build against a stable component contract. The deliverables checklist in §36 stands in full.
- **Build it in three waves**, each independently launchable, with the design file consumed progressively.

### 27.3 Revised release plan (supersedes §23's two-tier boundary)

**RELEASE 1 — "The Promise" (~24–28 weeks · the Part I MVP + the designer's high-value cheap additions)**

Part I MVP (M1–M17) **plus**:
- Occasions/Events engine with month/agenda views, recurrence, reminder offsets (adopted from 4.12 — it is the trigger for everything else)
- Members with relationships, birthdays, and interests (4.11), including manual add and **vCard/CSV import** (see §29.11 for the PWA contact-import limitation)
- Onboarding personalization quiz (4.2)
- Reactions and thank-you loop, including voice replies (4.16)
- Time capsules with **age-milestone** unlock ("open when Aarav turns 18") — the designer's framing is better than a bare date and costs little once events and members exist
- Notification centre with per-category preferences and quiet hours (4.8)
- Privacy centre with WebAuthn app lock and vault PIN (4.10, 4.27)
- Minimum viable trust & safety: report/block, an admin moderation queue, CSAM hash-matching on upload
- Subscription: **Free / Premium only** (Family deferred to R2), Stripe + Razorpay checkout. Free gates: 10 GB storage · 3 pending capsules · 12-month capsule horizon · in-app + email delivery. **No memory-count limit, no quality tiering** (§17.2)
- Global search (4.9)
- Marketing site (§30) and the Release-1 slice of the admin panel (§31: login, dashboard, users, moderation, delivery monitor, CMS, audit log)

Explicitly **not** in Release 1: any commerce, group gifting, broadcasts, collaborative memories, legacy vault, marketplace, referral, streaks.

**RELEASE 2 — "Together" (~12–16 weeks)**

- Shared vaults and family circles
- **Collaborative memories** (4.17) — the strongest acquisition loop in the product
- **Broadcasts with festival packs and merge tags** (4.18, 6.5), plus the localization engine
- Multi-channel delivery expansion: WhatsApp Business API and SMS with full cascade (4.15, §14)
- Family plan tier (5 seats, shared vault)
- Semantic search, transcription, auto event grouping, auto recaps (§15 V1 set)
- Suggested capsules and AI memory prompts (§15 A10)
- Wishlists per member — initially as curated links, no inventory
- Streaks, badges, referral program
- Annual reassurance report
- Admin: festivals engine, broadcast console, analytics, subscriptions

**RELEASE 3 — "Gifting & Legacy" (~16–20 weeks, and a business decision, not just an engineering one)**

- Full gift shop: catalog, PDP, cart, checkout, orders, tracking, returns (4.19–4.23)
- Group gifting (4.24)
- **Legacy Vault and Nominees with the full unlock protocol** (4.25) — Part I's §23.3 reasoning holds: this needs legal review, identity verification, and human operations before it ships
- Template and sticker marketplace, licensed music library
- Admin: gift catalog, orders and logistics, payments and refunds, promotions

**Commerce staging recommendation:** before building inventory, fulfilment, and returns, launch gifting as **curated affiliate or dropship links** from the wishlist and occasion surfaces. It validates whether users will buy gifts *through this product* at a fraction of the cost, and the same PDP and shelf designs are reused later. Owning inventory is a decision to become a retailer — it should follow evidence, not precede it.

### 27.4 What must not be deferred

Three items in the designer brief are cheap, are in Release 1, and would be very expensive to retrofit:

1. **The Events entity.** Retrofitting a first-class recurring event with reminder offsets after memories and gifts already reference occasions is a migration, not a feature.
2. **Trust & safety and the moderation queue.** A media service without a report path and a takedown workflow is a legal exposure from its first public user.
3. **The design system and component library.** Building screens before tokens exist produces the drift the designer brief is explicitly written to prevent.

---

## 28. INFORMATION ARCHITECTURE & NAVIGATION (revised, PWA)

### 28.1 Conflict resolution: bottom navigation

Part I proposed `Today · Timeline · (+) · Search · You`. The designer proposes `Home · Occasions · (+) · Gifts · Profile`. **Resolved in favour of a staged version of the designer's structure**, because Occasions is the product's action trigger and deserves a tab, while Search works better as a persistent top-bar affordance than as a tab (it is a verb, not a place).

**Release 1 bottom nav (5 items):**

```
┌───────────────────────────────────────────────────────┐
│   🏠 Home    📅 Occasions    ➕    🕰 Timeline   👤 Me  │
└───────────────────────────────────────────────────────┘
```

- **Home** — dashboard (4.7)
- **Occasions** — calendar and events (4.12)
- **➕ Create** — raised centre FAB in `--primary` coral; opens the Create bottom sheet (4.13). Not a route; a sheet, so context is never lost.
- **Timeline** — the memory timeline/journal including the **future band** with sealed capsules (Part I §8, feature 5 of the designer's enhancement layer). This is the product's identity view and must not be buried.
- **Me** — profile, members, vault, subscription, settings (4.10)

**Release 3:** `Timeline` moves into Home as a prominent segmented view, and **🎁 Gifts** takes the fourth slot, matching the designer's final structure. Announce the change in-app; never silently move a tab.

**Global chrome:** top bar with time-aware greeting, **search icon**, and **notification bell with badge**. Offline banner pinned below the top bar. Toast layer above the tab bar. Bottom sheets for all quick actions. The tab bar hides on scroll-down and returns on scroll-up, with safe-area insets honoured (`env(safe-area-inset-bottom)`).

### 28.2 Desktop / tablet navigation

The same app, responsively re-laid-out — not a separate product.

- **Tablet portrait:** bottom tab bar retained; two-pane where useful (list + detail).
- **Tablet landscape / desktop:** the tab bar becomes a **left sidebar** (Home, Occasions, Create, Timeline, Members, Gifts, Vault, Settings), with a top command bar carrying global search and `⌘K`. Three-column timeline. Full keyboard shortcuts (`n` new, `/` search, `j`/`k` navigate, `Esc` close).

### 28.3 Marketing website navigation

Sticky, translucent-blur-on-scroll: **Logo · Features · How it Works · Gifts · Pricing · Blog · [Install the app]**.

The CTA is **"Install the app"**, not "Get the app" — there is no store listing at Release 1 (Appendix C-2). On mobile it triggers the PWA install flow; on desktop it shows a QR code that opens the installable app on the visitor's phone.

### 28.4 Admin panel navigation (240px fixed left nav)

Dashboard · Users · Members & Nominees · Memories & Moderation · Events & Festivals · Gift Catalog · Orders & Logistics · Payments & Subscriptions · Broadcasts & Templates · Content Pages (CMS) · Notifications · Analytics · Admin Roles & Audit Log · Settings & System Health.

Items outside the current release are hidden, not shown disabled — a disabled nav item is a promise. Permission-locked items *are* shown disabled with a tooltip naming the required role, because that is a legitimate access state rather than an unbuilt feature.

### 28.5 Route map (consolidated, Release 1 → 3)

```
PUBLIC / MARKETING            APP (installed PWA)              PUBLIC (tokenised)
/                             /app             Home            /c/[token]   capsule unlock
/features                     /app/occasions                   /s/[token]   shared memory
/how-it-works                 /app/occasions/[id]              /g/[token]   group-gift page  [R3]
/gifts                        /app/timeline                    /j/[token]   collab capture   [R2]
/pricing                      /app/new  (sheet)                /n/[token]   nominee invite   [R3]
/blog[/slug]                  /app/memory/[id]
/faq  /contact                /app/capsule/new                 AUTH
/terms /privacy /refund       /app/capsule/[id]                /signup  /login
                              /app/members[/id]                /verify/phone  /verify/email
                              /app/broadcast/new     [R2]      /forgot  /reset/[token]
                              /app/collab/[id]       [R2]      /welcome/[step]
                              /app/search
                              /app/notifications               ADMIN
                              /app/vault             [R3]      /admin/*  (see §31)
                              /app/gifts/*           [R3]
                              /app/orders/*          [R3]
                              /app/settings/*
```

---
## 29. PWA APP — SCREEN-BY-SCREEN SPECIFICATION

**Universal requirement for every screen below:** design **default, loading (skeleton shimmer), empty (illustration + friendly copy + primary CTA), error (with retry), and success** states, in **both light and dark mode**. All forms validate on blur, re-validate on change after the first error, disable the primary button until valid, and use specific fix-oriented error copy (§33).

### 29.0 Native-to-PWA capability translation

The designer brief assumes Swift/SwiftUI and Kotlin/Compose. This product is a single installable PWA. Most of the brief translates directly; these are the mappings, **including two genuine web limitations that require design changes, not just implementation notes.**

| Designer brief assumes | PWA implementation | Parity |
|---|---|---|
| iOS + Android native apps | One installable PWA, responsive to desktop | ✅ Full — and one codebase instead of three |
| App Store / Play Store badges | PWA install prompt; custom install card after first successful save; iOS "Add to Home Screen" walkthrough | ⚠️ Different flow, same outcome. Store badges only appear if optional store shells ship (§7.3 F10) |
| Splash screen with 1.2s Lottie | Manifest `background_color` + icon paint, then a first-frame CSS/Lottie animation in the shell | ⚠️ The OS splash is static; the animation begins at first paint. Budget: shell interactive < 1.5s on mid-range Android |
| Face ID / fingerprint unlock | **WebAuthn platform authenticator** | ✅ Full — genuinely biometric, and stronger than a stored token |
| Android SMS auto-read for OTP | **WebOTP API** (`autocomplete="one-time-code"` + `@BOUND` SMS format) | ⚠️ Chromium/Android only. **iOS Safari has no equivalent** — but iOS *does* offer keyboard autofill of the code from the SMS, so the OTP boxes must use `autocomplete="one-time-code"` and accept paste. Design must not depend on auto-advance-from-SMS |
| APNs / FCM push | **Web Push (VAPID)** | ⚠️ Works everywhere modern, but **iOS 16.4+ requires the PWA to be installed**. Install promotion therefore becomes a *functional* requirement, and **email is the guaranteed fallback for every critical notification** (§14.2) |
| Haptics ("light tick", "success buzz") | **Vibration API** | ❌ **Android/Chromium only; iOS Safari has none.** All haptic feedback must be purely additive — every state it reinforces must also be conveyed visually. Design the visual state first, add haptics as a bonus |
| **Import from contacts** (4.11) | **Contact Picker API** | ❌ **The one significant gap. Chromium/Android only; unavailable on iOS Safari and desktop Safari/Firefox.** This breaks the brief's primary "Add Member" path for roughly half the target audience. **Mitigations are mandatory — see §29.11** |
| Import birthdays from calendar | No web calendar API exists | ❌ **Replaced by: `.ics` / `.vcf` file upload, CSV import, and "invite them to fill in their own details" links.** Designed as a first-class path, not a fallback |
| In-app purchase / store billing | **Stripe + Razorpay web checkout** | ✅ **Better** — no 15–30% store commission, full control of pricing, promos, and dunning. A genuine strategic advantage of the PWA route |
| Camera / mic capture | `getUserMedia` + `MediaRecorder`; `<input type="file" capture>` fallback | ✅ Full on Android; iOS Safari supports it with codec caveats (test HEVC/H.264 paths) |
| Background media upload | Service worker + Background Sync + resumable multipart (§12.1) | ⚠️ Backgrounding is less reliable than native, which is exactly why the **IndexedDB outbox is non-negotiable** — the memory is safe locally the instant it is recorded |
| Deep links / app links | Plain URLs; no association files needed | ✅ **Better** — every object is a shareable URL by nature |
| Offline mode | Service worker + IndexedDB (§9.4) | ✅ Full for reads and creates; sealing stays online-only by design |
| Share sheet integration | **Web Share + Web Share Target** | ✅ Full on Android; iOS supports outbound share, inbound share-target is limited |
| App icon badge | **Badging API** | ⚠️ Android/desktop; not iOS |

**Design consequence to accept up front:** the iPhone experience is very good but not identical — no haptics, no SMS auto-read, no contact picker, and push requires installation. The design must therefore make **installation feel like a reward rather than a nag**, and must make **manual member entry pleasant rather than punitive**, because on iOS it is the primary path.

---

### 29.1 Splash / App Shell Launch

**Layout:** full-bleed plum-to-coral gradient (`#4A2545` → `#FF6B5E`, 160°), centred logo animation (heart folding into an envelope, ~1.2s), tagline **"Every moment, delivered at the perfect time."** in Fraunces 20/28 at 90% opacity, app version bottom-centre in Micro at 40% opacity.

**Logic:** maximum 2s, then route to — Onboarding (first launch), Login (logged out), **App Lock** (biometric enabled), or Home. Offline: route straight to cached Home with the offline banner.

**PWA notes:** the manifest supplies `background_color: #4A2545` and the maskable icon so the OS-level launch is on-brand before any JavaScript runs; the animation plays in the shell. If the shell is already warm, **skip the animation entirely** — never delay a returning user for decoration. Respect `prefers-reduced-motion` with a static logo.

**States:** cold start (full animation) · warm start (skip) · offline (banner) · force-update required (§29.28) · maintenance (§29.28).

### 29.2 Onboarding Carousel + Personalization Quiz

**Carousel — 3 slides**, warm illustrations, `Skip` top-right, progress dots, swipe + `Next`:
1. "Capture memories in video, voice & photos"
2. "Schedule them to arrive at the perfect moment"
3. "Send gifts they'll never forget" *(Release 1 substitute until commerce ships: **"Seal them until the day that matters"** — do not advertise a shop that does not exist)*

**Quiz — 3 steps, chip selection, all skippable:**
- *Who matters most to you?* → Family · Friends · Partner · Everyone
- *Which occasions?* → Birthdays · Anniversaries · Festivals · Just because
- *Reminder style?* → Gentle · On-point · Minimal

Footnote: "You can change this anytime." The reminder-style answer maps directly to notification defaults (Gentle = weekly digest + 3-day reminders; On-point = day-of + 1-day; Minimal = day-of only) — the quiz must have **real, visible consequences**, or it is theatre.

**CTA:** `Create your free account` (primary) · `I already have an account` (text link).

**States:** loading illustrations (skeleton) · offline (proceeds; answers cached and synced) · resume mid-quiz after abandonment.

### 29.3 Sign Up

**Fields:** Full Name · Email · Mobile Number (country-code picker with flag, region auto-detected from locale/IP) · Password · Confirm Password · `[ ] I agree to Terms & Privacy` (links open in an in-app sheet, not a new tab).

**Social:** Continue with Google / Apple / Facebook, above a divider reading "or sign up with email".

**Validations:**
- Name ≥ 2 chars, letters, spaces, hyphens, apostrophes (must accept international names — no ASCII-only rule).
- Email: RFC-shaped + **async uniqueness** → "This email is already registered — *Log in instead?*" with an inline link.
- Phone: **E.164 per selected country** + async uniqueness.
- Password: ≥ 8 chars, 1 uppercase, 1 number, 1 symbol — **live strength meter** (Weak/Good/Strong, coloured bar) plus a checklist that ticks as each rule is met.
- Confirm: must match → "Passwords don't match".
- Unchecked T&C → primary disabled, with a tooltip on tap explaining why (never a silent dead button).

**States:** submitting (spinner replaces label, fields locked, double-submit prevented) · server error toast with retry · rate-limited → "Too many attempts, try again in 5 minutes" with a live countdown.

**PWA note:** offer **passkey creation immediately after signup** (§Part I M1) — one WebAuthn prompt now removes every future password problem. Frame it warmly: "Skip passwords forever?"

### 29.4 Dual Verification (Mobile OTP + Email)

**Step 1 of 2 — Mobile OTP:** six auto-advancing boxes, `autocomplete="one-time-code"`, paste supported, **WebOTP auto-fill on Android**, iOS keyboard autofill. 30s resend countdown → `Resend code`; `Change number` link. Error: boxes shake, red borders, "Incorrect code — 2 attempts left." Lockout after 5 failures (10 minutes, with a countdown).

**Step 2 of 2 — Email:** "We sent a link to r•••@gmail.com" with an animated envelope, `Open email app` button (mailto/webmail heuristic), `Resend` (60s cooldown), and **`I'll verify later`** — which grants limited access plus a persistent amber banner on Home: **"Verify email to unlock scheduling."** Scheduling specifically is gated because a capsule with an unverifiable owner is a delivery liability.

**Success:** full-screen confetti moment — "You're in! 🎉" — then route to the quiz or Home.

**States:** expired code · already-verified (idempotent, friendly) · wrong-number correction loop · offline (queue the verification attempt, explain clearly).

### 29.5 Login

Segmented control: **Email / Mobile**. Email + password, or mobile + OTP. `Forgot password?` link. Social login row. **Passkey / biometric quick-login** button (face icon) when a credential is registered on this device — this is the primary path for returning users.

**Validations:** empty-field inline errors · wrong credentials → deliberately non-specific "Email or password is incorrect" · 5 failures → CAPTCHA · deactivated account → "Your account is deactivated. Contact support" with a support link.

**Footer:** Terms · FAQ · Contact Us.

### 29.6 Forgot / Reset Password

Enter email or mobile → **always** show the same success state ("If an account exists, we've sent a reset link") to prevent account enumeration. Reset screen (from the emailed deep link): new password + confirm, same strength rules; invalid or expired token → "This link has expired — request a new one" with a one-tap re-request. Success → "Password updated" → login with the email pre-filled. Offer passkey creation here too, since the user has just proven email control.

### 29.7 Home Dashboard

**Header:** time-aware greeting ("Good evening, Riya 🌙") · notification bell with badge · search icon.

**Body, in priority order:**
1. **Up Next hero card** — nearest occasion: "Dad's birthday in 3 days", avatar, two CTAs `Create memory` / `Send gift` *(Release 1: `Create memory` / `Set a reminder`)*. Swipeable carousel when several occasions are near.
2. **Scheduled deliveries strip** — horizontal cards with status chips (`Scheduled 🕐` / `Processing` / `Delivered ✓✓` / `Opened 💙`) and a live countdown ("Delivers in 2d 4h").
3. **Memory prompts (AI)** — carousel: "Record a 30-sec 'thank you' for Mom", with a shuffle icon. *Release 1 ships a deterministic, template-driven version; §15 A10 upgrades it.*
4. **Recent memories** — 2-column masonry with a type badge (🎥 / 🎙️ / 🖼️) and a lock icon on time capsules.
5. **Broadcast shortcut** when a festival is ≤ 7 days away — "Diwali is coming — wish everyone at once ✨" *(Release 2)*.
6. **Verify-email banner** if applicable; **upload-queue tray** if items are pending.

**Empty state (new user):** warm illustration, "Your memory box is empty — let's create your first one", one large CTA, plus a secondary "Add the people who matter" link. Pull-to-refresh with a heart animation. Offline variant renders entirely from cache with a banner.

### 29.8 Notifications Centre

Grouped **Today / This Week / Earlier**. Distinct icons per type: delivery confirmations, reactions received ("Mom loved your video ❤️"), event reminders, nominee invites, order updates, system. Swipe to dismiss · `Mark all read` · deep links into content. Empty: sleeping-bell illustration. Gear icon → per-category toggles, per-channel matrix, and **quiet hours** time pickers.

**Non-suppressible categories** (security, billing, delivery failure) are shown with a lock icon and an explanatory line, rather than a toggle that appears broken.

### 29.9 Global Search

Searches memories, members, events, and gifts. Recent searches; trending gift searches *(R3)*. Results in tabs: **All / Memories / People / Events / Gifts**. Fuzzy matching with highlighted terms. Empty: "No matches for 'xyz' — try a person's name or an occasion." **Offline:** searches cached content only and says so explicitly in a chip above the results.

### 29.10 My Profile

Cover gradient + avatar (tap → camera / gallery / remove; circular crop; max 10MB; jpg/png/webp/heic). Name, email, phone with **verified badges**. Inline edit mode; changing email or phone re-triggers verification. Stats row: memories created · delivered · thoughtfulness streak 🔥.

**Sections:** Members · Nominees & Legacy Vault *(R3)* · Subscription (plan badge) · Privacy & Security · Notification preferences · Appearance (light/dark/system) · Language · Help & FAQ · Contact us · Log out.

**Privacy & Security** contains: WebAuthn app-lock toggle · vault PIN · default per-memory visibility · blocked users · **active share links with revoke** · **access log** · data export · **delete account** (double confirmation, typed `DELETE`, explicit 30-day grace explanation, and — critically — a list of pending capsules that deletion will cancel, with recipient names; §Part I 9.2 / 20.9).

### 29.11 Members (Family & Friends)

**List:** avatar, name, relationship chip (Mom, Best Friend…), next-occasion subtext ("Birthday · Mar 14 · in 22 days"). Sort by upcoming occasion / A–Z / recently added. Search bar. Grouped headers by relationship when the list exceeds ~20.

**Add Member — four paths, presented as equals rather than one primary and three fallbacks:**

1. **Import from contacts** — Contact Picker API. **Preceded by a permission primer**: "We only read names, numbers & birthdays. Nothing is uploaded until you choose who to add." Then a multi-select list with checkboxes and detected birthdays. **Only offered when `navigator.contacts` exists** — never render a button that will fail.
2. **Upload a file** — `.vcf` (vCard) or `.csv`, with a mapping preview and a per-row validation report ("38 ready · 2 need a birthday"). **This is the primary import path on iOS and desktop** and must be designed to feel first-class: drag-and-drop on desktop, file picker on mobile, sample template download.
3. **Add manually** — Name\*, relationship (chip picker + custom), photo, phone, email, birthday, anniversary, notes, **interests tags** (feeds gift AI), wishlist link. Optimised for speed: name + relationship + birthday is three taps and a date.
4. **Invite them to fill it in** — send a link; the recipient completes their own name, photo, birthday, and wishlist on a lightweight public page (`/m/[token]`) with no account required. **This is the highest-quality data path in the product** — self-reported details are accurate and self-maintaining — and it doubles as an acquisition loop. It exists *because* of the web contact-picker limitation, and it is genuinely better than what the native brief proposed.

**Validations:** name required · duplicate detection ("Looks like Priya is already added — merge?") with a side-by-side merge view · **at least one contact method required before delivery is possible** — without one, save is allowed but the member card shows a persistent amber "Add a phone or email so we can deliver memories" with a one-tap fix.

**Member Detail:** hero card · occasions list · shared memory timeline · wishlist tab *(R2/R3)* · quick actions `Create memory` / `Send gift` / broadcast-include toggle · edit · delete (confirm: "This won't delete memories you've made").

### 29.12 Occasions / Event Calendar

**Views toggle:** Month grid (dots coloured by type) · Year heat-view · Agenda list. `Today` button. Region-aware festival events shown by default, toggleable.

**Event chips:** birthday 🎂 · anniversary 💍 · festival ✨ · custom ⭐ · recurring indicator ↻.

**Add / Edit Event:** Title\* · linked member(s) · date\* · recurrence (yearly / monthly / one-time) · **reminder offsets** (multi-select: on the day, 1d, 3d, 1w before) · notes. Validation: a past one-time date warns "This date has passed — schedule for next year?" with a one-tap fix rather than a block.

**Event Detail (bottom sheet):** countdown ring · linked member · **planned-items checklist** (memory ✓, gift ✗) · CTAs `Create memory` / `Shop gift` / `Edit`.

Reminder pushes deep-link straight here. Empty month: "No occasions this month — add one or import your contacts."

**Note:** this screen group is the **most valuable addition the designer brief makes to Part I**. The event is what converts a passive archive into a product that prompts action, and it is the shared trigger for memories, broadcasts, and gifts.

### 29.13 Create Hub (centre FAB → bottom sheet)

Options grid, each with a one-line descriptor:
🎥 **Video memory** · 🎙️ **Voice memory** · 🖼️ **Photo memory** · 📦 **Time capsule** · 👥 **Collaborative memory** *(R2)* · 📣 **Broadcast** *(R2)* · 🎁 **Send a gift** *(R3)*.

**Drafts row** pinned at the bottom: "Continue: Dad's birthday video — 80% done". Items not yet released are **omitted**, not shown locked — except where they are genuinely a paywall (§29.26), which is a different and legitimate state.

### 29.14 Memory Creation — Capture & Compose

**Video:** camera with flip, flash, timer (3/10s), grid; max duration by plan (Free 60s / Premium 5 min) shown as a ring progress; or pick from gallery with multi-clip selection. Retake / confirm.

**Voice:** large record button with a live waveform, pause/resume, max 10 min, playback with trim handles.

**Photo:** multi-select up to 20, drag to reorder, per-photo duration for slideshow output.

**Shared editor:** timeline scrubber · trim · **captions** (text, font presets, colour, drag position, entrance animation: fade / slide / pop) · **music library** (licensed tracks, search by mood, volume-ducking slider) *(R2/R3 — see open question A-5 on licensing)* · voice-over overlay recording · warm filter presets · occasion stickers and frames · **AI assist** ("Write my caption" → 3 suggestions) *(R2)* · undo/redo.

**Auto-save draft every 5s** with an explicit cloud indicator: `saving…` / `saved ✓` / `offline — will sync`.

**Validations:** minimum 3s video / 1s audio · processing failure → "This clip couldn't be processed — try another format" with the detected format named · storage-quota warning with an upgrade CTA · per-plan duration ceiling enforced client- and server-side.

**PWA notes:** codec negotiation is required — `MediaRecorder` support differs between Chromium (VP9/WebM, Opus) and Safari (H.264/MP4, AAC); detect and select, and always keep the `<input capture>` fallback. **Write the recorded blob to IndexedDB before doing anything else** (§12.1 step 3): the memory must survive a crash, a reload, or a dead battery. Request a Screen Wake Lock while recording.

### 29.15 Memory Details & Scheduling

**The most important form in the product.**

**Fields:**
- **Title** — auto-defaulted ("For Mom's Birthday 💛"), editable
- **Recipients\*** — multi-select member chips + inline "add new member"
- **Occasion link** — optional dropdown of upcoming events
- **Delivery method priority** — In-app → WhatsApp → SMS → Email, **drag to reorder**; unavailable channels greyed with the reason stated ("No phone number for Ravi") and a one-tap fix *(R1 ships In-app + Email; R2 adds WhatsApp and SMS)*
- **Delivery date & time\*** — picker with minimum `now + 5 min`; **timezone selector defaulting to the recipient's timezone**, with a tooltip: "Delivers at 12:00 AM in Mumbai"
- **Deliver instantly** toggle
- **Personal note** — 500 chars with counter
- **Visibility** — Private / Recipients only / Family circle
- **Time-capsule lock** — toggle; unlock by **date** *or* **age milestone** ("when Aarav turns 18", computed from the member's birthday); shows a sealed-envelope preview animation

**Review card:** thumbnail · recipient avatars · channel icons · delivery datetime **in both the sender's and the recipient's timezone**.

**Primary CTA:** `Seal & Schedule ✉️` → sealing envelope animation (1.2s ceremonial) → success screen: "Scheduled! We'll deliver it Mar 14, 12:00 AM 🎉" with `View scheduled` / `Create another`.

**Validations:** ≥ 1 recipient · datetime strictly future · **recipient with no usable channel → block with a fix-it link** (the one place friction is correct) · plan limit reached → contextual paywall sheet naming the *specific* gate: **"You have 3 memories already waiting — Premium lets you schedule as many as you like"** (pending-capsule cap) or **"This one needs to wait until 2044. Free plans schedule up to a year ahead — Premium removes the limit"** (horizon cap). **Never a generic "limit reached", and never a count of memories created — there is no such limit** (§17.2) · **offline → sealing is blocked by design**, draft saved locally with an honest explanation that a promise cannot be confirmed without the server (§9.4).

### 29.16 Memory Manager — Scheduled & Delivered

**Tabs:** Scheduled · Delivered · Drafts · Received · Time Capsules.

- **Scheduled** — countdown, recipients, channels; `Edit` / `Reschedule` / `Cancel` (confirm: "This memory won't be delivered. Keep it as a draft?"). **Editing locks within 10 minutes of delivery** — "Too close to delivery to edit."
- **Delivered** — per-recipient status timeline (Sent → Delivered → Opened → Reacted) with timestamps; resend on failure with the reason shown and the fallback logged ("WhatsApp failed — sent via SMS instead ✓").
- **Drafts** — resume, with completion percentage.
- **Received** — memories others sent me. Unopened render as **glowing sealed-envelope cards** → tap → unwrap animation → full-screen player → reaction bar (❤️ 😂 😭 🥹 + voice reply + text thanks).
- **Time Capsules** — locked cards with countdown ("Opens in 4 years 32 days") and a sealed shimmer. **The owner can peek; recipients cannot** — enforced server-side, not merely hidden in the UI (§11.4).

### 29.17 Collaborative Memory *(Release 2)*

**Create:** occasion + honoree + deadline + max clip length; invite contributors (members, contacts, or a share link).

**Contributor view** — works from a link with **no account required**, via a lightweight web capture page (`/j/[token]`): prompt, record, submit. This is a natural strength of the PWA: the contributor needs no install and no signup, which is exactly why this loop can work at all.

**Organizer dashboard:** contribution tracker ("6/10 submitted") with avatars marked ✓/⏳ and a nudge button · reorder clips · auto-stitch preview with transitions and a title card · then flows into the standard scheduling screen (29.15). Deadline reminders sent automatically.

### 29.18 Broadcast Messages *(Release 2)*

Pick a festival/occasion template (themed cards: New Year, Diwali, Eid, Christmas, Lunar New Year…) or start custom. **Compose:** media/template + message with **merge tags** (`{{first_name}}`) and a **live per-recipient preview**. **Audience:** all members / groups / manual selection, with a recipient-count pill. Channel selection + schedule.

**Confirm screen:** "Send Diwali wishes to 34 people via WhatsApp on Oct 20, 8:00 AM." Free-tier rate-limit note. **Post-send report:** delivered/failed counts with a `Retry failed` action.

**Abuse guardrails (mandatory, and absent from the brief):** per-tier recipient caps, a per-day broadcast cap, quiet-hours enforcement in each recipient's timezone, one-tap recipient opt-out that persists across all future broadcasts from that sender, and no broadcasts to members who have never engaged. **Broadcast is the single most spam-capable feature in the product**, and WhatsApp Business template approval will enforce much of this regardless.

### 29.19–29.24 Gift Commerce *(Release 3 — design now, build in wave 3)*

**29.19 Gift Shop — Catalog.** Header search + cart icon with badge. Occasion shelves ("Birthday picks", "Anniversary classics") · **"From Mom's wishlist 💝"** personalised shelf · AI picks ("Because Dad loves gardening"). Filters bottom sheet: occasion, interest, price slider, **"Arrives before Mar 14"** delivery-by date (the critical filter in a gifting product), rating. Sort: popular / price / newest. Product cards: image, name, price, rating, "arrives by" chip, wishlist heart. Skeleton grid; empty-filter state with `Clear filters`.

**29.20 Product Detail.** Image gallery (swipe, pinch-zoom) · name · price with strike-through and % badge when discounted · rating and reviews · description accordion · variant pills (unavailable = crossed) · quantity stepper (max 10) · gift options: 🎀 gift wrap (+₹49), handwritten-style card message (200 chars, **live preview on a card mockup**), hide-price-in-package toggle · delivery estimate by recipient PIN code with async serviceability ("Arrives Mar 12–13 ✓ before the birthday") · CTAs `Add to cart` / `Buy now` · out-of-stock → `Notify me` · share · `Split with family` (group gifting).

**29.21 Cart & Wishlist.** Line items with thumbnail, variant, quantity stepper, remove with undo snackbar, per-item gift-note edit · price summary (items, wrap, delivery, taxes, promo) · promo field with async validation (✓ or "Invalid or expired code") · free-delivery progress bar ("₹200 away from free delivery") · empty state with `Browse gifts`. Wishlist: saved grid, move-to-cart, price-drop badge ("↓ 15% since saved").

**29.22 Checkout — 4-step stepper.**
- *Address* — recipient selector with **autofill from the member profile ✨**, or a new address form: Name\*, Phone\*, Line 1\*, Line 2, City\*, State\*, PIN\* with **async serviceability check** ("We deliver here ✓" / "Not serviceable yet"), address-type chips, save-to-member toggle.
- *Delivery* — date picker constrained to serviceable dates, slots (morning/evening), **"Deliver on the occasion" as the smart default**, surprise-mode toggle (no sender name on the package; reveal in-app).
- *Payment* — saved tokenised cards with CVV re-entry · new card (brand auto-detect + Luhn, expiry future-only, CVV 3–4) · **UPI** · wallets · PayPal · Razorpay · COD where eligible · PCI note and lock icon.
- *Review* — full summary with per-section edit links, T&C checkbox, `Place order ₹1,548`.

**States:** processing (full-screen secure animation) · success ("Order placed! 🎉" with order number, expected delivery, `Track order`) · failure ("Payment failed — **you have not been charged**" + retry / change method) · **3DS / UPI-intent redirect handling, which in a PWA must survive a full page navigation away and back** — persist checkout state server-side and resume by order id, never rely on in-memory state.

**29.23 Orders & Tracking.** Order list with status chips (Placed / Packed / Shipped / Out for delivery / Delivered / Cancelled / Refunded). Detail: vertical logistics timeline with timestamps and a live courier link · items · invoice PDF · payment summary · actions: cancel (only before "Packed", with the refund policy stated), return/refund request (reason picker + photos), help chat. Delivered gifts trigger a sender notification: "Your gift reached Mom 💝." Separate **payment history** screen: all transactions (subscriptions + orders), filter by type and date, receipt download.

**29.24 Group Gifting.** Initiate from a product: set contributors, split (equal / custom), deadline. **Shareable contribution page** (`/g/[token]`): progress ring ("₹2,400 of ₹3,000 collected"), contributor avatars, pay-your-share flow. **Auto-refund if the goal is missed by the deadline** — with the refund policy stated before the first rupee is collected. Organizer can nudge or close early.

### 29.25 Nominees & Legacy Vault *(Release 3 — legally gated)*

**Explainer intro** (sensitive, warm, unhurried): "Your memories, protected — choose people you trust to carry them forward."

**Nominees list** with status chips (Invited ⏳ / Accepted ✓ / Declined). **Add nominee:** from contacts or members, or by email invite; relationship; **permission scope** (Legacy vault only / Full memory archive). Invite email preview. Max 3 nominees (Premium: 5).

**Nominee acceptance flow** (recipient side, `/n/[token]`): a screen explaining the responsibility plainly, then Accept / Decline with confirmation.

**Legacy Vault:** PIN or WebAuthn gate; create "letters for later" (any media) bound to triggers — a specific date, account inactivity of X months, or nominee-initiated release with a waiting period.

**Unlock protocol — design every step with maximum clarity and a visible audit trail:**
```
nominee requests release
   → identity verification (document + liveness, third-party KYC)
   → owner notified immediately, on every subsequent step
   → 30-day waiting period with a visible countdown and one-tap cancellation by the owner
   → second nominee confirmation (if multiple nominees exist)
   → release, with a full immutable audit record shown to all parties
```

**This remains Release 3 for the reasons in §23.3:** it requires legal review per jurisdiction, identity verification, a dispute process, and human operations. **Shipping it half-built means either failing to transfer a vault or transferring one wrongly — both catastrophic.** Market the vision; build it properly.

### 29.26 Subscription & Paywall

**Plans screen:** Free / Premium / Family comparison table with feature ticks · monthly / annual toggle with an annual "Save 33%" badge · most-popular highlight · trust row (cancel anytime, secure payment). Regional pricing (₹ / $ / €) detected and switchable.

**Paywall bottom sheet (contextual, never an interstitial):** triggered at the moment of limitation, naming the specific locked capability, with mini plan cards and a single upgrade CTA. **The four legitimate triggers, in expected order of frequency:**
1. **Capsule horizon** — "This one needs to wait until 2044. Free plans schedule up to a year ahead." *(the primary conversion event — instrument it separately)*
2. **Pending-capsule cap** — "You have 3 memories already waiting."
3. **Storage** — "You're at 10 GB. Premium gives you 250 GB." Shown at 90%, never as a hard block mid-upload.
4. **Feature access** — age milestones, WhatsApp/SMS delivery, broadcasts, AI, heirs.

**Time capsules themselves are never a paywall trigger** — they are free, and gating the product's own differentiator would be gating our distribution (Appendix C-8). Equally, **there is no "memories created this month" trigger**: that limit does not exist (Appendix C-6).

**Manage subscription:** current plan · renewal date · payment method · invoices · upgrade/downgrade with a proration note · **cancel flow** (reason survey → one retention offer, e.g. "50% off next month?" → confirm) with a clear access-until date.

**PWA advantage:** billing is web checkout (Stripe / Razorpay), so there is no store commission, no store-review constraint on pricing copy, and full control of promotions, trials, and dunning. Plan changes take effect immediately rather than at a store's convenience.

### 29.27 Settings Sub-screens

Design each as its own screen: **Privacy & Security** (as 29.10) · **Notification preferences** (per-category × per-channel matrix + quiet-hours time pickers + digest mode) · **Language** selector · **Data export** ("We'll email a download link within 24 hours") · **Blocked users** · **About / licenses** · **Delete account** flow.

### 29.28 System States (design as one component sheet)

- **Offline banner** + **queued-actions tray** ("2 memories will upload when you're back online") with per-item retry
- Global error toasts · success toasts · undo snackbars
- **Force-update screen** (service-worker version mismatch) — "A new version is ready" with an explicit `Reload` button; **never auto-reload during an upload or a recording**
- **Maintenance screen** driven by the admin maintenance-mode toggle (§31.13)
- **Permission primers** — camera, microphone, contacts, notifications: a friendly explanation *before* the browser dialog, always with a "not now" that does not punish the user
- **App-lock screen** (WebAuthn) with a PIN fallback
- **Deep-link fallback** — expired, revoked, or not-yet-due tokens, each with humane, specific copy
- **Install card** — shown only after the first successful save; iOS variant with Add-to-Home-Screen instructions
- **Storage-persistence warning** when `StorageManager.persist()` is denied ("Your browser may clear unsent memories — connect to finish uploading")

---

## 30. MARKETING WEBSITE — SCREEN-BY-SCREEN

Desktop 1440px plus tablet and mobile variants. **SEO-first:** server-rendered, semantic H1–H3 order, alt text on every image, fast LCP hero (target < 2.0s on 4G), `schema.org` `SoftwareApplication` + `FAQPage` + `Product` markup, canonical URLs, OG/Twitter cards, sitemap, and hreflang once localisation ships.

**Note on the existing repository:** its landing page is the one part of the current codebase with genuine reusable value — the copy, the asset set, and the dark-mode token approach. What must go is the scroll hijacking (Lenis), the custom cursor, the WebGL fluid simulation, and the full-viewport GLSL shaders: together they cost several hundred KB and measurable battery for no user benefit, and they actively harm LCP, which is the one metric a marketing page is judged on. Keep the craft; drop the spectacle.

### 30.1 Landing Page (single scroll — design every section)

- **Nav** — sticky, translucent blur on scroll: logo · Features · How it Works · Gifts · Pricing · Blog · **`Install the app`**
- **Hero** — H1 **"Send love at the perfect moment."** Sub: "Record video, voice & photo memories today — we deliver them on birthdays, anniversaries, or years from now." Install CTA (+ store badges only once store shells exist) · phone mockup looping a memory being unwrapped · floating confetti particles **with a reduced-motion static alternative** · social proof strip ("Loved by 100k+ families ★ 4.8") — **only with real numbers** (Appendix B)
- **How it works** — 3 animated steps: Record → Schedule → We deliver, with multi-channel icons
- **Feature grid** — 6 cards with hover micro-animations: Time capsules · Collaborative videos · Gift shop · Legacy vault · Festival broadcasts · Smart reminders. **Cards for unreleased features must be labelled "Coming soon"** rather than implying availability
- **Emotional showcase** — full-bleed video/testimonial carousel with real quotes, photos, and star ratings
- **Gifts preview** — horizontally scrolling curated shelf + "Explore gifts in the app" *(R3)*
- **Pricing** — 3 tier cards mirroring the app exactly, with an 8-question FAQ accordion beneath. **This replaces the existing repo's two contradictory pricing tables** (Appendix B)
- **Blog teaser** — 3 latest posts with category chips
- **App download banner** — QR code on desktop, smart deep-link button on mobile, phone-number-to-SMS-link field with E.164 validation and a success state
- **Footer** — columns (Product · Company · Legal: Privacy / Terms / Refund policy · Social), newsletter signup with validation and success state, language selector, copyright

### 30.2 Blog Index & Article

**Index:** category filter chips · search · card grid with reading time · pagination. **Article:** hero image · TOC sidebar on desktop · share buttons · related posts · an in-article app CTA banner · author card · **no comments** (keeps the surface clean and removes a moderation burden). MDX-authored, statically rendered.

### 30.3 Support Pages

**FAQ** — searchable accordion grouped by category, CMS-driven. **Contact** — form: name\*, email\*, topic dropdown, message\* (20–1000 chars), optional file attachment; success state with a ticket ID. **This replaces the existing repository's inert `preventDefault()` form.** **Legal template** — CMS-driven pages with a "last updated" stamp: Terms, Privacy Policy, Refund Policy, DPA.

---

## 31. ADMIN WEB PANEL — SCREEN-BY-SCREEN

Desktop-first (1440px), 240px fixed left nav, top bar with global search, **environment badge** (Prod / Staging — in a loud colour, because acting on the wrong environment is a real incident), and an admin avatar menu.

**Data-dense but calm.** Tables: sticky headers, 10/25/50 rows per page, column sort, **CSV export on every table**, bulk actions, right-side detail drawers rather than full-page navigation where possible. **Role-based access** (Super Admin, Ops, Content, Support, Finance) with permission-locked states visibly disabled and tooltipped.

**Release 1 slice:** 31.1 Login · 31.2 Dashboard · 31.3 Users · 31.4 Memories & Moderation · 31.10 CMS · 31.12 Roles & Audit · 31.13 Settings & Health. The rest arrives with Releases 2 and 3.

### 31.1 Admin Login
Split layout: brand panel left, form right. Email/username + password with show/hide, `Forgot password` (secure link with an expiry state), **mandatory TOTP 2FA** (6-digit screen + backup codes). Lockout after 5 failures, CAPTCHA, session-expired redirect with an explanatory message. **Every login is audit-logged.** Served on a separate subdomain with independent rate limits (§20).

### 31.2 Dashboard
**KPI cards:** Total users (▲12% WoW with sparkline) · Active subscriptions · MRR / total revenue · Memories scheduled today · **Delivery success rate (24h)** · Orders in transit *(R3)*.
**Charts:** revenue over time (line, range picker) · signups vs activations (bar) · **delivery-channel breakdown (donut: in-app / WhatsApp / SMS / email)** · top gift categories *(R3)*.
**Live ops feed:** recent signups · **failed deliveries in red, click to retry** · refund requests *(R3)*.
**Alerts strip:** system-health chips — "Scheduler queue delayed 4 min", "Transcode backlog 240 items", "Capsule past unlock with no successful attempt" (the last is a **page-a-human** alert, per §18.4 item 6).

### 31.3 User Management
**Table:** avatar + name · email · phone · plan chip · status (Active / Deactivated / Suspended) · memories count · joined · last active. Filters: plan, status, verified, date range; search by name/email/ID. Bulk: export, notify.
**User detail:** profile · verification badges · subscription & payments tab · memories tab (counts and flags only) · members & nominees tab · devices/sessions with revoke · activity log.
**Actions:** activate/deactivate (**reason required**, confirmation modal) · reset-password email · **read-only impersonation view, heavily audited and time-boxed** · GDPR export / delete.
**Hard rule:** support roles see **no memory content**. Viewing content requires break-glass — a reason string, a second approver, an audit entry, **and a notification to the user** (§16.3).

### 31.4 Memories & Moderation
**Moderation queue:** flagged content cards with the auto-flag reason (nudity / violence / spam score), media preview, reporter info, **SLA timer per item**, actions: approve / remove / warn / escalate. Removed-content **appeals tab**. Policy quick-reference side panel so decisions are consistent.
**Delivery monitor:** all scheduled deliveries with status, channel, retry count; **failed tab with error reasons and manual retry/requeue**; timezone view.
**Boundary:** only *shared, reported, or auto-flagged* content enters this queue. **Private vault content is never proactively browsed** beyond legally required CSAM hash-matching on upload — and that boundary is enforced architecturally, not by policy alone (§16.2).

### 31.5 Events & Festivals Engine *(R2)*
Festival pack manager: create festival (name, regions, date rule — including lunar and movable feasts, theme asset upload, template set), publish/schedule toggle, **preview as user**. Broadcast template library CRUD with merge-tag validation.

### 31.6 Gift Catalog Management *(R3)*
**Product table:** image · SKU · name · category · price · stock · status (Live / Draft / Archived) · rating. **Bulk CSV import** with a validation report screen ("42 ok, 3 errors" + downloadable error file).
**Product editor:** multi-image upload with drag reorder (min 1, max 8, type/size validation) · name\* · category\* · rich-text description · price\* + compare-at · **variant matrix builder** (size × colour → auto-generated SKU rows with per-variant stock) · tags/interests (feeds the gift AI) · gift-wrap eligible toggle · serviceability zones · delivery SLA days · **preview-as-app panel**. Validations: price > 0, stock ≥ 0, at least one live image.
**Promotions:** offer builder (percent / flat / BOGO), code generator, usage limits, date range, applicable categories, auto-expiry, per-promo performance stats.

### 31.7 Orders & Logistics *(R3)*
**Table:** order # · user · recipient · items · total · payment status · fulfilment status · **promised date, red when at risk**. **Detail:** items · address · gift note with a privacy-masking toggle · **status timeline editor** (updating status triggers the user notification) · courier assignment and AWB entry · invoice regenerate · cancel/refund with reason codes. **Returns queue** tab.

### 31.8 Payments & Subscriptions *(R3 for orders, R1 for subscriptions)*
**Transactions:** ID · user · type (order / subscription) · gateway · amount · fee · status (Success / Failed / Refunded / Disputed) · date. Filters + **reconciliation export**. **Refund modal:** full/partial with amount ≤ captured validation, reason, confirm → status chip updates + user email triggered.
**Subscriptions:** plan distribution chart · table with next renewal · churn list · **dunning states with the retry schedule** · manual comp/extend (audit-logged). **Plan editor:** regional price points, feature-flag matrix.

### 31.9 Broadcasts & Notification Console *(R2)*
Composer: **audience segment builder** (plan, region, activity) · title/body with emoji and a **device-mockup preview (iOS/Android)** · schedule · A/B variant option. History with open rates. **Guardrails:** quiet-hours warning, and a typed confirmation for sends above 10,000 users.

### 31.10 Content Pages (CMS)
Page list — Privacy Policy, Terms, About, FAQs, Refund Policy — each with status (Published / Draft) and last-edited-by/at. **Editor:** rich text with headings, links, tables · **revision history with a diff view and restore** · preview app/web toggle · publish confirmation ("Changes go live immediately on app & website"). **FAQ manager:** category → Q/A CRUD with drag ordering.

### 31.11 Analytics *(R2)*
Retention cohort heatmap · **funnel: signup → first memory → first delivery → first purchase** · delivery success by channel over time · revenue breakdown · top occasions calendar heatmap · NPS and reaction sentiment. Date-range and segment filters everywhere; export on every view.
**Add to the brief's list** (from §16.2): storage cost per paying user, and AI cost per active user — the two ratios that determine whether the pricing model survives.

### 31.12 Admin Roles & Audit Log
**Admins table:** role chips · 2FA status · last login · invite admin (email + role). **Role permission matrix editor:** module × view/edit/delete checkboxes. **Audit log:** filterable stream of every admin action (who / what / when / before → after values), append-only and tamper-evident, exportable. This is the screen that makes break-glass access accountable rather than merely logged.

### 31.13 Settings & System Health
**Integrations** with connection-status chips and test buttons: WhatsApp Business API, Twilio, Resend/SendGrid, Stripe, Razorpay, PayPal, courier APIs, Anthropic/AI provider, storage. **Health:** scheduler queue depth and lag · media pipeline backlog · **oldest pending capsule** · error rates. **Feature flags** with rollout percentages and per-AI-feature kill switches. **Maintenance-mode toggle** with an editable app-facing message.

---
## 32. END-TO-END USER FLOWS (design as flow diagrams)

Eight flows to be drawn in the design file, each with happy path, error branches, and every empty/failure state named.

**32.1 First-time user**
```
Splash → Onboarding carousel → Personalization quiz → Sign up → Mobile OTP → Email verify
  → Home (empty state) → Add members (contacts / file / manual / invite-link)
  → Memory prompt → Create (capture → compose) → Schedule → Seal → Success
  → [D+X] Delivery fires → Recipient opens → Reaction received → Sender notified
```
Branches: skip quiz · "verify later" (limited access, scheduling gated) · permission denied on camera → upload path · offline at signup (blocked, explained) · abandoned draft → resume prompt on next launch.

**32.2 Memory delivery lifecycle**
```
Create → auto-save draft (5s) → Schedule (transactional: capsule sealed + job row, one commit)
  → Scheduler tick (minute granularity, timezone-aware, humane window 09:00–20:00 local)
  → Channel cascade: in-app push → email → SMS → WhatsApp → notify sender to intervene
  → Receipt states: Sent → Delivered → Opened → Reacted
  → Reaction loop → "your memory made them smile" notification to sender
```
Branches: all channels fail → sender alerted with a fix-it action · recipient contact stale → pre-delivery nudge at T-18 months · owner cancels before delivery · watchdog fires on a missed unlock (pages a human).

**32.3 Gift purchase** *(R3)*
```
Occasion reminder push → Member detail → wishlist → PDP → delivery-date serviceability check
  → Cart → Checkout (address → delivery → payment → review) → 3DS/UPI redirect → return & resume
  → Success | Failure → Tracking → Delivered → "Your gift reached Mom 💝"
```
Branches: not serviceable · out of stock at checkout · payment failed (not charged) · promised date at risk → proactive apology + options · cancellation before Packed · return request.

**32.4 Broadcast** *(R2)*
```
Festival detected (region-aware) → template pick → personalize with merge tags → live preview
  → audience select (count pill) → channel + schedule → confirm → send
  → report (delivered / failed) → retry failed
```
Branches: quiet-hours conflict → auto-shift with notice · tier cap reached → paywall · recipient opted out → excluded and shown as such · WhatsApp template not approved → fallback to SMS/email.

**32.5 Nominee & legacy vault** *(R3)*
```
Add nominee → invite email → accept | decline → vault created (PIN/WebAuthn)
  → letters bound to triggers (date | inactivity | nominee-initiated)
  → [trigger] nominee requests release → identity verification (KYC)
  → owner notified at every step → 30-day waiting period (owner can cancel any time)
  → second-nominee confirmation → release + immutable audit record shown to all parties
```
Branches: owner cancels · verification fails · nominee declines at request time · owner reactivates account during the waiting period (auto-cancel) · disputed claim → human adjudication.

**32.6 Collaborative memory** *(R2)*
```
Create project (occasion, honoree, deadline, clip length) → invite via link
  → contributor web capture (NO account, no install) → submit
  → organizer tracker (6/10, nudge) → reorder → auto-stitch preview
  → standard scheduling → deliver
```
Branches: deadline passes with partial submissions → stitch what exists, with confirmation · contributor clip fails processing → re-record prompt · organizer removes a clip.

**32.7 Subscription**
```
Hit free limit → contextual paywall (names the locked feature) → plan compare
  → web checkout (Stripe / Razorpay) → unlock immediately
  → renewal | dunning (retry schedule + emails) | cancel (survey → retention offer → confirm)
```
Branches: payment method expired · regional price switch · downgrade with over-quota storage → read-only grace period with a clear resolution path (**never delete a user's memories for non-payment** — this must be a written policy, not an implementation accident).

**32.8 Admin moderation**
```
Auto-flag (or user report) → queue with SLA timer → reviewer opens media
  → action: approve | remove | warn | suspend → user notified with reason
  → appeal → second reviewer → resolution
All steps audit-logged; break-glass content access notifies the content owner.
```

---

## 33. VALIDATION & MICRO-INTERACTION MASTER RULES (global, binding)

Adopted from the designer brief in full, with additions marked **[+]**.

1. **Validate on blur**; re-validate on change **only after the first error**. Never validate on the first keystroke.
2. **Error copy = what is wrong + how to fix it.** "PIN code must be 6 digits", not "Invalid input". Red border + icon + 13px helper text. Field shake **only on a submit attempt**, never on blur.
3. **Primary buttons** disabled until the form is valid; spinner replaces the label while submitting; double-submit prevented at the handler level, not just visually.
4. **Async checks** (email/phone uniqueness, promo codes, PIN-code serviceability) show an inline spinner, then ✓ or ✕ with a reason.
5. **All destructive actions** require a confirmation modal stating the consequence; irreversible ones require typed confirmation (`DELETE`).
6. **Date & time:** never allow past scheduling; **always show the recipient's timezone alongside the sender's**; 12/24-hour per locale; DST-safe (store UTC + intended timezone, never a naive local string).
7. **Uploads:** progress bars with pause and cancel; type and size limits stated **before** selection; graceful retry on network drop; **the local copy is written first so nothing is ever lost [+]**.
8. **Delight sparingly.** Confetti only for: account creation, first memory, delivery confirmation, capsule unwrap. Everywhere else, a quiet success state.
9. **Every list** has: skeleton loading, empty state (illustration + CTA), error state (retry), and an end-of-list marker.
10. **Haptics:** light tick on toggles, success buzz on scheduling, **none on errors** (visual only). **[+] Android/Chromium only — must be purely additive, never the sole signal (§29.0).**
11. **Copy tone:** warm, human, second person; emoji sparing and purposeful; no jargon. **[+] Never call a memory a "file", "asset", or "record" in user-facing copy.**
12. **[+] Every state is designed in both light and dark**, and checked at 4.5:1 contrast. Coral `#FF6B5E` is never used for small text on white.
13. **[+] Every animation has a `prefers-reduced-motion` variant**, including confetti, the sealing envelope, and the unwrap reveal.
14. **[+] Offline is a first-class state, not an error.** Every screen declares what works offline; queued actions are visible and retryable; sealing is the one deliberate block, with an honest explanation.
15. **[+] Never auto-reload the app.** A service-worker update prompts; it does not interrupt a recording or an upload.
16. **[+] Optimistic UI everywhere it is safe** (favourites, edits, reactions) and **nowhere it is not** (sealing, payment, deletion, release of a legacy vault).
17. **[+] Focus management:** opening a sheet moves focus into it and traps it; closing returns focus to the trigger. Route changes announce the new page title to screen readers.

---

## 34. EXTENDED DATA MODEL (additions to §10)

New and revised entities required by Part II. Release markers: `[R1]` `[R2]` `[R3]`.

### 34.1 `Member` — revises Part I's `Person` `[R1]`
The designer's Member is richer than Part I's Person and replaces it.
- **Fields:** `id`, `owner_id`, `name`, `relationship` (enum + custom string), `avatar_media_id`, `phone`, `phone_verified_at`, `email`, `email_verified_at`, `birthday`, `birthday_precision`, `anniversary`, `notes`, `interests` (text[] — feeds gift AI), `wishlist_url`, `linked_user_id` (nullable), `self_service_token_hash` (for the invite-them-to-fill-it-in flow), `deceased_at`, `merged_into_id`, `created_at`
- **Ownership:** `owner_id`. Private to the owner; never discoverable by other users.
- **Constraint:** delivery requires at least one verified contact method — enforced at seal time, surfaced as a warning before then.

### 34.2 `Event` + `EventReminder` `[R1]` — the key structural addition
- **`Event`:** `id`, `owner_id`, `title`, `type` (`birthday` | `anniversary` | `festival` | `custom`), `date`, `recurrence` (`none` | `yearly` | `monthly`), `all_day`, `notes`, `festival_id` (nullable, when derived from a pack), `created_at`, `archived_at`
- **`EventMember`:** `event_id`, `member_id` (many-to-many — an anniversary has two people)
- **`EventReminder`:** `id`, `event_id`, `offset_days` (0, 1, 3, 7), `channels`, `last_fired_for_year`
- **Why it matters:** the Event is the trigger for memory prompts, capsule scheduling, broadcasts, and gift suggestions. **Retrofitting it after those features exist is a migration, not a feature** (§27.4).
- **Note:** derived occurrences are computed, not stored — a yearly event does not create 50 rows. `last_fired_for_year` prevents duplicate reminders.

### 34.3 `Festival` + `FestivalPack` + `Template` `[R2]`
- **`Festival`:** `id`, `name`, `regions` (text[]), `date_rule` (jsonb — fixed, lunar, or nth-weekday), `theme_assets`, `is_published`
- **`Template`:** `id`, `festival_id` (nullable), `occasion`, `kind` (`broadcast` | `card` | `video_frame` | `sticker_pack`), `assets`, `merge_fields`, `tier_required`, `is_published`
- Lunar and movable-feast date rules are why this is a rule engine rather than a date column.

### 34.4 `Broadcast` + `BroadcastRecipient` `[R2]`
- **`Broadcast`:** `id`, `owner_id`, `template_id`, `body`, `media_asset_id`, `audience_spec` (jsonb), `recipient_count`, `channels`, `scheduled_at`, `state`, `sent_at`
- **`BroadcastRecipient`:** `broadcast_id`, `member_id`, `resolved_body` (merge tags applied), `channel_used`, `status`, `provider_message_id`, `error_code`, `opted_out`
- **`BroadcastOptOut`:** `sender_id`, `member_id`, `created_at` — a persistent opt-out that survives every future broadcast. **Mandatory, and missing from the brief.**

### 34.5 `CollabProject` + `Contribution` `[R2]`
- **`CollabProject`:** `id`, `owner_id`, `honoree_member_id`, `occasion_event_id`, `deadline_at`, `max_clip_seconds`, `state`, `stitched_media_id`, `capsule_id` (once scheduled)
- **`Contribution`:** `id`, `project_id`, `contributor_name`, `contributor_email`, `invite_token_hash`, `media_asset_id`, `sort_order`, `submitted_at`, `state`
- Contributors are **not users** — the token is the identity, which is what makes the no-signup web capture possible.

### 34.6 `Reaction` — extends Part I's `CapsuleReply` `[R1]`
- **Fields:** `id`, `capsule_id` (or `memory_id`), `recipient_id`, `kind` (`emoji` | `voice` | `text`), `emoji`, `body`, `media_asset_id`, `created_at`
- Triggers the sender notification ("Mom loved your video ❤️") and is copied into the sender's vault as a memory.

### 34.7 Gamification & growth `[R2]`
- **`Streak`:** `user_id`, `current_weeks`, `longest_weeks`, `last_qualifying_at`, `thoughtfulness_score`
- **`Badge`** / **`UserBadge`:** slug, name, criteria (jsonb), earned_at
- **`Referral`:** `id`, `referrer_id`, `code`, `invitee_email`, `state`, `reward_granted_at`
- **Design constraint:** streaks must never punish. No loss aversion, no "you broke your streak" shaming, and a single opt-out switch that hides all of it.

### 34.8 Wishlists `[R2 as links, R3 as catalog-linked]`
- **`Wishlist`:** `id`, `member_id`, `owner_id`, `name`, `is_self_managed`
- **`WishlistItem`:** `id`, `wishlist_id`, `product_id` (nullable), `external_url`, `title`, `image_url`, `price_snapshot`, `priority`, `claimed_by` (nullable — prevents duplicate gifts), `claimed_at`

### 34.9 Commerce `[R3]`
- **`Category`:** `id`, `name`, `parent_id`, `slug`, `occasions` (text[])
- **`Product`:** `id`, `sku`, `name`, `category_id`, `description`, `price`, `compare_at_price`, `currency`, `status`, `interests` (text[]), `gift_wrap_eligible`, `delivery_sla_days`, `rating_avg`, `rating_count`
- **`ProductVariant`:** `id`, `product_id`, `options` (jsonb: size/colour), `sku`, `price_delta`, `stock_qty`, `is_active`
- **`ProductImage`:** `id`, `product_id`, `media_key`, `sort_order`
- **`ServiceabilityZone`:** `id`, `pincode_pattern`, `region`, `sla_days`, `cod_eligible`
- **`Cart`** / **`CartItem`:** with `gift_wrap`, `card_message`, `hide_price`
- **`Address`:** `id`, `owner_id`, `member_id` (nullable), `name`, `phone`, `line1`, `line2`, `city`, `state`, `pincode`, `type`, `is_default`
- **`Order`:** `id`, `user_id`, `recipient_member_id`, `address_id`, `subtotal`, `wrap_fee`, `delivery_fee`, `tax`, `discount`, `total`, `currency`, `payment_status`, `fulfilment_status`, `promised_date`, `surprise_mode`, `placed_at`
- **`OrderItem`** · **`Shipment`** (`courier`, `awb`, `tracking_url`, `events` jsonb) · **`Return`** (`reason`, `photos`, `state`, `refund_amount`)
- **`Promotion`** / **`PromoRedemption`:** code, type (`percent` | `flat` | `bogo`), value, limits, date range, applicable categories
- **`GroupGift`** / **`GroupGiftContribution`:** target amount, deadline, split mode, collected amount, per-contributor payment status, **auto-refund state**
- **`Payment`:** `id`, `user_id`, `subject_type` (`order` | `subscription` | `group_gift`), `subject_id`, `gateway`, `gateway_ref`, `amount`, `fee`, `status`, `raw_payload`

### 34.10 Legacy `[R3]` — extends §10's `LegacyPlan`/`Heir`
- **`Nominee`:** `id`, `owner_id`, `member_id`, `email`, `scope` (`vault_only` | `full_archive`), `invite_token_hash`, `state` (`invited` | `accepted` | `declined` | `revoked`), `accepted_at`
- **`LegacyVaultItem`:** `id`, `owner_id`, `memory_id`, `trigger_kind` (`date` | `inactivity` | `nominee_request`), `trigger_spec` (jsonb), `state`
- **`UnlockRequest`:** `id`, `vault_item_id`, `requested_by_nominee_id`, `kyc_provider_ref`, `kyc_state`, `waiting_period_ends_at`, `owner_notified_at[]`, `second_nominee_confirmed_at`, `state`, `released_at`, `cancelled_by_owner_at`
- Every state transition writes to `AuditLog` and is rendered to all parties as a visible trail.

### 34.11 Trust & safety `[R1]`
- **`Report`:** `id`, `reporter_id`, `subject_type`, `subject_id`, `reason`, `details`, `state`, `created_at`
- **`ModerationFlag`:** `id`, `subject_type`, `subject_id`, `source` (`auto` | `report`), `signal` (jsonb: nudity/violence/spam scores), `severity`, `sla_due_at`, `state`, `reviewed_by`, `action_taken`, `appeal_state`
- **`Block`:** `blocker_id`, `blocked_user_id` / `blocked_member_id`, `created_at`

### 34.12 Admin `[R1]`
- **`AdminUser`:** `id`, `email`, `role`, `totp_secret_enc`, `backup_codes_enc`, `last_login_at`, `is_active`
- **`Role`** / **`Permission`:** module × action matrix, editable in-app
- **`BreakGlassAccess`:** `id`, `admin_id`, `target_user_id`, `reason`, `approved_by`, `expires_at`, `user_notified_at`
- **`FeatureFlag`:** `key`, `rollout_pct`, `segment_spec`, `is_kill_switch`

### 34.13 Entity count summary

| Release | New entities | Running total |
|---|---|---|
| §10 MVP (Part I) | 18 | 18 |
| R1 additions (Member revision, Event, EventReminder, EventMember, Reaction, Report, ModerationFlag, Block, AdminUser, Role, BreakGlassAccess, FeatureFlag) | +11 | ~29 |
| R2 additions (Festival, Template, Broadcast, BroadcastRecipient, BroadcastOptOut, CollabProject, Contribution, Streak, Badge, UserBadge, Referral, Wishlist, WishlistItem) | +13 | ~42 |
| R3 additions (commerce ×16, legacy ×3) | +19 | **~61** |

The jump from 42 to 61 entities at Release 3 is the clearest quantitative argument for staging commerce separately (§27.3): it is roughly a third of the entire data model, serving a business the product has not yet validated.

---

## 35. EXTENDED TECHNICAL ARCHITECTURE (reconciled with §18)

The designer brief's Part 2 proposes native clients and a microservice backend. Reconciled for a PWA and for a small team:

### 35.1 Clients — reconciled
| Brief | Reconciled |
|---|---|
| iOS (Swift/SwiftUI) + Android (Kotlin/Compose) | **One installable PWA** (Next.js 16 App Router, React 19, TS). Optional store shells later (§7.3 F10) |
| Marketing website (Next.js, SSR for SEO) | **Adopted as specified** — same repo, separate route group, so the app bundle never ships to marketing visitors |
| Admin panel (React SPA) | **Same Next.js app, `/admin` route group**, separate subdomain, own auth realm. A separate SPA would duplicate the schema, the auth, and the design system for no benefit at this team size |

### 35.2 Backend — reconciled
The brief lists eleven services (Auth, User & Members, Events, Memory, Scheduler, Notification, Commerce, Subscription, AI, Moderation, plus an API gateway). Those are the right **domain boundaries** and the wrong **deployment topology** for a pre-launch team.

**Recommendation: a modular monolith plus two independent workers.**
- **`apps/web`** — Next.js server actions and route handlers, organised by the brief's exact domain boundaries as internal modules (`features/*`, `lib/*`), each with its own schema slice and no cross-module database access. This preserves the option to extract any module into a service later without a rewrite.
- **`apps/workers`** — containerised, separately deployable, because these must keep running when a web deploy is rolling or rolled back:
  - **the Scheduler / delivery engine** (§18.4) — the most critical process in the company
  - **the media pipeline** (FFmpeg/sharp transcode, thumbnails, waveforms)
  - AI jobs, recap rendering, integrity sweeps, purges, export assembly `[R2+]`
- **Extract to a real service only when a measurable boundary demands it** — most likely commerce (different scaling, different compliance, possibly a different team) at Release 3.

### 35.3 Data layer — reconciled
| Brief | Reconciled |
|---|---|
| PostgreSQL (core) | **Adopted** (Neon + Drizzle) |
| Redis (sessions/queues) | **Deferred.** Sessions are server-side rows; the queue is the `ScheduledJob` table. Add Redis for rate limiting and caching when load justifies it — not before |
| S3-compatible object storage + CDN | **Adopted as Cloudflare R2 + Cloudflare CDN** — zero egress is decisive for re-watched 4K video (§18.1) |
| Elasticsearch (search) | **Rejected for now.** Postgres FTS → + pgvector hybrid (§13.3). Per-user corpora are thousands of documents, not millions. Product catalog search at R3 may justify revisiting |
| Analytics warehouse | **PostHog first**, warehouse when the questions outgrow it |

### 35.4 Integrations
Auth (Better Auth: OTP, passkeys, OAuth2 Google/Apple/Facebook) · Push (**Web Push VAPID**, not APNs/FCM) · Email (Resend primary, **SES standing fallback**) · **WhatsApp Business API** and SMS (Twilio) `[R2]` · Payments (**Stripe + Razorpay**, PayPal optional — web checkout, no store billing) · AI (Claude for captions, scripts, and curation copy; Whisper-class ASR; embeddings into pgvector) `[R2]` · Moderation (CSAM hash-matching on upload from day one; classifier scores for the flag queue) · Courier APIs `[R3]` · KYC provider for legacy unlock `[R3]`.

### 35.5 Cross-cutting (adopted from the brief, extended)
Optional end-to-end encryption for the private vault (**V2/R3 opt-in tier only — it precludes thumbnails, transcoding, search, and AI**, §18.2) · media encryption at rest · rate limiting at edge and application (§20.6) · **audit logs on all admin actions** · GDPR/CCPA export and delete flows · **99.9% delivery SLA designed with retry ladder and dead-letter queue** — plus, from Part I, the **watchdog that pages a human on any capsule past its unlock time** (§18.4), which is what turns an SLA claim into an operational fact.

### 35.6 Architecture diagram poster — three flows to draw
1. **Memory lifecycle:** create → local IndexedDB write → presigned multipart upload → transcode → schedule (transactional) → scheduler tick → channel cascade → receipt tracking → reaction loop.
2. **Gift order:** cart → payment (with 3DS/UPI redirect and resume) → fulfilment → courier → tracking → delivered notification → returns.
3. **Legacy vault unlock:** nominee request → KYC verification → owner notification loop → 30-day waiting period → second-nominee confirmation → release → audit trail.

---

## 36. DESIGN DELIVERABLES CHECKLIST

- ☐ **Design tokens page** — colours (light + dark), type scale, spacing, radii, shadows, motion specs, status-chip semantics
- ☐ **Component library** — buttons ×5 states · inputs ×6 states · chips · cards · sheets · modals · toasts · tab bar · sidebar · tables · steppers · avatars · status chips · progress (bar/ring/upload) · countdown · paywall sheet · permission primer · empty/error/loading templates
- ☐ **~85 app screens** covering §29.1–29.28, **each in default, loading, empty, error, and success states, in light and dark** (≈ 400+ frames in total — plan the file structure accordingly)
- ☐ **Marketing site** — desktop 1440 + tablet + mobile (§30)
- ☐ **~30 admin screens** (§31), including permission-locked states
- ☐ **8 user-flow diagrams** (§32)
- ☐ **Architecture diagram poster** (§35.6)
- ☐ **Interactive prototypes** — (a) onboarding → first memory sealed, (b) gift checkout, (c) admin moderation
- ☐ **Accessibility annotation layer** — focus order, ARIA labels, contrast checks, reduced-motion variants, touch-target overlay
- ☐ **[+] PWA-specific frames** — install card (Android + iOS variants), offline banner and queued-actions tray, service-worker update prompt, app-lock (WebAuthn), permission primers, storage-persistence warning
- ☐ **[+] Release annotation** — every frame tagged `R1` / `R2` / `R3` so engineering can build in waves against one file
- ☐ **[+] Content rules sheet** — real-feel content only: Indian and global names, realistic dates, genuine emotional copy, actual product names. **Never lorem ipsum.** Include the "never call a memory a file" copy rule (§33.11)

---

## APPENDIX C — CONFLICT REGISTER & RESOLUTIONS

Where Part I and the designer brief disagree, and how each is settled.

| # | Conflict | Resolution |
|---|---|---|
| **C-1** | **Brand palette.** Existing repo: `#FF7C0A` orange, single-token theme. Designer: coral `#FF6B5E` + plum `#4A2545` + gold `#F4C95D`. | **Designer's palette adopted** (§26.3). It is a full system rather than one accent, it carries the emotional register the product needs, and the plum/gold pairing gives the celebration and premium states the orange lacked. Resolves open question **A-8**. |
| **C-2** | **Platform.** Designer specifies native iOS + Android + web + admin SPA. User direction: **this is a PWA.** | **One installable PWA** across all surfaces (§35.1). Full capability mapping and the two genuine gaps in §29.0. Store shells remain optional (§7.3 F10). |
| **C-3** | **Typography.** Part I carried Instrument Serif / Inter / Caveat. Designer: Fraunces or Recoleta + Inter/SF Pro. | **Fraunces + Inter** (§26.4), with Instrument Serif as the fallback. Caveat (the handwriting face) is retained **only** for card-message previews and signature moments, where handwriting is literal rather than decorative. |
| **C-4** | **Bottom navigation.** Part I: `Today · Timeline · + · Search · You`. Designer: `Home · Occasions · + · Gifts · Profile`. | **Staged hybrid** (§28.1): R1 = `Home · Occasions · + · Timeline · Me`; R3 swaps Timeline for Gifts once commerce exists. Search moves to the top bar — it is a verb, not a place. |
| **C-5** | **Scope.** Part I: 17 MVP features, ~24 weeks. Designer: ~115 screens including a full commerce business. | **Design everything now, build in three releases** (§27.2–27.3). R1 ≈ 24–28 weeks, R2 ≈ 12–16, R3 ≈ 16–20. |
| **C-6** | **Free-tier limit metric.** Existing repo home page: 5 uploads/month. Existing pricing page: 5GB. Part I recommended 10GB storage-based. Designer: 5 memories/month + 720p. | **DECIDED: storage-based (10 GB), unlimited memories created, and no quality tiering.** Rationale in §17.2 items 1–2: a 10 GB free tier costs ~$0.15/month at full use with zero egress, so an upload counter saves nothing while suppressing the product's core behaviour; a counter is a *recurring* monthly wall that teaches restraint, whereas a storage cap is hit once, late, when upgrading already feels rational; and archive density is what makes On This Day, recaps, and semantic search valuable — capping it caps our own retention. **The designer's 720p free cap is overridden**: "originals, never compressed" is a stronger brand asset than a quality gate, and 10 GB already limits 4K to ~20 minutes naturally. **Rejected alternatives:** 5 uploads/month (recurring wall, no cost saving); 5 GB (too tight to form attachment); both caps generously (two walls to explain, no extra revenue); unlimited free storage (storage *is* the cost base). |
| **C-7** | **Tier names and prices.** Part I: Free / Keeper $8 / Legacy $16. Designer: Free / Premium / Family. | **Designer's names adopted** (clearer, and Family is the right high tier for a household product). Prices become region-aware: **Free · Premium ₹399/mo or ₹3,199/yr (≈$8/$72) · Family ₹749/mo or ₹5,999/yr (≈$15/$120, 6 seats, pooled 2 TB)**. Retains Part I's reasoning: annual discounted ~25–33%, **"unlimited" retired** (§17.2, Appendix B). |
| **C-8** | **Capsules free or paid?** Existing repo gates time capsules behind Premium. Part I argued free-but-limited (3 active). Designer lists them as Premium. | **DECIDED: free, and the paid gate is HORIZON rather than count.** Free = **3 pending capsules at a time** (delivered ones never counted) with a **12-month scheduling horizon**; Premium = unlimited pending, unlimited horizon, plus age milestones. This is a deliberate sharpening of Part I's "3 active" recommendation, for four reasons (§17.2 item 3): (a) a *lifetime* cap of 3 kills the viral loop after three events, whereas counting only pending capsules lets a free user run seal → deliver → open → reply → recipient-seals-their-own forever — **every delivered capsule is distribution we did not pay for**; (b) **horizon is the real cost driver** — a 20-year capsule is a 20-year liability in storage, scheduling, contact-freshness ops, and backup, while next month's costs nothing, so charging for horizon is charging for what genuinely costs us and is defensible out loud; (c) the upgrade prompt becomes emotional rather than punitive — *"this one needs to wait until 2044"* converts at peak intent, where "3 of 3 used" is just a wall; (d) three concurrent is still a genuine family constraint (Mum, Dad, both kids) so it converts without teaching restraint. **Paired non-negotiable:** a sealed capsule is **never cancelled for non-payment** — if Premium lapses, existing long-horizon capsules are still delivered; only *new* ones require an active subscription. Written into the Terms alongside C-18. |
| **C-9** | **Contact import.** Designer makes "Import from contacts" the primary Add-Member path. | **Not universally possible on the web** (Contact Picker API is Chromium/Android only). Redesigned as **four co-equal paths** including vCard/CSV upload and an invite-them-to-fill-it-in link (§29.11). The invite path is arguably *better* than the native original — self-reported data is accurate, self-maintaining, and doubles as acquisition. |
| **C-10** | **Haptics and SMS auto-read** specified as standard interactions. | **Android/Chromium only.** Both are additive; every state they reinforce must also be visual (§29.0, §33.10). |
| **C-11** | **Store billing** assumed for subscriptions. | **Web checkout instead** — a genuine advantage: no 15–30% commission, full pricing and promotion control, immediate plan changes (§29.26). |
| **C-12** | **Microservice backend** (11 services + gateway). | **Modular monolith + two independent workers** (§35.2), organised along the brief's exact domain boundaries so extraction stays cheap. The delivery engine and media pipeline are separately deployable from day one because they must survive a bad web deploy. |
| **C-13** | **Redis and Elasticsearch** listed as core infrastructure. | **Both deferred** (§35.3). Sessions are rows; the queue is a table; search is Postgres FTS + pgvector. Add when load or catalog search demands it — not as launch complexity. |
| **C-14** | **Legacy Vault** presented as a designable, shippable feature set. | **Design fully, ship at R3 only** (§29.25, §23.3). It requires per-jurisdiction legal review, KYC, a dispute process, and human operations. Resolves nothing of **A-4**, which remains open and blocking for R3. |
| **C-15** | **"Loved by 100k+ families ★ 4.8"** and the existing repo's "12,450" figures. | **Do not ship unverified numbers** (Appendix B). Use real figures or none. Fabricated social proof on a trust product is the worst possible place to be caught. |
| **C-16** | **Broadcast** has no abuse controls in the brief. | **Guardrails added and mandatory** (§29.18, §34.4): per-tier caps, per-day limits, timezone-aware quiet hours, and a persistent per-sender recipient opt-out. WhatsApp template approval will enforce much of this regardless. |
| **C-17** | **Streaks / thoughtfulness score.** | Adopted with the brief's own constraint made binding (§34.7): **no loss aversion, no shaming, one opt-out that hides all of it.** Guilt is the wrong engine for a product about love. |
| **C-18** | Designer's "5 memories/month" free cap vs Part I's storage cap on **downgrade** behaviour. | New written policy required: **memories are never deleted for non-payment.** Over-quota accounts go read-only with a clear resolution path (§32.7). |

### Open questions from Appendix A — status after Part II

| A-# | Question | Status |
|---|---|---|
| A-1 | Pricing and free-tier metric | **Recommendation now firm** (C-6, C-7). Business sign-off needed. |
| A-2 | Do native apps exist / are they planned? | **Resolved: PWA-first**, store shells optional later (C-2). |
| A-3 | Geographic scope | **Resolved: India-first, global-capable** — evidenced by ₹ pricing, UPI/Razorpay/COD, E.164 picker, Diwali/Eid festival packs, "Indian + global names". Drives GST, DPDP Act 2023 compliance alongside GDPR, and WhatsApp-as-primary-channel prioritisation. |
| A-4 | Heir/legacy verification model | **Still open and blocking for R3.** Needs legal counsel per jurisdiction. |
| A-5 | Music licensing for recaps and templates | **Still open.** The brief promises a "licensed music library"; this is a real commercial commitment. Blocking for the R2 editor and R3 marketplace. |
| A-6 | Physical card / gift fulfilment partner | **Still open.** Recommendation: validate with affiliate/dropship before owning inventory (§27.3). |
| A-7 | Company longevity / wind-down policy | **Still open, and the most important one.** A product selling 20-year promises needs a published policy on what happens to vaults if the company fails. |
| A-8 | Brand identity | **Resolved** (C-1, C-3). |

---
## 37. CONSOLIDATED FINAL BLUEPRINT

*This section supersedes §25 and is the authoritative single-page summary of the whole document — product analysis (Part I) plus design specification and extended scope (Part II).*

**PRODUCT:**
M&M — Moments & Memories. An installable, mobile-first Progressive Web App: an emotional-tech platform where people capture memories today and have them delivered at the perfect moment tomorrow — with an occasions engine that knows when those moments are, and (from Release 3) a gift shop and a legacy vault.

**ONE-LINE DESCRIPTION:**
Send love at the perfect moment — record video, voice, and photo memories today, and we deliver them on birthdays, anniversaries, or years from now.

**TARGET USERS:**
Parents recording forward for their children (primary — "James Carter, father of two"); family archivists holding the household's history ("Anna Martinez"); grandparents passing stories down ("Emily Davis"); and recipients, who arrive through a delivered capsule and become the next creators. **India-first, global-capable** (₹ pricing, UPI/Razorpay/COD, E.164, Diwali/Eid/Christmas/Lunar New Year packs). Ages ~30–70, with grandparents treated as core users, not edge cases.

**CORE PROBLEM:**
Meaningful memories are lost three ways — by volume (buried in a camera roll of 40,000 undifferentiated photos), by time and mortality (the context and the voice die with the person; accounts lapse; nobody inherits a password), and by intent (there is no reliable way to say "give this to my daughter on her 18th birthday" and trust that it arrives). And nobody remembers the occasion in time anyway.

**CORE SOLUTION:**
A private, warm vault where a memory is media **plus its meaning**, laid on a timeline that extends into the future; an **occasions engine** that surfaces what is coming and prompts action; an **engineered delivery guarantee** that carries a sealed capsule across channels to a named person on a chosen date or milestone; and a **recipient experience worthy of the wait**, which replies back to the sender.

**EXISTING PRODUCT FEATURES:**
The existing repository is a static Next.js marketing site on GitHub Pages. **Only two things function: light/dark theming and static page routing.** Everything else is copy and design — Legacy Vault, high-resolution no-compression storage, unlimited storage, in-app capture, biometric lock, time capsules, decade-scale durability, multi-channel delivery with failover, heir assignment, family vaults, AI memory stories, smart recaps, On This Day, emotional search, facial recognition, auto-curation, 15 AI generation categories, collaborative memories, shared albums, digital and physical greeting cards, a Past/Present/Future timeline, gallery, testimonials, FAQ, an empty journal, and two contradictory pricing tables. No auth, no database, no API, no PWA manifest, no service worker; the only form calls `preventDefault()`.

**NEW PWA MVP — RELEASE 1 "The Promise" (~24–28 weeks):**
Email OTP + passkey auth · personal vault · **Members** (relationships, birthdays, interests; four import paths incl. vCard/CSV and self-service invite links) · **Occasions/Events engine** (month/year/agenda views, recurrence, reminder offsets, festival display) · create memory (media + when-it-happened date + what-it-meant note) · in-app photo/video/voice capture · resumable offline-tolerant upload · **Past→Present→Future timeline** · memory detail · **time capsule seal + schedule, by date or age milestone** · **durable delivery engine** (in-app + email cascade, retries, watchdog) · **account-free recipient unlock + reactions + voice reply** · revocable private share links · On This Day · onboarding personalization quiz · notification centre with quiet hours · push + email · installable PWA with offline capture · privacy centre (WebAuthn app lock, vault PIN, access log, active-link revocation) · export + delete · minimum viable trust & safety (report/block, moderation queue, CSAM hash-matching) · global search · **Free / Premium subscription** (free = 10 GB, unlimited memories, 3 pending capsules, 12-month horizon; **no memory-count cap, no quality tiering**) with Stripe + Razorpay checkout · marketing site · Release-1 admin slice. **No AI in Release 1, deliberately.**

**NEW PWA V1 — RELEASE 2 "Together" (~12–16 weeks):**
Shared vaults and family circles · **collaborative memories** (no-signup web capture) · **broadcasts with festival packs, merge tags, and mandatory abuse guardrails** · localization/festivals engine · WhatsApp + SMS delivery cascade · Family plan · semantic search · voice/video transcription · auto event grouping · auto recaps · **suggested capsules** and AI memory prompts · wishlists (as links) · streaks, badges, referrals · annual reassurance report · admin festivals, broadcast console, analytics.

**FUTURE FEATURES — RELEASE 3 "Gifting & Legacy" (~16–20 weeks) and beyond:**
Full gift commerce (catalog, PDP, cart, checkout, orders, couriers, returns, promotions) · group gifting · **Legacy Vault and Nominees with the full unlock protocol** (KYC, owner notifications, 30-day waiting period, second-nominee confirmation, immutable audit trail) · template and sticker marketplace with licensed music · AI narrative stories · face grouping (opt-in, geo-gated, legally reviewed) · generative cards and posters · physical fulfilment · family tree · import from Google Photos/iCloud · duplicate detection · native store shells · opt-in end-to-end encryption · public memorial pages · the living archive interview · generational handover · physical time capsules · a "Forever" endowment plan with a published wind-down policy.

**MAIN SCREENS (~115 total):**
*App (~85, each × 5 states × light/dark):* Splash · Onboarding + quiz · Sign up · Dual verification · Login · Forgot/reset · **Home dashboard** · Notifications · Search · Profile · **Members** (+ four add paths, detail, merge) · **Occasions calendar** (+ add/edit, detail sheet) · **Create hub** · Capture & compose (video/voice/photo + editor) · **Details & scheduling** · **Memory manager** (Scheduled/Delivered/Drafts/Received/Time Capsules) · Collaborative memory (+ contributor capture) · Broadcast · Gift shop · PDP · Cart/Wishlist · Checkout (4 steps) · Orders & tracking · Group gifting · **Nominees & Legacy Vault** (+ unlock protocol steps) · Subscription & paywall · Settings sub-screens · **System states sheet** (offline, queue tray, update prompt, app lock, permission primers, install card).
*Marketing:* Landing (10 sections) · Blog index + article · FAQ · Contact · Legal template.
*Admin (~30):* Login (2FA) · Dashboard · Users · **Memories & Moderation** + delivery monitor · Events & Festivals · Gift Catalog · Orders & Logistics · Payments & Subscriptions · Broadcasts console · CMS · Analytics · Roles & Audit Log · Settings & System Health.
*Public tokenised:* `/c/[token]` capsule unlock (**server-rendered, works with JavaScript disabled**) · `/s/[token]` share · `/m/[token]` member self-fill · `/j/[token]` collab capture · `/g/[token]` group gift · `/n/[token]` nominee invite.

**CORE USER JOURNEYS:**
Eight diagrammed flows (§32) — first-time user · memory delivery lifecycle · gift purchase · broadcast · nominee & legacy unlock · collaborative memory · subscription · admin moderation. The primary loop: **occasion surfaces → capture → enrich → address → schedule → seal (ceremonial) → wait (with reassurance) → deliver across channels until acknowledged → recipient opens and replies → sender notified.**

**CORE DATA MODELS (~61 entities across three releases):**
*R1 (~29):* User · Vault · VaultMember · **Memory** (`occurred_at` + `occurred_precision`) · MediaAsset · UploadSession · **Capsule** · CapsuleRecipient · DeliveryAttempt · **Reaction** · **Member** · **Event** · EventMember · EventReminder · Album · Share · Notification · Device · **ScheduledJob** (the durable clock) · Subscription · AuditLog · Report · ModerationFlag · Block · AdminUser · Role · BreakGlassAccess · FeatureFlag.
*R2 (+13):* Festival · Template · Broadcast · BroadcastRecipient · **BroadcastOptOut** · CollabProject · Contribution · Streak · Badge · UserBadge · Referral · Wishlist · WishlistItem · MemoryEmbedding (pgvector) · AiJob.
*R3 (+19):* Category · Product · ProductVariant · ProductImage · ServiceabilityZone · Cart · CartItem · Address · Order · OrderItem · Shipment · Return · Promotion · PromoRedemption · GroupGift · GroupGiftContribution · Payment · Nominee · LegacyVaultItem · UnlockRequest.

**PWA FEATURES:**
Installable manifest with maskable icons, shortcuts, and `share_target` · install prompted only **after the first successful save**, with an iOS Add-to-Home-Screen path · offline app shell, offline reads of recent memories and thumbnails, **offline capture and creation via an IndexedDB outbox** · Background Sync with resumable multipart upload owned by the service worker · **sealing deliberately blocked offline**, with an honest explanation · **Web Push (VAPID)** with email as the guaranteed fallback (iOS requires installation) · Web Share + Share Target · **WebAuthn** passkeys and biometric app lock · **WebOTP** on Android with autofill/paste everywhere else · Contact Picker where available, with vCard/CSV and invite-link paths elsewhere · Badging · Screen Wake Lock · View Transitions and native-feeling sheets · `Save-Data`/connection-aware media · every object a shareable URL, with `/c/[token]` durable for decades. **Web checkout instead of store billing — no 15–30% commission.** Known gaps, designed around: no haptics on iOS, no SMS auto-read on iOS, no contact picker on iOS/Safari, no calendar API anywhere.

**PRIVACY MODEL:**
**Private by default** · **Shared** only by explicit grant (vault role, active share link, or delivered capsule recipient) · **Public** not available before R3 (opt-in memorial pages only). One authorisation rule: every read resolves to a vault role, an active share, or a delivered recipient — there is no fourth path, and nothing is readable by knowing an id. Hashed CSPRNG tokens · 5-minute signed media URLs · no publicly readable objects · instant revocation · `noindex` on every tokenised route · Postgres RLS as defence-in-depth · one test per permission-matrix cell. Sealed capsules are immutable; pre-delivery contents are invisible to recipients (server-enforced). User-visible access log and active-link manager · WebAuthn app lock and vault PIN · free full export · two-step deletion with a 30-day grace period that names the capsule promises it will cancel · **memories are never deleted for non-payment** · opt-in AI processing with a global off switch · GPS stripped by default · no ads, no data mining, no third-party trackers in the app · face recognition deferred and geo-gated (BIPA/CUBI/GDPR) · honest encryption language: server-side AES-256, explicitly **not** end-to-end · India DPDP Act 2023 alongside GDPR/CCPA · CSAM and DMCA reporting paths staffed from day one.

**TECH STACK:**
Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 with the §26 token system · Radix UI · Motion + View Transitions · Serwist service worker · TanStack Query + Dexie + Zustand · Postgres (Neon) with Drizzle, FTS, and pgvector · Better Auth (OTP, passkeys, OAuth) · **Cloudflare R2** (zero egress) + Cloudflare CDN with signed URLs · FFmpeg + sharp workers on Fly.io · **a Postgres-backed `ScheduledJob` table as the durable scheduler** — never a third-party scheduler as source of truth · Resend + SES fallback · Twilio (SMS + WhatsApp Business) `[R2]` · Web Push VAPID · **Stripe + Razorpay** · Claude + Whisper-class ASR + embeddings `[R2]` · Vercel + Fly · Sentry, Axiom, Checkly, and a bespoke **delivery-SLA watchdog that pages a human on any missed unlock** · PostHog (first-party) · Vitest, Playwright (incl. offline and install), SQL-level permission tests · GitHub Actions with per-PR database branches.
**Architecture shape: modular monolith along the eleven domain boundaries + two independently deployable workers** (delivery engine, media pipeline). Redis and Elasticsearch deferred. **Rejected:** static export, GitHub Pages, Firebase, microservices-at-launch, native-first, and GSAP/Lenis/Three.js inside the app.

**NEW REPOSITORY STRUCTURE:**
Turborepo: `apps/web` (route groups `(marketing)` · `(auth)` · `(app)` · `admin`, public `c|s|m|j|g|n/[token]`, `api/webhooks`; **feature-first `src/features/`** for auth, memory, capsule, media, timeline, member, event, broadcast, collab, sharing, search, notifications, billing, commerce, legacy, moderation, settings; `components/ui` + `components/media`; `lib/` with **`authz/` as the single permission chokepoint** plus `db`, `storage`, `jobs`, `offline`, `push`, `email`, `ai`; first-class `sw/`; `e2e/`) · `apps/workers` (delivery engine, watchdog, transcode, recaps, AI, integrity sweep, export, purge) · `packages/` (`shared` zod schemas, `db` single schema source, `emails` incl. the decade-durable delivery template, `config`) · `docs/` (ARCHITECTURE, DATA-MODEL, PERMISSIONS, **DELIVERY-GUARANTEE**, PRIVACY, DESIGN-SYSTEM, RUNBOOK, ADRs) · `scripts/` (seed, backup-verify, **restore-drill**, load-test).

**DEVELOPMENT PHASES:**
**Release 1 (~24–28w):** 1 Foundation · 2 Auth & onboarding (**`authz` built and tested before any content exists**) · 3 Core product: Memory, Members, **Events**, timeline with the future band · 4 Media pipeline · 5 **Capsules & delivery** (the phase not to compress) · 6 PWA offline · 7 Notifications · 8 Billing, privacy centre, trust & safety, admin slice · 9 Hardening (permission-matrix tests, RLS, pen test focused on IDOR, WCAG 2.2 AA, device lab, **first restore drill**) · 10 Launch with **corrected marketing claims**.
**Release 2 (~12–16w):** shared vaults · collaborative memories · broadcasts + festivals · WhatsApp/SMS cascade · AI layer (search, transcripts, grouping, recaps, suggested capsules) · gamification and referrals · admin analytics.
**Release 3 (~16–20w):** commerce (staged: affiliate/dropship validation before owned inventory) · group gifting · **Legacy Vault** (legally gated) · marketplace · admin catalog, orders, payments.

**MVP BACKLOG:**
Release 1 = **10 epics · 38+ features · ~403 tasks** (§22), extended by Part II with: Members with four import paths · Events + reminders engine · onboarding quiz · reactions and voice replies · age-milestone capsule unlock · notification preferences and quiet hours · privacy centre with WebAuthn app lock · trust & safety (report/block, moderation queue, CSAM matching) · global search · Razorpay alongside Stripe · the §26 design system and component library as a Phase 1 deliverable. Design deliverables tracked separately in §36, with **every frame release-tagged `R1`/`R2`/`R3`** so one design file serves three build waves.

---

### The three things that decide whether this succeeds

1. **The delivery guarantee must be real.** Everything else is a photo app. Build the durable scheduler, the channel cascade, the watchdog, the integrity sweep, and the cross-provider backups — then publish `DELIVERY-GUARANTEE.md` as a trust artifact. A capsule that fails to arrive is a Sev-0 incident on the same footing as a data breach.
2. **Ship the loop before the platform.** The designer brief describes a magnificent three-business product. Release 1 must prove that one person will record something, seal it, and have a second person open it and reply. Commerce, marketplace, and legacy transfer are all worth building — *after* that loop is demonstrably working.
3. **Never break a promise about permanence.** Not with "unlimited" storage that must later be capped, not with encryption language that overstates what the architecture does, not with fabricated social proof, and not by deleting a lapsed user's memories. **This product sells trust as its primary feature.** Every shortcut taken against that is a shortcut taken against the only thing that makes it defensible.

---

*End of blueprint. Part I §0–§25 (product analysis and MVP), Part II §26–§37 (design specification and extended scope). §37 is authoritative where sections disagree; Appendix C records every reconciliation.*
