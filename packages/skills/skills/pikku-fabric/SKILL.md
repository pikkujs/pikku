---
name: pikku-fabric
description: 'Build, convert and debug apps on the Pikku Fabric platform. Covers SQLite/libSQL database setup with Kysely, fabric project layout, deploy provider config, the optional `fabric.projectId` in `pikku.config.json`, the `pikku all` + `tsc` verification loop, and reading logs, traces and metrics from a deployed stage. TRIGGER when: user is working on a Fabric-hosted Pikku project, converting an app to Fabric format, asking about Fabric deployment, database or project conventions, asking about a `pikku fabric validate` finding including app-missing-actor-quick-login, or a deployed stage is erroring, timing out or behaving differently than local ("why is prod failing", "check the logs"). DO NOT TRIGGER when: user is working on a generic (non-Fabric) Pikku deployment — use pikku-deploy instead — or the failure reproduces locally, which is where to debug it.'
installGroups: [fabric]
---

# Pikku Fabric

## Operating procedure

1. **Run structural validation first.** Before any edit, run:
   ```bash
   pikku fabric validate --json
   ```
   This prints every missing file, misconfigured field, and dependency gap with a `fixHint`. Address all `error` findings before proceeding — they block deploy. Resolve `warn` findings before testing — they cause runtime failures. `info` findings are best-practice gaps that are safe to defer.
2. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
3. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
4. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
5. Validate with the narrowest relevant command first, then run `pikku all` when functions, wirings, schemas, or generated clients may have changed.
6. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

Fabric is a serverless deployment platform for Pikku apps. Every Fabric app runs on Cloudflare Workers with a SQLite database (via libSQL/Turso). This skill covers what's unique to Fabric. For general Pikku concepts, function authoring, HTTP wiring, and more, see `pikku-concepts`, `pikku-wiring`, `pikku-services`, etc.

## Before you start

```bash
yarn pikku meta context --json
```

Run `pikku meta` before grepping or editing a Fabric app:

- `pikku meta context --json` for the project map: functions, wires, workflows, capabilities, and source files.
- `pikku meta clients --json` before frontend/RPC work.
- `pikku meta functions --json` to list function ids, then `pikku meta functions get <id> --json` for one function.
- `pikku meta schemas --json` to list schema names. Only request a full schema body with `pikku meta schemas get <name> --json` when you need it.

Do not load every schema body by default.

For database work:

- Use `pikku fabric db schema [--branch <branch>]` for the actual attached Fabric database state: tables and columns.
- Use `pikku meta schemas` for code-level JSON Schema contracts, not database introspection.
- Do not inspect database credentials or connect to the database directly; Fabric already exposes the safe introspection surface.

## Database

Fabric apps use SQLite via Kysely and the libSQL HTTP adapter, not PostgreSQL or D1. `DATABASE_URL` is injected as a variable binding when the stage starts; locally `pikku db migrate` uses a `dev.db` file. Migrations are `.sql` files in `db/sqlite/` at the project root, numbered, gap-free and forward-only; never hand-edit `.pikku/db/schema.gen.ts`. Read `references/database.md` for the `services.ts` setup, the migration guards, dev seed rules and column conventions.

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
pikku.config.json      # Pikku + deploy config, and the frontends (project root)
```

## How a checkout is linked to its Fabric project

`fabric.projectId` in `pikku.config.json` names the project. It is optional. Order
tried:

1. `FABRIC_PROJECT_ID` env var — CI and scripts.
2. `fabric.projectId` in `pikku.config.json`.
3. The git remote, matched against Fabric's projects. The id found is written
   into `pikku.config.json` so the lookup happens once. It is never committed
   for you; commit it or not. A deploy ignores a `pikku.config.json` whose only
   change is `fabric.projectId`. If two projects share one repo the CLI refuses; pick
   one with `FABRIC_PROJECT_ID=<projectId>`.

`pikku fabric config` prints which project, api url and login the current
checkout resolves to, and where each came from, and the project's settings.
The settings Fabric needs that `pikku.config.json` does not describe are stored
on the project, not in a file, and set with `key=value` arguments:

```bash
pikku fabric config showcase.name="Watering Log" showcase.tags=voice,realtime
pikku fabric config guide.docs=docs/guide guide.theme.primaryColor=teal
pikku fabric config scenarios.env.STRIPE_MODE=test   # the scenario run only
pikku fabric config showcase.tint=                   # an empty value clears it
```

The keys are `showcase.name` (≤60), `showcase.description` (≤160),
`showcase.tags` (comma-separated, ≤6, from Fabric's fixed list),
`showcase.tint` (`#rrggbb`), `guide.docs`, `guide.theme.primaryColor`,
`guide.theme.fontFamily`, `guide.theme.headingFontFamily` and
`scenarios.env.<NAME>`. Every assignment is checked before any is applied, so a
refused one changes nothing. Whether the project appears on the public
showcase is Fabric's decision, not a setting.

