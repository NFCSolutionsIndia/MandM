# Team Tasks — Moments & Memories

> **Living document.** Each new screenshot, requirement or decision updates this file, and gets a line in the [Changelog](#9-changelog) at the bottom.
> If a task here disagrees with older planning docs (`phase-*/`, `00_PROJECT_PLAN.md`), this file wins for the work listed in it.

| | |
|---|---|
| **Milestone** | **#2611.02** |
| **Current feature** | People (members): required by milestone capsules |
| **Also in this round** | App version API · sessions (access/refresh/idle) · OTP over email or phone · usernames · search · upcoming moments |
| **Last updated** | 2026-11-13 |

**Team**

| Person | Role | Owns in this round |
|---|---|---|
| **Akshara** (Akshara Perala) | Backend | Sign-in and sessions: tokens, idle logout, OTP channels, SMS, usernames, admin users API |
| **Omsai** | Backend | People API, app-version API, upcoming moments, search |
| **saig** | Mobile | App-version gate, sign-in screens, token handling, profile/username |
| **saib** | Mobile | People screens, capsule person picker, Home "upcoming moments", Search screen |
| **Naveen** | Admin web | App-version management, users and sessions pages, sign-in settings |

---

## 1. How to use this document

### Every task is written as a ticket

Each task in [§5](#5-tickets) follows the field order of the ticket form, so it can be copied in field by field:

| Ticket field | What goes in it |
|---|---|
| **Summary** | `[ID] title`, for example `[BE-01] Access token (1 day) + refresh token (30 days) + 7-day idle logout`. Keeping the ID in the summary links the ticket back to this doc. |
| **Description** | The copy block under **Description**. It is plain text, written to read correctly in a plain text box. |
| **Assign To** | The owner named in the ticket card |
| **Reproducibility** | Leave at **Have not tried** (or N/A if the list has it). These are build tasks, not bugs. |
| **Severity** | **Low** for build tasks. Severity is for bugs. |
| **Priority** | From the card: **High** = Wave 1 and other tasks depend on it, **Normal** = Wave 2, **Low** = nice to have |
| **Steps To Reproduce** | Used as **How to test**: the steps a reviewer follows to check the work is done |
| **Additional Information** | Dependencies, open decisions, the migration slot and files to read |
| **Attach Tags** | From the card, comma-separated |
| **Estimate** | From the card, in `hh:mm` using 15-minute steps. The form allows **23:45 at most**, so any task bigger than that is split into separate tickets. |
| **Task Type** | **Task** |
| **Worked Hours** | 0 at creation. The developer updates it. |
| **Upload Files** | Any screenshot the task was based on (see §8) |

### Other rules

- **Task IDs** are permanent. `BE-` = backend, `MOB-` = mobile, `ADM-` = admin web. Never reuse a number. If a task is dropped, mark it `dropped` and leave it in the file.
- **Status values:** `todo` · `in progress` · `in review` · `done` · `blocked` · `dropped`. The ticket tool is the live status. [§7](#7-status-board) mirrors it for anyone reading this doc.
- **Contract first.** Every backend ticket starts by adding its requests and example responses to `Docs/development/MandM.postman_collection.json`, before any code is written. Mobile and admin build against those examples from day 1, so they are not waiting on the backend.
- **Done means:** code merged, tests passing in CI, the Postman examples match the real responses, and the "How to test" steps have been run by someone other than the author.
- **New requirement or screenshot?** Send it to the lead. Every ticket it affects gets edited here (and in the tool), and the change is logged in §9.

---

## 2. What exists today (checked against the code on 2026-11-13)

| # | Requirement | Status | What is there now |
|---|---|---|---|
| 1 | App-version API, separate for iOS and Android | ❌ Not built | `devices.app_version` stores each device's version. There is no table of latest or minimum versions and no endpoint. |
| 2 | Log out after 7 days of inactivity | ❌ Not built | A session lasts 30 days and every request extends it (`app_touch_session`). An idle user stays signed in for up to 30 days. |
| 3 | Access token 1 day, refresh token 30 days | ⚠️ Partly built | There is one opaque session token with a 30-day rolling lifetime (`sessions` table, `POST /auth/verify`). There is no refresh token and no 1-day access token. |
| 4 | OTP by email or phone, chosen in `.env` | ⚠️ Email only | Email OTP works: 6 digits, 10-minute expiry, 5 attempts, 5 codes per hour. `users.phone` exists as a column, but there is no SMS sending, no phone OTP and no `.env` switch. `users.email` is NOT NULL, so a phone-only account cannot be created yet. |
| 5 | Unique auto-generated username | ❌ Not built | `users` has no username column. |
| 6 | Search: people, chats, moments | ❌ Not built | Groundwork exists: `memories.search_text` with full-text and trigram indexes (migration 0004). **There is no chat feature anywhere in the backend.** |
| 7 | Upcoming moments (5 items) | ❌ Not built | The data to build it from exists: `capsules.unlock_at` and member/event birthdays and anniversaries. |
| — | **People (members)** | ⚠️ Database only | The `members` table, its row-level security and `test/people.e2e-spec.ts` exist. There is **no API**. `capsules.milestone_member_id` and `capsule_recipients.member_id` already point at `members`. |

---

## 3. Decisions needed before these tasks start

Tickets marked **⛔ blocked** in §7 are waiting on these. Each one has a recommended default. If nobody objects, the default stands.

| ID | Question | Recommended default | Blocks |
|---|---|---|---|
| **D-1** | Is the 30-day refresh lifetime **rolling** (each refresh issues a new 30-day token, so an active user is never logged out) or **absolute** (everyone signs in again every 30 days, however active)? | **Rolling.** A 7-day idle limit already logs out inactive users. | BE-01 |
| **D-2** | Keep **opaque tokens** (a database row, revocable instantly) or switch access tokens to **JWT**? | **Opaque, for both tokens.** The API already checks the session on every request for row-level security, so a JWT saves nothing and loses instant "sign out that device". | BE-01 |
| **D-3** | When **both** email and phone OTP are enabled, does the user **pick one**, or must they **verify both** at sign-up? | **Pick one.** The other can be added and verified later from Profile. | BE-02, MOB-02 |
| **D-4** | Which **SMS provider** sends phone OTPs? | **MSG91** for India (DLT-registered template), with Twilio as an option for other countries. Needs a company account and a registered sender ID before go-live. | BE-09 |
| **D-5** | Can a user **change** their auto-generated username? | **Yes**, at most once every 14 days, with an availability check. | BE-03, MOB-03 |
| **D-6** | In search, does **"people"** mean only **my saved members**, or also **other app users found by username** (like Instagram)? | **My members only for now.** Making every account findable by username is a privacy decision for a private family vault and needs a "who can find me" setting first. | BE-07, MOB-06 |
| **D-7** | **"Chats"** does not exist in the product yet. What is a chat? | Search returns `chats: []` until a chat feature is specified. The response shape is fixed now, so mobile will not need to change later. | BE-07, MOB-06 |
| **D-8** | What counts as an **upcoming moment**? | Sealed capsules I sent that have not opened yet, plus upcoming birthdays and anniversaries of my people and my own events. Soonest first, 5 items. **The Home screenshot would settle this.** | BE-06, MOB-05 |
| **D-9** | Mobile split: are iOS (Swift) and Android (Kotlin) **separate codebases**? | If separate: **saig = iOS, saib = Android**, and each MOB ticket is created **twice**, once per platform, with the summary suffixed `(iOS)` / `(Android)`. If shared: one ticket each, split by feature as in §5. | all MOB |

---

## 4. Order of work

```text
Wave 0 (days 1–2)   Decisions D-1…D-9 · Postman contracts for every BE ticket
                    · mobile and admin start against the Postman examples

Wave 1              BE-04 People API (Omsai)    BE-01 Sessions (Akshara)
                    BE-05 App version (Omsai)   BE-03 Usernames (Akshara)

Wave 2              BE-06 Upcoming (Omsai)      BE-02 OTP channels (Akshara)
                    BE-07 Search (Omsai)        BE-09 SMS provider (Akshara)
                                                BE-08 Admin users & sessions API (Akshara)

Mobile and admin run alongside: each switches from Postman examples
to the real API as soon as its backend ticket is "done".
```

### Migration rule (important)

Everyone commits to `main`, and every green push to `main` deploys and migrates `mm_prod`. **Only one migration may be in flight at a time**, in this order:

| Slot | Migration | Owner | Ticket |
|---|---|---|---|
| 1 | `app_versions` table | Omsai | BE-05 |
| 2 | Sessions: refresh token, access expiry, `last_active_at` | Akshara | BE-01 |
| 3 | `users.username` plus a backfill for existing users | Akshara | BE-03 |
| 4 | OTP channel and phone: generalise `email_otps`, make `users.email` nullable, unique phone | Akshara | BE-02 |
| 5 | Indexes for upcoming moments and search, if `EXPLAIN` shows they are needed | Omsai | BE-06 / BE-07 |

Before merging a migration: pull `main`, regenerate if another migration landed, run it on **local Docker** (never on `mm_prod` by hand), and have the database reviewer (or the database agent, §6) check its row-level security, grants and backfill.

---

## 5. Tickets

All tickets: **Milestone #2611.02 · Task Type: Task · Reproducibility: Have not tried · Severity: Low · Worked Hours: 0.** Only the fields that differ are listed in each card.

### Backend — Akshara

---

#### BE-01 · Access token (1 day) + refresh token (30 days) + 7-day idle logout

| Summary | Assign To | Priority | Estimate | Tags |
|---|---|---|---|---|
| `[BE-01] Access token (1 day) + refresh token (30 days) + 7-day idle logout` | Akshara Perala | High | 16:00 | `backend,auth,sessions,migration` |

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

| Summary | Assign To | Priority | Estimate | Tags |
|---|---|---|---|---|
| `[BE-02] OTP over email or phone, switchable in .env` | Akshara Perala | Normal | 14:00 | `backend,auth,otp,migration` |

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

| Summary | Assign To | Priority | Estimate | Tags |
|---|---|---|---|---|
| `[BE-09] SMS provider integration (SmsService) for phone OTP` | Akshara Perala | Normal | 08:00 | `backend,auth,otp,sms` |

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

| Summary | Assign To | Priority | Estimate | Tags |
|---|---|---|---|---|
| `[BE-03] Unique auto-generated username for every user` | Akshara Perala | High | 10:00 | `backend,users,migration` |

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

| Summary | Assign To | Priority | Estimate | Tags |
|---|---|---|---|---|
| `[BE-08] Admin API: users search and session revoke` | Akshara Perala | Normal | 08:00 | `backend,admin,sessions` |

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

### Backend — Omsai

---

#### BE-04 · People (members) API ← the main feature in this round

| Summary | Assign To | Priority | Estimate | Tags |
|---|---|---|---|---|
| `[BE-04] People (members) API: create, list, edit, delete` | Omsai | High | 14:00 | `backend,people,capsules` |

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

| Summary | Assign To | Priority | Estimate | Tags |
|---|---|---|---|---|
| `[BE-05] App version API, separate for iOS and Android` | Omsai | High | 08:00 | `backend,app-version,admin,migration` |

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

| Summary | Assign To | Priority | Estimate | Tags |
|---|---|---|---|---|
| `[BE-06] Upcoming moments API (5 items for Home)` | Omsai | Normal | 10:00 | `backend,home,capsules,people` |

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

#### BE-07 · Search: people, chats, moments

| Summary | Assign To | Priority | Estimate | Tags |
|---|---|---|---|---|
| `[BE-07] Search API: people, chats, moments` | Omsai | Normal | 12:00 | `backend,search` |

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

### Mobile — saig

> If D-9 = separate codebases, create each MOB ticket **twice**, `(iOS)` assigned to saig and `(Android)` assigned to saib, with the same estimate each.

---

#### MOB-01 · App version check and force update

| Summary | Assign To | Priority | Estimate | Tags |
|---|---|---|---|---|
| `[MOB-01] App version check: force update and update banner` | saig | High | 06:00 | `mobile,app-version` |

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

| Summary | Assign To | Priority | Estimate | Tags |
|---|---|---|---|---|
| `[MOB-02] Sign-in and OTP screens, channels from /auth/config` | saig | High | 12:00 | `mobile,auth,otp` |

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

| Summary | Assign To | Priority | Estimate | Tags |
|---|---|---|---|---|
| `[MOB-07] Secure token storage, auto refresh on 401, idle logout` | saig | High | 10:00 | `mobile,auth,sessions` |

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

| Summary | Assign To | Priority | Estimate | Tags |
|---|---|---|---|---|
| `[MOB-03] Profile: show and change username` | saig | Normal | 06:00 | `mobile,profile,users` |

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

| Summary | Assign To | Priority | Estimate | Tags |
|---|---|---|---|---|
| `[MOB-04] People screens: list, add/edit person, person detail` | saib | High | 16:00 | `mobile,people` |

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

| Summary | Assign To | Priority | Estimate | Tags |
|---|---|---|---|---|
| `[MOB-08] Capsule flow: person picker and milestone birthday prompt` | saib | High | 06:00 | `mobile,people,capsules` |

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

| Summary | Assign To | Priority | Estimate | Tags |
|---|---|---|---|---|
| `[MOB-05] Home: upcoming moments cards (5 items)` | saib | Normal | 08:00 | `mobile,home` |

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

| Summary | Assign To | Priority | Estimate | Tags |
|---|---|---|---|---|
| `[MOB-06] Search screen: All / People / Chats / Moments tabs` | saib | Normal | 12:00 | `mobile,search` |

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

### Admin web — Naveen

---

#### ADM-01 · App versions page

| Summary | Assign To | Priority | Estimate | Tags |
|---|---|---|---|---|
| `[ADM-01] Admin: app versions page (iOS and Android)` | Naveen | High | 08:00 | `admin,app-version` |

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

| Summary | Assign To | Priority | Estimate | Tags |
|---|---|---|---|---|
| `[ADM-02] Admin: users list, user detail, sign out all devices` | Naveen | Normal | 12:00 | `admin,users,sessions` |

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

| Summary | Assign To | Priority | Estimate | Tags |
|---|---|---|---|---|
| `[ADM-03] Admin: sign-in settings panel (read-only)` | Naveen | Low | 02:00 | `admin,auth` |

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

| Agent | Does | Must never | Mainly used by |
|---|---|---|---|
| **backend-agent** | NestJS + Fastify endpoints, zod DTOs, services, `SECURITY DEFINER` functions, `env.schema.ts` entries, Postman examples | Read `process.env` outside `env.schema.ts`, take an owner id from the request, connect as `postgres` | Akshara, Omsai |
| **database-agent** | Drizzle schema, generated + hand-written migrations, row-level security policies, grants for `mm_app` / `mm_admin` / `mm_worker` / support, backfills, `EXPLAIN` checks. **Reviews every migration before merge.** | Run anything against `mm_prod`, use `timestamp without time zone`, merge while another migration is in flight | Akshara, Omsai |
| **admin-frontend-agent** | Admin pages in `admin/` (the version of Next.js in use, which per `admin/AGENTS.md` means reading the docs in `node_modules/next` first), the API client, forms and validation | Call the mobile API realm, put secrets in client code | Naveen |
| **testing-agent** | Vitest unit + e2e tests (`backend/test/*.e2e-spec.ts`) against local Docker `mm_test`, Postman collection tests, CI fixes, a test for each "How to test" step in this doc | Point the suite at `mm_prod`: it truncates every table | everyone |

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

| Ticket | Title | Owner | Priority | Estimate | Status | Blocked by |
|---|---|---|---|---:|---|---|
| BE-01 | Access + refresh tokens, 7-day idle | Akshara | High | 16:00 | ⛔ blocked | D-1, D-2 |
| BE-02 | OTP email / phone via `.env` | Akshara | Normal | 14:00 | ⛔ blocked | D-3, BE-01 |
| BE-09 | SMS provider integration | Akshara | Normal | 08:00 | ⛔ blocked | D-4, BE-02 |
| BE-03 | Auto-generated username | Akshara | High | 10:00 | todo | D-5 (editing only) |
| BE-08 | Admin users & sessions API | Akshara | Normal | 08:00 | todo | BE-01, BE-03 |
| BE-04 | People (members) API | Omsai | High | 14:00 | todo | — |
| BE-05 | App version API | Omsai | High | 08:00 | todo | — |
| BE-06 | Upcoming moments | Omsai | Normal | 10:00 | ⛔ blocked | D-8, BE-04 |
| BE-07 | Search | Omsai | Normal | 12:00 | ⛔ blocked | D-6, D-7, BE-04 |
| MOB-01 | Version check / force update | saig | High | 06:00 | todo | BE-05 contract |
| MOB-02 | Sign-in and OTP screens | saig | High | 12:00 | ⛔ blocked | D-3, BE-01/02 contracts |
| MOB-07 | Token storage, refresh, idle logout | saig | High | 10:00 | todo | BE-01 contract |
| MOB-03 | Profile username | saig | Normal | 06:00 | ⛔ blocked | D-5 |
| MOB-04 | People screens | saib | High | 16:00 | todo | BE-04 contract |
| MOB-08 | Capsule person picker + milestone birthday | saib | High | 06:00 | todo | MOB-04 |
| MOB-05 | Home upcoming moments | saib | Normal | 08:00 | ⛔ blocked | D-8 |
| MOB-06 | Search screen | saib | Normal | 12:00 | ⛔ blocked | D-6, D-7 |
| ADM-01 | App versions page | Naveen | High | 08:00 | todo | BE-05 contract |
| ADM-02 | Users & sessions pages | Naveen | Normal | 12:00 | todo | BE-08 contract |
| ADM-03 | Sign-in settings (read-only) | Naveen | Low | 02:00 | todo | BE-02 contract |

**Estimated hours by person:** Akshara 56:00 · Omsai 44:00 · saig 34:00 · saib 42:00 · Naveen 22:00. If D-9 = separate codebases, saig and saib each carry all MOB tickets (76:00 each).

---

## 8. Waiting on input

- **Mobile screenshots** for this round. They decide D-8 (what goes in upcoming moments) and the People, Home and Search layouts. Attach them to MOB-04, MOB-05 and MOB-06 in **Upload Files**.
- Answers to **D-1 … D-9**.
- The full names of Omsai, saig, saib and Naveen exactly as they appear in **Assign To**.

## 9. Changelog

| Date | Change |
|---|---|
| 2026-11-13 | Document created. The 7 requirements were checked against the code (§2). Tasks BE-01…08, MOB-01…06 and ADM-01…03 were written, decisions D-1…D-9 were opened, and the AI agent plan was added (§6). |
| 2026-11-13 | Every task rewritten as a ticket matching the ticket form's fields (Summary, Description, Assign To, Priority, Steps To Reproduce = how to test, Additional Information, Tags, Estimate). Milestone #2611.02 added. Estimates added (max 23:45 per ticket). To fit, BE-02 was split (SMS sending moved to new **BE-09**), MOB-02 was split (token handling moved to new **MOB-07**), and MOB-04 was split (capsule picker moved to new **MOB-08**). BE-03 unblocked for generation (D-5 only affects editing). |
