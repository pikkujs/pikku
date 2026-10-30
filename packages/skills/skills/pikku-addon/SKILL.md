---
name: pikku-addon
description: >-
  Creating or consuming reusable Pikku function packages (addons): wireAddon, ref(),
  pikkuAddonServices/pikkuAddonWireServices, package structure, shipping DB tables (pikku db
  export), generating an addon from an OpenAPI/Swagger spec. TRIGGER when: code uses those APIs, or
  the user asks about addons or cross-project function sharing, or hands over an OpenAPI/Swagger
  spec (file or URL) to build on. DO NOT TRIGGER for internal function composition (use
  pikku-wiring), general function definitions (use pikku-concepts) or n8n imports (use
  pikku-n8n-import).
installGroups: [core]
---

# Pikku Addons

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

Addons are reusable Pikku function packages that can be shared across projects. They bundle functions, services, secrets, and variables into a self-contained NPM package.

## Before You Start

```bash
pikku info functions --verbose   # See existing functions and addons
pikku info tags --verbose        # Understand project organization
```

See `pikku-concepts` for the core mental model.

## API Reference

### `wireAddon(config)`

Register an addon in the consuming project:

```typescript
import { wireAddon } from '#pikku/addon'

wireAddon({
  name: string,                    // Namespace for addon functions (e.g. 'todos')
  package: string,                 // NPM package name (e.g. '@pikku/addon-todos')
  rpcEndpoint?: string,            // Optional remote RPC endpoint for distributed execution
  uses?: Record<string, string>,   // alias the addon declared → name this app wired it under (only declared aliases; PKU355)
  auth?: boolean,                  // Require a session for every function in the addon
  mcp?: boolean | string[],        // true: every function the addon declared mcp: true; a list: the tools this app offers, typed against the addon's function names
  expose?: boolean | string[],     // opt-in: what rpc.exposed / POST /rpc may reach. true = every function the addon declared expose: true, a list = those of them named (typed; PKU343 on unknown or undeclared names), unset/false = none
  tags?: string[],                 // Tags applied to all addon functions
  ui?: boolean,                    // Mount the screens the addon declares with definePlugin
  scopes?: string[],               // Required of every function, on top of its own
  secretOverrides?: Record<string, string>,      // Remap secret names (and grant them)
  variableOverrides?: Record<string, string>,    // Remap variable names
  credentialOverrides?: Record<string, string>,  // Remap credential names (and grant them)
  secretGrants?: string[],                       // Secrets the app lends this addon
  credentialGrants?: string[],                   // Credentials the app lends this addon
  globalSecrets?: string,                        // Reason for handing over the whole SecretService
  globalCredentials?: string,                    // Reason for handing over the whole CredentialService
})
```

**`auth`, `tags` and `scopes` only ever tighten.** `auth: false` is not honoured —
it would weaken the wiring's own gate — so the addon-level setting can require a
session but never waive one. The same package wired twice under two namespaces is
governed by the union of both instances' scopes and tags.

### An addon reads only the secrets it declared

An addon's `SecretService` and `CredentialService` are **scoped**: it may read
the secrets its own source declares (literal `getSecret('X')` calls and
`wireSecret` definitions, which the CLI collects into `declaredSecrets`) and
nothing else. Anything undeclared throws `Access denied to secret key: X` at
runtime. The same holds for credentials, and a scoped addon can never call
`getAllUsers()`.

That works for an addon naming its own secrets. It does not work for a _generic_
addon whose secret names arrive as data — `@pikku/addon-graph` reads
`getSecret(auth.credential)`, where the name comes off the workflow node — so
such an addon declares nothing and is scoped to nothing. Only the consuming app
can widen it, with one of three fields:

```typescript
wireAddon({
  name: 'graph',
  package: '@pikku/addon-graph',

  secretGrants: ['STRIPE_KEY'], // lend these, unrenamed
  secretOverrides: { MAILGUN_KEY: 'PROD_EMAIL_KEY' }, // lend + rename
  // globalSecrets: 'why no static list can cover it' // lend everything
})
```

