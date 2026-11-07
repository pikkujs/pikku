---
name: pikku-addon
description: >-
  Reusable Pikku function packages (addons): wireAddon, ref(), pikkuAddonServices, shipping DB tables, sharing functions across projects, generating an addon from an OpenAPI/Swagger spec.
installGroups: [core]
---

# Pikku Addons

What to reach for and why. For how to call it, run this once: `pikku doc addon wireAddon wireRemoteAddon ref refHTTP refChannel refCLI pikkuAddonServices pikkuAddonWireServices pikkuAddonConfig defineHTTPRoutes wireHTTPRoutes`. Depth: `references/openapi.md`, `references/addon-package-manifest.md`.

An addon is a reusable function package shared across projects: functions, services, secrets and variables in one self-contained NPM package. See `pikku-concepts` for the core mental model.

## Is it an addon?

- **Functions another project should reuse → addon.** `npx @pikku/cli new addon <name>`.
- **Handed an OpenAPI or Swagger spec → generate, never hand-write.** `npx @pikku/cli new addon <name> --openapi <spec>` makes one function per operation with its schemas, service and credential. `<spec>` is a path, a URL or a registry catalogue name such as `amazonaws.com:applicationcostprofiler`; inside an app, `pikku addons add <catalogue-name>` does the same and picks `--auth`. Read `references/openapi.md`.
- **A screen shows the addon's data as the addon returns it → call the addon function itself.** Name it in `wireAddon({ expose: [...], auth: true })` and the frontend calls `rpc.invoke('todos:listTodos', …)` (over HTTP, `POST /rpc/todos:listTodos` with `{ "data": … }`), still behind the session. Use `ref('todos:listTodos')` on an HTTP or MCP wiring only when the addon needs a route of its own.
- **The app needs the data narrowed, typed or combined, or adds a permission of its own → write an app function that calls it.** A flag the upstream sends as `"0"`, a total summed from several calls, one field out of fifty. Name it for what the screen means (`getMyProfile`), not the upstream operation (`usersRetrieveInfo`), and give it an `output:` schema of only what the app uses. OpenAPI-generated outputs mirror the upstream's loose, oversized payloads, and the wrapper is where they become the app's own shape.
- **Never write an app function that calls `rpc.invoke` and only copies the addon's schema.** It is a second name and a second schema for the same thing, and it drifts. A wrapper that enforces ownership or another permission may return the result unchanged; that is how a protected addon function is exposed to a screen without exposing it directly.
- **An agent tool → just another `ref()` in `tools`.** See `pikku-agent`.

## Working on one

Discover first (`pikku meta … --json`, `pikku info functions --verbose`, `pikku info tags --verbose`). Find the source that owns the behaviour; do not start from generated output, `.pikku`, `node_modules`, vendored packages or build artifacts. Make the smallest source change, never hand-edit SDKs, schema output or typegen, validate narrowly first, then `pikku all` when functions, wirings, schemas or clients may have changed. If validation fails, fix the source cause and rerun.

## Security rules

