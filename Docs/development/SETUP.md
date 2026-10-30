# Setup — from an empty machine to a running backend

Every step taken to build this project from nothing, in order, with the reasoning
kept short. Follow it top to bottom on a new machine or a server and you get an
identical environment.

**Status:** steps 1–31 complete. 40 tables, **four** database roles, both auth
realms, a console you can sign in to, a delivery engine that runs, capsules
end to end — and **the first server, live** (section 30), deployed on every
push to `main` once CI passes (section 31).

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

## 16 · The governance domain

`roles` · `permissions` · `admin_users` · `audit_logs` · `break_glass_access` ·
`reports` · `moderation_flags` · `blocks` · `feature_flags`

Nine tables, the last of the 38, and a different security model from every
other domain.

```bash
cd backend
npm run db:generate       # writes src/db/migrations/0008_*.sql
npm run db:migrate
```

Everywhere else the question is *"may this user see this row"*. Here it becomes
**"which employee read a family's private archive, and why"** — a question
about us, answerable only if the answer is recorded as it happens, and
trustworthy only if the record cannot be edited afterwards.

### Most of this domain is invisible to the API

`roles`, `permissions`, `admin_users` and `moderation_flags` have RLS enabled
and **no policy at all**, which denies them to `mm_app` entirely. The admin
console connects as its own role, which is a later step.

Only four things are genuinely user-facing and get policies: a user's own
**audit log**, the **break-glass records about them**, their own **reports**,
and their **blocks**.

### Append-only means append-only, including for us

The absence of an UPDATE policy stops `mm_app`. It does not stop the table
owner, a migration, or anybody with a psql prompt — and **an audit trail that
privileged code can quietly rewrite is not an audit trail**.

`audit_append_only()` is a trigger that refuses UPDATE and DELETE regardless of
who is asking. A test proves it by trying as the **table owner** and getting
`42501`.

`break_glass_immutable()` does the same for access grants, with one exception:
`user_notified_at` may be filled in later, because that is the one field which
legitimately becomes true after the fact. Every other column, and deletion, is
refused.

> **The limit of this guarantee: `TRUNCATE` does not fire row-level triggers.**
> It requires table-owner privilege — and anyone with that could also
> `DISABLE TRIGGER` — so the guard is against accident and against a
> compromised application role, not against a determined owner. Durable audit
> integrity needs the log shipped off-box as well, which is an operations
> concern rather than a schema one.
>
> It is also why the test harness works: `resetDatabase()` uses `TRUNCATE`, so
> it is not blocked by these triggers.

### `user_notified_at` is what makes break-glass honest

Support sometimes genuinely needs to see what a user sees. The alternative to
designing for that is an undocumented path nobody logs.

A grant records the admin, the target, the **reason**, the **approver**, an
**expiry** — and whether the user was told. Two constraints make it real:

| | |
|---|---|
| `CHECK (approved_by <> admin_id)` | An approval you can grant yourself is a field, not a control |
| `CHECK (length(reason) >= 20)` | "support" is not a reason |

The subject of the access can read the record of it. Being told is the point;
being able to check afterwards is what makes being told credible.

### The API may record its own trail and cannot forge anyone else's

```sql
CREATE POLICY audit_write_own ON audit_logs FOR INSERT
  WITH CHECK (actor_type = 'user' AND actor_id = app_current_user());
```

A request handler cannot write an `admin` or `system` entry. Recipient and
system rows come from the `SECURITY DEFINER` functions and the workers, under
roles of their own.

### Two separations worth naming

**`admin_users` is not a flag on `users`.** An admin is a different principal
with a different login and a different audit expectation; a boolean on the user
table is how a compromised customer account becomes a compromised console.

**`read` and `read_content` are different actions.** Listing that a vault
exists and opening what is inside it are different powers. Conflating them
would make every support agent capable of reading family photographs.

### Deferred, deliberately: partitioning `audit_logs`

The design notes call for monthly partitions over a 24-month retention. This
migration creates an ordinary table, because drizzle-kit cannot model
partitioning and faking it would make the migration story worse than the
problem.

**The trade-off is explicit:** converting later requires a table rewrite. At
Release 1 volumes the `ix_audit_retention` index serves the purge adequately;
the moment it does not, `pg_partman` takes the table over in a maintenance
window. Revisit this before the audit table passes roughly a hundred million
rows.

### Verify

```bash
npm run test:e2e        # 106 tests across eight suites
```

| | |
|---|---|
| the API reading roles, admins or moderation flags | 0 rows each, while the owner sees them |
| the API creating a role | `42501` |
| a user writing their own audit row | succeeds |
| the API forging an `admin` audit row | `42501` |
| a user reading their own access log | 1 row; a stranger sees 0 |
| **rewriting the audit trail as the table owner** | **`42501`** |
| deleting an audit row as the owner | `42501` |
| a break-glass request self-approved | `23514` |
| a reason of "support" | `23514` |
| the subject reading the record about them | 1 row; a stranger sees 0 |
| recording `user_notified_at` | succeeds |
| editing the reason afterwards | `42501` |
| filing a report | succeeds; only the reporter sees it |
| reporting the same thing twice | `23505` — repeat reports are not votes |
| editing a report after filing | 0 rows |
| reporting on somebody else's behalf | `42501` |
| a flag with a reviewer but no review time | `23514` |
| blocking somebody | the blocker sees it, the blocked user does not |
| blocking yourself | `23514` |
| reading feature flags | visible; writing them returns 0 rows |
| a rollout of 150% | `23514` |

---

## The schema is complete

**38 tables. 60 policies. 22 triggers. 106 integration tests.**

| Domain | Tables |
|---|---|
| identity | 4 |
| tenancy | 2 |
| people | 4 |
| archive | 6 |
| promises | 6 |
| sharing | 3 |
| billing | 4 |
| governance | 9 |

Every table has row-level security enabled. Every tenant-scoped table resolves
through `app_vault_role()`; every self-owned table through
`app_current_user()`. The five paths that legitimately have no actor — session
resolution, passkey lookup, capsule unlock, reply posting and share viewing —
each go through one narrow `SECURITY DEFINER` function rather than a relaxed
policy.

What comes next is no longer schema: the API modules that use it, the admin
role the console connects as, and the worker role that claims from
`scheduled_jobs`.

---

## 17 · Authentication, and the first real endpoints

The step that makes the schema reachable. Until now nothing populated
`ActorContext`, so a real request saw **zero rows of everything**.

```bash
cd backend
npm run db:generate       # writes src/db/migrations/0009_*.sql
npm run db:migrate
npm run start:dev
```

### A decision that overrides the stack document

The architecture names **Better Auth**. We hand-rolled the session layer
instead, because the schema built over steps 7–16 already implements one:
`sessions.token_hash` stores a SHA-256 digest and `app_resolve_session()` is
written against exactly that. Better Auth owns its own session table and stores
the token itself, so they cannot both be the source of truth.

**What that keeps:** a leaked database backup contains no working session.
**What it costs:** we write the OTP flow ourselves, and `@simplewebauthn/server`
will do the genuinely hard part when passkeys land.

**And one table.** Better Auth would have supplied its `verification` table;
hand-rolling means owning `email_otps` — the 39th table, and the honest cost of
the decision.

### The sign-in flow has no actor, so none of it is a policy

`email_otps` has RLS enabled and **no policy at all**. A table of live sign-in
codes readable by request code would be the single best thing to steal in the
database. Four `SECURITY DEFINER` functions do the work instead:

| | |
|---|---|
| `app_issue_email_code` | invalidates any live code first, so a stolen one cannot be held in reserve while the owner requests another |
| `app_redeem_email_code` | redeems, finds or creates the account, and opens the session — **one call**, because splitting it would mean exposing `users` and `sessions` to a request with no actor |
| `app_recent_email_code_count` | the rate limit |
| `app_touch_session` | extends a session in use, and is a no-op unless expiry is near |

**Every failure returns the same thing.** Wrong code, expired code, too many
attempts, no code at all — one flat 401. The difference between "wrong code"
and "no such account" is exactly what an enumeration attack is after. For the
same reason `request-code` always answers 202, including when rate-limited.

A six-digit code is one in a million, which is weak. Its security is the
ten-minute expiry and the **five-attempt counter** enforced inside the redeem
function, not the number.

### The keystone: middleware, not a guard

`ActorMiddleware` is the only place in the application that decides who the
actor is.

It is **middleware** because a guard returns a boolean and cannot wrap the rest
of the request — and `AsyncLocalStorage.run()` requires exactly that wrapping,
so the actor is visible to every `await` beneath the handler and invisible to
every other request on the process.

It **never rejects**. An unauthenticated request proceeds with no actor, and the
database then shows it nothing. A route that forgets its guard leaks an empty
list rather than somebody's archive.

`AuthGuard` is registered globally and is only a 401 — a courtesy so callers
get an honest error instead of a confusing empty list. Delete it tomorrow and
every handler still returns nothing, because `app.user_id` would be unset and
sixty policies would deny. **That ordering is the whole design.** A system whose
authorization lives in guards fails open the first time somebody forgets one.

### What the first product endpoint does not contain

```ts
const rows = await this.db.tx((tx) => tx.select().from(vaults));
```

No `WHERE owner_id = ?`. No membership check. No authorization code of any
kind. The select is written as though the table held only this user's rows,
because as far as this connection is concerned it does.

`GET /api/v1/vaults/debug/row-counts` makes the point bluntly: an unqualified
`count(*)` over three whole tables still counts only what the caller may see.

### Two bugs the tests caught

**1 · The global guard protected `/health`.** The load balancer would have got
401 from every container, marked them all unhealthy, and the service would
never have come up. `@Public()` on the health controller. Found by a test that
was checking something else.

**2 · The app under test wrote to `mm_dev` while the suite asserted against
`mm_test`**, so every assertion failed for a reason unrelated to the code.

> The fix is worth knowing: **`ConfigModule.forRoot({...})` is evaluated when
> `app.module.ts` is imported**, not when the testing module is compiled. So
> setting `process.env.DATABASE_URL` inside `beforeAll` is already too late.
> It has to be a `setupFiles` entry, which runs before the spec is imported at
> all — and `test/support/setup-env.ts` now also refuses to run against
> anything but `mm_test`, so no integration test can reach `mm_dev` however it
> is written.

### And one the tests did not

Reading an id out of a real sign-in response showed
`026f9048-e106-4cef-…` — a **v4** UUID.

`uuidPk()` declares application-generated UUIDv7, but `$defaultFn()` only
applies to inserts that go through Drizzle. The `SECURITY DEFINER` functions
insert directly and used `gen_random_uuid()`. Four tables were affected —
`users`, `sessions`, `email_otps`, `capsule_replies` — including the two
highest-insert-rate tables in the product, which is precisely where the
argument for v7 lives.

Migration `0010` adds `uuid_generate_v7()` (PostgreSQL 18 ships `uuidv7()`;
this is 17) and `CREATE OR REPLACE`s the four functions. There is now a test
asserting the version nibble on every id those functions create.

> **This migration has no schema change**, so drizzle-kit generates nothing.
> The file is hand-written and its `meta/_journal.json` entry added by hand —
> the supported way to ship a DDL-only or data-only migration.

### The endpoints

| | |
|---|---|
| `POST /api/v1/auth/request-code` | 202, always |
| `POST /api/v1/auth/verify` | → `{ token, expiresInDays, isNewAccount }` |
| `GET  /api/v1/auth/me` | `WHERE id = app_current_user()` — no input can make it return somebody else |
| `POST /api/v1/auth/sign-out` | revoked on the **next** request, which is why sessions are rows |
| `POST /api/v1/auth/sign-out-others` | the "I lost my phone" button |
| `GET  /api/v1/vaults` · `POST /api/v1/vaults` | the first product endpoints |
| `GET  /health` · `/health/ready` | public, and outside the version prefix |

In development the sign-in code is written to the log. `MailService` **throws
in production** rather than doing that — a deploy that silently logged sign-in
codes would be a breach, not a bug.

### Verify