| field             | meaning                                 |
| ----------------- | --------------------------------------- |
| `secretOverrides` | grant **and** rename                    |
| `secretGrants`    | grant as-is                             |
| `globalSecrets`   | grant everything, with a written reason |

**Grants name the secret as the addon reads it**, not as your project stores it.
Scoping is checked _before_ the override map renames anything, so an overridden
secret is granted by its addon-side key — which is also why an override's key
grants and its value does not. With no rename in play the two names coincide.

`globalSecrets` / `globalCredentials` take the _reason_ for the grant, not a
boolean, because every grant is enumerated in the deploy manifest
(`unscopedSecretAddons`, `grantedSecretAddons`). Prefer `secretGrants` — reach
for `globalSecrets` only when no static list can exist, and never for an addon
that performs outbound requests, where an unrestricted secret read is an
exfiltration primitive.

A grant naming a secret your project does not declare is a build error from
`pikku all`, resolved through the override map first:

```
Secret grant 'STIRPE_KEY' in addon 'graph' (@pikku/addon-graph) targets a secret
that does not exist. Available secrets: BETTER_AUTH_SECRET, GITHUB_OAUTH
```

### `ref(name)`

Type-safe reference to a function — local or addon — for use in any wiring. It
returns a function config that proxies the call via RPC at runtime:

```typescript
import { ref } from '#pikku/function'

ref('todos:addTodo') // namespace:functionName for an addon function
ref('myLocalFunc') // a local function by name
```

There is no `addon()` helper; `ref()` covers both. For an addon that publishes
**wiring contracts** rather than bare functions, codegen also emits `refHTTP`,
`refChannel` and `refCLI`, which carry the addon's own route/config metadata:

```typescript
import { refHTTP } from '#pikku/function'

wireHTTP(refHTTP('todos:listTodos', { basePath: '/api' }))
```

### `pikkuAddonServices(factory)`

Define singleton services for an addon package (created once at startup). The
second argument is always present — an addon never falls back to its own logger,
variables or secrets; the consuming app supplies them:

```typescript
import { pikkuAddonServices } from '#pikku/addon/setup'

export const createSingletonServices = pikkuAddonServices(
  async (config, { secrets, logger }) => {
    const creds =
      await secrets.getSecret<GithubCredentials>('GITHUB_CREDENTIALS')
    return { github: new GithubService(creds.reveal()) }
  }
)
```

Export the call as it is. A cast around it (`pikkuAddonServices(...) as unknown
as CreateSingletonServices<...>`, `<T>`, `!`) hides the factory
from the inspector, which would leave it unregistered and the addon's workflows
failing at runtime; the build fails with `PKU564` instead. Fix the type the cast
was hiding. `satisfies` and parentheses are fine: the inspector reads through them.

`secrets` and `variables` arrive **typed against the addon's own declarations**,
and a secret is a `SecretValue` — `.reveal()` is the only way to the plaintext
(see `pikku-services`). `pikkuAddonConfig` is the matching factory for the addon's
config object.

### `pikkuAddonWireServices(factory)`

Define per-request services for an addon package (created fresh per HTTP request, queue job, etc.):

```typescript
import { pikkuAddonWireServices } from '#pikku/addon/setup'

export const createWireServices = pikkuAddonWireServices(
  async (singletonServices, wire) => {
    // wire: transport context (http, channel, session, etc.)
    const authHeader = wire.http?.request?.header('authorization')
    return {
      myService: new MyService(authHeader),
    }
  }
)
```

## Creating an Addon

### Scaffold

```bash
npx pikku new addon <name>          # name is a required positional
npx pikku new addon stripe --display-name Stripe --category Payments --dir addons
```

**Handed an OpenAPI or Swagger spec?** Don't hand-write the functions —
`pikku new addon <name> --openapi <spec>` generates one function per operation
(`<spec>` is a path, a URL, or a registry catalogue name such as
`amazonaws.com:applicationcostprofiler`; inside an app,
`pikku addons add <catalogue-name>` does the same and picks `--auth` for you),
with its schemas, service and credential. Read `references/openapi.md`.

