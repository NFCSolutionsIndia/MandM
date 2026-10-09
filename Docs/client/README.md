# Moments & Memories — Technical & Product Documentation

**Audience:** client / product sponsor, and any technical reviewer they appoint.

**Status of the system described:** Release 1 is in active construction. PHASE-01 (Foundation)
is underway; 4 of 104 planned tasks are complete. This document set describes the **designed
system** — what is being built, and the reasoning behind every choice — and marks clearly
where something exists in code today versus where it is specified and scheduled.

---

## Why this document set exists

Three questions get asked repeatedly about a product like this, and each deserves a written
answer rather than a meeting:

1. **What are we building, and what does it do for a user?** → [01 — Product & Features](01-PRODUCT-AND-FEATURES.md)
2. **Why these technologies, and will they still be right in five years?** → [02 — Technology Decisions](02-TECHNOLOGY-DECISIONS.md)
3. **How is it put together, and will it hold?** → [03 — System Design](03-SYSTEM-DESIGN.md) · [04 — Database Architecture](04-DATABASE-ARCHITECTURE.md) · [05 — Security, Privacy & Compliance](05-SECURITY-AND-COMPLIANCE.md)

And one that decides whether the business works: **what does it cost, when does it ship, and
what does it become?** → [06 — Delivery Roadmap & Business Plan](06-DELIVERY-ROADMAP-AND-BUSINESS-PLAN.md)

---

## The document set

| # | Document | What it covers | Read it if you want to know… |
|---|---|---|---|
| 01 | [Product & Features](01-PRODUCT-AND-FEATURES.md) | The product proposition, the full feature catalogue across three releases, user journeys, screen inventory, and the deliberate anti-features | what the user actually gets, and in what order |
| 02 | [Technology Decisions](02-TECHNOLOGY-DECISIONS.md) | Every technology in the stack, the reason it was chosen *for this product*, the alternatives rejected, industry context, and the exit path if it stops fitting | why we are not using the thing you read about last week |
| 03 | [System Design](03-SYSTEM-DESIGN.md) | Architecture from context diagram down to module boundaries; the four critical flows drawn end to end; failure modes and how each is handled | how the pieces fit and what happens when one breaks |
| 04 | [Database Architecture](04-DATABASE-ARCHITECTURE.md) | Seven levels, high to low: data domains → logical ERD → physical PostgreSQL model → table-level DDL → index-to-query mapping → the scheduler internals → operations and scaling | whether the data layer is designed or improvised |
| 05 | [Security, Privacy & Compliance](05-SECURITY-AND-COMPLIANCE.md) | Threat model, the single authorization chokepoint and its four compensating controls, media security, encryption posture, audit logging, and regulatory position | whether one family's memories can reach another family |
| 06 | [Delivery Roadmap & Business Plan](06-DELIVERY-ROADMAP-AND-BUSINESS-PLAN.md) | Twelve phases, effort, dependencies, the monetization model and its reasoning, unit economics, scaling path, and the decisions still open | when it ships and whether the numbers work |

---

## The product in one paragraph

Moments & Memories is a pair of native mobile apps — iOS in Swift, Android in Kotlin — where a person captures a moment —
a photo, a video, a voice recording — writes down what it meant, and either keeps it in a
private family timeline or **seals it for delivery to someone on a chosen future date**.
That date may be next month or twenty years away. The product's entire technical premise is
that the promise gets kept: the message arrives, in a form the recipient can open without an
account, without an app, and without depending on the 2026 web still working the way it does
today.

---

## The five commitments everything else is built to protect

These are not aspirations. Each one has a specific engineering mechanism behind it, named in
the documents above, and each is enforced in code or in CI rather than by good intentions.