```bash
npm run test:e2e        # 124 tests across nine suites
```

`test/auth.e2e-spec.ts` drives the whole chain over HTTP:

| | |
|---|---|
| a code request for an unknown address | 202, word for word the same as a known one |
| a malformed address | 400, and the value is not echoed back |
| a wrong code | 401, "That code is not valid." |
| the right code | account created, token issued |
| what the database stored | the **hash**, not the token |
| the same code twice | 401 |
| ids created inside SQL functions | version nibble `7` |
| a protected route with no token | 401 |
| the bearer token | resolves to the actor |
| two signed-in users | each sees only their own vault |
| an unqualified `count(*)` over three tables | scoped per caller |
| sign-out | the next request is 401 |
| the revoked session row | kept, not deleted |
| `/health` | 200; `/api/v1/health` is 404 |

---

## 18 · The admin console, and the repository shape

```bash
npx create-next-app@16.4.1 admin --typescript --tailwind --eslint --app \
  --src-dir --import-alias "@/*" --use-npm --skip-install --yes

cd admin && npm install && npm install server-only
```

From the repository root:

```bash
npm run dev:backend     # :3000
npm run dev:frontend    # :3001
```

### Two folders, no workspace

The root `package.json` has **no `workspaces` key**. It delegates with
`npm --prefix`, so `backend/` and `admin/` stay genuinely independent: each
has its own lockfile, its own `node_modules`, and can be built, tested and
deployed without the other.

That matters for deployment more than for development. The API ships as a
container; the admin console is a Next.js app. A workspace would bind their
dependency trees together and make one upgrade a decision about both.

| Root script | Runs |
|---|---|
| `dev:backend` · `dev:frontend` | the two dev servers |
| `build:backend` · `build:frontend` | the two builds |
| `test` · `test:e2e` · `lint` · `typecheck` | across both |
| `db:generate` · `db:migrate` · `db:studio` | delegated to the backend |
| `install:all` | a fresh checkout, in one command |

Either folder still works on its own — `cd admin && npm run dev` is exactly
equivalent.

### Ports

The backend keeps **3000**; the admin console runs on **3001**. Next.js would
otherwise take 3000 and the two could never run together, which is the whole
point of the root scripts.

### `server-only`, and why it is in this scaffold already

```ts
import 'server-only';
```

The first line of `admin/src/lib/api.ts`. It makes the **build fail** if that
module is ever pulled into a Client Component.

This console reads other people's family archives. A credential that reaches
the browser is a credential within reach of a browser extension, a screenshot,
and whoever is standing behind the agent. So every API call happens in a Server
Component or a Route Handler, and the browser never holds an admin token. The
variable is `MM_API_URL`, **not** `NEXT_PUBLIC_MM_API_URL` — that prefix
inlines a value into the client bundle, which is exactly what must not happen
on this path.

### Next 16 is not the Next.js you remember

The template writes an `AGENTS.md` saying so, and it is right. Two things bit
immediately:

**1 · `export const dynamic = 'force-dynamic'` is rejected at build time.**

```
Route segment config "dynamic" is not compatible with nextConfig.cacheComponents
```

`cacheComponents: true` is on in the generated config. The replacement is
better anyway: isolate the uncached work in its own component and wrap it in
`<Suspense>`. The shell prerenders and ships immediately; the health check
streams in when it answers. The build reports the route as
`◐ Partial Prerender`.

A console that blanks for five seconds because the backend is slow is a console
nobody can use during the incident they opened it for.

**2 · `fetch` is not cached by default**, and blocks rendering until it
returns. `cache: 'no-store'` is stated explicitly anyway, so the next person
does not have to remember which version changed the default.

> `admin/AGENTS.md` is **generated by `next dev` and re-added if deleted**, so
> it is committed deliberately. Removing it only produces an uncommitted change
> that comes back.

### What the page does, and what it deliberately does not

It server-renders the backend's `/health/ready` and shows the database role,
with `mm_app` in green and anything else in red — the same superuser warning
the API logs, surfaced where an operator will see it.

**There is no sign-in.** The admin realm is separate from the user realm by
design: `admin_users` is its own table with its own role, mandatory MFA and its
own audit expectation. Bolting this console onto the user session would be
exactly the mistake the schema was shaped to prevent — a compromised customer
account becoming a compromised console. The real console starts with the
`mm_admin` database role.

### Verify

With both running:

```bash
curl http://127.0.0.1:3000/health          # {"status":"ok",...}
curl -s http://127.0.0.1:3001/ | grep -o mm_app
```

The admin page should report **reachable · connected · mm_app · enforced**, and
a latency in milliseconds. Stop the backend and reload: it shows the failure
and tells you which command starts it.

---

## 19 · The worker and admin roles

Two migrations, no new tables, and the step that turns two earlier claims from
promises into facts.

```bash
cd backend
npm run db:migrate        # 0011 and 0012, both hand-written
```

### What was missing

| Written in | Claimed | Reality until now |
|---|---|---|
| migration 0005 | `scheduled_jobs` is insert-only to the API *because the worker claims under its own role* | No such role. **Nothing could claim a job**, so no capsule would ever have been delivered |
| migration 0008 | the governance tables are invisible to `mm_app` *because the console connects as its own role* | No such role. They were invisible to everything but the table owner |

Both policies were right. This supplies the half that was missing.

`mm_worker` and `mm_admin` are created `NOLOGIN` with no password, exactly like
`mm_app` — a password in a migration is a password in git history forever.

```sql
ALTER ROLE mm_worker WITH LOGIN PASSWORD '<password>';   -- per environment
ALTER ROLE mm_admin  WITH LOGIN PASSWORD '<password>';
```

Neither role may `DELETE` **anything, anywhere** — a revoked table privilege,
which no policy can route around. Deletion here is a soft delete plus a purge
job, and the purge job is the only thing that will ever get that grant.

### Policies scoped `TO role`

Every policy before this one applies to `PUBLIC`. PostgreSQL ORs permissive
policies together, so the new roles already carry `mm_app`'s policies — which
deny them everything, because `app.user_id` is unset. The new policies add
exactly what each role needs on top.

### The tightest policy in the schema

The worker must read a memory to build the capsule carrying it. It must **not**
be able to read the archive.

```sql
CREATE POLICY memories_worker ON memories FOR SELECT TO mm_worker
  USING (EXISTS (
    SELECT 1 FROM capsule_memories cm
    JOIN capsules c ON c.id = cm.capsule_id
    WHERE cm.memory_id = memories.id
      AND c.state IN ('sealed', 'delivering', 'delivered')));
```

A memory nobody sealed is invisible to the delivery engine, and so is one whose
capsule was cancelled. **A compromised worker cannot walk the archive** — only
the handful of rows currently in flight. A test asserts it sees one memory and
not the one beside it, including when asked for by id.

### `read` and `read_content`, made real

Back in step 16 those were two values in an enum. Here is the mechanism:

```sql
CREATE POLICY memories_admin ON memories FOR SELECT TO mm_admin
  USING (app_admin_may_read_content(
    (SELECT v.owner_id FROM vaults v WHERE v.id = memories.vault_id)));
```

`app_admin_may_read_content()` is true only while a break-glass grant exists
that names **this** admin, was approved by **somebody else**, and has **not
expired**.

So support can find an account, read its plan, see when it last signed in — and
gets zero rows from `memories` until a colleague approves a reason. The tests
cover all four states: no grant, a live grant, a colleague's grant, and an
expired one.

`app.admin_id` is a **separate setting** from `app.user_id`. One connection is
never both, and sharing the key would let an admin session satisfy a user
policy.

### Two things that cost a round of failures

**1 · A policy belonging to another role is still evaluated for yours.**

Migration 0011 was correct and completely unreachable. Every older policy
applies to `PUBLIC`, which includes the new roles, and most of them begin by
calling `app_vault_role()` — on which only `mm_app` had `EXECUTE`. So the new
roles did not quietly get `false` from a policy that was not theirs; they got

```
ERROR: permission denied for function app_vault_role
```

on any query touching `memories`, `albums`, `capsules` and half a dozen other
tables. Migration 0012 grants the nine helpers.

> **A role needs `EXECUTE` on every function used by any policy on a table it
> touches — not merely by its own policies.** The next role added will need the
> same block.

**2 · A role with `INSERT` but no `SELECT` cannot use `RETURNING`.**

`INSERT ... RETURNING` evaluates the **SELECT** policy against the new row and
raises if it is not visible. The worker may write the audit trail and may not
read it — so asking for the row back turned a successful insert into

```
ERROR: new row violates row-level security policy for table "audit_logs"
```

which reads like the write was refused when it was the read that failed. Worth
knowing before it is diagnosed at 2am.

### Verify

```bash
npm run test:e2e        # 141 tests across ten suites
```

`test/roles.e2e-spec.ts` uses `SET LOCAL ROLE` inside a transaction, which is
exactly how the real connections behave: `current_user` becomes the role, so it
is neither superuser nor table owner and every policy applies.

| | |
|---|---|
| the worker claims a job | succeeds — **the API sees 0 rows in that table** |
| the worker reads a memory in a sealed capsule | 1 row |
| the same worker, the memory beside it | 0 rows, even by id |
| the worker editing a sealed note | `23514` — the freeze trigger applies to every role |
| the worker advancing `state` | succeeds |
| the worker writing a `system` audit row | succeeds |
| the worker writing an `admin` one | `42501` |
| the worker reading the audit trail | 0 rows — write-only |
| any `DELETE` by the worker | `42501`, from a missing privilege rather than a policy |
| an admin listing accounts | 2 rows |
| an admin reading content, no grant | **0 rows** |
| …under a live approved grant | rows |
| …a colleague's grant | 0 rows |
| …an expired grant | 0 rows |
| extending an expiry instead of re-requesting | `42501` |
| an admin self-approving | `23514` |
| an admin filing in a colleague's name | `42501` |
| an admin writing the audit trail | `42501` |
| `app_current_user()` on an admin connection | NULL |

---

## 20 · Admin login

```bash
cd backend
npm install otpauth
npm run db:generate       # writes src/db/migrations/0013_*.sql
npm run db:migrate
```

Then, per environment:

```bash
docker exec mm-postgres psql -U postgres -d mm_dev -c \
  "ALTER ROLE mm_admin WITH LOGIN PASSWORD '<password>';"

node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# → ADMIN_ENCRYPTION_KEY
```

### Two factors, neither of them a password

| | |
|---|---|
| 1 | an emailed code — proves control of the corporate mailbox |
| 2 | a TOTP code — proves possession of the enrolled device |

Consistent with the rest of the product, and genuinely *two* factors rather
than two spellings of one: a mailbox compromise alone does not reach the
console, and a stolen phone alone does not either. **No bypass.** The console
can read other people's family archives under break-glass; one factor is not a
credential worth that.

### A 40th table, and why it could not be `sessions`

`admin_sessions` is separate because reusing `sessions` would mean a foreign
key to `users` — making an admin a kind of user, and putting one compromised
customer account one step from the console. The realms stay apart all the way
down: different table, different role, different actor setting, different
token.

It is also where the factors are reconciled. A session exists after the email
code is redeemed and is **useless** until `mfa_completed_at` is set. The only
thing it can do in between is present a TOTP code — a test confirms that token
gets 401 from `/me`.

**Eight hours, not extended on use.** A customer session rolls forward for
thirty days because signing a grandmother out monthly is a real cost. An admin
session is a working day: a forgotten browser tab should stop being dangerous
by morning.

### The sign-in function is deliberately not the user one

`app_redeem_email_code` **creates an account** when the address is unknown —
right for a product where sign-up and sign-in are one flow, and catastrophic
here: anybody who can receive mail could mint themselves an admin.

`app_admin_redeem_code` creates nothing. An address that is not an active
admin gets the same empty result as a wrong code — and **the code is spent
either way**, so a valid code cannot be replayed while somebody works out which
addresses are staff. A test asserts no `users` row appears.

### The TOTP secret is encrypted, not hashed