This generates `package.json` (exports `.pikku/*` + `dist/`), `pikku.config.json` (`addon: true`), `tsconfig.json` (`#pikku` path mapping), `src/services.ts`, `src/functions/`, and `types/application-types.d.ts`. For the full file contents/exports you rarely hand-edit, read `references/addon-package-manifest.md`.

### Services

```typescript
// src/services.ts
import { pikkuAddonServices, pikkuAddonWireServices } from '#pikku/addon/setup'
import { TodoStore } from './todo-store.service.js'

export const createSingletonServices = pikkuAddonServices(async () => {
  const todoStore = new TodoStore()
  return { todoStore }
})

// Optional — only needed if addon functions require per-request services
export const createWireServices = pikkuAddonWireServices(
  async (singletonServices, wire) => {
    return {}
  }
)
```

### Functions

An addon's generated tree roots at `.pikku/addon/`, and its own source reaches
it by that path — `#pikku/addon/function`, `#pikku/addon/setup`. An application
authors against `#pikku/function`; an addon never does, because inside the addon
`#pikku/function` names a leaf that does not exist.

**Declare zod schemas in a file that never imports `#pikku`.** `pikku all` loads
the file that declares each schema to convert it, and at runtime `#pikku`
resolves through the package's `imports` — into a `dist` the first build has not
written yet. Inline, every schema fails with `Could not convert Zod schema …
Cannot find module …/dist/.pikku/…` and the addon never builds from clean. A
sibling `<fn>.schemas.ts` is what `--openapi` generates:

```typescript
// src/functions/addTodo.schemas.ts
import { z } from 'zod'

export const AddTodoInput = z.object({ title: z.string() })
export const AddTodoOutput = z.object({ id: z.string(), title: z.string() })
```

```typescript
// src/functions/addTodo.function.ts
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { AddTodoInput, AddTodoOutput } from './addTodo.schemas.js'

export const addTodo = pikkuSessionlessFunc({
  description: 'Adds a new todo',
  input: AddTodoInput,
  output: AddTodoOutput,
  func: async ({ todoStore }, { title }) => {
    return todoStore.add(title)
  },
})
```

Optional approval gating (e.g. for agent tools) — add `approvalRequired: true` plus an `approvalDescription` resolver:

```typescript
approvalRequired: true,
approvalDescription: async (_services, { title }) => `Add a todo called "${title}"`,
```

### Build

```bash
yarn build              # prebuild: pikku all, then tsc && pikku dist
yarn pikku validate     # Check the published file set holds together
```

`yarn pikku`, not `npx pikku`: a scaffolded addon carries `@pikku/cli` as a
devDependency, and building it against a different CLI than it declares is how
generated output ends up disagreeing with the packaged one. `npx pikku new
addon` above is the exception — it runs before the addon, and its CLI, exist.

`pikku dist` copies what `tsc` cannot emit — the generated `*.gen.json` meta and
the hand-written `types/*.d.ts` the generated files import — to where `tsc` put
everything else. Leave it out and the addon installs fine and fails to typecheck
in every app that depends on it, which is what `pikku validate` is there to
catch before you publish.

### Remote functions and the SDK

A `remote: true` function is called over the wire by apps that use
`wireRemoteAddon`. Those apps build against the addon's SDK, not its source, so
**a remote function's input and output must be exported zod schemas**. If it
uses generics (`pikkuSessionlessFunc<In, Out>`) or returns a type declared in
`src/`, codegen fails with PKU922. Functions that are not remote can keep their
generics.

```typescript
// src/functions/listNotes.schemas.ts
import { z } from 'zod'

export const NoteRows = z.array(z.object({ id: z.string(), body: z.string() }))
```

```typescript
// src/functions/listNotes.function.ts
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { NoteRows } from './listNotes.schemas.js'

export const listNotes = pikkuSessionlessFunc({
  output: NoteRows,
  func: async ({ kysely }) =>
    kysely.selectFrom('notes').select(['id', 'body']).execute(),
  remote: true,
})
```

