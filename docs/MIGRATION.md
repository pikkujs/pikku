# Upgrading to Pikku 0.13

This guide is for apps on an early 0.12.x release (from `@pikku/core` 0.12.0, February 2026, up to around 0.12.60) that are moving to 0.13.

Until 0.13, breaking changes shipped as patch releases. Each package CHANGELOG records them one at a time. This page collects them in one place and groups them by package. Each entry says what changed, why, what to write instead, and how to find the code it affects.

Version numbers in brackets are the release of the named package that shipped the change, for example "(core 0.12.142)". The full reasoning for each change is in that package's `CHANGELOG.md` under the commit hash given.

## Contents

- [0.13.0 changes](#0130-changes)
- [How to upgrade](#how-to-upgrade)
- [`@pikku/core`](#pikkucore)
- [`@pikku/cli` and `pikku.config.json`](#pikkucli-and-pikkuconfigjson)
- [Runtimes](#runtimes)
- [Services](#services)
- [`@pikku/better-auth`](#pikkubetter-auth)
- [Frontend and removed packages](#frontend-and-removed-packages)
- [Database changes](#database-changes)

## 0.13.0 changes

> **TODO (release workstream):** fill in this section when 0.13.0 is cut. Known items so far:
>
> - `@pikku/core/services` no longer re-exports the in-memory workflow, queue, trigger and gateway services (pending `refactor/core-services-surface`).

### The mesh is named `mesh`, and remote addons use the public RPC route

Cross-unit RPC inside one app (the deploymentService "mesh") no longer shares the word "remote" with `wireRemoteAddon`. See [`remote-rpc.md`](./remote-rpc.md).

| Before                                          | After                                       |
| ----------------------------------------------- | ------------------------------------------- |
| `PIKKU_REMOTE_SECRET`                           | `PIKKU_MESH_SECRET`                         |
| `POST /remote/rpc/:rpcName`                     | `POST /mesh/rpc/:rpcName`                   |
| `rpc.remote(name, data)`                        | `rpc.mesh(name, data)`                      |
| `pikkuRemoteAuthMiddleware`                     | `pikkuMeshAuthMiddleware`                   |
| `@pikku/core/remote`, `buildRemoteHeaders`      | `@pikku/core/mesh`, `buildMeshHeaders`      |
| `pikku enable remote-rpc`, `scaffold.remoteRpc` | `pikku enable mesh-rpc`, `scaffold.meshRpc` |
| queue `pikku-remote-internal-rpc`               | queue `pikku-mesh-rpc`                      |

Mesh tokens now use audience `pikku-mesh` and a new session-encryption info string, so deploy every unit of a split app together. Search: `rg -n "PIKKU_REMOTE_SECRET|remote/rpc|rpc\.remote\(|pikkuRemoteAuth|core/remote|remoteRpc|remote-rpc"`.

`remote: true` on a function is unchanged: it still publishes the function to `wireRemoteAddon` consumers and gives it a mesh route in split deploys.

### `wireAddon` and `wireRemoteAddon` `expose` is opt-in

An addon's `expose: true` functions are no longer reachable through `rpc.exposed` (`POST /rpc/:rpcName`) just because the addon is installed. Add `expose: true` to the `wireAddon` call to keep them, or a list to choose some. A list can no longer open a function the addon did not declare `expose: true`; PKU343 now names such an entry. Server-side `rpc('ns:fn')` calls are unaffected. Search: `rg -n "wireAddon\(" -A6`.

### `wireRemoteAddon` posts to the host's public RPC route

A remote-addon call now goes to `{serverUrl}/rpc/<fn>`, with the header `x-pikku-remote-contract: 1`. A host serving a remote addon needs `scaffold.rpc`, and each function it serves to consumers must be `expose: true` and `remote: true`; the host refuses any other function on such a call. `RemoteAddonRequestError` is gone: a failed call throws the host's registered `PikkuError`, the standard error for its status, `RemoteAddonFailedError` (502) or `RemoteAddonTimeoutError` (504). `wireRemoteAddon` gains `expose`, `timeoutMs` (default 30s) and `headers`.

### `wireAddon` `uses` may map only what the addon declares

When an addon declares `pikku.uses` in its `package.json`, every key of `uses`
on its `wireAddon` must be one of those names. A key the addon does not declare
is now a build error (PKU355) instead of extra reach the addon never asked for.
Remove the key, or have the addon declare it. Addons that declare nothing are
unaffected. Search: `rg -n "uses:" -B4 | rg "wireAddon"`.

An addon can now declare `pikku.uses` as `{ alias: 'package@range' }` and call
the dependency by the alias with full types. See
[An addon calling another addon](./remote-rpc.md#an-addon-calling-another-addon).

## How to upgrade

There are no codemods. The old names are removed with no aliases, and in most cases there is no deprecation shim either. Work through the steps below in order.

1. **Check the runtime.** Node ≥ 24 is required (core 0.12.58). Server and container deploys run on bun (see [Runtimes](#runtimes)).
2. **Update the dependencies.** `pikku update` reports which `@pikku/*` ranges can move and which peers they need. `pikku update --update` writes the new ranges into every `package.json`, and `--update-peers` writes the peer ranges as well.
3. **Rename what this guide lists.** Each entry has a search pattern. The patterns use [ripgrep](https://github.com/BurntSushi/ripgrep); `grep -rnE` takes the same regular expressions. Search your source, `pikku.config.json`, `.env*` files and CI configuration.
4. **Regenerate.** Run `pikku all`. Codegen now refuses removed config keys by name (for example `locale`, `startServerFnsFile` and `scaffold.*.auth`), so a stale config fails at load instead of being ignored.
5. **Migrate the database.** Pikku's runtime tables are no longer created when the app boots. Run `pikku db generate` and then `pikku db migrate`, and apply the hand-written renames in [Database changes](#database-changes) first.
6. **Validate.** `pikku validate` and `tsc`. Some renames do not cause type errors, because the inspector matches some declarations by identifier text (see [`define*`](#wiring-declarations-are-now-define)). Run the searches even when the build is clean.

`@pikku/migrator-sql` is not a code migrator. It applies `.sql` migration files and keeps their bookkeeping, for `pikku db migrate` and for standalone bundles.

A quick first pass that finds most of the old names:

```bash
rg -n --hidden -g '!node_modules' -g '!.pikku' -e \
  "from '@pikku/core'|@pikku/core/(ecosystem|internal|persona|actor-flow|ai-agent|ai-scorer|data-lock|services/gopass-secrets)|\
pikkuAI(Agent|Scorer|Judge)|\bwire(Scope|Secret|Variable|Credential)\(|definePersonas|selfAuthenticated|\
withRunLock|onError:|ensurePikkuSchema|\baddMiddleware\(|addTagPermission|addHTTPPermission|ZodLike|\
pikkuUserFlow|FABRIC_|pikkuFabric|pikku (fabric|persona|userflow|tests|console)\b|@pikku/cli/cloud|\
@pikku/(mantine|cucumber|shadcdn|react-layout-panel|console|db-migrator|sql-migrator)\b"
```

---

## `@pikku/core`

### The package root, `@pikku/core/ecosystem/*` and `@pikku/core/internal` are gone

**What:** `import { … } from '@pikku/core'` no longer resolves to the framework surface. The `.` entry is now a type-only shim kept for the pinned bootstrap CLI. The `@pikku/core/ecosystem/*` facades and the `@pikku/core/internal` alias were deleted too (core 0.12.83 `438b776`, core 0.12.85 `266e3bc`, core 0.12.90 `cfd364a`).

**Why:** every name was published at two or three specifiers, and the root was a 206-name barrel that no bundler could split. Every name now lives on the subpath that owns it. `./types`, `./state` and `./classification` were added as entry points for names that had no other home.

```ts
// before
import {
  PikkuError,
  pikkuMiddleware,
  CorePikkuFunctionConfig,
} from '@pikku/core'
import { StepState } from '@pikku/core/ecosystem/workflow'

// after
import { PikkuError } from '@pikku/core/errors'
import { pikkuMiddleware } from '@pikku/core/middleware'
import { CorePikkuFunctionConfig } from '@pikku/core/function'
import { StepState } from '@pikku/core/workflow'
```

Where some names moved:

- The middleware factories (`pikkuMiddleware`, `pikkuMiddlewareFactory`, `pikkuChannelMiddleware`, `pikkuChannelMiddlewareFactory` and `pikkuAgentMiddleware`) are on `@pikku/core/middleware`.
- The function meta types and `PikkuRequest` are on `@pikku/core/function`.
- `SerializedError` is on `@pikku/core/errors`.
- The duration and versioned-id helpers are on `@pikku/core/utils`.

`packages/core/package.json` → `exports` lists every subpath. App code normally imports from the generated `#pikku/*` leaves, so most of this affects hand-written adapters and services.

**Find:** `rg -n "from '@pikku/core'|@pikku/core/(ecosystem|internal)"`

### Wiring declarations are now `define*`

**What:** `wireScope` → `defineScope`, `wireSecret` → `defineSecret`, `wireVariable` → `defineVariable`, `wireCredential` → `defineCredential` (core 0.12.73 `a7b26c5`). Their subpaths are unchanged.

**Why:** `wire*` now always means a transport that runs something. `define*` means a declaration that the inspector reads and that does nothing at runtime.

```ts
// before
wireScope({ admin: { scopes: { invoices: {} } } })
wireSecret({ name: 'stripe', secretId: 'STRIPE_KEY', schema })

// after
import { defineScope } from '@pikku/core/scope'
import { defineSecret } from '@pikku/core/secret'
defineScope({ admin: { scopes: { invoices: {} } } })
defineSecret({ name: 'stripe', secretId: 'STRIPE_KEY', schema })
```

A stale `wire*` call is **not** a type error. It is silently not extracted, and the problem shows up later as "scope not declared". An addon whose `.pikku` output was generated before this change has to be rebuilt.

**Find:** `rg -n "\bwire(Scope|Secret|Variable|Credential)\("`

### Variables: `required` is gone, `optional` replaces it

**What:** `CoreVariable` and `VariableDefinitionMeta` no longer have `required`. Every variable is now required unless it declares `optional: true`, which is how secrets already worked (`4dcd1043e`, #1369).

```ts
// before
defineVariable({ name: 'apiBase', variableId: 'API_BASE', required: true })
defineVariable({ name: 'beta', variableId: 'BETA_FLAG' })

// after
defineVariable({ name: 'apiBase', variableId: 'API_BASE' })
defineVariable({ name: 'beta', variableId: 'BETA_FLAG', optional: true })
```

**Find:** `rg -n "required:\s*(true|false)" -g '*variable*'`. Also check every `defineVariable` call: a variable that may be absent now needs `optional: true`, or the deploy gate blocks on it.

### Personas, actors and user flows are now virtual users

**What:** the testing and synthetic-user surface was renamed twice. User flows became scenarios in core 0.12.52 (`472a349`). Actors and personas became virtual users in core 0.12.142 (`33b102d`, `a084c3b`). Nothing is aliased.

| Before                                                                                                                           | After                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `pikkuUserFlow`, `pikku userflow run/list`, meta flag `userFlow`                                                                 | `pikkuScenario`, `pikku scenario run/list`, `scenario`                                        |
| `definePersonas({...})`                                                                                                          | `defineVirtualUsers({...})` (`@pikku/core/virtual-user`)                                      |
| `@pikku/core/persona`                                                                                                            | `@pikku/core/virtual-user`                                                                    |
| `@pikku/core/actor-flow`                                                                                                         | `@pikku/core/virtual-user/conversation`                                                       |
| `pikku persona list/run/sync`                                                                                                    | `pikku virtual-user list/run/sync`                                                            |
| step option `actor: true`, `wire.actor`, `{ actor: actors.x }`                                                                   | `virtualUser: true`, `wire.virtualUser`, `{ virtualUser: … }`                                 |
| `requireActor(scenarioStep)`                                                                                                     | removed: declare `virtualUser: true` and read `wire.virtualUser`                              |
| `personaEmail(id, domain, runId)`                                                                                                | `virtualUserEmail(id, domain, runId)` and `virtualUserEmails(ids, domain, runId)`             |
| `PIKKU_ALLOW_ACTOR_SIGN_IN`, `PIKKU_DEV_ACTOR_SIGN_IN`                                                                           | `PIKKU_ALLOW_VIRTUAL_USER_SIGN_IN`, `PIKKU_DEV_VIRTUAL_USER_SIGN_IN` (and the `VITE_*` copy)  |
| `SCENARIO_ACTOR_SECRET`, `PIKKU_PERSONA_SECRETS` (and their short-lived `*_VIRTUAL_USER_*` renames), `pikku virtual-user secret` | removed: virtual users sign in with a signed statement (see [better-auth](#pikkubetter-auth)) |
| sign-in route `/sign-in/actor`, `/sign-in/persona`                                                                               | `/sign-in/virtual-user`                                                                       |
| default email domain                                                                                                             | `virtualuser.invalid`                                                                         |

When an app relies on the default email domain, the next provisioning creates new accounts (`pikku virtual-user sync`, a deploy, or the start of `pikku dev`). The old rows are left in place, unused.

`createCookieJar` and `createHttpVirtualUsers` are exported from `@pikku/core/virtual-user`. `createHttpVirtualUsers` no longer takes `secret` or `operator`. `wireVirtualUserSignIn` is removed.

The database columns were renamed as well. See [Database changes](#database-changes).

**Find:** `rg -n -i "persona|\bactors?\b|userflow|user_flow|ACTOR_SIGN_IN|ACTOR_SECRET"`

### Scenario steps: surfaces, phases and the scenario subpath

- **Per-surface bindings** (core 0.12.73 `86a50b9`). `browser: true` with `func`, and the third `B extends boolean` type argument, are gone. A step declares one implementation per surface:

  ```ts
  // before
  pikkuScenarioStep<In, Out, true>({ name, browser: true, func: async (…) => … })

  // after
  pikkuScenarioStep<In, Out>({
    name,
    browser: async (services, data, { browser }) => { … },
    default: async (services, data, { rpc }) => { … },
  })
  ```

- **No `scenario.step`** (core 0.12.82 `fd72e58`). Each step is a `given`, a `when` or a `then`. `then` is not just a new name for `step`: every binding of a `then` step runs, and the bindings must agree.
- **Scenario imports moved** to `@pikku/core/scenario` (core 0.12.83 `438b776`), off `@pikku/core/workflow`. This covers `requireScenarioEnv`, `pollUntil`, `addFeature` and `ScenarioHttpResponse`. `ScenarioRpcResponse` is now `ScenarioHttpResponse` (`5396ec2d3`).
- **`FileScenarioRunStore`, `scenarioArtifactContentType` and `scenarioRunSummary` left `@pikku/core/services`** (core 0.12.138 `15c4968`), because they use `node:fs`. Import them from `@pikku/core/services/file-scenario-run-store`.
- **Assertions are not retried** (core 0.12.85 `02a70cd`). `expect*` helpers default to `retries: 0`. A scenario that passed only because an assertion was retried now fails.
- **`pikkuScenario` takes no `auth`, `scopes` or `permissions`** (core 0.12.66 `b501612`).

**Find:** `rg -n "browser:\s*true|scenario\.step\(|ScenarioRpcResponse|FileScenarioRunStore|from '@pikku/core/workflow'"`

### Agents: `AI*` → `Agent*`

**What:** the agent runtime was renamed (core 0.12.84 `7406bfe`, #596). The model-provider types keep their names: `AIEmbeddingService`, `AIProviderOptions`, `AI*Params`, and the `@pikku/ai-*` packages.

| Before                                                          | After                                                               |
| --------------------------------------------------------------- | ------------------------------------------------------------------- |
| `pikkuAIAgent`, `pikkuAIScorer`, `pikkuAIJudge`                 | `pikkuAgent`, `pikkuAgentScorer`, `pikkuAgentJudge`                 |
| `CoreAIAgent`, `AIAgentInput`, `AIAgentStep`, `AIMessage`       | `CoreAgent`, `AgentInput`, `AgentStep`, `AgentMessage`              |
| `AIAgentRunnerService`, `AIStorageService`, `AIRunStateService` | `AgentRunnerService`, `AgentStorageService`, `AgentRunStateService` |
| `@pikku/core/ai-agent`, `@pikku/core/ai-scorer`                 | `@pikku/core/agent`, `@pikku/core/agent-scorer`                     |
| queues `ai-score-fast`, `ai-score-slow`                         | `agent-score-fast`, `agent-score-slow`                              |
| tables `ai_*`                                                   | `agent_*` (see [Database changes](#database-changes))               |

Drain the old scorer queues before you deploy. `pikku all` deletes and regenerates an agent scaffold that still imports a removed entry point, so move any local edits out of `<scaffold>/agent/agent.gen.ts` first.

Agents declare their model as `<provider>/<model>` (for example `openai/gpt-4o`). The `models`, `agentDefaults` and `agentOverrides` config blocks are gone (core 0.12.21 `9060165`).

Sessionless agent threads are no longer shared (core 0.12.74 `afef587`). Reading, listing, resuming or approving an existing thread needs a session principal. A sessionless agent still runs, but each conversation lasts for one request only.

**Find:** `rg -n "pikkuAI(Agent|Scorer|Judge)|\bAI(Agent|Message|Storage|RunState)|ai-(agent|scorer)|ai-score-|agentDefaults|agentOverrides"`

### Authorization: function-scoped permissions, opt-in escape hatches

- **Permissions are declared on functions only** (core 0.12.64 `c478794`, #972; core 0.12.80 `e3b4c14`). Wire-level, tag-level and HTTP-route-level permissions are removed: `addTagPermission`, `addHTTPPermission`, and the `permissions` field on HTTP, channel and MCP wirings. Global permissions are combined with AND. A function's own permissions are combined with OR. Both gates have to pass.

  ```ts
  // before
  addHTTPPermission('/admin/*', { isAdmin })
  wireHTTP({ route: '/admin/x', method: 'post', func, permissions: { isAdmin } })

  // after
  const adminOnly = pikkuFunc({ func: …, permissions: { isAdmin } })
  addGlobalPermission(…) // app-wide, ANDed
  ```

- **`addMiddleware` is gone** (core 0.12.98 `80eb5c0`). Use `addTagMiddleware` or `addGlobalMiddleware`. The inspector matches the call by name, so a leftover `addMiddleware(...)` compiled and registered nothing.
- **`scopes` are gone from `pikkuSessionlessFunc`** (core 0.12.75 `dd19aa7`). A scope check always fails when there is no session, so the field could never pass.
- **`selfAuthenticated` is now `permissionsInBody`**, and it has to be allowed in `pikku.config.json`. `pikkuWorkflowComplexFunc` needs the same opt-in (otherwise PKU576 and PKU643):

  ```json
  { "allow": { "permissionsInBody": true, "complexWorkflows": true } }
  ```

- **`wireGateway` takes no `permissions`.** Gateway handlers now go through the function runner, so their own `auth`, `scopes` and `permissions` apply. `CoreWorkflow` lost its unused `permissions` field (core 0.12.66 `b501612`).
- **`wireAddon`'s `auth`, `tags` and `scopes` now apply to direct wirings** of an addon function, not only to `namespace:fn` RPC calls (core 0.12.74 `afef587`).
- **`ZodLike` is removed.** Import `StandardSchemaV1` from `@standard-schema/spec`.

**Find:** `rg -n "addTagPermission|addHTTPPermission|\baddMiddleware\(|selfAuthenticated|ZodLike"`. Also search for `permissions:` on `wireHTTP`, `wireChannel` and `wireGateway` calls, and for `scopes:` inside `pikkuSessionlessFunc`.

### Workflows

- **`withRunLock` → `withRunLease`, and persistent workflow services require `leaseService`** (core 0.12.133 `a16b0ba`). Runs and steps are held on the app's `LeaseService` instead of `pg_advisory_lock`, `GET_LOCK` or Redis `SET NX`. `PgWorkflowQueueOptions` and `RunLockHoldTimeoutError` are removed. A custom workflow service that overrides `withRunLock` has to rename it.

  ```ts
  // before
  const workflowService = new PgKyselyWorkflowService(db)
  const redisWorkflows = new RedisWorkflowService(redis, 'workflows')

  // after
  import { PgKyselyLeaseService } from '@pikku/kysely-postgres'
  const leaseService = new PgKyselyLeaseService(db)
  const workflowService = new PgKyselyWorkflowService(db, { leaseService })
  const redisWorkflows = new RedisWorkflowService(redis, {
    leaseService,
    keyPrefix: 'workflows',
  })
  return { leaseService, workflowService /* register the same leaseService */ }
  ```

  The lease services are `InMemoryLeaseService` (`@pikku/core/services`), `PgKyselyLeaseService`, `MySQLKyselyLeaseService`, `KyselyLeaseService` (SQLite, single host only) and `RedisLeaseService`. They need the `pikku_lease` table and the `workflow_step.lease_expires_at` column, which `pikku db generate` writes.

- **The `onError` step option and graph `onError` node field are removed** (core 0.12.135 `ce3e5f5`). A graph node uses `recover` (`nodeId`, `nodeId[]` or `'ignore'`) and reads the failure from `wire.graph.recoveringFrom`. A DSL workflow undoes completed steps with saga compensation: a function declares `compensate`, `workflow.milestone(name)` bounds how far the unwind goes, and `{ compensate: false }` opts a call out. `getRunSteps` is now abstract on `PikkuWorkflowService`.

  ```ts
  // before (graph)
  { charge: { func: 'chargeCard', onError: 'refund' } }

  // after
  { charge: { func: 'chargeCard', recover: 'refund' } }
  ```

- **`inline: false` → `workflowQueued: true`** on function config (core 0.12.40 `ba1ab08`). A queued step now throws when no queue service is configured. Before, it quietly ran inline.
- **Dynamic, database-stored workflows are removed** (core 0.12.71 `a261006`). This removes `getAIGeneratedWorkflows`, `validateWorkflowWiring` and `computeEntryNodeIds`. `WorkflowService.getNodesWithoutSteps` is removed too (core 0.12.74 `6a307f0`).
- **A graph run starts only at a declared entry node** (core 0.12.80 `6dada45`). The generated `POST /workflow/:workflowName/graph/:nodeId` route is gone, and `approveStep` takes the caller's session.

**Find:** `rg -n "withRunLock|RunLockHoldTimeoutError|PgWorkflowQueueOptions|onError:|inline:\s*false|getAIGeneratedWorkflows|new (PgKysely|MySQLKysely|Kysely|Redis|MongoDB)WorkflowService\("`

### HMAC and webhooks

- **The HMAC helpers are async** (core 0.12.138 `15c4968`). `@pikku/core/hmac` now runs on Web Crypto. `hmacSha256Hex`, `hmacDigest`, `verifyHmacSignature` and `verifyPublicKeySignature` return a Promise, as do `WebhookService.sign`, `WebhookService.verify` and `verifySlackSignature` (`@pikku/gateway-slack`). `timingSafeStringEqual` is still synchronous. An empty or missing secret now always fails verification (`9b12c8a`).

  ```ts
  // before
  if (!verifyHmacSignature(body, signature, secret))
    throw new UnauthorizedError()

  // after
  if (!(await verifyHmacSignature(body, signature, secret)))
    throw new UnauthorizedError()
  ```

- **Webhook signing secrets live in the credential store** (core 0.12.128 `658f047`; core 0.12.135 `fb36c37`). `wireTriggerWebhookSource` no longer takes `secret`. Declare `verify`, and the runner checks every request against the credential `<name>WebhookSecret` before `receive` runs. `setup` writes that credential itself instead of returning `secret`, and `pikku webhooks setup` dropped `--secretsOut`. `WebhookSigningSecret` is removed.

  ```ts
  wireTriggerWebhookSource({
    name: 'github',
    verify: {
      hmac: {
        header: 'x-hub-signature-256',
        prefix: 'sha256=',
        algorithm: 'sha256',
        encoding: 'hex',
      },
    },
    receive: githubWebhookReceive,
  })
  ```

- **`receive` is declared with `pikkuWebhookReceive` and returns no `{ respond }`** (core 0.12.136 `149faae`). A handshake writes to `http.response` and returns nothing. An HTTP function that returns nothing is now answered with its response's status (200 by default) instead of a forced 204.

**Find:** `rg -n "hmacSha256Hex|hmacDigest|verifyHmacSignature|verifyPublicKeySignature|verifySlackSignature|webhookService\.(sign|verify)|WebhookSigningSecret|respond:"`. Also check every `wireTriggerWebhookSource` that passes `secret`.

### Secrets, content and other removals

- **Stored secrets and credentials must be set again** (core 0.12.74 `afef587`). The key derivation is now PBKDF2 with a salt. Values held by the Kysely, MongoDB and Redis secret services and by the Kysely credential service cannot be decrypted after the upgrade, and the app fails on the first read until each value is set again.
- **`PIKKU_REMOTE_SECRET` must be at least 32 characters** (same release). Generate one with `openssl rand -base64 32`. Roll it out to every service in the mesh at once, because old bearer tokens no longer verify.
- **Signed content URLs bind the request path**, and `LocalContent` requires a `JWTService`. URLs signed before the upgrade stop working and must be issued again.
- **`ContentService` takes object arguments with a required `bucket`** (core 0.12.20 `66d1b4f`). For example `signURL({ bucket, key, … })`, `writeFile({ bucket, key, … })`.
- **`GopassSecretService` and `@pikku/core/services/gopass-secrets` are removed** (core 0.12.72 `6be5ab0`). Implement `SecretService` against your own secret backend.
- **The passphrase data lock is removed** (`b3bc7d635`). This removes `@pikku/core/data-lock`, `DataLock`, `wireDataLock`, `createDataLockResolver` and the `dataLocks` table. Column encryption remains. Supply your own `KEKResolver`.
- **`secretBroker` is removed, and addons are scoped** (core 0.12.82 `b930dca`). An addon reads only the secrets and credentials it declares. Grant more with `wireAddon({ secretGrants, credentialGrants })`, or `wireAddon({ globalSecrets: '<reason>' })`.
- **`OAuth2Client` and `createOAuth2Handler` are removed from `@pikku/core/oauth2`** (core 0.12.64 `9f0d0eb`, `1dc77d5`). Credential linking goes through better-auth's `credentialOAuth` plugin. The `OAuth2AppCredential` and `OAuth2Token` types remain.
- **`wireChannel` takes two type arguments**, `wireChannel<In, Channel>` (core 0.12.80 `f8f1244`).
- **MCP tools:** `wireMCPTool` was removed before 0.12.0. Put `mcp: true` on the function config. `wireMCPResource` and `wireMCPPrompt` still exist.

**Find:** `rg -n "GopassSecretService|data-lock|DataLock|secretBroker|OAuth2Client|createOAuth2Handler|wireMCPTool|contentService\.\w+\('"`

---

## `@pikku/cli` and `pikku.config.json`

### Fabric is now Pikku Studio Cloud

**What:** every Fabric name was removed with no aliases (core and cli 0.12.142 `fdcc821`). The CLI group was later moved into an addon bundled with the CLI (cli 0.12.187 `bf9bb86`).

| Before                                             | After                                                                                   |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `pikku fabric …`                                   | `pikku cloud …`                                                                         |
| `fabric.projectId` in `pikku.config.json`          | `cloud.projectId`                                                                       |
| `~/.fabric/`                                       | `~/.pikkustudio/` (run `pikku cloud login` again)                                       |
| `FABRIC_*` environment variables                   | `PIKKUSTUDIO_*` with the same suffix (`PIKKUSTUDIO_PROJECT_ID`, `PIKKUSTUDIO_TOKEN`, …) |
| the `/sign-in/fabric` operator route               | served by Pikku Studio Cloud itself; `@pikku/better-auth` no longer has a plugin for it |
| `@pikku/cli/cloud` (the typed cloud client)        | removed from the public surface. The client is internal to the CLI.                     |
| `pikku skills install --fabric`, the Fabric skills | removed from the open-source skills set (cli 0.12.187 `88c7d37`)                        |

The sealed-box salt `pikkufabric/sealed-box/v1` is unchanged, so secrets that were already sealed still open.

`pikku cloud deploy apply` now waits for the deploy to finish by default. The branch is a positional argument, and `-y` answers the prompts. `--sync`, `--branch`/`-b` and `--auto-apply` are gone. Use `--detach` to queue the deploy and exit without waiting (cli 0.12.134 `a0047d1`, 0.12.116 `1bba2a5`).

For the better-auth side of this rename, see [`@pikku/better-auth`](#pikkubetter-auth).

**Find:** `rg -n -i "fabric"`

### The Pikku Console is no longer served by the CLI

**What:** `packages/console` was removed from the monorepo (#2025). `pikku serve --console` is gone, `pikku dev` no longer mounts `/console`, and the CLI package no longer ships `console-app` (cli 0.12.185 `5da003f`). The `pikku console` command was removed earlier (cli 0.12.69 `f14a7df`). `@pikku/console` on npm is a deprecated stub. The console's backend functions live in `@pikku/addon-console`.

The administration functions (users, roles and scopes, credentials, audit) moved from `console:*` to `admin:*` in `@pikku/addon-admin` (`dc3ac77`). The console addon's privileged functions now require the `admin` scope by default. Run `pikku all` again, because an old `console.gen.ts` leaves them open.

**Find:** `rg -n "pikku (serve|dev).*--console|/console\b|console:(scope|credential|getAudits|getAuditFilters)|@pikku/console\b"`

### Removed and renamed commands

| Before                                | After                                                               |
| ------------------------------------- | ------------------------------------------------------------------- |
| `pikku tests`                         | `pikku scenario run` and `pikku dev --coverage` (cli 0.12.71)       |
| `pikku db seed`                       | `pikku db reset` seeds; `--no-seed` skips it (cli 0.12.98)          |
| `pikku persona …`, `pikku userflow …` | `pikku virtual-user …`, `pikku scenario …`                          |
| `pikku enable --noAuth`               | removed (see `scaffold` below)                                      |
| `pikku knowledge next` / `reconcile`  | `pikku knowledge gaps` (core 0.12.137)                              |
| `pikku deploy apply --desktop`        | a frontend's `native.bundleServer` (cli 0.12.175)                   |
| standalone `--runtime node`           | removed: the standalone provider builds for bun only (cli 0.12.177) |

### `pikku.config.json`

- **`allow`**: `permissionsInBody` and `complexWorkflows` have to be listed here before they can be used (see [Authorization](#authorization-function-scoped-permissions-opt-in-escape-hatches)).
- **`scaffold.<feature>`** is `boolean | { path?: string }` (cli 0.12.108 `8d6a6bc`, 0.12.111 `c858555`). The `auth` key and the `'auth'`/`'no-auth'` strings are refused at load. A feature that was `{ "auth": false }` becomes `true`.
- **`locale` → `metaLocale`** (cli 0.12.126 `967d1de`).
- **`clientFiles.startServerFnsFile` → `clientFiles.tanstackStartFile`** (`2783d93c6`).
- **`frontend` → `frontends`**. The one entry with `serve` is the frontend that `pikku serve`, `pikku dev` and standalone deploys mount (cli 0.12.175 `2dcc651`). App commands moved under `pikku app`.
- **`scenarios.actors` and `scenarios.personas` are gone.** Only `scenarios.emailDomain` remains, and virtual users are declared in code with `defineVirtualUsers`.
- **`models`, `agentDefaults` and `agentOverrides` are gone** (see [Agents](#agents-ai--agent)).
- **`node` → `addon`**, and `external` → `addon` everywhere (cli 0.12.3 `6e8777b`, core 0.12.1 `62a8725`). Addons are declared in code with `wireAddon({ name, package })`, not with an `addons` field in the config.
- **`verboseMeta` is removed** (cli 0.12.93).

**Find:** `rg -n "\"(locale|startServerFnsFile|frontend|actors|personas|models|agentDefaults|agentOverrides|node|external|addons|verboseMeta|auth)\"\s*:" pikku.config.json`

### `createConfig` and generated files

- **`createConfig` dev fields are flat** (cli 0.12.26 `3aaed21`):

  ```ts
  // before
  export const createConfig = pikkuConfig(async () => ({
    dev: { db: true, content: true },
  }))

  // after
  export const createConfig = pikkuConfig(async () => ({
    sqliteDb: '.pikku-runtime/dev.db',
    content: {},
  }))
  ```

  `createConfig` lives in its own `config.ts`, which is where `pikku db` looks for it (cli 0.12.111 `274cab3`).

- **Generated files renamed:** `db/schema.d.ts` → `db/schema.gen.ts`, `versions.json` → `versions.pikku.json` next to `pikku.config.json`, and `pikku-nodes-meta.gen.json` → `pikku-addon-meta.gen.json`.
- **Scenario codegen moved to `.pikku/scenarios/`**, with its own `pikku-bootstrap-scenarios.gen.ts`. Production bootstraps no longer import step bodies (core 0.12.70 `dc3e11e`).
- **The generated `#pikku` leaves no longer export** `createScenarioRunner`, `flattenAnalyticsEvent` or the feature flag values. Import those from `pikku-flags-manifest.gen.js`, where they are named `declaredFeatureFlags`, `featureFlagsMeta` and `featureFlagsFallback` (cli 0.12.180 `62680bf`).

---

## Runtimes

- **Node ≥ 24** for every package (core 0.12.58 `daec082`).
- **Server and container entries run on `@pikku/bun-server`**, and the generated Dockerfile uses `oven/bun` (cli 0.12.177 `fa83945`). `@pikku/node-http-server` no longer carries the `dispatchJobs` / `dispatchSecret` shim. The remote job inbox is served by the `scaffold.remoteJobs` routes.
- **Dispatch routes fail closed** (`@pikku/cloudflare` 0.12.17 `c2d4f86`, `@pikku/node-http-server` 0.12.8 `b28e2da`). `POST /__pikku/queue-job` and `/__pikku/scheduler-job` reject every request until `PIKKU_DISPATCH_SECRET` is set on the worker and sent in `x-pikku-dispatch`.
- **A deployed Cloudflare Worker is always production** (core 0.12.138 `6f11bb5`). The adapter pins `NODE_ENV=production`, so 5xx responses no longer include the error message or stack.
- **The better-auth framework adapters moved** into `@pikku/next` and `@pikku/tanstack-start` (`c899301`).

Package names: the runtimes are published as `@pikku/express`, `@pikku/express-middleware`, `@pikku/fastify`, `@pikku/fastify-plugin`, `@pikku/next`, `@pikku/lambda`, `@pikku/cloudflare`, `@pikku/azure-functions`, `@pikku/bun-server`, `@pikku/node-http-server`, `@pikku/uws`, `@pikku/uws-handler`, `@pikku/ws`, `@pikku/tanstack-start` and `@pikku/modelcontextprotocol`.

**Find:** `rg -n "dispatchJobs|dispatchSecret|PIKKU_DISPATCH_SECRET|\"node\":\s*\"[<>=~^ ]*(18|20|22)"`

---

## Services

- **Runtime tables are declared, not created at boot** (cli 0.12.111 `274cab3`; `@pikku/kysely`). `ensurePikkuSchema` is replaced by `requirePikkuSchema`, which only checks that the tables exist and stops with a message naming `pikku db generate` and `pikku db migrate` when they are missing. `pikku db generate` writes only the tables your project's services use.
- **Lease services and workflow constructors**: see [Workflows](#workflows).
- **Secrets have to be set again** after the PBKDF2 change: see [Secrets, content and other removals](#secrets-content-and-other-removals). The KEK salt table (Kysely), hash field (Redis) or collection (MongoDB) is created on first use.
- **`@pikku/pg` → `@pikku/kysely-postgres`**, **`@pikku/auth-js` → `@pikku/better-auth`**, and **`@pikku/db-migrator` / `@pikku/sql-migrator` → `@pikku/migrator-sql`**. The old packages are deprecated stubs or were never published.

**Find:** `rg -n "ensurePikkuSchema|@pikku/(pg|auth-js|db-migrator|sql-migrator)\b"`

---

## `@pikku/better-auth`

### Plugin factories: only the `pikku*` names

**What:** the bare aliases were removed (better-auth 0.12.35 `14059e0`). A bare `ban()` in a `plugins: [...]` list looked like one of better-auth's own factories. The current exports are `pikkuBan`, `pikkuVirtualUser`, `pikkuCredentialOAuth` and `pikkuDelegatedAuth`.

```ts
// before
plugins: [ban(), actor({ secret }), credentialOAuth({...}), delegatedAuth({...})]

// after
import { pikkuBan, pikkuVirtualUser, pikkuCredentialOAuth, pikkuDelegatedAuth } from '@pikku/better-auth'
plugins: [
  pikkuBan(),
  pikkuVirtualUser({ verifyKey: await variables.get('VIRTUAL_USER_VERIFY_KEY') }),
  pikkuCredentialOAuth({...}),
  pikkuDelegatedAuth({...}),
]
```

**Find:** `rg -n "\b(ban|actor|credentialOAuth|delegatedAuth|fabric|pikkuActor|pikkuFabric)\("`

### The Fabric/Cloud plugin is removed

**What:** `pikkuFabric` and `FabricPluginOptions` are removed, together with the `fabric` registry entry (better-auth 0.12.55 `39dc189`). Pikku Studio Cloud now serves the operator sign-in route itself. `@pikku/better-auth` has no Cloud plugin. Remove the plugin from `auth.ts`, and remove `FABRIC_AUTH_PUBLIC_KEY` and `FABRIC_STAGE_ID` as well. The default impersonation gate admits only callers holding `admin:impersonate`.

**Find:** `rg -n "pikkuFabric|FabricPluginOptions|FABRIC_AUTH_PUBLIC_KEY|FABRIC_STAGE_ID"`

### Virtual user sign-in uses a signed statement

**What:** the shared actor and virtual-user secret is replaced by a short-lived, single-use EdDSA statement (better-auth 0.12.56 `a084c3b`). The app checks it against `VIRTUAL_USER_VERIFY_KEY`. `pikku dev` generates the key pair, and a deployed stage's deployer holds `VIRTUAL_USER_SIGNING_KEY`. `@pikku/jose` provides `JoseVirtualUserStatementVerifier`. In production, neither sign-in endpoint is registered.

```ts
// before
actor({ secret: await secrets.getSecret('SCENARIO_ACTOR_SECRET') })

// after
pikkuVirtualUser({ verifyKey: await variables.get('VIRTUAL_USER_VERIFY_KEY') })
```

Declare `VIRTUAL_USER_VERIFY_KEY` as an optional variable. Delete the `SCENARIO_*_SECRET` secret and any `wireVirtualUserSignIn` call. A stage that has to run scenarios still opts in with `PIKKU_ALLOW_VIRTUAL_USER_SIGN_IN`. Rename the user flag column too (see [Database changes](#database-changes)).

**Find:** `rg -n "SCENARIO_\w*SECRET|wireVirtualUserSignIn|OperatorSignIn|createMissing|PIKKU_PERSONA_CREATE_MISSING"`

### better-auth's `admin()` plugin is dropped; admin is scope-based

**What:** admin capabilities are scopes on an `admin` tree, not `user.role === 'admin'` (core 0.12.67 `ae4f59a`). The full `admin` scope still grants everything. better-auth's `admin()` plugin was then dropped (better-auth `20d8a39`).

- Remove `admin()` from `plugins`. Add `pikkuBan()` if you ban users.
- `callAdminApi`, `AdminApiHttpWire`, `syncProjectedAdminRole`, `projectedAdminRole` and `ADMIN_ROLE_SCOPES` are removed. `ADMIN_SCOPES`, `ADMIN_SCOPE_ROOT` and `ADMIN_SCOPE_TREE` are unchanged.
- User administration is exported as `createAuthUser`, `deleteAuthUser`, `revokeAuthUserSessions`, `setAuthUserBanned` and `setAuthUserPassword`.
- `user.role` and `session.impersonatedBy` are no longer declared. `pikku db generate` writes the migration. No code checks `user.role` as a fallback any more.

**Find:** `rg -n "\badmin\(\)|callAdminApi|AdminApiHttpWire|ProjectedAdminRole|ADMIN_ROLE_SCOPES|role\s*===\s*'admin'"`

### better-auth 1.7

`@pikku/better-auth` now uses better-auth 1.7.5 (`dfd7019`). Code that calls better-auth's internal adapter directly needs these changes: `findAccountByProviderId(accountId, providerId)` → `findAccountByKey({ providerId, accountId })`, `createUser` takes the provisioning source as its second argument, and `generateState` takes its link target by name.

---

## Frontend and removed packages

- **`@pikku/react`**:
  - The react-i18next shim is removed (react 0.12.4 `68c69b5`). `@pikku/react/i18n`, `useI18n` and `I18nProvider` are gone. Use Paraglide's `m()`.
  - The dev "Sign in as …" switcher is removed (cli 0.12.187 `8606fd7`): `useDevVirtualUsers`, `signInAsVirtualUser`, and the earlier `useDevActors` and `<DevActorSwitcher>`. To sign in with one click, post a virtual user id to `/auth/sign-in/switch-virtual-user`.
- **Removed packages:** `@pikku/mantine` (use Tailwind and shadcn), `@pikku/react-layout-panel` (now a shadcn registry item), `@pikku/cucumber` (use `pikkuFeature`, `pikkuScenario` and `pikkuScenarioStep`), `@pikku/shadcdn` (use `npx shadcn add`), and `@pikku/console` (see [the Console](#the-pikku-console-is-no-longer-served-by-the-cli)).
- **`@pikku/code-edit`**: the brand placeholder helpers, Unsplash search and site crawling are removed (`862a4f5`).
- **`@pikku/addon-graph`**: `graph:map` → `graph:fanout` (`cb079cc`).
- **`@pikku/addon-console`**: `getAddonMeta` is paginated (`{ cursor?, limit?, … }` → `{ packages, total, nextCursor }`), and the `oauth-*` functions are removed.

**Find:** `rg -n "@pikku/(mantine|react-layout-panel|cucumber|shadcdn|console)\b|@pikku/react/i18n|useI18n|useDev(Actors|VirtualUsers)|DevActorSwitcher|graph:map"`

---

## Database changes

Apply these renames **before** the first boot on the new version, then run `pikku db generate` and `pikku db migrate` to create what is new. The runtime no longer creates or alters tables.

```sql
-- Agent tables (core 0.12.84). MongoDB collections are renamed the same way.
ALTER TABLE ai_threads        RENAME TO agent_threads;
ALTER TABLE ai_message        RENAME TO agent_message;
ALTER TABLE ai_tool_call      RENAME TO agent_tool_call;
ALTER TABLE ai_working_memory RENAME TO agent_working_memory;
ALTER TABLE ai_run            RENAME TO agent_run;
ALTER TABLE ai_run_score      RENAME TO agent_run_score;

-- Virtual user runs and schedules (core 0.12.142)
ALTER TABLE virtual_user_run      RENAME COLUMN persona TO virtual_user_id;
ALTER TABLE virtual_user_schedule RENAME COLUMN persona TO virtual_user_id;
DROP INDEX idx_virtual_user_run_persona;
CREATE INDEX idx_virtual_user_run_virtual_user_id ON virtual_user_run (virtual_user_id, created_at);

-- better-auth user flag (better-auth 0.12.56)
ALTER TABLE "user" RENAME COLUMN actor TO virtual_user;
```

Created by `pikku db generate`:

- the `pikku_lease` table, for every project that runs workflows or uses `leaseService`;
- `workflow_step.lease_expires_at` (`bigint`, epoch milliseconds);
- the `audit` and `virtual-user` tables, which used to be created at boot;
- the removal of `user.role` and `session.impersonatedBy` once `admin()` is dropped, and the `banned`, `banReason` and `banExpires` columns that `pikkuBan()` adds.

`templates/online-shop/db/sqlite/` and `recipes/starter-template/db/sqlite/` contain the rename migrations as they were applied to those projects.
