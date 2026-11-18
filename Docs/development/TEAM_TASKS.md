# Team Tasks — Moments & Memories

> **Living document.** Each new screenshot, requirement or decision updates this file, and gets a line in the [Changelog](#9-changelog) at the bottom.
> If a task here disagrees with older planning docs (`phase-*/`, `00_PROJECT_PLAN.md`), this file wins for the work listed in it.

|                        |                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Milestone**          | **#2611.02**                                                                                                       |
| **Current feature**    | People (members): required by milestone capsules                                                                   |
| **Also in this round** | App version API · sessions (access/refresh/idle) · OTP over email or phone · usernames · search · upcoming moments · **calendar · notifications** (designs of 2026-11-17, see SCREEN_API_MAP.md) |
| **Last updated**       | 2026-11-17                                                                                                         |

**Team**

| Person                       | Role      | Owns in this round                                                                                                                                               |
| ---------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Akshara** (Akshara Peraka) | Backend   | Sign-in and sessions: tokens, idle logout, OTP channels, SMS, usernames, admin users API. Also built People, Events, app version and upcoming moments (moved from Omsai). |
| **Omsai**                    | Backend   | Notification producers (BE-15), search speed (BE-17), occasion preparation (BE-14), holidays (BE-16). Search itself is done. |
| **saig**                     | Mobile    | App-version gate, sign-in screens, token handling, profile/username, Calendar month and Jump to, Notifications |
| **saib**                     | Mobile    | People screens, capsule person picker, Home "upcoming moments", Search screen, Calendar list |
| **Naveen**                   | Admin web | App-version management, users and sessions pages, sign-in settings                       |

---

## 1. How to use this document

### Every task is written as a ticket

Each task in [§5](#5-tickets) follows the field order of the ticket form, so it can be copied in field by field:

| Ticket field               | What goes in it                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Summary**                | `[ID] title`, for example `[BE-01] Access token (1 day) + refresh token (30 days) + 7-day idle logout`. Keeping the ID in the summary links the ticket back to this doc. |
| **Description**            | The copy block under **Description**. It is plain text, written to read correctly in a plain text box.                                                                   |
| **Assign To**              | The owner named in the ticket card                                                                                                                                       |
| **Reproducibility**        | Leave at **Have not tried** (or N/A if the list has it). These are build tasks, not bugs.                                                                                |
| **Severity**               | **Low** for build tasks. Severity is for bugs.                                                                                                                           |
| **Priority**               | From the card: **High** = Wave 1 and other tasks depend on it, **Normal** = Wave 2, **Low** = nice to have                                                               |
| **Steps To Reproduce**     | Used as **How to test**: the steps a reviewer follows to check the work is done                                                                                          |
| **Additional Information** | Dependencies, open decisions, the migration slot and files to read                                                                                                       |
| **Attach Tags**            | From the card, comma-separated                                                                                                                                           |
| **Estimate**               | From the card, in `hh:mm` using 15-minute steps. The form allows **23:45 at most**, so any task bigger than that is split into separate tickets.                         |
| **Task Type**              | **Task**                                                                                                                                                                 |
| **Worked Hours**           | 0 at creation. The developer updates it.                                                                                                                                 |
| **Upload Files**           | Any screenshot the task was based on (see §8)                                                                                                                            |

### Other rules

- **Task IDs** are permanent. `BE-` = backend, `MOB-` = mobile, `ADM-` = admin web. Never reuse a number. If a task is dropped, mark it `dropped` and leave it in the file.
- **Status values:** `todo` · `in progress` · `in review` · `done` · `blocked` · `dropped`. The ticket tool is the live status. [§7](#7-status-board) mirrors it for anyone reading this doc.
- **Contract first.** Every backend ticket starts by adding its requests and example responses to the Postman collection in `Docs/development/Moments & Memories/` (one YAML file per request and example; environments are `Docs/development/M&M — local.environment.yaml` and `… — production.environment.yaml`), before any code is written. Mobile and admin build against those examples from day 1, so they are not waiting on the backend.
- **Done means:** code merged, tests passing in CI, the Postman examples match the real responses, and the "How to test" steps have been run by someone other than the author.
- **New requirement or screenshot?** Send it to the lead. Every ticket it affects gets edited here (and in the tool), and the change is logged in §9.

---

## 2. What exists today (checked against the code on 2026-11-13)

> This table records the starting point on 2026-11-13. For what has been built since, see [§7 Status board](#7-status-board). As of 2026-11-17, items 1, 2, 3, 5 and 7 and the People API are built.

| #   | Requirement                                   | Status           | What is there now                                                                                                                                                                                                                                      |
| --- | --------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | App-version API, separate for iOS and Android | ❌ Not built     | `devices.app_version` stores each device's version. There is no table of latest or minimum versions and no endpoint.                                                                                                                                   |
| 2   | Log out after 7 days of inactivity            | ❌ Not built     | A session lasts 30 days and every request extends it (`app_touch_session`). An idle user stays signed in for up to 30 days.                                                                                                                            |
| 3   | Access token 1 day, refresh token 30 days     | ⚠️ Partly built  | There is one opaque session token with a 30-day rolling lifetime (`sessions` table, `POST /auth/verify`). There is no refresh token and no 1-day access token.                                                                                         |
| 4   | OTP by email or phone, chosen in `.env`       | ⚠️ Email only    | Email OTP works: 6 digits, 10-minute expiry, 5 attempts, 5 codes per hour. `users.phone` exists as a column, but there is no SMS sending, no phone OTP and no `.env` switch. `users.email` is NOT NULL, so a phone-only account cannot be created yet. |
| 5   | Unique auto-generated username                | ❌ Not built     | `users` has no username column.                                                                                                                                                                                                                        |
| 6   | Search: people, chats, moments                | ❌ Not built     | Groundwork exists: `memories.search_text` with full-text and trigram indexes (migration 0004). **There is no chat feature anywhere in the backend.**                                                                                                   |
| 7   | Upcoming moments (5 items)                    | ❌ Not built     | The data to build it from exists: `capsules.unlock_at` and member/event birthdays and anniversaries.                                                                                                                                                   |
| —   | **People (members)**                          | ⚠️ Database only | The `members` table, its row-level security and `test/people.e2e-spec.ts` exist. There is **no API**. `capsules.milestone_member_id` and `capsule_recipients.member_id` already point at `members`.                                                    |

---

## 3. Decisions needed before these tasks start

Tickets marked **⛔ blocked** in §7 are waiting on these. Each one has a recommended default. If nobody objects, the default stands.

| ID      | Question                                                                                                                                                                                            | Recommended default                                                                                                                                                                                               | Blocks        |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **D-1** | Is the 30-day refresh lifetime **rolling** (each refresh issues a new 30-day token, so an active user is never logged out) or **absolute** (everyone signs in again every 30 days, however active)? | ✅ **Decided: rolling** (built in BE-01, migration 0019). A 7-day idle limit already logs out inactive users.                                                                                                                                                  | BE-01         |
| **D-2** | Keep **opaque tokens** (a database row, revocable instantly) or switch access tokens to **JWT**?                                                                                                    | ✅ **Decided: opaque, for both tokens** (built in BE-01). The API already checks the session on every request for row-level security, so a JWT saves nothing and loses instant "sign out that device".                                         | BE-01         |
| **D-3** | When **both** email and phone OTP are enabled, does the user **pick one**, or must they **verify both** at sign-up?                                                                                 | **Pick one.** The other can be added and verified later from Profile.                                                                                                                                             | BE-02, MOB-02 |
| **D-4** | Which **SMS provider** sends phone OTPs?                                                                                                                                                            | **MSG91** for India (DLT-registered template), with Twilio as an option for other countries. Needs a company account and a registered sender ID before go-live.                                                   | BE-09         |
| **D-5** | Can a user **change** their auto-generated username?                                                                                                                                                | ✅ **Decided: yes**, at most once every 14 days (`USERNAME_CHANGE_DAYS`), with an availability check. Built in BE-03.                                                                                                                                                  | BE-03, MOB-03 |
| **D-6** | In search, does **"people"** mean only **my saved members**, or also **other app users found by username** (like Instagram)?                                                                        | ✅ **Decided by the Search design (2026-11-17): my members only.** The People row shows a saved person ("Dad · Mike Carter · Austin, TX · 18 memories"), not an app user. Built in BE-07.                                              | BE-07, MOB-06 |
| **D-7** | **"Chats"** does not exist in the product yet. What is a chat?                                                                                                                                      | ✅ **Search part decided by the design:** its chips are All · People · Memories · **Dates**, with no Chats, so search has no chats section. ❓ **Still open:** the bottom nav has a **Chats** tab, and no chat feature is specified.                                                                           | BE-07, MOB-06 |
| **D-8** | What counts as an **upcoming moment**?                                                                                                                                                              | Sealed capsules I sent that have not opened yet, plus upcoming birthdays and anniversaries of my people and my own events. Soonest first, 5 items. ✅ **Built with this default** in BE-06 (types: capsule, birthday, anniversary, event). Revisit only if the Home screenshot shows something different.                     | BE-06, MOB-05 |
| **D-9** | Mobile split: are iOS (Swift) and Android (Kotlin) **separate codebases**?                                                                                                                          | If separate: **saig = iOS, saib = Android**, and each MOB ticket is created **twice**, once per platform, with the summary suffixed `(iOS)` / `(Android)`. If shared: one ticket each, split by feature as in §5. | all MOB       |
| **D-10** | What is an occasion's **preparation**? Home and Calendar show chips "✓ Voice note", "Card — not yet", "✓ Video", "Family video 4/7", "No gift" and buttons "Record voice", "Her wishlist". | No default: this is a new model. Which items exist, whether they belong to the occasion or the person, and what "done" means all need a product answer. Nothing is built. | BE-14, BE-19, BE-20 |
| **D-11** | **Built-in public holidays** ("St. Patrick's Day"): which countries, which data source, can a user hide them? | Until decided, only holidays the user adds (events of type `festival`) appear as `holiday`. | BE-16 |
| **D-12** | Calendar "Jump to": does **"5 dates"** count every date, or every day that has one? | Both are returned (`count`, `days`); the app shows whichever design picks. | MOB-09 |
| **D-13** | "**3 moments coming up this week**": the next 7 days, or the calendar week (Sun–Sat)? | ✅ **Built as the next 7 days** (`counts.next7Days`, named for what it is). Changing it is a new field, not a change. | BE-13, MOB-05 |
| **D-14** | Do **quiet hours** silence everything? | ✅ **Built:** they apply to every type a user may switch off. Failed deliveries, security and billing still come through. | BE-12 |

---

## 4. Order of work

```text
Wave 0 (days 1–2)   Decisions D-1…D-9 · Postman contracts for every BE ticket
                    · mobile and admin start against the Postman examples

Wave 1  ✅ done      BE-04 People API            BE-01 Sessions
                    BE-05 App version           BE-03 Usernames
                    BE-10 Events API            (all built by Akshara)

Wave 2              BE-06 Upcoming ✅ (Akshara)  BE-02 OTP channels (Akshara)
                    BE-07 Search (Omsai)        BE-09 SMS provider (Akshara)
                                                BE-08 Admin users & sessions API (Akshara)

Mobile and admin run alongside: each switches from Postman examples
to the real API as soon as its backend ticket is "done".
```

### Migration rule (important)

Everyone commits to `main`, and every green push to `main` deploys and migrates `mm_prod`. **Only one migration may be in flight at a time**, in this order:

| Slot | Migration                                                                                 | Owner   | Ticket        | Status                                   |
| ---- | ----------------------------------------------------------------------------------------- | ------- | ------------- | ---------------------------------------- |
| 1    | `app_versions` table                                                                      | Akshara | BE-05         | ✅ merged as `0020_app_versions`          |
| 2    | Sessions: refresh token, access expiry, `last_active_at`                                  | Akshara | BE-01         | ✅ merged as `0019_access_and_refresh_tokens` |
| 3    | `users.username` plus a backfill for existing users                                       | Akshara | BE-03         | ✅ merged as `0018_usernames` + `0021_username_rules` |
| 4    | OTP channel and phone: generalise `email_otps`, make `users.email` nullable, unique phone | Akshara | BE-02         | next free number (after 0022)            |
| 5    | Indexes for upcoming moments and search, if `EXPLAIN` shows they are needed               | Akshara / Omsai | BE-06 / BE-07 | ✅ upcoming merged as `0022_upcoming_moments`; search still open |

Before merging a migration: pull `main`, regenerate if another migration landed, run it on **local Docker** (never on `mm_prod` by hand), and have the database reviewer (or the database agent, §6) check its row-level security, grants and backfill.

---

## 5. Tickets

All tickets: **Milestone #2611.02 · Task Type: Task · Reproducibility: Have not tried · Severity: Low · Worked Hours: 0.** Only the fields that differ are listed in each card.

### Backend — Akshara

---

#### BE-01 · Access token (1 day) + refresh token (30 days) + 7-day idle logout

> **Status: ✅ done 2026-11-13** by Akshara, commit `5b465bd`. Migration `0019_access_and_refresh_tokens`. Decisions D-1 (rolling) and D-2 (opaque) applied. Tests in `backend/test/auth.e2e-spec.ts`, Postman folder `1 · Mobile API — sign in`.

| Summary                                                                      | Assign To      | Priority | Estimate | Tags                              |
| ---------------------------------------------------------------------------- | -------------- | -------- | -------- | --------------------------------- |
| `[BE-01] Access token (1 day) + refresh token (30 days) + 7-day idle logout` | Akshara Peraka | High     | 16:00    | `backend,auth,sessions,migration` |

**Description**

```text
Goal
Replace the single 30-day session token with two tokens: an access token that lasts 1 day and a refresh token that lasts 30 days. A session with no activity for 7 days is ended.

Background
Today POST /auth/verify returns one opaque token. It is valid for 30 days, and every request extends it (app_touch_session), so an idle user stays signed in for up to 30 days. Tokens stay opaque (database rows, revocable instantly), not JWT. See decision D-2.

Changes
1. Migration (slot 2): add these columns to sessions: access_token_hash, access_expires_at, refresh_token_hash, refresh_expires_at, last_active_at, rotated_at.
2. app_resolve_session accepts the ACCESS token only, and only while:
   - access_expires_at > now()
   - last_active_at > now() - 7 days
3. Update last_active_at at most once per hour per session, so there is no write on every request. Retire the 30-day extension in app_touch_session.
4. New endpoint POST /api/v1/auth/refresh (public). Each call returns a NEW access token and a NEW refresh token, and the old refresh token stops working.
   If an already-rotated refresh token is used again, treat it as stolen and revoke the whole session.
5. Add to config/env.schema.ts: ACCESS_TOKEN_HOURS (default 24), REFRESH_TOKEN_DAYS (default 30), SESSION_IDLE_DAYS (default 7). No other code reads them from process.env.

API
POST /api/v1/auth/verify   (existing; the response changes, a breaking change)
-> 200 {
     "accessToken": "...",  "accessExpiresAt": "2026-11-14T10:00:00Z",
     "refreshToken": "...", "refreshExpiresAt": "2026-12-13T10:00:00Z",
     "isNewAccount": true,
     "user": { "id": "...", "username": "aarav.k", "name": "..." }
   }

POST /api/v1/auth/refresh  { "refreshToken": "..." }
-> 200 same shape as /verify, without isNewAccount
-> 401 refresh token expired, idle over 7 days, revoked or reused. The client must log out.

Every authenticated endpoint keeps returning a plain 401 for every failure.
Client rule: on a 401, call /auth/refresh once and retry. If the refresh also returns 401, log out.

Acceptance criteria
- An access token is rejected 24 h after issue, and a refresh then works.
- A session with no request and no refresh for 7 days is rejected for both access and refresh.
- A refresh token used twice: the second use returns 401 AND the session is revoked.
- With rolling refresh (D-1), a user who is active every day is never logged out.
- sign-out and sign-out-others still take effect on the very next request.
- e2e tests move timestamps instead of sleeping.
- Postman: verify and refresh examples. The collection stores the tokens automatically for later requests.
```

**Steps To Reproduce** (how to test)

```text
1. POST /api/v1/auth/request-code, then /auth/verify. Expect accessToken + refreshToken in the response.
2. GET /api/v1/auth/me with the access token. Expect 200.
3. In local Docker, set access_expires_at to the past for that session. Repeat step 2: expect 401.
4. POST /auth/refresh with the refresh token. Expect a new pair. Step 2 with the new access token: expect 200.
5. POST /auth/refresh again with the OLD refresh token. Expect 401, and step 2 with the newest token now also returns 401 (session revoked).
6. New session: set last_active_at to 8 days ago. Expect /auth/me and /auth/refresh both to return 401.
7. npm run test:e2e: all green.
```

**Additional Information**

```text
Depends on: decisions D-1 (rolling vs absolute) and D-2 (opaque vs JWT).
Migration slot 2. Wait until slot 1 (BE-05) is merged.
Read first: backend/src/auth/*, migration 0009 (app_resolve_session, app_touch_session), backend/src/db/schema/identity.ts (sessions).
Breaking change for /auth/verify. Tell saig (MOB-02, MOB-07) when the Postman examples are updated.
```

---

#### BE-02 · OTP channel switch (email / phone) + phone accounts

| Summary                                               | Assign To      | Priority | Estimate | Tags                         |
| ----------------------------------------------------- | -------------- | -------- | -------- | ---------------------------- |
| `[BE-02] OTP over email or phone, switchable in .env` | Akshara Peraka | Normal   | 14:00    | `backend,auth,otp,migration` |

**Description**

```text
Goal
Sign-in codes can go to email or to a phone number. Which channels are on is set in .env, with no code change.

Changes
1. .env: AUTH_OTP_CHANNELS=email,phone (comma list, at least one). Declare it in env.schema.ts.
2. Migration (slot 4):
   - Generalise email_otps into a codes table with channel ('email'|'phone') and destination (an email address or an E.164 phone number).
   - Keep the existing rules: hashed code, 10-minute expiry, 5 attempts, 5 sends per hour per destination, one live code per destination.
   - users.email becomes nullable. Add a unique index on users.phone and a check that at least one of email or phone is set.
3. A phone sign-in finds or creates the account by phone.
4. New endpoint GET /api/v1/auth/config (public) so the app knows what to show.
5. Sending SMS is ticket BE-09. Until then, phone codes go through the "console" provider (printed to the log in development only).

API
GET /api/v1/auth/config
-> 200 { "otpChannels": ["email","phone"], "codeLength": 6, "resendAfterSeconds": 60 }

POST /api/v1/auth/request-code
  { "channel": "email", "email": "a@x.com" }
  { "channel": "phone", "phone": "+919876543210" }
-> 202 (always the same response, as today)
-> 400 if the channel is disabled in .env

POST /api/v1/auth/verify
  { "channel": "phone", "phone": "+919876543210", "code": "123456" }

Acceptance criteria
- With AUTH_OTP_CHANNELS=email, the phone channel returns 400 and /auth/config lists only email. The reverse also holds.
- Phone numbers are validated as E.164 and stored normalised.
- The rate limit and attempt limit apply to phone exactly as they do to email.
- The response never reveals whether an email or phone number has an account.
```

**Steps To Reproduce** (how to test)

```text
1. Set AUTH_OTP_CHANNELS=email and restart. GET /auth/config: expect only "email".
   Request a code with channel "phone": expect 400.
2. Set AUTH_OTP_CHANNELS=email,phone and restart. GET /auth/config: expect both.
3. Request a phone code for +919876543210. Read the code from the console log and verify it: expect tokens, and a new user with phone set and email empty.
4. Request 6 codes within an hour for the same number: the 6th sends nothing, and the response is still 202.
5. Enter a wrong code 5 times, then the right code: expect 401.
6. npm run test:e2e: all green.
```

**Additional Information**

```text
Depends on: D-3 (pick one vs verify both), BE-01 (the verify response shape).
Migration slot 4, after BE-03.
Read first: backend/src/auth/auth.service.ts, backend/src/db/schema/auth.ts (email_otps), migration 0009 (app_issue_email_code, app_redeem_email_code).
The SMS provider is a separate ticket: BE-09.
```

---

#### BE-09 · SMS provider integration for phone OTP

| Summary                                                       | Assign To      | Priority | Estimate | Tags                   |
| ------------------------------------------------------------- | -------------- | -------- | -------- | ---------------------- |
| `[BE-09] SMS provider integration (SmsService) for phone OTP` | Akshara Peraka | Normal   | 08:00    | `backend,auth,otp,sms` |

**Description**

```text
Goal
Actually deliver phone sign-in codes by SMS.

Changes
1. SmsService beside MailService, with providers: msg91 | twilio | console.
2. .env: SMS_PROVIDER plus each provider's keys (e.g. MSG91_AUTH_KEY, MSG91_TEMPLATE_ID, MSG91_SENDER_ID). Declare them all in env.schema.ts.
3. In production, refuse to boot if "phone" is in AUTH_OTP_CHANNELS while SMS_PROVIDER=console. This mirrors the existing mail rule.
4. The SMS text uses the DLT-registered template (India). The code is never logged in production.
5. A provider failure is logged with the provider's error code. The API response stays 202.

Acceptance criteria
- A real SMS arrives on a test number using the company account.
- Unit tests mock the provider HTTP call for both success and failure.
- Boot fails with a clear message for phone + console in production.
```

**Steps To Reproduce** (how to test)

```text
1. Set SMS_PROVIDER=msg91 with test keys and restart.
2. POST /auth/request-code with channel "phone" and your own number: an SMS arrives within 30 seconds.
3. Set NODE_ENV=production, SMS_PROVIDER=console, AUTH_OTP_CHANNELS=email,phone: the app refuses to start, and the error names SMS_PROVIDER.
```

**Additional Information**

```text
Depends on: D-4 (which provider), BE-02.
Needs from management: an MSG91 (or Twilio) account, a DLT entity, a sender ID and an approved template. These can take days, so request them now.
No migration.
```

---

#### BE-03 · Unique auto-generated username

> **Status: ✅ done 2026-11-15** by Akshara, commits `5b465bd` and `3a94f46`. Migrations `0018_usernames` and `0021_username_rules`. D-5 = yes, once every 14 days. Code in `backend/src/users/`, tests in `backend/test/users.e2e-spec.ts`, Postman folder `1c · Mobile API — username`.

| Summary                                                 | Assign To      | Priority | Estimate | Tags                      |
| ------------------------------------------------------- | -------------- | -------- | -------- | ------------------------- |
| `[BE-03] Unique auto-generated username for every user` | Akshara Peraka | High     | 10:00    | `backend,users,migration` |

**Description**

```text
Goal
Every user gets a unique username, generated automatically when sign-up succeeds (like Instagram).

Rules
- users.username: citext, unique, 3-30 characters, only a-z 0-9 . _
- It cannot start or end with "." and cannot contain "..".
- Reserved names are rejected: admin, support, mm, api, help, root, ... (keep the list in one constant).

Changes
1. Migration (slot 3): add users.username, backfill a username for every existing user, then set NOT NULL.
2. Generate it INSIDE the same database function that creates the account, so no user ever exists without one.
   Base it on the email local part or the name, falling back to "user". Lowercase it, strip invalid characters and truncate.
   If the result is taken, append random digits and retry.
3. Return username in /auth/verify (user object) and in GET /users/me.

API
GET   /api/v1/users/me                           -> includes "username"
GET   /api/v1/users/username-available?u=aarav.k
-> 200 { "available": false, "suggestions": ["aarav.k1","aarav.k_","aaravk"] }
PATCH /api/v1/users/me/username  { "username": "aarav.k" }   (only if D-5 = yes)
-> 200 | 409 taken | 422 invalid | 429 changed too recently

Acceptance criteria
- Every new account has a username the moment /auth/verify returns, including phone accounts.
- 1,000 sign-ups with the same email local part all succeed with distinct usernames (e2e test).
- Reserved and invalid names are rejected. Comparison is case-insensitive.
```

**Steps To Reproduce** (how to test)

```text
1. Sign up with aarav@x.com: the response includes user.username = "aarav".
2. Sign up with aarav@y.com: the username is "aarav" plus digits, not "aarav".
3. GET /users/username-available?u=ADMIN: available false.
4. (If D-5 = yes) PATCH a valid new name: 200. PATCH again immediately: 429.
5. After the migration on local Docker: SELECT count(*) FROM users WHERE username IS NULL returns 0.
```

**Additional Information**

```text
Depends on: D-5 (editable or not). It doesn't depend on D-5 for generation, so generation can start now.
Migration slot 3, after BE-01.
Read first: migration 0009 (app_redeem_email_code creates the user), backend/src/db/schema/identity.ts.
```

---

#### BE-08 · Admin API: users and sessions

| Summary                                              | Assign To      | Priority | Estimate | Tags                     |
| ---------------------------------------------------- | -------------- | -------- | -------- | ------------------------ |
| `[BE-08] Admin API: users search and session revoke` | Akshara Peraka | Normal   | 08:00    | `backend,admin,sessions` |

**Description**

```text
Goal
Endpoints for the admin panel's Users pages (ADM-02).

API (admin realm, runs as mm_admin, returns no vault content)
GET  /api/v1/admin/v1/users?q=&cursor=
     Searches by email, phone or username. Returns id, username, email, phone, sign-in channels used, created date, last active date and plan.
GET  /api/v1/admin/v1/users/:id/sessions
     Returns device / user agent, created date, last active date, expiry and revoked flag.
POST /api/v1/admin/v1/users/:id/sessions/revoke-all
     Ends every session for that user. Writes an audit log row (who, when, which user).

Acceptance criteria
- A non-admin token gets 401/403.
- revoke-all: the user's next mobile request returns 401.
- Each call is recorded in the audit log.
```

**Steps To Reproduce** (how to test)

```text
1. Sign in to the admin panel (email + TOTP).
2. GET /admin/v1/users?q=aarav: the user is listed with a username.
3. GET .../sessions: shows the session opened from the phone.
4. POST .../revoke-all, then call /auth/me with that phone's token: 401.
```

**Additional Information**

```text
Depends on: BE-01 (session columns), BE-03 (username).
Read first: backend/src/admin/* (admin auth, mm_admin rules).
No migration expected. If one is needed, it takes the next free slot.
```

---

### Backend — Akshara (moved from Omsai): People, Events, app version, upcoming moments

---

#### BE-04 · People (members) API ← the main feature in this round

> **Status: ✅ done 2026-11-17** by Akshara, commit `f2b3fd8`. Code in `backend/src/people/members.*`, tests in `backend/test/people.api.e2e-spec.ts`, Postman folder `1e · Mobile API — people`.

| Summary                                                    | Assign To      | Priority | Estimate | Tags                      |
| ---------------------------------------------------------- | -------------- | -------- | -------- | ------------------------- |
| `[BE-04] People (members) API: create, list, edit, delete` | Akshara Peraka | High     | 14:00    | `backend,people,capsules` |

**Description**

```text
Goal
The People API. Milestone capsules ("open when Aarav turns 18") need a person with a birthday, and capsule recipients can be people too.

API
GET    /api/v1/members?q=&cursor=&limit=20        (sorted by name)
POST   /api/v1/members
  { "name": "Aarav", "relationship": "son", "birthday": "2012-05-04",
    "birthdayPrecision": "day", "anniversary": null,
    "phone": "+91...", "email": "...", "notes": "...", "avatarMediaId": null }
GET    /api/v1/members/:id     (includes upcoming occasions and capsule counts)
PATCH  /api/v1/members/:id
DELETE /api/v1/members/:id
-> 409 { "reason": "member_has_capsules", "capsuleIds": [...] }
   if a milestone capsule or a pending delivery depends on this person

Rules
- relationship is one of: mother, father, son, daughter, spouse, partner, brother, sister, grandparent, grandchild, friend, other.
  Free text is allowed only with "other". Confirm the list against the People screen designs.
- A milestone capsule may reference a member only if that member's birthday is known to the DAY.
  The capsule endpoints must check this and return 422 otherwise.
- The owner comes from the session (row-level security). It is never taken from the request body.

Acceptance criteria
- Full create, read, update and delete with cursor paging.
- User A can never see user B's people (extend test/people.e2e-spec.ts).
- Deleting a person who has a sealed milestone capsule returns 409, not a database error.
- Sealing a milestone capsule for a person with no birthday, or only a year, returns 422.
- Postman examples exist for every endpoint.
```

**Steps To Reproduce** (how to test)

```text
1. As user A, POST /members (Aarav, son, birthday 2012-05-04, precision day): 201.
2. GET /members?q=aar: Aarav is listed.
3. As user B, GET /members/<Aarav id>: 404.
4. As user A, create a milestone capsule for Aarav (turns 18) and seal it. Then DELETE /members/<Aarav id>: 409 listing the capsule id.
5. Create a person with birthdayPrecision "year". A milestone capsule for them returns 422 on seal.
6. npm run test:e2e: all green.
```

**Additional Information**

```text
Depends on: nothing. Start first.
No migration needed (the table, row-level security and tests already exist).
Read first: backend/src/db/schema/people.ts, backend/src/db/schema/promises.ts (milestone_member_id, capsule_recipients.member_id), backend/src/capsules/*, test/people.e2e-spec.ts.
Publish the Postman examples on day 1. saib (MOB-04, MOB-08) builds against them.
```

---

#### BE-05 · App version API (iOS and Android separately)

> **Status: ✅ done 2026-11-14** by Akshara, commit `b2d7051`. Migration `0020_app_versions`. Code in `backend/src/app-version/` and `backend/src/admin/app-versions.controller.ts`, tests in `backend/test/app-versions.e2e-spec.ts`, Postman folder `1b · Mobile API — app version`.

| Summary                                                 | Assign To      | Priority | Estimate | Tags                                  |
| ------------------------------------------------------- | -------------- | -------- | -------- | ------------------------------------- |
| `[BE-05] App version API, separate for iOS and Android` | Akshara Peraka | High     | 08:00    | `backend,app-version,admin,migration` |

**Description**

```text
Goal
The mobile app asks the server whether it is up to date, and whether it must update. iOS and Android are tracked separately. The admin panel edits the values.

Changes
1. Migration (slot 1): an app_versions table with one row per platform:
   platform ('ios'|'android'), latest_version, min_supported_version, store_url, release_notes, updated_by, updated_at.
2. Versions are x.y.z and are compared numerically, not as text (1.10.0 is newer than 1.9.0).

API
GET /api/v1/app-version/ios?current=1.2.0        (public; no login needed)
GET /api/v1/app-version/android?current=1.2.0
-> 200 {
     "platform": "ios",
     "latestVersion": "1.4.0",
     "minSupportedVersion": "1.3.0",
     "updateAvailable": true,     // current < latest
     "forceUpdate": true,         // current < minSupported
     "storeUrl": "https://apps.apple.com/...",
     "releaseNotes": "..."
   }

GET /api/v1/admin/v1/app-versions              (admin; both platforms)
PUT /api/v1/admin/v1/app-versions/:platform    (admin; audit-logged)
-> 422 if minSupported > latest, or a version is not x.y.z

Acceptance criteria
- 1.10.0 counts as newer than 1.9.0.
- An unknown platform returns 404. A missing "current" returns the data with both flags false.
- Cache-Control allows caching for 5 minutes.
- Every admin change writes an audit log row: who, what, old and new values.
```

**Steps To Reproduce** (how to test)

```text
1. PUT /admin/v1/app-versions/ios { latest 1.4.0, minSupported 1.3.0, storeUrl, notes }: 200.
2. GET /app-version/ios?current=1.2.0: updateAvailable true, forceUpdate true.
3. GET /app-version/ios?current=1.3.5: updateAvailable true, forceUpdate false.
4. GET /app-version/ios?current=1.4.0: both false.
5. GET /app-version/windows: 404.
6. PUT with minSupported 2.0.0 and latest 1.4.0: 422.
```

**Additional Information**

```text
Depends on: nothing. Start first.
Migration slot 1. Merge it first so the other migrations can follow.
Used by: MOB-01 (saig), ADM-01 (Naveen). Publish the Postman examples on day 1.
```

---

#### BE-06 · Upcoming moments (5 items, for the Home screen)

> **Status: ✅ done 2026-11-16** by Akshara, commit `cb4256f`. Migration `0022_upcoming_moments`. Built with the D-8 default. Code in `backend/src/moments/`, tests in `backend/test/moments.e2e-spec.ts`, Postman folder `1d · Mobile API — home (upcoming moments)`.

| Summary                                           | Assign To      | Priority | Estimate | Tags                           |
| ------------------------------------------------- | -------------- | -------- | -------- | ------------------------------ |
| `[BE-06] Upcoming moments API (5 items for Home)` | Akshara Peraka | Normal   | 10:00    | `backend,home,capsules,people` |

**Description**

```text
Goal
The Home screen shows the next 5 upcoming moments.

API
GET /api/v1/moments/upcoming?limit=5      (default 5, max 20)
-> 200 { "items": [
     { "type": "capsule",  "id": "...", "title": "For Aarav at 18",
       "date": "2030-05-04", "daysLeft": 1268,
       "person": { "id": "...", "name": "Aarav", "avatarUrl": "..." } },
     { "type": "birthday", "id": "<memberId>", "title": "Mom's birthday",
       "date": "2026-11-20", "daysLeft": 7, "person": { ... } }
   ] }
type is one of: capsule, birthday, anniversary, event.

Sources (pending decision D-8)
- Sealed, undelivered capsules I own: unlock_at, or the milestone date worked out from the member's birthday.
- The next birthday or anniversary of each of my people.
- My upcoming events.

Rules
- Dates are calculated in the user's timezone (users.timezone).
- A 29 February birthday falls on 28 February in non-leap years.
- Sorted by date ascending, ties broken by type then title. Returns exactly "limit" items or fewer.

Acceptance criteria
- Timezone edge cases are tested (a user in Asia/Kolkata at 23:30 UTC).
- An empty account returns items: [].
- The query does not scan every member (check with EXPLAIN).
```

**Steps To Reproduce** (how to test)

```text
1. Seed: a person with a birthday in 7 days, a person with a birthday in 40 days, a capsule unlocking in 3 days, an event in 10 days, and 3 more far-off items.
2. GET /moments/upcoming: exactly 5 items, in the order 3, 7, 10, 40 days, ...
3. A new account with no data: items [].
4. npm run test:e2e: all green.
```

**Additional Information**

```text
Depends on: D-8 (what counts as a moment; the Home screenshot settles it), BE-04.
May need migration slot 5 for an index. Check EXPLAIN first.
Used by: MOB-05 (saib).
```

---

#### BE-10 · Events API (occasions: birthdays, anniversaries, festivals, custom)

> **Status: ✅ done 2026-11-17** by Akshara, commit `f2b3fd8` (together with BE-04). This ticket was added afterwards so the work is tracked. Code in `backend/src/people/events.*`, tests in `backend/test/people.api.e2e-spec.ts`, Postman folder `1f · Mobile API — events`.

| Summary                                                          | Assign To      | Priority | Estimate | Tags                         |
| ---------------------------------------------------------------- | -------------- | -------- | -------- | ---------------------------- |
| `[BE-10] Events API: create, list, edit, archive, restore`       | Akshara Peraka | High     | 08:00    | `backend,people,events,home` |

**Description**

```text
Goal
The user's own occasions (a birthday, an anniversary, a festival, or anything custom), optionally linked to people. Upcoming moments (BE-06) reads them.

API
GET    /api/v1/events?type=&memberId=&q=&archived=false&cursor=&limit=20   (sorted by date)
POST   /api/v1/events
  { "title": "Mom & Dad's anniversary", "type": "anniversary", "eventDate": "1995-02-14",
    "recurrence": "yearly", "allDay": true, "notes": "...", "memberIds": ["...", "..."] }
GET    /api/v1/events/:id        (includes the linked people)
PATCH  /api/v1/events/:id        (send at least one field)
DELETE /api/v1/events/:id        -> 204, archives the event (it is not deleted)
POST   /api/v1/events/:id/restore -> 200, brings an archived event back

Rules
- type: birthday | anniversary | festival | custom (default custom).
- recurrence: none | yearly | monthly (default none). Occurrences are calculated from eventDate. They are not stored as rows.
- eventDate must be a real date, YYYY-MM-DD.
- memberIds: up to 20 people, with no repeats, and all must be the caller's own people (otherwise 422).
- The owner comes from the session (row-level security). It is never taken from the request body.

Acceptance criteria
- Create, read, update, archive and restore, with cursor paging and filters.
- User A can never see or link user B's events or people.
- Archived events are hidden from the default list and from upcoming moments, and come back on restore.
```

**Steps To Reproduce** (how to test)

```text
1. POST /events (anniversary, yearly, linked to two of your people): 201, and the response lists both people.
2. GET /events?type=anniversary: the event is listed.
3. POST /events with a memberId that belongs to another user: 422.
4. DELETE /events/<id>: 204. GET /events: gone. GET /events?archived=true: listed.
5. POST /events/<id>/restore: 200, and it is back in the default list.
6. npm run test:e2e: all green.
```

**Additional Information**

```text
Depends on: BE-04 (people to link).
No migration (the events and event_members tables already existed).
Used by: BE-06 (upcoming moments). Mobile and admin screens for events are not ticketed yet. Add them when the designs arrive.
```

---

### Backend — search

---

#### BE-07 · Search: people, chats, moments

> **Status: ✅ done 2026-11-17** by Subbu (lead, with Claude), as part of the screen-coverage work. The Search design settled D-6 and D-7, and it differs from this card: the sections are **people, memories, dates** (no chats). The actual contract is `GET /search` in [SCREEN_API_MAP.md](SCREEN_API_MAP.md) §2 S3 and Postman folder `1h · Mobile API — search`. Code in `backend/src/search/`, tests in `backend/test/screens.e2e-spec.ts`. The card below is kept as written. Speed at 10,000+ memories is ticket BE-17.

| Summary                                      | Assign To | Priority | Estimate | Tags             |
| -------------------------------------------- | --------- | -------- | -------- | ---------------- |
| `[BE-07] Search API: people, memories, dates` | Subbu     | Normal   | 12:00    | `backend,search` |

**Description**

```text
Goal
One search endpoint for the Search screen, returning people, chats and moments in sections.

API
GET /api/v1/search?q=aar&types=people,moments,chats&limit=5
-> 200 {
     "people":  { "items": [ { "id","name","relationship","avatarUrl" } ], "nextCursor": "..." },
     "moments": { "items": [ { "id","type":"memory|capsule","title","date","thumbnailUrl" } ], "nextCursor": null },
     "chats":   { "items": [], "nextCursor": null }
   }
GET /api/v1/search?q=aar&types=people&cursor=...    ("See all" on one tab)

Rules
- q: at least 2 characters (otherwise 422), at most 100.
- People: trigram match on member name (scope pending D-6).
- Moments: the existing memories.search_text full-text and trigram indexes, plus capsule titles.
- Chats: always [] until D-7 is decided. The shape stays fixed so mobile will not need to change later.
- Row-level security limits results to what the caller can see. Do not add any owner filter that comes from the request.

Acceptance criteria
- Under 300 ms p95 on 10,000 memories (EXPLAIN ANALYZE on seed data).
- User A never sees user B's results.
- q of 1 character returns 422.
```

**Steps To Reproduce** (how to test)

```text
1. Seed: a person "Aarav", a memory titled "Aarav's first day at school", a capsule titled "For Aarav at 18".
2. GET /search?q=aar: Aarav in people, the memory and the capsule in moments, chats [].
3. GET /search?q=aar&types=people: only the people section.
4. GET /search?q=a: 422.
5. As another user, GET /search?q=aar: all sections empty.
```

**Additional Information**

```text
Depends on: D-6 (people scope), D-7 (chats), BE-04.
Read first: migration 0004 (search_text, pg_trgm, the tsvector index).
May need migration slot 5 for a trigram index on members.name.
Used by: MOB-06 (saib).
```

---

### Backend — screen coverage (designs of 2026-11-17)

> Source: the Home, Notifications, Search and Calendar designs, audited screen by screen in [SCREEN_API_MAP.md](SCREEN_API_MAP.md). BE-11 to BE-13 are built. BE-14 to BE-21 are the gaps that remain.

---

#### BE-11 · Calendar API: month, year, list, "Jump to"

> **Status: ✅ done 2026-11-17** by Subbu (with Claude). Code in `backend/src/calendar/`, Postman folder `1g · Mobile API — calendar`, tests in `backend/test/screens.e2e-spec.ts`.

| Summary | Assign To | Priority | Estimate | Tags |
| --- | --- | --- | --- | --- |
| `[BE-11] Calendar API: occurrences by range, per-month summary` | Subbu | High | 12:00 | `backend,calendar,people,events,capsules` |

**Description**

```text
Goal
The Calendar tab (month grid, year view, list view with chips and search, "Jump to" sheet).

API
GET /api/v1/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&types=&q=
-> 200 { from, to, today, items: [ { type, source, id, title, date, daysLeft, turns,
                                     recurrence, capsuleState, person{ id, name, nickname,
                                     displayName, location, avatarUrl, deceased } } ] }
   types: birthday | anniversary | event | holiday | capsule (comma list; absent = all)
   at most 366 days; to before from, a missing bound, a bad date or an unknown type -> 400
GET /api/v1/calendar/summary?year=2026&types=
-> 200 { year, today, months: [ { month, count, days, byType } x 12 ] }

Rules (shared with upcoming moments, so the screens never disagree)
- Birthdays known only to the month or year are not placed.
- Yearly and monthly events repeat; nothing repeats before it first happened.
- 29 February falls on 28 February in common years. Dates are days in the user's timezone.
- holiday = my events of type festival (no built-in catalogue yet: BE-16).
- Capsules: sealed, delivering, delivered, opened (not drafts, cancelled or failed).
```

**Steps To Reproduce** (how to test)

```text
1. Add people with birthdays in March, a yearly festival event, a monthly event and a sealed capsule.
2. GET /calendar?from=2026-03-01&to=2026-03-31: every date in order, with turns on birthdays.
3. GET /calendar?...&types=birthday&q=birthday: only birthdays.
4. GET /calendar/summary?year=2026: 12 months; March count and days match step 2.
5. GET /calendar?from=2026-01-01&to=2027-01-02: 400.
```

**Additional Information**

```text
Performance: about 60-120 ms for a month or a year with 500 people and 200 events (local).
It was 2.5-3 s before PostgreSQL JIT was switched off for these queries (common/no-jit.ts).
Open: D-12 (does "5 dates" mean count or days). Both are returned.
```

---

#### BE-12 · Notification centre API

> **Status: ✅ done 2026-11-17** by Subbu (with Claude). Code in `backend/src/notifications/`, Postman folder `1i · Mobile API — notifications`.

| Summary | Assign To | Priority | Estimate | Tags |
| --- | --- | --- | --- | --- |
| `[BE-12] Notifications: list, unread count, mark read, quiet hours` | Subbu | High | 08:00 | `backend,notifications` |

**Description**

```text
Goal
The Notifications screen and Home's bell dot.

API
GET    /api/v1/notifications?cursor=&limit=20&unread=false   newest first, keyset-paged
       items: id, type, title, body, actor{memberId, name, avatarUrl}, deepLink, read, readAt, createdAt, data
GET    /api/v1/notifications/unread-count                     -> { unread }
POST   /api/v1/notifications/:id/read                         -> 204 (idempotent; not mine -> 404)
POST   /api/v1/notifications/read-all                         -> { updated }
GET    /api/v1/notifications/preferences                      -> { quietHours, types[] }
PUT    /api/v1/notifications/preferences/quiet-hours  { "start": "22:00", "end": "07:00" }
DELETE /api/v1/notifications/preferences/quiet-hours

Rules
- The app only reads and marks read. Rows are created by background jobs (BE-15).
- payload contract for those jobs: { title, body, memberId (the avatar), actorName, ...extras }.
  Missing title -> a default per type.
- Quiet hours apply to every type a user may switch off (D-14).
```

**Steps To Reproduce** (how to test)

```text
1. Insert notifications for your user (no job creates them yet). GET /notifications: newest first.
2. GET /notifications/unread-count: matches. POST /:id/read twice: 204 both times.
3. POST /read-all: { updated: n }; unread-count is 0.
4. PUT quiet hours 22:00-07:00; GET preferences shows them; DELETE clears them.
```

**Additional Information**

```text
Without BE-15 the screen works but is empty in real use.
The Settings screen (per-type switches) is not designed yet; the switches are listed but not editable (P-10).
```

---

#### BE-13 · People and Home fields: nickname, location, memory count, avatar, week count

> **Status: ✅ done 2026-11-17** by Subbu (with Claude). Migration `0023_member_nickname_location` (additive, nullable).

| Summary | Assign To | Priority | Estimate | Tags |
| --- | --- | --- | --- | --- |
| `[BE-13] Nickname, location, memoryCount, users/me avatar, upcoming counts/turns/types` | Subbu | High | 06:00 | `backend,people,home,migration` |

**Description**

```text
Goal
The fields the designs show that the APIs did not return.

Changes (all additive)
- members.nickname ("Mom", <= 64) and members.location ("Austin, TX", <= 120): accepted by
  POST/PATCH /members; returned with displayName (nickname or name) and memoryCount.
  GET /members?q= also matches the nickname.
- GET /users/me: + avatarUrl, + timezone.
- GET /moments/upcoming: + ?types= (Home's "Sending soon" uses types=capsule),
  + counts.next7Days ("3 moments coming up this week", D-13), + turns (age or years),
  + person.nickname / displayName / location. Titles use the nickname when set.
```

**Steps To Reproduce** (how to test)

```text
1. POST /members { name: "Linda Carter", nickname: "Mom", location: "Austin, TX", birthday }.
2. GET /moments/upcoming: "Mom's birthday", turns, person.location; counts.next7Days.
3. GET /moments/upcoming?types=capsule: capsules only.
4. GET /users/me: avatarUrl and timezone present.
```

**Additional Information**

```text
Migration 0023 takes the next free migration slot. It has no backfill.
```

---

#### BE-14 · Occasion preparation (voice note, card, video, gift status)

| Summary | Assign To | Priority | Estimate | Tags |
| --- | --- | --- | --- | --- |
| `[BE-14] Occasion preparation: items and their status per occasion` | Omsai | Normal | 16:00 | `backend,home,calendar,occasions,needs-decision` |

**Description**

```text
Goal
Home and Calendar show, for an upcoming occasion, what has been prepared:
"✓ Voice note", "Card — not yet", "✓ Video", "No gift", and the buttons "Record voice" and "Her wishlist".

Needed before building (D-10)
- Which preparation items exist (voice note, card, video, gift)? Can a user add others?
- Are they per occasion (Dad's 60th) or per person?
- What makes one "done": a recording attached, a capsule sealed, a gift bought?
- Does a voice note become a memory, or a capsule that is delivered on the day?

Likely shape (to confirm)
- A table linking an occasion (member birthday/anniversary for a year, or an event occurrence)
  to items with a kind and a status, and to the memory or capsule that fulfils it.
- GET /occasions/:key/preparation, POST/PATCH items; the prep summary returned inline in
  GET /moments/upcoming and GET /calendar items.
```

**Steps To Reproduce** (how to test)

```text
To be written once D-10 is decided.
```

**Additional Information**

```text
Blocked by D-10. Related: BE-19 (family video) and BE-20 (gift / wishlist) are parts of the same chips.
```

---

#### BE-15 · Notification producers (the jobs that create notifications)

| Summary | Assign To | Priority | Estimate | Tags |
| --- | --- | --- | --- | --- |
| `[BE-15] Worker: create notifications (reminders, replies, deliveries)` | Omsai | High | 16:00 | `backend,worker,notifications` |

**Description**

```text
Goal
Fill the notification centre (BE-12). Today nothing writes to the notifications table.

Producers, in the worker (role mm_worker may INSERT notifications)
- occasion_reminder: "Dad turns 60 in 6 days" from event_reminders / member birthdays.
- capsule_reply: "Mom loved your video" when a recipient replies (capsule_replies).
- capsule_delivered: "Delivered to Grandma by email", including a fallback note
  ("Text didn't go through, we switched automatically") from delivery_attempts.
- capsule_failed (not suppressible).

Each row: payload { title, body, memberId?, actorName?, ...extras }, deep_link, and
channels_sent once push or email has gone out. Respect notification_preferences and quiet hours.
```

**Steps To Reproduce** (how to test)

```text
1. Seal a capsule to a person and let the worker deliver it locally: a capsule_delivered row appears.
2. Reply as the recipient: a capsule_reply row with the person's memberId.
3. A birthday 6 days away: one occasion_reminder, not one per run.
```

**Additional Information**

```text
Push sending itself is PHASE-07 (APNs/FCM). Writing the rows does not wait for it.
Never run the dev worker against mm_prod: it marks capsules delivered without sending.
```

---

#### BE-16 · Built-in public holidays

| Summary | Assign To | Priority | Estimate | Tags |
| --- | --- | --- | --- | --- |
| `[BE-16] Holiday catalogue for the calendar (by country)` | Omsai | Low | 08:00 | `backend,calendar,needs-decision` |

**Description**

```text
Goal
"St. Patrick's Day · Tue, Mar 17" without the user adding it.
Needs D-11: which countries (user's locale? a setting?), which data source (bundled list or a
licensed API), and whether a user can hide holidays. Output: holiday items in GET /calendar,
/calendar/summary and search "dates", type "holiday", with source "holiday".
```

**Steps To Reproduce** (how to test)

```text
To be written once D-11 is decided.
```

**Additional Information**

```text
Blocked by D-11.
```

---

#### BE-17 · Fast memory search at scale

| Summary | Assign To | Priority | Estimate | Tags |
| --- | --- | --- | --- | --- |
| `[BE-17] Indexed memory search: maintain search_text, RLS-friendly query` | Omsai | Normal | 12:00 | `backend,search,database,performance` |

**Description**

```text
Goal
GET /search under 300 ms with 10,000+ memories. Today it is ~900 ms end to end locally,
~410 ms of that in the memories query.

Findings
- Row-level security calls app_vault_role() for every memory row before ILIKE can filter.
- memories.search_text is never written by any code, so its indexes are empty.
- Its trigram index cannot be used by app queries anyway: ILIKE is not leakproof, so
  PostgreSQL will not apply it before the RLS check.
- A set-based query (join on vault_members) without RLS measured 209 ms.

Proposal (needs the database review)
1. Keep search_text current (title, note, tagged people's names and nicknames, place):
   trigger or service, plus a backfill.
2. A SECURITY DEFINER function returning matching memory ids for the current user via a
   vault_members join (equivalent to the memories_read policy), using a full-text index.
3. Fetch the final rows through RLS as today.
```

**Steps To Reproduce** (how to test)

```text
1. The scale test in backend/test/screens.e2e-spec.ts ("at scale"): search "All" < 300 ms.
2. Search still never returns another family's memories, or memories from a revoked vault membership.
```

**Additional Information**

```text
Security-sensitive: the function must match memories_read exactly (revoked_at IS NULL).
```

---

#### BE-18 · Trusted people (legacy) invitations

| Summary | Assign To | Priority | Estimate | Tags |
| --- | --- | --- | --- | --- |
| `[BE-18] Trusted person requests: invite, accept, decline` | — | Low | 16:00 | `backend,legacy,release-3` |

**Description**

```text
Notification "Olivia asked you to be a trusted person for her memories" with Accept / Not now.
This is the Legacy Vault / nominees feature (PHASE-12, Release 3). Needs its own spec:
what a trusted person can do, when, and how they are verified.
```

**Steps To Reproduce** (how to test)

```text
To be written with the Release 3 spec.
```

**Additional Information**

```text
Not in Release 1. Listed so the design is not lost.
```

---

#### BE-19 · Collaborative family video (clip contributions)

| Summary | Assign To | Priority | Estimate | Tags |
| --- | --- | --- | --- | --- |
| `[BE-19] Family video: invite contributors, collect clips, progress (4 of 7)` | — | Low | 20:00 | `backend,capsules,collaboration,release-2` |

**Description**

```text
"Jake added a clip to Dad's video · 5 of 7 clips are in" and the "Family video 4/7" chip.
Collaborative capsules are Release 2 (PHASE-11, "Together"). Needs a spec for inviting
contributors (with or without accounts), uploads into someone else's capsule, and completion.
```

**Steps To Reproduce** (how to test)

```text
To be written with the Release 2 spec.
```

**Additional Information**

```text
Part of D-10 (the preparation chips).
```

---

#### BE-20 · Wishlist and gifts

| Summary | Assign To | Priority | Estimate | Tags |
| --- | --- | --- | --- | --- |
| `[BE-20] Person wishlist and gift status` | — | Low | 16:00 | `backend,people,gifting,release-3` |

**Description**

```text
"Her wishlist" button and "No gift" / "gift not picked yet". Gifting is Release 3
(PHASE-12 commerce). A simple wishlist per person (free-text items, links) could come earlier
if the product wants it; that is part of D-10.
```

**Steps To Reproduce** (how to test)

```text
To be written once scoped.
```

**Additional Information**

```text
Part of D-10.
```

---

#### BE-21 · AI Helper

| Summary | Assign To | Priority | Estimate | Tags |
| --- | --- | --- | --- | --- |
| `[BE-21] AI Helper: natural-language questions over memories` | — | Low | 20:00 | `backend,ai,release-2` |

**Description**

```text
The centre nav button "AI Helper" and Search's "Ask AI Helper: Show Dad's best moments".
Release 2 AI layer (PHASE-11, MOD-11-03), priced as AI credits (blueprint §17.2). Needs its
own spec: data it may read, model, cost per question, privacy.
```

**Steps To Reproduce** (how to test)

```text
To be written with the Release 2 spec.
```

**Additional Information**

```text
Not in Release 1.
```

---

### Mobile — saig

> If D-9 = separate codebases, create each MOB ticket **twice**, `(iOS)` assigned to saig and `(Android)` assigned to saib, with the same estimate each.

---

#### MOB-01 · App version check and force update

| Summary                                                      | Assign To | Priority | Estimate | Tags                 |
| ------------------------------------------------------------ | --------- | -------- | -------- | -------------------- |
| `[MOB-01] App version check: force update and update banner` | saig      | High     | 06:00    | `mobile,app-version` |

**Description**

```text
Goal
The app checks its version against the server and forces an update when it is too old.

Behaviour
1. On launch and on return to the foreground (at most once an hour), call:
   GET /api/v1/app-version/{ios|android}?current=<build version>
2. forceUpdate = true: show a full-screen blocking screen with one "Update" button that opens storeUrl. It cannot be dismissed (no back, no swipe).
3. updateAvailable = true only: show a dismissible banner "A new version is available". Remember the dismissal for that version only.
4. If the network fails, do not block the app.

Acceptance criteria
- All three states shown against the Postman mock or the real API.
- Back button / swipe cannot get past the force-update screen.
```

**Steps To Reproduce** (how to test)

```text
1. Admin sets minSupported above the installed version: the app opens to the blocking screen, and Update opens the store.
2. Admin sets minSupported below and latest above the installed version: a banner appears. Dismiss it, relaunch: no banner.
3. Admin raises latest again: the banner returns.
4. Airplane mode, launch: the app works normally.
```

**Additional Information**

```text
Depends on: the BE-05 contract (Postman examples). Can start now.
```

---

#### MOB-02 · Sign-in and OTP screens (channel driven by server)

| Summary                                                        | Assign To | Priority | Estimate | Tags              |
| -------------------------------------------------------------- | --------- | -------- | -------- | ----------------- |
| `[MOB-02] Sign-in and OTP screens, channels from /auth/config` | saig      | High     | 12:00    | `mobile,auth,otp` |

**Description**

```text
Goal
The login screen shows email, phone, or a choice of the two, depending on what the server allows. Never hard-coded.

Behaviour
1. Before showing login, call GET /api/v1/auth/config. Show:
   - otpChannels ["email"]          -> email field
   - otpChannels ["phone"]          -> phone field with a country code picker (outputs E.164, e.g. +919876543210)
   - otpChannels ["email","phone"]  -> a toggle between the two (per D-3)
2. POST /auth/request-code with { channel, email | phone }.
3. OTP screen: 6 boxes (length from codeLength), SMS autofill (Android SMS Retriever, iOS one-time-code), a resend timer from resendAfterSeconds.
4. POST /auth/verify, then hand the tokens to MOB-07. isNewAccount = true goes to onboarding, otherwise to Home.
5. A 401 on verify shows "That code is not valid." Never more detail than that.

Acceptance criteria
- Switching AUTH_OTP_CHANNELS on the server changes the screen after an app restart, with no app release.
- Autofill works on a real device for SMS.
```

**Steps To Reproduce** (how to test)

```text
1. Server with email only: the login screen shows only email. Sign in end to end.
2. Server with email,phone: the toggle shows. Sign in by phone, and the code autofills from SMS.
3. Enter a wrong code: the error appears and you can retry.
4. Resend is disabled until the timer ends.
```

**Additional Information**

```text
Depends on: D-3, the BE-02 contract (/auth/config, channel field), the BE-01 contract (the verify response).
Token storage and refresh are a separate ticket: MOB-07.
```

---

#### MOB-07 · Token storage, refresh and 7-day idle logout

| Summary                                                           | Assign To | Priority | Estimate | Tags                   |
| ----------------------------------------------------------------- | --------- | -------- | -------- | ---------------------- |
| `[MOB-07] Secure token storage, auto refresh on 401, idle logout` | saig      | High     | 10:00    | `mobile,auth,sessions` |

**Description**

```text
Goal
Keep the user signed in correctly: a 1-day access token, a 30-day refresh token, and logout after 7 days of inactivity.

Behaviour
1. Store both tokens in Keychain (iOS) / EncryptedSharedPreferences or Keystore (Android). Never in plain preferences or logs.
2. HTTP interceptor: send "Authorization: Bearer <accessToken>".
3. On a 401: make ONE call to POST /auth/refresh, then retry the original request.
   Concurrent requests must share the same refresh call (no parallel refreshes, because reusing a refresh token revokes the session).
4. If the refresh returns 401: clear the tokens and go to the login screen with the message "Please sign in again".
5. Save the time of the last API activity. On app open, if it was more than 7 days ago, go straight to login. (Convenience only; the server enforces this regardless.)
6. Sign out: call POST /auth/sign-out, then clear the tokens.

Acceptance criteria
- Firing 5 requests at once with an expired access token produces exactly 1 refresh call.
- Tokens are not readable from a backup or a log.
```

**Steps To Reproduce** (how to test)

```text
1. Sign in. Ask backend to expire the access token (local DB): the next screen loads normally (refresh happened silently).
2. Ask backend to revoke the session: the next request returns to login.
3. Open a screen that makes several API calls with an expired access token: the network log shows 1 refresh call.
4. Set the device clock 8 days ahead and open the app: login screen.
```

**Additional Information**

```text
Depends on: the BE-01 contract.
Coordinate with BE-01: the refresh token is single-use, so any parallel refresh logs the user out.
```

---

#### MOB-03 · Profile: username

| Summary                                      | Assign To | Priority | Estimate | Tags                   |
| -------------------------------------------- | --------- | -------- | -------- | ---------------------- |
| `[MOB-03] Profile: show and change username` | saig      | Normal   | 06:00    | `mobile,profile,users` |

**Description**

```text
Goal
Show @username on the profile. If D-5 = yes, let the user change it.

Behaviour
1. Profile shows @username from GET /users/me.
2. (If D-5 = yes) The edit screen checks availability as you type (400 ms debounce) via GET /users/username-available, and shows suggestions as tappable chips.
3. Client-side rules match the server: 3-30 characters, a-z 0-9 . _, no leading/trailing dot, no "..". Input is lowercased automatically.
4. Errors: 409 "That username is taken", 422 "Only letters, numbers, . and _", 429 "You can change your username again on <date>".
```

**Steps To Reproduce** (how to test)

```text
1. A new account: the profile shows an auto-generated @username.
2. Type "ADMIN": shown as "admin", not available, with suggestions.
3. Choose a free name and save: the profile updates. Try again immediately: the 429 message appears.
```

**Additional Information**

```text
Depends on: D-5, the BE-03 contract.
```

---

### Mobile — saib

---

#### MOB-04 · People screens (list, add/edit, detail)

> **Update 2026-11-17:** add two fields to add/edit person: **"What do you call them?"** (`nickname`, e.g. Mom) and **City** (`location`). Lists and cards lead with `displayName` (nickname or name) and show `name · location` under it. Person detail can show `memoryCount` ("18 memories"). BE-04 is live with these fields (BE-13).

| Summary                                                         | Assign To | Priority | Estimate | Tags            |
| --------------------------------------------------------------- | --------- | -------- | -------- | --------------- |
| `[MOB-04] People screens: list, add/edit person, person detail` | saib      | High     | 16:00    | `mobile,people` |

**Description**

```text
Goal
The People section of the app.

Screens
1. People list: a search box, alphabetical list with avatar, name and relationship, and an empty state with "Add your first person".
   GET /api/v1/members?q=&cursor= (infinite scroll).
2. Add / edit person: name (required), relationship (picker; "Other" opens free text), birthday with an "I only know the year" switch (sends birthdayPrecision "year"), anniversary, phone, email, photo, notes.
   POST /members, PATCH /members/:id.
3. Person detail: photo, details, upcoming occasions, capsules for this person. Edit and Delete buttons.
4. Delete: confirm first. On a 409 show "This person has N capsules waiting" with a link to those capsules.

Acceptance criteria
- All screens work against the Postman examples, then against the real API.
- Validation messages match the server's 422 responses.
```

**Steps To Reproduce** (how to test)

```text
1. Add Aarav (son, birthday 4 May 2012): appears in the list.
2. Search "aar": filters to Aarav.
3. Edit the relationship to "Other: nephew": saved and shown.
4. Delete a person who has a sealed milestone capsule: the 409 message with a link.
5. Delete a person with no capsules: removed from the list.
```

**Additional Information**

```text
Depends on: the BE-04 contract. Can start now.
Layouts: waiting for the People screen designs/screenshot (§8).
The capsule flow picker is a separate ticket: MOB-08.
```

---

#### MOB-08 · Capsule flow: choose person + milestone birthday

| Summary                                                              | Assign To | Priority | Estimate | Tags                     |
| -------------------------------------------------------------------- | --------- | -------- | -------- | ------------------------ |
| `[MOB-08] Capsule flow: person picker and milestone birthday prompt` | saib      | High     | 06:00    | `mobile,people,capsules` |

**Description**

```text
Goal
When creating a capsule, choose a person as the recipient or as the milestone person.

Behaviour
1. A "Choose person" picker (search + list from GET /members) with "+ Add person" inline, which opens the add screen from MOB-04 and returns to the picker.
2. Milestone capsule (e.g. "when Aarav turns 18"): if the person has no full birthday (missing, or year only), ask for it right there and PATCH the person before continuing.
3. Show the calculated unlock date: "Opens on 4 May 2030".

Acceptance criteria
- A milestone capsule cannot be sealed from the app for a person without a full birthday.
```

**Steps To Reproduce** (how to test)

```text
1. Create a capsule and choose recipient Aarav from the picker.
2. Choose "Milestone: turns 18" for a person with only a birth year: the app asks for the full date, then shows "Opens on ...".
3. Use "+ Add person" from the picker: the new person is selected on return.
```

**Additional Information**

```text
Depends on: MOB-04, the BE-04 contract.
```

---

#### MOB-05 · Home: upcoming moments

> **Update 2026-11-17 (Home design):**
> - Header: greeting from `GET /users/me` (`name`, `avatarUrl`). The bell dot comes from `GET /notifications/unread-count`.
> - "3 moments coming up this week" = `counts.next7Days`.
> - "Up next" carousel: card title from `title` ("Mom's birthday"), or "Dad turns 60" from `person.displayName` + `turns`. Under it, `person.name · person.location`, the photo `person.avatarUrl`, and "Tue, Mar 17 · in 2 days" from `date` / `daysLeft`.
> - "Sending soon" row: `GET /moments/upcoming?types=capsule&limit=10`.
> - The prep chips (Voice note, Card), "Record voice" and "Her wishlist" have **no API yet** (BE-14, D-10). Hide them or show them disabled.
> - Estimate raised from 08:00 to 12:00.

| Summary                                           | Assign To | Priority | Estimate | Tags          |
| ------------------------------------------------- | --------- | -------- | -------- | ------------- |
| `[MOB-05] Home: upcoming moments cards (5 items)` | saib      | Normal   | 08:00    | `mobile,home` |

**Description**

```text
Goal
A row of upcoming moment cards on the Home screen.

Behaviour
1. GET /api/v1/moments/upcoming?limit=5.
2. A horizontal list of cards. Each card shows the type icon (capsule / birthday / anniversary / event), title, person avatar and the time left: "Today", "Tomorrow", "in 7 days", or the date when more than 30 days away.
3. Tapping a capsule opens the capsule. Tapping a birthday or anniversary opens the person.
4. Empty state: "Nothing coming up" with a "Create a capsule" button.
5. Refresh on pull-to-refresh and when returning to Home.
```

**Steps To Reproduce** (how to test)

```text
1. With seeded data: 5 cards in date order.
2. Tap a birthday card: the person opens.
3. A new account: the empty state with the button.
4. Add a person whose birthday is tomorrow, then return to Home: a "Tomorrow" card appears.
```

**Additional Information**

```text
Depends on: D-8, the BE-06 contract.
Layout: waiting for the Home screenshot (§8).
```

---

#### MOB-06 · Search screen

> **Update 2026-11-17 (Search design), which replaces the tabs below:** the chips are **All · People · Memories · Dates**. There is no Chats tab.
> - API: `GET /search?q=&types=people,memories,dates&limit=5`. For "See all", send one type with `cursor`.
> - People row: `displayName` · `name` · `location` · "`memoryCount` memories".
> - Memory card: `thumbnailUrl` plus a badge from `mediaKind`.
> - Date row: "Dad's 60th birthday" built from `person.displayName` + ordinal(`turns`), then `date` · `daysLeft`.
> - "Ask AI Helper" is not built (BE-21): hide it.
> - Recent searches stay on the device.

| Summary                                                       | Assign To | Priority | Estimate | Tags            |
| ------------------------------------------------------------- | --------- | -------- | -------- | --------------- |
| `[MOB-06] Search screen: All / People / Chats / Moments tabs` | saib      | Normal   | 12:00    | `mobile,search` |

**Description**

```text
Goal
The Search screen with tabs.

Behaviour
1. Tabs: All, People, Chats, Moments.
2. Search starts after 2 characters with a 300 ms debounce, and cancels the previous request when a new one starts.
3. "All": GET /search?q=&types=people,moments,chats&limit=5. Up to 5 per section, with "See all" switching to that tab.
4. Single tab: GET /search?q=&types=<tab>&cursor=..., with infinite scroll using nextCursor.
5. The Chats tab shows "Coming soon" while it returns [] (D-7).
6. Recent searches are stored on the device only. Clear them on sign-out.
```

**Steps To Reproduce** (how to test)

```text
1. Type "a": nothing is sent. Type "aa": results appear.
2. Type fast "aarav": the network log shows only the last request completing.
3. Tap "See all" on People: the People tab with paging.
4. The Chats tab shows "Coming soon".
```

**Additional Information**

```text
Depends on: D-6, D-7, the BE-07 contract.
```

---

### Mobile — new screens (designs of 2026-11-17)

---

#### MOB-09 · Calendar: month grid, year, "Jump to" sheet

| Summary | Assign To | Priority | Estimate | Tags |
| --- | --- | --- | --- | --- |
| `[MOB-09] Calendar tab: month grid, selected-day card, year view, Jump to` | saig | High | 16:00 | `mobile,calendar` |

**Description**

```text
Goal
The Calendar tab's Month and Year views and the "Jump to" sheet.

API
GET /api/v1/calendar?from=<first of month>&to=<last of month>
    -> { today, items[] }: put person.avatarUrl (or a type icon) on each item's date,
       ring "today", show a selected day's items in the card below the grid
GET /api/v1/calendar/summary?year=2026
    -> months[].count / days for "5 dates" under each month ("—" when 0)

Card: "Dad turns 60" = person.displayName + turns; "Sat, Mar 21"; "⟳ every year" when
recurrence = yearly; "in 6 days" from daysLeft. Holidays (type holiday) as the strip under the card.
Year picker and arrows load another range. The search icon opens the List view (MOB-11).
The prep chips under the card (Video, Family video 4/7, No gift) have no API yet (BE-14): leave them out.
```

**Steps To Reproduce** (how to test)

```text
1. Open Calendar: March shows avatars on birthdays and today ringed.
2. Tap the 21st: the card shows "Dad turns 60 · Sat, Mar 21 · every year · in 6 days".
3. Open Jump to: each month shows its number of dates; pick a month and Done goes to it.
4. Next/previous month and another year load correctly.
```

**Additional Information**

```text
Depends on: BE-11 (live). Open: D-12 (count or days for "N dates").
```

---

#### MOB-11 · Calendar: List view with chips and search

| Summary | Assign To | Priority | Estimate | Tags |
| --- | --- | --- | --- | --- |
| `[MOB-11] Calendar list: chips All/Birthdays/Holidays/Capsules, search, sections` | saib | Normal | 08:00 | `mobile,calendar` |

**Description**

```text
GET /api/v1/calendar?from=<today>&to=<31 Dec>&types=<chip>&q=<search box>
Chips: All = no types, Birthdays = birthday, Holidays = holiday, Capsules = capsule.
Search box: q (300 ms debounce). Group rows into "This month" / "Later this year" on the device.
Row: avatar, "Grandma Rose turns 85" (displayName + turns) or the title, "Sat, Mar 28 · in 13 days".
Tap: person (source person), event (source event) or capsule (source capsule).
```

**Steps To Reproduce** (how to test)

```text
1. List tab, chip Birthdays, type "birthday": only birthdays, soonest first, in two sections.
2. Chip Capsules: only capsules. Clear the search: all items.
```

**Additional Information**

```text
Depends on: BE-11 (live).
```

---

#### MOB-10 · Notifications screen and bell

| Summary | Assign To | Priority | Estimate | Tags |
| --- | --- | --- | --- | --- |
| `[MOB-10] Notifications: list, read state, mark all read, quiet hours row` | saig | Normal | 10:00 | `mobile,notifications` |

**Description**

```text
API
GET  /api/v1/notifications?cursor=&limit=20   newest first; group Today / This week by createdAt
POST /api/v1/notifications/:id/read           on tap, then follow deepLink
POST /api/v1/notifications/read-all           "Mark all read"
GET  /api/v1/notifications/unread-count       Home's bell dot (refresh on app foreground)
GET  /api/v1/notifications/preferences        "Quiet hours 10 PM – 7 AM" row (null = off)

Row: actor.avatarUrl, title (bold), body (second line), time since createdAt, blue dot while read = false.
Accept / Not now (trusted person) and clip progress have no backend yet (BE-18, BE-19): ignore those types.
```

**Steps To Reproduce** (how to test)

```text
1. Ask backend to insert two notifications for your account (no job creates them yet: BE-15).
2. The bell shows a dot; the list shows both with dots; tap one: its dot goes.
3. Mark all read: all dots go; the bell dot goes.
```

**Additional Information**

```text
Depends on: BE-12 (live). The list is empty in real use until BE-15 ships.
The quiet-hours Settings screen is not designed yet (P-10 in SCREEN_API_MAP.md).
```

---

### Admin web — Naveen

---

#### ADM-01 · App versions page

| Summary                                               | Assign To | Priority | Estimate | Tags                |
| ----------------------------------------------------- | --------- | -------- | -------- | ------------------- |
| `[ADM-01] Admin: app versions page (iOS and Android)` | Naveen    | High     | 08:00    | `admin,app-version` |

**Description**

```text
Goal
Admins set the latest and minimum app versions for each platform.

Page
1. One card each for iOS and Android: latest version, minimum supported version, store URL, release notes.
2. A preview line: "Users below 1.3.0 will be forced to update."
3. On-screen validation: x.y.z format, minimum <= latest, store URL is https. Also show the API's 422 messages.
4. Raising the minimum version opens a confirmation dialog ("This forces every user below X to update"), because it blocks those users.
5. "Last changed by <admin> on <date>".

API: GET /api/v1/admin/v1/app-versions, PUT /api/v1/admin/v1/app-versions/:platform
```

**Steps To Reproduce** (how to test)

```text
1. Open App versions: both cards load.
2. Enter minimum 2.0.0 with latest 1.4.0: an error, and Save is disabled.
3. Raise minimum from 1.2.0 to 1.3.0: the confirmation dialog appears. Confirm and save.
4. Reload: the values persist, with "Last changed by" showing you.
```

**Additional Information**

```text
Depends on: the BE-05 contract. Can start now against Postman.
Read admin/AGENTS.md first (this Next.js version differs from the usual docs).
```

---

#### ADM-02 · Users and sessions pages

| Summary                                                         | Assign To | Priority | Estimate | Tags                   |
| --------------------------------------------------------------- | --------- | -------- | -------- | ---------------------- |
| `[ADM-02] Admin: users list, user detail, sign out all devices` | Naveen    | Normal   | 12:00    | `admin,users,sessions` |

**Description**

```text
Goal
Admins find a user and can end all of their sessions.

Pages
1. Users table: search by email, phone or username. Columns: username, email, phone, sign-in channel, created date, last active date, plan. Cursor paging.
2. User detail: profile fields and a sessions table (device / user agent, created date, last active date, expires, status).
3. A "Sign out all devices" button with a confirmation dialog. After success, the sessions show as revoked.

API: GET /api/v1/admin/v1/users, GET /api/v1/admin/v1/users/:id/sessions, POST /api/v1/admin/v1/users/:id/sessions/revoke-all
```

**Steps To Reproduce** (how to test)

```text
1. Search a username: the user is found.
2. Open the user: their phone session is listed.
3. Sign out all devices and confirm: the sessions show as revoked, and the user's app returns to login.
```

**Additional Information**

```text
Depends on: the BE-08 contract.
```

---

#### ADM-03 · Sign-in settings (read-only)

| Summary                                              | Assign To | Priority | Estimate | Tags         |
| ---------------------------------------------------- | --------- | -------- | -------- | ------------ |
| `[ADM-03] Admin: sign-in settings panel (read-only)` | Naveen    | Low      | 02:00    | `admin,auth` |

**Description**

```text
Goal
Admins can see which OTP channels are enabled.

Page
A small panel showing the enabled channels (email / phone) from GET /api/v1/auth/config, with the note: "Changed in the server .env (AUTH_OTP_CHANNELS), not here."
```

**Steps To Reproduce** (how to test)

```text
1. Server with email only: the panel shows Email on, Phone off.
2. Change .env to email,phone and restart the server: the panel shows both on.
```

**Additional Information**

```text
Depends on: the BE-02 contract.
```

---

## 6. AI agents for the development workflow

**Goal:** each developer's Claude Code gets the same specialists, defined in files committed to the repo, so the agents follow this project's rules (row-level security, one migration at a time, never touching `mm_prod`) without being told every time.

### Proposed agents (`.claude/agents/*.md`, committed to git)

| Agent                    | Does                                                                                                                                                                                                               | Must never                                                                                                    | Mainly used by |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | -------------- |
| **backend-agent**        | NestJS + Fastify endpoints, zod DTOs, services, `SECURITY DEFINER` functions, `env.schema.ts` entries, Postman examples                                                                                            | Read `process.env` outside `env.schema.ts`, take an owner id from the request, connect as `postgres`          | Akshara, Omsai |
| **database-agent**       | Drizzle schema, generated + hand-written migrations, row-level security policies, grants for `mm_app` / `mm_admin` / `mm_worker` / support, backfills, `EXPLAIN` checks. **Reviews every migration before merge.** | Run anything against `mm_prod`, use `timestamp without time zone`, merge while another migration is in flight | Akshara, Omsai |
| **admin-frontend-agent** | Admin pages in `admin/` (the version of Next.js in use, which per `admin/AGENTS.md` means reading the docs in `node_modules/next` first), the API client, forms and validation                                     | Call the mobile API realm, put secrets in client code                                                         | Naveen         |
| **testing-agent**        | Vitest unit + e2e tests (`backend/test/*.e2e-spec.ts`) against local Docker `mm_test`, Postman collection tests, CI fixes, a test for each "How to test" step in this doc                                          | Point the suite at `mm_prod`: it truncates every table                                                        | everyone       |

**Admin backend agent:** not needed yet. The admin API is small (BE-05, BE-08) and follows the backend rules, so it is a section inside **backend-agent**. Split it out only if the admin API grows a lot.

**Mobile agents:** the iOS and Android code is not in this repo. If it lives in its own repos, the same pattern works there (`ios-agent`, `android-agent`).

### Keeping this document current

- A project skill, **`/new-requirement`** (`.claude/skills/new-requirement/SKILL.md`): give it a screenshot or a requirement. It finds the affected tickets, edits them here in the ticket-field format of §1, adds any new tickets or open decisions, and appends a line to §9. That way "update the task doc" happens the same way every time.
- A root **`CLAUDE.md`** (the repo has none today) with the shared rules: `main` auto-deploys, one migration at a time, never run e2e or the worker against `mm_prod`, and this file is where tasks live.

### How a feature flows through the agents

```text
New requirement / screenshot
   → /new-requirement            updates TEAM_TASKS.md (tickets, decisions, changelog)
   → lead copies new/changed tickets into the ticket tool
   → backend-agent               Postman contract first
   → database-agent              migration + RLS + grants  (reviewed, one at a time)
   → backend-agent               endpoint + service
   → testing-agent               e2e for every "How to test" step, CI green
   → admin-frontend-agent        admin screens (if any)
   → developer reviews and merges to main → CD deploys
```

---

## 7. Status board

Milestone #2611.02. The ticket tool is the live status; this table mirrors it.

| Ticket | Title                                      | Owner   | Priority | Estimate | Status     | Blocked by              |
| ------ | ------------------------------------------ | ------- | -------- | -------: | ---------- | ----------------------- |
| BE-01  | Access + refresh tokens, 7-day idle        | Akshara | High     |    16:00 | ✅ done 11-13 | —                     |
| BE-05  | App version API                            | Akshara | High     |    08:00 | ✅ done 11-14 | —                     |
| BE-03  | Auto-generated username                    | Akshara | High     |    10:00 | ✅ done 11-15 | —                     |
| BE-06  | Upcoming moments                           | Akshara | Normal   |    10:00 | ✅ done 11-16 | —                     |
| BE-04  | People (members) API                       | Akshara | High     |    14:00 | ✅ done 11-17 | —                     |
| BE-10  | Events API                                 | Akshara | High     |    08:00 | ✅ done 11-17 | —                     |
| BE-02  | OTP email / phone via `.env`               | Akshara | Normal   |    14:00 | ⛔ blocked | D-3                     |
| BE-09  | SMS provider integration                   | Akshara | Normal   |    08:00 | ⛔ blocked | D-4, BE-02              |
| BE-08  | Admin users & sessions API                 | Akshara | Normal   |    08:00 | todo       | —                       |
| BE-07  | Search (people, memories, dates)           | Subbu   | Normal   |    12:00 | ✅ done 11-17 | —                     |
| BE-11  | Calendar API                               | Subbu   | High     |    12:00 | ✅ done 11-17 | —                     |
| BE-12  | Notification centre API                    | Subbu   | High     |    08:00 | ✅ done 11-17 | —                     |
| BE-13  | Nickname, location, counts, avatar         | Subbu   | High     |    06:00 | ✅ done 11-17 | —                     |
| BE-15  | Notification producers (worker)            | Omsai   | High     |    16:00 | todo       | —                       |
| BE-17  | Fast memory search at scale                | Omsai   | Normal   |    12:00 | todo       | DB review               |
| BE-14  | Occasion preparation                       | Omsai   | Normal   |    16:00 | ⛔ blocked | D-10                    |
| BE-16  | Built-in holidays                          | Omsai   | Low      |    08:00 | ⛔ blocked | D-11                    |
| BE-18  | Trusted people (Release 3)                 | —       | Low      |    16:00 | later      | Release 3 spec          |
| BE-19  | Family video clips (Release 2)             | —       | Low      |    20:00 | later      | Release 2 spec, D-10    |
| BE-20  | Wishlist and gifts (Release 3)             | —       | Low      |    16:00 | later      | D-10                    |
| BE-21  | AI Helper (Release 2)                      | —       | Low      |    20:00 | later      | Release 2 spec          |
| MOB-01 | Version check / force update               | saig    | High     |    06:00 | todo       | — (BE-05 live)          |
| MOB-02 | Sign-in and OTP screens                    | saig    | High     |    12:00 | ⛔ blocked | D-3, BE-02 contract     |
| MOB-07 | Token storage, refresh, idle logout        | saig    | High     |    10:00 | todo       | — (BE-01 live)          |
| MOB-03 | Profile username                           | saig    | Normal   |    06:00 | todo       | — (BE-03 live)          |
| MOB-04 | People screens                             | saib    | High     |    16:00 | todo       | — (BE-04 live)          |
| MOB-08 | Capsule person picker + milestone birthday | saib    | High     |    06:00 | todo       | MOB-04                  |
| MOB-05 | Home upcoming moments                      | saib    | Normal   |    12:00 | todo       | — (BE-06, BE-13 live)   |
| MOB-06 | Search screen                              | saib    | Normal   |    12:00 | todo       | — (BE-07 live)          |
| MOB-11 | Calendar list view                         | saib    | Normal   |    08:00 | todo       | — (BE-11 live)          |
| MOB-09 | Calendar month, year, Jump to              | saig    | High     |    16:00 | todo       | — (BE-11 live)          |
| MOB-10 | Notifications screen and bell              | saig    | Normal   |    10:00 | todo       | — (BE-12 live)          |
| ADM-01 | App versions page                          | Naveen  | High     |    08:00 | todo       | — (BE-05 live)          |
| ADM-02 | Users & sessions pages                     | Naveen  | Normal   |    12:00 | todo       | BE-08 contract          |
| ADM-03 | Sign-in settings (read-only)               | Naveen  | Low      |    02:00 | todo       | BE-02 contract          |

**Backend progress:** 10 of 21 tickets done (104:00 estimated hours): Akshara 6, Subbu 4. **Left for Release 1:** Akshara 30:00 (BE-02, BE-09, BE-08) · Omsai 52:00 (BE-15, BE-17 ready; BE-14, BE-16 blocked). BE-18 to BE-21 belong to Releases 2 and 3 and have no owner. **Mobile and admin:** nothing started in this doc yet. saig 60:00 · saib 54:00 · Naveen 22:00. If D-9 = separate codebases, saig and saib each carry all MOB tickets (114:00 each).
**Screen coverage:** see [SCREEN_API_MAP.md](SCREEN_API_MAP.md). 34 of 49 interactions in the 2026-11-17 designs are API-backed.

---

## 8. Waiting on input

- ✅ Home, Notifications, Search and Calendar designs received 2026-11-17. Attach them to MOB-05, MOB-06, MOB-09, MOB-10 and MOB-11 in **Upload Files**. Still missing: the People screens (MOB-04), the Calendar Year tab, the + menu, the notification Settings screen and a memory detail screen.
- Answers to **D-3, D-4, D-7 (Chats tab), D-9, D-10, D-11, D-12**. D-1, D-2, D-5, D-6 and D-8 are settled. D-13 and D-14 were built with the defaults; confirm them.
- Designs for **Events** screens (mobile, and admin if needed). BE-10 is built, but no MOB or ADM ticket exists for it yet.
- The full names of Omsai, saig, saib and Naveen exactly as they appear in **Assign To**.

## 9. Changelog

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-13 | Document created. The 7 requirements were checked against the code (§2). Tasks BE-01…08, MOB-01…06 and ADM-01…03 were written, decisions D-1…D-9 were opened, and the AI agent plan was added (§6).                                                                                                                                                                                                                                                                                                            |
| 2026-11-13 | Every task rewritten as a ticket matching the ticket form's fields (Summary, Description, Assign To, Priority, Steps To Reproduce = how to test, Additional Information, Tags, Estimate). Milestone #2611.02 added. Estimates added (max 23:45 per ticket). To fit, BE-02 was split (SMS sending moved to new **BE-09**), MOB-02 was split (token handling moved to new **MOB-07**), and MOB-04 was split (capsule picker moved to new **MOB-08**). BE-03 unblocked for generation (D-5 only affects editing). |
| 2026-11-15 | Pricing finalized for client approval (`Docs/client/MandM-Storage-and-AI-Plans.pptx`, blueprint §17.2 items 7–10). Premium 100 GB India / 150 GB US-EU (₹399 · ₹3,999/yr), Family 5 seats 200/300 GB pooled, +100 GB add-on, lapse policy (30-day read-only grace → Free 10 GB → sealed capsules kept first → rest deleted), Magic Lite / Plus AI credits. No ticket in milestone #2611.02 changes. Older phase docs (TASK-085, TASK-087, TASK-101, MOD-08-03, MOD-11-04) were updated to match. The lapse clean-up job and AI credit billing still need tickets when billing work is scheduled. |
| 2026-11-16 | Commercial model re-run on the finalized plans with in-app billing (15% App Store / Google Play fee): break-even 483,000 users, month 32, ~$610K capital, 46% gross margin. Old-plan history removed from the blueprint, client docs, decks and the architecture artifact. Payments are in-app through the stores; the billing tickets, when written, should build on that. |
| 2026-11-17 | Status brought up to date with `main`. **Done, all by Akshara:** BE-01 (`5b465bd`), BE-05 (`b2d7051`), BE-03 (`3a94f46`), BE-06 (`cb4256f`), BE-04 (`f2b3fd8`). BE-04, BE-05 and BE-06 were reassigned from Omsai to Akshara Peraka. New ticket **BE-10 Events API** added for work done in `f2b3fd8` that had no ticket. Decisions D-1 (rolling), D-2 (opaque), D-5 (yes, 14 days) and D-8 (default) are now marked as decided by what was built. Migrations 0018–0022 are recorded in §4. Mobile and admin tickets that waited on those APIs are now `todo`. The Postman location now points at the YAML collection in `Docs/development/Moments & Memories/`. |
| 2026-11-17 | **Mobile designs received:** Home, Notifications, Search, Calendar (Month, Jump to, List). Audited screen by screen in the new [SCREEN_API_MAP.md](SCREEN_API_MAP.md). **Built:** BE-07 Search (people, memories, dates; no chats), **BE-11** Calendar, **BE-12** Notification centre, **BE-13** nickname / location / memoryCount / avatar / week count, with migration `0023`. 40 new e2e cases; 414 of 414 pass. Found and fixed PostgreSQL JIT adding ~3 s to the calendar and upcoming queries. **New open tickets:** BE-14 occasion preparation, BE-15 notification producers, BE-16 holidays, BE-17 search speed, BE-18 to BE-21 (later releases), MOB-09 to MOB-11. MOB-04, MOB-05 and MOB-06 updated for the designs. Decisions: D-6 settled, D-7 settled for search (Chats tab still open), D-10 to D-14 opened. Omsai now owns BE-14 to BE-17. |