```bash
yarn pikku all            # also writes .pikku/sdk/ + <scope>-<name>-<version>.sdk.tgz
yarn pikku versions check # fails on a remote contract changed without a new version
```

In an addon, `pikku all` packs the SDK on every run, at the package.json
version. The SDK carries only the remote RPCs, the `expose: true` workflows and
the types they reach. Changing a published `remote: true` contract needs a new
`version` on the function, which `pikku versions check` enforces.

### Calling another addon

Declare it in the addon's **package.json** (not pikku.config.json), by the
alias your code calls it by and a range:

```json
"pikku": { "uses": { "stripe": "@pikkustudio/addon-stripe@^0.12.0" } }
```

Then call it typed, with no cast and no hand-written wrapper:

```typescript
const charge = await rpc.invoke('stripe:charge', { amountCents })
await rpc.startWorkflow('stripe:refund', { chargeId: charge.chargeId })
```

`pikku all` in the addon types `stripe:*` from the dependency's SDK (its remote
surface). A package in the same workspace is read from its own
`<outDir>/sdk`, so run `pikku all` there first (PKU338 if missing, PKU354 if
its version is outside the range); anything else is fetched from the registry
and pinned in `pikku-addons.lock`. Never cast `rpc` or call by the package
name; the alias is the only name that works.

The app wiring your addon maps the alias with `uses`, local or remote alike:

```typescript
wireRemoteAddon({
  name: 'payments',
  package: '@pikkustudio/addon-stripe@^0.12.0',
  serverUrl,
})
wireAddon({
  name: 'billing',
  package: '@acme/addon-billing',
  uses: { stripe: 'payments' },
})
```

| Code   | The app's `pikku all` fails when                                    |
| ------ | ------------------------------------------------------------------- |
| PKU348 | an alias the addon declared is not mapped                           |
| PKU347 | it is mapped to a name not wired, or wired from another package     |
| PKU355 | `uses` maps a name the addon did not declare                        |
| PKU354 | the mapped instance's version is outside the range                  |
| PKU356 | the addon's `pikku.uses` entry is malformed (alias, type, no range) |

At runtime an unmapped alias, or the wired name called directly, throws
`AddonNotUsedError` (403) for invoke, workflows and agents.

### Studio screens

An addon declares the screens it adds to Pikku Studio with `definePlugin`, in
`src/screens.ts` (`pikku new addon-ui <name>` scaffolds one). It replaces
`defineScreens`, which no longer exists.

```typescript
import { definePlugin } from '@pikku/core/addon'

export default definePlugin({
  title: 'invoices__title', // message key: the addon's name in Studio
  screens: [
    {
      path: '/invoices',
      title: 'invoices_list__title', // message key, also the nav label
      scope: 'project', // 'studio' → /<path>, 'team' → /<team>/<path>,
      // 'project' → /<team>/<project>[/<target>]/<path>
      nav: {
        area: 'project',
        icon: 'receipt',
        order: 30,
        badge: 'unpaidCount',
      },
      needsApp: true, // project screens only; default false
      scopes: ['invoices:read'], // hides the screen; NOT access control
      component: () => import('./screens/Invoices.js'),
    },
    {
      path: '/invoices/print',
      title: 'invoices_print__title',
      scope: 'project',
      layout: 'bare',
      app: 'print',
    },
  ],
})
```

- A screen is a lazy `component` or an `app`, never both. `nav` is optional:
  without it the screen is routed but not listed. `nav.area` is `'rail'`,
  `'team'`, `'project'` or `'account'`; `badge` names one of the addon's
  functions that returns a count.
- `replaces: true` takes over the core screen at the same path (first-party
  addons only; Studio enforces that). `layout: 'bare'` renders without the shell.
- Titles are message keys in the addon's `messages/{locale}.json`, found by
  convention next to its `package.json`; there is no field for them.
