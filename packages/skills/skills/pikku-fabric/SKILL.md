---
name: pikku-fabric
description: 'Build, convert and debug apps on the Pikku Fabric platform. Covers SQLite/libSQL database setup with Kysely, fabric project layout, deploy provider config, `fabric.config.json`, the pikku-verify workflow, and reading logs, traces and metrics from a deployed stage. TRIGGER when: user is working on a Fabric-hosted Pikku project, converting an app to Fabric format, asking about Fabric deployment, database or project conventions, asking about a `pikku fabric validate` finding including app-missing-actor-quick-login, or a deployed stage is erroring, timing out or behaving differently than local ("why is prod failing", "check the logs"). DO NOT TRIGGER when: user is working on a generic (non-Fabric) Pikku deployment — use pikku-deploy instead — or the failure reproduces locally, which is where to debug it.'
installGroups: [fabric]
---

# Pikku Fabric

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. **Run structural validation first.** Before any edit, run:
   ```bash
   pikku fabric validate --json
   ```
   This prints every missing file, misconfigured field, and dependency gap with a `fixHint`. Address all `error` findings before proceeding — they block deploy. Resolve `warn` findings before testing — they cause runtime failures. `info` findings are best-practice gaps that are safe to defer.
2. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
3. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
4. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
5. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
6. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

Fabric is a serverless deployment platform for Pikku apps. Every Fabric app runs on Cloudflare Workers with a SQLite database (via libSQL/Turso). This skill covers what's unique to Fabric. For general Pikku concepts, function authoring, HTTP wiring, and more, see `pikku-concepts`, `pikku-wiring`, `pikku-services`, etc.

## Before you start

Always run project discovery first:

```bash
yarn pikku meta context --json
```

Call the `pikku-meta` tool before grepping or editing a Fabric app.

- Use `section: "context"` for the project map: functions, wires, workflows, capabilities, and source files.
- Use `section: "clients"` before frontend/RPC work.
- Use `section: "functions"` to list function ids, then `section: "function", id: "<functionId>"` for one function.
- Use `section: "schemas"` to list schema names. Only request full JSON Schema bodies with `schemas: ["SchemaName"]` for the specific schemas needed.

Do not load every schema body by default; that wastes context and usually makes the model worse.

For database work:

- Use `pikku-db` for the actual attached Fabric database state: tables, columns, foreign keys, and applied migrations.
- Use `pikku-meta` `section: "schemas"` for code-level JSON Schema contracts, not database introspection.
- Do not inspect database credentials or connect to the database directly; Fabric Control already exposes the safe introspection surface.

## Database: SQLite via libSQL

Fabric apps use SQLite, accessed via Kysely with the libSQL HTTP adapter. NOT PostgreSQL, NOT D1.

### Setup in `services.ts`

```typescript
import { Kysely, CamelCasePlugin } from 'kysely'
import { LibsqlWebDialect } from '@pikku/kysely-sqlite'
import type { DB } from '#pikku/db/schema.gen.js'

const databaseUrl = await variables.get('DATABASE_URL')
let kysely: Kysely<DB>
if (databaseUrl) {
  kysely = new Kysely<DB>({
    dialect: new LibsqlWebDialect({ url: databaseUrl }),
    plugins: [new CamelCasePlugin()],
  })
} else if (existingServices?.kysely) {
  kysely = existingServices.kysely as Kysely<DB>
} else {
  throw new Error('kysely not provided and DATABASE_URL is unset')
}
```

Fabric injects `DATABASE_URL` as a variable binding when the stage starts. In local dev, `pikku db migrate` uses a local `dev.db` SQLite file.

### Migrations

Migrations are plain `.sql` files at the **project root**, in a directory named
for the engine — `db/sqlite/` for SQLite/libSQL stages, `db/postgres/` for
Postgres ones. Never `db/migrations/`, and never under `packages/functions/`:
the deploy pipeline stages `db/<engine>/*.sql` from the root and applies them
after upload, so a migration anywhere else is silently never run.

```
db/sqlite/
  0001-init.sql
  0002-add-users.sql
```

Numbers must be consecutive and gap-free, and an applied migration is frozen —
correct a mistake with a new forward migration, never by editing or renaming one
that has already run (the recorded hash will no longer match).