| # | Commitment | The mechanism | Where it is documented |
|---|---|---|---|
| 1 | **A sealed capsule is delivered.** | The schedule lives in the database, not in a vendor's scheduler. Sealing writes the capsule state and its job row in one transaction. An hourly watchdog pages a human if any capsule passes its unlock time undelivered. | [03 §5](03-SYSTEM-DESIGN.md) · [04 Level 6](04-DATABASE-ARCHITECTURE.md) |
| 2 | **A promise survives the clock.** | Every temporal column is `timestamptz` UTC. `timestamp without time zone` is banned outright, with three independent CI checks, because a dropped offset delivers into the wrong hour decades from now. | [04 Level 3](04-DATABASE-ARCHITECTURE.md) |
| 3 | **One family's memories cannot reach another.** | A single authorization chokepoint that feature code physically cannot bypass, backed by four independently-failing controls, and a permission matrix with a positive *and* a negative test per cell gating every merge. | [05 §3](05-SECURITY-AND-COMPLIANCE.md) |
| 4 | **A memory is never lost, even mid-upload.** | The local copy is written to the device before the upload begins. Uploads are resumable by part and idempotent by client key. The original file is never modified. | [03 §4](03-SYSTEM-DESIGN.md) |
| 5 | **A promise is never cancelled for non-payment.** | Entitlements are evaluated once, at seal time, and never re-applied retroactively. A lapsed subscription cannot invalidate a capsule already sealed. | [06 §4](06-DELIVERY-ROADMAP-AND-BUSINESS-PLAN.md) |

---

## Stack at a glance

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router · React 19 · TypeScript strict |
| Database | PostgreSQL 17 — Amazon Aurora PostgreSQL Serverless v2, multi-AZ · Drizzle ORM |
| Authentication | Better Auth — email OTP, passkeys, OAuth. **No passwords.** |
| Object storage | Cloudflare R2 — private buckets, signed URLs only |
| Background jobs | A PostgreSQL job table claimed with `FOR UPDATE SKIP LOCKED`. **The database owns the schedule.** |
| Hosting | AWS — ECS Fargate (web + two worker services), ALB, CloudFront + WAF, CDK |
| Apps | iOS: Swift 6 · SwiftUI · GRDB · background URLSession — Android: Kotlin 2 · Compose · Room · WorkManager |
| UI | Tailwind v4 · Radix primitives · Motion |
| Payments | Stripe + Razorpay (India-first) |
| Email | Resend primary, Amazon SES as a standing fallback |
| Testing | Vitest · Playwright · permission-matrix tests against real PostgreSQL |

Full reasoning for each line: [02 — Technology Decisions](02-TECHNOLOGY-DECISIONS.md).

---

## How to read this if you have twenty minutes

1. This page.
2. [01 — Product & Features](01-PRODUCT-AND-FEATURES.md) §2 (the Release 1 feature table) and §7 (anti-features).
3. [03 — System Design](03-SYSTEM-DESIGN.md) §2 (the context diagram) and §5 (the delivery engine).
4. [06 — Delivery Roadmap & Business Plan](06-DELIVERY-ROADMAP-AND-BUSINESS-PLAN.md) §2 (the timeline) and §4 (pricing).

---

## Provenance and authority

This documentation is derived from, and stays consistent with, the engineering sources of
truth in this repository. Where a client-facing statement here simplifies a technical one,
the technical document wins.

| Source | Role |
|---|---|
| `MM_PWA_BLUEPRINT.md` | The product blueprint — features, screens, data model, journeys. Historical product brief; left unedited. |
| `Docs/development/ARCHITECTURE_DECISIONS.md` | **The authority on the data and hosting layers.** 28 numbered decisions with reasoning. Where it conflicts with the blueprint's stack section, it wins. |
| `Docs/development/CONVENTIONS.md` | Naming, module shape, the one authorization rule, testing floor, accessibility floor. |
| `Docs/development/00_PROJECT_PLAN.md` | The 12-phase execution plan and its ten non-negotiables. |
| `Docs/development/PROJECT_PROGRESS.md` | Live status — the single answer to "where are we?". |

> **One important note on the stack.** The blueprint's technical section (§18.1) specifies
> PostgreSQL, Neon, Vercel and Fly.io. **That section is superseded on hosting and reinstated on the database.** The database is PostgreSQL
> on Aurora and hosting is AWS end to end. The change, what it cost, and the compensating
> controls that exist because of it are documented openly in
> [02 §3](02-TECHNOLOGY-DECISIONS.md) and [05 §3](05-SECURITY-AND-COMPLIANCE.md) rather than
> quietly absorbed — because two of the consequences (no row-level security, and the 2038
> boundary) shape a great deal of the engineering that follows, and a future reader needs to
> know that the unusual amount of machinery around them is deliberate compensation rather
> than over-engineering.
