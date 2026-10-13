# Setup — from an empty machine to a running backend

Every step taken to build this project from nothing, in order, with the reasoning
kept short. Follow it top to bottom on a new machine or a server and you get an
identical environment.

**Status:** steps 1–10 complete. The service runs, connects as `mm_app` and is tested.
Step 11 onward continues the schema, domain by domain.

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

A `WITH CHECK` clause **raises**. A `USING` clause **filters** — the rows simply
are not visible to the statement, so the statement succeeds having changed
nothing. That is correct PostgreSQL behaviour and it is a trap:

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
| 11 | people | members · events · event_members · event_reminders · memory_members |
| 12 | archive | memories · media_assets · albums · album_memories · upload_sessions |
| 13 | promises | capsules · capsule_recipients · capsule_memories · capsule_replies · delivery_attempts · scheduled_jobs |
| 14 | sharing | shares · notifications · notification_preferences |
| 15 | billing | subscriptions · payments · subscription_channels · subscription_ai_features |
| 16 | governance | admin_users · roles · permissions · audit_logs · break_glass_access · reports · moderation_flags · blocks · feature_flags |

**38 tables for Release 1.** Built in dependency order because foreign keys demand
it — everything references `users`, and `vault_members` needs `vaults`. One domain
per step, each reviewed and applied before the next.