A TOTP secret is a bearer credential and *cannot* be hashed, because the server
must reproduce it to check a code. So it is encrypted with AES-256-GCM under a
key that lives **outside** the database — which is the whole point: a leaked
backup alone generates no second factors.

GCM because it is authenticated: a tampered ciphertext fails to decrypt rather
than decrypting to something attacker-chosen. The nonce is random per
encryption and stored alongside, as it must be — a reused nonce under one key
breaks GCM completely.

Enrolment material is returned **exactly once** and is not recoverable.
`app_admin_enrol_totp` refuses to overwrite an existing secret; otherwise
anybody holding a first-factor token could replace the second factor with one
of their own, which would make it decorative.

Backup codes work once each. Using one is audited and logged as a warning.

### A third pool, not a `SET ROLE`

The console connects as `mm_admin` on its own pool. `SET ROLE` would have to
be reset every time a connection returns to the pool, and **one missed reset
hands admin privileges to whichever request borrows it next.** Two pools cannot
make that mistake.

`ADMIN_DATABASE_URL` is optional: a deployment serving only the mobile API
holds no console credential at all, which is the strongest possible version of
"the API cannot read the governance tables".

`app.admin_id` is a separate setting from `app.user_id`, so
`app_current_user()` is NULL on every admin connection and no user policy can
be satisfied by an admin session.

### Verify

```bash
npm run test:e2e        # 157 tests across eleven suites
```

| | |
|---|---|
| a staff address and a stranger | byte-identical 202 |
| a non-admin address with a valid code | 401, **and the code is spent** |
| …and no `users` row created | 0 rows |
| a deactivated admin | 401 |
| first sign-in | returns an `otpauth://` URI and 8 backup codes |
| the stored secret | encrypted, three base64url parts, not the plaintext |
| **a first-factor token against `/me`** | **401** |
| a wrong TOTP | 401 |
| a valid TOTP | 200, 8-hour session |
| `/me` | email, role and permissions, from the console connection |
| the audit trail | `admin.totp_enrolled` and `admin.signed_in` |
| a second enrolment attempt | refused; the secret is unchanged |
| **an admin token on a customer route** | **401** |
| **a customer token on an admin route** | **401** |
| a backup code, twice | 200 then 401 |
| sign-out | the next request is 401 |

---

## 21 · The console's sign-in page

```bash
cd admin
npm install qrcode
npm install -D @types/qrcode
```

Four routes — `/login`, `/login/code`, `/login/enrol`, `/login/totp` — plus a
dashboard behind the session, a `/logout` Route Handler, and `src/proxy.ts`.

### The token never reaches the browser

httpOnly cookies, written on the server, inside the same Server Action that
received them from the API. Not `localStorage`, not a JS-readable cookie, not
a prop passed into a Client Component.

This token opens a console that can read other people's family archives under
break-glass. Anything that puts it within reach of an extension, an XSS or a
screenshot of devtools is the wrong place for it.

`sameSite: 'strict'` because the console is never linked to from anywhere, so
there is no navigation it breaks — and it removes a class of cross-site
request forgery without the forms carrying a token.

**No client JavaScript in the sign-in flow at all.** Plain
`<form action={serverAction}>`. It also means the console signs in with
JavaScript disabled, which is a small thing until the evening a bundle fails
to load and somebody needs to read an incident.

### The enrolment screen says the quiet part

The QR is rendered to **SVG on the server** — no client-side QR library, so the
secret is already pixels before it leaves the process.

The page states plainly that the backup codes are shown once and that there is
no way to re-enrol without a colleague, because the server genuinely refuses
to overwrite an existing secret. A screen that implies a "resend" that does not
exist is worse than one that admits it.

### Three things this version of Next forced

**1 · `export const instant = false` on the sign-in routes.**

Every meaningful thing on those pages is request data — the error from the last
attempt, the address being signed in. There is no useful static shell, so the
documented *block* option is the honest one. The build labels them `ƒ Dynamic`.

**2 · `redirect()` from a page does NOT produce an HTTP redirect here.**

> *"When used in a streaming context, this will insert a meta tag to emit the
> redirect on the client side."*

With `cacheComponents` enabled, page rendering is a streaming context. So a
signed-out visitor got **HTTP 200** with a redirect buried in the body — fine
for a browser, and a successful-looking page for curl, a probe, a crawler or a
misconfigured proxy.

The documented way to redirect *before* rendering is **Proxy** (`proxy.ts` —
`middleware.ts` is deprecated in this version). `src/proxy.ts` now returns a
real **307** for a request with no session cookie.

It checks **presence, not validity**, and must: validating would mean an API
round trip from a layer meant to be cheap enough to run at a CDN edge. So:

| Request | Result |
|---|---|
| no cookie | **307** from the proxy, straight to `/login` |
| a cookie the API rejects | 200 whose body redirects to `/logout`, which answers **307**. The body carries no admin data — verified |
| a valid session | the dashboard |

The matcher is written as an *exclusion*, so a page added next month is
protected by default and opting out is a deliberate edit a reviewer can see.

**3 · Cookies cannot be modified in a Server Component.**

```
Error: Cookies can only be modified in a Server Action or Route Handler.
```

The dashboard discovers a dead session while *rendering* — the API refuses the
token — and at that moment it cannot clear the cookie. Hence `/logout`, a Route
Handler, which can. Found by actually exercising the path with a bogus cookie;
no test had covered it.

### Verify

With both running (`npm run dev:backend`, `npm run dev:frontend`):

```bash
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://127.0.0.1:3001/
# 307 -> http://127.0.0.1:3001/login
```

Then open <http://localhost:3001> and sign in as a seeded admin. The code is
printed in the backend log. On first sign-in you get a QR and eight backup
codes; afterwards the dashboard shows the email, role and permissions —
fetched server-side with the cookie, so none of it passes through the client.

To seed one:

```sql
INSERT INTO roles (id, name) VALUES (uuid_generate_v7(), 'support');
INSERT INTO admin_users (id, email, role_id)
SELECT uuid_generate_v7(), 'you@mm.internal', id FROM roles WHERE name = 'support';
INSERT INTO permissions (role_id, module, action)
SELECT id, 'users', 'read' FROM roles WHERE name = 'support';
```

---

## 22 · The console's screens, and what feeds them

Covered in the commits for the sign-in page and the dashboard. The short
version:

- `admin/` is built to the supplied design, with sampled colours as named
  tokens in `globals.css` and Figtree standing in for the brand face.
- `GET /admin/v1/dashboard` computes every panel in one pass. Fields the
  product cannot yet measure return `null` and render as "not measured"
  rather than as a number somebody might repeat in a meeting.
- Controls that do not exist are drawn as the comp shows them and rendered
  **disabled**. During an incident a button that looks live and does nothing
  is worse than one honestly greyed out.
- `npm run seed:dev` fills `mm_dev` so the console has something to draw.

**Migration 0014** gave the console read access for those panels — and closed
a hole while doing it. `mm_admin` had table privileges on `capsules` with no
row policy, so every figure would have rendered zero; adding the policy naively
would have made `sender_note` readable. Counting capsules is operations;
reading one is somebody's last letter, and a row policy cannot express that
difference. Access to `capsules` and `capsule_recipients` is therefore granted
**column by column**, and the message is not among them.

---

## 23 · The delivery engine

```bash
# per environment
docker exec mm-postgres psql -U postgres -d mm_dev -c \
  "ALTER ROLE mm_worker WITH LOGIN PASSWORD '<password>';"

cd backend
npm run worker:dev        # watch mode
npm run worker:prod       # node dist/worker.main.js
```

The role, the policies, the claim query, the lease and the reaper have existed
since step 19 with **nothing running them**. This is the process.

### A fourth credential, and a separate process

`WORKER_DATABASE_URL` is `mm_worker`. A separate pool for the same reason the
console has one: `SET ROLE` would have to be reset on every release back to the
pool, and one missed reset hands the wrong privileges to the next borrower.

`src/worker.main.ts` boots a **standalone application context** — no HTTP
server, no port. In production it is its own ECS service, and this module
boundary is why that is a deployment decision rather than a rewrite.

> **The worker pool has no `statement_timeout`.** The API kills a slow query
> because a user is waiting. A delivery job has nobody waiting, and killing it
> mid-send is how a message gets sent without being recorded. The lease is the
> safety net here, not a timeout.

### Claiming

```sql
UPDATE scheduled_jobs SET state = 'running', attempts = attempts + 1,
       locked_by = $1, locked_until = now() + lease
 WHERE id IN (SELECT id FROM scheduled_jobs
               WHERE state = 'pending' AND run_at <= now()
               ORDER BY run_at LIMIT $2
                 FOR UPDATE SKIP LOCKED)
RETURNING …
```

**One statement**, so the claim is atomic. SELECT-then-UPDATE would leave a
window in which two workers both believe they own the job.

`SKIP LOCKED` rather than `NOWAIT` or a plain `FOR UPDATE`: the first errors,
the second makes a second worker *wait* for the first — which turns a pool of
workers into a queue of one. A test runs two claims concurrently and asserts
the job appears in exactly one.

### The ordering that is the whole correctness argument

```
1. RESERVE the attempt row   ← before sending anything
2. send
3. record the outcome
```

Reserving first is what makes a crash survivable:

| Crash between | Consequence |
|---|---|
| 1 and 2 | the row exists as `queued`; the retry sees it and does **not** send again. The capsule is **delayed** |
| 2 and 3, without the reservation | the retry sends a **second copy** of a message from somebody's dead father |

Of those two, one is recoverable. `ux_attempt_idempotent` enforces it, and the
reservation and the send are deliberately **not** in one transaction — a
transaction wrapping the provider call would hold a row lock for a network
round trip and roll the reservation back exactly when the record of having
tried matters most.

### Retries in days, and death as a terminal state

1 day, 2, 4, 8. A capsule has waited twenty years; it can wait another day for
a mail server. Retrying in minutes would burn the whole budget in an afternoon
on an outage that resolves itself overnight.

After five attempts the job is `dead` — terminal, and needing a person. For
`capsule_delivery` that is a Sev-0, and the console counts it as one.

### The reaper, and what it does not do

A worker that dies holding a job leaves it `running` with a lease nobody owns.
For `capsule_delivery` that is a promise which never fires, **with no error
anywhere**, because nothing failed — it was dropped.

`reap()` returns those to `pending` and **does not increment `attempts`**: the
job was abandoned, not tried, and charging it an attempt would spend the retry
budget on a crash. A test also asserts it leaves a **live** lease alone —
reaping a job somebody is still working on is how two workers send the same
capsule.

### The gateway refuses to run in production

`DeliveryGateway` logs and reports success in development, which is enough to
prove the ordering, the idempotency and the backoff — the parts that are hard
to get right and impossible to test against a real provider.

In production it **throws**. A deploy that marked capsules delivered without
sending anything would be the single worst bug this product could have; better
to fail every job loudly than to quietly tell a family their message arrived.
`sms` and `whatsapp` fail honestly rather than reporting success, so a capsule
addressed that way stays visibly undelivered.

### A policy that was too narrow — migration 0015

`capsules_worker` admitted `state IN ('sealed','delivering','delivered')`,
which was deliberate: the engine has no business reading a draft. It also made
a **cancelled** capsule invisible to the worker — while its delivery job still
existed, because cancelling does not delete the job.

So the handler read zero rows and could not tell *"this promise was withdrawn"*
from *"this capsule has no recipients"*. It raised, retried, and after five
days of backoff would have gone `dead` — **a Sev-0 page at 3am for a capsule
the owner cancelled weeks earlier.**

`cancelled` and `failed` are now visible; `draft` still is not. Caught by a
test asserting the job completes quietly.

> **A policy that is too narrow fails in the same direction as no policy at
> all: silently, and in production.**

### Verify

```bash
npm run test:e2e        # 171 tests across twelve suites
```