- **`auth`, `tags` and `scopes` on `wireAddon` only ever tighten.** `auth: false` is not honoured, because it would weaken the wiring's own gate: the addon-level setting can require a session but never waive one. The same package wired twice under two namespaces is governed by the union of both instances' scopes and tags.
- **Nothing in an addon is reachable over `/rpc` until the wiring opts in,** and it can only open what the addon itself declared `expose: true`. An OpenAPI-generated addon declares every operation, so list the ones the frontend needs.
- **`scopes` on `wireAddon` gate every function at once, and a wiring carries middleware, not permissions.** A rule on one addon function lives in the `permissions` of an app function that calls it.
- An addon called with the user's own credential is already limited upstream, so a data-aware `pikkuPermission` repeating that check (may they read _this_ invoice?) adds nothing. A session-only `pikkuAuth` (a role, a tier) is still worth it: it can be checked before any input exists, so the functions a user can't call drop out of the tools an MCP client, an agent or a workflow is offered, instead of failing upstream when called.
- **An addon reads only the secrets it declared.** Its `SecretService` and `CredentialService` are scoped: literal `getSecret('X')` calls and `wireSecret` definitions, which the CLI collects into `declaredSecrets`. Anything else throws `Access denied to secret key: X` at runtime. The same holds for credentials, and a scoped addon can never call `getAllUsers()`.
- A _generic_ addon whose secret names arrive as data (`@pikku/addon-graph` reads `getSecret(auth.credential)`, the name coming off the workflow node) declares nothing and is scoped to nothing. Only the consuming app can widen it:
  - `secretOverrides`: grant **and** rename. `secretGrants`: grant as-is. `globalSecrets`: grant everything, with a written reason.
  - **Grants name the secret as the addon reads it,** not as your project stores it. Scoping is checked _before_ the override map renames anything, so an overridden secret is granted by its addon-side key: an override's key grants and its value does not.
  - `globalSecrets` and `globalCredentials` take the _reason_, not a boolean, because every grant is enumerated in the deploy manifest (`unscopedSecretAddons`, `grantedSecretAddons`). Prefer `secretGrants`. Use `globalSecrets` only when no static list can exist, and never for an addon that performs outbound requests, where an unrestricted secret read is an exfiltration primitive.
  - A grant naming a secret your project does not declare is a build error from `pikku all`, resolved through the override map first: `Secret grant 'STIRPE_KEY' in addon 'graph' (@pikku/addon-graph) targets a secret that does not exist. Available secrets: …`.

## Writing an addon

- **Inside an addon, import from `#pikku/addon/function` and `#pikku/addon/setup`, never `#pikku/function`.** The generated tree roots at `.pikku/addon/`, and inside the addon `#pikku/function` names a leaf that does not exist.
- **Declare zod schemas in a file that never imports `#pikku`.** `pikku all` loads the file that declares each schema to convert it, and at runtime `#pikku` resolves through the package's `imports`, into a `dist` the first build has not written yet. Inline, every schema fails with `Could not convert Zod schema … Cannot find module …/dist/.pikku/…` and the addon never builds from clean. Use a sibling `<fn>.schemas.ts`, which is what `--openapi` generates.
- **Export `pikkuAddonServices(...)` as it is.** A cast around it (`as unknown as CreateSingletonServices<...>`, `<T>`, `!`) hides the factory from the inspector, which would leave it unregistered and the addon's workflows failing at runtime; the build fails with `PKU564` instead. Fix the type the cast was hiding. `satisfies` and parentheses are fine.
- An addon never falls back to its own logger, variables or secrets; the consuming app supplies them. `secrets` and `variables` arrive typed against the addon's own declarations, and a secret is a `SecretValue`: `.reveal()` is the only way to the plaintext (see `pikku-services`).
- `pikkuAddonWireServices` is only for functions that need per-request services.
- There is no `addon()` helper; `ref()` covers local and addon functions (`ref('todos:addTodo')`, `ref('myLocalFunc')`) and proxies the call via RPC at runtime. `refHTTP`, `refChannel` and `refCLI` are for an addon that publishes wiring contracts rather than bare functions: they carry its route and config metadata.

## Building

- Use `yarn pikku`, not `npx pikku`: a scaffolded addon carries `@pikku/cli` as a devDependency, and building against a different CLI than it declares is how generated output ends up disagreeing with the packaged one. `npx @pikku/cli new addon` is the exception: it runs before the addon and its CLI exist.
- `yarn build` is prebuild (`pikku all`) then `tsc && pikku dist`. `yarn pikku validate` checks that the published file set holds together. Leave `pikku dist` out and the addon installs fine and fails to typecheck in every app that depends on it, because it copies what `tsc` cannot emit: the generated `*.gen.json` meta and the hand-written `types/*.d.ts`.
- **A `remote: true` function's input and output must be exported zod schemas.** Apps using `wireRemoteAddon` build against the SDK, not the source. Generics (`pikkuSessionlessFunc<In, Out>`) or a return type declared in `src/` fail codegen with PKU922. Non-remote functions can keep generics.
- In an addon, `pikku all` packs the SDK on every run, at the package.json version, into `.pikku/sdk/` and `<scope>-<name>-<version>.sdk.tgz`. It carries only the remote RPCs, the `expose: true` workflows and the types they reach. Changing a published `remote: true` contract needs a new `version` on the function; `yarn pikku versions check` enforces that.

