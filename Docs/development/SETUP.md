# Setup — from an empty machine to a running backend

Every step taken to build this project from nothing, in order, with the reasoning
kept short. Follow it top to bottom on a new machine or a server and you get an
identical environment.

**Status:** steps 1–15 complete. The service runs, connects as `mm_app`, and 29 of
38 tables are built and tested. Step 16 is the last schema step.

---

## 0 · Prerequisites

| Tool | Version used | Check |
|---|---|---|
| Node.js | 24.11.1 | `node -v` |
| npm | 11.6.2 | `npm -v` |
| Git | 2.52 | `git --version` |
| Docker | 29.7.2 | `docker --version` |

No PostgreSQL client is needed on the host — it ships inside the container.

> **The project path must not contain `&`.**
> On Windows `cmd.exe` treats `&` as a command separator, so a path like
> `E:\M&M\MandM` breaks every npm script with errors that never mention paths.
> This cost us an afternoon; the project lives at `E:\MandM\MandM` for that reason.

---

## 1 · Repository

```bash
git clone https://github.com/NFCSolutionsIndia/MandM.git
cd MandM
```

Two files shape every commit and are worth reading once:

- **`.gitignore`** — ignores `node_modules`, build output, and **every**
  `.env` file including `.env.example`. Nothing that looks like configuration
  reaches the repository; the template lives in this document instead, and
  `src/config/env.schema.ts` is the authoritative list.
- **`.gitattributes`** — `* text=auto` normalises line endings to LF in the
  repository. Without it a Windows checkout commits CRLF, Linux CI reads LF, and
  every file looks modified to the other machine.

---

## 2 · Backend scaffold

```bash
npx @nestjs/cli@latest new backend --package-manager npm --skip-git --strict
```

| Flag | Why |
|---|---|
| `--package-manager npm` | Otherwise it prompts |
| `--skip-git` | The repository already exists; a nested one causes confusion |
| `--strict` | TypeScript strict mode from the first commit — far cheaper than retrofitting |

Answer the interactive prompts:

- **`@nestjs/observe`?** → **n**. A third-party hosted tracing service. Observability
  is already decided (Sentry · CloudWatch · Checkly, ADR-002), and a vendor that
  receives request payloads is a sub-processor decision, not a wizard default.
- **ESM + Vitest, or CJS + Jest?** → **CJS**. NestJS dependency injection is
  decorator-driven and rests on `reflect-metadata`; CommonJS is the well-trodden
  path and every NestJS resource assumes it. Vitest can be adopted later without
  changing the module system.

---

## 3 · Swap Express for Fastify

NestJS does not implement HTTP itself — it delegates to an adapter. Fastify is
roughly twice as fast and is what ADR records as chosen (section 45).

```bash
cd backend
npm install @nestjs/platform-fastify
npm uninstall @nestjs/platform-express
```

Then rewrite `src/main.ts`:

```ts
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter(),
);
await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
```

Three details that matter:

- The generic `<NestFastifyApplication>` types `app` as a Fastify app; without it
  TypeScript assumes Express.
- **`'0.0.0.0'` is not optional.** Fastify binds to `127.0.0.1` by default, so in
  a container the server starts, logs happily, and is unreachable from outside.
- Installing the package changes nothing on its own — `main.ts` must pass the
  adapter. Forgetting this gives
  `No driver (HTTP) has been selected`, which *compiles cleanly* and fails at boot.

**Do this before writing routes.** Swapping adapters later means auditing every
place that touched a request or response object.

---

## 4 · Configuration and environment validation

```bash
npm install @nestjs/config zod
```

Zod rather than Joi or `class-validator`: section 44 makes Zod schemas the single
source of truth that generates the OpenAPI document and both mobile clients. One
validation library, not two.

Files:

- **`src/config/env.schema.ts`** — the schema plus `validateEnv()`, committed
- **`.env`** — real values, never committed