| | |
|---|---|
| a due job | claimed, capsule delivered, lease released |
| the attempt row | `delivered`, with provider and message id |
| the audit trail | a `system` row, `capsule.delivered` |
| **replaying the same job** | **still one attempt** — no second send |
| forcing a duplicate attempt row | `23505` |
| a channel that fails | retried **tomorrow**, capsule visibly `delivering` |
| five failures | `dead`, not round again |
| a job abandoned by a dead worker | returned to `pending`, `attempts` unchanged |
| a **live** lease | left alone |
| two concurrent claims | the job appears in exactly one |
| a job not yet due | not claimed |
| a cancelled capsule | job completes, **nothing sent** |
| an unlock still in the future | refused, capsule not delivered |

---

## 24 · The archive: memories, uploads, and signed media

```bash
cd backend
npm install                      # resend, @aws-sdk/client-s3, s3-request-presigner
npm run test:e2e                 # 186 tests, 13 suites
```

Nothing new to run. This step is the first that reaches **outside the
machine** — to an email provider and to object storage — so what matters is
what happens when those are absent, wrong, or lying.

### Both providers are optional, and their absence means something

| Provider | Unset in development | Unset in production |
|---|---|---|
| mail (`SMTP_HOST`, else `RESEND_API_KEY`) | the sign-in code prints to the terminal | **throws.** A deploy that logged sign-in codes instead of mailing them is a breach, not a degraded mode |
| R2 (four variables) | `POST /uploads` answers `409` | same `409` — storage is simply not available |

That asymmetry is deliberate. A missing mail key must never fail quietly,
because the failure is invisible from the outside: users just never receive
anything. A missing bucket fails loudly on its own, at the first upload.

### The bytes never pass through the API

```
POST /uploads              → check quota, reserve a session, return a signed PUT
PUT  <signed url>          → the client uploads DIRECTLY to R2
POST /uploads/:id/complete → HEAD the object, record the asset, charge the quota
GET  /media/:id/url        → a signed GET, 300 seconds
```

A 4K video routed through a request handler would hold it for minutes, and a
rolling deploy would cancel somebody's upload halfway. It also means the API
container never needs the memory to buffer a file it is not interested in.

### Three things the quota depends on

**The check happens before a byte moves.** Checking afterwards means paying
for storage you then refuse — and telling somebody their video is over quota
after twenty minutes on a mobile connection is its own kind of insult.

**The size is read from the store, not from the client.** `completeUpload`
calls `HEAD` and writes *that* number. A client that declares 5 MB and uploads
5 GB would otherwise under-bill itself and walk through the quota wall.

**The quota moves in the same transaction as the row that caused it.** Never a
nightly recount: a quota that is right once a day is a quota a user can walk
straight through for the other twenty-three hours.

### Two bugs this step's tests found

Both were real, both were in code whose comments claimed the opposite, and
neither was reachable until the endpoints were exercised over HTTP.

**A resumed upload pointed at a different object.** `POST /uploads` minted a
fresh asset id on every call and overwrote `storage_upload_id` — so retrying
handed the client a *new* key and stranded every byte already uploaded under
the old one, leaving an orphan nothing in the database referenced. The comment
directly above it said the id was minted "so the storage key is stable across
retries." A resumed session now keeps the key it was given.

**An oversized object failed on a check constraint.** When the store held more
than the session declared, `ck_upload_bytes` (`bytes_received <= bytes_total`)
fired and `translatingPgErrors` turned it into `400 "That value is not allowed
here."` — which tells an operator nothing and sends a client away to guess
which value. It is now checked explicitly, logged, and answered `413`.

> This should be unreachable in production: `presignUpload` signs
> `ContentLength` into the URL, so the store itself refuses a body of a
> different size. Arriving there means the signature, the store, or the client
> is wrong — which is exactly why it deserves an error that says so.

### `MEDIA_URL_TTL_SECONDS` is a security parameter

Revoking a share stops the next request immediately, but a signed URL already
handed out keeps working until it expires. **That window is this number.**
Default 300, hard ceiling 900 in the schema.

> **The bucket stays private.** No public `r2.dev` URL. A public URL cannot be
> revoked, and "revocation is immediate" is a claim this product makes.

### Testing without a bucket

`test/archive.api.e2e-spec.ts` replaces `StorageService` with a fake that
remembers what it was told — not because a real bucket is hard to run, but
because the interesting behaviour is on this side of it: that the quota is
charged from the size the store reports, that an upload which never landed is
refused, and that a retry does not double-charge. A real bucket proves the
network works; this proves the product does.

To exercise the real path, put live R2 credentials in `backend/.env` — it is
gitignored, and nothing env-shaped has ever been committed.

---

## 25 · Real email, by SMTP

```bash
cd backend
npm install              # adds nodemailer
npm run start:dev        # logs which transport it chose, then verifies it
```

Expected at startup:

```
[MailService] Email will be sent by SMTP via smtp.zeptomail.in:587 as ...
[MailService] SMTP credentials accepted
```

### Three transports, chosen in this order

| Order | Transport | When |
|---|---|---|
| 1 | SMTP | `SMTP_HOST` is set |
| 2 | Resend | no `SMTP_HOST`, but `RESEND_API_KEY` is set |
| 3 | the console | neither — **development only** |

SMTP first because it is the lowest common denominator. ZeptoMail, SES,
Postmark and Mailgun all speak it, so changing vendor is an edit to `.env`
rather than to the code. Resend stays as the HTTP alternative: two independent
senders, because a capsule that arrives IS the product and one vendor's bad
afternoon must not be the reason it does not.

With neither configured, production **throws**. Development prints the code to
the terminal, which is also what the integration suites read it back from.

### The credentials are proved at startup

`MailService.verify()` runs from `main.ts`. SMTP authentication otherwise
fails at *send* time, which means the first thing to discover a wrong password
is a user watching for a code that never arrives.

It logs and returns rather than throwing. A mail outage must not also take
down reading the archive — those are unrelated failures, and collapsing them
into one makes a small problem into an outage.

### An empty variable now means unset

`R2_ACCESS_KEY_ID=` with nothing after it used to fail an **optional**
variable's `min(1)` and refuse to boot — a confusing way to say "still blank",
and one that tempts people to delete the line and forget the setting exists.
`validateEnv` strips empty values before parsing, so a placeholder waiting to
be filled in behaves as absent. A *required* variable still fails, but now
says "required" rather than "too small".

### The test suite can no longer reach a provider

```ts
// test/support/setup-env.ts
delete process.env.SMTP_HOST;
delete process.env.SMTP_USERNAME;
delete process.env.SMTP_PASSWORD;
delete process.env.RESEND_API_KEY;
```

> **This is a sender-reputation guard, not tidiness.** The auth suites sign in
> as `aarav@example.com`, `bina@example.com` and a dozen other addresses that
> do not exist. With SMTP configured in `.env` — which it is, for local
> development — running the suite sends real mail to every one of them, and a
> provider measures an account by how much of what it sends bounces. An
> afternoon of `npm run test:e2e` is enough to get a sending domain suspended.

Stripped in the setup file rather than guarded inside `MailService`, for the
same reason the database URLs are rewritten there: it is the only point early
enough to be unconditional, and a suite written next month cannot forget it.

Object storage needs no equivalent — the archive suite replaces
`StorageService` outright.

---

## 26 · Testing every endpoint by hand

```bash
cd backend
npm run start:dev
npm run dev:code -- someone@example.com     # recover a sign-in code
```

Import `Docs/development/MandM.postman_collection.json` into Postman. 25
requests in six folders, and the tokens wire themselves together — each
sign-in request captures what the next one needs, so nothing is copied by
hand.

### The route prefix is not what the controllers say

`@Controller('admin/v1/auth')` plus a global `api/v1` prefix gives:

```
/api/v1/admin/v1/auth/request-code
```

Redundant, and it is the real contract — `admin/src/app/login/actions.ts`
calls exactly that. Only `/health` and `/health/ready` are excluded from the
prefix. Worth tidying one day, but changing it breaks the console, so it is
written down rather than quietly fixed.

### Getting a sign-in code

Codes are SHA-256 in `email_otps` and cannot be read back — not by an
attacker holding the database, and not by you. `npm run dev:code` recovers one
by trying all million six-digit strings against the stored digest, which takes
about a second. It is the same thing the integration suites do.

It connects as the **owner** role deliberately: `mm_app` cannot select from
`email_otps` at all, which is the correct answer to "can the API read anybody's
sign-in code".

> A code is spent the moment a newer one is issued for the same address, so
> request, recover, and verify without detouring.

### Requesting a code returns 500 when mail is broken

Not a bug, and not an enumeration leak — it fails identically for every
address. The code **is** still issued, so `npm run dev:code` works even when
delivery does not, which is what makes Postman usable before DNS is sorted.

### The admin realm needs an account and an enrolment

Staff cannot self-register; there is no sign-up endpoint by design.

```bash
docker exec mm-postgres psql -U postgres -d mm_dev -c \
  "INSERT INTO admin_users (id, email, role_id)
   SELECT uuid_generate_v7(), 'admin@example.com', r.id FROM roles r WHERE r.name='support';"
```

First `verify-email` returns an `enrolment` block — a TOTP secret, an otpauth
URI and eight backup codes. **Shown once, never recoverable**: re-enrolment is
refused while a secret exists, because anybody holding a first-factor token
could otherwise replace the second factor with one of their own. Lose it and
delete the row to start again.

The two factors are separate tokens. `verify-email` returns an `mfaToken` that
can do exactly one thing — present a TOTP code. It opens no other admin route.

### What to check, beyond 200s

| Request | Expect | Because |
|---|---|---|
| `request-code` for an unknown address | **202** | a 404 here is an account-enumeration oracle |
| `verify` with a wrong code | **401**, same as expired | distinguishing them tells an attacker which half was right |
| `/auth/me` with no token | **401** | the global guard, not the handler |
| admin `dashboard` with a **customer** token | **401** | the realms share no credentials |
| `uploads/:id/complete` without the PUT | **409** | the server HEADs the object; it does not take your word |
| `media/:id/url`, then strip the query string | **400** from R2 | the bucket is private; the signature is the credential |
| another user's `vaultId` | **404**, not 403 | "forbidden" would confirm the vault exists |

That last row is the one worth re-reading. Row-level security has already
decided the row does not exist for this caller, and `src/common/pg-errors.ts`
maps the refusal to 404 so the answer does not contradict the policy.

---

## 27 · Who may sign in to the console

```bash
cd backend
npm run admin -- list
npm run admin -- grant someone@company.com [role]
npm run admin -- revoke someone@company.com
npm run admin -- restore someone@company.com
npm run admin -- reset-mfa someone@company.com
```

### There is no way to become staff from outside

Grep confirms it: nothing in `src/` inserts into `admin_users`. No sign-up, no
invite endpoint, and **no admin can promote anybody — not even to their own
role**. Becoming staff requires database access, so it requires the people who
hold the database.

An "invite an admin" button is a button that an attacker who takes one console
session gets to press.

### Four gates, and three of them are in the database

| Gate | Where | Verified |
|---|---|---|
| A row in `admin_users` | `app_admin_redeem_code` | a non-staff address with a valid code → **401** |
| `is_active` | same function, `WHERE a.email = p_email AND a.is_active` | same correct code: **401** revoked, **200** active |
| Email code, 10 min, 5 attempts | same function | — |
| TOTP second factor | `app_admin_complete_mfa` | first factor alone reaches no admin route |

Only the first factor is checked in application code; the rest live in the
database function, so they hold however the handler is rewritten.

> Anonymous access was measured, not assumed: `/dashboard` and `/auth/me`
> return **401** with no token, a junk token, and an empty bearer alike.

### Revoke deactivates, and it must

`moderation_flags.reviewed_by` and `break_glass_access.admin_id` are both
**ON DELETE RESTRICT**, so PostgreSQL refuses to delete an admin who has ever
reviewed a flag or opened a vault under break-glass.

That refusal is the feature. Deleting staff would erase who approved what, and
the audit trail is the only thing that makes those powers accountable.

`revoke` therefore sets `is_active = false` **and revokes their live
sessions** — otherwise somebody dismissed on Monday keeps a working console
until their eight-hour session lapses. Confirmed: their existing token returns
401 immediately.

