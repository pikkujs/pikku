## 0.12.64

### Patch Changes

- 7ab5287: Security hardening (follow-up to the #966 C1/C3 fixes):
  - SSRF (C1): `isPrivateHost` now also rejects alias/encoded forms that resolve to internal targets — trailing-dot FQDNs (`localhost.`), the reserved `*.localhost` name, IPv4-mapped IPv6 (`::ffff:127.0.0.1`), octal/decimal/hex-encoded IPv4 (`0177.0.0.1`, `2130706433`, `0x7f000001`), and the full `fe80::/10` link-local range. `safeFetch` also strips `Authorization` and `Cookie` headers whenever a redirect crosses origin so credentials cannot leak to a redirected host.
  - Forgeable approval markers (C3): the sub-agent approval marker is now identified by a non-forgeable `Symbol` brand set only by framework code, instead of the plain `__approvalRequired` string key. A delegating tool's LLM-shaped `result.object` (plain JSON) can no longer conjure an approval/suspension even though the tool is allowed to forward approvals.

- e86bc17: Security + feature: bind AI agent thread/run ownership to the authenticated session and add `sessionScope: 'user' | 'org'` to agents. The owner key is now the trusted principal (`session.userId`, or `session.orgId` for org-scoped agents) composed with the client `resourceId` (`principal:resourceId`), so a client-supplied `resourceId` sub-partitions within the caller's own boundary but can never widen access to another user's or org's threads. Resolution is idempotent (safe for sub-agent recursion and resume); org scope with no session org is denied; sessionless `user` wirings fall back to the bare `resourceId`.
- a9b96a0: Security: only honor the `__approvalRequired` suspension marker from framework sub-agent tools (`forwardsApproval`), so an attacker-influenced ordinary tool result can no longer forge an approval/suspension.
- 3f7fc54: Security: SSRF-harden outgoing webhook delivery and voice-input audio fetch (validate scheme + block private/internal hosts, re-validate every redirect hop via a shared `safeFetch`); stop the channel stream-middleware cache from reusing an earlier run's per-invocation middleware closures across runs.
- c478794: Simplify authorization to be session + function based (#972). Permissions are now function-scoped only: global permissions AND together, a function's own permissions OR together, and the two are independent gates that both must pass — a broad global can no longer satisfy an admin-only function. Removed wire-, tag-, and HTTP-route-level permissions (`addTagPermission`, `addHTTPPermission`, wire-level `permissions` on HTTP/channel/MCP wirings). Tags are now organizational only. `auth` (session presence) and tag/HTTP middleware are unchanged.
- 3f04ae4: Fix `pikku dev` hot-reload memory leak (#975). Changed user files were re-imported under a fresh URL on every reload (a `data:` URL on Node, a uniquely-named temp sibling on Bun), which permanently leaked a record in the native ESM loader map — the dev server climbed to `JavaScript heap out of memory` during long editing sessions (worse on Bun, which the sandbox dev server runs on). Reloading now goes through an evictable module runner that transpiles the source and runs it via `vm.compileFunction`, holding exports under a stable path key so each edit overwrites one slot and the previous module is collected. Heap stays bounded on both runtimes.
- 90d9f04: Scope `console:getAddonInstalledPackage` to the addon's own `.pikku` metadata.

  Previously every addon returned the _app's_ secrets/wirings (read from the app's
  `.pikku` root), so the installed-package view couldn't show what a given addon
  actually requires. `MetaService` gains optional `readPackageFile`/`readPackageDir`
  helpers (implemented by `LocalMetaService`, which resolves the addon package's
  root from node_modules), and `getAddonInstalledPackage` now reads secrets,
  variables, wirings, schemas, README and package.json from the addon package
  itself. It also reads and returns the addon's `credentials` meta (OAuth2 + wire
  credentials), which was never surfaced before — entries with an `oauth2` field
  are the OAuth integrations to connect.

- cb079cc: A workflow-graph node's `func` can now reference a registered AI agent by name, dispatched as an agent run like sub-workflows, with `ref()` resolving the agent's output keys.
- cb079cc: `pikkuAIAgent` gains a `workflows: []` capability: a referenced workflow is exposed to the LLM as a tool that runs inline and returns its output.
- 0a7db82: AI agent tool `execute()` failures are now logged via `logger.error` unconditionally (then rethrown), instead of only surfacing when a tool-call middleware hook is registered.
- 981c4db: Add a model-baked `AIEmbeddingService` interface and optional `aiEmbedding` slot on `CoreSingletonServices`, with separate `embedDocuments`/`embedQuery` methods for vector-store addons.
- 13474a6: Generate a `ScopeId` union from `wireScope` declarations.

  `pikku all` now emits `.pikku/scopes/pikku-scopes.gen.ts` with a `ScopeId` union
  of every declared scope, plus a wildcard form for each node that has
  descendants. A project's generated `pikkuFunc` narrows `scopes` to that union,
  so an undeclared scope is a compile error with editor autocomplete:

  ```ts
  wireScope({ admin: { scopes: { invoices: { scopes: { create: {} } } } } })

  pikkuFunc({
    scopes: ['admin:invoices:create'],  // ✓ autocompleted
    func: ...,
  })

  pikkuFunc({
    scopes: ['admin:invoice:create'],   // ✗ compile error (typo)
    func: ...,
  })
  ```

  The inspector independently rejects undeclared scopes, so a cast that defeats
  the compiler is still caught at build time.

  Also fixes `getArrayPropertyValue` dropping any array behind a cast — idiomatic
  `tags: ['a'] as const` was previously invisible to the inspector and silently
  omitted from meta.

- 5a2b0d5: Prune removed addons on `pikku dev` hot-reload. Deleting an addon wiring (`*.addon.ts`) regenerated `.pikku` on disk but left its `wireAddon` entry stranded in the live `pikkuState(null,'addons','packages')` map until a full restart (the reimport path is add-only), so `getInstalledAddons` kept reporting deleted addons. `reloadGeneratedMeta`'s sibling `reconcileAddonRegistry(declaredNamespaces)` now drops any addon namespace the fresh inspection no longer declares, and the dev watcher calls it with `inspectorState.rpc.wireAddonDeclarations`. Routes already reconcile (http meta is replaced wholesale + router reset); function-impl entries are intentionally left since the workflow service registers framework internals there that aren't in the generated set.
- 13474a6: feat(scopes): grant scopes directly to a user, not only through roles

  A scope can now be granted to a user directly, outside of any role.
  `resolveScopes` returns the union of a user's role-derived scopes and their
  direct grants, so a one-off capability no longer requires inventing a role.
  - `@pikku/core`: `ScopeService` gains `addScopeToUser` / `removeScopeFromUser` /
    `listUserScopes`.
  - `@pikku/kysely`: a new `pikku_user_scope` table (FK into `pikku_scopes`, so the
    database still refuses an undeclared grant; `ON DELETE CASCADE` from `user`,
    so deleting a user takes their direct grants with it). `resolveScopes` unions
    it with the role join.
  - `@pikku/addon-console`: `scopeAddScopeToUser` / `scopeRemoveScopeFromUser`
    (gated by `pikku:scopes:manage`), and `scopeListUserRoles` now also returns
    `directScopes`.
  - `@pikku/console`: a **Direct scopes** section in the user roles drawer to grant
    and revoke scopes directly, showing them distinctly from the resolved union.

  Also: the Scopes page now distinguishes a permission error (a console admin
  without `pikku:scopes:read`) from an actual scope-service outage, instead of
  showing "the scope service may be unavailable" for both.

- ee040dc: fix(ai-agent): resolve addon-scoped services when generating a tool's approval description. The `approvalDescription` for an addon function ran against a cold per-package services cache and silently fell back to root services, so descriptions reading addon-only services (e.g. a todo store) threw and the approval `reason` never reached the client. It now builds the addon's singleton services the same way the tool's `execute` path does (#971).
- cb079cc: `pikkuWorkflowGraph` nodes accept an optional `notes?: string` and the graph an optional `notes?: string[]`; notes are documentation only and excluded from `graphHash`.
- 13474a6: feat: ScopeService.listScopes

  Exposes the scope vocabulary held in the store — everything a role can be
  composed from — flagging any scope that is still present but no longer declared
  in code (inert, and awaiting `pikku scopes prune`).

- 9f0d0eb: Migrate the `--oauth` addon scaffold off `OAuth2Client`. A scaffolded OAuth2
  addon service used to construct `new OAuth2Client(config, appCredentialSecretId,
secrets)` and do its own token exchange/refresh — the responsibility better-auth
  now owns via the credential service. The `pikku new addon --oauth` scaffold (and
  the OpenAPI `--openapi` generator) now emit a service that receives a ready
  access token: `services.ts` uses `createWireServices` + `wire.getCredential<{
accessToken: string }>(name)` and the service does a plain `fetch` with
  `Authorization: Bearer ${accessToken}`, matching the existing per-user
  bearer/apikey credential scaffold. With no remaining consumers, `OAuth2Client`
  (`@pikku/core/oauth2`) and its test are removed; the `./oauth2` export keeps the
  `OAuth2AppCredential` / `OAuth2Token` types.
- 13474a6: Add scopes: declared, statically-checked authorization scopes on pikkuFunc.

  A scope is a capability string the session must hold. Unlike `permissions` —
  which OR together across global/wire/tag/function levels — scopes are an AND
  gate that runs before them, so adding one can only ever narrow access.

  ```ts
  wireScope({
    admin: {
      scopes: { invoices: { scopes: { create: {} } } },
    },
  })

  export const createInvoice = pikkuFunc({
    scopes: ['admin:invoices:create'],
    func: async (services, data) => { ... },
  })
  ```

  The gate runs after the auth check and before the request body is evaluated,
  since scopes depend only on the session. A session lacking a required scope
  gets a `MissingScopeError` (403) naming it. Wildcards grant subtrees:
  `admin:*` satisfies `admin` and `admin:invoices:create`.

  `session.scopes` is populated by whoever builds the session — core reads it and
  never fetches, keeping the runner free of I/O. The new `ScopeService` interface
  resolves scopes at the session boundary.

- 70fa400: Add outgoing webhooks — `webhookService.send()` enqueues signed deliveries onto a retrying queue, `@pikku/kysely`'s `KyselyWebhookService` persists per-attempt delivery history, and `@pikku/console` gains a read-only `/webhooks` page; also caches resolved secrets in `TypedSecretService` and registers inline-`func` metadata for queue/scheduler/trigger/gateway wirings.
- 7b2ea23: `wireAddon` can install one addon package as multiple named instances, each with its own per-instance singleton services and `secretOverrides`/`variableOverrides`/`credentialOverrides` that alias logical names to real project secrets/variables/credentials.
- 1dc77d5: Remove the old, pre-better-auth OAuth2 credential runtime now that the
  `credentialOAuth` plugin owns credential linking, storage and refresh.
  - `@pikku/core`: drop the unused `createOAuth2Handler` HTTP-routes flow (and its
    `CreateOAuth2HandlerOptions`) from the `./oauth2` entrypoint. The credential
    schema types (`OAuth2AppCredential`, `OAuth2Token`) and the `OAuth2Client`
    API helper remain exported.
  - `@pikku/addon-console`: delete the six `oauth-*` console functions
    (connect/disconnect/status/exchange-tokens/refresh-token/test-token) and the
    `OAuthService` behind them — credential connections now flow through
    better-auth's `/credential-oauth/link` + `/callback`.
  - `@pikku/console`: the credential UI no longer calls the removed
    `console:oauth*` RPCs. Per-user and singleton (platform) OAuth2 credentials
    connect via the `/credential-oauth/link` full-page redirect and disconnect via
    `console:credentialDelete`; the `/oauth/callback` popup page is removed.

- 416606c: Fix a TypeScript 6 `PikkuWire` constraint collapse that made `rpc` a required field: narrow `PikkuRPC` default type params from `any` to `Function` and replace bare `any` TypedRPC args with `PikkuRPC`.
- d2a6eea: Add `wireRemoteAddon` — consume a hosted addon's `remote: true` RPCs transparently over HTTP, with the addon installed as a devDependency (types only). `rpc('ns:fn', input)` dispatches to the host's `/remote/rpc/:rpcName`, authenticating as a client with a token bound from a local source (`{ credentialId }` per-user, `{ secretId }` platform, or a custom `resolve()`), or omitted for a public surface. This is any-machine → hosted-library client auth, distinct from the trusted mesh (`PIKKU_REMOTE_SECRET`). A new `.remote.gen.d.ts` RPC map exposes only the `remote: true` surface to consumers. `pikku` verify errors if a `wireRemoteAddon` package is a production dependency (or missing) instead of a devDependency, and if a bound `credentialId`/`secretId` isn't wired.
- 30e62ee: Add `workflow.approval(reason, { schema, expiry })` — a return-valued, expiring human-in-the-loop gate that stays closed until a decision is recorded (via `workflowService.approveStep` or `POST /workflow/:workflowName/approve/:runId`), unlike the one-shot `workflow.suspend()`.

## 0.12.63

### Patch Changes

- ae65588: `fetchData` now defaults `exposeErrors` to `!isProduction()`, so a non-production HTTP server returns the error `message` and `stack` on unexpected 500s instead of a bare `{ errorId }`. A dev/sandbox RPC that 500s is now debuggable from the response alone; production (NODE_ENV=production) still returns only the errorId.

## 0.12.62

### Patch Changes

- b226948: Scenario context: scenarios now receive a `scenario` wire (was `workflow`) with the scenario-only helpers `expectEventually`/`expectError`/`expectService` plus a new `scenario.runScheduledTask(name)` that fires a cron inline with the system session. `PikkuWorkflowWire` is trimmed to the plain DSL (`do`/`sleep`/`suspend`); the scenario surface lives on the new `PikkuScenarioWire`. Actor calls (`invoke`/`converse`) stay on the `actors` registry. Scenarios are now excluded from `pikku scenario --coverage` totals.

## 0.12.61

### Patch Changes

- 982d3f5: Webhook gateway routes are now fully compiled instead of runtime-registered. The inspector projects `wireGateway` into the generated HTTP and function meta (deterministic `gateway__<name>__post`/`__verify` ids), and the gateway runner no longer mutates meta state at runtime — it only registers the handler implementations at module load, like every other wire. Previously the runtime-only meta was invisible to codegen and the dev-server meta reload wiped it, 500ing every gateway request.

  Also fixes the GET verification echo: string challenges return as a raw body (platforms compare byte-for-byte; the old JSON quoting failed Meta's check), object responses stay JSON, and failed verification now throws `UnauthorizedError` (401) instead of returning 200 with an error body.

## 0.12.60

### Patch Changes

- a3a49f2: fix(workflow): carry `pikkuUserId` onto queued workflow step wires so authed steps rehydrate their session

  A workflow step invoked on the queued (pg-boss) executor received the bare job wire (payload is just `{ runId }`), so `pikkuUserId` was never on the step wire and an authed step (`pikkuFunc`) threw `Authentication required` — even though the run wire persisted the acting user's id and the inline executor worked. `invokeStepRpc` now reads `pikkuUserId` from the persisted run wire and merges it into the step wire override, so authed steps rehydrate their session via the `SessionStore` on both the inline and queued paths.

## 0.12.59

### Patch Changes

- 1f3f510: Warn when a Pikku function body performs a runtime dynamic `import(...)`.

  The inspector now flags any `pikkuFunc`/`pikkuSessionlessFunc` (and friends) whose handler body contains a dynamic `import(...)` call — including nested callbacks — with the new `PKU498` diagnostic. Function bodies run on every invocation, so a dynamic import there adds per-call latency and defeats bundling/tree-shaking; the import belongs at the top of the module or in your services/`wireServices` setup instead.

  Type-only positions like `import('x').Foo` are not flagged. The rule defaults to `warn` — a printed yellow warning that does not fail the build — and is configurable via `lint.functionDynamicImport` in `pikku.config.json` (`'off'` to silence, `'error'` to make it a hard build failure), matching the existing `servicesNotDestructured`/`wiresNotDestructured` lints.

## 0.12.58

### Patch Changes

- 7b17b14: Allow a workflow-graph node's `func` to reference a registered AI agent by name, dispatched as an agent run — exactly like sub-workflows. `executeGraphStep`/`executeGraphNodeInline` now check the agent registry and dispatch matching nodes via the agent-run path (`rpc.agent.run`), so the node's result is the agent's declared output and downstream nodes can `ref()` it. The generated `pikkuWorkflowGraph` wrapper widens its node-func union to also accept `keyof FlattenedWorkflowMap` and `keyof FlattenedAgentMap`, and `ref()` resolves an agent node's output keys.
- daec082: Drop Node 22 support — the minimum supported runtime is now Node 24 (LTS).

  Node 22 deadlocks `pikku dev` at `loadUserBootstrap` (tsx `register()` + `require(esm)` cycle handling on node 22.12+), and Node 20 is already below our floor. The `engines.node` requirement is raised to `>=24` across all packages, matching `.nvmrc` and the CI test matrix. Closes #751.

- e0fd352: wireGateway: allow `adapter` to be a factory `(services) => GatewayAdapter | Promise<GatewayAdapter>`, resolved lazily on first inbound request (webhook/websocket) or gateway start (listener) and cached. Real platform adapters (WhatsApp Cloud API, Slack) need secrets that only exist after boot, while wireGateway runs at module load — a factory bridges that. Factory adapters register the GET verify route unconditionally since verifyWebhook can't be probed before first resolve.

## 0.12.57

### Patch Changes

- 60ad8cb: fix dev-server hot reload so edited AND new functions/routes apply without a restart
  - `@pikku/core`: the hot reloader fed raw zod `input`/`output` schemas into the JSON-schema map, so `compileAllSchemas` threw `Failed to compile schema` on every reload and the reload aborted (only the function body sometimes swapped, half-updated). It now registers function implementations only and leaves schemas to the codegen JSON output. New function exports are registered too (previously only already-registered names were replaced). Reloads write into the startup functions map directly to avoid a race with the dev watcher's codegen-scoped state swap, and re-import via a uniquely-named sibling copy since neither Bun nor tsx bust the module cache on a `?t=` query.
  - New `reloadGeneratedMeta` (exported from `@pikku/core/dev`) re-reads the regenerated wiring meta + JSON schemas into the running process so new/changed routes, RPCs, queues and agents resolve without a restart.
  - `@pikku/cli`: `pikku dev` now calls `reloadGeneratedMeta` after each watch-triggered codegen pass and re-imports the changed files once fresh meta is in state, so a NEW route in a changed wiring file registers (its `wireHTTP` no longer no-ops on missing meta).
  - `@pikku/schema-cfworker`: `compileSchema` recompiles when a schema's value changes (not only on first sight), so hot-reloaded schemas take effect.

- 8f5c998: Fix dev hot-reload dropping runtime-registered function/queue meta. `reloadGeneratedMeta` replaced the whole `function`/`queue` meta maps with the generated JSON, wiping entries the framework registers at service-init (the workflow orchestrator, per-workflow queue workers, and other `addFunction`'d internals that never appear in the generated files). Workflow jobs then failed with `Function meta not found: pikkuWorkflowOrchestrator`. The reload now merges over the existing maps so those internals survive.

## 0.12.56

### Patch Changes

- 6c30861: fix workflow step retry backoff firing immediately
  - `@pikku/queue-pg-boss`: `backoff: 'exponential'` mapped to `retryBackoff: true` without a base `retryDelay`; pg-boss computes exponential backoff as `retry_delay * 2^n` with a queue default of 0, so every retry fired immediately. Exponential backoff now gets a 1s base delay, and sub-second fixed delays round up to 1s instead of flooring to 0 (= immediate).
  - `@pikku/core`: a duration-string `retryDelay` (e.g. `'15s'`) on a workflow step was silently dropped (only numbers were honored) and fell back to exponential. It now resolves to a fixed backoff via `getDurationInMilliseconds`.

## 0.12.55

### Patch Changes

- bcfebf6: Console: accept `Authorization: Bearer <PIKKU_CONSOLE_TOKEN>`

  A console served from another origin cannot carry the session cookie, so
  every `console:*` RPC returned 403. `authBearer` gains a secret-resolved
  token mode (`token: { secretId, userSession }` — resolved through the
  secrets service per request, constant-time compare, no-op while the secret
  is unset), and the auth scaffold wires it with `PIKKU_CONSOLE_TOKEN` when
  `scaffold.console` is enabled — inside the same `addHTTPMiddleware('*')`
  call as the session middleware, since the inspector keys route-middleware
  groups by pattern (pikkujs/pikku#886).
  Set that secret in the server environment and send it as a bearer token to
  authenticate an external console.

## 0.12.54

### Patch Changes

- ded4f90: `pikku scenario --coverage` no longer requires the console addon

  The scenario instrumentation RPCs (take/reset live coverage, reset stubs, get
  stub calls) previously shipped inside the console addon, so any project
  without the addon silently lost scenario coverage and stub assertions — and
  core's `expectService` hardcoded a `console:` RPC, assuming an addon was
  installed.

  A new `scaffold.scenarios` feature (`pikku enable scenarios`, or
  `"scaffold": { "scenarios": "auth" }` in pikku.config.json) generates the
  four functions into the project scaffold as `pikkuScenario*` exposed RPCs.
  The scenario runner and `expectService` now invoke those names and the
  addon copies were removed. The source-map-aware coverage mapping (and its
  `@jridgewell/trace-mapping` dependency) moved from the addon into the CLI:
  `@pikku/core` gains only the report types plus an optional
  `CoverageService.takeReport`, which the CLI-booted coverage service
  implements and the scaffolded function calls.

## 0.12.53

### Patch Changes

- efb0406: Add in-process V8 precise coverage (`pikku dev --coverage` / `pikku serve --coverage`) with per-scenario attribution.
  - `@pikku/core`: new `V8CoverageService` (node:inspector precise coverage with snapshot + reset), exposed as the optional `coverageService` singleton service.
  - `@pikku/inspector`: function meta now records `bodyStart`/`bodyEnd` body spans (verbose meta only) so coverage can be mapped without a runtime TypeScript dependency.
  - `@pikku/cli`: `--coverage` on `pikku dev` and `pikku serve` starts the collector in-process; `pikku scenario run --coverage` resets/snapshots the server between flows and writes `.pikku/coverage/scenario-coverage.json` with per-scenario function coverage.
  - `@pikku/addon-console`: new exposed `takeLiveCoverage` / `resetLiveCoverage` RPCs; V8 ranges are mapped through inline source maps to original TypeScript lines (offset-based, so esbuild/tsx single-line output keeps full resolution).

- fe4f5ca: Add `stub`/`spy`/`isTestRun` core utils with call recording for scenario assertions.
  - `@pikku/core`: `StubTracker` moves here from `@pikku/cucumber` (which re-exports it), gaining `record`/`getCalls`/`reset`. New plain-import utils backed by a process-wide tracker: `stub(name, impl?)` (recording fake), `spy(name, real)` (record + pass through), `isTestRun()` (reads `PIKKU_TEST_RUN`). Nothing is injected into service factories and no new factory types exist — swap services with a plain `isTestRun()` conditional where needed. New scenario DSL steps: `workflow.expectService('email.send', { calledWith })` asserts recorded stub calls via the console RPC, `workflow.expectError(...)` walks error branches.
  - `@pikku/cli`: `pikku dev --test` sets `PIKKU_TEST_RUN` and wraps the dev-provided default services (email) in recording spies; independent of `--coverage`, absent from production `pikku serve`. `pikku scenario run` resets recorded calls per flow.
  - `@pikku/addon-console`: exposed `getStubCalls` / `resetStubs` RPCs next to the coverage snapshot endpoints.

## 0.12.52

### Patch Changes

- 61c9ce9: Add `actor.converse(...)` — actor agents for user journeys (#850)

  An actor can now hold a dynamic, LLM-driven conversation with a target Pikku AI
  agent in its own persona:

  ```ts
  const verdict = await actors.pm.converse({
    agent: 'todoBot',
    task: 'Get a todo created for the launch',
    evaluate: 'A todo about the launch now exists',
  })
  // verdict: { passed, reasoning, transcript }
  // then assert deterministically as the same actor:
  const todos = await actors.pm.invoke('listTodos', {})
  ```

  The actor drives the target over the real transport (the agent's own
  `agentRun` / `agentApprove` HTTP routes, signed in as the actor), plays the
  persona from its `pikku.config.json` config, answers the agent's tool-approval
  requests in-persona (`approvals: 'in-persona' | 'always' | 'never'`), and
  returns its verdict on whether the task was met. Deterministic checks stay the
  caller's job — they already hold the actor.

  The conversation engine is transport-agnostic (persona LLM + injected target
  driver); the persona's own turns run in-process via the configured
  `aiAgentRunner` (`model` from the call or the actors-service default).

  `agent` is typed against the generated agent-name union (`keyof AgentMap`), so
  it's author-time checked and autocompleted in a typed project.

- f1f39f8: Bound the actor-flow approval loop (#850)

  `converseWithTarget` now caps suspend→approve rounds within a single target turn
  (default 16, override via `maxApprovalRounds`). A cooperative target completes
  after a handful of rounds; a buggy or uncooperative one — e.g. re-requesting a
  tool the persona keeps denying — previously could spin the inner loop forever
  without ever spending a `maxTurns` credit. Exceeding the cap now throws instead
  of hanging.

- c45e98d: Run user flows from the console, actors and all (#850)

  Starting a `user-flow` workflow without explicit run actors (as the console's
  Run button does) now auto-builds HTTP actors from `USER_FLOW_ACTOR_SECRET` and
  `API_URL`: each actor signs in via the actor auth plugin — which mints the
  `actor: true` user row on first sign-in — and drives its steps over HTTP as
  that persona. When the secret or API base URL isn't configured the run simply
  proceeds without actors (with a warning) instead of failing.

  The workflow-detail view also gains the shared console header: the workflow
  selector and the "complex workflow" note now live in the header bar, the right
  details panel hides when it has nothing to show, and step nodes display their
  DSL labels (e.g. `Double ${item}`).

- 472a349: Rename the userflow concept to scenario (#862). `pikkuUserFlow` becomes `pikkuScenario`, `pikku userflow run/list` becomes `pikku scenario run/list`, the workflow meta flag `userFlow` becomes `scenario`, actor types are now `ScenarioActor`/`ScenarioActors`/`ScenarioActorConfig` (`createHttpScenarioActors`), pikku.config.json's `userFlows` key becomes `scenarios`, the generated actors file is `pikku-scenario-actors.gen.ts` (`createScenarioActors`), the actor sign-in secret env var is `SCENARIO_ACTOR_SECRET`, and the console's User Flows view is now Scenarios.

## 0.12.51

### Patch Changes

- 7ebea62: Tree-shake addon registrations in filtered inspector states (per-unit deploy codegen).
  - `filterInspectorState` drops an addon's `wireAddonDeclarations`/`usedAddons` unless something kept actually references it (kept wiring targeting `namespace:*`, kept agent/MCP tool, or a body-level `rpc.invoke('namespace:*')` from a file that still contains a kept function). The generated per-unit bootstrap no longer imports unused addon package bootstraps — previously every deploy unit registered every addon's entire function surface, which pulled dev-only code (e.g. `@pikku/addon-console`'s static `node:fs` imports) into Cloudflare Worker bundles and failed upload with `No such module "node:fs"`.
  - Body-level `rpc.invoke()` targets are now tracked per source file (`rpc.invokedFunctionsByFile`) so wiring-level `ref()` targets no longer pin an addon into every unit.
  - `aggregateRequiredServices` computes addon parent services per used addon function (from the addon's shipped per-function `services` meta) instead of blanket-adding `addonRequiredParentServices` — and matches namespaced ids only, so bare project function names colliding with addon function names no longer force the blanket.
  - Addon builds keep per-function `services` in the shipped `pikku-functions-meta.gen.json` so parent projects can do the above; addons built before this fall back to the blanket.
  - HTTP route meta records `refTarget` for `ref('namespace:fn')`-wired routes, so per-unit filtering keeps the addon registration (and only that function's services) when the route deploys.

- e57dd65: feat(console): surface the `pikku audit` report in the dev console

  Adds a view-only **Security** screen to the pikku dev console that renders the
  dependency audit produced by `pikku audit` (`.pikku/audit.json`): known
  vulnerabilities (severity, advisory, recommended version) and available
  dependency updates.
  - `@pikku/core`: exports the canonical `SecurityAuditReport` artifact type (plus
    `SecurityAuditIssue`/`SecurityAuditUpdate`/`SecurityAuditSummary` and the
    `SecuritySeverity`/`SecurityUpdateLevel` unions) — a single source of truth
    shared by the CLI (writer), the console addon (reader) and the console UI.
  - `@pikku/addon-console`: `getSecurityAudit` reads the audit artifact via the
    meta service; `runSecurityAudit` triggers `pikku audit --outdated` server-side
    (regenerating the artifact) — same shape as the Run Tests action;
    `updateDependency` bumps a package in `package.json` (preserving the `^`/`~`
    range), runs `bun install`, re-audits, and returns the fresh report.
  - `@pikku/console`: new `SecurityPage` with a **Run audit** button + reusable
    presentational `SecurityAuditView` (exported, so downstream consoles can wrap
    it with their own actions) + `useSecurityAudit`/`useRunSecurityAudit`/
    `useUpdateDependency` hooks. Issues/Dependencies lenses; per-finding
    remediation slot right-aligned in the row header (`renderRemediation`,
    defaulting to the OSS `UpdateDependencyButton`; Fabric swaps in its own
    sandbox-verified action). Empty state until an audit has been run.

## 0.12.50

### Patch Changes

- 35a9bab: UserFlowActor exposes the actor's `email` so flows can use it for
  invites/lookups instead of hardcoding the config value.
- 92bd643: User flows in the console: workflow graph extraction now captures
  `workflow.expectEventually` steps and per-step actor names (`{ actor:
actors.x }`), workflow meta carries `actors`/`title` into the serialized
  graph, the CLI emits `user-flow-actors.gen.json` for the new
  `MetaService.getUserFlowActorsMeta()`, and the console Workflows page gains a
  Workflows / User Flows / Personas toggle. Also fixes complex-workflow graphs
  being clobbered by a duplicate basic-extraction pass after successful DSL
  extraction.

## 0.12.49

### Patch Changes

- 4c17f7e: user flows: actors move onto the workflow wire + `pikku userflow` command
  - Actors are no longer a singleton service: `startWorkflow(..., { actors })`
    registers them per run and they arrive on the wire —
    `func: async ({ logger }, input, { workflow, actors })`.
  - Inspector enforces user flows are pure remote stories (PKU673): a
    pikkuUserFlow func may only destructure `logger`/`config` from services.
  - New `pikku userflow run <environment> [--flows a,b] [--tags x,y]` runs flows
    against `userFlows.environments` from pikku.config.json (secret from
    USER_FLOW_ACTOR_SECRET env), refusing internal (non-actor) steps so runs
    against staging/production never touch local services; non-zero exit on
    failure. `pikku userflow list` prints names, descriptions and tags.
  - Workflow meta now carries `title` (parity with HTTP routes/functions).

## 0.12.48

### Patch Changes

- 5f2c566: Better Auth actor plugin for user flows: `actor({ secret })` adds an `actor`
  boolean column on `user` and a `POST /sign-in/actor` endpoint (`{ email,
secret }`, constant-time compare). Actor rows are auto-created on first
  sign-in; a real (non-actor) user can never be impersonated with the secret.
  The flag propagates into the pikku core session (`CoreUserSession.actor`) via
  both `betterAuthSession` and `betterAuthStatelessSession`, so audits and
  analytics can address synthetic traffic.
- 8dfddc3: pikkuUserFlow: user flows as workflows. A complex workflow whose steps can run
  as actors over the real transport — `workflow.do(step, rpc, data, { actor:
actors.yasser })` — plus `workflow.expectEventually(...)` for polling async
  effects. Actor steps never queue and never dispatch internally, so auth
  middleware/permissions are exercised end-to-end; flows double as e2e tests and
  staged/production health checks. Ships UserFlowActor types +
  createHttpUserFlowActors (lazy sign-in via `/auth/sign-in/actor` with a
  server-held secret), inspector source `'user-flow'`, and a console badge.

## 0.12.47

### Patch Changes

- 1cd0b2f: fix audit writes silently dropped on the exposed-RPC path: the auditLog wire service was created once per transport invocation (on the outer wire, e.g. the generated rpcCaller with no audit config), so audited functions invoked via nested rpc inherited a disabled instance. The runner now re-gates auditLog per audited function, binding a fresh invocation audit to the function's own wire (correct functionId/actor attribution) and flushing it when the invocation ends. Dropped-write warnings now fall back to the singleton logger (wires rarely carry one) and name the function, so a dropped audit write is never invisible.

## 0.12.46

### Patch Changes

- d0d97cb: Stop browser bundles pulling the @pikku/core server runtime.

  `@pikku/console` (a browser package) imported pure helpers (`buildRunTimeline`,
  `reconstructStateAt`, `reconstructFinalState`, `generateCommandHelp`) from the
  `@pikku/core/workflow` and `@pikku/core/cli` barrels. Those barrels also
  re-export `PikkuWorkflowService`, `deriveInvocationId` (which imports Node's
  `crypto`), and the queue workers — so importing the pure helpers dragged the
  entire server runtime into the browser bundle.

  Two fixes:
  1. Expose browser-safe subpath exports that contain only pure, type-only-import
     modules — `@pikku/core/workflow/timeline` (run-timeline),
     `@pikku/core/workflow/types` (pure type surface), and
     `@pikku/core/cli/command-parser` — and import from those in `@pikku/console`
     so the server barrels stay out of the browser's live bundle.
  2. Import Node's crypto via the explicit `node:crypto` specifier in the
     server-only `utils/hash.ts` and `wirings/workflow/workflow-invocation-id.ts`
     (both use `createHash`). Bundlers externalize `node:`-prefixed builtins
     instead of routing them through a browser `crypto` alias, so even when the
     workflow service survives in a consumer's graph as tree-shaken dead code
     (its `addError` side-effects), its transitive `createHash` import no longer
     breaks the browser dep optimizer.

## 0.12.45

### Patch Changes

- e9a778f: feat(config): add optional `postgres` pool config to `CoreConfig`

  Postgres is a first-class adapter, so its runtime pool tuning now lives in the
  core config (sibling to `workflow`), typed via the new `PostgresConfig`:
  `maxPool`, `connectTimeout`, `idleTimeout`, `maxLifetime`, `statementTimeout`,
  `prepare`. The connection string itself stays the flat `postgresUrl`/`sqliteDb`
  field the CLI db commands read; this block is purely runtime pool options.

## 0.12.44

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

## 0.12.43

### Patch Changes

- a8022e5: fix(workflow): scope the step advisory lock to the claim, not execution

  `executeWorkflowStep` held the step's advisory lock — and, in the Postgres
  workflow service, the pooled DB connection backing it — across the entire step
  body, including the step's own network and DB work. Under concurrency >= the DB
  pool size this self-deadlocks: every running step pins a connection on its lock
  transaction while its inner queries wait for a connection that never frees, so
  nothing makes progress and the API hangs.

  The lock is only needed to atomically _claim_ a step (read state + mark it
  `running`); once a step is `running`, the existing status guard already prevents
  any concurrent worker from re-running it. The lock now covers only the claim;
  execution and result persistence run with the lock released and the connection
  back in the pool.

## 0.12.42

### Patch Changes

- 7b5b10a: fix(workflow): include suspend steps in plannedSteps with readable displayName

  `workflow.suspend(reason)` calls now appear in the static `plannedSteps` ladder
  produced by `deriveWorkflowPlan`. Previously the inspector ignored them, so the
  runtime's `__workflow_suspend:<reason>` steps had no planned counterpart and
  the UI appended them as orphans at the bottom of the step list instead of
  showing them at the correct position.

  Changes:
  - `WorkflowPlannedStep` gains an optional `displayName` field — the human-
    readable label to show in the UI (falls back to `stepName` when absent).
  - New `SuspendStepMeta` type added to `WorkflowStepMeta`.
  - Inspector extracts `workflow.suspend('reason')` calls and emits a
    `SuspendStepMeta` step with `type: 'suspend'` and `reason`.
  - `collectNamedSteps` maps a suspend step to
    `{ stepName: '__workflow_suspend:<reason>', displayName: '<reason>' }`,
    matching the key the runtime stores so the UI can overlay live status
    onto the planned position.

## 0.12.41

### Patch Changes

- 04db6a2: Make `rpc` a required property on `PikkuWire`. It is always lazily initialised by the function runner on every invocation regardless of wire type, so marking it optional was misleading.

## 0.12.40

### Patch Changes

- ba1ab08: refactor(workflow): replace `inline: false` with `workflowQueued: true` on function meta

  The per-function workflow dispatch flag has been renamed from the confusing
  negative `inline: false` to the explicit positive `workflowQueued: true`.
  Two companion fields are also added: `workflowRetries` and `workflowTimeout`
  as function-level equivalents of the per-call-site `NodeOptions` fields.

  **Breaking change (patch — flag was undocumented):** rename `inline: false`
  to `workflowQueued: true` on any `pikkuSessionlessFunc` / `pikkuFunc` that
  dispatches its workflow steps via the queue.

  **Behaviour change:** a step marked `workflowQueued: true` now throws if no
  queue service is configured, instead of silently falling back to inline
  execution.

  **Bug fix:** `post-process.ts` was registering `wf-step-*` queues for every
  workflow step node; it now only registers them for steps that are actually
  `workflowQueued: true`, avoiding spurious queue resource allocation.

## 0.12.39

### Patch Changes

- 4be205f: Dedupe DSL step execution: extract a shared `invokeStepRpc` (step RPC + provenance wire, used by both the queue and inline executors) and a shared `runInlineRetryLoop` (the in-process running→result→retry scaffolding, used by inline RPC steps and inline function steps). No behavior change — the inline path stays straight-through O(K); the queue path keeps its suspend/replay model.
- 061c717: fix(cli): log just the message for expected failures, keep the stack for uncaught errors

  A deliberate, expected failure — e.g. `pikku all` aborting because a build gate
  (blocking diagnostics) tripped — was dumping a full workflow stack trace, burying
  the one line that matters. Errors are now classified: a `PikkuError` (or any error
  carrying an `expected` marker) prints its message alone, while a genuinely uncaught
  error still prints the full stack so it can be debugged.
  - New `isExpectedError(error)` helper (exported from `@pikku/core`): true for a
    `PikkuError` or an error flagged `expected`.
  - The `expected` flag is threaded through `SerializedError` and the in-memory
    workflow step store so it survives the step-boundary rehydration that strips the
    error's class.
  - The CLI runner's top-level catch, the `CLILogger`, and the workflow runner's
    failure log all honour it.
  - The blocking-diagnostics abort now throws a `PikkuError` subclass so it is
    treated as expected.

- 2c55e13: fix(queue): `InMemoryQueueService` redelivers failed jobs up to `options.attempts` with backoff

  Previously the in-memory queue ran each job once and dropped it on failure, so a
  transiently-failing workflow step dispatched via `inline: false` would stall the
  run forever (the orchestrator was never resumed). It now honors the `attempts`
  and `backoff` already produced by the workflow step job options, redelivering on
  failure — matching pg-boss/bullmq semantics so local/dev runs recover from
  transient step failures exactly as production does.

- c745c26: fix(workflow): inline graph runs use the same transition planner as the queue

  `continueGraphInline` had its own, weaker graph traversal that couldn't revisit a
  node (no cycles) and never recorded `fromStepName`, so an inline-run graph stored
  different step state than the same graph run through a queue. It now uses the
  shared `planGraphTransitions` planner — inline graphs get joins, cycle revisits
  (`node`, `node#1`, …) and step provenance identical to the queued path, and the
  duplicate traversal logic is removed.

- 57900b5: Add workflow run time-travel. A run's durable history (`getRunHistory`) is one row per step attempt with lifecycle timestamps; `buildRunTimeline(history)` explodes those into a flat, chronologically-ordered event stream and `reconstructStateAt(timeline, at)` folds it up to any point — a seq index or a `Date` — to recover what the run "knew" then: per-step status, the accumulated step-result cache, the walked path (via `fromStepName`), and a derived phase. These are pure, transport-independent functions (same fold for Redis/Kysely/in-memory), exported from `@pikku/core/workflow` alongside `reconstructFinalState`. `PikkuWorkflowService` gains `getRunTimeline(id)` and `reconstructRunStateAt(id, at?)` that wrap them over a run's history, inherited by every backend. Correctly handles retries (a retry's created event reopens the step and clears the prior outcome) and graph cycles (revisit ordinals are distinct path entries).
- 72694f6: feat(workflow): expose per-step attempt count + record running/succeeded/failed timestamps

  `getRunStatus` now returns `attempts` (the latest attempt count) per step, so
  consumers can show retry counts without a second history query. It already
  computed `duration` from `runningAt`/`succeededAt`, but the kysely and mongodb
  workflow stores only stamped those timestamps on the _insert_ path — the
  `running` / `succeeded` / `failed` status transitions updated the history row's
  status without setting `runningAt` / `succeededAt` / `failedAt`, so `duration`
  was always undefined. The transitions now stamp the matching timestamp, so step
  duration is populated for kysely- and mongodb-backed runs. (Redis already
  stamped on transition.) A shared service-suite test guards both behaviours.

## 0.12.38

### Patch Changes

- 92cd5b1: feat(workflow): workflow-owned step retries + stable invocationId

  The workflow — not the queue — now owns step retry policy, and each step
  invocation gets a stable idempotency key.
  - **Default `retries: 5` with exponential backoff.** A step with no `retries`
    previously inherited the queue's bare default (e.g. pg-boss `retry_limit 2`,
    no backoff) so retries fired instantly and couldn't outlast a transient
    outage. Retries now default to 5 with backoff, resolved at the workflow layer.
  - **`retries: 0` is honored.** Dispatch previously passed `undefined` options
    for `retries: 0`, letting the queue re-run a non-idempotent step up to its own
    default. The resolved policy now always sets `attempts` (`retries: 0` →
    `attempts: 1`), so the queue never second-guesses the workflow. The persisted
    step retries and the dispatched `attempts` are resolved together so
    "retries exhausted" and "no more redeliveries" are the same event.
  - **`workflowStep.invocationId`** — a deterministic, dependency-free
    `uuidv5(runId:stepName)` handed to every step. Unlike `stepId` (minted per
    attempt), it is identical across retries, so a step can dedupe on it
    (`ON CONFLICT (invocationId)`, Stripe idempotency keys, etc.).
  - **queue-bullmq**: `mapPikkuJobToBull` now maps `backoff` (previously dropped,
    so a step's backoff silently never applied on Redis), and `registerQueues`
    throws a clear error when no logger is available (matching queue-pg-boss).
  - **Dispatch failures are recoverable, not fatal.** A step is now marked
    `scheduled` only _after_ it is successfully handed to its transport (queue or
    scheduler) — a failed hand-off leaves it `pending` so a replay re-dispatches
    it, instead of stranding it in `scheduled` (replay would pause forever on a
    job that was never enqueued). A transport outage (e.g. pg-boss momentarily
    down) is surfaced as a new `WorkflowDispatchException`, which the orchestrator
    treats as transient: the run is left running and the orchestrator job is
    rethrown for redelivery (it replays idempotently from the snapshot) rather
    than the whole run being marked `failed`. The orchestrator job now also
    carries its own retry policy, so this holds even when the orchestrator queue
    is configured `retry_limit 0`. A genuine step error still fails the run.
  - **Same step name can be invoked multiple times in one run.** Step rows are now
    keyed per _invocation_: the Nth reach of a step name in a replay resolves to a
    physical key (`name` for the first, `name#N` for repeats), so a literal
    duplicate name no longer clobbers the earlier step's state. The first reach
    keeps the bare name, so existing rows, graph-node matching and `invocationId`s
    are unchanged. Ordinals are derived deterministically from DSL execution order
    and reset each replay.
  - **Step provenance (`fromStepName`) + graph cycles.** Every step now records
    the predecessor it was scheduled from (`fromStepName`; entry steps have none),
    persisted on the step row across all stores (in-memory, kysely, redis,
    mongodb, cloudflare DO) and carried in the queued payload. The DSL wire
    exposes the derived `fromInvocationId` (`uuidv5(runId:fromStepName)`) so
    consumers get the stable predecessor key without a second persisted id —
    `fromStepName` is the source of truth (it is replay-deterministic; `stepId`,
    minted per row, is not). This makes the walked path reconstructable even when
    a node is reached more than once: in `a → b → a → c` the second `a` is a
    distinct ordinal instance (`a#1`) whose `fromStepName` is `b`.
    The graph runner now supports **cycles**: a forward edge into an
    already-started node still collapses to a single run (joins/diamonds are
    unchanged), but a _back-edge_ — one whose target can reach its source — fires
    a fresh ordinal instance, so a node can loop back to itself. Termination is
    the graph's responsibility (branch routing must converge); the engine enforces
    no visit cap.

## 0.12.37

### Patch Changes

- ae7fc5d: Include gateway platform and auth fields in inspected gateway metadata.
- fa7a09c: Add gateway metadata generation and display enabled gateways in the console.

## 0.12.36

### Patch Changes

- f6adc1c: LocalMetaService.getEmailMeta no longer caches — it reads the generated
  pikku-emails-meta.gen.json fresh on each call (a local JSON read is cheap),
  so newly-generated email templates surface without restarting the process.

## 0.12.35

### Patch Changes

- 6bca38f: Extend `aiAgentRunner` with AI SDK-style media methods for transcription, speech, image generation, embeddings, and reranking.

  Move `voiceInput` and `voiceOutput` into `@pikku/core/ai-agent`, backed by the injected `aiAgentRunner`.

  Deprecate `@pikku/ai-voice` and strip its exports.

## 0.12.34

### Patch Changes

- 2eaa9fd: fix(workflow): seed sessionService when session already present on wire

  When a parent workflow propagates its session to a child workflow via
  `wire.session`, `resolveSession` skipped `setInitial` because `!wire.session`
  was false, so `sessionService.freezeInitial()` returned `undefined` and
  immediately overwrote the propagated session. We now seed the sessionService
  with the existing `wire.session` so `freezeInitial()` returns the correct
  session for `pikkuFunc` steps inside child workflows.

## 0.12.33

### Patch Changes

- 5c67b7e: Add a dedicated `@pikku/core/services/temporary-file-service` export for the Node filesystem-backed temporary file service without routing it through the `services` barrel.
- 1b22977: fix(workflow): propagate pikkuUserId and session to child workflow wires

  When a workflow calls `workflow.do()` on a sub-workflow, the child wire was created
  without `pikkuUserId`. This meant that `pikkuFunc` steps inside the child workflow
  could not resolve a session — `resolveSession` had nothing to look up, causing
  `ForbiddenError` for authenticated steps.

  Two fixes:
  - `childWire` now copies `pikkuUserId` from the parent RPC service's wire, so remote
    queue workers can re-hydrate the session from the session store.
  - `orchestrateWorkflow` now propagates `session` from the parent RPC wire into the
    child workflow's execution wire, so inline execution gets the session directly
    without an extra session-store round-trip.

## 0.12.32

### Patch Changes

- a027a8e: feat: emit auth provider + plugin metadata as `auth-meta.gen.json` for the console SSO page

  The enabled social providers and Better Auth plugins are now extracted statically
  and written to a generated `auth-meta.gen.json`, replacing the runtime
  `setAuthRegistry`/`getAuthRegistry` approach — so the console can show them without
  evaluating the Better Auth factory.
  - **inspector**: the `pikkuBetterAuth` inspector now reads the `plugins` array from
    the `betterAuth({ ... })` config and records each plugin id (the callee name of
    each `plugins: [organization(), bearer()]` entry) on the auth definition.
  - **cli**: `pikku auth` (and `pikku all`) emit `auth/pikku-auth-meta.gen.json` (path
    configurable via `authMetaJsonFile`) containing `basePath`, `hasCredentials`, the
    enabled `providers` (`id` + `displayName` + `secretId`), and the enabled `plugins`
    (`id` + `displayName`). The previous `setAuthRegistry(...)` runtime wiring is
    removed from the generated `auth.gen.ts`.
  - **better-auth**: exports a `PLUGIN_REGISTRY` and `pluginDisplayName(id)` helper so
    plugin ids resolve to human-readable names.
  - **core**: removes the unreleased `setAuthRegistry`/`getAuthRegistry` runtime auth
    registry (now superseded by `auth-meta.gen.json`).
  - **addon-console**: `getAuthProviders` reads `auth-meta.gen.json` and returns the
    configured providers, plugins, and `hasCredentials` flag.
  - **console**: the Auth Providers (SSO) page fetches `console:getAuthProviders` and
    marks each provider configured/unconfigured, lists email+password credentials as a
    provider, and shows the enabled Better Auth plugins.

- a027a8e: fix: address Better Auth review findings (secret/variable batch typing, auth init, guards)
  - **core**: `SecretService.getSecrets` / `VariablesService.getVariables` (and the
    Local/Typed/Scoped/AWS implementations) now return `Partial<T>`, honestly
    reflecting that missing keys are omitted at runtime rather than typing partial
    data as fully populated. `ScopedSecretService.getSecrets` now throws on a
    disallowed key instead of silently filtering it out.
  - **cli**: the generated `services.auth()` thunk clears its memoised promise on
    rejection, so a transient Better Auth/Kysely startup failure no longer
    permanently poisons auth for the process lifetime.
  - **inspector**: the `pikkuBetterAuth` export guard now requires an exported
    `const` (rejects `export let`/`export var`), matching its error message.
  - **console**: the Microsoft auth provider's `callbackId` is `microsoft` (the
    Better Auth provider id) rather than `microsoft-entra-id`.

- a027a8e: fix(core): compose repeated global middleware registrations instead of overwriting

  `addHTTPMiddleware(pattern, …)` and `addTagMiddleware(tag, …)` stored the
  middleware group with `groups[key] = middleware`, so a second registration for
  the same pattern/tag silently replaced the first. With Better Auth, generated
  `auth.gen.ts` registers `addHTTPMiddleware('*', [betterAuthSession()])`, which
  clobbered an app's own `addHTTPMiddleware('*', [...])` global middleware (cors,
  session, credential loading) and dropped it from every route.

  Both now append to the existing group (matching `addGlobalMiddleware`, which
  already appends), so generated auth middleware composes with user-registered
  global middleware. The route meta lists each pattern once, so the combined
  group is still applied a single time per request.

- a027a8e: feat(auth): migrate auth integration from Auth.js to Better Auth

  The auth integration is now built on [Better Auth](https://better-auth.com)
  and ships as a single package, `@pikku/better-auth` (replacing the former
  `@pikku/auth-js`). There is exactly one auth package now.
  - `pikkuBetterAuth(async ({ secrets, variables }) => betterAuth({ ... }))` is the new
    single entry point. The CLI inspects the `betterAuth(...)` call and generates:
    - `auth.gen.ts` — a catch-all `${basePath}{/*splat}` HTTP route per method and
      a global `betterAuthSession({ auth })` middleware that bridges the Better
      Auth session into the Pikku wire session.
    - `auth-secrets.gen.ts` — `wireSecret(BETTER_AUTH_SECRET)` plus a
      `<PROVIDER>_OAUTH` secret for each configured social provider, and
      `wireVariable` for non-secret provider config (e.g. `MICROSOFT_TENANT_ID`,
      `COGNITO_DOMAIN`/`REGION`/`USER_POOL_ID`).
    - `auth.types.ts` — a typed `pikkuBetterAuth` re-export.
  - `add-auth` (inspector) walks into the `betterAuth(...)` options to discover the
    configured providers and required secrets/variables.
  - The auth secret is now auto-wired by codegen from `BETTER_AUTH_SECRET` — it no
    longer needs to be registered as a JWT signing key in `services.ts`.

  CLI fix included: scaffold files generated outside `srcDirectories` (e.g. an
  `auth.gen.ts` under a project's `pikku/` dir) are now added to the inspector's
  wiring files, so their routes and secret metadata are picked up. The generated
  wiring imports Pikku types via a resolved relative path instead of a hardcoded
  `#pikku` specifier, so templates without a `#pikku` import map type-check.

## 0.12.31

### Patch Changes

- fe70fe0: fix(db): make classified columns usable in Kysely queries and emit real zod

  Two fixes so data-classified DB columns (`@private`/`@pii`/`@secret`, default
  `private`) are usable end-to-end instead of poisoning ordinary app code:
  1. **Brand marker is now optional** (`{ readonly __classification__?: ... }`)
     in both `@pikku/core` and the `pikku db migrate` schema header. A required
     marker made a plain value (e.g. `string`) unassignable to a branded column
     (`Private<string>`), breaking every Kysely `where`/insert/`.set()` operand —
     any project with classified columns failed to type-check. Optional keeps the
     brand structurally present (so the inspector's PKU910 output check still
     detects it) while letting plain values flow IN. The inspector's level read is
     now union-aware (`'pii' | undefined`) so pii/secret no longer silently
     downgrade to private.
  2. **Zod codegen resolves classified `ColumnType<>`** to proper scalars instead
     of `z.unknown()`. `pikku db migrate` emits `<Table>Z`/`InsertZ`/`PatchZ` from
     the Select slot, unwrapping the brand and honoring insert-optionality from the
     Insert slot's `| undefined`. Public `Generated<T>`/bare/nested shapes are
     unchanged.

## 0.12.30

### Patch Changes

- cd101a5: feat(core): add `auditLog` service slot for per-invocation audit logs

  `CoreSingletonServices` now declares `auditLog?: AuditLog`, giving the
  per-request audit log returned by `createInvocationAudit` a typed home in the
  service container. Apps wire it in `createWireServices`
  (`return { auditLog, kysely: createAuditedKysely(kysely, { audit: auditLog }) }`)
  and the runner flushes its buffer via `close()` when the invocation ends.

  Previously there was no slot to return it from: `audit` is typed `AuditService`
  (the durable sink, `.audit()`), while `createInvocationAudit` returns an
  `AuditLog` (the request-scoped buffer, `.write/.flush/.close`). Returning the
  buffer under `audit` was a type error, so audited-Kysely wiring could not
  type-check. `auditLog` is distinct from `audit` and never shadows it.

- ac16265: fix(core): read email template assets from the absolute `emailsMeta.src` directly

  `getEmailTemplateAssets` passed an absolute `baseDir` (e.g. `/project/emails`) into
  `readProjectFile`, which resolves `join(basePath, '..', relativePath)`. Because
  `path.join` does not treat an absolute second segment as a root reset, this produced
  a non-existent compound path (`/project/packages/functions/project/emails/...`), so
  every asset read returned `null` and the email preview reported all source files
  (`theme, locale, html, subject, text`) as missing. Read the assets directly via
  `readFile(join(baseDir, rel))` instead, which resolves correctly for an absolute
  base. Verified live: a previously all-missing preview now renders.

- a05e864: fix(core): allow multiple independent suspend points in one workflow

  `getSuspendStepName()` returned the constant `'__workflow_suspend'` for every
  `workflow.suspend()` call, so all suspends in a run shared a single step row.
  Once the first suspend resolved (row → `succeeded`), every later `suspend()`
  read that same `succeeded` row and fell straight through without pausing — so a
  workflow could only ever have one working suspend point, and a second one (e.g.
  wait-for-build, then wait-for-approval) was silently skipped.

  The suspend step is now keyed on its `reason` (used raw, just namespaced so it
  can't collide with a `do`/`sleep` step of the same name), so each distinct
  reason is its own step row. A workflow can now have multiple independent
  suspends, including dynamic reasons in loops (`suspend(`Wait for ${i}`)`),
  exactly like dynamic `do()` step names. As with `do()`/`sleep()`, the reason is
  the suspend's stable identity and must be derived deterministically so it
  matches on replay. `suspend(reason)` is unchanged at the call site.

- 20750fd: feat(workflow): decide step dispatch purely per-function

  Workflow step execution (inline vs queue dispatch) is now decided entirely by
  the step's function `inline` flag — the workflow-level / run-level `inline`
  meta no longer participates in per-step dispatch.
  - Steps default to **inline**, so a normally-started (queue-backed) workflow
    runs its whole chain in one orchestrator pass instead of one queue
    round-trip per step.
  - A function marked `inline: false` is dispatched via the queue (its own
    worker, retry isolation). When `inline: false` but no `queueService` is
    configured, the step falls back to inline and emits a `logger.warn` instead
    of silently swallowing the misconfiguration.
  - Removed the now-unused workflow-level `inline` from `WorkflowsMeta` /
    `WorkflowRuntimeMeta`, the inspector's workflow extraction, the DSL→graph
    converter, and the deploy analyzer / service inference (which now key off
    the per-function flag). Run-level `inline` is retained: it still controls
    whether a whole run executes in-process without queue infrastructure.

## 0.12.29

### Patch Changes

- 294e365: Fix body stream caching in PikkuFetchHTTPRequest so that arrayBuffer() can be called after body() has already consumed the stream via text(). This is required for Auth.js CSRF validation to work correctly when integrated with Pikku's internal fetch.

## 0.12.28

### Patch Changes

- 2cf67be: Add inline option to pikkuFunc/pikkuSessionlessFunc for workflow step dispatch

  By default, workflow steps now run inline (no queue hop). Set inline: false on a function to force dispatch through the queue for that step.

## 0.12.27

### Patch Changes

- 4b5c75b: feat(auth-js): wire OIDC config (issuer/tenantId) as variables, expand provider registry
  - Move `issuer` and `tenantId` out of the secret blob for OIDC providers (auth0, okta, azure-ad, keycloak, cognito, microsoft-entra-id) — they are public config URLs, not secrets. Now registered via `wireVariable` and loaded at runtime via `services.variables.get()`.
  - Expand provider registry from 13 to 31 providers: reddit, notion, instagram, zoom, figma, tiktok, threads, patreon, dropbox, bitbucket, hubspot, salesforce, atlassian, strava, keycloak, cognito, microsoft-entra-id added.
  - `serialize-auth-gen` emits `wireVariable({...})` declarations and `services.variables.get()` calls in the generated factory for OIDC providers.
  - Integration verifier exercises real `/auth/providers` endpoint with `LocalSecretService` + `LocalVariablesService`, including a spy test proving `services.variables.get('AUTH0_ISSUER')` is called at request time.

- 4b5c75b: Add end-to-end data classification for SQLite and Postgres projects.

  **Core (`@pikku/core`):** New `Private<T>` and `Secret<T>` intersection brands, `ClassificationManifest`, `ColumnClassification`, and `AnonymizeStrategy` types exported from `data-classification.ts`.

  **CLI (`@pikku/cli`):**
  - SQL comment annotations: `-- @public`, `-- @private[:strategy]`, `-- @secret[:strategy]` on `CREATE TABLE` columns and `ALTER TABLE ... ADD COLUMN` statements. Unannotated columns default to `private`.
  - `pikku db migrate` now emits a `classification.gen.ts` manifest alongside `schema.d.ts`.
  - New `pikku db audit` command — prints a per-column classification summary and warns on `private`/`secret` columns with no anonymize strategy.
  - Postgres dialect support in `resolveDb`, `PostgresMigrationExecutor`, and `PostgresIntrospector`.

  **Inspector (`@pikku/inspector`):** New PKU910 check — `findPiiPaths()` walks inferred function return types looking for `__pii__` brands (including inside `Array<T>`, `Record<K,V>`, and index signatures) and fails the build if a function exposes branded fields in its output.

## 0.12.26

### Patch Changes

- 909eb25: Add audit logging support for function invocations and database queries.

  Introduces `AuditService` and `createAuditedKysely` — configurable audit capture with best-effort and transactional durability modes. Audit logs capture session metadata (user, org), RPC call details, and Kysely query operations (type, tables, changes). Audit context is scoped per-invocation so nested RPC calls are correctly attributed.

## 0.12.25

### Patch Changes

- 665bdb0: Add end-to-end data classification for SQLite and Postgres projects.

  **Core (`@pikku/core`):** New `Private<T>` and `Secret<T>` intersection brands, `ClassificationManifest`, `ColumnClassification`, and `AnonymizeStrategy` types exported from `data-classification.ts`.

  **CLI (`@pikku/cli`):**
  - SQL comment annotations: `-- @public`, `-- @private[:strategy]`, `-- @secret[:strategy]` on `CREATE TABLE` columns and `ALTER TABLE ... ADD COLUMN` statements. Unannotated columns default to `private`.
  - `pikku db migrate` now emits a `classification.gen.ts` manifest alongside `schema.d.ts`.
  - New `pikku db audit` command — prints a per-column classification summary and warns on `private`/`secret` columns with no anonymize strategy.
  - Postgres dialect support in `resolveDb`, `PostgresMigrationExecutor`, and `PostgresIntrospector`.

  **Inspector (`@pikku/inspector`):** New PKU910 check — `findPiiPaths()` walks inferred function return types looking for `__pii__` brands (including inside `Array<T>`, `Record<K,V>`, and index signatures) and fails the build if a function exposes branded fields in its output.

## 0.12.24

### Patch Changes

- c02275f: Add per-request API key override to AI agent runner

  `VercelAIAgentRunner` gains an optional `providerFactory` constructor param and a `withApiKey(apiKey)` method that forks a new runner scoped to a given key without touching the global singleton.

  `RunAIAgentParams` gains an optional `getCredential` accessor so callers can thread per-request credentials (e.g. a user's `AI_API_KEY` from the credential wire service) into `prepareAgentRun`. If a credential is found and the runner supports `withApiKey`, the runner is forked before the agent executes.

  `AIAgentRunnerService` interface gains the optional `withApiKey?` method.

- 0bd0433: Add `db.engine` and `db.pgVersion` to the CLI config types, and make local env-backed secrets fall back to raw strings when JSON parsing fails.

## 0.12.23

### Patch Changes

- 8d09f12: Forward pikkuAgent function name to LiteLLM as request metadata for per-agent usage breakdown.

  Adds an optional `agentId` field to `AIAgentRunnerParams`. The wiring layer (`runAIAgent`, `streamAIAgent`, and the resume path) sets this to the agent's registered function name before invoking the runner. `VercelAIAgentRunner` injects it into `providerOptions` as `metadata.agent_id` so LiteLLM includes it in spend logs, enabling per-agent token and cost breakdowns.

## 0.12.22

### Patch Changes

- 265461b: Improve schema identifier sanitization in the CLI and prefer specific runtime error messages in HTTP error responses.

## 0.12.21

### Patch Changes

- 9060165: Agents now declare their model directly as `<provider>/<model>` (e.g. `openai/gpt-4o`). The `models`, `agentDefaults`, and `agentOverrides` config blocks have been removed.

  **Migration:** replace any bare `model: 'alias'` values with the full provider-qualified form and remove those blocks from `pikku.config.json`.

- 9060165: WebSocket channels now expose `setState`, `getState`, and `clearState` — channel state and session lifecycle are managed independently.
- 9060165: Workflow steps now support per-step `retries` and `retryDelay` configuration. Cloudflare deployments gain Workflow Durable Object bindings for graph-DSL workflows on Workers-for-Platforms, and the deploy bundle now boots cleanly on the Cloudflare Workers runtime.

## 0.12.20

### Patch Changes

- 18acebe: feat(core): scope bare `rpc.invoke()` calls to the caller's addon package

  Addon functions calling `rpc.invoke('foo')` (bare, no colon) previously only
  resolved against root RPC meta and threw `RPCNotFoundError` for the addon's
  own functions, forcing authors to prefix every call with their consumer-facing
  namespace (`'cli:foo'`) — which couples the addon to its caller's `wireAddon({ name })`.

  `ContextAwareRPCService` now carries an optional `packageName` passed through
  from `runPikkuFunc` via `getContextRPCService`. For bare names from inside an
  addon, resolution first checks the caller's package function meta, then falls
  back to root. Applies to both `rpc.invoke()` and `rpc.rpcWithWire()`. Explicit
  namespaced calls (`'stripe:createCharge'`) and root-namespace calls are unchanged.

- 66d1b4f: feat(content)!: bucket-aware ContentService with typed object args

  BREAKING CHANGE: All `ContentService` methods now take object args with a
  required `bucket` field. The interface is generic over `TBucket extends string`
  so callers can constrain bucket names to a typed union.

  Migration:

  ```ts
  // Before
  content.getUploadURL(fileKey, contentType)
  content.signContentKey(key, expiresAt)
  content.writeFile(assetKey, stream)
  content.readFile(assetKey)
  content.deleteFile(assetKey)

  // After
  content.getUploadURL({ bucket, fileKey, contentType })
  content.signContentKey({ bucket, contentKey, dateLessThan: expiresAt })
  content.writeFile({ bucket, key, stream })
  content.readFile({ bucket, key })
  content.deleteFile({ bucket, key })
  ```

  - New exported types: `SignContentKeyArgs`, `SignURLArgs`, `GetUploadURLArgs`,
    `UploadURLResult`, `BucketKeyArgs`, `WriteFileArgs`, `CopyFileArgs`.
  - `LocalContent` stores objects under `<base>/<bucket>/<key>`.
  - `S3Content` and `B2Content` treat the logical bucket as a key prefix within
    the configured underlying storage bucket.
  - `workflow-screenshot` addon takes `bucket?` / `key?` input; default bucket
    resolved from `PIKKU_WORKFLOW_SCREENSHOT_BUCKET` variable, no hardcoded
    fallback.

- 3e35b99: feat(core): scope bare workflow names to the caller's addon package

  Parallel to the RPC scoping fix for addon functions. Addon code calling
  `services.workflowService.runToCompletion('myWorkflow', ...)` (bare name,
  no colon) previously missed workflows registered under the addon's package
  scope and threw `WorkflowNotFoundError`, forcing authors to hard-code
  the consumer-facing namespace (`'cli:myWorkflow'`) — which couples the
  addon to its caller's `wireAddon({ name })`.

  `getOrCreatePackageSingletonServices` in the function-runner now wraps
  the package's `workflowService` with a Proxy that auto-prefixes bare
  workflow names on `startWorkflow` / `runToCompletion` with the addon's
  consumer-defined namespace (looked up from `pikkuState(null, 'addons',
'packages')`). Explicit `'ns:name'` calls and root-namespace workflows
  are unchanged.

## 0.12.19

### Patch Changes

- b9ed73e: Add deterministic workflow planned-step metadata support and SSE init stream payload generation.
  - Persist `deterministic` and `plannedSteps` on workflow runs in core and service adapters.
  - Expose planned-step metadata on workflow run status responses.
  - Emit an initial `type: 'init'` SSE event for deterministic workflow streams before incremental updates.
  - Add CLI tests covering serialized stream route output for init/update/done event behavior.

## 0.12.4

## 0.12.18

### Patch Changes

- 311c0c4: Unify session persistence through SessionStore, remove session blob from ChannelStore
  - PikkuSessionService now persists sessions via SessionStore on set()/clear() instead of every function call
  - ChannelStore no longer stores session data — maps channelId to pikkuUserId only
  - ChannelStore API: setUserSession/getChannelAndSession replaced with setPikkuUserId/getChannel
  - Serverless channel runner resolves sessions from SessionStore using pikkuUserId from ChannelStore

## 0.12.17

### Patch Changes

- 854737b: Add `ListInput<F, S>` / `ListOutput<Row>` / `Filter<F>` types for list-function primitives.

  A "list function" is any Pikku function that returns a paginated collection. Adopting this shape unlocks a shared vocabulary across MCP tools, AI agents, typed RPC clients, and widget libraries — they all reason about cursor, filter, sort, and search uniformly.

  These are purely structural constraints; no runtime behaviour change. A list function is still a normal `pikkuFunc` whose input extends `ListInput<F, S>` and output extends `ListOutput<Row>`.

  ```ts
  import { pikkuFunc } from '#pikku'
  import type { ListInput, ListOutput } from '@pikku/core'

  export const listSessions = pikkuFunc<
    ListInput<{ status?: SessionStatus[] }, 'user' | 'status' | 'uploaded_at'>,
    ListOutput<Session>
  >({
    func: async ({ kysely }, input) => {
      /* ... */
    },
  })
  ```

  `Filter<F>` is a recursive AND/OR tree: arrays are AND of children, objects with label keys are OR of children, single-key objects with a field name from `F` are leaf predicates. Leaf operators mirror Prisma's vocabulary (`equals`, `in`, `notIn`, `gt`, `gte`, `lt`, `lte`, `contains`, `startsWith`, `endsWith`, `not`, `mode`).

  Follow-ups (separate PRs): `applyFilter<DB>(qb, filter)` Kysely helper, `usePikkuListQuery` in the CLI's react-query generator, first-class MCP list-tool shape.

## 0.12.16

### Patch Changes

- fbcf5b9: Add middleware priority system, telemetry middleware, and statusCode getter. Middleware now supports named priority levels (highest, high, medium, low, lowest) that control execution order regardless of registration order. Includes telemetryOuter and telemetryInner middleware for observability instrumentation via structured console.log output. PikkuHTTPResponse now exposes a readonly `statusCode` getter across all response implementations.

## 0.12.15

### Patch Changes

- 9e8605f: Add Workers for Platforms dispatch namespace support and AI agent fixes.
  - deploy-cloudflare: Thread dispatchNamespace through deploy pipeline, reads CF_DISPATCH_NAMESPACE env var
  - core: Fix auth-gated tools visible to unauthenticated sessions (null session now hides permission-gated items)
  - core: Recursive null stripping in AI agent tool call resume path
  - ai-vercel: Handle anyOf/oneOf/array types when making optional fields nullable for strict providers

- 624097e: Add deploy pipeline with provider-agnostic architecture
  - Add MetaService with explicit typed API, absorb WiringService reads
  - Add deployment service, traceId propagation, scoped logger
  - Rewrite analyzer: one function = one worker, gateways dispatch via RPC
  - Add Cloudflare deploy provider with plan/apply commands
  - Add per-unit filtered codegen for deploy pipeline
  - Skip missing metadata in wiring registration for deploy units
  - Fix schema coercion crash when schema has no properties
  - Fix E2E codegen: double-pass resolves cross-package Zod type imports

- 7ab3243: Add server-fallback deployment target for functions that can't run serverless.

  Functions can declare `deploy: 'serverless' | 'server' | 'auto'`. With `serverlessIncompatible` config, the analyzer auto-routes functions using incompatible services to a container.

  Server functions are merged into a single tree-shaken unit with a PikkuUWSServer entry, Dockerfile, and CF Container proxy Worker.

  Also adds sub-path exports to @pikku/cloudflare for tree-shaking (greet bundle 1.6MB → 444KB) and deploy verifiers for cloudflare, serverless, and azure providers.

## 0.12.14

### Patch Changes

- f85c234: Add unified credential system with per-user OAuth and AI agent pre-flight checks
  - Unified CredentialService with lazy loading per user via pikkuUserId
  - wire.getCredential() for typed single credential lookup
  - MissingCredentialError with structured payload for client-side connect flows
  - Console UI: Global/Users credential tabs, per-user OAuth connect/revoke
  - AI agent pre-flight check: detects missing OAuth credentials from addon metadata, shows "Connect your accounts" prompt before chat
  - CLI codegen: generates credentialsMeta per addon package for runtime lookup
  - Vercel AI runner: catches MissingCredentialError as runtime fallback

- 88d3100: Fix CLI command resolution for addon functions by passing packageName to addFunction during registration.

## 0.12.13

### Patch Changes

- 2ce0733: Fix credential services template variable passing, duplicate body/path param collision, and add credentialOverrides to wireAddon.

## 0.12.12

### Patch Changes

- 84f01ad: Add credentialOverrides to wireAddon for remapping credential names, fix credential services template to pass variables argument.

## 0.12.11

### Patch Changes

- 4e52200: Add \_\_raw CLI channel handler for server-side arg parsing. Enables WebSocket CLI clients to send raw args without needing client-side command metadata.

## 0.12.10

### Patch Changes

- 0f59432: Add per-user credential system with CredentialService, OAuth2 route handlers, and KyselyCredentialService with envelope encryption
- 52b64d1: Provide workflow wire to graph nodes for sleep/suspend support. Graph nodes now receive a workflow wire alongside the graph wire, enabling tools like `graph:sleep` to work in graph execution context. Improves dynamic workflow system instructions with output path documentation, nested path examples, and design principles for AI agents.

## 0.12.9

### Patch Changes

- e412b4d: Replace raw Error throws in AI agent runner/stream/prepare with typed PikkuError subclasses. `AIProviderNotConfiguredError` (503) replaces "AIAgentRunnerService not available" with a user-friendly message. `AIProviderAuthError` (401) available for API key validation errors.
- 53dc8c8: Fix toWebRequest to respect x-forwarded-proto and x-forwarded-host headers behind reverse proxies. Previously always used http:// which broke OAuth callback URLs behind TLS-terminating proxies like Fly.io.
- 0a1cc51: Add secure defaults for cookie authentication: httpOnly, secure, sameSite 'lax', and path '/'. User-provided options override these defaults.
- 0a1cc51: Prevent internal error details from leaking to clients. Stack traces via exposeErrors are now blocked in production. SSE and WebSocket error handlers use registered error responses instead of raw error messages. Secret key names and route paths are no longer included in error messages.
- 0a1cc51: Cap form-urlencoded parameters at 256 to prevent abuse via unbounded parameter parsing.
- 0a1cc51: Add path traversal protection to LocalContent file operations. Asset keys are now validated to stay within the configured upload directory.
- 0a1cc51: Use private Symbol for global pikku state key to prevent external code from accessing framework internals via Symbol.for().
- 0a1cc51: Filter out **proto**, constructor, and prototype keys during request data merging to prevent prototype pollution.
- 0a1cc51: Improve LocalContent URL signing with proper signedAt/expiresAt parameters. When an optional JWTService is provided, URLs include a cryptographic signature for verification.
- 0a1cc51: Fix timeout middleware to use Promise.race instead of throwing inside setTimeout, which caused uncatchable exceptions that crashed the process.
- 0a1cc51: Use constant-time comparison for static bearer token authentication to prevent timing side-channel attacks.
- 8b9b2e9: Fix child workflow completion in queued execution mode. When a sub-workflow completes, the parent step is now marked as succeeded and the parent orchestrator resumes automatically via `onChildWorkflowCompleted`. Adds `parentStepId` to `WorkflowRunWire` to track the parent step without querying. Retains advisory locks in PgKyselyWorkflowService for concurrency safety. Fixes pgboss `registerQueues` to accept an optional logger parameter.
- 8b9b2e9: Add debug-level logging to workflow service for step scheduling, execution, and orchestration to aid troubleshooting.
- b973d44: Add `inline` property to workflow function definitions. When `inline: true` is set on a workflow, it always executes inline without dispatching to the queue service, even when a queue service is available. This is useful for workflows that should run synchronously within the parent process (e.g. scaffolding/setup steps that produce local files).

  The flag flows from the function definition through the inspector, into the serialized workflow graph, and is checked at runtime by the workflow service.

- 8b9b2e9: Strip undefined values from workflow step data before dispatching to the queue service, preventing postgres UNDEFINED_VALUE errors.
- 8b9b2e9: Support sub-workflow invocation in graph-based workflow steps. When a step's rpcName refers to a registered workflow instead of an RPC function, `executeGraphStep` now starts it as a child workflow and polls for completion. Respects the `inline` meta flag on the sub-workflow.

## 0.12.8

### Patch Changes

- 09491c6: Fix toWebRequest to respect x-forwarded-proto and x-forwarded-host headers behind reverse proxies. Previously always used http:// which broke OAuth callback URLs behind TLS-terminating proxies like Fly.io.

## 0.12.7

### Patch Changes

- 66519c9: Remove explicit Transfer-Encoding and Connection headers from SSE responses. The transport layer handles chunked encoding automatically, and setting it explicitly causes double-encoding behind reverse proxies like Caddy.

## 0.12.6

### Patch Changes

- bb27710: Add optional `uploadHeaders` to `ContentService.getUploadURL` return type, allowing storage backends (e.g. Backblaze B2) to provide required headers for direct uploads.
- a31bc63: Fix SSE error handler to send `[DONE]` as JSON (`{"type":"done"}`) for consistency with all other SSE messages.
- 3e79248: Add setStepChildRunId to workflow service implementations and auto-bootstrap in pikku all
- b0a81cc: Support sub-workflows in `workflow.do()`: when a string name is passed, it now checks if the name refers to a registered workflow and runs it as a sub-workflow, falling back to RPC invocation if not found. The `TypedWorkflow.do` type now also accepts workflow names with typed input/output. Steps that spawn sub-workflows expose `childRunId` on the step state so clients can stream sub-workflow progress.
- 6413df7: Propagate session and RPC service from the originating request to workflow runs, fixing "Authentication required" errors for workflows with `auth: true`.

## 0.12.5

### Patch Changes

- 198e68f: Add hot-reload for dev mode: reload functions, middleware, and permissions without server restart.

## 0.12.4

### Patch Changes

- 688b5e8: InMemoryWorkflowService now implements WorkflowRunService interface, adding listRuns, getRunSteps, getDistinctWorkflowNames, and deleteRun methods.

### Patch Changes

- InMemoryWorkflowService now implements WorkflowRunService interface (listRuns, getRunSteps, getDistinctWorkflowNames, deleteRun)

## 0.12.3

### Patch Changes

- 387b2ee: Add approval descriptions, rename requiresApproval to approvalRequired, export all service interfaces, add exposeErrors option to HTTP runner, promote addons to top-level state, add packageName to CommonWireMeta, add errors to function config, and improve agent runner streaming
- 32ed003: Add envelope encryption utilities and database-backed secret services with KEK rotation support
- 7d369f3: Fix agent sub-agent tool execution failures: use UUID for sub-agent thread IDs (was exceeding varchar(36) DB column), and synthesize error results for failed tool calls in non-streaming run() to prevent "Tool result is missing" cascading errors.
- 508a796: Fix MCP server not exposing addon tools: resolve namespaced function IDs in MCP runner, load addon schemas after schema generation, and use resolveFunctionMeta for MCP JSON serialization
- ffe83af: Add Web Response passthrough support and fix close() flushing
  - HTTP runner detects when a function returns a Web `Response` object and applies it directly via `applyWebResponse()`, enabling seamless integration with libraries like Auth.js
  - Add `send()` method to `PikkuHTTPResponse` for setting body without Content-Type headers
  - Add `headers()` method to `PikkuHTTPRequest` for retrieving all headers as a record
  - Add `toWebRequest()` and `applyWebResponse()` utilities for Web Request/Response conversion
  - Fix `close()` in Express, Fastify, and UWS responses to flush buffered status/headers/body before ending the connection

- c7ff141: Add WorkflowVersionStatus type with draft→active lifecycle for AI-generated workflows, type all DB status fields with proper unions instead of plain strings

## 0.12.2

### Patch Changes

- cc4c9e9: Add gateway meta-wiring for messaging platforms:
  - New `wireGateway()` API with three transport types: webhook, websocket, listener
  - `GatewayAdapter` interface for platform-specific parse/send logic
  - `PikkuGateway` wire object (`wire.gateway`) with senderId, platform, and send()
  - `GatewayService` interface and `LocalGatewayService` for listener gateway lifecycle
  - `createListenerMessageHandler()` helper for building listener message callbacks
  - Add `'gateway'` to `PikkuWiringTypes` and `gateway` to `PikkuWire`
  - Add `gateway` state block to `PikkuPackageState`

- 3e04565: chore: update dependencies to latest minor/patch versions

## 0.12.1

### Patch Changes

- 62a8725: Rename 'external' to 'addon' throughout the codebase. All types, functions, config keys, and CLI options previously named `external` or `External` are now named `addon` or `Addon` (e.g. `ExternalPackageConfig` → `AddonConfig`, `externalPackages` → `addons`, `function-external` → `function-addon`).
- a3bdb0d: Add AI middleware hooks for per-tool-call lifecycle and post-step observability:
  - `beforeToolCall` / `afterToolCall`: per-tool-call hooks for logging, caching, input sanitization, and result transformation
  - `afterStep`: post-step observation hook with full step context (text, toolCalls, toolResults, usage, finishReason)
  - `onError`: error-specific hook for alerting and diagnostics (non-throwing, won't affect error flow)

- e0349ff: Fix critical security vulnerability in channel message handler: `validateAuth` was being called with `channelHandler` (always truthy) instead of the actual user session, meaning auth checks always passed and unauthenticated clients could send messages to protected channels. Also fix an information disclosure issue where the full channel config object was being logged on unhandled messages.
- 62a8725: Internalize singleton services management in the serverless channel runner, consistent with how other runners handle it. `createWireServices` and `singletonServices` no longer need to be passed explicitly to serverless channel runner calls.
- e04531f: Security hardening: improve CORS handling, redirect validation, and error logging in the HTTP runner. Export additional internal utilities needed by native runtime adapters.
- 62a8725: Fix security issue in `function-runner`: functions declared with `pikkuFunc` (which always require a session) now always throw `ForbiddenError` when called without a session, even if the wiring has `auth: false`. Previously a misconfigured wiring could bypass authentication entirely — the runner only logged a warning instead of blocking the call.
- a83efb8: Handle OPTIONS preflight requests automatically in fetchData when no explicit OPTIONS route is matched. Runs global HTTP middleware (e.g. CORS) and returns 204. Remove redundant startWorkflowRun and streamAgentRun pass-through functions from addon-console.
- 8eed717: Add `readonly` flag to function config and runtime enforcement. Functions can be marked `readonly: true` in their config. At runtime, if a session has `readonly: true`, only functions marked as readonly can be called — otherwise a `ReadonlySessionError` (403) is thrown.
- 62a8725: `pikku versions check` now prints rich, human-readable output for all contract version errors instead of raw error codes. Each error type (PKU861–PKU865) shows the function name, separate input/output schema hashes with a `prev → current` arrow, and clear next-step instructions.

  The version manifest now stores separate `inputHash` and `outputHash` per version entry (backward-compatible — old string-hash manifests still load and validate correctly). `VersionValidateError` gains optional detail fields (`functionKey`, `version`, `previousInputHash`, `currentInputHash`, `previousOutputHash`, `currentOutputHash`, `nextVersion`, `latestVersion`, `expectedNextVersion`) for use by tooling.

- 62a8725: Replace config-based addon declarations with the new `wireAddon()` code-based API. Addons are now declared directly in wiring files using `wireAddon({ name, package, rpcEndpoint?, auth?, tags? })` instead of the `addons` field in `pikku.config.json`. The inspector reads these declarations from the TypeScript AST at build time.
- 62a8725: Add `secretOverrides` and `variableOverrides` support to `wireAddon()`. These optional maps allow an app to remap an addon's secret/variable keys to its own names (e.g. `secretOverrides: { SENDGRID_API_KEY: 'MY_EMAIL_API_KEY' }`). The inspector validates that all override keys exist in the app's own secrets/variables definitions.

### New Features

- AI agents with `pikkuAIAgent()` — define agents with tools, sub-agents, memory, structured output, and streaming via SSE
- AI middleware hooks (`pikkuAIMiddleware`) for input, stream, and output transformation
- Tool approval flow — suspend agent execution pending human approval
- Channel middleware (`pikkuChannelMiddleware`) for intercepting and transforming channel events
- Remote RPC — call functions across servers with `rpc.remote()` and `DeploymentService`
- HTTP route groups with `wireHTTPRoutes` for shared basePath, tags, and auth
- Workflow graph engine with `createGraph()` type-safe builder
- Workflow HTTP helpers: `workflow()`, `workflowStart()`, `workflowStatus()`, `graphStart()`
- Workflow DSL with rich step types (branch, parallel, fanout, switch, filter)
- Trigger system with `wireTrigger()` and `wireTriggerSource()`
- OAuth2 support with `wireOAuth2Credential` and `OAuth2Client`
- Secret and variable declarations with `wireSecret()` and `wireVariable()`
- `TypedSecretService` and `TypedVariablesService` for compile-time validated access
- `defineCLICommands` and `defineChannelRoutes` for external composition
- Built-in CORS middleware
- `disabled: true` support on all wirings and functions
- `createWireServices` and `createConfig` are now optional
- `InMemoryWorkflowService` and `InMemoryTriggerService` for testing

### Breaking Changes

- `PikkuInteraction` → `PikkuWire`, `CreateSessionServices` → `CreateWireServices`
- `wireForgeCredential` → `wireCredential`
- `startWorkflowByWire` → `startWorkflowByHTTPWire`
- Renamed all `forge` → `node` naming
- Renamed `credential` → `secret` across core types
- `WorkflowService.createRun` signature changed (new `inline`, `graphHash` params)
- Auth enforced by default for `pikkuFunc`

## 0.11.0

## 0.11.2

### Patch Changes

- db9c7bf: Add workflow graph system with type-safe builder

### Features

- f35e89da: Add workflow graph system with type-safe builder
  - `createGraph<RPCMap>()` for building workflow graphs with full type safety
  - `wireWorkflowGraph()` for registering workflow graphs
  - `graphNode()` helper for type-safe node creation
  - Graph scheduler for execution (continueGraph, startWorkflowGraph)
  - TypedRef for type-safe input refs in workflow graphs
  - `setBranchTaken` added to WorkflowService interface
  - Trigger runner for workflow triggers

### Breaking Changes

- Rename `pikkuWorkflowFunc` to `pikkuWorkflowComplexFunc`
- Rename `pikkuWorkflowDSTFunc` to `pikkuWorkflowFunc`

## 0.11.1

### Patch Changes

- 4b811db: chore: updating all dependencies
- e12a00c: feat: adding initialSession to PikkuWire which is correctly typed (undefined / not depending on function type)
- 4579434: breaking: changing the signature of functions
- 28aeb7f: breaking: extract docs in the wiring meta
- ce902b1: feat: adding in pikkuSimpleWorkflowFunc
- 06e1a31: breaking: change session services to wire services

### Minor Changes

- Add workflow orchestration engine with step execution and retries
- Add scheduler service abstraction
- Remove file-based channel and eventhub stores

# @pikku/core

## 0.10.2

### Patch Changes

- ea652dc: Refactor channel middleware handling and add lifecycle middleware support

  **Breaking Changes:**
  - Improved middleware resolution for channel message handlers to properly combine channel-level and message-level middleware
  - Fixed cache key collisions when multiple message handlers use the same function

  **New Features:**
  - Add `runChannelLifecycleWithMiddleware` helper in `channel-common.ts` for consistent lifecycle function execution
  - Support middleware on `onConnect` and `onDisconnect` lifecycle functions
  - Channel-level middleware now properly applies to all messages in the channel

  **Bug Fixes:**
  - Fix middleware ordering: channel middleware → message middleware → inherited middleware
  - Fix cache key generation to include routing information (prevents cache collisions)
  - Properly detect wrapper objects vs direct function configs for message handlers

- 4349ec5: Add file-based storage implementations for serverless environments

  **New Services:**
  - Add `FileChannelStore` for file-based channel storage (suitable for AWS Lambda /tmp)
  - Add `FileEventHubStore` for file-based event hub subscriptions
  - Export new services in package.json for use in serverless runtimes

  **Bug Fixes:**
  - Fix serverless channel runner to handle disconnect gracefully when channel is already cleaned up
  - Fix MCP runner to pass `mcp` service to functions and use correct function type

- 44d71a8: fix: fixing inspector ensuring pikkuConfig is set

## 0.10.1

### Patch Changes

- 778267e: fix: fixing inspector ensuring pikkuConfig is set

## 0.9.0

## 0.10.0

This release includes significant improvements across the framework including tree-shaking support, middleware/permission factories, enhanced CLI functionality, improved TypeScript type safety, and comprehensive test strategies.

For complete details, see https://pikku.dev/changelogs/0_10_0.md

## 0.9.12-next.0

### Patch Changes

- feat: running @pikku/cli using pikku

## 0.9.11

### Patch Changes

- 6ee87c1: fix: local content server name slashes

## 0.9.10

### Patch Changes

- a2062b7: feat: adding a server url prefix for local content

## 0.9.9

### Patch Changes

- 99c2b3a: fix: removing duplicated interaction values from pikku functions

## 0.9.8

### Patch Changes

- ea89575: feat: adding the ability for custom schema validation / retrieving schemas to use (for example with openapi json_response)

## 0.9.7

### Patch Changes

- 85a1c76: fix: fixing delete method return type in local-content and ignoring body (for now) in delete calls

## 0.9.6

### Patch Changes

- 6059c87: refactor: move PikkuPermission to pikkuPermission and same for middleware for api consistency to to improve future features
- 6db63bb: perf: changing http meta to a lookup map to reduce loops
- 74f8634: perf: moving router externally to be able to swap them out, similar to hono
- 766fef1: feat: adding caching for middleware and permissions

## 0.9.5

### Patch Changes

- 7e1f5b3: feat: implement ordered middleware and permission execution system

  ## New Features

  ### Ordered Execution System

  Both middleware and permissions now execute in a specific hierarchical order:
  1. **Wiring Tags** - Tag-based middleware/permissions from wiring level (e.g., HTTP route tags)
  2. **Wiring Middleware/Permissions** - Direct wiring-level middleware/permissions
  3. **Function Middleware** - Function-level middleware
  4. **Function Tags** - Tag-based middleware/permissions from function level

- b443405: feat: adding middleware and functions by tags

## 0.9.4

### Patch Changes

- c18800d: feat: adding queue and scheduledTask to interactions

## 0.9.3

### Patch Changes

- 9691aba: fix: add-functions should support both functions only and objects
- 2ab0278: refactor: no longer import ALL functions, only the ones used by rpcs
- 81005ba: feat: creating a smaller meta file for functions to reduce size

## 0.9.2

### Patch Changes

- 1256238: feat: pikkufunc in types extends function config to include all the different params
- 6cf8efd: feat: Adding PikkuDocs to function definition

  refactor: renaming APIDocs to PikkuDocs

- d3a9a09: refactor: change addMiddleware to addHTTPMiddleware due to route support'

  chore: export addHTTPMiddleware from pikku-types for consistency

- 840e078: refactor: change APIMiddleware type to PikkuMiddleware
- 667d23c: feat: adding expose to function config (although it isn't yet wired up)
- a5905a9: chore: updating all dependencies

## 0.9.1

### Patch Changes

- fdb1593: core: bumping everything with a patch to sync up the major release inconsistencies in dependencies

### Breaking Changes

- Normalized all transports to use "wirings" instead of events/routes/transports for consistency across the framework

## 0.8.0

## 0.8.2

### Patch Changes

- 0fb4b3d: refactor: mcp server expects json and not file path

## 0.8.1

### Patch Changes

- 3261090: refactor: moving mcp endpoints into core
- 7c592b8: feat: support for required services and improved service configuration

  This release includes several enhancements to service management and configuration:
  - Added support for required services configuration
  - Improved service discovery and registration
  - Added typed RPC clients for service communication
  - Updated middleware to run per function

- 30a082f: refactor: moving service implementations out of pikku/core since they aren't all edge compatible

### Major Features

- **Model Context Protocol (MCP) Support**: Added MCP implementation with resources, tools, and prompts
- **Queue System**: Added queue support with runners and workers
- **RPC (Remote Procedure Calls)**: Added typed RPC calls inside functions with local and remote support
- **Middleware Runner**: Added middleware runner to functions for enhanced request processing
- **Multiple Bootstrap Files**: Added support for different transport bootstrap files
- **Middleware Runner**: Run middleware on any function

## 0.7.8

### Patch Changes

- 8b4f52e: fix: nextjs compatability with 0.7
- 8b4f52e: refactor: moving schemas in channels to functions
- 1d70184: feat: adding multiple bootstrap files for different transports

## 0.7.7

### Patch Changes

- 6af8a19: fix: always write functions meta data

## 0.7.6

### Patch Changes

- 6166c74: fix: odd missing file

## 0.7.5

### Patch Changes

- 46d4458: feat: we now have typed rpc calls inside of functions!

## 0.7.4

### Patch Changes

- 598588f: fix: generating output schemas from function meta

## 0.7.3

### Patch Changes

- 534fdef: feat: adding rpc (locally for now)

## 0.7.2

### Patch Changes

- bb59874: fix: only try validating schemas if they exist in function runner

## 0.7.1

### Patch Changes

- cd83e0a: fix: invalid logroutes log line

We now use the function first approach internally, which means first all the functions register, and then events call call them.

The main breaking changes for the end user are:

- We now declare functions using `pikkuFunc<In, Out>(async () => {})
- We renamed addRoute to wireHTTPs

We also removed all the different types of functions. Everything is now either an APIFunction of APIFunctionSessionless. The channel (eventHub or any other transport specific service) is now injected in the service itself.

## 0.6.27

### Patch Changes

- 8658745: refactor: changing content service to use streams for performance benefits
- d0968d2: fix: fixing content uploads for s3

## 0.6.26

### Patch Changes

- 412f136: updating local content service

## 0.6.25

### Patch Changes

- b774c7d: fix: coerce top level data from schema now includes date strings

## 0.6.24

### Patch Changes

- 531f4b5: refactor: using userSession.set to set cookies with middleware

## 0.6.23

### Patch Changes

- 1c8c470: fix: await schema validation

## 0.6.22

### Patch Changes

- 60b2265: refactor: supporting request and response objects

## 0.6.21

### Patch Changes

- aab52d4: revert: add http back to all services until we figure out best way to set session from a function

## 0.6.20

### Patch Changes

- 1d43a9a: feat: adding context to allow middleware to set values (not typed)

## 0.6.19

### Patch Changes

- 9fb2b99: refactor: moving schemas to pikku state

## 0.6.18

### Patch Changes

- 6be081b: fix: export addMiddleware correctly

## 0.6.17

### Patch Changes

- ebc04eb: refactor: move all global state into pikku state
- 8a14f3a: refactor: removing user session from channel object
- 2c47386: refactor: improving middleware

## 0.6.16

### Patch Changes

- 3cbdf9e: fix: adding missing crypto import

## 0.6.15

### Patch Changes

- 1c7dfb6: fix: fixing some import issues

## 0.6.14

### Patch Changes

- c1d8381: feat: adding filtering by tags to minimize produced payload
- ee5c874: feat: moving towards using middleware for http and channels

## 0.6.13

### Patch Changes

- eb8a8b4: fix: updating schema and cli build issue due to tsconfig settings

## 0.6.12

### Patch Changes

- e0dd19a: fix: invalid schemas should result in a 422

## 0.6.11

### Patch Changes

- 7859b28: breaking: changing overrides for addRoute to wrap instead due to random conflict override errors
- 269a532: fix: fixing some typing issues

## 0.6.10

### Patch Changes

- 4a4a55d: refactor: renaming EError to PikkuError

## 0.6.9

### Patch Changes

- f3550d8: feat: changing singleton constructor to accept a prtial map of existing services

## 0.6.8

### Patch Changes

- b19aa86: refactor: switching aws to using @aws-sdk/cloudfront-signer

## 0.6.7

### Patch Changes

- 0a92fa7: refactor: pulling schema into seperate package since ajv doesnt work on cloudflare (also keeps bundle size small!)

## 0.6.6

### Patch Changes

- 4357bca: feat: fixing up nextjs apis

## 0.6.5

### Patch Changes

- a40a508: fix: Fixing some generation bugs and other minors

## 0.6.4

### Patch Changes

- f26880f: feat: extracting inspector and adding unique type references

## 0.6.3

### Patch Changes

- 09fc52c: feat: adding cloudflare and lambda websockets
  breaking change: moved subscription from channel to services and renamed to event hub
- adecb52: feat: changes required to get cloudflare functions to work

## 0.6.2

### Patch Changes

- ed45ca9: feat: adding lambda serverless
- adeb392: feat: more channel improvements, and adding bubble option to runners to avoid all the empty try catches

## 0.6.1

### Patch Changes

- dee2e9f: feat: adding a subscription service change handler

Marking a major release to include channels and scheduled tasks

## 0.5.29

### Patch Changes

- 662a6cf: feat: adding scheduled tasks names
- c8578ea: fix: getting websocket auth to work on individual messages
- d2f8edf: feat: adding channelId to channels for serverless compatability

## 0.5.28

### Patch Changes

- a768bad: feat: adding channel permission service
- 886a2fb: refactor: moving singletons (like routes and channels) to global to avoid nodemodule overrides
- 886a2fb: fix: making core routes global to avoid state overrides

## 0.5.27

### Patch Changes

- aa8435c: fix: fixing up channel apis and implementations

## 0.5.26

### Patch Changes

- ab42f18: chore: upgrading to next15 and dropping pages support

## 0.5.25

### Patch Changes

- 0f96787: refactor: dropping cjs support
- 64e4a1e: refactor: seperating core into cleaner sub-packages
- c23524a: refactor: bump to versions to ensure correct package usage

## 0.5.24

### Patch Changes

- bba25cc: chore: updating all packages to reflect major changes
- 9deb482: refactor: finalizing stream api
- ee0c6ea: feat: adding ws server

## 0.5.23

### Patch Changes

- 7fa64a0: feat: making schedule session services optional
- 539937e: refactor: use a map instead for scheduled tasks
- e9a9968: refactor: completing rename of stream to channel

## 0.5.22

### Patch Changes

- 73973ec: fix: data type for methods is optional

## 0.5.21

### Patch Changes

- 179b9c2: fix: fixing stream types

## 0.5.20

### Patch Changes

- 5be6da1: feat: adding streams to uws (and associated refactors)

## 0.5.19

### Patch Changes

- cbcc75b: feat: adding scheduler types to core
- d58c440: refactor: making http requests explicit to support other types
- 11c50d4: feat: adding streams to cli

## 0.5.18

### Patch Changes

- bed9ab4: revert: reverting ajv array transformation
- d4dd093: feat: coerce top level strings to arrays

## 0.5.17

### Patch Changes

- 2f77f5f: feat: coerce array types if needed via ajv validation

## 0.5.16

### Patch Changes

- 4046a85: feat: adding more error types

## 0.5.15

### Patch Changes

- 816eaaa: fix: don't throw an error if auth isnt required for a route

## 0.5.14

### Patch Changes

- 8531c5e: fix: export log routes in index since bundler can't find it

## 0.5.13

### Patch Changes

- 30b46aa: fix: looks like using patch lowercase breaks the node fetch client sometimes

## 0.5.12

### Patch Changes

- ff8a563: feat: only log warning errors for status codes we care about

## 0.5.11

### Patch Changes

- be68efb: fix: allow error handler to use errors other than EError
- 5295380: refactor: changing config object a getConfig function
- f24a653: feat: coerce types in ajv for correct validation / usage later on

## 0.5.10

### Patch Changes

- effbb4c: doc: adding readme to all packages

## 0.5.9

### Patch Changes

- 3541ab7: refactor: rename nextDeclarationFile to nextJSFile
- 725723d: docs: adding typedocs

## 0.5.8

### Patch Changes

- 1876d7a: feat: add error return codes to doc generation
- 8d85f7e: feat: load all schemas on start optionally instead of validating they were loaded

## 0.5.7

### Patch Changes

- df62faf: fix: bumping up routes meta

## 0.5.6

### Patch Changes

- 0883f00: fix: schema generation error

## 0.5.5

### Patch Changes

- 93b80a3: feat: adding a beta openapi standard

## 0.5.4

### Patch Changes

- 6cac8ab: feat: adding a do not edit to cli generated files

## 0.5.3

### Patch Changes

- 8065e48: refactor: large cli refactor for a better dev experience

## 0.5.2

### Patch Changes

- 5e0f033: feat: adding a routes map output file to support frontend sdks in the future

## 0.5.1

### Patch Changes

- 97900d2: fix: exporting plugins from default barrel files
- d939d46: refactor: extracting nextjs and fastify to plugins
- 45e07de: refactor: renaming packages and pikku structure

## 0.4.7

### Patch Changes

- ddaf58f: feat: adding hostname to servers

## 0.4.6

### Patch Changes

- 2a2402b: republish since something went wrong

## 0.4.5

### Patch Changes

- c73afd6: this should have been published..

## 0.4.4

### Patch Changes

- 0650348: fix: export schemas using \*
- 1a708a7: refactor: renaming PikkuCLIConfig back to PikkuConfig
  feat: adding .end() to pikku response for servers that need it
- 642d370: fix: adding schema error logs on fail

## 0.4.3

### Patch Changes

- 94f8a74: fix: finalizing cjs and esm packages

## 0.4.2

### Patch Changes

- 28f62ea: refactor: using cjs and esm builds!
- 14783ee: fix: including all types as dependencies to avoid users needing to install them

## 0.0.18 - 05.09.2022

feat: adding a maximum compute time for better error handling on lambda timeouts

## 0.0.17 - 24.08.2022

fix: use error name instead of constructor for better management of instanceof

## 0.0.10 - 21.07.2022

feat: add a transform session call incase jwt provided belongs to a third-party like aws cognito

## 0.0.9 - 26.06.2022

chore: Upgrading dependencies

## 0.0.6 - 13.04.2022

chore: Upgrading dependencies

## 0.0.5 - 19.02.2022

chore: Upgrading dependencies

## 0.0.4 - 26.09.2021

feat: Adding writeFile, readFile and deleteFile APIs

## 0.0.3 - 02.09.2021

chore: Updating dependencies

## 0.0.2 - 02.08.2021

Fix: deleting files with correct path in local files

## 0.0.1 - 27.07.2021

Fix: Using global space for schemas as it appears to not always return the same file

## 23.07.2021

### Initial Release

A package that contains pikku types