No `.env.example` in the repository. The copyable template is in
**[Environment reference](#environment-reference)** below, kept beside the
reasoning for each value rather than as a bare list of keys.

Wired in `app.module.ts`:

```ts
ConfigModule.forRoot({
  isGlobal: true,
  validate: validateEnv,
  envFilePath: '.env',
})
```

**Why validate at boot.** `process.env.DATABASE_URL` is `string | undefined`.
Without validation the app starts, reports healthy, serves traffic, and fails the
first time something touches the database — possibly hours later, with an error
that never mentions configuration. Validating at startup turns that into a failed
deploy with the variable named, while the previous version keeps running.

Three choices inside the schema worth repeating:

- `z.coerce.number()` on `PORT` — environment variables are always strings.
- `z.enum([...])` on `NODE_ENV` — catches `prodcution`, which would otherwise
  silently disable every production guard, in production.
- `.refine()` on `DATABASE_URL` — `.url()` alone accepts `https://example.com`.

The error message names the variable and the problem, **never the value**: it
reaches logs and Sentry, and the URL contains a password.

---

## 5 · PostgreSQL in Docker

```bash
# from the repository root
docker compose up -d
docker compose ps        # wait for "healthy", not merely "running"
```

Configuration lives in **`docker-compose.yml`** and
**`docker/postgres/init/01-create-test-database.sql`**.

| Command | Effect |
|---|---|
| `docker compose up -d` | Start in the background |
| `docker compose ps` | Status and health |
| `docker compose logs -f db` | Follow the log |
| `docker compose down` | Stop. **Data survives** |
| `docker compose down -v` | Stop and **delete the data** — full reset |

Decisions encoded in that file:

- **`postgres:17-alpine`, pinned.** Matches the Aurora major version. Never
  `latest` — a silent major upgrade between two machines is a bad debugging day.
- **A named volume (`mm-pgdata`), not a bind mount.** A container's filesystem
  dies with the container. Named rather than a host path because PostgreSQL is
  sensitive to permissions and fsync, and bind mounts on Windows and macOS get
  both wrong.
- **A healthcheck.** PostgreSQL accepts connections a few seconds *after* the
  container reports running; a migration fired into that gap fails confusingly.
- **Two databases.** `mm_dev` from the image, `mm_test` from the init script,
  because tests truncate tables and must never reach development data.
- **Extensions are deliberately not installed here.** `citext` and `pg_trgm` come
  from migration 0000, so the migration pipeline remains the only thing that
  defines the schema. Otherwise a Docker-built database and a migration-built
  database differ — and that only shows up where Docker never runs: production.

The init script runs **once**, when the volume is first created. Editing it later
does nothing until `docker compose down -v`.

Verify:

```bash
docker exec -it mm-postgres psql -U postgres -d mm_dev
\l      # mm_dev and mm_test both present
\dt     # no relations yet
\q
```

### Connecting a GUI

DBeaver, pgAdmin or TablePlus, from the host:

```
Host 127.0.0.1 · Port 5432 · Database mm_dev · User postgres · Password postgres
```

---

## 6 · Running it

```bash
cd backend
npm run start:dev      # watch mode, restarts on save
```

`http://localhost:3000` returns `Hello World!`.

---

## 7 · Drizzle, and the identity domain

```bash
cd backend
npm install drizzle-orm pg
npm install -D drizzle-kit @types/pg
```

`drizzle-kit` is a code generator and never ships to production; `drizzle-orm`
and `pg` are runtime. Drizzle does not talk to PostgreSQL itself — `pg` is the
driver underneath it.

**`drizzle.config.ts`** points at `src/db/schema/index.ts` and writes migrations
to `src/db/migrations`. Two settings are worth knowing:

- `casing: 'snake_case'` — TypeScript fields are camelCase, columns are
  snake_case. Deriving one from the other means the two cannot disagree.
- `strict: true` — ask before anything destructive. Drizzle emits a rename as
  DROP + CREATE unless told otherwise, and on a table of family media that must
  never happen unattended.

Scripts added to `backend/package.json`:

```bash
npm run db:generate   # diff the schema, write a .sql migration
npm run db:migrate    # apply pending migrations
npm run db:studio     # browser GUI over the data
```

> **`db:push` exists and we do not use it.** It mutates a live database to match
> the schema with no migration file — nothing to review, nothing reproducible on
> a server, no record of what was applied. The migration pipeline is the only
> thing that defines this schema.

### The column helpers

`backend/src/db/schema/columns.ts` is the most important file in the schema
layer. Thirty-eight tables import it, so a rule written once there is a rule
nobody has to remember thirty-eight times.

| Helper | The rule it enforces |
|---|---|
| `uuidPk()` | Native `uuid`, application-generated **UUIDv7**. Not `serial` — an incrementing key leaks row counts and lets anyone guess a neighbour's id. Not v4 — random keys land in random index pages; v7 sorts by time, so inserts stay at the right-hand edge |
| `utcTimestamp()` | `timestamptz`, always. A bare `timestamp()` drops the offset, and this product delivers into a recipient's *local* morning decades out |
| `vaultScope()` + `scopeIndex()` | The tenant column and its index together, so a table cannot get one without the other |
| `enumColumn()` + `enumCheck()` | `varchar` + `CHECK`, not a native enum — **a value can never be removed from a PostgreSQL enum type**, but a CHECK can be dropped and re-added in one migration |
| `citext` | Case-insensitive email |
| `opaqueToken()` | Hashed, and never derived from a primary key — ids are time-ordered, so a derived token would be guessable from its neighbour |

Enum values live in `backend/src/shared/enums.ts` and are never retyped
elsewhere, so the database constraint and the TypeScript union cannot drift.

### The identity domain

Four tables: `users`, `sessions`, `passkey_credentials`, `devices`. **There is no
password column anywhere** — authentication is passkeys, with an email one-time
code as the fallback. Sessions are opaque server-side rows rather than JWTs,
because "sign me out of that device now" has to take effect immediately and a JWT
cannot be revoked before it expires.

### Generate, read, apply

```bash
cd backend
npm run db:generate                 # writes src/db/migrations/0000_*.sql
```

**Reading the generated SQL is not optional.** It is how you notice that an
innocent-looking change is really a table rewrite, or that a rename came out as
DROP + CREATE.

Migration `0000` was then **hand-extended** with a conventions prologue, because
drizzle-kit emits table DDL and does not model extensions or trigger functions:

```sql
CREATE EXTENSION IF NOT EXISTS citext;
CREATE OR REPLACE FUNCTION set_updated_at() ...
```

These belong in the migration rather than in `docker/postgres/init/`, so that the
migration pipeline stays the only thing that defines a database. If Docker
installed `citext`, a Docker-built database and a migration-built database would
differ — and that difference surfaces only where Docker never runs: production.

```bash
npm run db:migrate                  # applies pending migrations
```

### Verify

```bash
docker exec -it mm-postgres psql -U postgres -d mm_dev
```

```
\dt     -- devices, passkey_credentials, sessions, users
\d users
\dx     -- citext present, installed by the migration
\di     -- ix_sessions_user_live and ix_users_hard_delete carry WHERE clauses
```

Every temporal column should read `timestamp(3) with time zone`. Then the one
behaviour `\d` cannot show:

```sql
INSERT INTO users (id, email, name)
VALUES (gen_random_uuid(), 'Aarav@Example.com', 'Aarav');

SELECT email FROM users WHERE email = 'aarav@example.com';  -- returns the row

DELETE FROM users;
```

Insert mixed case, query lower case, get the row back. With plain `varchar` you
get nothing — which in production is a user who signed up twice and can find
neither archive.

> **DBeaver caches the object tree.** After every migration press **F5** on the
> schema and clear the tree search box. A stale tree, or a filter left in that
> box, looks exactly like a migration that did not run.

---

## 8 · The tenancy domain

Two tables — `vaults` and `vault_members` — and every later domain hangs off
them. "May this user see this row?" is answered here, on every authenticated
read in the product.

```bash
cd backend
npm run db:generate       # writes src/db/migrations/0001_*.sql
```

Read the generated SQL. drizzle-kit prints a count of **all** tables in the
schema, not the ones it is creating — six listed here, two in the migration. A
`CREATE TABLE "users"` appearing in `0001` would mean the snapshot was lost.

### What the migration must contain

| | Why it matters |
|---|---|
| `CONSTRAINT "pk_vault_members" PRIMARY KEY("vault_id","user_id")` | The composite key *is* the design. "What is this user's role in this vault" runs on every read; with both halves as the leading columns of one unique index it costs a single index descent |
| `ix_vault_members_user … WHERE revoked_at IS NULL` | The reverse direction — "which vaults does this user belong to", the home screen. The primary key leads with `vault_id` and cannot serve it |
| `ux_vault_members_owner … WHERE role = 'owner' AND revoked_at IS NULL` | Exactly one live owner per vault |
| `ON DELETE restrict` on `vaults.owner_id` | Three FK behaviours in one migration, each deliberate: `restrict` here, `cascade` on the membership rows, `set null` on `invited_by` |

### The hand-added trigger

`vaults` is the first table in the schema carrying `updated_at`, so migration
`0001` was **appended** with the trigger that makes `set_updated_at()` — defined
in `0000` — actually fire. drizzle-kit emits table DDL and does not model
triggers, so every future table with an `updated_at` needs its own:

```sql
CREATE TRIGGER trg_vaults_updated_at
  BEFORE UPDATE ON "vaults"
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
```

Without it the column is maintained only by Drizzle's `$onUpdate` hook, so a
backfill or a hand-run `UPDATE` leaves the row claiming it never changed.

```bash
npm run db:migrate
```

### Verify

Four checks, each proving something `\d` cannot show. Run them **one statement
per execution** — two are supposed to fail, and a batch would take the rest down
with them.

```sql
INSERT INTO users (id, email, name) VALUES
  ('01900000-0000-7000-8000-000000000001','owner@example.com','Owner'),
  ('01900000-0000-7000-8000-000000000002','second@example.com','Second');

INSERT INTO vaults (id, owner_id, name) VALUES
  ('01900000-0000-7000-8000-0000000000a1','01900000-0000-7000-8000-000000000001','Family');

INSERT INTO vault_members (vault_id, user_id, role) VALUES
  ('01900000-0000-7000-8000-0000000000a1','01900000-0000-7000-8000-000000000001','owner');
```

| # | Statement | Expected |
|---|---|---|
| 1 | `UPDATE vaults SET name = 'Family Archive';` then `SELECT updated_at > created_at AS trigger_fired FROM vaults;` | `t` |
| 2 | insert a second `owner` row | `23505` duplicate key on `ux_vault_members_owner` |
| 3 | insert the same user as `admin` | succeeds — the index constrains the owner role, not membership |
| 4 | `DELETE FROM users WHERE id = '…0001';` | `23503` violates `vaults_owner_id_users_id_fk` |

```sql
DELETE FROM vaults;   -- cascades to vault_members
DELETE FROM users;
```

**Checks 2 and 4 passing means they fail.** A silent success there is a
constraint that is not doing its job.

> **Check 1 only works across two transactions.** `now()` returns the
> *transaction's* start time, so an insert and an update inside one `BEGIN` block
> produce identical timestamps and the trigger reads as broken. In psql that is
> automatic. In **DBeaver, set the toolbar to Auto-commit** — in Manual Commit
> the whole script is one transaction, and the first expected error aborts
> everything after it.

> DBeaver warns before an `UPDATE` or `DELETE` with no `WHERE`. Here that is the
> intent; on a table of memories it would not be.

### Row-level security is deliberately not here

RLS arrives in step 9, with a non-superuser `mm_app` role. Writing policies now
would achieve nothing: this setup connects as `postgres`, which is both
superuser and table owner, and **PostgreSQL bypasses RLS for both** — the
policies would appear in `\d`, protect nothing, and pass no test.

---

## 9 · Row-level security

No new tables. The first step that changes who the application *is* when it
talks to the database.

Every query the API makes carries `WHERE vault_id = …`. That works until one
handler forgets, and a forgotten `WHERE` in this product is one family reading
another family's memories. RLS moves the check from "every developer remembers"
to "the database refuses".

```bash
cd backend
npm run db:generate       # writes src/db/migrations/0002_*.sql
```

Drizzle contributes six lines and nothing else:

```sql
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;   -- ×6
```

They come from `.enableRLS()` on each table in `src/db/schema`. Declaring it in
the schema rather than only in SQL keeps the drizzle-kit **snapshot** honest: if
the snapshot believed RLS was off while the database had it on, a later
`db:generate` could emit `DISABLE ROW LEVEL SECURITY` and silently open every
table.

A table with RLS enabled and no policy denies **all** rows to a non-owner role.
That is the safe direction, which is why enabling comes first.

### The hand-written half

Migration `0002` was appended with four things drizzle-kit cannot model.

**1 · The `mm_app` role.**

```sql
CREATE ROLE mm_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
```

This is the step that is usually skipped, and skipping it makes everything after
it theatre. **PostgreSQL bypasses RLS for a superuser and for a table's owner.**
`postgres` is both. Policies enforced against it enforce nothing — they appear in
`\d`, deny no row, and pass no test.

`NOLOGIN` is deliberate: a password written into a migration is a password in git
history forever. `LOGIN` and a password are granted per environment.

**2 · The actor.**

```sql
SET LOCAL app.user_id = '<uuid>';
```

`SET LOCAL`, never `SET`. The connection pool hands the same physical connection
to the next request, so a session-level setting would leak one actor's identity
into another request's query — the exact bug RLS exists to prevent.

`app_current_user()` reads it and returns NULL when unset. NULL is not TRUE, so
every policy denies by default.

**3 · `SECURITY DEFINER` helpers.** `app_vault_role()`, `app_is_vault_owner()`,
`app_shares_vault()`.

A policy on `vaults` must ask "is this user a member?", which reads
`vault_members` — whose own policy asks the same question back. That is infinite
recursion, and PostgreSQL says so at query time. `SECURITY DEFINER` runs as the
function owner, which bypasses RLS, cutting the recursion once, in one
reviewable place. Each helper answers a single question about the *current*
actor and cannot be asked about anybody else.

**4 · The pre-authentication path.** `app_resolve_session()`,
`app_resolve_passkey()`.

Authentication must read `sessions` to discover who the actor is — but the
policy on `sessions` needs an actor already set. Rather than relax that policy,
the one query that legitimately runs without an actor gets its own narrow
function: it takes a token hash, returns one uuid, and cannot list anything.

Then fourteen policies. Two worth calling out:

- **`users_insert … WITH CHECK (true)`** — registration happens before an actor
  exists. The one deliberately permissive policy in the file, and safe because
  creating a row reveals nothing; reading one is still governed.
- **no `DELETE` policy on `users`** — so `DELETE` is denied to `mm_app`
  entirely. Account removal is a soft delete plus a purge job under a different
  role, never a stray `DELETE` from a request handler.

```bash
npm run db:migrate
```

### Prove it

A policy nobody has watched *fail* is a policy nobody knows is there. Seed two
unrelated families as `postgres`, then act as `mm_app`:

```sql
BEGIN;
SET LOCAL ROLE mm_app;
SELECT count(*) FROM vaults;                 -- 0: no actor set
ROLLBACK;

BEGIN;
SET LOCAL ROLE mm_app;
SET LOCAL app.user_id = '<aarav-uuid>';
SELECT count(*) FROM vaults;                 -- 1: only Aarav's
INSERT INTO vaults (id, owner_id, name)
VALUES (gen_random_uuid(), '<bina-uuid>', 'not mine');
-- ERROR: new row violates row-level security policy for table "vaults"
ROLLBACK;
```

Expected results, and the middle row is the one people assume without checking:

| Actor | Vaults visible |
|---|---|
| `postgres` (superuser) | **2** — bypasses RLS, which is why it cannot be the app |
| `mm_app`, no actor set | **0** — fails closed |
| `mm_app` as Aarav | **1** |

**Zero rows when the actor is unset is the important one.** A handler that
forgets `SET LOCAL` returns an empty list — a visible bug in testing — rather
than every row in the table.

### A denial is not always an error

The single most important thing to know before writing a handler against these
policies. Measured against `mm_dev`, connected as `mm_app`:

| Attempt | Result |
|---|---|
| `INSERT` a vault owned by someone else | `ERROR: new row violates row-level security policy` |
| `UPDATE` another family's vault | **`UPDATE 0`** — no error |
| `DELETE FROM users` | **`DELETE 0`** — no error |

**`USING` decides which existing rows a statement may touch. `WITH CHECK`
decides whether the resulting row is allowed.** That one distinction explains
every row in the table above, and which of the two rejects you decides whether
you get an error or silence:

| Rejected by | Result |
|---|---|
| `WITH CHECK` — the new row is not allowed | **raises `42501`** |
| `USING` — the existing row is not yours to touch | **0 rows, no error** |

So an `UPDATE` can go either way. Editing your own memory but naming a vault
you have no role in **raises**, because `USING` matched and `WITH CHECK`
refused. Editing somebody else's memory is **silent**, because `USING` filtered
it out before the new row was ever considered.

That is correct PostgreSQL behaviour and it is a trap:

> **Every write handler must treat "0 rows affected" as a refusal**, and answer
> 403 or 404. A handler that returns 200 because the `UPDATE` did not throw will
> cheerfully tell a user their change was saved when the database silently
> discarded it.

Use `RETURNING` on every write and check that a row came back. It is the only
honest signal.

> **Never edit a migration that has been applied.** drizzle-kit records a hash of
> each file; changing one — even a comment — makes it look unapplied, and the
> next `db:migrate` tries to run it again against objects that already exist.
> Corrections go in a new migration.

> Replaying the migrations against `mm_test` is the cheapest way to check a
> hand-written migration before it touches `mm_dev`:
> ```bash
> docker exec -i mm-postgres psql -U postgres -d mm_test -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
> docker exec -i mm-postgres psql -U postgres -d mm_test -v ON_ERROR_STOP=1 -q < src/db/migrations/0002_*.sql
> ```

### Per environment, outside the migration

`mm_app` has no password yet, by design. On a developer machine:

```sql
ALTER ROLE mm_app WITH LOGIN PASSWORD 'mm_app';
```

On a server the password comes from AWS Secrets Manager and the role is granted
`LOGIN` the same way — the migration never learns it.

The application does not use this role yet; `DATABASE_URL` still points at
`postgres` for migrations and tooling. Splitting it into an app credential and a
migration credential lands with the first module that opens a connection, so
that an unused environment variable has no chance to drift.

---

## 10 · The database module, and a working test suite

The step that connects the application to the database it has been generating
migrations for. Also the step where the scaffolded test setup turned out never
to have run, and was replaced.

### Two credentials, not one

```bash
# backend/.env
DATABASE_URL=postgres://mm_app:CHANGEME@127.0.0.1:5432/mm_dev
MIGRATION_DATABASE_URL=postgres://postgres:CHANGEME@127.0.0.1:5432/mm_dev
```

| Variable | Role | Used by |
|---|---|---|
| `DATABASE_URL` | `mm_app` | the running service |
| `MIGRATION_DATABASE_URL` | `postgres`, the table owner | drizzle-kit only |

`MIGRATION_DATABASE_URL` is **optional** in the environment schema. On a server
migrations run as a separate task, and an API container has no business holding
a credential that can `DROP` a table — so a deploy that injects only
`DATABASE_URL` must still boot.

Pointing `DATABASE_URL` at `postgres` would leave every policy from step 9 in
place, enforcing nothing, with no error to say so. `/health/ready` reports the
role for exactly this reason.

### The module

`src/db/db.module.ts` is `@Global` — the database and configuration are the only
two genuinely cross-cutting concerns in this service.

| Pool setting | Why |
|---|---|
| `max` = `DB_POOL_MAX` (10) | What reaches the database is `containers × max`. Ten per process is already 720 across 72 containers, and Aurora has a hard ceiling |
| `statement_timeout` | Enforced by PostgreSQL, so it survives a client that stops listening. Without it one pathological query holds a connection until the caller gives up — under load, that is how a slow query becomes an outage |
| `idle_in_transaction_session_timeout` | An abandoned open transaction holds locks and blocks vacuum indefinitely |
| `application_name` | `pg_stat_activity` otherwise shows a row of indistinguishable `node` |
| `pool.on('error')` | **Not optional.** Node's default for an unhandled `error` event is to crash the process, and a pool emits one for any connection that dies while idle — a failover, a network blip. Without this listener a routine Aurora failover takes the API down |

`onApplicationShutdown` drains the pool, which requires
`app.enableShutdownHooks()` in `main.ts`. ECS sends SIGTERM and waits; without
the hook Nest ignores it and every rolling deploy kills connections
mid-transaction.

### The actor, and why no handler can forget it

Step 9 made the database refuse rows to anyone it cannot identify. Something has
to do the identifying, on every transaction, without being passed by hand
through every service call — because an argument threaded everywhere is an
argument forgotten exactly once.

`src/db/actor-context.ts` uses Node's `AsyncLocalStorage`: a value set at the
edge of a request stays visible to every `await` beneath it and is invisible to
every other request in the process.

> Not a NestJS request-scoped provider: Nest would rebuild the dependency chain
> of every provider touching it, once per request, on the hottest path in the
> service — and buy nothing this does not already give.

`DbService.tx()` then opens a transaction and applies it:

```ts
await tx.execute(sql`SELECT set_config('app.user_id', ${actor ?? ''}, true)`);
```

**`set_config(..., true)` is the parameterised form of `SET LOCAL`, and the only
safe one.** `SET LOCAL app.user_id = $1` is not valid SQL — PostgreSQL's `SET`
takes no bind parameters. The obvious workaround, interpolating the id into the
statement, turns the actor into an injection point on the one value the entire
authorization model rests on. `set_config()` is an ordinary function call, so
the id travels as a parameter and can never be parsed as SQL.

The third argument scopes it to the transaction. A session-level setting would
outlive the request and be inherited by whoever the pool hands that connection
to next.

With no actor the setting is empty, `app_current_user()` returns NULL, and every
policy denies. **Forgetting to authenticate yields an empty list, not the whole
table.**

### Health

```bash
curl http://127.0.0.1:3000/health        # liveness, no dependencies touched
curl http://127.0.0.1:3000/health/ready  # readiness, hits the database
```

```json
{"status":"ok","database":{"connected":true,"role":"mm_app","latencyMs":20.85,"rlsEnforced":true}}
```

`/health` is for "is the process alive"; `/health/ready` is what the load
balancer should ask, because a container whose database is unreachable must stop
receiving traffic rather than serve errors from inside the pool.

If `role` ever reads `postgres`, the service is wide open while reporting itself
perfectly healthy. The startup log carries an ERROR for it too.

### Jest replaced with Vitest

**The scaffolded test setup had never run.** `npm test` failed on a TypeScript
config error, and `npm run test:e2e` failed on
`Must use import to load ES Module`.

The cause is structural, not a bad config line: **every dependency this service
runs on is ESM-only** — NestJS 12, Drizzle, Zod, the Nest CLI. The scaffold
offered "ESM with Vitest" or "CJS with Jest"; CJS was chosen, and CommonJS Jest
cannot load an ESM-only framework.

So:

```bash
npm uninstall jest ts-jest @types/jest ts-node
npm install -D vitest @vitest/coverage-v8 unplugin-swc @swc/core
```

- **`unplugin-swc`, not Vitest's default esbuild.** esbuild does not implement
  `emitDecoratorMetadata`, and NestJS resolves `constructor(private db: DbService)`
  by reading exactly that metadata. Without SWC, dependency injection fails in
  tests only, with "Nest can't resolve dependencies".
- Two configs: `vitest.config.ts` (unit, no Docker needed) and
  `vitest.config.e2e.ts` (integration, real PostgreSQL, `fileParallelism: false`
  because the suites share one database).

```bash
npm test          # unit
npm run test:e2e  # integration — needs Docker up
npm run typecheck # tsc --noEmit over src and test
npm run lint
```

### The project is now ESM

`package.json` gained `"type": "module"`, which makes TypeScript emit real ESM —
and **Node ESM requires file extensions on relative imports**:

```ts
import { DbService } from './db.service.js';      // .js, even from a .ts file
import * as schema from './schema/index.js';      // directories need /index.js
```

`.js` and not `.ts` because the extension names the file that will exist *after*
compilation. Every new file must follow this; the build fails loudly if it does
not, which is the right failure.

`start:prod` is `node dist/main.js` — extensionless `node dist/main` does not
resolve under ESM.

### The integration suite

`test/rls.e2e-spec.ts` proves through the application's own code path what step 9
proved in psql. Both halves can be right while the join between them is wrong: a
pool that quietly connects as the owner passes every psql check and leaks every
row.

It runs against **`mm_test`**, applies the real migrations rather than a
hand-built fixture schema, and refuses to start unless both URLs name `mm_test`
— it deletes every row.

```bash
# backend/.env
TEST_DATABASE_URL=postgres://mm_app:CHANGEME@127.0.0.1:5432/mm_test
TEST_MIGRATION_DATABASE_URL=postgres://postgres:CHANGEME@127.0.0.1:5432/mm_test
```

What it asserts:

| | |
|---|---|
| connects as `mm_app`, not a superuser | otherwise every other assertion passes for the wrong reason |
| no actor → **0 rows** | fails closed |
| as Aarav → **1 row**, his own vault | |
| asking for another family's vault *by id* → 0 rows | not merely filtered from a list |
| creating a vault owned by somebody else | rejected, SQLSTATE **42501** |
| updating another family's vault | **0 rows, no error** — the documented trap |
| after a transaction, the actor is gone | the next caller of that pooled connection must not inherit it |

> The rejection is asserted on **SQLSTATE `42501`**, not on message text. Drizzle
> wraps driver errors — its own message is only `Failed query: …` and the
> PostgreSQL error sits in `cause`. Error strings get reworded between releases;
> the code is part of the protocol.

---

## 11 · The people domain

`members` · `events` · `event_members` · `event_reminders`

```bash
cd backend
npm run db:generate       # writes src/db/migrations/0003_*.sql
npm run db:migrate
```

### Owner-scoped, not vault-scoped

The first domain that is **not** reached through a vault, and the reason is a
privacy one rather than a technical one.

A member is a record *about* a real person — a grandmother, a child, a friend —
written by somebody else. That person never consented to being in this database.
So a member row is private to the one account that wrote it: never discoverable,
never searchable, never joinable across accounts.

> A shared vault lets several people contribute memories to it. It does not let
> them read each other's address books. Two users in the *same* vault still
> cannot see each other's members, which is a different boundary from the one
> `vault_members` enforces — and therefore has its own test.

Policies key on `owner_id`, exactly as `sessions` and `devices` do.

### Recurrence is a rule, not rows

A yearly birthday is **one row**, not fifty. `events.recurrence` plus
`event_date` is enough to compute any occurrence, and
`event_reminders.last_fired_for_year` — a single integer — is what stops a
reminder firing twice.

Materialising occurrences would mean choosing how far ahead to generate, writing
a backfill job for when that horizon arrives, and rewriting every generated row
each time somebody corrects a date by one day.

### `date` and `timestamptz` are both right, for different questions

Everything so far has been `timestamptz`, under a rule with no exceptions.
Birthdays are the exception, and it is not a weakening of the rule:

| Question | Type |
|---|---|
| "When did this happen?" | `timestamptz` — an instant |
| "Whose birthday is this?" | `date` — a day on a calendar |

A birthday is the 14th of March everywhere on earth. Stored as an instant it
shifts to the 13th for anyone west of the writer — so the app wishes half its
users a happy birthday a day early, every year. `calendarDate()` in
`columns.ts` carries that reasoning next to the code.

`birthday_precision` exists for the same reason `occurred_precision` does:
"March 1962" is a real answer for a grandparent, and the alternative is
inventing a day nobody can verify and then celebrating it.

### Two columns worth explaining

**`relationship` is deliberately not an enum.** It is the only such column in
the schema. Family structures do not fit a fixed list, and a user who cannot
describe a relationship correctly will put the truth in the name field instead,
which is worse than an unconstrained string.

**`merged_into_id` points the loser at the winner**, rather than deleting it.
"Mum" and "Amma" turn out to be one person; memories, events and capsules
already reference the old id and must keep resolving. A CHECK stops a row
merging into itself, which would make resolution loop forever.

### `channels` is an array, not a comma-separated string

```sql
"channels" text[] DEFAULT ARRAY['push']::text[] NOT NULL
CONSTRAINT ck_event_reminders_channels CHECK ("channels" <@ ARRAY['push', 'email']::text[])
```

A CSV column cannot be constrained or queried: the database could not tell
`push,email` from `push,emial`, and finding every email reminder would be a
`LIKE` scan. `<@` is "is contained by", so the constraint reads *every element
must be a real channel* — and it passes for an empty array, which is a genuine
choice meaning in-app only.

### Migration 0003, hand-extended

- `set_updated_at` triggers for `members` and `events`
- `app_owns_event()` and `app_owns_member()` — `SECURITY DEFINER`, for the same
  recursion reason as the tenancy helpers in `0002`
- four policies

`event_members` checks **both sides** on write: the event must be yours *and*
the member must be yours. A member id is unguessable in practice, but "they
could not have known the id" is not an access control.

### UUIDv7 generation, which was missing

`uuidPk()` declared application-generated ids and nothing generated them. Every
test to this point had supplied ids by hand, so the gap only appeared the first
time a row was inserted the way the application will insert one:

```
null value in column "id" of relation "members" violates not-null constraint
```

```bash
npm install uuid
```

```ts
.$defaultFn(() => uuidv7())
```

`$defaultFn`, not a database `DEFAULT` — the value is generated in this process
*before* the INSERT is sent, which is what lets a mobile app mint an id offline
and send it with the row. A memory captured on a plane already has its final
identity, so the retry when the connection returns is idempotent rather than a
duplicate. It emits no DDL, so it changed no migration.

### Verify

```bash
npm run test:e2e        # 19 tests across three suites
```

`test/people.e2e-spec.ts` asserts, among others:

| | |
|---|---|
| each owner sees only their own members | the boundary this domain exists for |
| another owner's member, asked for **by id** | 0 rows — holding an id is not access |
| creating a member owned by somebody else | `42501` |
| linking another owner's member to your event | `42501` |
| a birthday round-trips as `1948-03-14` | no timezone drift |
| `channels => ARRAY['pigeon']` | `23514` — a CSV column would have accepted it |
| a second reminder at the same offset | `23505` |
| merging a member into itself | `23514` |
| `updated_at` after a **raw SQL** update | the trigger, not the ORM hook |

> **Never replay migrations with `psql` against a database the test suite owns.**
> Doing so creates the tables without recording them in drizzle's
> `__drizzle_migrations` ledger, so the next `migrate()` tries to create them
> again and fails with `relation already exists`. To reset:
> ```bash
> docker exec mm-postgres psql -U postgres -d mm_test -c \
>   "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;"
> ```

### Deferred to the archive domain

`memory_members` — who appears in a memory — belongs to this domain by meaning
but references `memories`, which does not exist yet. It lands in step 12 rather
than splitting migration 0003 across two tables that cannot both apply.

`members.avatar_media_id` has no foreign key yet, for the same reason.

---

## 12 · The archive domain

`memories` · `media_assets` · `upload_sessions` · `albums` · `album_memories` ·
`memory_members`

The largest domain, and the first that is genuinely **vault-scoped** — so
`vaultScope()` is finally used for what it was written for, and the role
hierarchy from `vault_members` starts doing work.

```bash
cd backend
npm run db:generate       # writes src/db/migrations/0004_*.sql
npm run db:migrate
```

### Three columns decide whether this is an archive or an upload folder

| Column | Why it is the product |
|---|---|
| `occurred_at` | **When it happened, never the upload time.** A scanned 1974 wedding photograph belongs in 1974, not on the Tuesday somebody digitised it. The timeline orders by this |
| `occurred_precision` | That photograph has a *year*. Without this, an imported archive either invents a timestamp it cannot justify or collapses every old photograph onto the upload date |
| `note` | The meaning, not the file. Consumer photo storage solved storage and left this unsolved — forty thousand images with no record of why any mattered |

### `vault_id` on `media_assets` is denormalised on purpose

It is reachable through `memory_id`, and stored again anyway. Two reasons:

1. The post-query scope guard checks `vault_id` on **every returned row of
   every result set**. Making that a join puts a join in the hot path of a
   security control.
2. The RLS policy on `media_assets` resolves by reading one column of its own
   row — no function call, no second table.

The consistency risk is bounded: a media asset never moves vault. And because
the policy trusts that column, the column has to be *checked* rather than
trusted on write — a test asserts that forging it in the payload is refused.

### Offline idempotency

```sql
CREATE UNIQUE INDEX ux_memories_client ON memories (author_id, client_id);
```

The apps write locally and sync later. When a create fails ambiguously —
request sent, response lost — the outbox retries. This index turns that retry
into a detectable conflict instead of a second copy of the same moment.

Scoped to the author rather than globally unique, because a client id is
generated on a device and no device can be trusted not to collide with another.

### No DELETE policy on `memories` or `media_assets`

Deliberate, and the strongest control in the schema so far.

Deletion is a **soft delete** — an `UPDATE` of `deleted_at`, thirty days of
Trash. The purge job that eventually issues a real `DELETE` runs under a
different role with its own credential. **A request handler cannot destroy a
family's archive even if it tries**, which a test proves by trying.

`albums` *does* have a DELETE policy, because an album holds no media of its
own — deleting one destroys nothing irreplaceable.

### Search, hand-written in the migration

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX ft_memories_search ON memories
  USING GIN (to_tsvector('simple', coalesce(search_text, '')));

CREATE INDEX ix_memories_search_trgm ON memories
  USING GIN (search_text gin_trgm_ops);
```

Two indexes answering different questions: the tsvector index handles words and
stems, the trigram index handles the half-remembered and the misspelt — which
is most of how anyone searches a family archive.

`'simple'` rather than `'english'`: this archive is India-first and
multilingual, and English stemming on a Marathi or Hindi phrase is worse than no
stemming at all.

`search_text` is maintained by the application and **cannot** be a generated
column — the people tagged in a memory live in another table, and PostgreSQL
cannot reach across one from a generated expression.

### PostgreSQL has no unsigned integers

The older design notes say `BIGINT UNSIGNED`, which is MySQL. Here it is a
`bigint` plus a CHECK:

```sql
CONSTRAINT ck_media_bytes CHECK (bytes >= 0)
```

Same guarantee, stated explicitly. A negative byte count is worth catching at
the boundary rather than in a billing total.

> The same notes claim partial indexes are unavailable and keep `deleted_at`
> out of the index key. That is also MySQL. PostgreSQL has
> `WHERE deleted_at IS NULL`, and the timeline index uses it — smaller, and it
> contains only live rows.

### The deferred foreign keys, now resolved

Three columns had been declared without their constraint because
`media_assets` did not exist:

| | |
|---|---|
| `users.avatar_media_id` | → `media_assets`, `ON DELETE set null` |
| `members.avatar_media_id` | → `media_assets`, `ON DELETE set null` |
| `vaults.cover_media_id` | → `media_assets`, `ON DELETE set null` |

`set null` throughout: removing the photograph that happened to be a cover must
never be a way to delete a vault, a user or a member.

### `memory_members` spans two ownership models

The only policy in the schema that does. A memory belongs to a **vault**; a
member belongs to **one user**. So tagging requires both — permission to write
the memory, *and* ownership of the person.

A contributor to a shared family vault may tag their own people in it and never
somebody else's, which is what stops a shared vault from becoming a way to
enumerate another family's address book.

### Verify

```bash
npm run test:e2e        # 33 tests across four suites
```

`test/archive.e2e-spec.ts` uses three people and two vaults. The interesting one
is **Vikram, a *viewer* of Aarav's vault** — every earlier test proved an
outsider sees nothing; these prove an *insider with the wrong role* cannot
write:

| | |
|---|---|
| a viewer reads | 1 row |
| a viewer writes | `42501` — membership is not permission |
| attributing a memory to somebody else | `42501` |
| moving a memory to a vault you do not belong to | `42501`, and the row is unchanged |
| the same `client_id` twice | `23505` — the offline retry |
| `DELETE` on a memory | **0 rows**, and the row is still there |
| soft delete, then restore | drops out of the timeline, comes back |
| forging `vault_id` on a media asset | `42501` |
| `bytes: -1` | `23514` |
| an album ending before it starts | `23514` |
| tagging another user's member | `42501` |
| a confidence score on a *manual* tag | `23514` — a person's statement is not a probability |
| a 1974 memory | still reads 1974, with precision `year` |

---

## 13 · The promises domain

`capsules` · `capsule_memories` · `capsule_recipients` · `delivery_attempts` ·
`capsule_replies` · `scheduled_jobs`

Everything up to here is storage. This is the part that has to still work in
2046.

```bash
cd backend
npm run db:generate       # writes src/db/migrations/0005_*.sql
npm run db:migrate
```

### Three constraints, three specific harms

| Constraint | The harm it prevents |
|---|---|
| `ux_attempt_idempotent (capsule_id, recipient_id, channel, attempt_no)` | A worker that crashes *after* sending but before recording retries — and hits this key instead of sending again. For a message from a deceased parent, a duplicate is its own kind of harm |
| `unlock_timezone` | An instant alone cannot express "her birthday morning". Without it, a message scheduled from London for a daughter in Pune arrives at 03:00 |
| `token_version` | A leaked unlock link is rotated by incrementing an integer. Deleting the recipient row instead would lose the delivery history and the promise with it |

### Sealed means sealed — enforced by a trigger, not by convention

The design notes say this rule is enforced in the application. **It is enforced
in the database instead**, because "the application remembers" is the kind of
guarantee that survives exactly until the second code path is written.

`capsule_freeze()` compares the columns that *constitute the promise* —
`title`, `sender_note`, `unlock_kind`, `unlock_at`, `unlock_timezone`,
`vault_id`, `owner_id` — and raises if any changed after sealing. It
deliberately ignores `state`, `delivered_at` and `first_opened_at`: the promise
is frozen, the machinery of keeping it is not. A freeze that blocked state
transitions would stop the capsule being delivered at all.

`capsule_contents_freeze()` does the same for `capsule_memories`, because
removing a memory changes the message as surely as editing the note.

Both honour `editable_until` — a grace window in which the sender may still
change their mind. After it passes, **nothing** can edit the promise: not the
owner, not a vault admin, not a stray `UPDATE` in psql.

### The recipient with no account

A capsule is opened by somebody who may never sign up, so the unlock path has
no actor and cannot be governed by a policy. It gets two narrow
`SECURITY DEFINER` functions instead:

| | |
|---|---|
| `app_resolve_recipient(token_hash)` | Returns the capsule a token opens — and **nothing at all** unless the capsule is already `delivered`, so holding a link early is worth zero |
| `app_post_reply(token_hash, body, media)` | Writes the reply *and* marks the capsule opened, in one call, so a reply cannot exist against a capsule nobody is recorded as having read. Returns only the new reply's id |

Both take the **hash** of the token. The raw token lives only in the link that
was emailed.

### The job table is nearly invisible to the API

`scheduled_jobs` has RLS enabled and exactly **one** policy:

```sql
CREATE POLICY jobs_insert_delivery ON scheduled_jobs FOR INSERT
  WITH CHECK (kind = 'capsule_delivery' AND state = 'pending');
```

Insert-only, and only that one kind. The API cannot read the table, cannot move
a `run_at`, and cannot cancel a delivery — so a compromised request handler
cannot enumerate who is expecting a capsule or quietly stop one arriving. The
worker that claims jobs will run under its own role.

The single permitted insert is what makes **"seal the capsule and schedule its
delivery in one transaction"** possible. A promise and its alarm clock are
written together, or neither is.

`ix_jobs_claim` is partial — `WHERE state = 'pending'` — so the hottest loop in
the product reads an index over the few hundred jobs currently due rather than
every job ever scheduled.

### Only the owner may withdraw a promise

`capsules_update` keys on `owner_id = app_current_user()`, not on the vault
role. **A vault admin can read a capsule and cannot cancel it.** A promise
belongs to the person who made it.

There is no DELETE policy at all: a capsule is cancelled, never erased. The
record that a promise was made and withdrawn is part of what was promised.

### A shared test harness, because the old approach broke

Each suite used to hand-write its own list of `DELETE`s in foreign-key order.
That works until a new domain references a table an older suite deletes from —
and then three suites that test nothing to do with the new domain fail in
their *setup*. It happened the moment `capsule_memories` began referencing
`memories`.

`test/support/database.ts` now provides `connect()`, `resetDatabase()` and
`disconnect()`. The reset discovers the tables from `pg_tables` and issues one
`TRUNCATE ... CASCADE`, so PostgreSQL resolves the order itself — a suite
written today keeps working when a domain arrives next month. It is also much
faster, because `TRUNCATE` does not walk the rows.

### Verify

```bash
npm run test:e2e        # 53 tests across five suites
```

| | |
|---|---|
| an unlock time 18 years out | round-trips to the millisecond — the 2038 problem, asserted rather than assumed |
| a `datetime` capsule with no unlock time | `23514` — it would never fire |
| a `milestone` capsule with no member | `23514` |
| a recipient with no email, phone or member | `23514` — nobody to reach |
| a vault **admin** cancelling a capsule | **0 rows** — reads it, cannot withdraw it |
| editing the note after sealing | raises, message contains `sealed` |
| moving the unlock date after sealing | raises |
| removing a carried memory after sealing | raises |
| advancing `state` after sealing | **succeeds** — bookkeeping is not frozen |
| the same `(capsule, recipient, channel, attempt)` twice | `23505` — cannot double-send |
| the owner forging a delivery attempt | `42501` — may show status, may not invent it |
| reading `scheduled_jobs` | 0 rows, while the owner connection sees the row |
| scheduling a `retention_purge` job | `42501` |
| resolving a token *before* delivery | nothing |
| resolving it after, and replying with no account | works, and marks the capsule `opened` |
| a reply from a token that opens nothing | `42501` |
| the sender reading the reply | 1 row; a stranger sees 0 |

> **Deleting a memory a sealed capsule carries is stopped twice, at different
> layers.** Through `mm_app`, RLS gets there first — there is no DELETE policy
> on `memories`, so the statement matches nothing and the foreign key is never
> consulted. As the owner, which is how the purge job will connect, the
> `ON DELETE restrict` is what holds. Both are tested, because they fail
> differently and only one of them is visible from the API.

---

## 14 · The sharing domain

`shares` · `notifications` · `notification_preferences`

```bash
cd backend
npm run db:generate       # writes src/db/migrations/0006_*.sql
npm run db:migrate
```

Three small tables, two of which exist to close a hole rather than add a
feature.

### A polymorphic reference is a security hole, not an inconvenience

`shares(resource_type, resource_id)` points at **either** `memories` or
`albums`. PostgreSQL cannot express a foreign key to one of two tables, so
there is none — and the consequence is worse than a dangling row:

> The RLS policy on `shares` compares `vault_id`. **`vault_id` is whatever the
> client sent.** A share naming the sender's own `vault_id` together with
> another family's `resource_id` passes the policy, and then resolves to a
> memory the sender cannot otherwise read.

`share_resource_check()` closes it: a `BEFORE INSERT OR UPDATE` trigger that
verifies the resource exists **and belongs to the vault the row claims**. It is
`SECURITY DEFINER`, because RLS on `memories` would otherwise hide exactly the
rows it needs to catch.

A test asserts the forged share is rejected with `23503`. Without the trigger
it would have been accepted.

### `suppressible` is a generated column

Whether a notification may be switched off is a property of its **type**, not of
a user's preference. As an ordinary column, a row could claim a security alert
is optional — and the code that wrote that row would be the only thing between
a user and a silent breach notification.

```sql
"suppressible" boolean GENERATED ALWAYS AS
  ("type" NOT IN ('capsule_failed','security_alert','billing')) STORED NOT NULL
```

It cannot be written at all — an attempt returns `428C9` — so no row can ever
be wrong. A second constraint stops the channels being turned off underneath it:

```sql
CHECK (suppressible OR (push_enabled AND email_enabled))
```

Note which type is non-suppressible and which is not: a delivery **failure** is
locked, a delivery **confirmation** is not. Somebody whose capsule did not
arrive must find out while they can still do something about it.

### Quiet hours are `time`, not `timestamptz`

"Do not wake me between 22:00 and 07:00" is a wall-clock rule, interpreted in
the user's own `timezone`. An instant would mean something different every time
they flew. Both bounds are set or neither is — one alone describes no window,
and the job would have to guess.

### Revocation, and why the row survives it

Revoking a share sets `revoked_at`; the next request fails. Because signed
media URLs live five minutes, real-world exposure after revocation is **bounded
to minutes** — which is precisely why that TTL is never raised for convenience.

There is **no DELETE policy** on `shares`. A revoked link stays in the owner's
list with its view count intact, because deleting the row would erase the
evidence that an exposure happened. Control over a link is only meaningful if
it is verifiable.

A vault **admin** may revoke somebody else's share — unlike a capsule, which
only its own owner may cancel. A share is not a promise to a third party; it is
an open door, and whoever is responsible for the vault must be able to close it.

### Notifications are written *to* the user, never *by* them

`notifications` has a SELECT policy and an UPDATE policy — the update exists
only so a user can mark something read. **There is no INSERT policy.** Jobs
create notifications under their own role, so a request handler cannot invent
one and the product cannot be made to tell a user something it never decided.

### Verify

```bash
npm run test:e2e        # 70 tests across six suites
```

| | |
|---|---|
| a share naming another family's memory | `23503` — the trigger, where RLS alone would have passed it |
| a share naming a resource that does not exist | `23503` |
| resolving a live link with no account | 1 row |
| recording a view | `view_count` becomes 1 |
| resolving it after revocation | 0 rows, immediately |
| the revoked link in the owner's list | still there, count intact |
| a vault admin revoking another's link | succeeds |
| a stranger listing links | 0 rows |
| a request handler inserting a notification | `42501` |
| writing to `suppressible` | `428C9` — a generated column |
| switching off `security_alert` | `23514` |
| switching off `capsule_delivered` | succeeds |
| half a quiet-hours window | `23514` |

---

## 15 · The billing domain

`subscriptions` · `subscription_channels` · `subscription_ai_features` ·
`payments`

```bash
cd backend
npm run db:generate       # writes src/db/migrations/0007_*.sql
npm run db:migrate
```

### Commitment 05, as a shape rather than a sentence

> **A promise is never cancelled for non-payment.** If a subscription lapses
> while capsules are scheduled beyond the free horizon, those capsules are
> still delivered.

Three things make that true, and none of them is a rule somebody has to
remember:

1. **Entitlements are columns on the subscription row**, not a lookup against a
   price book. A lapsed row still says what was granted when the promises were
   made.
2. They are evaluated **once, at seal time**, and never re-applied.
3. **Nothing in the delivery path reads this domain at all.** A worker
   delivering a capsule in 2046 has no reason to ask whether anybody is still
   paying, and no code path by which to do so.

The one function that exists is named for its direction:

```sql
app_sealing_entitlement(user) → (max_pending_capsules, max_capsule_horizon_days, pending_now)
```

There is **deliberately no** function asking whether an already-sealed capsule
is still entitled, because such a function is exactly the thing that would
eventually get called inside the delivery worker — and then a lapsed card would
cancel a message from somebody's dead father. A test asserts that
`app_sealing_entitlement` is the only `app_*entitle*` function in the database.

### The whole domain is read-only to the API

There is no INSERT, UPDATE or DELETE policy on any of these four tables. Money
state is owned by the gateway; these rows are a record of what Stripe and
Razorpay told us, written by the webhook handler under its own role.

A request handler that could write them could grant itself a plan — and an
entitlement the user did not pay for is the same bug as a charge they did not
make, only quieter.

### `(gateway, gateway_ref)` is what makes webhook replay harmless

Payment providers deliver at least once and resend after any ambiguous
response. Without this unique key, one retried notification is a second row, a
double-counted payment, and a support ticket about a charge that never
happened.

The key is the **pair**, not `gateway_ref` alone: Stripe and Razorpay have
independent id spaces and will eventually produce the same string.

### Money is `bigint` in minor units

Paise and cents, never a float. Money in floating point is how totals end up a
paisa out with nobody able to say which row is wrong. `bigint` rather than
`integer` because a JavaScript number loses precision above 2^53 and these get
summed for reporting.

A refund is **its own row with a negative amount**, so the ledger stays
append-only and the history reads in order. `CHECK (abs(fee) <= abs(amount))`
allows the negative fee that comes with it while still rejecting a fee larger
than the payment it was taken from.

### NULL means unlimited

`max_pending_capsules` and `max_capsule_horizon_days` are NULL for an unlimited
plan — not `-1`, not `999999`. A sentinel is a number somebody eventually
compares against, and then "unlimited" quietly becomes a limit.

### What is deliberately absent

There is **no `memories_per_month` column.** That limit does not exist, and a
column for it would eventually invite somebody to enforce one. A family archive
that stops accepting memories is not an archive.

The paid gate is `max_capsule_horizon_days` — *how far ahead* you may promise,
not *how much* you may keep. It is the one limit that does not interfere with
the loop: it costs nothing until somebody wants the thing the product is
actually for.

### Verify

```bash
npm run test:e2e        # 86 tests across seven suites
```

| | |
|---|---|
| a user reading their own subscription | 1 row; a stranger sees 0 |
| the API granting itself a plan | `42501` |
| a user upgrading themselves | **0 rows**, plan unchanged |
| a replayed webhook | `23505` |
| the same event id on the *other* gateway | accepted |
| a fee larger than its payment | `23514` |
| a refund as a negative row | accepted |
| a user rewriting a receipt | **0 rows** |
| **a sealed capsule after the subscription expires** | **untouched** — still `sealed`, same unlock time, not cancelled |
| the lapsed row's entitlements | still recorded |
| `app_*entitle*` functions in the database | exactly one, and it is the sealing direction |
| a subscription with zero seats | `23514` |

---

## Environment reference

`backend/.env`, which is **not** in the repository. Copy this, then replace
every password.

```bash
NODE_ENV=development
PORT=3000

# The application role. Row-level security is enforced against this one.
DATABASE_URL=postgres://mm_app:CHANGEME@127.0.0.1:5432/mm_dev

# The table owner. Used only by drizzle-kit for generate/migrate.
MIGRATION_DATABASE_URL=postgres://postgres:CHANGEME@127.0.0.1:5432/mm_dev

DB_POOL_MAX=10
DB_STATEMENT_TIMEOUT_MS=5000
DB_IDLE_TX_TIMEOUT_MS=10000

# The integration suite. It deletes every row, so it refuses to run against
# anything whose name is not mm_test.
TEST_DATABASE_URL=postgres://mm_app:CHANGEME@127.0.0.1:5432/mm_test
TEST_MIGRATION_DATABASE_URL=postgres://postgres:CHANGEME@127.0.0.1:5432/mm_test
```

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | no | `development` · `test` · `production`. A typo is rejected rather than silently disabling every production guard |
| `PORT` | no | defaults to 3000 |
| `DATABASE_URL` | **yes** | **`mm_app`, never `postgres`.** PostgreSQL bypasses RLS for a superuser and for a table's owner, so the wrong role here disables every policy with no error |
| `MIGRATION_DATABASE_URL` | no | the owner, drizzle-kit only. Omitted on an API task on purpose |
| `DB_POOL_MAX` | no | 10. What reaches the database is `containers × this` |
| `DB_STATEMENT_TIMEOUT_MS` | no | 5000, enforced server-side |
| `DB_IDLE_TX_TIMEOUT_MS` | no | 10000, enforced server-side |
| `TEST_DATABASE_URL` | tests only | must name `mm_test` |
| `TEST_MIGRATION_DATABASE_URL` | tests only | must name `mm_test` |

**`src/config/env.schema.ts` is authoritative.** If a variable is not declared
there, no code may read it — which is what keeps this table from quietly
becoming a stale guess. A missing or malformed value aborts the boot and names
every problem at once, rather than surfacing hours later inside a request.

**On a server** none of this is a file. Values come from AWS Secrets Manager and
the API task is given only `DATABASE_URL`. See [Server notes](#server-notes).

---

## Server notes

The steps above describe a **developer machine**. A server differs in four ways:

1. **Credentials.** `postgres/postgres` and `mm_app/mm_app` are local-only. A
   server reads both URLs from the environment, backed by AWS Secrets Manager
   (ADR-019), and the API task is given **only `DATABASE_URL`** — the `mm_app`
   one. A container serving requests must not hold a credential that can `DROP`
   a table.
2. **The database.** Production is Aurora PostgreSQL Serverless v2, not this
   container. `docker-compose.yml` is for development and CI only.
3. **Migrations run as their own task**, before the new version starts serving —
   not from inside the API container, which has no owner credential. `mm_app` is
   created by migration `0002` with `NOLOGIN`; granting it `LOGIN` and a password
   is a per-environment step the migration deliberately does not perform.
4. **Process management.** `start:dev` is a watcher. A server runs
   `npm run build` then **`node dist/main.js`** — the `.js` matters, since the
   project is ESM and extensionless paths do not resolve. Under ECS Fargate,
   SIGTERM reaches `enableShutdownHooks()` and the pool drains.

**Health checks.** Point the load balancer at `/health/ready`, not `/health`.
The first proves the database is reachable; the second only proves the process
is alive, which would keep a container in rotation while every request it serves
fails. `role` in that response must read `mm_app` — `postgres` means row-level
security is being bypassed.

**CI** runs `npm run typecheck`, `npm run lint`, `npm test`, and
`npm run test:e2e`. The last needs a PostgreSQL service container and the two
`TEST_*` URLs; it applies the real migrations and deletes every row, so it must
never be pointed at anything but a throwaway database.

What transfers unchanged: the Node version, the Fastify adapter, the environment
schema, and the migration pipeline.

---

## Next

The schema is built one domain at a time, in dependency order:

| | Domain | Tables |
|---|---|---|
| 7 | identity | users · sessions · passkey_credentials · devices — **done** |
| 8 | tenancy | vaults · vault_members — **done** |
| 9 | *(no tables)* | row-level security — the `mm_app` role and the policies — **done** |
| 10 | *(no tables)* | the database module, the actor, and a test suite — **done** |
| 11 | people | members · events · event_members · event_reminders — **done** |
| 12 | archive | memories · media_assets · albums · album_memories · upload_sessions · memory_members — **done** |
| 13 | promises | capsules · capsule_recipients · capsule_memories · capsule_replies · delivery_attempts · scheduled_jobs — **done** |
| 14 | sharing | shares · notifications · notification_preferences — **done** |
| 15 | billing | subscriptions · payments · subscription_channels · subscription_ai_features — **done** |
| 16 | governance | admin_users · roles · permissions · audit_logs · break_glass_access · reports · moderation_flags · blocks · feature_flags |

**38 tables for Release 1.** Built in dependency order because foreign keys demand
it — everything references `users`, and `vault_members` needs `vaults`. One domain
per step, each reviewed and applied before the next.