### The second factor cannot be re-enrolled

`app_admin_enrol_totp` refuses while a secret exists, because anybody holding
a first-factor token could otherwise replace the second factor with one of
their own — which would make it decorative.

So a lost phone is `reset-mfa`, deliberately an operation on the database
rather than a "resend" link in an email.

### Roles

One role exists, `support`, with one permission, `users:read`. Permissions
hang directly off `roles` — there is no join table — so a new role is a row in
`roles` plus rows in `permissions`. `grant` refuses a role that does not
exist rather than creating one by accident.

`support` was first inserted by hand, which meant a database built from the
migrations alone had no roles and nobody could be granted the console — the
first server found it. Migration `0017_support_role` now creates it,
idempotently. **A new role belongs in a migration too**, never in a hand-run
`INSERT`.

---

## 28 · Dumps: backups, sharing, and why the server does not use one

### Do not provision a server from a dump

The server gets its schema from the **migrations**, not from a copy of
somebody's laptop:

```bash
# on the server, once
docker exec mm-postgres psql -U postgres -c "CREATE DATABASE mm_prod;"
docker exec mm-postgres psql -U postgres -d mm_prod -f roles.sql   # see below
cd backend && npm run db:migrate
```

A restored dump looks complete and is not. Measured on a schema-only restore
of `mm_dev`:

| | source | restored |
|---|---|---|
| tables | 40 | 40 |
| policies | 103 | 103 |
| functions | 116 | 116 |
| **`drizzle.__drizzle_migrations` rows** | **16** | **0** |

Everything is there except the record that it is there. The next
`npm run db:migrate` therefore believes nothing has ever been applied and
tries to replay all sixteen against a schema that already has them. In
testing it did not fail cleanly — it hung without committing a single row.

> A dump is a photograph of a database. The migrations are the instructions
> for building one, and only the instructions can be applied again next month.

### Roles must exist before any restore

A dump of this schema names `mm_app`, `mm_worker` and `mm_admin` **259 times**
in `CREATE POLICY ... TO <role>` and `GRANT` statements. On a machine where
those roles do not exist:

```
ERROR:  role "mm_app" does not exist
```

`pg_dump` of a single database does not include roles — they are cluster-wide.
Create them first:

```sql
-- roles.sql
CREATE ROLE mm_app   NOLOGIN;
CREATE ROLE mm_worker NOLOGIN;
CREATE ROLE mm_admin  NOLOGIN;
-- then per environment, with real passwords:
ALTER ROLE mm_app    WITH LOGIN PASSWORD '...';
```

Or carry them across with `pg_dumpall --roles-only`.

### Never send a data dump to another developer

A full dump of this product contains every user's email address, every
memory's note, and the `sender_note` of sealed capsules — letters people wrote
to their children to be opened in 2046. That is the one thing the whole
schema exists to protect, and column-level grants stop even the admin console
reading it.

Give them the **schema and a seed** instead:

```bash
docker exec mm-postgres pg_dump -U postgres -d mm_dev --schema-only > schema.sql
# they restore it, then:
cd backend && npm run seed:dev     # 240 users, 300 capsules, invented
```

Better still, they clone the repo and run `npm run db:migrate` — then they
have the migration history too, and no dump changes hands at all.

### Taking a dump in DBeaver

Right-click the **database** (not the connection) → **Tools → Backup**.

- **Format:** `Plain` for something readable or sharable; `Custom` if you want
  `pg_restore` with selective restore.
- **schema only / data only:** on the first page. Schema-only is what you
  share; both is what you back up.
- Uncheck **Use SQL INSERT instead of COPY** unless the target is not
  PostgreSQL — `COPY` restores far faster.

> **DBeaver shells out to a local `pg_dump`.** If it is older than the server
> you get `server version mismatch` and nothing is written. Point
> **Preferences → Database → Client → PostgreSQL** at a **17** client, or skip
> DBeaver and use the container's own binary, which always matches:

```bash
docker exec mm-postgres pg_dump -U postgres -d mm_dev --schema-only > schema.sql
docker exec mm-postgres pg_dump -U postgres -d mm_dev -Fc > mm_dev.dump
```

> **In Git Bash**, prefix container paths with `MSYS_NO_PATHCONV=1` — otherwise
> `/tmp/x.sql` is rewritten to a Windows path before Docker sees it, and psql
> reports `No such file or directory` for a file that is plainly there.

### The backup you actually need on a VPS

Aurora does continuous backup with point-in-time recovery; a container does
not. A nightly dump **off the machine**, and a restore proved once rather than
discovered during an incident:

```bash
docker exec mm-postgres pg_dump -U postgres -d mm_prod -Fc \
  | gzip > "mm_prod_$(date +%F).dump.gz"
```

That file is every secret in the product in one place. Encrypt it, and keep it
somewhere the application's own credentials cannot reach.

---

## 29 · Capsules — the thing the product is for

```bash
cd backend
npm run db:migrate      # 0016 adds app_open_capsule()
npm run test:e2e        # 208 tests, 14 suites
```

Until this step the schema had capsules, the policies guarded them and the
worker stood ready to deliver them. Nothing could create one. The delivery
engine was wired to an empty queue.

### The sender's side

```
POST   /vaults/:vaultId/capsules          a draft
PATCH  /capsules/:capsuleId               edit, while allowed
POST   /capsules/:capsuleId/recipients    returns the access token ONCE
DELETE /capsules/:capsuleId/recipients/:recipientId
POST   /capsules/:capsuleId/memories      attach, idempotent
POST   /capsules/:capsuleId/seal          the moment
POST   /capsules/:capsuleId/cancel        withdraw
GET    /vaults/:vaultId/capsules
GET    /capsules/:capsuleId
```

### Sealing and scheduling commit together

A capsule sealed without a job is a promise nothing will ever keep: it sits in
the table looking perfect and simply never arrives. Both writes are in one
transaction, so either the promise and its delivery both exist or neither
does.

Refused at seal, rather than discovered later:

| Refusal | Why here |
|---|---|
| no recipients → **400** | the worker throws on an empty list, which costs five days of day-scale backoff before anybody sees a Sev-0 — for a mistake visible the moment seal was pressed |
| unlock time in the past → **400** | a date that has already gone will never fire |
| already sealed → **409** | |
| not the owner → **403** | the UPDATE policy would refuse it silently, and "nothing happened" is a poor answer to "I sealed my capsule" |
| plan limits | `app_sealing_entitlement()`, which counts **concurrent obligations**, never lifetime usage |

> No subscription row means no limits are recorded, and the honest response is
> to allow it rather than invent a free-tier number here. Billing is not
> provisioned; when it is, this already enforces.

`milestone` without a resolved date and `manual` capsules seal but are **not**
enqueued — there is nothing to schedule them for yet. The response says
`scheduled: false` rather than leaving somebody to discover it by waiting.

### editable_until never outlives the unlock

```sql
editable_until = LEAST(now() + interval '15 minutes', COALESCE(unlock_at, 'infinity'))
```

`LEAST` is the whole point. A capsule unlocking in two minutes with a
fifteen-minute grace window would otherwise still be editable while the worker
was delivering it — the sender rewriting the message as it was being read.

Fifteen minutes is for "I spelled her name wrong", not for second thoughts. A
promise you may rewrite for a week is not a promise. **Cancelling stays
possible after sealing; editing does not**, and that distinction is the
product.

The freeze itself is `capsule_freeze()` from migration 0005, not a check in
the handler — so it holds for every writer, including a future admin tool or a
migration script. It raises `23514`, which `pg-errors.ts` turns into a 400.

### The recipient has no account, and that is the design

```
GET  /open/:token
POST /open/:token/reply
```

`@Public()`, deliberately. The person opening a capsule may have been eleven
when it was written, and may be reading it because the sender has died.
Requiring them to sign up first would put a registration form between a child
and a message from their mother.

**This is where the first implementation was wrong.** Every policy in the
schema resolves through `app_current_user()`, and a recipient has no actor —
so reading the capsule through the ordinary connection returned nothing.
Correctly. The tests caught it; migration 0016 adds `app_open_capsule()`,
SECURITY DEFINER, with the token as the entire credential:

- It refuses any capsule not already `delivered` or `opened`, so **a token
  that leaks years early opens nothing**. There is no window to read ahead.
- It records the opening in the same call that returns the content, so a read
  cannot forget to.
- `COALESCE` on both timestamps keeps the **first** opening. Overwriting on
  every refresh would replace "she opened it on her eighteenth birthday" with
  "she last looked at it on a Tuesday".

A bad token, an unknown token and an undelivered capsule all return the same
flat **404** — so the holder of a bad token learns nothing.

### The access token is shown once

Minted when the recipient is added, returned once, and only its SHA-256 ever
reaches the database — so a leaked backup does not hand over every sealed
message in the system. Reading the capsule back never returns it again, which
the tests assert.

> **Still open:** the worker does not yet put a link in the delivery message.
> `token_version` exists for exactly this — at delivery time it should mint a
> fresh token, store the new hash and send the raw one, so the credential
> lives only in the message. Today the sender receives it and shares it.

---

## 30 · Hosting on a shared VPS

The first server. Every command below was run on it, in this order, and the
mistakes we made are written in at the step where they happened — they are the
ones the next person will make too.

| | This deployment |
|---|---|
| Server | `srv1126059`, Ubuntu 24.04, 8 vCPU, 31 GB, **shared** with other applications |
| API | `https://api.72-61-173-62.sslip.io` |
| Admin console | `https://admin.72-61-173-62.sslip.io` |
| Code | `/srv/mandm/app`, owned by the `mandm` user |
| Processes | systemd: `mandm-api` · `mandm-worker` · `mandm-admin` |
| Database | its own container, `mandm-postgres`, on `127.0.0.1:5433`, database `mm_prod` |

**The rule the whole section follows: this server already runs other
applications, and nothing here may touch them.** No edited nginx site, no
replaced Node, no shared database, no shared port, no restart of anything that
is not ours.

| Run as | Commands |
|---|---|
| **root** | `systemctl`, `journalctl`, `nginx`, `certbot`, `docker`, `crontab`, anything under `/etc` |
| **mandm** | `git`, `npm`, `.env`, migrations, `npm run admin` |

`mandm` has no `sudo`. Get to it with `sudo -iu mandm`, back with `exit`, and
when unsure, `whoami`.

### 30.1 · Survey first, read-only

Nothing is installed until you know what is already there.

```bash
cat /etc/os-release | head -4; uname -m
nproc; free -h; df -h /
sudo ss -tlnp
systemctl is-active nginx apache2 httpd caddy; ls /etc/nginx/sites-enabled /etc/nginx/conf.d
docker --version; docker compose version; sudo docker ps --format '{{.Names}}\t{{.Ports}}'
which node && node -v; which pm2 && pm2 ls
systemctl is-active postgresql; which psql
sudo ufw status
which certbot && sudo certbot certificates | grep -E 'Certificate Name|Domains'
```

What it found, and what each finding decided:

| Found | Decision |
|---|---|
| PostgreSQL already on `127.0.0.1:5432` | M&M gets its own container on **5433**. The other cluster is never connected to |
| Port 3001 taken by another Next.js app (pm2) | API on **4100**, console on **4101** |
| System Node **v20**, used by pm2 apps | Node 24 through **nvm, for `mandm` only**. `/usr/bin/node` is never touched |
| pm2 running as root | Not used. M&M runs as systemd units under its own user |
| nginx owns 80/443 with two sites | **One new site file**. The existing ones are never edited |
| **`ufw` inactive** | Every M&M process binds `127.0.0.1`, so the only way in is through nginx |
| No domain bought | **sslip.io** — see 30.11 |

> `ufw` being off is why `HOST` exists (commit `2c2c6c6`). The API used to
> bind `0.0.0.0` unconditionally: on this server that would have published
> `:4100` to the internet beside nginx, and let a direct client forge the
> `X-Forwarded-For` that `trustProxy` believes. `HOST` defaults to `0.0.0.0`,
> so containers and laptops are unchanged.

