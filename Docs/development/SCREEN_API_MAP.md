# Screen-to-API Map — Mobile designs of 2026-11-17

> **Audience:** backend, mobile and admin developers. **Companion to** [TEAM_TASKS.md](TEAM_TASKS.md), where every gap below is a ticket.
> Re-run this audit whenever a new screen arrives: add it to §1, map it in §2, and open tickets for what is missing.

| | |
|---|---|
| **Designs audited** | 6 screens (Home, Notifications, Search, Calendar · Month, Calendar · Jump to, Calendar · List) |
| **Code audited** | `main` at `54ee370` plus the changes below, every controller, service, schema and migration under `backend/src` |
| **Result** | Every interaction that has defined business rules is now backed by an API: **34 of 49**. Of the other 15, 3 need no API, 6 need a product decision and 6 are features that are not built yet. They are listed in §7, each with a ticket. |
| **Tests** | 414 e2e + 39 unit, all passing (was 374 + 39). 40 new e2e cases in `backend/test/screens.e2e-spec.ts` |

Status legend: **✅ Available** (an existing API covers it, unchanged) · **🛠 Modified** (an existing API was extended in this change) · **🆕 Built** (a missing API, built in this change) · **❌ Missing** (not built; a ticket exists) · **❓ Needs verification** (the rule is unclear; a decision is open) · **📱 Device** (no API needed)

---

## 1. Screen inventory