Run migrations: `pikku db migrate`. It also regenerates `.pikku/db/schema.gen.ts`
(Kysely types) and `.pikku/db/zod.gen.ts` — there is no separate types step.

**NEVER hand-edit the generated schema** — write a migration and re-run.

### Dev seed data

Alongside the migrations sits `db/<engine>-dev-seed.sql` — `db/sqlite-dev-seed.sql`
or `db/postgres-dev-seed.sql`. There is no seed command. `pikku db reset` is the
only thing that applies it: wipe, migrate, seed. `--no-seed` stops after the
migration, for working on an empty-state or onboarding flow the test data hides.

Because reset always arrives at a database it has just wiped, **the seed file is
plain `INSERT`s** — no `INSERT OR IGNORE`, no `ON CONFLICT DO NOTHING`, no
`IF NOT EXISTS`. Nothing applies it twice, so it never has to defend itself. If
you find yourself reaching for an idempotent form, that's a sign the data wants
to be a migration instead.

This is **local dev data only**: enough rows that a fresh dev database isn't an
empty app. Nothing else ever runs it. A deployed stage applies `db/<engine>/*.sql`
and stops there — reset refuses `NODE_ENV=production` and refuses a database
outside the runtime directory, and no deploy step reaches for the seed file.

So the test is not "is this row realistic?", it is **"would the app be broken
without it in production?"** If yes, it is configuration and belongs in a
migration, however much it looks like sample data. A venue and its rooms, a
product catalogue, a tenant, a country list, the organization the whole
deployment hangs off — all configuration. Accounts and role grants are
provisioning: the fabric plugin's `personas`, or a migration. What is left
over is the seed's job — the bookings, orders and messages a demo needs and a real
environment starts without.

Get this wrong and it hides: the app is perfect locally, where reset has just
run, and every deployed environment comes up with empty tables. The signature is
a stage whose pages return 200 — the shell renders fine — while its first data
read throws `no result` or a foreign-key violation on a row the seed was
silently supplying.

A Better Auth app has a second constraint: the plugins you enable (`pikkuBan()`,
`pikkuActor()`, …) each declare columns, and `pikku db migrate` refuses to run while
the applied schema is missing any of them. `pikku db generate` writes the
migration that closes the gap.

### Column conventions

- Use `SERIAL`/`INTEGER PRIMARY KEY AUTOINCREMENT` for IDs
- Use `TEXT` for strings, `INTEGER` for booleans (0/1) and timestamps (Unix ms)
- Use `CHECK` constraints sparingly — prefer app-level validation
- Table and column names: snake_case in SQL, camelCase in TypeScript (via `CamelCasePlugin`)

## Deploy Provider

`pikku.config.json` (in the project root, not `packages/functions/`) **must** declare the Fabric deploy provider:

```json
{
  "deploy": {
    "providers": {
      "cloudflare": "@pikkufabric/deploy-cloudflare"
    }
  }
}
```

Without this, `pikku deploy plan --provider cloudflare` uses the OSS adapter which lacks Fabric's workflow service wiring.

The Fabric adapter automatically:

- Injects `SQLiteKyselyWorkflowService` when `DATABASE_URL` is bound
- Sets up the libSQL workflow queue
- Wires `workflowQueues: true` for the scaffold

No manual workflow service setup is needed.

## Project Layout

```
packages/functions/
  src/
    functions/         # Business logic — one pikkuFunc/workflow per file
    wirings/           # Transport bindings
      *.http.ts        # wireHTTP / defineHTTPRoutes / wireHTTPRoutes
      *.channel.ts     # wireChannel
      *.queue.ts       # wireQueueWorker
      *.schedule.ts    # wireScheduler
      *.mcp.ts         # wireMCPResource / wireMCPPrompt (an MCP tool is just a function with `mcp: true`)
      *.cli.ts         # wireCLI
    services.ts        # pikkuServices factory (singleton)
    middleware.ts      # Shared middleware
    permissions.ts     # Shared permissions
  .pikku/
    db/schema.gen.ts   # Kysely types, written by `pikku db migrate` — NEVER hand-edit
apps/app/              # Frontend(s)
db/sqlite/             # Plain .sql migrations, numbered, gap-free (project root)
db/sqlite-dev-seed.sql # Dev-only test data, applied by `pikku db reset`
pikku.config.json      # Pikku + deploy config (project root)
pikkufabric.config.json # Fabric project link + frontends (project root)
```