### 30.2 · A user of its own, and Node 24 for it alone

```bash
adduser --system --group --home /srv/mandm --shell /bin/bash mandm
sudo -iu mandm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

**`--system` creates a bare home: no `~/.bashrc`, no `~/.profile`.** nvm's
installer reports *Profile not found* and loads nothing. Write both by hand —
`.bashrc` loads nvm, and `.profile` loads `.bashrc`, because `sudo -iu` opens a
*login* shell, which reads `.profile` and never `.bashrc`:

```bash
cat >> ~/.bashrc <<'EOF'
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
EOF
echo '[ -f ~/.bashrc ] && . ~/.bashrc' >> ~/.profile
source ~/.profile

nvm install 24.11.1
exit && sudo -iu mandm      # a fresh login proves it sticks
which node                  # /srv/mandm/.nvm/versions/node/v24.11.1/bin/node
exit
node -v                     # as root: still v20 — the pm2 apps are unaffected
```

> Without the `.profile` line, `which node` in a fresh session answered
> `/usr/bin/node` — v20 — and `npm ci` would have built against it.

The installer also warns that pm2 and corepack are installed globally under the
system Node. That is informational; nvm changed nothing there. **Do not run
`npm install -g npm@...`** — that is the npm the root pm2 apps use.

**Why `/srv/mandm` and not `/var/www`.** `/var/www` is for files nginx serves
from disk, and M&M serves none — nginx only proxies. Keeping the code outside
any nginx `root` means one careless `root /var/www;` in someone else's site can
never make `backend/.env` downloadable. It also keeps ownership apart: the
other apps are root's, M&M is `mandm`'s, and neither can modify the other.
Never under `/root` — that directory is mode 700, and `mandm` could not even
enter its own home.

### 30.3 · The database container

As root:

```bash
mkdir -p /srv/mandm/db && cd /srv/mandm/db
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" > .env
chmod 600 .env          # root only — mandm never sees the superuser password
```

`/srv/mandm/db/compose.yml`:

```yaml
name: mandm
services:
  db:
    image: postgres:17-alpine
    container_name: mandm-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: mm_prod
      POSTGRES_INITDB_ARGS: '--encoding=UTF8 --locale-provider=icu --icu-locale=en'
      LANG: en_US.utf8
    ports:
      - '127.0.0.1:5433:5432'      # loopback only, and not 5432
    volumes:
      - mandm-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres -d mm_prod']
      interval: 5s
      timeout: 5s
      retries: 10
volumes:
  mandm-pgdata:
    name: mandm-pgdata
```

```bash
docker compose up -d
docker compose ps              # healthy
ss -tlnp | grep 5433           # 127.0.0.1:5433 — never 0.0.0.0
```

Different from the repository's `docker-compose.yml` on purpose:

| | Repository file | Server file |
|---|---|---|
| Port | `5432:5432` | `127.0.0.1:5433:5432` |
| Password | `postgres` | random, in a root-only file |
| Databases | `mm_dev` + `mm_test` | `mm_prod` only — no init script |
| Names | `mm-*` | `mandm-*`, so nothing collides with other projects |

> **`'5432:5432'` would have failed here and been dangerous anywhere.** The
> port is taken, so the container would not start. On a server where it was
> free, it would be published on every interface — and Docker writes its own
> iptables rules, so even an active `ufw` does not block a published port.

### 30.4 · A read-only deploy key, and the clone

As **mandm**:

```bash
ssh-keygen -t ed25519 -C "srv1126059 mandm deploy" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

On GitHub: **Settings → Deploy keys → Add deploy key**, title
`srv1126059 (mandm)`, the `.pub` line, **"Allow write access" unchecked**. The
server reads the repository and never pushes to it.

```bash
ssh -T git@github.com
# accept only if the ED25519 fingerprint is exactly
#   SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU
# expected: Hi NFCSolutionsIndia/MandM! You've successfully authenticated...
cd ~
git clone git@github.com:NFCSolutionsIndia/MandM.git app
```

> **The key was first generated as root**, into `/root/.ssh`. Root had no key
> of its own — `ssh-keygen` would have asked *Overwrite (y/n)?* — so nothing
> was replaced, and the key was moved rather than regenerated, which kept the
> GitHub entry valid:
> ```bash
> install -d -m 700 -o mandm -g mandm /srv/mandm/.ssh
> mv /root/.ssh/id_ed25519 /root/.ssh/id_ed25519.pub /srv/mandm/.ssh/
> chown mandm:mandm /srv/mandm/.ssh/id_ed25519*
> chmod 600 /srv/mandm/.ssh/id_ed25519
> ```
> If `ssh-keygen` ever asks to overwrite on a shared server, answer **n**:
> another application may be pulling with that key.

### 30.5 · Build

As **mandm**, after confirming `which node` is the nvm one:

```bash
cd ~/app/backend && npm ci && npm run build
ls dist/main.js dist/worker.main.js
```

### 30.6 · Migrations, without the superuser password in a file

The migrations need the `postgres` password, which lives only in
`/srv/mandm/db/.env` and is readable only by root. Read it as root
(`cat /srv/mandm/db/.env`, the value after `=`), then as **mandm**:

```bash
cd ~/app/backend
read -rs PGPW && MIGRATION_DATABASE_URL="postgres://postgres:$PGPW@127.0.0.1:5433/mm_prod" npm run db:migrate; unset PGPW
```

`read -rs` waits silently on an empty line — paste, Enter. The password is in
no file, no history, and gone the moment the command returns. This is the
pattern for every owner-credential command on the server.

drizzle-kit printed **no success line** here. Check the database, as root:

```bash
docker exec mandm-postgres psql -U postgres -d mm_prod -c "SELECT count(*) FROM drizzle.__drizzle_migrations;"   # one per migration file
docker exec mandm-postgres psql -U postgres -d mm_prod -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public';"   # 40
docker exec mandm-postgres psql -U postgres -d mm_prod -c "\du mm_*"   # three roles, Cannot login
```

### 30.7 · Give the three roles a login

As root, generate three passwords and keep them in a private note — they are
needed again in 30.8:

```bash
for r in APP WORKER ADMIN; do echo "${r}_PW=$(openssl rand -hex 24)"; done
docker exec -it mandm-postgres psql -U postgres -d mm_prod
```

```sql
ALTER ROLE mm_app LOGIN;     \password mm_app
ALTER ROLE mm_worker LOGIN;  \password mm_worker
ALTER ROLE mm_admin LOGIN;   \password mm_admin
\du mm_*
\q
```

Paste only the value after `APP_PW=`, twice per prompt. `\password` keeps it
out of history; `ALTER ROLE ... PASSWORD '...'` would not. Hex, so the values go
into a URL without escaping.

**Test from the host, not through `docker exec`:**

```bash
psql -h 127.0.0.1 -p 5433 -U mm_app    -d mm_prod -c "SELECT current_user;"
psql -h 127.0.0.1 -p 5433 -U mm_worker -d mm_prod -c "SELECT current_user;"
psql -h 127.0.0.1 -p 5433 -U mm_admin  -d mm_prod -c "SELECT current_user;"
```

> **`docker exec ... psql -h 127.0.0.1` proves nothing** — it never asked for a
> password. The image's `pg_hba.conf` trusts `local`, `127.0.0.1/32` and
> `::1/128` *inside the container*. Connections through the published port
> arrive from Docker's bridge address and hit the final
> `host all all all scram-sha-256`, which is what the services use. Only a
> test from the host exercises the password.

### 30.8 · The server's `.env`

As **mandm**, `nano ~/app/backend/.env`:

```bash
NODE_ENV=production
HOST=127.0.0.1
PORT=4100

DATABASE_URL=postgres://mm_app:<APP_PW>@127.0.0.1:5433/mm_prod
WORKER_DATABASE_URL=postgres://mm_worker:<WORKER_PW>@127.0.0.1:5433/mm_prod
ADMIN_DATABASE_URL=postgres://mm_admin:<ADMIN_PW>@127.0.0.1:5433/mm_prod
ADMIN_ENCRYPTION_KEY=<openssl rand -base64 32 — new for this server>

MAIL_FROM=...
SMTP_HOST=...
SMTP_PORT=...
SMTP_USERNAME=...
SMTP_PASSWORD=...

R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=...
R2_ENDPOINT=...
```

```bash
chmod 600 .env
ls -l .env      # -rw------- mandm mandm
```

**`ADMIN_ENCRYPTION_KEY` needs a copy off the server.** It encrypts every
admin's authenticator secret; lose it and every admin re-enrols.

**Never on a server:** `MIGRATION_DATABASE_URL` (30.6 is how migrations get
it), any `TEST_*` URL (the suite deletes every row), `ENABLE_SSL` (nothing
reads it — TLS is derived from `SMTP_PORT`).

Verify without printing a secret — these outputs are safe to share:

```bash
grep -E '^(NODE_ENV|HOST|PORT)=' .env
sed -nE 's#^([A-Z_]*DATABASE_URL)=postgres://([^:]+):[^@]*@(.*)#\1  user=\2  @\3#p' .env
grep -E '^(TEST_|ENABLE_SSL|MIGRATION_)' .env || echo "none left"
psql "$(grep '^ADMIN_DATABASE_URL=' .env | cut -d= -f2-)" -c "SELECT current_user;"
```

Every URL must end `@127.0.0.1:5433/mm_prod`.

> **Three things went wrong in this file, in order:**
> 1. It was created from a root shell, so `chmod` as `mandm` failed with
>    *Operation not permitted*. Fixed as root with `chown mandm:mandm` and
>    `chmod 600`. Afterwards,
>    `find /srv/mandm -not -user mandm -not -path '/srv/mandm/db*'` should
>    print nothing.
> 2. The whole laptop `.env` was pasted in: `NODE_ENV=development`, `TEST_*`
>    URLs, no `HOST`. Rewritten from the template above.
> 3. **`ADMIN_DATABASE_URL` kept port `5432`** — the *other* application's
>    PostgreSQL. It has no `mm_admin`, and PostgreSQL reports a missing role as
>    `password authentication failed` so usernames cannot be probed. Sign-in
>    succeeded (it does not use that pool), then `/auth/me` failed and the
>    console bounced straight back to `/login`. The `.env` was corrected, but
>    **the running API still held the old value** — it reads `.env` once, at
>    start. `systemctl restart mandm-api` fixed it.
>
> `/health/ready` was green throughout, because it checks only the `mm_app`
> pool. A readiness check that covers every configured pool is on the list.

### 30.9 · The API and the worker, as services

As root:

```bash
cat > /etc/systemd/system/mandm-api.service <<'EOF'
[Unit]
Description=M&M API
After=network-online.target docker.service
Wants=network-online.target

[Service]
User=mandm
WorkingDirectory=/srv/mandm/app/backend
ExecStart=/srv/mandm/.nvm/versions/node/v24.11.1/bin/node dist/main.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/mandm-worker.service <<'EOF'
[Unit]
Description=M&M delivery worker
After=network-online.target docker.service mandm-api.service
Wants=network-online.target

[Service]
User=mandm
WorkingDirectory=/srv/mandm/app/backend
ExecStart=/srv/mandm/.nvm/versions/node/v24.11.1/bin/node dist/worker.main.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=60

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now mandm-api mandm-worker
```

`ExecStart` names the nvm binary by absolute path, so the services depend on no
shell startup file. The worker's longer stop timeout lets an in-flight send be
recorded before exit.

```bash
journalctl -u mandm-api -n 30 --no-pager      # "SMTP credentials accepted", no ERROR
journalctl -u mandm-worker -n 30 --no-pager   # "Delivery engine started as srv1126059:<pid>"
curl -s 127.0.0.1:4100/health/ready           # "role":"mm_app","rlsEnforced":true
ss -tlnp | grep -E ':4100|:5433'              # 127.0.0.1 only
pm2 ls                                        # the other apps, still online
```

`journalctl` must run as root — as `mandm` it reports *insufficient
permissions*. Do not add `mandm` to `systemd-journal`: that group reads every
service's logs on the machine.

### 30.10 · The admin console

