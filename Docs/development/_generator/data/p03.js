const M = (o) => o;

module.exports = {
  id: 'PHASE-03', name: 'Core Domain — Members, Occasions, Memories & Timeline', release: 'Release 1',
  objective: 'Build the four entities the product is actually about, and the timeline that gives them meaning.',
  business: 'This is the first phase where a user gets something of value: an organised archive and a calendar that knows what is coming.',
  technical: 'Member, Event, and Memory models with RLS; occurrence computation; full-text search; the virtualised Past→Present→Future timeline.',
  priority: 'critical', deps: ['PHASE-02'], effort: '~4 weeks',
  outcome: 'A user can add the people who matter, see their occasions, create memories with real dates and meaning, and browse their life on a timeline that extends into the future.',
  purpose: `This is the largest phase in Release 1 and the one that makes the product recognisable.

Three things here are more consequential than they look.

**\`occurred_at\` with \`occurred_precision\`.** Blueprint §13.1 calls this the difference between a real family archive and a broken one. A scanned 1974 wedding photo has a *year*, not a timestamp. Every competitor collapses imported media into its upload date, and every family archivist is quietly furious about it.

**The Event entity.** Blueprint §27.3 identifies this as the most valuable addition the designer's brief made — Part I had only an \`occasion\` enum on a memory. The event is what converts a passive archive into a product that prompts action, and it is the shared trigger for memories, broadcasts, and gifts. Retrofitting it later is a migration, not a feature (§27.4).

**The future band.** The timeline extending forward is the product's identity (§29.12). It is built here with capsules stubbed, so PHASE-05 populates a surface that already exists.`,
  goals: [
    'A user can add members through four genuinely usable paths, including on an iPhone where the Contact Picker API does not exist.',
    'A user can create an event with recurrence and reminder offsets, and see it on a calendar.',
    'A user can create a memory with the date it *happened* and a note about what it meant.',
    'A user can browse a timeline that includes a visible, empty future band.',
    'A user can find a memory by typing a word, and rediscover one through On This Day.',
  ],
  features: [
    'Members with relationships, birthdays, interests, and four import paths.',
    'Duplicate detection and merge with defined semantics.',
    'Occasions engine: recurrence, reminder offsets, month/year/agenda views.',
    'Memories with media placeholders, date precision, occasion tags, and notes.',
    'Soft delete with a Trash view and a 30-day purge.',
    'Virtualised timeline with a Now divider and a future band.',
    'Gallery grid, text search, filters, favourites, On This Day.',
  ],
  arch: [
    'Introduces the three core domain modules under `src/features/`, each owning its schema slice with no cross-module database access (ADR-004).',
    'Introduces Postgres full-text search with a generated `tsvector` and trigram fallback (ADR-010).',
    'Introduces the reminder job kinds that PHASE-07 will deliver through.',
    'Extends the PHASE-01 seed fixtures with the full domain cast.',
  ],
  depDetail: [
    '**PHASE-02** must be complete: `lib/authz` is the gate every query in this phase passes through.',
    '**PHASE-04** is a peer, not a prerequisite: this phase works against seeded media placeholders, and the `MediaAsset` contract must be frozen jointly before either goes far.',
    '**Design:** §29.7, §29.11, §29.12, §29.14, §29.15 screens must be available from the design file.',
  ],
  deliverables: [
    'Member, Event, Memory schema with RLS and FTS.',
    'Four member-import paths including a public self-service page.',
    'Calendar with three views and event CRUD.',
    'Memory create, view, edit, delete with Trash.',
    'Timeline, gallery, search, filters, favourites, On This Day.',
  ],
  ac: [
    'A memory created from a 1974 photo sorts correctly on the timeline with year precision, and does not claim to have happened today.',
    'A yearly event fires its reminder offsets once per year and never twice.',
    'Member import works on an iPhone using the file and invite-link paths.',
    'The timeline renders 2,000 memories without dropped frames on a mid-range Android.',
    'A duplicate member can be merged, and the merge semantics match the documented rule.',
    'Every query in the phase passes through `lib/authz`; a cross-tenant attempt fails at both layers.',
  ],
  risks: [
    ['Timeline performance with a large archive', 'high', 'Virtualised windowed list, cursor pagination, blurhash placeholders, and a 2,000-item benchmark as an acceptance criterion rather than an aspiration.'],
    ['`occurred_precision` treated as decoration and ignored in sorting or display', 'high', 'Precision-aware formatting is a shared utility; tests assert a year-precision memory neither claims a day nor matches an On This Day query.'],
    ['Contact import unusable on iOS, making member entry feel punitive', 'high', 'Four co-equal paths (§29.11); the invite link is designed as the best path rather than a fallback.'],
    ['Recurrence and reminder duplication across timezones and DST', 'medium', '`last_fired_for_year` guard, absolute-instant arithmetic, and explicit DST tests.'],
    ['Event model diverging from what PHASE-05 milestones need', 'medium', 'Milestone unlock (`age:18`) is specified against this schema before it is written; a joint review with PHASE-05 scope.'],
  ],
  gate: 'A stakeholder can add three family members, see their birthdays on a calendar, create a memory dated 1998, and find it by searching',
  trace: ['§10', '§13', '§29.7', '§29.9', '§29.11', '§29.12', '§29.13', '§29.14', '§29.15', '§34.1', '§34.2'],

  modules: [
    /* -------------------- MOD-03-01 Members -------------------- */
    {
      id: 'MOD-03-01', name: 'Members & Relationships',
      purpose: 'Model the people memories are about and addressed to, with import paths that work on every platform.',
      priority: 'critical',
      objective: 'Let a user record the people who matter with as little typing as their platform allows, and keep those records accurate over years.',
      business: [
        'Members are the addressing layer for every capsule; without contact details, delivery is impossible.',
        'The self-service invite path produces the highest-quality data in the product and doubles as an acquisition loop (§29.11).',
      ],
      functional: [
        'Add, edit, and remove members with relationship, birthday, anniversary, interests, and contact details.',
        'Four import paths: contact picker, file upload, manual entry, invite link.',
        'Duplicate detection with merge.',
        'A member with no contact method is allowed but flagged as undeliverable.',
      ],
      ui: [
        'Member list with next-occasion subtext and sorting (§29.11).',
        'Four add paths presented as equals, not one primary and three fallbacks.',
        'Member detail with occasions, shared memories, and quick actions.',
        'Persistent amber warning on undeliverable members with a one-tap fix.',
      ],
      backend: ['Member CRUD through `lib/authz`', 'vCard and CSV parsing with a per-row validation report', 'Self-service token issue and redemption', 'Duplicate scoring and merge'],
      db: ['`members` with RLS', 'Trigram index on name for duplicate detection', 'Self-service token stored hashed'],
      integrations: ['Contact Picker API where available (Chromium/Android only)'],
      security: [
        'A member record is private to its owner and never discoverable by other users (§34.1).',
        'The self-service page must not disclose anything about the owner beyond their display name.',
      ],
      testing: ['Import parsing across malformed inputs', 'Duplicate scoring', 'Merge semantics', 'Undeliverable flagging'],
      ac: ['All four import paths functional', 'Merge semantics match the documented rule', 'Undeliverable members clearly flagged'],
      trace: ['§29.11', '§34.1', 'gap G-2'],
      sprints: [
        {
          id: 'SPR-03-01-01', name: 'Member Model & CRUD',
          objective: 'The member entity and its screens.',
          priority: 'critical', deps: [], duration: '~4 days',
          goal: 'A user can add, view, edit, and remove members, and see who cannot yet receive a delivery.',
          inScope: ['Member schema and migration', 'CRUD actions through authz', 'List screen', 'Detail screen', 'Undeliverable flagging'],
          outScope: ['Import paths (next sprint)', 'Wishlists (Release 2)', 'Face grouping (not built)'],
          approach: ['Model from §34.1 exactly, including the self-service token and merge fields, so the import sprint needs no migration.'],
          archChanges: ['Introduces the `member` feature module'],
          deliverables: ['Member schema', 'CRUD actions', 'Two screens'],
          testing: ['authz coverage on every action', 'RLS', 'Undeliverable logic'],
          ac: ['CRUD works end to end', 'RLS blocks cross-tenant reads'],
          dod: ['Seed fixtures extended with the member cast'],
          trace: ['§34.1', '§29.11'],
          epics: [
            {
              id: 'EPIC-03-01-01-01', name: 'Member Entity & Management Screens',
              objective: 'Create the member model and the screens to manage it.',
              value: 'Members are the addressing layer for the product\'s differentiating feature. A capsule cannot exist without one.',
              stories: [['user', 'to record the people who matter with their birthdays', 'the app can remind me and I can address memories to them']],
              functional: ['Full member CRUD', 'Relationship chips with custom values', 'Next-occasion subtext', 'Undeliverable warning'],
              technical: ['Every read and write through `lib/authz`', 'Trigram index for later duplicate detection', 'Birthday precision handled like memory dates'],
              db: ['`members` table with RLS per §34.1'],
              security: ['Owner-scoped; never discoverable by other users'],
              testing: ['authz per action', 'RLS negative', 'Undeliverable flagging', 'axe on both screens'],
              ac: ['CRUD complete', 'Undeliverable flagged', 'axe clean'],
              trace: ['§34.1', '§29.11'],
              tasks: [
                {
                  name: 'Create Member Schema and CRUD Actions', type: 'database', priority: 'critical',
                  deps: ['TASK-026', 'TASK-027'], trace: ['§34.1', '§11.1'],
                  obj: 'Create the `members` table per blueprint §34.1 with RLS, and implement create, update, and delete actions that route through `lib/authz`.',
                  ctx: 'Blueprint §34.1 replaces Part I\'s thinner `Person` with the designer\'s richer `Member`. It carries the fields the gift AI and milestone scheduling will later need, plus the self-service token that makes the invite-link import path possible.',
                  why: 'Modelling the full §34.1 shape now — including `self_service_token_hash`, `merged_into_id`, and `interests` — avoids two migrations in the very next sprint. The constraint that matters most is that a member with no contact method must be *allowed* (a grandmother you have no email for is still someone you want in your archive) but must be clearly undeliverable, because a capsule addressed to her cannot be honoured.',
                  out: 'A migration creating `members` with RLS and a trigram index, plus three server actions with authz enforcement and a computed undeliverable flag.',
                  fr: [
                    'Fields per §34.1: id, owner_id, name, relationship, avatar_media_id, phone, phone_verified_at, email, email_verified_at, birthday, birthday_precision, anniversary, notes, interests (text[]), wishlist_url, linked_user_id, self_service_token_hash, deceased_at, merged_into_id, created_at.',
                    'Create, update, and soft-delete actions.',
                    '`isDeliverable` derived: at least one non-null contact method.',
                    'Relationship accepts a preset chip value or a custom string.',
                  ],
                  tr: [
                    'RLS scoped by `owner_id`.',
                    'GIN trigram index on `name` for the duplicate detection built next sprint.',
                    '`birthday_precision` mirrors `occurred_precision` semantics — some users know the month but not the day.',
                    'Every action calls `authorize()` before touching data; no query bypasses it (ADR-009).',
                    'Deletion is soft, and must refuse when the member is referenced by a sealed capsule (enforced in PHASE-05; the check hook exists here).',
                  ],
                  impl: [
                    'Write the schema in `packages/db/src/schema/member.ts` from §34.1 verbatim, and generate the migration; read the SQL.',
                    'Add the RLS policy scoped by `owner_id`, with a comment naming its authz counterpart.',
                    'Add the GIN trigram index on `name` now, so the duplicate-detection task does not need a second migration.',
                    'Implement `createMember`, `updateMember`, `deleteMember` in `src/features/member/actions.ts`, each opening with an `authorize()` call.',
                    'Implement `queries.ts` with `listMembers` and `getMember`, both scoped by the session-resolved owner — **never by an owner id from the request**.',
                    'Compute `isDeliverable` in a shared helper so the list, detail, and seal flows all agree.',
                    'Add a `deceased_at` handling note: a deceased member must not be selectable as a capsule recipient (gap G-4), and the copy for that state needs care. Implement the flag now; PHASE-05 enforces it.',
                    'Extend the seed fixtures with the member cast including one deliberately undeliverable member and one with a non-Latin name.',
                  ],
                  files: [
                    'packages/db/src/schema/member.ts',
                    'packages/db/migrations/0006_members.sql',
                    'apps/web/src/features/member/actions.ts',
                    'apps/web/src/features/member/queries.ts',
                    'apps/web/src/features/member/schema.ts',
                    'apps/web/src/features/member/is-deliverable.ts',
                    'packages/db/src/seed/fixtures.ts  (extend)',
                    'apps/web/src/features/member/__tests__/actions.test.ts',
                  ],
                  data: `\`members\` per §34.1, RLS scoped by \`owner_id\`, GIN trigram index on \`name\`.

Two fields carry more weight than their size suggests:

- **\`self_service_token_hash\`** — enables the invite-link import path (§29.11 path 4), which produces the most accurate data in the product because the person fills it in themselves.
- **\`deceased_at\`** — gap G-4. A capsule addressed to someone who has since died must not simply deliver. The flag exists here; PHASE-05 gates on it, and the copy for that case needs review before it ships.

\`birthday_precision\` mirrors \`occurred_precision\`. A user may know "March 1962" and nothing more.`,
                  rules: [
                    'A member record is private to its owner and is never discoverable by another user (§34.1).',
                    'A member with no contact method is allowed but is undeliverable, and the UI must say so before a user tries to address a capsule to them.',
                    'Queries are scoped by the session-resolved owner, never by an owner id supplied in the request.',
                  ],
                  edge: [
                    'A name in Devanagari, Tamil, or Arabic script — must store and index correctly; the trigram index must not mangle it.',
                    'A birthday of 29 February — recurrence handling in the event sprint must not crash on non-leap years.',
                    'A member whose birthday year is unknown — `birthday_precision` covers this; the UI must not invent a year.',
                    'A member referenced by a sealed capsule being deleted — must be refused with an explanation naming the capsule.',
                    'Two members with identical names — legitimate; duplicate detection suggests, never auto-merges.',
                    'A `linked_user_id` pointing at a user who later deletes their account — the member row survives as the owner\'s private record.',
                  ],
                  err: ['Deletion refused due to a sealed-capsule reference returns a specific, actionable message naming the capsule, not a generic failure.'],
                  sec: [
                    'RLS plus authz on every path.',
                    'The self-service token is stored hashed from the first migration, even though it is used next sprint.',
                    'Interests feed the gift AI later; they are personal data and belong in export and deletion.',
                  ],
                  tests: {
                    unit: ['`isDeliverable` true with only an email, only a phone, and false with neither.', 'Relationship accepts preset and custom values.'],
                    integration: ['Create, update, and delete each call `authorize()` — asserted with a spy.', 'A query cannot be steered to another owner by passing an owner id.'],
                    db: ['RLS: owner B cannot select owner A\'s members.', 'Trigram index used by a similarity query (assert via query plan).'],
                  },
                  ac: [
                    'Migration applies with RLS and the trigram index.',
                    'CRUD actions all route through `lib/authz`, proven by test.',
                    'Owner scoping derives from the session, proven by an attempted override.',
                    '`isDeliverable` correct for all three cases.',
                    'Non-Latin names store and index correctly.',
                    'Seed cast includes an undeliverable member and a non-Latin name.',
                  ],
                  notes: ['Model the full §34.1 shape now. Adding `self_service_token_hash` next sprint would mean a second migration on a table that already holds user data.'],
                },
                {
                  name: 'Build Member List and Detail Screens', type: 'frontend', priority: 'high',
                  deps: ['TASK-030', 'TASK-014'], trace: ['§29.11'],
                  obj: 'Build the member list with next-occasion subtext and sorting, and the member detail screen with quick actions.',
                  ctx: 'Blueprint §29.11 specifies the list (avatar, name, relationship chip, next-occasion subtext, three sort modes, search, grouped headers past twenty members) and the detail screen (hero, occasions, shared memories, quick actions).',
                  why: 'The next-occasion subtext is what makes this screen useful rather than a contact list. "Birthday · Mar 14 · in 22 days" is the information that prompts action, and it is the reason the Events module and this one are built in the same phase.',
                  out: 'A member list that sorts by upcoming occasion by default, and a detail screen that answers "what is coming up for this person and what have I made for them".',
                  fr: [
                    'List: avatar, name, relationship chip, next-occasion subtext.',
                    'Sort: upcoming occasion (default), A–Z, recently added.',
                    'Search by name.',
                    'Grouped headers by relationship when the list exceeds twenty.',
                    'Undeliverable members show a persistent amber indicator with a one-tap fix.',
                    'Detail: hero card, occasions list, shared memory timeline, quick actions (Create memory, Set a reminder), edit, delete.',
                  ],
                  tr: [
                    'Next-occasion computed server-side from the events module so the list is one query rather than N.',
                    'Virtualised list above a threshold, reusing the pattern from the timeline task.',
                    'Empty state copy verbatim from §29.11: "Add the people who matter — we will help you remember their milestones".',
                  ],
                  impl: [
                    'Build the list screen with the three sort modes; default to upcoming occasion because that is the actionable order.',
                    'Compute next-occasion in the query, joining the events module through its public `queries.ts` rather than reading its tables directly (ADR-004).',
                    'Render the amber undeliverable indicator with a tap target that opens the edit sheet focused on the contact fields — the fix must be one tap, not a hunt.',
                    'Build the detail screen with the shared-memory strip left as a placeholder until the memory module lands in this same phase, then wire it.',
                    'Use the PHASE-01 empty, loading, and error templates with the §29.11 copy.',
                    'Add the delete confirmation with the §29.11 wording: "This won\'t delete memories you\'ve made".',
                  ],
                  files: [
                    'apps/web/src/app/(app)/members/page.tsx',
                    'apps/web/src/app/(app)/members/[id]/page.tsx',
                    'apps/web/src/features/member/components/MemberList.tsx',
                    'apps/web/src/features/member/components/MemberCard.tsx',
                    'apps/web/src/features/member/components/MemberDetail.tsx',
                    'apps/web/src/features/member/components/UndeliverableBadge.tsx',
                    'apps/web/src/features/member/__tests__/list.test.tsx',
                  ],
                  ui: `Per §29.11. List rows: avatar, name in Inter semibold, relationship chip, and subtext "Birthday · Mar 14 · in 22 days". Undeliverable members carry an amber dot plus the words "No contact" — never colour alone (§26.8).

Detail: hero card with avatar and relationship, then occasions, then a shared-memory strip, then quick actions. Delete confirmation reassures: "This won't delete memories you've made."

Empty state uses the §29.11 copy verbatim.`,
                  rules: [
                    'Default sort is upcoming occasion, because that is the order that prompts action.',
                    'Undeliverable state is stated in words as well as colour.',
                    'The delete confirmation must reassure that memories survive.',
                  ],
                  edge: [
                    'A member with no occasions at all — subtext shows relationship only, not an empty separator.',
                    'A member whose next occasion is today — "Birthday · today" rather than "in 0 days".',
                    'A very long name or custom relationship — truncate with the full value available to assistive technology.',
                    'A 29 February birthday in a non-leap year — must show a sensible next occurrence rather than failing.',
                    'A list of 500 members — virtualise; verify scroll performance.',
                    'A deceased member — shown distinctly and gently, and not offered as a capsule recipient.',
                  ],
                  err: ['A failed next-occasion computation must degrade to showing the member without subtext, never blank the row.'],
                  sec: ['Avatar URLs are signed and short-lived from PHASE-04; fall back to initials on expiry rather than a broken image.'],
                  tests: {
                    component: [
                      'Three sort modes order correctly.',
                      'Undeliverable badge renders with text, not colour alone.',
                      'Today\'s occasion renders as "today".',
                      '29 February birthday resolves in a non-leap year.',
                    ],
                    e2e: ['Add a member, see it in the list, open detail, edit contact details, watch the undeliverable badge clear.'],
                    a11y: ['axe on both screens; truncated names expose full value.'],
                  },
                  ac: [
                    'Both screens implemented per §29.11 with all five states in both themes.',
                    'Default sort is upcoming occasion.',
                    'Undeliverable indicator has a one-tap fix.',
                    'Empty state copy verbatim from the blueprint.',
                    '29 February and today-occasion cases handled.',
                    'axe clean.',
                  ],
                  notes: ['The shared-memory strip depends on the memory module in this same phase; sequence the wiring after TASK-038.'],
                },
              ],
            },
          ],
        },
        {
          id: 'SPR-03-01-02', name: 'Member Import Paths & Deduplication',
          objective: 'Four import paths that work on every platform, plus merge.',
          priority: 'high', deps: ['SPR-03-01-01'], duration: '~4 days',
          goal: 'A user on any device can populate their member list without typing everything, and can clean up duplicates afterwards.',
          inScope: ['Contact Picker where available', 'vCard and CSV upload', 'Self-service invite link', 'Duplicate detection and merge'],
          outScope: ['Calendar import (no web API exists — see §29.0)', 'Social graph import'],
          approach: [
            'Present four paths as equals (§29.11). On iOS the file and invite paths are primary, so they must feel first-class rather than apologetic.',
            'The invite link is the highest-quality path and doubles as acquisition — design it as the good option, not the consolation.',
          ],
          archChanges: ['Introduces the first public tokenised route beyond auth: `/m/[token]`'],
          deliverables: ['Four import paths', 'Merge with documented semantics'],
          testing: ['Malformed file parsing', 'Feature detection', 'Merge semantics', 'Token security'],
          ac: ['All four paths work; iOS verified on device', 'Merge semantics match gap G-2'],
          dod: ['Merge semantics documented in the module doc and in code'],
          trace: ['§29.11', '§29.0', 'gap G-2'],
          epics: [
            {
              id: 'EPIC-03-01-02-01', name: 'Import Paths',
              objective: 'Build the three non-manual import paths, each fully functional on the platforms where it exists.',
              value: 'Blueprint §29.0 records that the Contact Picker API is Chromium/Android only — the designer brief\'s primary path simply does not exist for roughly half the target audience. This epic is where that gap is closed properly instead of apologised for.',
              stories: [
                ['Android user', 'to pick people from my contacts', 'setup takes seconds'],
                ['iPhone user', 'a path that is as good as the Android one', 'I am not treated as a second-class case'],
                ['user', 'to let my family fill in their own details', 'the information is right and stays right'],
              ],
              functional: ['Contact Picker with a permission primer', 'vCard/CSV upload with a per-row validation report', 'Invite link with a public self-fill page'],
              technical: ['Feature detection before rendering the picker option', 'Streaming parse for large files', 'Hashed single-use tokens'],
              ui: ['Four paths presented as equals', 'Permission primer before the OS prompt', 'Mapping preview with per-row status'],
              security: ['The public self-fill page discloses only the owner\'s display name', 'Token hashed, expiring, single-use'],
              testing: ['Malformed vCard and CSV', 'Feature detection', 'Token lifecycle', 'axe'],
              ac: ['All three paths functional', 'iOS verified', 'Malformed input handled without data loss'],
              trace: ['§29.11', '§29.0'],
              tasks: [
                {
                  name: 'Implement vCard and CSV Member Import with Validation Report', type: 'frontend', priority: 'high',
                  deps: ['TASK-030'], trace: ['§29.11', '§29.0'],
                  obj: 'Build the file-based import path: drag-and-drop or picker for `.vcf` and `.csv`, with a mapping preview and a per-row validation report.',
                  ctx: 'Blueprint §29.11 makes this "the primary import path on iOS and desktop" and requires it to "feel first-class: drag-and-drop on desktop, file picker on mobile, sample template download".',
                  why: 'The Contact Picker API does not exist on iOS Safari. Without a genuinely good file path, every iPhone user types every member by hand — which for a family archivist with thirty relatives is enough friction to abandon the product. This is not a fallback; for half the audience it is the path.',
                  out: 'A working import accepting vCard and CSV, showing a mapping preview with a per-row status ("38 ready · 2 need a birthday"), and importing only the rows the user confirms.',
                  fr: [
                    'Accept `.vcf` (vCard 3.0 and 4.0) and `.csv`.',
                    'Drag-and-drop on desktop; file picker on mobile.',
                    'Downloadable CSV template.',
                    'Column mapping UI for CSV with sensible auto-detection.',
                    'Per-row validation report with counts and an inline reason per failing row.',
                    'User selects which rows to import; nothing is imported without confirmation.',
                    'Duplicate rows against existing members flagged before import, not after.',
                  ],
                  tr: [
                    'Parse client-side so no file is uploaded until the user confirms — this is both faster and better for privacy.',
                    'Streaming or chunked parse so a 5,000-contact export does not freeze the tab.',
                    'Tolerant parsing: a malformed row is reported and skipped, never fatal to the whole file.',
                    'Name, phone, and email validated with the `@mm/shared` validators, so Unicode names and country-aware phone numbers behave identically to manual entry.',
                  ],
                  impl: [
                    'Build the upload surface with drag-and-drop and a file input, stating accepted types and size limits up front (§33.7).',
                    'Implement vCard parsing covering `FN`, `N`, `TEL`, `EMAIL`, `BDAY`, and `ANNIVERSARY`. Handle both 3.0 and 4.0 date formats, including partial dates such as `--0314` (day and month, no year) which map directly to `birthday_precision`.',
                    'Implement CSV parsing with header auto-detection and a manual mapping fallback. Provide the downloadable template so a user assembling a list by hand has a known-good shape.',
                    'Build the validation report: total rows, ready rows, rows needing attention with a per-row reason, and rows that duplicate an existing member.',
                    'Let the user deselect rows. Import only what is confirmed, in a single transaction, and report the result.',
                    'Run duplicate detection against existing members using the trigram index before import, so the user resolves collisions once rather than cleaning up afterwards.',
                    'Handle very large files by parsing in chunks with progress, and cap the row count with a clear message rather than a silent truncation (§33 "no silent caps").',
                  ],
                  files: [
                    'apps/web/src/features/member/components/ImportSheet.tsx',
                    'apps/web/src/features/member/components/ImportReport.tsx',
                    'apps/web/src/features/member/import/parse-vcard.ts',
                    'apps/web/src/features/member/import/parse-csv.ts',
                    'apps/web/src/features/member/import/validate-rows.ts',
                    'apps/web/src/features/member/actions.ts  (bulk create)',
                    'apps/web/public/member-import-template.csv',
                    'apps/web/src/features/member/import/__tests__/parse-vcard.test.ts',
                    'apps/web/src/features/member/import/__tests__/parse-csv.test.ts',
                  ],
                  ui: `Presented as one of four equal options in the Add Member sheet, labelled "Upload a file" with the accepted types stated.

Desktop shows a drop zone; mobile shows a button. Both link the template download.

**Report** — the substance of this screen:

${'```'}
40 contacts found
  38 ready to add
   1 needs a birthday      (Priya Sharma)
   1 looks like a duplicate (Ravi Kumar — already added)
${'```'}

Each row is selectable, with the reason inline. Import button states the count: "Add 38 members".`,
                  rules: [
                    'Nothing is imported without explicit confirmation.',
                    'A malformed row is reported and skipped; it never fails the whole file.',
                    'Row caps are stated, never silent (§33 no-silent-caps).',
                    'Parsing happens client-side; the file is not uploaded.',
                  ],
                  edge: [
                    'vCard partial birthdays (`--0314`, `1974`) — map to `birthday_precision` rather than inventing a full date.',
                    'vCard with multiple `TEL` or `EMAIL` entries — take the preferred one, and record in §20 which rule was used.',
                    'CSV with a byte-order mark, semicolon delimiters, or CRLF endings — all common from spreadsheet exports; handle all three.',
                    'CSV with quoted fields containing commas and newlines.',
                    'Non-Latin names in a Latin-1-encoded CSV — detect encoding or state the requirement clearly rather than importing mojibake.',
                    'A 5,000-row file — chunked parse with progress; no frozen tab.',
                    'A file that is not actually vCard or CSV despite its extension — fail with a clear message naming what was expected.',
                    'An empty file, or a file with headers only.',
                  ],
                  err: ['A parse failure names the line number and the reason. A partial import must report exactly which rows were added.'],
                  sec: [
                    'Client-side parsing means contact data is not transmitted until confirmed — state this in the UI, because it is a genuine privacy benefit worth communicating.',
                    'Bulk create is rate-limited and row-capped to prevent using import as an amplification vector.',
                    'Imported contact data is personal data belonging to third parties; it is covered by export and deletion like any other member data.',
                  ],
                  tests: {
                    unit: [
                      'vCard 3.0 and 4.0 both parse.',
                      'Partial birthdays map to the correct precision.',
                      'CSV with BOM, semicolons, and CRLF all parse.',
                      'Quoted fields with embedded commas and newlines parse.',
                      'Malformed row is skipped and reported, not fatal.',
                      'Row cap is reported explicitly.',
                    ],
                    component: ['Report renders counts and per-row reasons; deselecting a row excludes it from the import count.'],
                    e2e: ['Upload a 40-row file on a mobile viewport, deselect one row, import, and see 39 members.'],
                    a11y: ['Drop zone is keyboard operable; the report table is navigable and its statuses are announced.'],
                  },
                  ac: [
                    'vCard and CSV both import successfully, including the awkward formats in §13.',
                    'Partial birthdays preserved with correct precision.',
                    'Validation report shows counts and per-row reasons.',
                    'Nothing imports without confirmation.',
                    'Row caps stated, not silent.',
                    '5,000-row file parses without freezing the tab.',
                    'Verified on a real iPhone.',
                    'axe clean.',
                  ],
                  notes: [
                    'Record the multi-value `TEL`/`EMAIL` selection rule in §20.',
                    'This path carries the iOS experience. Give it the polish the Contact Picker would have had.',
                  ],
                },
                {
                  name: 'Implement Contact Picker Import with Feature Detection', type: 'frontend', priority: 'medium',
                  deps: ['TASK-030'], trace: ['§29.11', '§29.0'],
                  obj: 'Add the Contact Picker path where the API exists, behind a permission primer, and hide the option entirely where it does not.',
                  ctx: 'Blueprint §29.11 requires a permission primer stating "We only read names, numbers & birthdays. Nothing is uploaded until you choose who to add", and requires the option to be offered **only when `navigator.contacts` exists** — never a button that will fail.',
                  why: 'A button that does nothing on iPhone is worse than no button. Feature detection is trivial and the failure mode of skipping it is a support ticket from every iOS user.',
                  out: 'On Chromium/Android, a multi-select contact import with detected birthdays behind a primer. Everywhere else, the option is absent and the file and invite paths take its place.',
                  fr: [
                    'Render the option only when `navigator.contacts` and `ContactsManager` are present.',
                    'Permission primer before invoking the picker.',
                    'Request only name, tel, email, and — where supported — birthday.',
                    'Multi-select with a review step before import.',
                    'Duplicate check against existing members before import.',
                  ],
                  tr: [
                    'Feature-detect both `navigator.contacts` and the specific properties supported via `getProperties()`, since support varies.',
                    'The API returns arrays per property; normalise to the member shape.',
                    'The picker cannot be invoked without a user gesture — the primer\'s confirm button is that gesture.',
                  ],
                  impl: [
                    'Add a capability check module so this and other platform-conditional features share one place for detection.',
                    'Build the primer using the PHASE-01 permission-primer component, with the §29.11 copy verbatim.',
                    'Invoke `navigator.contacts.select(props, { multiple: true })` from the primer\'s confirm action.',
                    'Query `getProperties()` first and request only supported properties — asking for `birthday` where unsupported throws.',
                    'Normalise the returned arrays, run duplicate detection, present a review list, and import on confirmation.',
                    'Where the API is absent, the Add Member sheet shows three options rather than four, with no explanation needed — the absence should be invisible, not apologetic.',
                  ],
                  files: [
                    'apps/web/src/lib/capabilities.ts',
                    'apps/web/src/features/member/components/ContactPickerOption.tsx',
                    'apps/web/src/features/member/import/normalise-contacts.ts',
                    'apps/web/src/features/member/__tests__/contact-picker.test.tsx',
                  ],
                  ui: `Option appears in the Add Member sheet as "Import from contacts" **only when supported**.

Primer, verbatim from §29.11: "We only read names, numbers & birthdays. Nothing is uploaded until you choose who to add." Confirm and "Not now", with "Not now" carrying no penalty.

After picking: a review list with checkboxes, detected birthdays shown, duplicates flagged.`,
                  rules: [
                    'Never render the option where the API is absent.',
                    'The primer precedes the OS prompt, always.',
                    '"Not now" must not disable the option permanently or nag.',
                  ],
                  edge: [
                    'API present but `birthday` unsupported — request only supported properties.',
                    'User cancels the picker — a normal outcome, no error.',
                    'A contact with several phone numbers — apply the same selection rule as the file import, for consistency.',
                    'A contact with no name — skip with a reported reason.',
                    'Desktop Chrome, where the API exists but returns nothing useful — verify behaviour and hide the option if it is not genuinely usable.',
                    'Permission permanently denied at OS level — detect where possible and fall back gracefully.',
                  ],
                  err: ['A thrown API call must fall back to the other import paths with a brief explanation, never a dead end.'],
                  sec: ['Contact data is normalised and reviewed client-side; nothing is sent until the user confirms.'],
                  tests: {
                    component: [
                      'Option hidden when `navigator.contacts` is absent.',
                      'Primer precedes invocation.',
                      'Unsupported properties are not requested.',
                      'Cancellation produces no error state.',
                    ],
                    e2e: ['Chromium with a mocked contacts API: pick three, review, import.'],
                  },
                  ac: [
                    'Option present only where supported, verified on iOS Safari by its absence.',
                    'Primer copy verbatim from §29.11.',
                    'Only supported properties requested.',
                    'Cancellation handled as normal.',
                    'Duplicates flagged before import.',
                  ],
                  notes: ['`lib/capabilities.ts` created here will be reused by PHASE-06 for install and share-target detection and PHASE-07 for push.'],
                },
                {
                  name: 'Build Self-Service Member Invite Link and Public Fill Page', type: 'fullstack', priority: 'high',
                  deps: ['TASK-030'], trace: ['§29.11', '§34.1'],
                  obj: 'Let an owner send a link so the member fills in their own name, photo, birthday, and contact details on a public page requiring no account.',
                  ctx: 'Blueprint §29.11 calls this "the highest-quality data path in the product — self-reported details are accurate and self-maintaining — and it doubles as an acquisition loop. It exists *because* of the web contact-picker limitation, and it is genuinely better than what the native brief proposed."',
                  why: 'Two reasons this matters more than it looks. Data quality: a birthday the person entered themselves is right, and they can correct it later. Acquisition: the recipient sees the product, in a warm context, doing something useful for someone who cares about them — which is the cheapest introduction available.',
                  out: 'A shareable link per member, a public no-account page where they complete their own details, and the owner\'s record updating on submission with an optional review step.',
                  fr: [
                    'Generate a link per member; regenerate to invalidate the previous one.',
                    'Public page at `/m/[token]` showing only the owner\'s display name and a warm explanation.',
                    'Fields the member can fill: preferred name, photo, birthday (with precision), anniversary, email, phone, and interests.',
                    'Submission updates the member record; the owner is notified.',
                    'Token expires (recommend 30 days) and is single-use per submission, with the owner able to reissue.',
                    'Owner can require review before changes apply — decide the default and record it.',
                  ],
                  tr: [
                    'Token: 32 bytes CSPRNG, stored hashed, compared in constant time — the same pattern as share links.',
                    'The page is server-rendered and works without JavaScript for the basic form path, matching the philosophy applied to `/c/[token]`.',
                    '`noindex, nofollow, noarchive` headers.',
                    'Rate-limited by token to prevent brute-force enumeration.',
                  ],
                  impl: [
                    'Add token generation to the member actions: create, hash, store, and return the plaintext once for sharing.',
                    'Build `/m/[token]` as a server component with a progressively-enhanced form. Validate server-side with the shared schemas.',
                    'Write the page copy carefully. The visitor did not ask for this: it must explain who is asking, why, and what happens to what they enter, in two sentences. **Disclose nothing about the owner beyond their display name** — not their email, not their other members, not their memory count.',
                    'On submission, update the member and notify the owner. Implement the review-before-apply option; recommend defaulting to auto-apply for contact fields and review for the photo, and record the reasoning in §20.',
                    'Add the share affordance in the member detail screen using Web Share where available, with copy-link as the fallback.',
                    'Add expiry and reissue. An expired token shows a page inviting the visitor to ask the owner for a fresh link — never a bare error.',
                    'Rate-limit by token and by IP.',
                  ],
                  archDiagram: `owner                                     member (no account)
  │ generate link                            │
  ├─▶ token (shown once) ──── share ────────▶│
  │                                          ▼
  │                              GET /m/[token]  (server-rendered, no JS needed)
  │                                   ├─ verify hashed token, unexpired
  │                                   ├─ show owner display name ONLY
  │                                   └─ form: name, photo, birthday, contact
  │◀── notified ───────────────── POST submit
  ▼
member record updated (auto-apply or review, per setting)`,
                  files: [
                    'apps/web/src/app/m/[token]/page.tsx',
                    'apps/web/src/app/m/[token]/actions.ts',
                    'apps/web/src/features/member/self-service.ts',
                    'apps/web/src/features/member/components/InviteLinkSheet.tsx',
                    'apps/web/src/features/member/__tests__/self-service.test.ts',
                  ],
                  api: {
                    method: 'POST', path: '/m/[token]',
                    req: '{\n  "name": "Priya Sharma",\n  "birthday": "1962-03",\n  "birthdayPrecision": "month",\n  "email": "priya@example.com",\n  "phone": "+919876543210"\n}',
                    res: '{ "ok": true, "data": { "message": "Thanks — Riya will see this." } }',
                    validation: ['Token valid, unexpired, unconsumed', 'Name non-empty and Unicode-safe', 'Email and phone validated by the shared validators', 'Birthday precision consistent with the supplied value'],
                    errors: [
                      ['404', 'MEMBER_TOKEN_INVALID', 'Unknown, expired, or already used'],
                      ['429', 'RATE_LIMIT_TOKEN', 'Too many attempts against this token'],
                      ['422', 'VALIDATION_FAILED', 'Field-level validation error'],
                    ],
                  },
                  rules: [
                    'The page discloses only the owner\'s display name. Nothing else about the owner or their archive.',
                    'No account is required, ever, on this page.',
                    'The token is hashed at rest and rate-limited in use.',
                    '`noindex` — this page must never be indexed.',
                  ],
                  edge: [
                    'The visitor is suspicious of the link — the copy must be reassuring and specific enough to be credible without over-explaining.',
                    'The visitor submits and then wants to correct something — a reissued link should be possible; document whether the same token allows a second submission.',
                    'The member is already a user of the product — offer to link accounts, but do not require it.',
                    'An expired token — a warm page inviting them to ask for a new link.',
                    'The owner deletes the member while the link is outstanding — the token must stop working.',
                    'JavaScript disabled — the form must still submit.',
                    'The visitor submits a photo — size and type limits stated up front; this touches PHASE-04 storage, so gate the photo field behind that dependency or accept it as a deferred field and note it.',
                  ],
                  err: ['Every failure state is a designed page, not a stack trace: invalid, expired, revoked, and rate-limited each have their own warm copy.'],
                  sec: [
                    'Constant-time token comparison; hashed at rest.',
                    'No owner information leaked beyond the display name.',
                    'Rate-limited by token and IP.',
                    '`noindex, nofollow, noarchive`.',
                    'Server-side validation is authoritative; the page works without JavaScript, so client validation cannot be relied upon.',
                  ],
                  tests: {
                    integration: [
                      'Valid token renders the form; submission updates the member and notifies the owner.',
                      'Expired, revoked, and unknown tokens each render their designed state.',
                      'Deleting the member invalidates the token.',
                      'Rate limit triggers after repeated attempts.',
                    ],
                    e2e: ['**Submit the form with JavaScript disabled and confirm the member updates.**'],
                    security: ['Response contains no owner data beyond the display name — asserted against the rendered HTML.'],
                  },
                  ac: [
                    'Link generation, sharing, expiry, and reissue all work.',
                    'Public page renders and submits with JavaScript disabled.',
                    'Only the owner\'s display name is disclosed, asserted by test against the HTML.',
                    'All four failure states have designed copy.',
                    'Token hashed, rate-limited, `noindex`.',
                    'Owner notified on submission.',
                    'Photo-field dependency on PHASE-04 resolved or explicitly deferred in §20.',
                  ],
                  notes: [
                    'This is the first public tokenised page in the product and it establishes the pattern that `/c/[token]`, `/s/[token]`, and `/j/[token]` all follow. Get the shape right here.',
                    'Record the auto-apply versus review default in §20.',
                  ],
                },
                {
                  name: 'Implement Duplicate Detection and Member Merge', type: 'backend', priority: 'medium',
                  deps: ['TASK-032', 'TASK-034'], trace: ['§29.11', 'gap G-2'],
                  obj: 'Detect likely duplicate members and implement a merge with explicitly defined semantics.',
                  ctx: 'Blueprint §29.11 requires duplicate detection with a side-by-side merge view. Gap analysis G-2 records that the blueprint does not define the merge *semantics* — specifically which capsules follow which record — and assigns that definition to this task.',
                  why: 'Import paths create duplicates; that is unavoidable. Merge without defined semantics is worse than no merge, because silently reassigning or orphaning a capsule addressed to a person is a data-integrity failure on the product\'s core feature. The rule must be written down and enforced.',
                  out: 'Similarity-based duplicate suggestions, a side-by-side merge view, and a merge operation whose semantics are documented, implemented, and tested.',
                  fr: [
                    'Detect duplicates by name similarity (trigram) plus exact contact match, scored.',
                    'Surface suggestions at import time and on the member list.',
                    'Side-by-side merge view showing each conflicting field with a choice.',
                    'Merge is explicit and reversible for a grace period, or clearly irreversible with a confirmation — decide and document.',
                    'Merge semantics per gap G-2: **capsules follow the surviving record; contact history is unioned; an audit entry is written.**',
                  ],
                  tr: [
                    'Similarity via `pg_trgm` on the indexed name column, combined with exact email or phone matches which score higher.',
                    '`merged_into_id` retains the losing record as a tombstone rather than deleting it, so references remain resolvable.',
                    'Merge runs in a single transaction covering member fields, capsule recipients, memory-person links, and the audit entry.',
                  ],
                  impl: [
                    'Implement scoring in `features/member/duplicates.ts`: exact email or phone match scores highest, high name similarity next, same-name-different-contact lowest. Return candidates above a threshold with the reason, so the UI can explain *why* two records look alike.',
                    'Build the side-by-side merge view: each field shows both values with a radio choice, defaulting to the more complete value.',
                    'Implement `mergeMembers(survivingId, mergedId, fieldChoices)` in one transaction: apply chosen fields, union contact details, repoint every reference to the surviving record, set `merged_into_id` on the loser, and write an audit entry.',
                    '**Write the semantics into the code as a comment and into the module doc**: capsules follow the surviving record; contact history is unioned; the losing record becomes a tombstone; the operation is audited.',
                    'Handle the sealed-capsule case explicitly. A capsule sealed to the losing record must resolve to the surviving record and must still deliver. Test this specifically — it is the case gap G-2 exists for.',
                    'Decide reversibility. Recommend irreversible with a clear confirmation, since a reversible merge on a tombstoned record adds significant complexity; record the decision.',
                    'Never auto-merge. Detection suggests; the user decides (§29.11).',
                  ],
                  files: [
                    'apps/web/src/features/member/duplicates.ts',
                    'apps/web/src/features/member/merge.ts',
                    'apps/web/src/features/member/components/MergeSheet.tsx',
                    'apps/web/src/features/member/__tests__/merge.test.ts',
                    'apps/web/src/features/member/__tests__/duplicates.test.ts',
                  ],
                  data: `Uses \`members.merged_into_id\` as a tombstone pointer. No new tables.

**Merge semantics (gap G-2, defined here and binding):**

1. **Capsules follow the surviving record.** A capsule sealed to the merged-away member resolves to the survivor and still delivers. This is non-negotiable: a sealed capsule is a promise (§17.2 item 4).
2. **Contact history is unioned.** Both emails and both phone numbers are retained on the survivor; the user picks the primary.
3. **The losing record becomes a tombstone** via \`merged_into_id\`, not a deletion, so historical references resolve.
4. **An audit entry is written** recording both ids, the field choices, and the actor.
5. **Merge is never automatic.** Detection suggests; the user decides.`,
                  rules: [
                    'Never auto-merge.',
                    'A sealed capsule addressed to a merged-away member must still deliver, to the surviving record.',
                    'The losing record is tombstoned, not deleted.',
                    'Every merge is audited.',
                  ],
                  edge: [
                    'Two members who genuinely share a name — detection must not push toward merging; the reason shown must make the distinction clear.',
                    'A merge where both records have a sealed capsule to the same recipient — both must survive and both must deliver.',
                    'A three-way duplicate — merge pairwise; a merged tombstone must not be offered as a merge target again.',
                    'A merge involving a member with a `linked_user_id` — decide which link survives, and do not silently drop one.',
                    'Conflicting birthdays with different precisions — prefer the more precise value, but let the user override.',
                    'A merge attempted concurrently from two devices — the transaction must make the second attempt a clear no-op rather than corrupting either record.',
                    'A member with an outstanding self-service token — the surviving record\'s token wins; the other is invalidated.',
                  ],
                  err: ['A merge failure must leave both records untouched. There is no acceptable partial merge.'],
                  sec: ['Both records must belong to the same owner, verified through `lib/authz` before anything is read or written.', 'The audit entry records the actor and both ids.'],
                  tests: {
                    unit: [
                      'Scoring: exact email match outranks name similarity; unrelated names score below threshold.',
                      'Field choice defaults favour the more complete value.',
                      'More precise birthday wins by default.',
                    ],
                    integration: [
                      '**A sealed capsule addressed to the merged-away member resolves to the survivor and remains deliverable.**',
                      'Contact details are unioned.',
                      'Tombstone set; the merged record is not offered as a future merge target.',
                      'Audit entry written with both ids and the actor.',
                      'Concurrent merge attempts: one succeeds, the other is a clean no-op.',
                      'A merge across owners is refused by authz.',
                    ],
                  },
                  ac: [
                    'Detection surfaces candidates with a stated reason, at import and on the list.',
                    'Merge view shows fields side by side with defaults.',
                    'All five documented semantics implemented and individually tested.',
                    '**Sealed capsule survives the merge and remains deliverable** — the defining test.',
                    'Never auto-merges.',
                    'Semantics documented in code and in the module doc.',
                    'Reversibility decision recorded in §20.',
                  ],
                  notes: ['The sealed-capsule case is the reason this task is not trivial. Write that test first.'],
                },
              ],
            },
          ],
        },
      ],
    },

    /* -------------------- MOD-03-02 Occasions -------------------- */
    {
      id: 'MOD-03-02', name: 'Occasions & Events Engine',
      purpose: 'Model recurring life events and surface what is coming.',
      priority: 'critical',
      objective: 'Turn a passive archive into a product that prompts action, by knowing what is coming and reminding the user in time to do something about it.',
      business: [
        'Blueprint §27.3 identifies this as the most valuable addition the designer brief made, and §27.4 warns that retrofitting it is a migration rather than a feature.',
        'It is the shared trigger for memories now, and for broadcasts and gifts in later releases.',
      ],
      functional: [
        'Create events with type, date, recurrence, and reminder offsets.',
        'Link events to one or more members.',
        'Auto-derive birthdays and anniversaries from member records.',
        'Month, year, and agenda views.',
        'Region-aware festival display.',
        'Reminder jobs fire once per occurrence.',
      ],
      ui: ['Three calendar views with a Today control (§29.12)', 'Event chips by type with a recurrence indicator', 'Event detail sheet with countdown ring and planned-items checklist'],
      backend: ['Recurrence computation without materialising rows', 'Reminder scheduling into the PHASE-01 job table', 'Festival rules by region'],
      db: ['`events`, `event_members`, `event_reminders` with RLS', 'Derived occurrences computed, not stored'],
      security: ['Owner-scoped through authz and RLS'],
      testing: ['Recurrence across DST and leap years', 'Reminder fired exactly once per year', 'Timezone correctness'],
      ac: ['Yearly events recur correctly including 29 February', 'Reminders fire once per occurrence', 'Three views render correctly'],
      trace: ['§29.12', '§34.2', '§27.4'],
      sprints: [
        {
          id: 'SPR-03-02-01', name: 'Event Model, Recurrence & Reminders',
          objective: 'The engine behind the calendar.',
          priority: 'critical', deps: ['SPR-03-01-01'], duration: '~4 days',
          goal: 'An event with a yearly recurrence and reminder offsets produces the right occurrences and fires each reminder exactly once.',
          inScope: ['Event schema', 'Recurrence computation', 'Reminder offset scheduling', 'Auto-derived member occasions'],
          outScope: ['Calendar UI (next sprint)', 'Festival packs (Release 2 admin)', 'Broadcasts (Release 2)'],
          approach: [
            'Compute occurrences rather than materialising them — a yearly event must not create fifty rows (§34.2).',
            'Guard reminders with `last_fired_for_year` so a restart or a clock adjustment cannot double-send.',
            'Do all date arithmetic on absolute instants with an explicit timezone (ADR-024).',
          ],
          archChanges: ['Adds the first real job kinds to the PHASE-01 worker registry'],
          deliverables: ['Event schema', 'Occurrence computation', 'Reminder scheduling'],
          testing: ['DST, leap year, timezone, and once-only firing'],
          ac: ['Occurrence computation correct across all documented cases', 'Reminders fire once'],
          dod: ['Reminder job kinds registered in the workers handler registry'],
          trace: ['§34.2', 'ADR-024'],
          epics: [
            {
              id: 'EPIC-03-02-01-01', name: 'Event Model & Recurrence',
              objective: 'Create the event schema and correct occurrence computation.',
              value: 'Every prompt, reminder, and future-facing surface in the product depends on knowing when the next occurrence of something is.',
              stories: [['user', 'to add my mother\'s birthday once and be reminded every year', 'I never miss it again']],
              functional: ['Event CRUD with recurrence', 'Member linking, many-to-many', 'Occurrence computation for a date range', 'Auto-derived birthdays from members'],
              technical: ['Occurrences computed, never materialised', 'Absolute-instant arithmetic with explicit timezone', 'Leap-day and DST correctness'],
              db: ['`events`, `event_members`, `event_reminders` with RLS'],
              security: ['Owner-scoped'],
              testing: ['Leap day, DST, month-end, timezone, and range boundaries'],
              ac: ['All documented recurrence cases correct'],
              trace: ['§34.2', 'ADR-024'],
              tasks: [
                {
                  name: 'Create Event Schema with Recurrence and Reminder Offsets', type: 'database', priority: 'critical',
                  deps: ['TASK-030'], trace: ['§34.2', '§29.12', 'ADR-024'],
                  obj: 'Create `events`, `event_members`, and `event_reminders` per blueprint §34.2, with RLS and the indexes reminder scheduling needs.',
                  ctx: 'Blueprint §34.2 specifies the model and makes one design decision explicit: "derived occurrences are computed, not stored — a yearly event does not create 50 rows. `last_fired_for_year` prevents duplicate reminders."',
                  why: 'Materialising occurrences is the obvious approach and the wrong one: it forces a backfill job, it breaks when a user edits the base date, and it produces fifty rows per birthday per user. Computing on read keeps the model small and the edits simple. The `last_fired_for_year` guard is what makes reminders idempotent across worker restarts.',
                  out: 'Three tables with RLS, a `(recurrence, date)` shape that supports range queries, and reminder rows carrying the once-per-year guard.',
                  fr: [
                    '`events`: id, owner_id, title, type (birthday | anniversary | festival | custom), date, recurrence (none | yearly | monthly), all_day, notes, festival_id (nullable), created_at, archived_at.',
                    '`event_members`: event_id, member_id — many-to-many, because an anniversary has two people.',
                    '`event_reminders`: id, event_id, offset_days (0, 1, 3, 7), channels, last_fired_for_year.',
                    'Birthdays and anniversaries auto-derive from member records rather than requiring duplicate entry.',
                  ],
                  tr: [
                    'RLS scoped by `owner_id` on all three tables.',
                    'Index supporting "events with an occurrence in this range" queries.',
                    '`last_fired_for_year` as an integer year, not a timestamp, so the guard is exact and comparison is trivial.',
                    'Dates stored as a date plus the owner\'s timezone context; all arithmetic on absolute instants (ADR-024).',
                  ],
                  impl: [
                    'Write the schema from §34.2 verbatim in `packages/db/src/schema/event.ts`; generate and read the migration.',
                    'Add RLS policies on all three tables with comments naming their authz counterparts.',
                    'Decide and document how member-derived occasions are represented: either materialised event rows kept in sync, or virtual events computed from `members.birthday`. **Recommend virtual**, because a materialised copy drifts when the member\'s birthday is corrected via the self-service page. Record the decision — it affects the calendar query in the next sprint.',
                    'Add the index for range queries. Because occurrences are computed, the query shape is "events whose recurring date falls in this window", which needs care: for yearly events the comparison is on month and day, not the full date. Encode that in the index or a generated column, and document the approach.',
                    'Extend the seed fixtures with events spanning past and future, including a 29 February birthday and one event with all four reminder offsets.',
                  ],
                  files: [
                    'packages/db/src/schema/event.ts',
                    'packages/db/migrations/0007_events.sql',
                    'apps/web/src/features/event/schema.ts',
                    'packages/db/src/seed/fixtures.ts  (extend)',
                    'packages/db/src/__tests__/event-rls.test.ts',
                  ],
                  data: `Three tables per §34.2.

**Occurrences are computed, never stored.** A yearly birthday is one row, not one per year. This keeps edits simple and avoids a backfill job.

**\`last_fired_for_year\`** is an integer year. A reminder for 2027 fires once; a worker restart, a clock adjustment, or a duplicate job cannot re-fire it, because the guard compares years rather than timestamps.

**Member-derived occasions** — recommend virtual (computed from \`members.birthday\`) rather than materialised event rows, so a birthday corrected through the self-service page does not leave a stale duplicate. Record the decision; the calendar query depends on it.`,
                  rules: [
                    'Occurrences are computed on read, never materialised.',
                    'A reminder fires at most once per occurrence, guarded by `last_fired_for_year`.',
                    'All date arithmetic uses absolute instants with an explicit timezone (ADR-024).',
                  ],
                  edge: [
                    '29 February with yearly recurrence — decide and document the non-leap-year behaviour (28 February or 1 March); either is defensible, silence is not.',
                    '31 January with monthly recurrence — same problem, monthly. Document the rule.',
                    'An event whose base date is in the future with `recurrence: none` — must appear once and then not recur.',
                    'A member-derived birthday where the member is deleted — the derived occasion must disappear cleanly.',
                    'An anniversary linked to two members, one of whom is merged away — must follow the surviving record.',
                    'A user changing their timezone — occurrences must not shift by a day.',
                  ],
                  err: ['An invalid recurrence configuration must be rejected at write time with a specific message, not discovered at reminder time.'],
                  sec: ['RLS plus authz on all three tables.'],
                  tests: {
                    db: ['RLS negative tests on all three tables.', 'Range query uses the intended index (assert via plan).'],
                    unit: ['Invalid recurrence rejected at write.', 'Reminder offsets constrained to the allowed set.'],
                  },
                  ac: [
                    'Three tables created with RLS and range-query index.',
                    'Leap-day and month-end recurrence rules documented in §20 and in code.',
                    'Member-derived occasion approach decided and recorded.',
                    '`last_fired_for_year` is an integer year.',
                    'Seed fixtures include a 29 February birthday and a fully-configured reminder set.',
                  ],
                  notes: ['The leap-day and month-end rules are small decisions that will be questioned later. Write them down now.'],
                },
                {
                  name: 'Implement Occurrence Computation and Reminder Scheduling', type: 'backend', priority: 'critical',
                  deps: ['TASK-036'], trace: ['§34.2', '§14', 'ADR-024'],
                  obj: 'Implement occurrence computation for a date range and the reminder job that fires each offset exactly once per occurrence.',
                  ctx: 'This is the engine behind the calendar, the Home screen\'s Up Next card, and the member list\'s next-occasion subtext. It also registers the first real handlers in the PHASE-01 worker registry.',
                  why: 'Date recurrence is a well-known source of subtle bugs: DST shifts, leap days, month-end clamping, and timezone changes all produce off-by-one-day errors that users notice immediately and trust less afterwards. Getting it right once, in a tested pure function, keeps it right everywhere.',
                  out: 'A pure `occurrencesInRange(events, from, to, timezone)` function plus a reminder job that computes due reminders, sends them once, and records the year.',
                  fr: [
                    '`occurrencesInRange` returning occurrences with their absolute instant and source event.',
                    'Next-occurrence helper for a single event, used by the member list and Home.',
                    'Reminder job running daily, computing which offsets are due today per the owner\'s timezone.',
                    'Each reminder fires once per occurrence, guarded by year.',
                    'Reminders enqueue notifications rather than sending directly, so PHASE-07 owns delivery.',
                  ],
                  tr: [
                    'Pure function, no database access, fully unit-testable — this is what makes the edge cases affordable to cover.',
                    'All arithmetic on absolute instants; never add 24-hour days across a DST boundary.',
                    'The job claims through the PHASE-01 loop and is idempotent: running it twice in one day sends nothing twice.',
                    'Owner timezone determines "today", so a user in Mumbai and one in Chicago get their reminders on their own dates.',
                  ],
                  impl: [
                    'Write `lib/occurrence/compute.ts` as a pure function. Implement the leap-day and month-end rules decided in TASK-036, and reference that decision in a comment.',
                    'Handle DST by working in absolute instants and converting for display only. Add a test with an event whose occurrence falls on a DST transition date in a timezone that observes it.',
                    'Write `nextOccurrence(event, now, timezone)` for the single-event case used by the member list and Home card.',
                    'Implement the `event-reminder` handler in `apps/workers/src/handlers/`. It should: find events with reminders whose offset matches today in the owner\'s timezone, filter out those whose `last_fired_for_year` already equals the occurrence year, enqueue notifications, and set the guard **in the same transaction as the enqueue**.',
                    'Register the handler in the worker registry created in PHASE-01.',
                    'Do not send anything from this handler. It enqueues; PHASE-07 delivers. Note the dependency so the two are not implemented twice.',
                    'Write the once-only test by running the handler twice and asserting exactly one enqueue.',
                  ],
                  archDiagram: `daily tick (apps/workers)
   │
   ├─▶ for each event with reminders
   │      occurrencesInRange(event, today±window, owner.timezone)
   │      offset matches today?             ──── no ──▶ skip
   │      last_fired_for_year == year?      ──── yes ─▶ skip   ← the guard
   │
   └─▶ TRANSACTION
          enqueue notification  (PHASE-07 delivers)
          set last_fired_for_year = year
       COMMIT                              ← enqueue and guard together, or neither`,
                  files: [
                    'apps/web/src/lib/occurrence/compute.ts',
                    'apps/web/src/lib/occurrence/next.ts',
                    'apps/workers/src/handlers/event-reminder.ts',
                    'apps/workers/src/handlers/index.ts  (register)',
                    'apps/web/src/lib/occurrence/__tests__/compute.test.ts',
                    'apps/workers/src/handlers/__tests__/event-reminder.test.ts',
                  ],
                  rules: [
                    'A reminder fires at most once per occurrence. The guard and the enqueue commit together.',
                    'All arithmetic on absolute instants (ADR-024).',
                    '"Today" means today in the owner\'s timezone.',
                    'This handler enqueues; it does not send.',
                  ],
                  edge: [
                    'DST transition on the occurrence date — no shift by an hour or a day; test in a timezone that observes DST.',
                    '29 February in a non-leap year — follows the TASK-036 rule.',
                    '31 January monthly recurrence in February — follows the TASK-036 rule.',
                    'A user changing timezone between the reminder being due and the job running — decide whether the new or old timezone governs, and document it.',
                    'The job not running for three days (outage) — decide whether missed reminders send late or are skipped. **Recommend: a reminder more than one day late is skipped**, because "your mother\'s birthday was three days ago" is worse than silence. Record the decision.',
                    'An event edited after its reminder fired for the year — changing the date should allow the new occurrence to fire; the guard is per year, so consider whether an edit should reset it.',
                    'An event archived between due and send — must not send.',
                    'Two workers running the same handler concurrently — the transaction plus row locking must make the second a no-op.',
                  ],
                  err: ['A failure after enqueue but before the guard commits would double-send. The transaction prevents it; test the failure injection explicitly.'],
                  sec: ['The handler runs with worker credentials and must still scope by owner — a bug here could enqueue a notification about one user\'s event to another.'],
                  tests: {
                    unit: [
                      'Yearly occurrence across a DST transition produces the correct local date.',
                      '29 February in a non-leap year follows the documented rule.',
                      'Month-end monthly recurrence follows the documented rule.',
                      '`recurrence: none` produces exactly one occurrence.',
                      'Range boundaries are inclusive/exclusive as documented.',
                      'Two owners in different timezones get different "today" results for the same event date.',
                    ],
                    integration: [
                      '**Running the handler twice enqueues exactly once.**',
                      'Injected failure after enqueue rolls back the guard, so no notification is lost and none is duplicated.',
                      'Archived event does not send.',
                      'Concurrent handlers: exactly one enqueue.',
                    ],
                  },
                  ac: [
                    'All documented recurrence cases pass, including DST, leap day, and month-end.',
                    'Reminder fires exactly once per occurrence, proven by a double-run test.',
                    'Enqueue and guard commit atomically, proven by failure injection.',
                    'Timezone-correct "today" per owner.',
                    'Handler registered in the worker registry.',
                    'Missed-reminder policy decided and recorded.',
                  ],
                  notes: [
                    'The pure function is what makes the edge cases affordable to test. Resist adding database access to it.',
                    'Record the missed-reminder and timezone-change decisions in §20 — both will be asked about.',
                  ],
                },
              ],
            },
            {
              id: 'EPIC-03-02-01-02', name: 'Calendar Views & Event Management',
              objective: 'Build the three calendar views and event CRUD per blueprint §29.12.',
              value: 'This is where "what is coming up" becomes visible, and it is the screen that converts an archive into a product that prompts action.',
              stories: [['user', 'to see the year ahead at a glance', 'I can plan what to make and for whom']],
              functional: ['Month grid, year heat view, agenda list', 'Today control', 'Event chips by type', 'Add/edit event', 'Event detail sheet with countdown and planned-items checklist'],
              technical: ['One query per view range using computed occurrences', 'Region-aware festival display, toggleable'],
              ui: ['Per §29.12 including the empty-month copy', 'Type-coloured chips with recurrence indicator', 'Detail sheet with countdown ring'],
              security: ['Owner-scoped'],
              testing: ['View switching', 'Range correctness', 'Past-date warning', 'axe'],
              ac: ['Three views render correctly', 'Event CRUD works', 'axe clean'],
              trace: ['§29.12'],
              tasks: [
                {
                  name: 'Build Calendar Views (Month, Year, Agenda) with Event CRUD', type: 'frontend', priority: 'high',
                  deps: ['TASK-037', 'TASK-014'], trace: ['§29.12'],
                  obj: 'Build the three calendar views, the add/edit event form, and the event detail sheet, per blueprint §29.12.',
                  ctx: 'Blueprint §29.12 specifies the views (month grid with type-coloured dots, year heat view, agenda list), the chips (🎂 💍 ✨ ⭐ with a recurrence indicator ↻), the form (title, members, date, recurrence, reminder offsets, notes), and the detail sheet (countdown ring, linked member, planned-items checklist, three CTAs).',
                  why: 'The planned-items checklist in the detail sheet is the quiet centrepiece: it shows whether a memory and a gift exist for this occasion. That single line converts the calendar from information into a prompt, which is the whole reason this module exists.',
                  out: 'A calendar with three working views, event creation and editing with recurrence and reminders, and a detail sheet that shows what remains to be done for an occasion.',
                  fr: [
                    'View toggle: Month / Year / Agenda, with the choice remembered.',
                    'Today control returning to the current period.',
                    'Month grid with type-coloured dots; year view as a heat display; agenda as a chronological list.',
                    'Festival events shown by region, toggleable.',
                    'Add/edit: title, linked members, date, recurrence, reminder offsets (multi-select), notes.',
                    'Past one-time date warns "This date has passed — schedule for next year?" **with a one-tap fix rather than a block** (§29.12).',
                    'Detail sheet: countdown ring, linked member, planned-items checklist (memory ✓, gift ✗), CTAs Create memory / Shop gift (hidden until R3) / Edit.',
                    'Empty month: "No occasions this month — add one or import your contacts."',
                  ],
                  tr: [
                    'One query per visible range, using the computed-occurrence function rather than N queries.',
                    'View preference persisted per user.',
                    'The planned-items checklist queries the memory module through its public `queries.ts` (ADR-004).',
                    'Reminder offsets are a multi-select mapping directly to `event_reminders` rows.',
                  ],
                  impl: [
                    'Build the view container with the three-way toggle and the Today control, persisting the chosen view.',
                    'Build the month grid using the occurrence function for the visible range plus a small buffer, so scrolling between months feels instant.',
                    'Build the year heat view and the agenda list from the same data, so switching views is a render change rather than a refetch.',
                    'Build the add/edit form. The past-date case is a **warning with a one-tap fix**, not a validation block — §29.12 is explicit, and blocking here would be the wrong kind of strictness.',
                    'Build the detail sheet with the countdown ring (reusing the PHASE-01 Countdown), the linked member, and the planned-items checklist.',
                    'Hide the "Shop gift" CTA until Release 3 using the release gating established in the navigation config, rather than showing a disabled button (§28.4).',
                    'Show festival events by region with a toggle, defaulting on. The festival source is the Release 2 admin engine, so for Release 1 use a static regional set and note the handoff.',
                    'Implement the empty-month state with the §29.12 copy.',
                  ],
                  files: [
                    'apps/web/src/app/(app)/occasions/page.tsx',
                    'apps/web/src/app/(app)/occasions/[id]/page.tsx',
                    'apps/web/src/features/event/components/MonthGrid.tsx',
                    'apps/web/src/features/event/components/YearHeatView.tsx',
                    'apps/web/src/features/event/components/AgendaList.tsx',
                    'apps/web/src/features/event/components/EventForm.tsx',
                    'apps/web/src/features/event/components/EventDetailSheet.tsx',
                    'apps/web/src/features/event/components/PlannedItems.tsx',
                    'apps/web/src/features/event/actions.ts',
                    'apps/web/src/features/event/queries.ts',
                    'apps/web/src/features/event/__tests__/calendar.test.tsx',
                  ],
                  ui: `Per §29.12.

**Month grid** — dots coloured by type; a day with several occasions shows a count. Tapping a day opens the agenda for it.

**Year heat view** — twelve compact months, density shaded, for spotting a busy season.

**Agenda** — chronological rows with countdown subtext, grouped by month.

**Chips** — 🎂 birthday · 💍 anniversary · ✨ festival · ⭐ custom, with ↻ for recurring. Colour plus icon, never colour alone.

**Detail sheet** — countdown ring at the top, linked member, then the planned-items checklist:

${'```'}
Planned
  ✓ Memory created
  ✗ Gift                     (hidden until Release 3)
${'```'}

Then CTAs. Empty month copy verbatim from §29.12.`,
                  rules: [
                    'A past one-time date warns with a one-tap fix; it never blocks (§29.12).',
                    'Unreleased CTAs are hidden, not disabled (§28.4).',
                    'Chips convey type by icon as well as colour.',
                  ],
                  edge: [
                    'A day with eight occasions — the grid cell must degrade gracefully to a count.',
                    'A month with no occasions — the empty state, not a blank grid.',
                    'An event linked to a member who was merged away — must resolve to the survivor.',
                    'A recurring event whose next occurrence is years away, in the agenda — must sort sensibly rather than dominating the list.',
                    'Timezone change while the calendar is open — occurrences must not shift a day.',
                    'A very long event title in a grid cell — truncate with full value available.',
                    'Reduced motion — the countdown ring must not animate.',
                    'Rapid month navigation — buffered ranges prevent a fetch per tap.',
                  ],
                  err: ['A failed range query shows the error template with retry scoped to the calendar, leaving the shell and the view toggle usable.'],
                  sec: ['All queries owner-scoped through authz.'],
                  tests: {
                    component: [
                      'Three views render the same underlying occurrences.',
                      'Today control returns to the current period.',
                      'Past one-time date shows a warning with a working one-tap fix, and does not block submission.',
                      'Planned-items checklist reflects whether a memory exists.',
                      '"Shop gift" CTA absent at Release 1.',
                      'Empty month renders the specified copy.',
                    ],
                    e2e: ['Create a yearly birthday with two reminder offsets, see it in all three views, open detail, and confirm the countdown.'],
                    a11y: ['axe on all three views and the form; grid cells are keyboard navigable with dates announced.'],
                  },
                  ac: [
                    'Three views implemented per §29.12 with all five states in both themes.',
                    'Event CRUD works including recurrence and multi-select reminder offsets.',
                    'Past-date case warns with a one-tap fix rather than blocking.',
                    'Planned-items checklist accurate.',
                    'Release-3 CTA hidden, not disabled.',
                    'Empty-month copy verbatim.',
                    'One query per range, verified.',
                    'axe clean.',
                  ],
                  notes: ['The planned-items checklist is the part that makes this screen useful. Do not let it slip to a later task.'],
                },
              ],
            },
          ],
        },
      ],
    },

    /* -------------------- MOD-03-03 Memories -------------------- */
    {
      id: 'MOD-03-03', name: 'Memories',
      purpose: 'The atomic unit of the product: media plus meaning.',
      priority: 'critical',
      objective: 'Let a user capture what happened, when it happened, and what it meant — with the date precision a real family archive requires.',
      business: [
        'Blueprint §3 identifies the note as "the entire difference between this product and a photo backup".',
        '`occurred_precision` is what makes importing a decades-old archive work correctly (§13.1).',
      ],
      functional: [
        'Create a memory with media, title, the date it happened, precision, a note, people, and occasion.',
        'View, edit, favourite, and soft-delete with a Trash and a 30-day purge.',
        'Full-text search over title, note, occasion, and people.',
      ],
      ui: ['Create sheet per §29.14–29.15', 'Detail viewer per §29.10', 'Gallery grid per §29.6'],
      backend: ['CRUD through authz', 'FTS tsvector maintenance', 'Soft delete and purge job'],
      db: ['`memories` with RLS, generated tsvector, GIN index', 'Media placeholder fields until PHASE-04'],
      security: ['Private by default (§11.1)', 'Deletion blocked when referenced by a sealed capsule'],
      testing: ['Precision-aware formatting and sorting', 'FTS ranking', 'Soft delete and purge', 'authz coverage'],
      ac: ['A year-precision memory never claims a specific day', 'Search finds by title, note, and person', 'Trash restores'],
      trace: ['§10 Memory', '§13.1', '§29.10', '§29.14', '§29.15'],
      sprints: [
        {
          id: 'SPR-03-03-01', name: 'Memory Model, CRUD & Screens',
          objective: 'The atomic unit, end to end.',
          priority: 'critical', deps: ['SPR-03-01-01', 'SPR-03-02-01'], duration: '~5 days',
          goal: 'A user can create a memory dated 1998 with a note, see it, edit it, delete it, restore it, and find it.',
          inScope: ['Memory schema with precision and FTS', 'CRUD actions', 'Create sheet', 'Detail viewer', 'Gallery grid', 'Trash and purge'],
          outScope: ['Media capture and upload (PHASE-04)', 'Semantic search (Release 2)', 'Comments (Release 2)'],
          approach: [
            'Precision-aware date handling is a shared formatter used by every surface, so no screen can render a year-precision date as a specific day.',
            'Work against seeded media placeholders; PHASE-04 replaces them without touching this module\'s contract.',
          ],
          archChanges: ['Introduces the memory feature module and the FTS pattern'],
          deliverables: ['Memory schema', 'CRUD', 'Three screens', 'Trash and purge job'],
          testing: ['Precision formatting', 'FTS', 'Purge', 'authz', 'axe'],
          ac: ['CRUD end to end', 'Precision correct everywhere', 'Purge removes after 30 days'],
          dod: ['Precision formatter used by every date display in the module'],
          trace: ['§10 Memory', '§13.1'],
          epics: [
            {
              id: 'EPIC-03-03-01-01', name: 'Memory Model & Date Precision',
              objective: 'Create the memory schema with `occurred_precision` and full-text search, and the CRUD actions around it.',
              value: 'Blueprint §13.1: this one field "is the difference between a real family archive and a broken one".',
              stories: [['family archivist', 'to record that a photo is from 1974 without inventing a day', 'my archive tells the truth about what I know']],
              functional: ['Create, update, soft-delete, restore', 'Precision-aware storage and formatting', 'Favourites', 'Occasion tagging', 'FTS'],
              technical: ['Generated tsvector with GIN index', 'Precision-aware sort and display', 'Idempotent create by `client_id` for offline use in PHASE-06'],
              db: ['`memories` with RLS, tsvector, and the media placeholder contract'],
              security: ['Private by default', 'Sealed-capsule reference blocks deletion'],
              testing: ['Precision cases', 'FTS ranking', 'Idempotency', 'authz'],
              ac: ['Precision handled correctly in storage, sort, and display', 'FTS works', 'Idempotent create'],
              trace: ['§10 Memory', '§13.1', '§13.3'],
              tasks: [
                {
                  name: 'Create Memory Schema with occurred_precision and Full-Text Search', type: 'database', priority: 'critical',
                  deps: ['TASK-030', 'TASK-036'], trace: ['§10 Memory', '§13.1', '§13.3', 'ADR-010'],
                  obj: 'Create the `memories` table per blueprint §10 with `occurred_at`, `occurred_precision`, a generated tsvector, RLS, and the media placeholder contract PHASE-04 will fulfil.',
                  ctx: 'Blueprint §10 defines the entity and §13.1 explains why precision matters: "a scanned 1974 wedding photo has a *year*, not a timestamp. Without precision, imported archives either lie about their dates or collapse into the upload date."',
                  why: 'This is the field that makes the product credible to the family archivist persona. It also has teeth: a year-precision memory must not match an On This Day query for a specific day, must sort sensibly among exact-dated neighbours, and must never be displayed as though the day were known. Those three consequences are easy to miss and impossible to fix later without re-auditing every date display.',
                  out: 'A migration creating `memories` with RLS, a generated tsvector with a GIN index, trigram support, and the `client_id` idempotency key PHASE-06 offline creation depends on.',
                  fr: [
                    'Fields per §10: id, vault_id, author_id, title, note, occurred_at, occurred_precision, created_at, updated_at, occasion, is_favourite, visibility, cover_media_id, client_id, sync_state, deleted_at.',
                    'Generated tsvector over title, note, and occasion, with a GIN index.',
                    '`client_id` unique per author, so an offline retry cannot create a duplicate.',
                    'Soft delete via `deleted_at`.',
                  ],
                  tr: [
                    'RLS scoped by vault membership, mirroring the authz rule.',
                    'tsvector as a generated column so it cannot drift from the source text.',
                    '`pg_trgm` index on title for typo tolerance (ADR-010).',
                    'Index on `(vault_id, occurred_at DESC)` for the timeline query, and on `(vault_id, deleted_at)` for Trash.',
                    '`occurred_precision` from the `@mm/shared` enum.',
                  ],
                  impl: [
                    'Write the schema from §10 verbatim; generate and read the migration.',
                    'Add the generated tsvector column combining title, note, and occasion with appropriate weights — title should outrank note.',
                    'Add the GIN index on the tsvector and a trigram index on title.',
                    'Add the composite index for the timeline query. This is the hottest read path in the product after session validation.',
                    'Add the unique constraint on `(author_id, client_id)` where `client_id` is not null.',
                    'Add RLS policies scoped by vault membership, with comments naming their authz counterparts.',
                    'Write `lib/format/memory-date.ts` — the precision-aware formatter — **in this task**, so every consuming screen inherits it rather than formatting dates ad hoc. It must render "14 March 1998", "March 1998", or "1998" according to precision, and must never fabricate missing components.',
                    'Extend the seed fixtures with memories at all four precisions, including the 1974 year-precision case.',
                  ],
                  files: [
                    'packages/db/src/schema/memory.ts',
                    'packages/db/migrations/0008_memories.sql',
                    'apps/web/src/lib/format/memory-date.ts',
                    'apps/web/src/features/memory/schema.ts',
                    'packages/db/src/seed/fixtures.ts  (extend)',
                    'apps/web/src/lib/format/__tests__/memory-date.test.ts',
                    'packages/db/src/__tests__/memory-rls.test.ts',
                  ],
                  data: `\`memories\` per §10, RLS scoped by vault membership.

**\`occurred_at\` + \`occurred_precision\`** is the pair that matters. Consequences that must hold across the whole product:

1. **Display** never fabricates unknown components. \`year\` precision renders "1998", never "1 January 1998".
2. **Sorting** places a year-precision memory sensibly among exact-dated neighbours — document the rule (recommend: sort by \`occurred_at\`, which for year precision is the start of the year, and treat that as intentional).
3. **On This Day** must not match a year-precision memory to a specific day (§13.2 lists this as a required test).

**Generated tsvector**, not a trigger-maintained column, so the index cannot drift from the text.

**\`client_id\`** unique per author enables idempotent offline creation in PHASE-06. Adding it later would mean a migration on a populated table.

**Media fields** are placeholders until PHASE-04: \`cover_media_id\` exists with no foreign key yet. Freeze this contract jointly with PHASE-04 before either phase proceeds far.`,
                  rules: [
                    'A date display never invents a component the precision does not support.',
                    'The precision formatter is the only way dates are rendered in this module.',
                    'Deletion is soft; hard deletion happens only via the purge job.',
                    '`client_id` makes create idempotent.',
                  ],
                  edge: [
                    'A memory with year precision and an On This Day query for 14 March — must not match (§13.2).',
                    'A memory with month precision sorted among exact dates in the same month — document and test the ordering.',
                    'A memory dated in the future — allowed (a scheduled memory for an upcoming event), but the timeline must place it correctly relative to the Now divider.',
                    'A memory with an empty note — allowed; the UI must render gracefully rather than showing an empty block.',
                    'A very long note — index and display must both cope; consider truncation with expand.',
                    'A title in a non-Latin script — FTS configuration must not silently fail to index it; verify with a Devanagari title and document the limitation if the chosen text-search configuration cannot handle it.',
                    'Two offline creates with the same `client_id` — the second is a no-op returning the first.',
                  ],
                  err: ['A duplicate `client_id` returns the existing memory rather than an error, since that is the correct offline-retry semantics.'],
                  sec: ['RLS plus authz.', 'Default visibility is private (§11.1).'],
                  tests: {
                    unit: [
                      'Formatter renders each of the four precisions correctly and never fabricates components.',
                      'Sort rule documented and asserted for mixed precisions.',
                    ],
                    db: [
                      'RLS: a member of another vault cannot select these rows.',
                      'FTS matches on title and note, with title ranked higher.',
                      'Trigram index tolerates a one-character typo in a title search.',
                      '**A year-precision memory does not match a day-specific query.**',
                      'Duplicate `client_id` insert is rejected by the constraint.',
                    ],
                  },
                  ac: [
                    'Migration applies with RLS, generated tsvector, GIN and trigram indexes, and the timeline composite index.',
                    'Precision formatter implemented and used, with all four cases tested.',
                    'Year-precision memory excluded from day-specific matching, proven by test.',
                    'Sort rule for mixed precisions documented and tested.',
                    '`client_id` idempotency constraint in place.',
                    'Non-Latin title indexing verified, with any limitation documented.',
                    'Seed fixtures cover all four precisions.',
                    'Media placeholder contract agreed with PHASE-04 and recorded in §20.',
                  ],
                  notes: [
                    'Write the formatter in this task. If it lands later, three screens will already have formatted dates by hand and one of them will be wrong.',
                    'Freeze the `MediaAsset` contract with PHASE-04 before this migration ships, so `cover_media_id` does not need to change shape.',
                  ],
                },
                {
                  name: 'Implement Memory CRUD Actions with Soft Delete and Purge', type: 'backend', priority: 'critical',
                  deps: ['TASK-039', 'TASK-027'], trace: ['§10 Memory', '§11.5', '§20.9'],
                  obj: 'Implement create, update, soft-delete, restore, and the 30-day purge job, all routed through `lib/authz`.',
                  ctx: 'Blueprint §11.5 specifies deletion behaviour: "soft for 30 days (recoverable from a Trash view), then media is purged from storage and all replicas".',
                  why: 'Soft delete on a memory product is not a nicety. A user who deletes the wrong photograph of a deceased parent has done something irreversible unless the system protects them from it. The 30-day window is also what makes the account-deletion grace period in PHASE-08 coherent.',
                  out: 'Five actions plus a purge job. Deletion is recoverable for 30 days; a memory referenced by a sealed capsule cannot be deleted at all.',
                  fr: [
                    'Create with idempotency by `client_id`.',
                    'Update with field-level validation; contributors may edit only their own (the own-only matrix cell).',
                    'Soft delete setting `deleted_at`; excluded from every list.',
                    'Restore from Trash.',
                    'Purge job hard-deleting rows and media older than 30 days, writing an audit entry.',
                    '**Deletion refused when the memory is referenced by a sealed capsule**, with a message naming the capsule.',
                  ],
                  tr: [
                    'Every action opens with `authorize()`; the own-only cell must be honoured for contributors.',
                    'Purge runs in the workers service and removes storage objects before database rows, so a failure leaves a recoverable row rather than an orphaned object.',
                    'Soft-deleted rows are excluded by the query layer, not by each caller remembering to filter.',
                  ],
                  impl: [
                    'Implement the five actions in `features/memory/actions.ts`, each beginning with an authz call. For update and delete, pass the author id so the own-only cell can be evaluated.',
                    'Implement `queries.ts` with a base query that excludes soft-deleted rows by default and an explicit `includeDeleted` option used only by Trash. Making the safe default the easy default prevents deleted memories reappearing in a list someone forgot to filter.',
                    'Implement the sealed-capsule guard. Since capsules arrive in PHASE-05, define the check as a hook the capsule module registers into, so this module does not read capsule tables directly (ADR-004). Until PHASE-05, the hook has no providers and the guard is inert — document that clearly.',
                    'Implement the `purge-deleted` handler in the workers service: select rows past their 30-day window, delete storage objects, delete rows, write audit entries. Order matters — objects first.',
                    'Register the handler and add it to the daily schedule.',
                    'Write the restore path and make sure a restored memory reappears in the timeline in its correct chronological position, not at the top.',
                  ],
                  files: [
                    'apps/web/src/features/memory/actions.ts',
                    'apps/web/src/features/memory/queries.ts',
                    'apps/web/src/features/memory/delete-guards.ts',
                    'apps/workers/src/handlers/purge-deleted.ts',
                    'apps/workers/src/handlers/index.ts  (register)',
                    'apps/web/src/features/memory/__tests__/crud.test.ts',
                    'apps/workers/src/handlers/__tests__/purge.test.ts',
                  ],
                  api: {
                    method: 'internal', path: 'features/memory/actions.ts',
                    req: '{\n  "clientId": "uuid",\n  "title": "Ella\'s first steps",\n  "occurredAt": "1998-03-14",\n  "occurredPrecision": "day",\n  "note": "She let go of the sofa and just went for it.",\n  "occasion": null,\n  "memberIds": ["uuid"]\n}',
                    res: '{ "ok": true, "data": { "id": "uuid" } }',
                    validation: ['Authz allows create in the target vault', 'Title within length bounds', 'occurredAt consistent with occurredPrecision', 'Note within length bounds'],
                    errors: [
                      ['403', 'AUTHZ_DENIED', 'No create grant in this vault'],
                      ['403', 'AUTHZ_NOT_OWN_RESOURCE', 'Contributor editing another author\'s memory'],
                      ['409', 'MEMORY_SEALED_CAPSULE_REFERENCE', 'Deletion refused — referenced by a sealed capsule'],
                      ['422', 'VALIDATION_FAILED', 'Field-level error'],
                    ],
                  },
                  rules: [
                    'Deletion is soft for 30 days, then irreversible.',
                    'A memory referenced by a sealed capsule cannot be deleted — the promise outranks the deletion.',
                    'Contributors edit and delete only their own memories (the own-only matrix cell).',
                    'Soft-deleted rows are excluded by default at the query layer.',
                    'The purge removes storage objects before database rows.',
                  ],
                  edge: [
                    'Deleting a memory that is a capsule\'s only content — refused; the user must cancel the capsule first, and the message should say so.',
                    'Restoring a memory whose media was already purged — must not restore a broken record; check and explain.',
                    'A purge interrupted midway — storage-first ordering means the row survives and is retried, which is the recoverable direction.',
                    'A memory soft-deleted then the whole account deleted — PHASE-08 purge must handle both windows without double-deleting.',
                    'Concurrent delete and edit from two devices — last write wins with the delete taking precedence; document it.',
                    'A vault owner deleting a contributor\'s memory — allowed by the matrix; make sure the audit entry records who.',
                    'Thirty-day boundary arithmetic across DST — use absolute instants.',
                  ],
                  err: ['A purge failure must leave a retryable state and alert if the same row fails repeatedly, since a stuck purge is a data-retention compliance issue.'],
                  sec: [
                    'Authz on every action, including the own-only evaluation.',
                    'The purge writes an audit entry, because irreversible deletion of user content must be accountable.',
                    'A restore must not resurrect content the user believed gone beyond the window.',
                  ],
                  tests: {
                    unit: ['Create is idempotent by `client_id`.', 'Contributor cannot edit another author\'s memory.'],
                    integration: [
                      'Soft delete removes the memory from all lists but keeps it in Trash.',
                      'Restore returns it to its correct chronological position.',
                      '**Deletion is refused when a sealed capsule references it, with the capsule named.**',
                      'Purge removes storage objects before rows.',
                      'Interrupted purge leaves a retryable row, not an orphaned object.',
                      'Purge writes an audit entry.',
                    ],
                  },
                  ac: [
                    'All five actions implemented and authz-guarded.',
                    'Own-only cell honoured for contributors, proven by test.',
                    'Soft delete, Trash, and restore all work; restore preserves chronology.',
                    'Sealed-capsule guard implemented as a hook and documented as inert until PHASE-05.',
                    'Purge job registered, ordered storage-first, and audited.',
                    'Query layer excludes deleted rows by default.',
                  ],
                  notes: ['The hook pattern for the sealed-capsule guard keeps module boundaries intact (ADR-004). PHASE-05 registers the provider; do not read capsule tables from here.'],
                },
              ],
            },
            {
              id: 'EPIC-03-03-01-02', name: 'Memory Screens',
              objective: 'Build the create sheet, detail viewer, and gallery grid.',
              value: 'These are the screens where the archive is actually used. The create sheet in particular is where the product asks its one irreplaceable question.',
              stories: [['user', 'to record what a moment meant, not just that it happened', 'the memory keeps its meaning after I have forgotten the details']],
              functional: ['Create sheet with media tray, precision date picker, and note', 'Detail viewer with swipe and zoom', 'Gallery grid with multi-select'],
              technical: ['Media surfaces work against placeholders until PHASE-04', 'Virtualised grid with stable heights'],
              ui: ['Per §29.14, §29.15, §29.10, §29.6', 'Zero layout shift in the grid'],
              security: ['Private visibility default'],
              testing: ['Precision picker', 'Zero layout shift', 'Multi-select across scroll', 'axe'],
              ac: ['Three screens complete', 'No layout shift in the grid', 'axe clean'],
              trace: ['§29.6', '§29.10', '§29.14', '§29.15'],
              tasks: [
                {
                  name: 'Build Memory Create Sheet with Precision Date Picker', type: 'frontend', priority: 'critical',
                  deps: ['TASK-040', 'TASK-012'], trace: ['§29.14', '§29.15', '§13.1'],
                  obj: 'Build the create sheet: media tray, title, the "When did this happen?" picker with precision, the "What did this mean?" note, people, occasion, and privacy.',
                  ctx: 'Blueprint §29.14 and §29.15 specify the form. The date field is called out explicitly: **"When did this happen?" — defaults to today, but explicitly asks.**',
                  why: 'Every other photo product timestamps by upload. Asking when it happened, and accepting "sometime in 1974" as a complete answer, is what makes this an archive rather than a camera roll. The note field is the other half: blueprint §13.4 says the user is asked for exactly one thing no machine can supply — what it meant.',
                  out: 'A create sheet that captures a memory with honest dates and real meaning, saving optimistically and dismissible while media uploads continue in the background.',
                  fr: [
                    'Mode tabs for Photo / Video / Voice / Upload — capture arrives in PHASE-04, so Release-1 tabs may be placeholders wired to the file picker.',
                    'Media tray with reorder and remove.',
                    'Title with an optional date-derived default.',
                    '**"When did this happen?"** picker with a precision selector (exact / day / month / year), defaulting to today at day precision.',
                    'EXIF date pre-fill when available (PHASE-04 supplies it; the field must accept it).',
                    '"What did this mean?" note with a character counter.',
                    'People chips and occasion chips.',
                    'Privacy selector defaulting to private.',
                    'Save is optimistic; the sheet can be dismissed while uploads continue.',
                  ],
                  tr: [
                    'Composed from the PHASE-01 primitives so §33 validation timing is inherited.',
                    'Optimistic insert into local state with a pending badge, in a shape PHASE-06 can promote to a full offline outbox.',
                    'Precision selector changes which date components are collected, and the stored value must match the declared precision.',
                    'The note field offers voice dictation where the browser supports it, as a progressive enhancement.',
                  ],
                  impl: [
                    'Build the sheet as an intercepted modal route at `/app/new` so Back and swipe-back behave natively (§29.14).',
                    'Build the precision-aware date control: a segmented precision selector plus the matching input — full date, month and year, or year alone. **When precision is reduced, do not silently retain a hidden day component**; store what is declared.',
                    'Wire the title default from the date, and let the user overwrite it.',
                    'Build the note field with a counter, and add voice dictation behind a capability check.',
                    'Add people and occasion chips, sourced from the member and event modules through their public queries.',
                    'Implement optimistic save: insert locally with a pending state, call the action, reconcile the server id. Structure this so PHASE-06 can replace the local layer with the Dexie outbox without changing the form.',
                    'Make the sheet dismissible mid-upload, with the queue surviving — this is the behaviour §29.14 requires and it is easy to get wrong by tying upload state to the component lifecycle.',
                    'Handle the offline case with the §29.14 copy: "Saved on this device, will upload when you\'re back". Until PHASE-06, this can be a simpler local persistence; note the handoff.',
                  ],
                  files: [
                    'apps/web/src/app/(app)/@modal/(.)new/page.tsx',
                    'apps/web/src/features/memory/components/CreateSheet.tsx',
                    'apps/web/src/features/memory/components/OccurredDateField.tsx',
                    'apps/web/src/features/memory/components/MediaTray.tsx',
                    'apps/web/src/features/memory/components/NoteField.tsx',
                    'apps/web/src/features/memory/hooks/useOptimisticCreate.ts',
                    'apps/web/src/features/memory/__tests__/create-sheet.test.tsx',
                  ],
                  ui: `Per §29.14. Bottom sheet on mobile, centred on desktop.

Order: media tray → title → **when did this happen?** → what did this mean? → people → occasion → privacy → save.

**The date control** is the distinctive part:

${'```'}
When did this happen?
  [ exact | day | month | year ]
  ┌──────────────────────────┐
  │ 14 March 1998            │   ← input matches the chosen precision
  └──────────────────────────┘
${'```'}

Choosing "year" collapses the input to a single year field. The stored value matches what was declared — no hidden day component.

**Note field** — placeholder "What did this mean?", counter, optional dictation. This is the product's one irreplaceable question; give it room.

Save is optimistic. The sheet closes; uploads continue.`,
                  rules: [
                    'The date field asks when it *happened*, never when it was uploaded.',
                    'Reducing precision discards the components it no longer covers.',
                    'Privacy defaults to private (§11.1).',
                    'The sheet is dismissible while uploads continue.',
                  ],
                  edge: [
                    'A user setting year precision then switching back to day — the day component was discarded, so the field must be empty rather than restoring a stale value.',
                    'EXIF date disagreeing with a user-entered date — the user always wins; do not silently overwrite.',
                    'A future date — allowed; the timeline places it after the Now divider.',
                    'An empty note — allowed; the product should not nag, but the placeholder should invite.',
                    'A very long note — counter and graceful growth.',
                    'Dismissing the sheet immediately after save — the optimistic record must persist and the upload must continue.',
                    'Offline save — local persistence with an honest pending state.',
                    'Dictation unsupported — the option is absent, not broken.',
                  ],
                  err: ['A save failure must retain the entered content and offer retry. Losing a written note is the worst possible failure on this screen.'],
                  sec: ['Server-side validation is authoritative.', 'Privacy default is private and cannot be changed by a client default.'],
                  tests: {
                    component: [
                      'Precision selector changes the input and the stored shape.',
                      'Reducing precision discards finer components.',
                      'Title default derives from the date and is overwritable.',
                      'Note counter behaves; dictation option hidden when unsupported.',
                      'Privacy defaults to private.',
                    ],
                    integration: ['Optimistic save reconciles the server id.', 'Dismissing the sheet mid-save does not lose the memory.'],
                    e2e: ['Create a memory dated 1974 at year precision and confirm the timeline shows "1974", not a day.'],
                    a11y: ['axe on the sheet; the precision selector is a labelled radio group; focus enters the sheet and returns on close.'],
                  },
                  ac: [
                    'Sheet implemented per §29.14–29.15 with all five states in both themes.',
                    'Precision picker works for all four precisions and stores what it declares.',
                    'Note field prominent, with counter and optional dictation.',
                    'Privacy defaults to private.',
                    'Sheet dismissible mid-save without losing content.',
                    'Save failure retains entered content.',
                    'axe clean; focus management correct.',
                  ],
                  notes: [
                    'Keep the optimistic-save layer thin and replaceable — PHASE-06 swaps it for the Dexie outbox.',
                    'The note is the product. Do not let it become a small field at the bottom.',
                  ],
                },
                {
                  name: 'Build Memory Detail Viewer and Gallery Grid', type: 'frontend', priority: 'high',
                  deps: ['TASK-040', 'TASK-013'], trace: ['§29.10', '§29.6'],
                  obj: 'Build the full-screen memory detail viewer and the virtualised gallery grid with multi-select.',
                  ctx: 'Blueprint §29.10 specifies the viewer (full-bleed, swipeable, pinch-zoom, note and precision-formatted date, chips, overflow menu, native share) and §29.6 the grid (virtualised, sticky date headers, blurhash placeholders, **stable-height grid with zero layout shift**).',
                  why: 'Zero layout shift is called out explicitly because a memory grid that jumps while thumbnails load feels broken, and on a long archive it makes scrolling unusable. The blurhash-first strategy from §12.3 is what makes it possible, and the PHASE-01 skeleton geometry test is what keeps it honest.',
                  out: 'A viewer where a memory can be experienced properly, and a grid that scrolls a large archive smoothly with no reflow.',
                  fr: [
                    'Viewer: full-bleed media, swipe between assets, pinch-zoom images, video and audio players.',
                    'Title, precision-formatted date, note, people and occasion chips.',
                    'Overflow menu: edit, favourite, add to album, download, seal (hidden until PHASE-05), delete.',
                    'Native Web Share.',
                    'Grid: virtualised, sticky date headers, blurhash placeholders, multi-select with a batch action bar.',
                    'Deleted memory shows a gentle explanatory page, not a raw 404.',
                  ],
                  tr: [
                    'Progressive load: blurhash → thumb → preview → original (§12.3). The note text renders first, before any media.',
                    'Grid uses fixed aspect-ratio cells so heights are known before media loads — this is what delivers zero layout shift.',
                    'Multi-select state survives scrolling in a virtualised list.',
                    'Dates rendered exclusively through the precision formatter.',
                  ],
                  impl: [
                    'Build the viewer at `/app/memory/[id]`. Render the note and date **first**, then media — so a slow connection shows meaning before pixels.',
                    'Implement swipe between assets and pinch-zoom for images. Use the platform gesture where possible rather than reimplementing inertia.',
                    'Wire the overflow menu, hiding the seal action until PHASE-05 via release gating.',
                    'Build the grid with fixed aspect-ratio cells and blurhash placeholders. Verify zero layout shift by measuring CLS with throttled media loading, not just by eye.',
                    'Implement multi-select with a batch bar. Keep selection in a store rather than component state so virtualisation cannot drop it.',
                    'Add sticky date headers using the precision formatter for the header labels.',
                    'Implement the deleted-memory state as a designed page.',
                    'Use signed-URL-tolerant image components: an expired URL falls back rather than showing a broken image (PHASE-04 supplies the URLs).',
                  ],
                  files: [
                    'apps/web/src/app/(app)/memory/[id]/page.tsx',
                    'apps/web/src/app/(app)/gallery/page.tsx',
                    'apps/web/src/features/memory/components/MemoryViewer.tsx',
                    'apps/web/src/features/memory/components/MemoryGrid.tsx',
                    'apps/web/src/features/memory/components/MemoryOverflowMenu.tsx',
                    'apps/web/src/stores/selection.ts',
                    'apps/web/src/features/memory/__tests__/grid.test.tsx',
                  ],
                  ui: `**Viewer** — full-bleed media, minimal chrome that fades, then title, precision-formatted date, and note. Chips below. Overflow top-right.

Note and date render before media, so a slow connection shows the meaning first.

**Grid** — responsive columns, fixed aspect ratio, blurhash placeholder, type badge (🎥 🎙️ 🖼️), lock icon on capsule members. Sticky date headers. Multi-select via long-press or a select mode, with a batch bar.

**Deleted state** — a warm explanatory page ("This memory was deleted"), with a Trash link if within the window.`,
                  rules: [
                    'Zero layout shift in the grid — fixed cell heights, always.',
                    'Dates rendered only through the precision formatter.',
                    'Note and date render before media.',
                    'Unreleased actions are hidden, not disabled.',
                  ],
                  edge: [
                    'A memory with no media (a note-only memory) — must render well; this is a legitimate and valuable case.',
                    'A memory whose media is still transcoding — show a processing state, not a broken player.',
                    'An expired signed URL — fall back to the blurhash rather than a broken image icon.',
                    'A 5,000-item grid — virtualisation must keep scrolling smooth; measure on a mid-range Android.',
                    'Multi-select of 200 items then a batch delete — confirm with a count and handle partial failure.',
                    'Pinch-zoom on a very large image — must not exhaust memory; load the preview rather than the original for zoom until a threshold.',
                    'Swipe between assets where one fails to load — must not block the swipe.',
                    'A year-precision memory in a sticky date header — must render "1998", not "1 January 1998".',
                  ],
                  err: ['A media failure shows an inline retry on that asset only, never replacing the whole memory.'],
                  sec: ['Signed URLs only; never a public object URL (§12.5).', 'Download respects the matrix cell for download rights.'],
                  tests: {
                    component: [
                      '**CLS is zero with throttled media loading** — measured, not assumed.',
                      'Note and date render before media.',
                      'Multi-select survives virtualised scrolling.',
                      'Sticky headers use precision formatting.',
                      'Seal action hidden at Release 1.',
                      'Note-only memory renders correctly.',
                    ],
                    e2e: ['Open a memory, swipe assets, favourite it, and delete it; confirm the deleted state page.'],
                    perf: ['Scroll a 2,000-item grid on a throttled mid-range profile with no dropped frames beyond the agreed budget.'],
                    a11y: ['axe on both screens; the grid is keyboard navigable; media has accessible names.'],
                  },
                  ac: [
                    'Both screens implemented per §29.10 and §29.6, all five states, both themes.',
                    '**Zero layout shift measured in the grid.**',
                    '2,000-item grid scrolls within the performance budget on a mid-range profile.',
                    'Note and date render before media.',
                    'Multi-select survives scrolling.',
                    'Precision formatting used in headers and detail.',
                    'Note-only memories render well.',
                    'axe clean.',
                  ],
                  notes: ['The performance benchmark is an acceptance criterion, not an aspiration. Run it on a throttled profile before marking this done.'],
                },
              ],
            },
          ],
        },
      ],
    },

    /* -------------------- MOD-03-04 Timeline -------------------- */
    {
      id: 'MOD-03-04', name: 'Timeline & Discovery',
      purpose: 'The signature view, plus the retrieval and resurfacing that make an archive alive.',
      priority: 'critical',
      objective: 'Show a user their life in order — including what is still coming — and let them find or rediscover any part of it.',
      business: [
        'The forward-extending timeline is the product\'s identity and, per blueprint §29.12, something no major competitor offers.',
        'On This Day is described in §7.1 as the cheapest strong retention mechanic available, and it needs no AI.',
      ],
      functional: [
        'Virtualised timeline with a Now divider and a future band.',
        'Month/year scrubbing and deep links.',
        'Filters, favourites, and text search.',
        'On This Day resurfacing on Home and via a weekly notification.',
      ],
      ui: ['Per §29.12 timeline, §29.9 search, §29.7 Home cards'],
      backend: ['Cursor-paginated range queries', 'FTS search with grouped results', 'On This Day computation respecting precision'],
      db: ['Uses the memory composite index; no new tables'],
      security: ['Owner and vault scoped'],
      testing: ['Pagination correctness', 'Deep-link restore', 'Precision-aware On This Day', 'Performance benchmark'],
      ac: ['Timeline renders 2,000 items smoothly', 'Future band visible when empty', 'On This Day never matches a year-precision memory to a day'],
      trace: ['§29.7', '§29.9', '§29.12', '§13.2'],
      sprints: [
        {
          id: 'SPR-03-04-01', name: 'Timeline, Search & On This Day',
          objective: 'The signature view and the discovery surfaces.',
          priority: 'critical', deps: ['SPR-03-03-01'], duration: '~5 days',
          goal: 'A user can scroll their whole archive, jump to a year, filter it, search it, and be shown something from a past year without asking.',
          inScope: ['Timeline query and virtualised view', 'Scrubber and deep links', 'Future band with capsule stubs', 'Search screen', 'Filters and favourites', 'On This Day and Home cards'],
          outScope: ['Semantic search (Release 2)', 'Real capsules in the future band (PHASE-05)', 'Auto event grouping (Release 2)'],
          approach: [
            'Build the future band now with a documented stub interface, so PHASE-05 populates an existing surface rather than adding one.',
            'Treat the 2,000-item benchmark as an acceptance criterion measured on a throttled mid-range profile.',
          ],
          archChanges: ['Establishes the cursor-pagination pattern reused by gallery and search'],
          deliverables: ['Timeline', 'Search', 'Filters', 'On This Day', 'Home cards'],
          testing: ['Pagination, deep link, precision, performance, axe'],
          ac: ['Benchmark met', 'Future band present when empty', 'Precision respected in On This Day'],
          dod: ['Future-band stub interface documented for PHASE-05'],
          trace: ['§29.12', '§13.2'],
          epics: [
            {
              id: 'EPIC-03-04-01-01', name: 'Past → Present → Future Timeline',
              objective: 'Build the virtualised timeline with the Now divider and the future band.',
              value: 'Blueprint §29.12: "the sharpest product insight in the repository. A timeline extending *forward* — pending capsules shown alongside past memories — is a genuinely novel primary navigation surface."',
              stories: [['user', 'to see my life laid out including what is still coming', 'the archive feels alive rather than finished']],
              functional: ['Cursor-paginated ranges', 'Sticky scrubber with year jump', 'Now divider', 'Future band', 'Density toggle', 'Filter sheet', 'Deep links'],
              technical: ['Virtualised windowed list with stable heights', 'Buffered adjacent ranges', 'Offline ranges served from cache and marked'],
              ui: ['Per §29.12 including the empty state that shows the future band waiting'],
              security: ['Vault scoped'],
              testing: ['Pagination, deep link, density, performance, axe'],
              ac: ['Benchmark met', 'Empty state shows the future band'],
              trace: ['§29.12'],
              tasks: [
                {
                  name: 'Build Virtualised Timeline with Now Divider and Future Band', type: 'frontend', priority: 'critical',
                  deps: ['TASK-042', 'TASK-013'], trace: ['§29.12', '§9.4'],
                  obj: 'Build the timeline: cursor-paginated ranges, a virtualised list, a sticky scrubber, the Now divider, and the future band with a documented stub for capsules.',
                  ctx: 'Blueprint §29.12 specifies the view in detail, and its empty state is unusual and deliberate: "a stylised empty timeline showing the Now divider and a single prompt — visually communicating that the future band exists and is waiting".',
                  why: 'The future band is the product\'s identity. Building it now, empty, with a documented interface means PHASE-05 fills a surface that already exists and has already been designed — rather than bolting the differentiating feature onto a finished screen. The empty state matters for the same reason: a new user should see that the future exists before they have anything in it.',
                  out: 'A timeline that scrolls a large archive smoothly, jumps to any year, shows a clear Now divider, and renders a future band that is visibly waiting for content.',
                  fr: [
                    'Cursor-paginated query by `occurred_at` within a vault.',
                    'Virtualised windowed list with stable item heights.',
                    'Sticky month/year scrubber with jump-to-year.',
                    'Density toggle: year / month / day.',
                    'A visually distinct Now divider.',
                    '**Future band** rendering scheduled items above the divider, with a stub interface for capsules.',
                    'Filter sheet: media type, favourites, occasion, has-voice-note, in-a-capsule.',
                    'Deep link `?at=YYYY-MM` restoring scroll position.',
                    'Offline: cached ranges served, uncached ranges clearly marked.',
                    'Empty state showing the Now divider and the waiting future band.',
                  ],
                  tr: [
                    'Cursor pagination on `(vault_id, occurred_at)` using the PHASE-03 composite index.',
                    'Prefetch adjacent ranges so scrolling does not stutter at a boundary.',
                    'Stable heights: compute row height from item type before media loads.',
                    'The future-band data source is an interface with one Release-1 implementation (scheduled memories, if any) and a documented second implementation slot for PHASE-05 capsules.',
                  ],
                  impl: [
                    'Implement the range query in `features/timeline/queries.ts` with cursor pagination, scoped through authz.',
                    'Build the virtualised list. Derive row heights from item type and density so the scrollbar is stable and the scrubber maps accurately.',
                    'Build the sticky scrubber with year jump. On a long archive the scrubber is the primary navigation, so it must be accurate rather than approximate.',
                    'Implement the Now divider as a first-class list item, not a decoration, so virtualisation handles it correctly.',
                    '**Define `FutureBandSource` as an interface** in `features/timeline/future-band.ts`, with a comment naming the PHASE-05 task that adds the capsule implementation. Register the Release-1 source (future-dated memories). Do not special-case capsules in the list component.',
                    'Implement the density toggle, recomputing heights per density.',
                    'Implement the filter sheet, sharing filter state with the gallery so switching views keeps the filter.',
                    'Implement `?at=YYYY-MM` deep linking, including restoring position on back navigation.',
                    'Implement the offline behaviour: serve cached ranges, and mark uncached ones explicitly rather than showing an empty stretch.',
                    'Build the empty state per §29.12 — the Now divider with the future band visibly waiting.',
                    'Benchmark: 2,000 items, throttled mid-range profile, measure dropped frames and record the number in §20.',
                  ],
                  archDiagram: `             ┌─────────────────────────┐
   FUTURE    │  sealed capsules  [stub → PHASE-05]
             │  future-dated memories
             ├───── NOW ───────────────┤  ← first-class list item
             │  this month
   PAST      │  earlier months …        │  ← cursor-paginated, virtualised
             └─────────────────────────┘

FutureBandSource (interface)
  ├─ FutureMemoriesSource      (Release 1)
  └─ SealedCapsulesSource      (PHASE-05 registers here)`,
                  files: [
                    'apps/web/src/app/(app)/timeline/page.tsx',
                    'apps/web/src/features/timeline/queries.ts',
                    'apps/web/src/features/timeline/components/Timeline.tsx',
                    'apps/web/src/features/timeline/components/Scrubber.tsx',
                    'apps/web/src/features/timeline/components/NowDivider.tsx',
                    'apps/web/src/features/timeline/future-band.ts',
                    'apps/web/src/features/timeline/components/FilterSheet.tsx',
                    'apps/web/src/features/timeline/__tests__/timeline.test.tsx',
                  ],
                  ui: `Per §29.12.

Sticky scrubber at the top with the current period and a year jump. Rows grouped by month with sticky headers using precision-aware formatting.

**Now divider** — visually distinct, labelled, and unmissable. Above it, the future band; below it, the past.

**Empty state** — the distinctive one. Not "no memories": a stylised timeline with the Now divider drawn and the future band visible and empty, plus one prompt. The user should understand, before adding anything, that this product thinks about the future.

**Offline** — uncached ranges show a marked placeholder, so a gap reads as "not downloaded" rather than "nothing happened".`,
                  rules: [
                    'The Now divider is a list item, not decoration.',
                    'The future band is populated through the source interface; the list component knows nothing about capsules.',
                    'Uncached offline ranges are marked, never silently empty.',
                    'Dates use the precision formatter.',
                  ],
                  edge: [
                    'An archive with a single memory — the timeline must still show the Now divider and the future band.',
                    'A memory dated far in the future — must appear in the future band without breaking the scrubber\'s scale.',
                    'A vault with 20,000 memories — pagination and scrubber accuracy must hold; benchmark.',
                    'A year with thousands of items at day density — the density toggle must remain usable.',
                    'Deep link to a month with no content — land there and show the marked empty range, not a redirect.',
                    'Filter that excludes everything — the filtered-empty state with clear-filters, not the first-run empty state.',
                    'Rapid scrubbing — must not fire a request per frame; debounce and use buffered ranges.',
                    'Back navigation from a memory — must restore the previous scroll position.',
                  ],
                  err: ['A failed range shows a retry for that section only, leaving the rest of the timeline usable.'],
                  sec: ['Vault-scoped through authz; the cursor must not be usable to page into another vault.'],
                  tests: {
                    component: [
                      'Cursor pagination returns correct, non-overlapping ranges.',
                      'Now divider renders in the correct position.',
                      'Future band renders from the source interface, with a mock source.',
                      'Density toggle recomputes heights without scroll jump.',
                      'Filtered-empty differs from first-run empty.',
                      'Deep link restores position; back navigation restores scroll.',
                      'Uncached offline range is marked.',
                    ],
                    perf: ['**2,000 items on a throttled mid-range profile within the frame budget** — record the measurement.'],
                    a11y: ['axe; the list is keyboard navigable; the scrubber is operable by keyboard; the Now divider is announced.'],
                  },
                  ac: [
                    'Timeline implemented per §29.12 with all five states in both themes.',
                    '**Empty state shows the Now divider and the waiting future band.**',
                    'Future band populated via a documented source interface with a PHASE-05 slot.',
                    'Scrubber accurate; deep links and back navigation restore position.',
                    'Density toggle works without scroll jump.',
                    'Offline uncached ranges marked.',
                    '2,000-item benchmark met and recorded in §20.',
                    'axe clean.',
                  ],
                  notes: [
                    'The source-interface pattern is what makes PHASE-05 an addition rather than a rewrite. Do not let capsule knowledge leak into the list component.',
                    'Record the benchmark number. PHASE-09 will regression-test against it.',
                  ],
                },
              ],
            },
            {
              id: 'EPIC-03-04-01-02', name: 'Search, Filters & On This Day',
              objective: 'Build text search, shared filters, favourites, and the On This Day resurfacing that drives return visits.',
              value: 'Blueprint §7.1 rates On This Day as "the cheapest, strongest retention mechanic in the product" — and notes it needs no AI, only dates.',
              stories: [
                ['user', 'to find a memory by typing a word', 'I do not have to scroll years to find one photograph'],
                ['user', 'to be shown something from a past year without asking', 'the archive surprises me instead of waiting'],
              ],
              functional: ['Search across memories, members, events', 'Suggestion chips and recent searches', 'Shared filters', 'Favourites', 'On This Day card and weekly push'],
              technical: ['Postgres FTS with trigram fallback', 'Precision-aware On This Day matching', 'Weekly cap on the notification'],
              ui: ['Per §29.9 search, §29.7 Home cards'],
              security: ['Vault scoped; offline search clearly labelled as local-only'],
              testing: ['FTS ranking, typo tolerance, precision exclusion, weekly cap, axe'],
              ac: ['Search finds by title, note, and person', 'On This Day excludes year-precision memories from day matches', 'Weekly cap enforced'],
              trace: ['§29.9', '§29.7', '§13.2', '§14'],
              tasks: [
                {
                  name: 'Build Search Screen with Full-Text Search and Shared Filters', type: 'fullstack', priority: 'high',
                  deps: ['TASK-039', 'TASK-042'], trace: ['§29.9', '§13.3', 'ADR-010'],
                  obj: 'Build the search screen with grouped results across memories, members, and events, plus the filter sheet shared with timeline and gallery.',
                  ctx: 'Blueprint §29.9 specifies tabs (All / Memories / People / Events / Gifts), fuzzy matching with highlighted terms, recent searches, suggestion chips, and an offline mode that "searches cached content only and says so explicitly".',
                  why: 'Search is the cheap 80% of retrieval (§13.2) and it must land in Release 1 because an archive you cannot search is an archive you stop opening. The offline honesty requirement matters too: silently returning fewer results because you are offline teaches users the product is unreliable.',
                  out: 'A search screen that finds memories by title, note, occasion, and person name, tolerates typos, groups results by type, and states plainly when it is searching only cached content.',
                  fr: [
                    'Query across memories (FTS), members (name), and events (title).',
                    'Tabs: All / Memories / People / Events. Gifts tab hidden until Release 3.',
                    'Highlighted matching terms.',
                    'Recent searches; suggestion chips ("Try: summer 2019, Mum, birthdays").',
                    'Filter sheet shared with timeline and gallery.',
                    'Offline: search cached metadata only, with an explicit chip stating so.',
                    'Empty results state naming the applied filters with a one-tap clear.',
                  ],
                  tr: [
                    'Postgres FTS on the generated tsvector, with `pg_trgm` similarity as a fallback for typos and partial words.',
                    'Ranking: title above note; exact matches above fuzzy.',
                    'Debounced input; cancel in-flight queries on change.',
                    'Filters stored in a shared store so switching between timeline, gallery, and search preserves them.',
                  ],
                  impl: [
                    'Implement the search query combining FTS on memories with trigram matching on member and event names, scoped through authz.',
                    'Rank results: weight title matches above note matches, and exact above fuzzy. Return the matched field so the UI can highlight it.',
                    'Build the screen with tabs and grouped results, hiding the Gifts tab via release gating.',
                    'Implement highlighting from the server-returned match positions rather than re-matching client-side, which would disagree with the ranking.',
                    'Persist recent searches locally and offer the suggestion chips from §29.9.',
                    'Extract the filter sheet into a shared component and a shared store, and wire it into timeline and gallery in the same task so the three genuinely share state.',
                    'Implement offline search over cached Dexie metadata with the explicit "searching your saved memories only" chip (§29.9). Until PHASE-06 provides the cache, implement against whatever local store exists and note the handoff.',
                    'Build the empty-results state naming the applied filters, distinct from the no-content state.',
                  ],
                  files: [
                    'apps/web/src/app/(app)/search/page.tsx',
                    'apps/web/src/features/search/queries.ts',
                    'apps/web/src/features/search/components/SearchScreen.tsx',
                    'apps/web/src/features/search/components/ResultGroup.tsx',
                    'apps/web/src/features/search/components/Highlight.tsx',
                    'apps/web/src/features/search/offline-search.ts',
                    'apps/web/src/stores/filters.ts',
                    'apps/web/src/features/search/__tests__/search.test.ts',
                  ],
                  api: {
                    method: 'internal', path: 'features/search/queries.ts',
                    req: '{ "q": "summer beach", "types": ["memory","member","event"], "filters": { "favourite": true } }',
                    res: '{\n  "memories": [{ "id": "uuid", "title": "…", "matchField": "note", "rank": 0.82 }],\n  "members": [],\n  "events": []\n}',
                    validation: ['Query length bounded', 'Types from the allowed set', 'Authz scopes every result set'],
                    errors: [['422', 'VALIDATION_FAILED', 'Query too long or malformed'], ['403', 'AUTHZ_DENIED', 'No grant on the target vault']],
                  },
                  rules: [
                    'Offline search states plainly that it is local-only (§29.9).',
                    'Empty results name the applied filters and offer a one-tap clear.',
                    'The Gifts tab is hidden, not disabled, until Release 3.',
                    'Highlighting derives from server match data, not client re-matching.',
                  ],
                  edge: [
                    'A single-character query — do not run a full scan; require a minimum length and say so.',
                    'A query matching thousands of memories — paginate; do not render everything.',
                    'A typo one character off — trigram should still find it; test.',
                    'A non-Latin query — behaviour depends on the text-search configuration chosen in TASK-039; test and document the limitation honestly rather than claiming support.',
                    'A query that matches a member name and a memory note — both groups populate; ordering between groups must be stable.',
                    'Offline with an empty cache — the local-only chip plus an empty state, not an error.',
                    'Filters applied then the user switches to timeline — the filter must carry over, which is the point of the shared store.',
                    'Rapid typing — debounce and cancellation must prevent a stale result overwriting a newer one.',
                  ],
                  err: ['A failed search shows a retry within the screen; recent searches and suggestions remain usable.'],
                  sec: ['Every result set is authz-scoped independently — a search must not leak the existence of another vault\'s content through a count or a ranking artefact.'],
                  tests: {
                    unit: ['Ranking places title matches above note matches.', 'Trigram tolerates a one-character typo.', 'Minimum query length enforced.'],
                    integration: ['Results are vault-scoped; another vault\'s content never appears.', 'Filters shared across timeline, gallery, and search.'],
                    component: ['Offline chip appears and copy is correct.', 'Empty results name applied filters and clear works.', 'Stale response does not overwrite a newer one.'],
                    a11y: ['axe; results are a navigable list; highlighted terms do not break screen-reader reading order.'],
                  },
                  ac: [
                    'Search finds by memory title, note, occasion, member name, and event title.',
                    'Typo tolerance works.',
                    'Results grouped in tabs; Gifts hidden.',
                    'Filters genuinely shared across all three surfaces.',
                    'Offline mode states local-only explicitly.',
                    'Empty results distinct from no content.',
                    'Non-Latin behaviour tested and documented honestly.',
                    'axe clean.',
                  ],
                  notes: ['Record the text-search configuration and its non-Latin limitations in §20. Release 2 semantic search will improve this; do not overclaim now.'],
                },
                {
                  name: 'Implement On This Day with Precision-Aware Matching and Home Cards', type: 'fullstack', priority: 'high',
                  deps: ['TASK-039', 'TASK-037'], trace: ['§29.7', '§13.2', '§14', '§7.1'],
                  obj: 'Implement On This Day matching, the Home screen cards (On This Day, Up Next, scheduled deliveries), and the weekly notification job with its once-per-week cap.',
                  ctx: 'Blueprint §7.1 calls On This Day the cheapest strong retention mechanic in the product. Section §14 specifies the notification: "once per week maximum, only when there is genuinely something from a past year; 09:00 local". Section §13.2 requires that precision be respected.',
                  why: 'The precision requirement is the substance here. A memory recorded as "1974" must not be surfaced as "on this day in 1974", because it did not happen on this day — we only know the year. Getting this wrong produces a notification that is subtly false, on a product whose entire value is being trustworthy about the past.',
                  out: 'A Home screen with the §29.7 cards, an On This Day query that respects precision, and a weekly notification capped at one per week and sent at a humane local hour.',
                  fr: [
                    'On This Day matching month and day across prior years, **excluding memories whose precision is coarser than `day`**.',
                    'Home card with a year badge ("3 years ago today").',
                    'Card suppressed when there is nothing genuinely from a past year.',
                    'Home also shows Up Next (nearest occasion) and the scheduled-deliveries strip (stubbed until PHASE-05).',
                    'Weekly job selecting the best day and enqueuing one notification, at 09:00 in the user\'s timezone.',
                    'Hard cap of one On This Day notification per user per week.',
                  ],
                  tr: [
                    'Matching compares month and day, and filters on `occurred_precision IN (\'exact\',\'day\')`.',
                    'The weekly job enqueues; PHASE-07 delivers.',
                    'Cap enforced by recording the last send, so a retry or restart cannot double-send.',
                    'Home cards render from cache first where available, then revalidate (§29.7).',
                  ],
                  impl: [
                    'Implement the On This Day query with the precision filter. Write the exclusion test first — it is the requirement most likely to be lost.',
                    'Build the Home screen per §29.7 in priority order: Up Next hero, scheduled-deliveries strip, memory prompts, recent memories, and the banners.',
                    'Implement the Up Next card from the event module\'s next-occurrence helper, with the two CTAs (Create memory / Set a reminder — the gift CTA is Release 3).',
                    'Stub the scheduled-deliveries strip against the same future-band source interface used by the timeline, so PHASE-05 fills both at once.',
                    'Implement the memory-prompts carousel as the deterministic Release-1 version noted in §29.7 — template-driven, not AI. Reference §15 A10, which upgrades it in Release 2.',
                    'Implement the weekly job: choose the day with the most or most-favourited matches, enqueue one notification, record the send, and respect the user\'s timezone for the 09:00 target.',
                    'Enforce the weekly cap by recording the last send per user and checking it before enqueuing, in the same transaction.',
                    'Implement the Home empty state with the §29.7 copy: "Your memory box is empty — let\'s create your first one", plus the secondary import affordance.',
                  ],
                  files: [
                    'apps/web/src/app/(app)/page.tsx',
                    'apps/web/src/features/discovery/on-this-day.ts',
                    'apps/web/src/features/discovery/components/OnThisDayCard.tsx',
                    'apps/web/src/features/discovery/components/UpNextCard.tsx',
                    'apps/web/src/features/discovery/components/MemoryPrompts.tsx',
                    'apps/workers/src/handlers/on-this-day.ts',
                    'apps/workers/src/handlers/index.ts  (register)',
                    'apps/web/src/features/discovery/__tests__/on-this-day.test.ts',
                  ],
                  ui: `Per §29.7, in priority order: time-aware greeting with bell and search → **Up Next hero** → scheduled deliveries strip → memory prompts → recent memories grid → banners.

**On This Day card** — the memory, a year badge ("3 years ago today"), and a tap into the detail view. Absent entirely when there is nothing true to show; a card saying "nothing from today" is worse than no card.

**Empty state** — §29.7 copy verbatim, plus "Import from your phone".`,
                  rules: [
                    '**A memory with precision coarser than `day` never appears in On This Day** (§13.2).',
                    'The card is suppressed rather than showing an empty variant.',
                    'One On This Day notification per user per week, maximum (§14).',
                    'Delivered at 09:00 in the user\'s timezone, not the server\'s.',
                    'The job enqueues; it does not send.',
                  ],
                  edge: [
                    '**A 1974 year-precision memory on 14 March — must not match.** This is the defining test.',
                    'A month-precision memory — also excluded.',
                    '29 February — decide whether it matches on 28 February or 1 March in non-leap years, consistent with the TASK-036 recurrence rule.',
                    'A user with no memories older than a year — no card, no notification.',
                    'Several matches on the same day — pick one deterministically (favourites first, then most media) so the card does not flicker between renders.',
                    'A user in a timezone where 09:00 has already passed when the job runs — send today or wait for tomorrow; decide and document.',
                    'The job running twice in a week after an outage — the cap must hold.',
                    'A memory soft-deleted between selection and send — must not be surfaced.',
                  ],
                  err: ['A failure computing On This Day must simply omit the card; it must never block the Home screen from rendering.'],
                  sec: ['Vault-scoped.', 'The notification payload must not contain memory content beyond what is needed to deep-link — push payloads are not a safe place for a private note.'],
                  tests: {
                    unit: [
                      '**Year-precision memory excluded from a day-specific match.**',
                      'Month-precision memory excluded.',
                      'Exact and day precision included.',
                      'Deterministic selection among several matches.',
                      '29 February rule consistent with recurrence.',
                    ],
                    integration: [
                      'Weekly cap prevents a second enqueue in the same week, including after a job restart.',
                      '09:00 target respects the user\'s timezone.',
                      'Soft-deleted memory is not surfaced.',
                    ],
                    component: ['Card suppressed when nothing qualifies.', 'Home empty state uses the specified copy.'],
                    a11y: ['axe on Home; cards are reachable and labelled; the year badge is announced.'],
                  },
                  ac: [
                    'On This Day respects precision, proven by the exclusion tests.',
                    'Home screen implemented per §29.7 in priority order, all five states, both themes.',
                    'Up Next card wired to the event module.',
                    'Scheduled-deliveries strip stubbed against the shared future-band interface.',
                    'Weekly job enqueues at most one notification per user per week, proven across a simulated restart.',
                    'Timezone-correct 09:00 target.',
                    'Card suppressed when nothing qualifies.',
                    'Empty-state copy verbatim.',
                    'axe clean.',
                  ],
                  notes: [
                    'The precision exclusion is the whole reason this task is not trivial. Write those tests first.',
                    'Record the 29 February and timezone-late decisions in §20.',
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