## `pikkufabric.config.json`

Links the repo to a Fabric project and declares its frontends:

```json
{
  "projectId": "my-project-id",
  "production": {
    "domain": "example.com"
  },
  "frontends": {
    "app": {
      "cwd": "apps/app",
      "primary": true,
      "deploy": true,
      "kind": "ssr",
      "dev": {
        "command": ["yarn", "dev"],
        "port": 7105,
        "healthPath": "/"
      }
    }
  }
}
```

- `projectId`: written by `pikku fabric init` / `link`. Templates ship the
  `__PROJECT_ID__` placeholder — that is _not_ a link, and the CLI treats it as
  unlinked.
- `production.domain`: optional custom domain. Production always maps to `main`;
  without a domain it lives on the platform `*.pikkufabric.app` hostnames.
- `frontends`: each entry declares a frontend app with its dev command and port

Several CLI messages call this file `fabric.config.json` — `fabric init --force`,
`fabric link --apiUrl`, and the `domains` commands' "No fabric.config.json found".
The file the CLI actually reads and writes is `pikkufabric.config.json`; don't
create the shorter name to satisfy an error message.

## RPC is the default transport

In Fabric apps, most features don't need HTTP wirings. Just write the function with `expose: true` — Pikku generates an RPC client and React Query hooks automatically.

```typescript
export const listTasks = pikkuSessionlessFunc({
  expose: true,
  readonly: true,
  func: async ({ kysely }, {}) => {
    return { tasks: await kysely.selectFrom('tasks').selectAll().execute() }
  },
})
```

Add `wireHTTP` only when you need a specific REST shape (webhooks, third-party callers).

### Transport rule

- Always use RPC first.
- If the function should be callable from the app or other generated clients, prefer `expose: true`.
- Use `expose: true` for public/generated client access unless the user explicitly wants a private function.
- Do not add HTTP routes unless the user explicitly asks for HTTP/REST, or the project settings explicitly require HTTP transport.
- Every new or changed function must have a real description.
- If function metadata would show `missing description`, the work is not finished yet.

## Run it locally

A Fabric app is two processes: the pikku API server (`:3000`) and the frontend
(vite). The starter template's `bun run dev` starts **both** and takes the whole
session down if either dies — a frontend running against a dead API looks like an
app bug and is the single most common way to waste an hour here.

```bash
bun run prebuild   # pikku all — codegen must be current before the server boots
bun run dev
```

Then open the app, sign up as a real user, and click through what you built.
**HTTP 200 is not evidence.** These are client-rendered pages: the server returns
200 with an empty shell, so a page whose component throws still looks fine to
curl.

That pass is a smoke check. Anything you would otherwise verify by hand-driving a
browser tool belongs in a scenario's browser step, run with
`pikku scenario run local --spawn --run browser` — a browser session you steered
yourself proves nothing that re-runs.

Secrets come from `process.env`, which the CLI populates from a `.env` in the
working directory. `BETTER_AUTH_SECRET` is required — without it the first
sign-up fails with `Requested secret not found`, which names no key and points at
no file. The starter template generates one on first `bun run dev`.

If you are running the two processes yourself rather than through the template's
script, run `pikku dev` from the **project root** (it resolves `srcDirectories`
relative to the config, so a nested cwd yields a doubled watch path and no hot
reload).

## Deploy

```bash
pikku fabric login              # opens a browser; needs a human, wait for it
pikku fabric init https://github.com/<owner>/<repo>
pikku fabric validate           # must pass clean
pikku fabric deploy apply --production -y
```

The branch is positional and defaults to the checked-out one, and `-y` is the
short form of `--auto-approve`, so a one-shot deploy is:

```bash
pikku fabric deploy apply -y            # the branch you are standing on
pikku fabric deploy apply my-branch -y  # a named one
```

`-y` answers the prompts and nothing more. It does **not** approve migrations
that drop or rewrite data — that stays `--allow-destructive`, typed out on
purpose.

Inferring the branch is safe because the git safety check refuses any branch
without an upstream or out of sync with it, so it cannot ship an unpushed
commit; the branch it picked is printed before the build starts. A detached
HEAD is refused by name rather than travelling on as a branch called `HEAD`.