As **mandm**:

```bash
cd ~/app/admin
echo "MM_API_URL=http://127.0.0.1:4100" > .env.local
npm ci && npm run build
```

The console calls the API server-side over loopback; the browser never talks
to the API. As root:

```bash
cat > /etc/systemd/system/mandm-admin.service <<'EOF'
[Unit]
Description=M&M admin console
After=network-online.target mandm-api.service

[Service]
User=mandm
WorkingDirectory=/srv/mandm/app/admin
Environment=NODE_ENV=production
ExecStart=/srv/mandm/.nvm/versions/node/v24.11.1/bin/node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 4101
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload && systemctl enable --now mandm-admin
curl -sI 127.0.0.1:4101/ | head -3     # 307, location: /login
```

Three processes, because they are three programs: `backend/` serves JSON —
including every `/api/v1/admin/...` route — the worker has no port at all, and
`admin/` is a Next.js application that renders the console's pages. The same
split as any backend/frontend pair on the server.

### 30.11 · nginx, and HTTPS without a domain

**Why sslip.io rather than `http://<ip>/admin`.** Serving on a bare IP fails
three ways: the console's cookies are `Secure` in production and browsers drop
them over plain HTTP, so sign-in cannot work; Next.js under `/admin` needs a
`basePath` and five hard-coded paths fixed; and iOS and Android refuse
cleartext API calls by default. `api.<ip-with-dashes>.sslip.io` resolves to the
IP with no purchase and no DNS setup, so it gets a real Let's Encrypt
certificate, a `server_name` nothing else matches, and no code change. Buying a
domain later changes two names.

As root:

```bash
IPD=$(curl -s -4 ifconfig.me | tr . -)
getent hosts api.$IPD.sslip.io admin.$IPD.sslip.io      # both → the server's IP

cat > /etc/nginx/sites-available/mandm <<'EOF'
# M&M. Matches only these two names, so no existing site can be affected.

server {
    listen 80;
    server_name api.IPDASH.sslip.io;

    # Media goes straight to R2 via signed URLs; API bodies are small JSON.
    client_max_body_size 2m;

    # The console reaches its API over 127.0.0.1. Nobody on the internet
    # has a reason to call it directly.
    location /api/v1/admin/ { return 404; }

    location / {
        proxy_pass http://127.0.0.1:4100;
        proxy_set_header Host $host;
        # Overwrite, never append: the API trusts this for audit IPs.
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name admin.IPDASH.sslip.io;

    location / {
        proxy_pass http://127.0.0.1:4101;
        # Next.js checks every form post's Origin against Host.
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
EOF

sed -i "s/IPDASH/$IPD/g" /etc/nginx/sites-available/mandm
ln -s /etc/nginx/sites-available/mandm /etc/nginx/sites-enabled/mandm
nginx -t && systemctl reload nginx
certbot --nginx -d api.$IPD.sslip.io -d admin.$IPD.sslip.io --redirect
```

The file is written with a placeholder and `sed` fills in the IP, because an
unquoted heredoc would also have expanded nginx's own `$host` and
`$remote_addr` to nothing.

Two lines worth defending in review:

- **`X-Forwarded-For $remote_addr`, not `$proxy_add_x_forwarded_for`.** The API
  runs with `trustProxy: true`. Appending keeps whatever the client sent as the
  leftmost address, and the audit trail would record an IP the client chose.
- **`/api/v1/admin/` returns 404 on the public name.** The console never uses
  it from outside, so it is attack surface with no user.

**`reload`, never `restart`** — the other sites keep serving, and a failed
`nginx -t` applies nothing. certbot edits only the server blocks whose names it
was given, and renews on the timer that already renews the server's existing
certificate.

> sslip.io is shared with everybody who uses it, so Let's Encrypt can refuse
> with *too many certificates already issued*. It did not here.

Verify, from the outside in:

```bash
curl -s https://api.$IPD.sslip.io/health/ready                                   # role mm_app
curl -sI https://api.$IPD.sslip.io/api/v1/admin/v1/auth/me | head -1             # 404
curl -sI http://admin.$IPD.sslip.io/ | head -1                                    # 301 → https
curl -sI https://ai.nfcsolutionsusa.com | head -1                                 # the other site, unchanged
```

### 30.12 · Console access

`grant` refuses a role that does not exist, and on this server none did — the
`support` role had only ever been inserted by hand on a laptop. Migration
`0017_support_role` now creates it everywhere (commit `3f9905c`). After
pulling it, as **mandm**:

```bash
cd ~/app && git pull && cd backend
read -rs PGPW && MIGRATION_DATABASE_URL="postgres://postgres:$PGPW@127.0.0.1:5433/mm_prod" npm run db:migrate; unset PGPW
read -rs PGPW && MIGRATION_DATABASE_URL="postgres://postgres:$PGPW@127.0.0.1:5433/mm_prod" npm run admin -- grant someone@nfcsolutionsusa.com; unset PGPW
read -rs PGPW && MIGRATION_DATABASE_URL="postgres://postgres:$PGPW@127.0.0.1:5433/mm_prod" npm run admin -- list; unset PGPW
```

Then sign in at `https://admin.<ip>.sslip.io`: email code, authenticator
enrolment the first time, TOTP, dashboard. Two staff accounts are active and
enrolled on this server.

### 30.13 · Nightly backup

As root:

```bash
mkdir -p /srv/mandm/backups && chmod 700 /srv/mandm/backups
crontab -l          # read what is there first — add, never replace
crontab -e
```

Append:

```cron
30 2 * * * docker exec mandm-postgres pg_dump -U postgres -d mm_prod -Fc | gzip > /srv/mandm/backups/mm_prod_$(date +\%F).dump.gz && find /srv/mandm/backups -name '*.dump.gz' -mtime +14 -delete
```

Run it once by hand and check the file appears. Fourteen days on the same disk
is **not** a backup against losing the server — a copy off the machine is the
next step (section 28).

### 30.14 · Deploying a change, by hand

**Superseded by section 31**, which deploys every push to `main`. Kept because
it was how the first releases went out, and because it is the procedure to fall
back on if CD is ever switched off:

```bash
# as mandm
cd ~/app && git pull
cd backend && npm ci && npm run build
# only if the pull brought a migration:
read -rs PGPW && MIGRATION_DATABASE_URL="postgres://postgres:$PGPW@127.0.0.1:5433/mm_prod" npm run db:migrate; unset PGPW
cd ../admin && npm ci && npm run build

# as root
systemctl restart mandm-api mandm-worker mandm-admin
curl -s 127.0.0.1:4100/health/ready
```

A changed `.env` needs the restart too — it is read once, at start.

### 30.15 · Removing all of it

Nothing above modified anything that existed before, so removal is clean. As
root:

```bash
rm /etc/nginx/sites-enabled/mandm && nginx -t && systemctl reload nginx
systemctl disable --now mandm-admin mandm-worker mandm-api
rm /etc/systemd/system/mandm-*.service && systemctl daemon-reload
cd /srv/mandm/db && docker compose down        # add -v only to DELETE the data
certbot delete --cert-name api.<ip>.sslip.io
```

Then delete the deploy key on GitHub.

### Not done yet

| | |
|---|---|
| Off-site backups | The nightly dump stays on this disk |
| A domain | Two names change, in nginx and certbot |

CD and the all-pools readiness check are section 31.

---

## 31 · Deploying on every push to main

A push to `main` runs CI; if both jobs pass, the **Deploy** job asks the server
to deploy that commit. The server does the rest itself.

```
push → CI (backend · admin) → Deploy job ──ssh, sends only the sha──► mandm-deploy
                                                                        │
   fetch · refuse anything not on main · extract a fresh tree ◄─────────┘
   npm ci + build, backend and console   (the old release keeps serving)
   migrate, as postgres, with a password GitHub never sees
   switch /srv/mandm/current · restart the three units
   /health/ready + console + worker ── fail ──► switch back · restart
```

### What makes it safe to hand to a robot

| | |
|---|---|
| **The key can run one thing** | In `authorized_keys` it is pinned to `/usr/local/bin/mandm-deploy` with `restrict`: no shell, no file copy, no port forwarding. A stolen key can deploy a commit that is already on `main`, and nothing else |
| **That one thing is root-owned, outside the repo** | A commit can change *what* is deployed, never *what the key may do* |
| **Only `main` goes live** | The script refuses any sha that is not an ancestor of `origin/main`, whatever the caller sends |
| **The superuser password stays on the server** | `mandm-migrate` reads it as root from `/srv/mandm/db/.env` and runs the migration code as `mandm`. It travels in the environment, never in arguments — `ps` shows every user's arguments |
| **`mandm`'s sudo is two commands long** | Run `mandm-migrate` on a release, restart its own three units. Not another service, not a shell |
| **The server's host key is pinned in GitHub** | A host that impersonates the server is refused, rather than handed a deploy |
| **Releases, not in-place builds** | Each commit builds in `/srv/mandm/releases/<sha>` while the previous one serves. The switch is an atomic symlink rename |
| **Automatic rollback** | Readiness now checks **every** configured pool, each as its own role, and answers 503 otherwise. Failing that, the console or the worker puts the previous release back |
| **One at a time** | A lock on the server, and a GitHub concurrency group that queues deploys rather than cancelling one halfway |

> **Rollback restores code, never the database.** The migrations have already
> run when the health check decides. Every migration must therefore leave the
> schema usable by the *previous* release: add a column in one deploy, use it in
> the next; stop using one, drop it later. A migration that breaks the old code
> turns rollback into a second outage.

### The layout after this section

```
/srv/mandm/
├── repo/                 the git clone — fetched from, never run from (was app/)
├── releases/<sha>/       one built tree per deploy; the newest five are kept
├── current → releases/…  the live release; systemd resolves it at each start
├── shared/
│   ├── backend.env       the .env from 30.8, linked into every release
│   └── admin.env.local
├── logs/deploy.log
├── db/                   root only, as before
└── backups/              root only, as before
```

The repository carries everything the server needs, in `deploy/`:

| File | Installed as |
|---|---|
| `deploy/ssh-entry.sh` | `/usr/local/bin/mandm-deploy`, root, 755 |
| `deploy/migrate.sh` | `/usr/local/sbin/mandm-migrate`, root, 755 |
| `deploy/sudoers` | `/etc/sudoers.d/mandm-deploy`, root, 440 |
| `deploy/systemd/*.service` | `/etc/systemd/system/`, pointing at `/srv/mandm/current` |
| `deploy/deploy.sh` | not installed — runs from inside each release |

### 31.1 · Install the server side

The first three files are copied by root because they decide what the key and
`mandm` may do. **A change to any of them in the repository does nothing until
it is installed again by hand** — that is the point.

```bash
# as mandm — fetch the commit that adds deploy/
cd ~/app && git pull
exit

# as root
install -m 755 -o root -g root /srv/mandm/app/deploy/ssh-entry.sh /usr/local/bin/mandm-deploy
install -m 755 -o root -g root /srv/mandm/app/deploy/migrate.sh   /usr/local/sbin/mandm-migrate
install -m 440 -o root -g root /srv/mandm/app/deploy/sudoers      /etc/sudoers.d/mandm-deploy
visudo -cf /etc/sudoers.d/mandm-deploy && visudo -c
sudo -l -U mandm          # exactly the two commands, NOPASSWD
```

`visudo -c` matters: a sudoers file with a syntax error can lock **every** user
out of `sudo` on the machine.

### 31.2 · Move to the release layout

```bash
# as root
install -d -m 700 -o mandm -g mandm /srv/mandm/shared /srv/mandm/releases /srv/mandm/logs
install -m 600 -o mandm -g mandm /srv/mandm/app/backend/.env      /srv/mandm/shared/backend.env
install -m 600 -o mandm -g mandm /srv/mandm/app/admin/.env.local  /srv/mandm/shared/admin.env.local

mv /srv/mandm/app /srv/mandm/repo
install -m 644 /srv/mandm/repo/deploy/systemd/mandm-*.service /etc/systemd/system/
systemctl daemon-reload
```