`pikku fabric link` creates
`origin` (with `--gitea`) if there is none, imports the project, writes
`projectId`, and queues the first deploy; it commits and pushes nothing. A
custom production domain is set with `pikku fabric domains add`. Production
always maps to `main`; without a domain it lives on the platform
`*.pikkufabric.app` hostnames.

The apps are the `frontends` in `pikku.config.json`,
the same list `pikku serve`, `pikku app` and native builds read, and
`pikku fabric validate` and `smoke` read them from there:

```json
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
```

Each `frontends` entry declares a frontend app with its dev command and port.

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

## Reaching a model

An agent needs an `agentRunner` in singleton services, and locally you do not
write one: `pikku dev` builds it from env when it finds a **matching pair** —
`OPENAI_BASE_URL` + `OPENAI_API_KEY`, or `LITELLM_PROXY_URL` + `LITELLM_API_KEY`
— and registers it under `'*'`, so every `provider/model` prefix resolves
through it. With neither pair complete it builds nothing and every agent call
fails with `AIProviderNotConfiguredError` (a 503) — which reads like a broken
agent rather than a missing key, so check `.env` first. Mixing halves is worse
than missing them: a URL from one source with a key from the other 401s on every
call, so the pairs are taken whole, OpenAI first.

Two ways to fill them in:

**The Fabric AI gateway.** One key, and every model the gateway fronts —
OpenAI, Anthropic, Google, the OpenRouter catalogue — is reachable by id, billed
through your Fabric account rather than per-vendor:

```bash
pikku fabric login
pikku fabric llm key --env >> .env    # writes both pairs; --shell and --json also exist
```

It mints or reuses a developer-scoped key against your Fabric login. `link` is
not required — the key is yours, not the project's.

**Your own vendor key.** `OPENAI_BASE_URL=https://api.openai.com/v1` with your
`OPENAI_API_KEY`, and model ids are then only the ones that vendor serves.

A deployed stage takes the same names through `pikku fabric secrets set` /
`variables set` — the agent units get their runner wired by the bundler, from
those values.

## Deploy

Flow: `pikku fabric login` (needs a human), `pikku fabric init <github url>`, `pikku fabric validate` (must pass clean), then `pikku fabric deploy apply --production -y`. `apply` waits for a terminal state and exits non-zero unless the deployment went live. Read `references/deploy.md` for organization targeting, `--reset`, exit codes, the approval gate (`awaiting_approval`, `needs_config`, `needs_attention`), CI splitting, the upstream guard, the first user and private stage links.

## Versioning

Functions with `expose: true` are versioned via `versions.pikku.json`. When you change a function's input or output schema, you must bump its version number — otherwise `pikku all` will report a breaking change and callers' generated clients become stale.

`pikku all` catches this automatically.

## After every code change

Run `pikku all` after modifying functions, wirings, or schemas, then `tsc --noEmit`:

1. `pikku all` — regenerates all codegen, checks version compliance
2. `tsc --noEmit` — validates TypeScript types

Breaking changes are reported by the version check in step 1.

### `app-missing-actor-quick-login-<app>`

The `fabric validate` finding people most often misread. It fires when an app has
a **login screen** but no dev actor switcher, and it is not a style nit: a sandbox
reviewer has no seed password, so without the control they are locked out of the
app they were asked to look at.

Satisfy it with the starter template's `<DevActorSwitcher />`, or with your
own UI built on `useDevActors()` or `signInAsPersona()` from `@pikku/react` —
validate accepts any of those call sites as evidence, so custom rendering
passes. Either way the server needs `personaSignIn` on `pikkuActor`; see
**pikku-scenario** for it and **pikku-react** for the props.

The validator also accepts the shapes that predate the package — a hand-rolled
`signInAsActor()` or a literal `POST /auth/sign-in/actor` — so an older app does
not fail the build. **Treat that as a grace period, not the target: migrate those
to `<DevActorSwitcher />`.** They put a per-persona credential in the frontend
bundle, which the persona endpoint exists to avoid.

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
6. **Declare the apps** as `frontends` in `pikku.config.json`. There is no fabric config file; `projectId` is optional; without it the CLI finds the project from the git remote.
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