There is no `deploy plan` subcommand — `apply` runs the same auth, git-safety
and ref resolution itself, and fabric produces the real plan server-side.

`apply` confirms before deploying, and with no TTY to ask — CI, an agent shell —
it refuses rather than hangs. `--auto-approve` (`-y`) supplies that confirmation;
drop it only when a human is at a real terminal.

`apply` waits for a terminal state and exits non-zero unless the deployment went
live. `--detach` opts out — it queues the deploy, prints the deployment id and
returns 0, which tells you nothing about whether it worked:

| exit | meaning                                                                 |
| ---- | ----------------------------------------------------------------------- |
| 0    | live (or queued, under `--detach`)                                      |
| 1    | the command could not run — not logged in, unsafe git state, bad flags  |
| 2    | the deployment failed, errored, timed out server-side, or was cancelled |
| 3    | the deployment is blocked and nothing the CLI can do will unblock it    |
| 4    | the wait hit `--timeout` with the deployment still in flight            |

Fabric parks every deploy at a gate after the plan phase (`status: suspended`).
Why it parked is the whole story, and it is `statusReason`, not `status`:

- `awaiting_approval` — the plan is fine, a human has to publish it.
  `-y` does that; without it you get exit 3 and the command to run.
  One exception: if fabric marked any pending migration **destructive** — a
  drop, a truncate, a rewrite — `-y` alone declines and exits 3,
  because a standing yes was given before anyone knew the plan dropped a table.
  The CLI lists the migrations and fabric's reasons; `--allow-destructive`
  accepts them for that deploy, and `-y` implies it.
- `needs_config` — a declared secret or variable has no value covering the
  stage. The CLI names them. `-y` will **not** force this through;
  set the values and re-attach — `pikku fabric secrets set <name>` for a
  declared secret, `pikku fabric variables set <name> --value <v>` for a declared
  variable. They are separate stores: a secret is sealed to the stage and cannot
  be read back, a variable is stored plainly and can (`variables get`). `set`
  reads the value as JSON when it parses, so `--value true` is the boolean on a
  stage exactly as it is from `.env`, and `--value '"true"'` is the string.
- `needs_attention` — the plan is red. Nothing to approve.

The wait defaults to a 900s ceiling; `--timeout <seconds>` moves it. On timeout
it prints the deployment id and the re-attach command rather than lying about
the outcome.

Splitting kick-off from waiting across two CI jobs is the reason
`--deployment-id` exists, and what `--detach` is for — the first job here has to
return the id and exit rather than wait:

```bash
id=$(pikku fabric deploy apply --production -y --detach --json | jq -r 'select(.event=="result").deploymentId')
# …later, in another job…
pikku fabric deploy apply --deployment-id "$id" -y
```

`--deployment-id` skips the git safety check entirely (the deployment already
pins a sha, and the checkout is allowed to have moved on) and refuses to be
combined with a branch or `--production`, which would let the two disagree.

Under `--json`, the wait emits one NDJSON event per line — `created`/`attached`,
`status` on each transition, `blocked`, `approved` — and the last line is the
terminal result object, tagged `"event": "result"`.

`init` adopts a **GitHub** repo, and adoption goes through the Pikku Fabric
GitHub App — the app has to be installed on the account or org that owns the
repo, and if it is installed with "selected repositories" this one must be in
the selection. There is no CLI flag that works around a missing installation:
`init` returns "Connect the GitHub account '<owner>'". Send the user to install
it, or create the project in the console instead (which provisions a Fabric-hosted
git repo you push to) and write the returned `projectId` into
`pikkufabric.config.json` yourself.

Deploy refuses to run unless the target branch equals its upstream — the guard
compares `main` against `main@{upstream}`. So the remote you pushed to must be
the one the branch tracks; a stale `origin` left over from scaffolding blocks
the deploy with "local HEAD … ≠ remote …" even though your code is pushed.
`git branch --set-upstream-to=<remote>/main main` before deploying.

## Versioning

Functions with `expose: true` are versioned via `versions.pikku.json`. When you change a function's input or output schema, you must bump its version number — otherwise `pikku all` will report a breaking change and callers' generated clients become stale.

The `pikku-verify` tool catches this automatically.

## After every code change

Always call the `pikku-verify` tool after modifying functions, wirings, or schemas. It runs:

1. `pikku all` — regenerates all codegen, checks version compliance
2. `tsc --noEmit` — validates TypeScript types