The running services do not notice the rename — a process holds its directory,
not its path — but they cannot be *restarted* until `current` exists, so go
straight on to the first deploy.

### 31.3 · The first deploy, by hand, through the same door

```bash
sudo -iu mandm
SSH_ORIGINAL_COMMAND=$(git -C ~/repo rev-parse origin/main) /usr/local/bin/mandm-deploy
```

The same script the key will run, with the same input, so a success here is a
success for Actions too. Two or three minutes; it ends `=== live: <sha>`.

```bash
readlink /srv/mandm/current                        # /srv/mandm/releases/<sha>
curl -s 127.0.0.1:4100/health/ready; echo          # "connections":{"admin":{...mm_admin},"worker":{...mm_worker}}
exit

# as root — the old working tree held a copy of every secret
rm /srv/mandm/repo/backend/.env /srv/mandm/repo/admin/.env.local
rm -rf /srv/mandm/repo/backend/node_modules /srv/mandm/repo/backend/dist \
       /srv/mandm/repo/admin/node_modules /srv/mandm/repo/admin/.next
```

From here, owner-credential commands run from the live release:
`cd /srv/mandm/current/backend` instead of `~/app/backend` (30.12).

### 31.4 · The key GitHub uses

As root:

```bash
ssh-keygen -t ed25519 -f /root/mandm-actions -N "" -C "github-actions mandm deploy"

echo "command=\"/usr/local/bin/mandm-deploy\",restrict $(cat /root/mandm-actions.pub)" \
  >> /srv/mandm/.ssh/authorized_keys
chown mandm:mandm /srv/mandm/.ssh/authorized_keys
chmod 600 /srv/mandm/.ssh/authorized_keys
```

Prove the key can do nothing but deploy:

```bash
ssh -i /root/mandm-actions -o IdentitiesOnly=yes mandm@127.0.0.1 'id'
# mandm-deploy: expected a 40-character commit sha       ← not the output of id
```

The first connection asks to trust `127.0.0.1` — that is this machine, answer
`yes`. If it is refused instead, see the table at the end.

The server's host key, for GitHub to pin:

```bash
awk -v h=72.61.173.62 '{print h, $1, $2}' /etc/ssh/ssh_host_ed25519_key.pub
```

### 31.5 · GitHub

Repository → **Settings → Secrets and variables → Actions**.

| Kind | Name | Value |
|---|---|---|
| Secret | `DEPLOY_HOST` | `72.61.173.62` |
| Secret | `DEPLOY_SSH_KEY` | `cat /root/mandm-actions` — the whole private key, `BEGIN` and `END` lines included |
| Secret | `DEPLOY_KNOWN_HOSTS` | the `awk` line from 31.4 |
| **Variable** | `DEPLOY_ENABLED` | `true` |

Then remove the private key from the server — GitHub holds the only copy:

```bash
shred -u /root/mandm-actions
```

`DEPLOY_ENABLED` is the switch. Anything but `true` and the Deploy job is
*skipped*, not failed — the way to pause deploys during maintenance.

### 31.6 · Prove it

Push any commit to `main`. In **Actions**, the run shows Backend, Admin
console, then Deploy. On the server, as root:

```bash
tail -f /srv/mandm/logs/deploy.log
```

### When something goes wrong

| Symptom | Cause |
|---|---|
| Deploy job **skipped** | `DEPLOY_ENABLED` is not `true`, or it was not a push to `main` |
| `Host key verification failed` | `DEPLOY_KNOWN_HOSTS` is wrong, or the server was rebuilt |
| `Permission denied (publickey)` | Key mismatch — or sshd refuses `mandm`: check `sshd -T \| grep -iE '^(allowusers\|allowgroups)'` and `passwd -S mandm` (a status of `L`, locked, can block key logins; `usermod -p '*' mandm` unlocks without giving it a password) |
| `another deploy is running` | Exit 75. The previous deploy holds the lock; re-run the job when it finishes |
| `is not on origin/main, refusing` | Exit 3. The sha was not pushed to `main` |
| `sudo: a password is required` | `/etc/sudoers.d/mandm-deploy` missing or not the installed version |
| `failed verification`, then `rolled back` | The new release did not come up; the old one is serving. `journalctl -u mandm-api -n 50` says why |
| `ROLLBACK FAILED TOO` | Usually a migration the previous release cannot run against. Needs a person |

To revoke the key: delete its line from `/srv/mandm/.ssh/authorized_keys`. To
pause: set `DEPLOY_ENABLED` to anything else.

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
| `HOST` | no | defaults to `0.0.0.0`, which a container needs. **`127.0.0.1` on a VPS**, so only nginx can reach the process |
| `DATABASE_URL` | **yes** | **`mm_app`, never `postgres`.** PostgreSQL bypasses RLS for a superuser and for a table's owner, so the wrong role here disables every policy with no error |
| `MIGRATION_DATABASE_URL` | no | the owner, drizzle-kit only. Omitted on an API task on purpose |
| `DB_POOL_MAX` | no | 10. What reaches the database is `containers × this` |
| `DB_STATEMENT_TIMEOUT_MS` | no | 5000, enforced server-side |
| `DB_IDLE_TX_TIMEOUT_MS` | no | 10000, enforced server-side |
| `TEST_DATABASE_URL` | tests only | must name `mm_test` |
| `TEST_MIGRATION_DATABASE_URL` | tests only | must name `mm_test` |
| `ADMIN_DATABASE_URL` | no | the console, as `mm_admin`. Absent on an API-only deployment |
| `ADMIN_ENCRYPTION_KEY` | console only | 32 bytes base64, for the TOTP secrets. **Held outside the database** |
| `TEST_ADMIN_DATABASE_URL` | tests only | must name `mm_test` |
| `WORKER_DATABASE_URL` | worker only | the delivery engine, as `mm_worker` |
| `WORKER_LEASE_SECONDS` | no | 300. How long a claimed job is leased |
| `WORKER_BATCH_SIZE` | no | 25. Jobs per tick |
| `WORKER_IDLE_SECONDS` | no | 5. Sleep when the queue came back empty |
| `TEST_WORKER_DATABASE_URL` | tests only | must name `mm_test` |

### Providers

| Variable | Required | Notes |
|---|---|---|
| `SMTP_HOST` · `SMTP_PORT` · `SMTP_USERNAME` · `SMTP_PASSWORD` | no (dev) | **Tried first.** Any provider: ZeptoMail, SES, Postmark. `SMTP_PORT` defaults to 587 |
| `SMTP_SECURE` | no | Implicit TLS from the first byte. Derived from the port (`true` for 465); otherwise STARTTLS, and the connection aborts rather than falling back to plaintext |
| `RESEND_API_KEY` | no (dev) | The HTTP alternative, used only when `SMTP_HOST` is unset |
| **neither of the above** | — | Codes print to the terminal in development. **In production this is a hard refusal**, not a degraded mode |
| `MAIL_FROM` | no | Must be a domain verified with the provider, and must match the account the SMTP credentials belong to |
| `R2_ACCOUNT_ID` · `R2_ACCESS_KEY_ID` · `R2_SECRET_ACCESS_KEY` · `R2_BUCKET` | upload only | Cloudflare R2. The token should be scoped **Object Read & Write on that bucket alone** |
| `R2_ENDPOINT` | no | For anything S3-compatible that is not R2 — MinIO locally, or S3 later. Derived from the account id when absent |
| `MEDIA_URL_TTL_SECONDS` | no | **300, and a security parameter.** It is the bound on how long a revoked share can still be opened. Ceiling 900 |
| `UPLOAD_TTL_SECONDS` | no | 86400 |

> **The bucket stays private.** Media is served by short-lived signed URLs,
> never by a public bucket or a public `r2.dev` URL. A public URL cannot be
> revoked, and "revocation is immediate" is a claim this product makes.

**`admin/.env.local`** holds one variable, and it is not committed either:

```bash
# Where the admin console finds the API. NOT NEXT_PUBLIC_ — that prefix would
# inline it into the client bundle. Defaults to http://127.0.0.1:3000.
MM_API_URL=http://127.0.0.1:3000
```

**`src/config/env.schema.ts` is authoritative.** If a variable is not declared
there, no code may read it — which is what keeps this table from quietly
becoming a stale guess. A missing or malformed value aborts the boot and names
every problem at once, rather than surfacing hours later inside a request.

**On a VPS** this is a file, `chmod 600`, owned by the service user, and
without `MIGRATION_DATABASE_URL` or any `TEST_*` URL — see section 30.8.
**On AWS, later,** none of it is a file: values come from Secrets Manager and
the API task is given only `DATABASE_URL`. See [Server notes](#server-notes).

---

## Server notes

The deployment path is **local → VPS → AWS at roughly 10,000 users**. The
architecture document specifies AWS end to end; that is still the
destination, but it is not the first stop, so this section covers both.

### On a VPS

**Section 30 is the runbook**, every command as it was run on the first server.
This table is the summary.

| Concern | On a VPS |
|---|---|
| Secrets | A `.env` file owned by the service user, `chmod 600`. There is no Secrets Manager |
| Database | PostgreSQL 17 as a container or a package. Not Aurora — so **take your own backups**, because nothing else will |
| Processes | `docker compose` or systemd units: one for the API, one for the worker. Not ECS tasks |
| TLS and routing | Caddy or nginx in front. Not an ALB |
| The four roles | Exactly as on a developer machine: `mm_app`, `mm_worker`, `mm_admin` each granted `LOGIN` and a password by hand. The migrations deliberately do not do this |

What does **not** change: the migration pipeline, the Fastify adapter, the
environment schema, every row-level security policy, and the rule that the
API container holds only `DATABASE_URL`.

> **The thing a VPS makes your problem:** backups. Aurora does continuous
> backup with point-in-time recovery; a container does not. A nightly
> `pg_dump` off the machine is the minimum, and it is worth proving a
> restore once rather than discovering the gap during an incident.

### On AWS, later

The steps above describe a **developer machine**. The AWS target differs in four ways:

1. **Credentials.** `postgres/postgres` and `mm_app/mm_app` are local-only. A
   server reads both URLs from the environment, backed by AWS Secrets Manager
   (ADR-019), and the API task is given **only `DATABASE_URL`** — the `mm_app`
   one. A container serving requests must not hold a credential that can `DROP`
   a table.
2. **The database.** Production is Aurora PostgreSQL Serverless v2, not this
   container. `docker-compose.yml` is for development and CI only.
3. **Migrations run as their own task**, before the new version starts serving —
   not from inside the API container, which has no owner credential. `mm_app`, `mm_worker` and
   `mm_admin` are created with `NOLOGIN` by migrations `0002` and `0011`;
   granting each `LOGIN` and a password is a per-environment step the
   migrations deliberately do not perform.
4. **Process management.** `start:dev` is a watcher. A server runs
   `npm run build` then **`node dist/main.js`** — the `.js` matters, since the
   project is ESM and extensionless paths do not resolve. Under ECS Fargate,
   SIGTERM reaches `enableShutdownHooks()` and the pool drains.

**Health checks.** Point the load balancer at `/health/ready`, not `/health`.
The first proves the database is reachable; the second only proves the process
is alive, which would keep a container in rotation while every request it serves
fails. `role` in that response must read `mm_app` — `postgres` means row-level
security is being bypassed.

**CI** — `.github/workflows/ci.yml`, on every push and pull request — runs
`npm run typecheck`, `npm run lint`, `npm test`, and `npm run test:e2e`, and
builds the console. It creates `mm_app`, `mm_worker` and `mm_admin` with a
login *before* the suite migrates (the migrations skip roles that exist) and
generates a throwaway `ADMIN_ENCRYPTION_KEY` per run. The last needs a PostgreSQL service container and the two
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
| 16 | governance | admin_users · roles · permissions · audit_logs · break_glass_access · reports · moderation_flags · blocks · feature_flags — **done** |

**38 tables for Release 1.** Built in dependency order because foreign keys demand
it — everything references `users`, and `vault_members` needs `vaults`. One domain
per step, each reviewed and applied before the next.
