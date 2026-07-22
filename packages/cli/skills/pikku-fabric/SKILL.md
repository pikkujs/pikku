---
name: pikku-fabric
description: 'Build and convert apps for the Pikku Fabric platform. Covers SQLite/libSQL database setup with Kysely, fabric project layout, deploy provider config, `fabric.config.json`, and the pikku-verify workflow. TRIGGER when: user is working on a Fabric-hosted Pikku project, converting an app to Fabric format, or asking about Fabric deployment, database, or project conventions. DO NOT TRIGGER when: user is working on a generic (non-Fabric) Pikku deployment — use pikku-deploy-cloudflare, pikku-deploy-fastify, etc. instead.'
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
2. Discover before editing. Prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
3. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
4. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
5. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
6. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

Fabric is a serverless deployment platform for Pikku apps. Every Fabric app runs on Cloudflare Workers with a SQLite database (via libSQL/Turso). This skill covers what's unique to Fabric. For general Pikku concepts, function authoring, HTTP wiring, and more, see `pikku-concepts`, `pikku-http`, `pikku-services`, etc.

## Before you start

Always run project discovery first:

```bash
yarn pikku meta context --json
```

In OpenCode, call the `pikku-meta` tool before grepping or editing a Fabric app.

- Use `section: "context"` for the project map: functions, wires, workflows, capabilities, and source files.
- Use `section: "clients"` before frontend/RPC work.
- Use `section: "functions"` to list function ids, then `section: "function", id: "<functionId>"` for one function.
- Use `section: "schemas"` to list schema names. Only request full JSON Schema bodies with `schemas: ["SchemaName"]` for the specific schemas needed.

Do not load every schema body by default; that wastes context and usually makes the model worse.

For database work in OpenCode:

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

A Better Auth app has a second constraint: the plugins you enable (`admin()`,
`actor()`, …) each declare columns, and `pikku db migrate` refuses to run while
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
      *.mcp.ts         # wireMCPTool
      *.cli.ts         # wireCLI
    services.ts        # pikkuServices factory (singleton)
    middleware.ts      # Shared middleware
    permissions.ts     # Shared permissions
  .pikku/
    db/schema.gen.ts   # Kysely types, written by `pikku db migrate` — NEVER hand-edit
apps/app/              # Frontend(s)
db/sqlite/             # Plain .sql migrations, numbered, gap-free (project root)
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
  `__PROJECT_ID__` placeholder — that is *not* a link, and the CLI treats it as
  unlinked.
- `production.domain`: optional custom domain. Production always maps to `main`;
  without a domain it lives on the platform `*.pikkufabric.app` hostnames.
- `frontends`: each entry declares a frontend app with its dev command and port

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
curl. Either open it in a browser or drive it headlessly and assert on rendered
text.

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
pikku fabric deploy plan --production
pikku fabric deploy apply --production
```

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

## Hard rules

These apply in every Fabric app:

- **No `process.env`** — use `variables.get('NAME')` and `secrets.getSecret('NAME')`. Declare with `wireVariable` / `wireSecret`.
- **No `as any`** — fix types properly.
- **No generic `Error`** — throw `NotFoundError`, `ConflictError`, `BadRequestError`, `UnauthorizedError` from `@pikku/core/errors`.
- **No auth checks in function bodies** — use `permissions:` field on the function config with a `pikkuPermission` factory.
- **No hand-editing `.pikku/db/schema.gen.ts`** — write a migration and re-run `pikku db migrate`.
- **One runtime unit per file** — never define multiple functions/workflows in a single source file.
- **Workflow steps don't need manual wiring** — `pikkuSessionlessFunc` step functions in `*.steps.ts` files are auto-discovered by codegen.

## Converting an existing app to Fabric format

Start by running the structural validator — it tells you exactly what is missing:

```bash
pikku fabric validate --json
```

Fix every `error` and `warn` in the output before continuing. Then:

1. **Replace the database layer**: swap PostgreSQL/MySQL queries for Kysely + libSQL. Convert schema to SQLite-compatible SQL migrations in `db/sqlite/`.
2. **Replace route handlers with pikkuFuncs**: extract business logic into `pikkuFunc`/`pikkuSessionlessFunc`, add `wireHTTP` or `expose: true` for transport.
3. **Replace DI/IoC with pikkuServices**: move service construction to `createSingletonServices` in `services.ts`.
4. **Replace `process.env` calls** with `wireVariable`/`wireSecret` + `variables.get()`.
5. **Add `pikku.config.json`** at project root with `srcDirectories`, `outDir`, and `clientFiles`.
6. **Add `fabric.config.json`** at project root with `projectId`, `production.branch`, and `frontends`.
7. **Run `pikku all`** — verify codegen succeeds and there are no type errors.
8. **Run `pikku fabric validate`** once more to confirm no structural issues remain.