The output card shows whether any breaking changes were detected.

### `app-missing-actor-quick-login-<app>`

The `fabric validate` finding people most often misread. It fires when an app has
a **login screen** but no dev actor switcher, and it is not a style nit: a sandbox
reviewer has no seed password, so without the control they are locked out of the
app they were asked to look at.

Satisfy it with `<DevActorSwitcher />` from `@pikku/mantine/dev`, or with your
own UI built on `useDevActors()` from `@pikku/react` — validate accepts either
call site as evidence, so custom rendering passes. See **pikku-react** for the
props and **pikku-scenario** for where the actor list comes from.

The validator also accepts the shapes that predate the package — a hand-rolled
`signInAsActor()` or a literal `POST /auth/sign-in/actor` — so an older app does
not fail the build. **Treat that as a grace period, not the target: migrate those
to `<DevActorSwitcher />`.** The hand-copied version is exactly the duplication
the package exists to remove, and the copies drift — the ones that prompted this
had already diverged on the `import.meta.env.DEV` gate that keeps the shared
secret out of production bundles.

Do **not** satisfy it with Better Auth's `/dev/quick-login`. That is a different
endpoint with a different purpose — one fixed admin, not the declared personas —
and it does not clear this rule.

## Hard rules

These apply in every Fabric app:

- **No `process.env`** — use `variables.get('NAME')` and `secrets.getSecret('NAME')`. Declare with `defineVariable` / `defineSecret`.
- **No `as any`** — fix types properly.
- **No generic `Error`** — throw `NotFoundError`, `ConflictError`, `BadRequestError`, `UnauthorizedError` from `#pikku/error`.
- **No auth checks in function bodies** — use `permissions:` field on the function config with a `pikkuPermission` factory.
- **No hand-editing `.pikku/db/schema.gen.ts`** — write a migration and re-run `pikku db migrate`.
- **One runtime unit per file** — never define multiple functions/workflows in a single source file.
- **Workflow steps don't need manual wiring** — `pikkuSessionlessFunc` step functions in `*.steps.ts` files are auto-discovered by codegen.
- **Identifiers are English** — functions, components, types, files, database tables and columns, in every app whatever market it serves. The team's language is `metaLocale` in `pikku.config.json` and reaches `description`/`title`/`template` only; the app's language is the message catalogue, where `baseLocale` stays `en` and `defaultLocale` decides what a visitor opens in. `pikku fabric validate` warns (`app-base-locale-not-english-<app>`) when an app repoints its base.

## Converting an existing app to Fabric format

Start by running the structural validator — it tells you exactly what is missing:

```bash
pikku fabric validate --json
```

Fix every `error` and `warn` in the output before continuing. Then:

1. **Replace the database layer**: swap PostgreSQL/MySQL queries for Kysely + libSQL. Convert schema to SQLite-compatible SQL migrations in `db/sqlite/`.
2. **Replace route handlers with pikkuFuncs**: extract business logic into `pikkuFunc`/`pikkuSessionlessFunc`, add `wireHTTP` or `expose: true` for transport.
3. **Replace DI/IoC with pikkuServices**: move service construction to `createSingletonServices` in `services.ts`.
4. **Replace `process.env` calls**: plain config becomes `defineVariable` + `variables.get()`, anything sensitive becomes `defineSecret` + `secrets.getSecret()`.
5. **Add `pikku.config.json`** at project root with `srcDirectories`, `outDir`, and `clientFiles` — plus `metaLocale` if the team does not work in English, which is the language every `description`, `title` and step `template` is then authored in.
6. **Add `pikkufabric.config.json`** at project root with `projectId`, `production.domain`, and `frontends` (production is always `main`, so there is no `production.branch`).
7. **Run `pikku all`** — verify codegen succeeds and there are no type errors.
8. **Run `pikku fabric validate`** once more to confirm no structural issues remain.

## A deployed stage misbehaving

Reproduce locally first — a deployed stage adds cost and latency to every
iteration, and a failure that reproduces locally is a local debugging problem.
When it only happens deployed, read `references/debugging.md`: start from
`errors` rather than `logs` (they are already filtered and carry the traceId),
follow one trace end to end before forming a theory, and confirm the fix against
the same stage. A deploy that *failed* is a build or config problem and belongs
above, not there.