- `agent: 'name'` makes that agent answer in Studio's chat panel (a second tab
  beside the general chat) while the screen is open. It resolves to
  `agents/<name>.md` at the addon's package root: the agent's instructions,
  which name the skills it follows (plain folders `skills/<name>/SKILL.md`).
  `agent: 'studio:<name>'` instead picks an agent Studio ships; `pikku all` only
  checks the format and looks up no file.
  The file starts with frontmatter whose `title` and `description` are message
  keys in `messages/en.json`. The name matches `/^[a-z][a-z0-9-]*$/`.
- `scopes` only hide the screen. The addon's functions must enforce the same
  scopes.

The inspector reads every field statically, so each must be a literal.
`pikku all` fails on:

| Code   | When                                                                                                 |
| ------ | ---------------------------------------------------------------------------------------------------- |
| PKU345 | a field is not a literal (variable, call, spread, bad value)                                         |
| PKU357 | two screens of the addon use the same path                                                           |
| PKU358 | a title or agent frontmatter key is missing from `messages/en.json`                                  |
| PKU359 | `nav.badge` names no function of the addon                                                           |
| PKU365 | `agent` is neither a name nor `studio:<name>`, or a name has no non-empty `agents/<name>.md`, or no frontmatter `title` and `description` |

A key missing from another locale's catalog is a warning.

### Database tables

An addon may **ship** tables. It must never **create** them: it runs inside the
consumer, against the consumer's database, so a boot-time `CREATE TABLE` puts a
second authority on a schema the consumer's migrations own. It declares instead,
and the consumer's migration history absorbs the declaration.

Author the DDL per dialect:

```text
db/sqlite/0001-labels.sql
db/postgres/0001-labels.sql
db/mysql/0001-labels.sql
```

`db/mysql` is the one that needs a server to publish: MySQL has no embedded
engine, so `pikku all` applies the SQL to a scratch database on the server named
by `db.mysqlUrl` in the addon's `pikku.config.json`, and refuses to build
without one. Use `varchar(n)` for a key column — MySQL rejects `TEXT` there.

`pikku all` publishes `<outDir>/db/pikku-db-meta.gen.json` on every build — per
dialect, the SQL verbatim plus a table/column map — and writes it **empty** when
the addon has no tables, because a consumer reads an absent file as a package
that cannot say. (`pikku db export` writes the same file on demand.) The
consumer resolves it **through the package name**, so it must be exported and
packed, or it never arrives:

```json
{
  "exports": {
    "./.pikku/db/pikku-db-meta.gen.json": "./dist/.pikku/addon/db/pikku-db-meta.gen.json"
  },
  "files": ["dist"]
}
```

**An unresolvable artifact stops `db generate`.** Because the file is
unconditional, absence means the package cannot say whether it ships tables —
either it was built with an older CLI, or `exports`/`files` do not carry it. The
error names both causes. An addon with genuinely no tables is _not_ this case:
it publishes `{}` and is waved through.

Two more loud ones: a malformed artifact (missing the SQL for a dialect it
claims) is rejected rather than half-applied, and an addon publishing only a
dialect the consumer does not use gets an error naming what it does support.

`verifiers/db-schema` runs this end to end on both dialects — copy its addon
`package.json` when wiring a new one.

## Consuming an Addon

### Install & Register

```bash
yarn add @my-org/addon-todos
```

```typescript
// wirings/todos.wirings.ts
import { wireAddon } from '#pikku/addon'

wireAddon({ name: 'todos', package: '@my-org/addon-todos' })
```

After registration, run `yarn pikku all` to generate types for the addon's functions.

In a workspace, add the addon to the dependencies of the package whose file
calls `wireAddon`, not the repo root. Codegen resolves an addon from the
package that wires it first and the project root second, the way that
package's own imports resolve at runtime, and a remote addon's
`devDependencies` check reads that same package's manifest. If codegen reports
PKU340, the dependency is missing from the package its message names — do not
add it at the root to paper over it. `verifiers/addon-workspace` is that layout.

If the addon ships tables, `pikku db generate` then writes one migration per
addon — named after the package, carrying the addon's own SQL — after Better
Auth's and the runtime's, so an addon table may reference `user` or a runtime
table. `pikku db migrate` applies it; re-running `generate` writes nothing once
covered, and writes only the delta after an addon upgrade. An addon wired with
`wireRemoteAddon` contributes no schema at all: its tables belong to the
deployment that runs its functions.