## Calling another addon

- Declare it in the addon's **package.json** (not pikku.config.json), by alias and range: `"pikku": { "uses": { "stripe": "@pikkustudio/addon-stripe@^0.12.0" } }`.
- Call it typed: `rpc.invoke('stripe:charge', …)`, `rpc.startWorkflow('stripe:refund', …)`. Never cast `rpc` or call by the package name; the alias is the only name that works.
- `pikku all` in the addon types `stripe:*` from the dependency's SDK. A package in the same workspace is read from its own `<outDir>/sdk`, so run `pikku all` there first; anything else is fetched from the registry and pinned in `pikku-addons.lock`.
- The app wiring your addon maps the alias with `uses` on `wireAddon`, local or remote alike: `uses: { stripe: 'payments' }`, where `payments` is the name it wired the dependency under.
- At runtime an unmapped alias, or the wired name called directly, throws `AddonNotUsedError` (403) for invoke, workflows and agents.

| Code   | `pikku all` fails when                                              |
| ------ | ------------------------------------------------------------------- |
| PKU338 | the workspace SDK is missing                                        |
| PKU354 | the version or mapped instance is outside the range                 |
| PKU348 | an alias the addon declared is not mapped                           |
| PKU347 | it is mapped to a name not wired, or wired from another package     |
| PKU355 | `uses` maps a name the addon did not declare                        |
| PKU356 | the addon's `pikku.uses` entry is malformed (alias, type, no range) |

## Database tables

An addon may **ship** tables. It must never **create** them: it runs inside the consumer, against the consumer's database, so a boot-time `CREATE TABLE` puts a second authority on a schema the consumer's migrations own. It declares instead, and the consumer's migration history absorbs the declaration.

- Author the DDL per dialect: `db/sqlite/0001-labels.sql`, `db/postgres/…`, `db/mysql/…`.
- `db/mysql` needs a server to publish: MySQL has no embedded engine, so `pikku all` applies the SQL to a scratch database on the server named by `db.mysqlUrl` in the addon's `pikku.config.json`, and refuses to build without one. Use `varchar(n)` for a key column; MySQL rejects `TEXT` there.
- `pikku all` publishes `<outDir>/db/pikku-db-meta.gen.json` on every build, per dialect, the SQL verbatim plus a table/column map, and writes it **empty** when the addon has no tables, because a consumer reads an absent file as a package that cannot say. (`pikku db export` writes the same file on demand.)
- The consumer resolves it **through the package name**, so it must be exported and packed: `"exports": { "./.pikku/db/pikku-db-meta.gen.json": "./dist/.pikku/addon/db/pikku-db-meta.gen.json" }, "files": ["dist"]`.
- **An unresolvable artifact stops `db generate`.** Absence means the package was built with an older CLI, or `exports`/`files` do not carry it; the error names both causes. An addon with genuinely no tables publishes `{}` and is waved through.
- A malformed artifact (missing the SQL for a dialect it claims) is rejected rather than half-applied, and an addon publishing only a dialect the consumer does not use gets an error naming what it supports.
- `verifiers/db-schema` runs this end to end on both dialects. Copy its addon `package.json` when wiring a new one.

## Consuming an addon

- After `wireAddon`, run `yarn pikku all` to generate types for its functions.
- In a workspace, add the addon to the dependencies of the package whose file calls `wireAddon`, not the repo root. Codegen resolves from the package that wires it first and the project root second, and a remote addon's `devDependencies` check reads that same manifest. If codegen reports PKU340, the dependency is missing from the package its message names: do not add it at the root to paper over it. `verifiers/addon-workspace` is that layout.
- If the addon ships tables, `pikku db generate` writes one migration per addon, named after the package and carrying its own SQL, after Better Auth's and the runtime's, so an addon table may reference `user` or a runtime table. `pikku db migrate` applies it. Re-running `generate` writes nothing once covered, and only the delta after an upgrade. A `wireRemoteAddon` addon contributes no schema: its tables belong to the deployment that runs its functions.
- A `wireRemoteAddon` whose `package` carries a range (`'@scope/name@^1.4.0'`) is not installed at all: `pikku all` downloads its SDK into `.pikku/remote` and pins it in `pikku-addons.lock` (commit the lock). If codegen reports PKU338 for one, run `pikku all`, not an install. To move to a newer SDK, edit the range by hand (`pikku update` prints the file:line and the new literal; it never rewrites source), then run `pikku all`.