| # | Screen | What it is for | Interactions found |
|---|---|---|---|
| S1 | **Home** | Greeting, what is coming up this week, quick actions on the next occasion | greeting + avatar, bell with unread dot, "3 moments coming up this week", search bar, "Up next" carousel (1 of 3), person card (photo, name, city), prep chips (Voice note ✓, Card — not yet), Record voice, Her wishlist, "Sending soon" row, + button, bottom nav (Home, Calendar, AI Helper, Chats, Me) |
| S2 | **Notifications** | Everything that happened, newest first | Today / This week groups, avatar + type badge, title, quote, time, unread dot, Mark all read, Accept / Not now (trusted-person request), delivery-fallback notice, "Quiet hours 10 PM – 7 AM · Settings" |
| S3 | **Search** ("dad") | One box across people, memories and dates | query box + clear, Ask AI Helper, chips All · People · Memories · Dates, People row (Dad · Mike Carter · Austin, TX · 18 memories), Memory cards (thumbnail, video badge, title), Dates row (Dad's 60th birthday · Sat, Mar 21 · in 6 days), Recent searches |
| S4 | **Calendar · Month** | The month at a glance | year picker, search icon, Month / Year / List tabs, month grid with avatars and icons per day, today ringed, selected day, previous / next month, selected-day card (Dad turns 60 · every year · in 6 days, chips Video ✓ / Family video 4/7 / No gift), holiday strip (St. Patrick's Day), + button |
| S5 | **Calendar · Jump to** (sheet) | Pick a month quickly | year arrows (2025 / 2026 / 2027), 12 months with "N dates" or "—", Today, Done, close |
| S6 | **Calendar · List** | Every date as a searchable list | search box, chips All · Birthdays · Holidays · Capsules, sections This month / Later this year, rows (avatar, "Dad turns 60", Sat, Mar 21 · in 6 days), + button |

---

## 2. Screen-to-API mapping

All endpoints are under `/api/v1` and need `Authorization: Bearer <access token>`. Row-level security limits every result to the signed-in user's own data, and no endpoint takes an owner id from the request.

### S1 · Home

| Interaction | Endpoint | Request | Response fields used | Status |
|---|---|---|---|---|
| "Good evening, Emma" + avatar | `GET /users/me` | — | `name`, `avatarUrl`, `timezone` | 🛠 Modified: `avatarUrl` and `timezone` added |
| Bell red dot | `GET /notifications/unread-count` | — | `unread` | 🆕 Built |
| "3 moments coming up this week" | `GET /moments/upcoming` | `limit` | `counts.next7Days` | 🛠 Modified: `counts` added (D-13) |
| "Up next" carousel (1 of 3) | `GET /moments/upcoming?limit=5` | `limit`, `types` | `items[]`: `type`, `title`, `date`, `daysLeft`, `turns`, `person` | 🛠 Modified: `turns` added, titles use the nickname |
| Card: "Mom's birthday · Linda Carter · Austin, TX", photo | same | — | `person.displayName`, `person.name`, `person.location`, `person.avatarUrl` | 🛠 Modified: `nickname`, `displayName`, `location` added |
| Chips "✓ Voice note", "Card — not yet" | — | — | — | ❓ Needs verification: BE-14, D-10 |
| "Record voice" | upload flow exists (`POST /uploads`, `POST /vaults/:id/memories`), but nothing links a recording to an occasion | — | — | ❓ BE-14 |
| "Her wishlist" | — | — | — | ❌ Missing: BE-20 (Release 3 gifting) |
| "Sending soon" row | `GET /moments/upcoming?types=capsule&limit=10` | `types=capsule` | `items[]` | 🛠 Modified: `types` filter added. The row is cut off in the design, so its exact content is ❓ |
| Search bar | → S3 | | | ✅ |
| + button | `POST /members`, `POST /events`, `POST /vaults/:id/capsules`, `POST /vaults/:id/memories` all exist | | | ❓ What the menu offers is not designed (P-9) |
| Nav: Calendar / Me | → S4 / `GET /users/me` | | | ✅ |
| Nav: AI Helper | — | — | — | ❌ Release 2 AI (BE-21) |
| Nav: Chats | — | — | — | ❓ No chat feature exists (D-7) |

### S2 · Notifications

| Interaction | Endpoint | Request | Response fields used | Status |
|---|---|---|---|---|
| List, newest first, Today / This week | `GET /notifications` | `cursor`, `limit` (≤ 50), `unread` | `items[]`: `title`, `body`, `actor{name, avatarUrl}`, `type`, `read`, `createdAt`, `deepLink`, `data` · `nextCursor` | 🆕 Built. Group by `createdAt` on the device |
| Unread blue dot | same | — | `read` | 🆕 |
| Tap a notification | `POST /notifications/:id/read` → 204 | — | — | 🆕 |
| Mark all read | `POST /notifications/read-all` | — | `updated` | 🆕 |
| "Quiet hours 10 PM – 7 AM" | `GET /notifications/preferences` | — | `quietHours{start, end, timezone}` | 🆕 |
| Settings → change / turn off quiet hours | `PUT` / `DELETE /notifications/preferences/quiet-hours` | `{start:"22:00", end:"07:00"}` | preferences | 🆕 (D-14) |
| Content: "Mom loved your video", "Dad turns 60 in 6 days", "Delivered to Grandma by email…" | rows written by background jobs | — | — | ❌ No job writes notifications yet: BE-15. **Until then the list is empty in real use.** |
| "Jake added a clip… 5 of 7 clips are in" | — | — | — | ❌ Collaborative capsules, Release 2: BE-19 |
| "Olivia asked you to be a trusted person" + Accept / Not now | — | — | — | ❌ Trusted people / legacy, Release 3: BE-18 |
| Per-type on/off switches (Settings screen) | `GET /notifications/preferences` lists them; no endpoint changes them | — | `types[]` | ❓ The Settings screen is not designed (P-10) |

### S3 · Search

| Interaction | Endpoint | Request | Response fields used | Status |
|---|---|---|---|---|
| Type "dad", All | `GET /search?q=dad&limit=5` | `q` (2–100), `types`, `limit` | `people`, `memories`, `dates`, each `{items, nextCursor}` | 🆕 Built (BE-07) |
| People row: "Dad · Mike Carter · Austin, TX · 18 memories" | same | — | `displayName`, `name`, `location`, `memoryCount`, `avatarUrl` | 🆕 |
| Memory cards: thumbnail, video badge, title | same | — | `thumbnailUrl`, `mediaKind`, `title` | 🆕. `thumbnailUrl` is the original file until real thumbnails exist (P-8) |
| Dates row: "Dad's 60th birthday · Sat, Mar 21 · in 6 days" | same | — | `title`, `turns`, `date`, `daysLeft` | 🆕. The app writes "60th" from `turns` |
| Chips People / Memories / Dates, "See all" | `GET /search?q=dad&types=memories&limit=20&cursor=` | one `type` + `cursor` | section + `nextCursor` | 🆕 |
| Tap a person / memory / date | `GET /members/:id`, memory detail, `GET /events/:id` or `GET /capsules/:id` | — | — | ✅ (memory detail: P-11) |
| Recent searches | — | — | — | 📱 Kept on the device and cleared on sign-out |
| Ask AI Helper: "Show Dad's best moments" | — | — | — | ❌ Release 2 AI (BE-21) |

### S4 · Calendar · Month (and the Year tab)

| Interaction | Endpoint | Request | Response fields used | Status |
|---|---|---|---|---|
| Month grid: avatar / icon on each day | `GET /calendar?from=2026-03-01&to=2026-03-31` | `from`, `to` (≤ 366 days), `types`, `q` | `items[]`: `date`, `type`, `person.avatarUrl` · `today` | 🆕 Built (BE-11) |
| Today ringed | same | — | `today` (user's timezone) | 🆕 |
| Previous / next month, year picker | same, another range | | | 🆕 |
| Selected-day card: "Dad turns 60 · Sat, Mar 21 · ⟳ every year · in 6 days" | same | — | `person.displayName`, `turns`, `date`, `recurrence`, `daysLeft` | 🆕 |
| Chips "✓ Video", "Family video 4/7", "No gift" | — | — | — | ❓ BE-14 (prep), BE-19 (family video), BE-20 (gift) |
| Holiday strip "St. Patrick's Day · Tue, Mar 17" | same | — | `items[type=holiday]` | 🛠 Partial: only holidays the user added as `festival` events. A built-in catalogue is ❌ BE-16 (D-11) |
| Year tab | `GET /calendar?from=2026-01-01&to=2026-12-31` or `/calendar/summary` | | | 🆕 (the Year design is not attached; P-12) |
| Search icon | → S6 | | | 🆕 |
| + button → add an event | `POST /events` | | | ✅ (BE-10) |

### S5 · Calendar · Jump to

| Interaction | Endpoint | Request | Response fields used | Status |
|---|---|---|---|---|
| "Mar · 5 dates", "Jan · —" | `GET /calendar/summary?year=2026` | `year`, `types` | `months[]`: `count`, `days`, `byType` | 🆕 Built. Which number "5 dates" means is open (D-12), so both are returned |
| Year arrows | same, another `year` | | | 🆕 |
| Today / Done / close | — | — | — | 📱 Device |

### S6 · Calendar · List

| Interaction | Endpoint | Request | Response fields used | Status |
|---|---|---|---|---|
| Rows, soonest first | `GET /calendar?from=<today>&to=<Dec 31>` | | `items[]` | 🆕 |
| Chips Birthdays / Holidays / Capsules | same | `types=birthday` / `holiday` / `capsule` | | 🆕 |
| Search "birthday" | same | `q=birthday` (title, person name, nickname) | | 🆕 |
| "Grandma Rose turns 85" | same | — | `person.displayName`, `turns` | 🆕 |
| Sections This month / Later this year | — | — | `date` | 📱 Device |

---

## 3. API gap analysis

| Need | Before this change | Classification | Outcome |
|---|---|---|---|
| Person nickname ("Mom") and city | No columns | Needs modification | Migration `0023` + members API: **done** |
| Memory count per person | Not returned | Needs modification | `memoryCount` on every person: **done** |
| Avatar on Home | `users/me` had no avatar | Needs modification | `avatarUrl`, `timezone`: **done** |
| "N this week", age, nickname titles, "Sending soon" | `upcoming` lacked them | Needs modification | `counts.next7Days`, `turns`, `types`, person fields: **done** |
| Calendar range / list / summary | Nothing | Missing | `GET /calendar`, `GET /calendar/summary`: **done** |
| Search | Nothing (BE-07 blocked) | Missing | `GET /search`: **done**. The designs settled D-6 and D-7 |
| Notification centre | Tables only, no API | Missing | 6 endpoints: **done** |
| Something that creates notifications | No producer anywhere | Missing | BE-15 (ticket) |
| Occasion preparation (voice note, card, video, gift chips; Record voice) | No model | Needs verification | BE-14, D-10 |
| Wishlist / gifts | No model | Missing (Release 3) | BE-20 |
| Collaborative family video ("4/7 clips") | No model | Missing (Release 2) | BE-19 |
| Trusted-person invitations (Accept / Not now) | No model | Missing (Release 3) | BE-18 |
| Public holiday catalogue | No data | Needs verification | BE-16, D-11 |
| AI Helper | Nothing | Missing (Release 2) | BE-21 |
| Chats | Nothing | Needs verification | D-7 |
| Fast memory search at 10,000+ memories | `search_text` is **never written**, and its trigram index **cannot be used under row-level security** | Needs modification | BE-17 |

**Existing APIs reused unchanged:** `POST/GET/PATCH/DELETE /members`, `/events`, `/vaults/:id/capsules`, `/capsules/:id`, uploads and memories.

---

## 4. API modifications (backward compatible)

Every change adds fields or optional parameters. None removes or renames anything, and none changes a status code.

| Endpoint | Change | Compatibility note |
|---|---|---|
| `GET /users/me` | `+ avatarUrl`, `+ timezone` | Additive |
| `POST /members`, `PATCH /members/:id` | accept `nickname` (≤ 64), `location` (≤ 120); `null` clears | Optional fields |
| `GET /members`, `GET /members/:id`, create/update responses | `+ nickname`, `+ displayName`, `+ location`, `+ memoryCount` | Additive. `GET /members?q=` now also matches the nickname |
| `GET /moments/upcoming` | `+ ?types=`, `+ counts.next7Days`, `+ turns`, `+ person.nickname / displayName / location` | Additive. **Titles now use the nickname when one is set** ("Mom's birthday" rather than "Linda Carter's birthday"). People without a nickname get exactly the old title. One existing test compared the whole body with `toEqual` and was updated for `counts` |

---

## 5. Implementation summary

| Area | Files |
|---|---|
| Migration | `backend/src/db/migrations/0023_member_nickname_location.sql` (2 nullable columns, additive; slot 5 in the migration order) |
| Calendar (new) | `backend/src/calendar/` — `calendar.dto.ts`, `calendar.service.ts` (`occurrencesSql`, shared with search), `calendar.controller.ts`, `calendar.module.ts` |
| Search (new) | `backend/src/search/` |
| Notifications (new) | `backend/src/notifications/` |
| Modified | `people/members.*`, `moments/moments.*`, `users/users.service.ts`, `db/schema/people.ts`, `app.module.ts` |
| Shared | `common/no-jit.ts` (see §6.3) |
| Postman | New folders `1g · calendar`, `1h · search`, `1i · notifications`; new "Sending soon" request in `1d`; examples in `1d` and `1e` updated to the new shape; collection variable `notificationId` |

**New endpoints:** `GET /calendar`, `GET /calendar/summary`, `GET /search`, `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all`, `GET /notifications/preferences`, `PUT /notifications/preferences/quiet-hours`, `DELETE /notifications/preferences/quiet-hours`.

**Rules the calendar and upcoming moments share**, so the grid, the list, the count and Home never disagree:
- A birthday must be known to the day. Month-only and year-only birthdays are not placed.
- Merged-away people, archived events, draft, cancelled and failed capsules are left out.
- A yearly birthday or anniversary *event* is dropped when one of its people already has that date on their record, so nothing shows twice.
- Nothing repeats before it first happened. 29 February falls on 28 February in common years. Every date is a day in the user's timezone.
- `holiday` is an event of type `festival`. `event` is type `custom`.

---

## 6. Testing report

### 6.1 Commands and results (local Docker PostgreSQL 17, `mm_test`)

| Step | Result |
|---|---|
| `npm run typecheck` (app + tests) | ✅ 0 errors |
| `npm run lint` (oxlint) | ✅ clean |
| `npm test` (unit) | ✅ 39 / 39 |
| `npm run build` | ✅ |
| `npm run test:e2e` before the change | ✅ 374 / 374 (18 files): the baseline |
| `npm run test:e2e` after | ✅ **414 / 414 (19 files)** |
| Postman YAML | ✅ all 167 files parse |

### 6.2 New cases (`backend/test/screens.e2e-spec.ts`, 40)

| Group | Cases |
|---|---|
| People | nickname + location create / read / clear; `memoryCount` ignores deleted memories; list search matches the nickname; 422 for nickname > 64 and location > 120 |
| Home | `users/me` avatar + timezone; `next7Days` = 3 whatever the limit; Mom's card (nickname title, `turns` 68, name and city); `types=capsule`; 400 for an unknown type |
| Calendar · Month | March 2026 full ordered list (10 items) with `turns`, `recurrence`, `capsuleState`, negative `daysLeft`; 29 February → 28 February; no birthday before birth; 400 for reversed / > 366 days / impossible date / missing bound / unknown type; 401 without a session |
| Calendar · List | Birthdays chip + "birthday" search; search by the person's name; Holidays and Capsules chips; `%` taken literally |
| Calendar · Jump to | 12 months, March `count` 10 / `days` 9 / `byType`; `types` narrows; 400 for a missing or out-of-range year |
| Search | "dad" across all three sections (people with location and count; memories by title, note and tagged person, deleted excluded; dates with `turns`); only the requested sections; cursor paging for memories and dates; isolation in both directions; 422 / 400 / 401 validation; `%%` matches nothing |
| Notifications | unread count; list order, actor from the person (nickname), default title, `actorName`; another user's row cannot reveal my person's name; paging with two rows in the same microsecond (no gap, no repeat); `unread=true`; mark read (idempotent 204, 404 for someone else's or a malformed id); read-all changes only mine; quiet hours default / set / not applied to non-suppressible types / clear / isolation; 5 × 422 validation; 401s |
| Scale | 10,000 memories, 500 people, 200 events (§6.3) |
| Regression | Every existing suite re-run; one assertion in `moments.e2e-spec.ts` updated for the additive `counts` field |

### 6.3 Performance (local Docker on Windows, warm, one request)

| Endpoint | Before the fix | After | Note |
|---|---|---|---|
| `GET /calendar` (month) | 2,547 ms | **59–81 ms** | |
| `GET /calendar/summary` | 2,573 ms | **95–115 ms** | |
| `GET /calendar` (rest of year + q) | 2,977 ms | **82–116 ms** | |
| `GET /search` (All) | 3,844 ms | **875–1,007 ms** | Over the 300 ms target. See BE-17 |

**What was wrong:** PostgreSQL's JIT compiler. The calendar expansion joins `generate_series()` over CTE values, which the planner estimates at 1,000 rows each. The inflated cost crossed `jit_above_cost`, and `EXPLAIN ANALYZE` showed **2,960 ms of a 3,071 ms query spent compiling**, with about 110 ms of actual work. JIT is now switched off per transaction for these queries (`common/no-jit.ts`). The existing `GET /moments/upcoming` uses the same pattern and was given the same fix.

**What remains (BE-17):** search's memory query takes about 410 ms at 10,000 memories in one vault, because row-level security calls `app_vault_role()` for every row before `ILIKE` can filter. Two further findings: `memories.search_text` is never written by any code, and its trigram index cannot be used under row-level security (`ILIKE` is not leakproof). A set-based rewrite without RLS measured 209 ms, so the real fix is indexed full-text search over a maintained `search_text`. That needs a database review, so it is a ticket rather than part of this change. Typical accounts are far below 10,000 memories.

---

## 7. Coverage report

**49 interactions** across the 6 screens (one per row in §2):

| | Count | Interactions |
|---|---:|---|
| ✅ / 🛠 / 🆕 backed by an API | **34** | S1 (8): greeting, bell, week count, carousel, card, Sending soon, search bar, nav to Calendar / Me · S2 (6): list, unread dot, tap, mark all read, quiet hours shown, quiet hours changed · S3 (6): All, people row, memory cards, dates row, chips / See all, tap through · S4 (8): grid, today, month / year navigation, selected-day card, holiday strip (user-added holidays only, see D-11), Year tab, search icon, + · S5 (2): month counts, year arrows · S6 (4): rows, chips, search, "turns 85" |
| 📱 device only | 3 | Recent searches, Jump-to Today / Done, list sections |
| ❓ needs a decision | 6 | Home prep chips (D-10), Record voice (D-10), + menu (P-9), Chats tab (D-7), notification per-type switches (P-10), Calendar prep chips (D-10) |
| ❌ not built yet | 6 | Notification producers (BE-15, Release 1), wishlist / gifts (BE-20, R3), family video clips (BE-19, R2), trusted person (BE-18, R3), AI Helper in nav and in Search (BE-21, R2) |

**Notifications caveat:** the notification API is complete, but no background job creates notifications yet (BE-15). Until that ships, the screen works and shows an empty list.

---

## 8. Pending items, assumptions and open questions

| ID | Item | What was assumed / built | Who decides |
|---|---|---|---|
| **D-10** | What is an occasion's "preparation"? (Voice note, Card, Video, Gift, wishlist) | Nothing built. Needs a model: which items exist, whether they are per occasion or per person, what "✓" means | Product |
| **D-11** | Built-in public holidays: which countries, which source, can users hide them? | Only user-created `festival` events show as holidays | Product |
| **D-12** | Jump to: does "5 dates" count every date or every day with a date? | Both returned (`count`, `days`) | Design |
| **D-13** | "This week" = the next 7 days (today + 6) or the calendar week (Sun–Sat)? | **Next 7 days** (`counts.next7Days`, named for what it is). The design's numbers fit both | Design |
| **D-14** | Do quiet hours silence everything? | Applied to every type a user may switch off. Failed deliveries, security and billing still come through | Product |
| P-4 | Holiday catalogue | see D-11 | — |
| P-8 | Real thumbnails | `thumbnailUrl` signs the original until the media pipeline (Phase 4) makes renditions | Backend |
| P-9 | What the + button offers | Every create API exists; the menu is not designed | Design |
| P-10 | Notification Settings screen | Per-type switches are listed by `GET /notifications/preferences`; an endpoint to change them is built when the screen exists | Design |
| P-11 | Memory detail screen | Not in this set of designs | Design |
| P-12 | Year tab design | Not attached; `/calendar` and `/calendar/summary` cover it | Design |
| — | Nickname vs relationship | "Mom" is stored as `nickname` (free text), separate from `relationship` (`mother`), because the designs show both and families differ ("Amma", "Nani") | — |
| — | Deploy | Migration 0023 must take its turn in the one-migration-at-a-time order. It is additive and nullable, with no backfill | Lead |