A `wireRemoteAddon` whose `package` carries a range (`'@scope/name@^1.4.0'`)
is not installed at all: `pikku all` downloads its SDK into
`.pikku/remote` and pins it in `pikku-addons.lock` (commit the lock). If
codegen reports PKU338 for one, run `pikku all`, not an install; to move
to a newer SDK, edit the range by hand (`pikku update` prints the file:line
and the new literal; it never rewrites source), then run `pikku all`.

### Call via RPC

```typescript
export const myFunc = pikkuFunc({
  func: async (_services, data, { rpc }) => {
    const todo = await rpc.invoke('todos:addTodo', { title: 'Buy milk' })
    return todo
  },
})
```

### Wrap an addon function only to reshape it

A screen that shows the addon's data as the addon returns it calls the addon
function itself: name it in `wireAddon({ expose: ['listTodos'], auth: true })`
and the frontend calls `rpc.invoke('todos:listTodos', …)` (over HTTP,
`POST /rpc/todos:listTodos` with `{ "data": … }`), still behind the session.
Use `ref('todos:listTodos')` on an HTTP or MCP wiring only when the addon needs
a route of its own. Don't write an app function that calls `rpc.invoke` and
returns the result unchanged: it's a second name and a second schema for the
same thing, and it drifts. Nothing in an addon is reachable over `/rpc` until
the wiring opts in, and it can only open what the addon itself declared
`expose: true` — an OpenAPI-generated addon declares every operation, so list
the ones the frontend needs.

Write your own function when the app needs the data narrowed, typed, or
combined (a flag the upstream sends as `"0"`, a total summed from several
calls, one field out of fifty), or when the app adds a permission of its own.
`wireAddon`'s `scopes` gate every function in the addon at once, and a wiring
carries middleware, not permissions, so a rule on one addon function lives in
the `permissions` of an app function that calls it. An addon called with the
user's own credential is already limited upstream to what that user may do, so
a data-aware `pikkuPermission` repeating that check (may they read _this_
invoice?) adds nothing. A session-only `pikkuAuth` (a role, a tier) is still
worth it: it can be checked before any input exists, so the functions a user
can't call drop out of the tools an MCP client, an agent or a workflow is
offered, instead of failing upstream when called. Name it for what the screen means
(`getMyProfile`), not after the upstream operation (`usersRetrieveInfo`), and
give it an `output:` schema of only what the app uses. For an OpenAPI-generated
addon this matters more: its outputs mirror the upstream's loose, oversized
payloads, and the wrapper is where they become the app's own shape.

### Wire to HTTP

```typescript
import { wireHTTP } from '#pikku/http'
import { ref } from '#pikku/function'

wireHTTP({
  method: 'get',
  route: '/todos',
  func: ref('todos:listTodos'),
  auth: false,
})
```

Or batch multiple addon routes with `defineHTTPRoutes` + `wireHTTPRoutes`:

```typescript
import { wireHTTPRoutes, defineHTTPRoutes } from '#pikku/http'
import { ref } from '#pikku/function'

const todoRoutes = defineHTTPRoutes({
  tags: ['todos'],
  auth: false,
  routes: {
    list: { method: 'get', route: '/todos', func: ref('todos:listTodos') },
    add: { method: 'post', route: '/todos', func: ref('todos:addTodo') },
  },
})

wireHTTPRoutes({ basePath: '/api', routes: { todos: todoRoutes } })
```

### Use in AI Agents

```typescript
import { pikkuAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { ref } from '#pikku/function'

export const todoAgent = pikkuAgent({
  name: 'todo-agent',
  description: 'Manages a todo list',
  goal: 'You help users manage their todos.',
  model: 'openai/gpt-5-mini',
  tools: [
    ref('todos:listTodos'),
    ref('todos:addTodo'),
    ref('todos:deleteTodo'),
  ],
  maxSteps: 5,
})
```

See `pikku-agent` — an addon function is just another `ref()` in `tools`.