## Studio screens

An addon declares the screens it adds to Pikku Studio with `definePlugin`, in `src/screens.ts` (`npx @pikku/cli new addon <name> --ui` scaffolds one). It replaces `defineScreens`, which no longer exists.

- A screen is a lazy `component` or an `app`, never both. `nav` is optional: without it the screen is routed but not listed.
- `scopes` only hide the screen; they are NOT access control. The addon's functions must enforce the same scopes.
- `replaces: true` takes over the core screen at the same path (first-party addons only; Studio enforces that).
- Titles are message keys in the addon's `messages/{locale}.json`, found by convention next to its `package.json`; there is no field for them.
- The inspector reads every field statically, so each must be a literal.
- A key missing from another locale's catalog is a warning.
- `defaultChat: false` hides Studio's general Chat tab on the screen, so the screen's `agent` is its only chat.
- `agents/` and `skills/` ship in the package: a `files` list must name both folders; a root glob such as `**/*.md` does not count.
- `package.json` carries a `studio` block, `{ "addon": "<name>", "ui": "./src", "messages": "./messages/{locale}.json" }`. Studio only links a package with `studio.addon`, the `<addon>` in an agent's scope `agent:<addon>:<name>`. `--ui` scaffolds it.

| Code   | `pikku all` fails when                                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| PKU345 | a field is not a literal (variable, call, spread, bad value)                                                                              |
| PKU357 | two screens of the addon use the same path                                                                                                |
| PKU358 | a title or agent frontmatter key is missing from `messages/en.json`                                                                       |
| PKU359 | `nav.badge` names no function of the addon                                                                                                |
| PKU365 | `agent` is neither a name nor `studio:<name>`, or a name has no non-empty `agents/<name>.md`, or no frontmatter `title` and `description` |
| PKU366 | `package.json` `files` leaves out `agents/` while a screen names a valid (no PKU365) non-`studio:` agent, or `skills/` while the addon has a `skills/<name>/SKILL.md` |

## Not in `pikku doc` yet

- Scaffold: `npx @pikku/cli new addon <name> [--display-name Stripe --category Payments --dir addons]` writes `package.json` (exports `.pikku/*` + `dist/`), `pikku.config.json` (`addon: true`), `tsconfig.json` (`#pikku` path mapping), `src/services.ts`, `src/functions/`, `types/application-types.d.ts`.
- `wireAddon` `expose` as a list: PKU343 on unknown or undeclared names.
- `definePlugin` from `@pikku/core/addon`, default-exported: `{ title, screens: [...] }`. Each screen: `path`, `title` (message key, also the nav label), `scope` (`'studio'` → `/<path>`, `'team'` → `/<team>/<path>`, `'project'` → `/<team>/<project>[/<target>]/<path>`), `component: () => import('./screens/X.js')` or `app`, `nav: { area, icon, order, badge }`, `needsApp` (project screens only, default false), `scopes`, `layout: 'bare'` (renders without the shell), `replaces`, `agent`.
- `nav.area` is `'rail'`, `'team'`, `'project'` or `'account'`. `badge` names one of the addon's functions that returns a count.
- `agent: 'name'` makes that agent answer in Studio's chat panel (a second tab beside the general chat) while the screen is open. It resolves to `agents/<name>.md` at the addon's package root: the agent's instructions, naming the skills it follows (plain folders `skills/<name>/SKILL.md`). The file starts with frontmatter whose `title` and `description` are message keys in `messages/en.json`. The name matches `/^[a-z][a-z0-9-]*$/`. `agent: 'studio:<name>'` picks an agent Studio ships; `pikku all` only checks the format and looks up no file.
