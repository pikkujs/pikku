## 0.12.29

### Patch Changes

- ae4f59a: Gate admin capabilities on scopes, and scaffold user management

  Admin capabilities were gated on `user.role === 'admin'` — a single text column
  meaning "can do everything". Impersonating a user, rebinding a shared
  credential and reading the user directory are distinct capabilities that one
  user can hold independently, so they are now scopes on an `admin` tree:

  | Gate                                   | Scope                    |
  | -------------------------------------- | ------------------------ |
  | impersonation                          | `admin:impersonate`      |
  | `credentialOAuth`'s `canLinkSingleton` | `admin:credentials:link` |
  | reading the user directory             | `admin:users:list`       |
  | creating a user out of band            | `admin:users:create`     |
  | ban / unban                            | `admin:users:ban`        |
  | delete a user                          | `admin:users:remove`     |
  | revoke a user's sessions               | `admin:users:sessions`   |
  | set a user's password                  | `admin:users:password`   |

  Holding the bare `admin` scope satisfies all of them via pikku's existing
  parent-grant rule, so it is a one-for-one replacement for the old role.

  better-auth's `admin()` plugin is still what implements ban, delete,
  session-revocation and set-password, so it stays. Its `user.role` column is no
  longer something pikku grants: it is _projected_ from the scope store when a
  session is built, and only from the scopes whose capability better-auth's own
  endpoints gate on the caller's role. Someone granted `admin:users:list` can read
  the directory — which goes straight to the auth adapter — without gaining the
  power to ban, and revoking a scope demotes the role on the next sign-in. Scopes
  remain the single source of truth.

  New `scaffold.userAdmin` in `pikku.config.json` generates the whole set —
  `pikkuAdminListUsers`, `pikkuAdminCreateUser`, `pikkuAdminSetUserBanned`,
  `pikkuAdminRemoveUser`, `pikkuAdminRevokeUserSessions` and
  `pikkuAdminSetUserPassword` — into your project. Listing or banning a user is
  ordinary application behaviour and must not require installing the console.
  Codegen fails with an actionable error if better-auth is wired without
  `admin()`. The console's Users page calls these same functions, showing each
  action only where the caller holds its scope.

  Every scaffold now emits a directory named for its domain — `scaffold/admin/`,
  `scaffold/rpc/`, `scaffold/agent/`, `scaffold/auth/`, `scaffold/console/`,
  `scaffold/graph/`, `scaffold/realtime/`, `scaffold/scenarios/`,
  `scaffold/webhook/`, `scaffold/workflow/` — holding its wiring file beside a
  `*.schemas.gen.ts` sibling, and every generated payload is a zod schema instead
  of a TypeScript generic. The schemas have to stand alone: the inspector reads a
  zod schema by importing the module that declares it, which it cannot do for a
  wiring file whose relative pikku-types import per-unit deploy codegen rewrites.

  Resolving a schema by reference rather than by name also fixes the agent HTTP
  surface. `agentCaller` and `agentStreamCaller` take the same payload but had to
  repeat the type literal verbatim in each generic position, because the extractor
  synthesised the schema name from the _function_ name and so recorded an
  `inputSchemaName` with no schema behind it whenever the two shared a named
  alias — every agent call through that alias failed with `MissingSchemaError`.
  One `AgentCall` schema now backs both.

  Where a payload's shape belongs to `@pikku/core` (`WorkflowRunStatus`,
  `FunctionCoverageReport`, `StubCall[]`) the generated function carries no
  `output` schema and the inspector infers it from the handler's return type;
  re-declaring a core type in zod would be a second definition free to drift.

  Upgrading rewrites the layout in place: codegen prunes the pre-directory copy of
  each scaffold file before it inspects the source tree, since the old flat file
  still wires the same routes and leaving it behind would wire everything twice.

  `@pikku/core` gains `hasScopes(required, held)`, the non-throwing counterpart to
  `verifyScopes`, and declares `auth` on `CoreSingletonServices` — the auth
  instance the generated `pikkuServices` wrapper already injected but never typed.
  A scope root declared twice (an addon and its host both contributing the same
  `admin` tree) now flattens to one entry per id instead of emitting it twice.

  BREAKING: there is no role fallback for the scope-gated capabilities. An app
  that relied on the old default must register a `ScopeService` and grant `admin`
  (or a narrower `admin:*` scope). Every gate fails closed and warns when no
  `ScopeService` is registered. `delegatedAuth`'s `defaultRole`/`mapRole` now
  grant a pikku role through the `ScopeService` instead of writing better-auth's
  `role` column, and the `credentialOAuth` platform user no longer sets `banned`.

  BREAKING: the console reads its user directory over the scaffolded
  `pikkuAdminListUsers` RPC (gated on `admin:users:list`, backed by better-auth's
  `$context.adapter`) instead of `client.admin.listUsers`, and
  `UsersTableUser`/`UsersTableLabels` no longer carry `role` — there is no role
  column to render. `@pikku/addon-console` no longer ships a `console:listUsers`
  function: user management is not the console's job, so a host that wants the
  Users page must enable `scaffold.userAdmin`.

- Updated dependencies [ae4f59a]
  - @pikku/better-auth@0.12.19
  - @pikku/core@0.12.67

## 0.12.28

### Patch Changes

- df54b6f: Drop dead service-existence guards from the console addon functions.

  All 27 `if (!service) throw new MissingServiceError(...)` guards are removed.
  A service is optional only when nothing destructures it — in which case it is
  never created — so a guard inside a function that _does_ destructure it can
  never fire. Now that wired functions receive `WiredServices`, these are dead
  code and the compiler agrees: the addon typechecks with the guards gone.

  Two function descriptions that documented the unreachable `MissingServiceError`
  are corrected.

- Updated dependencies [5f19016]
- Updated dependencies [78e4778]
- Updated dependencies [4324652]
- Updated dependencies [de044f8]
- Updated dependencies [cd1a811]
- Updated dependencies [19fa6f0]
- Updated dependencies [b501612]
- Updated dependencies [eb37b1e]
  - @pikku/core@0.12.66

## 0.12.27

### Patch Changes

- 1dd7928: Route `getOpenapis`/`getOpenapiDetail` through `AddonService` and the fabric registry's `/registry/openapis` endpoints (unifying with the package funcs on `FABRIC_API_URL`), instead of the divergent `REGISTRY_URL`/`/api/openapis` path.
- e3dc7d7: When installing a second-or-later instance of the same addon package, the console now writes namespace-scoped `secretOverrides`/`variableOverrides`/`credentialOverrides` into the generated `wireAddon` so the two instances don't silently share one credential. The first (sole) instance stays plain and keeps the package's documented logical names. Overrides are a sensible default only — the generated file is the user's to edit or drop (the runtime and inspector both fall back to the logical name when an override is absent).
- 78f0b8c: The addon Setup tab is now instance-aware. A new `getAddonInstances` RPC returns every wired instance of a package with its per-instance overrides, and when a package is installed more than once the Setup tab shows an instance selector. The selected instance's `credentialOverrides`/`secretOverrides` are resolved so the OAuth connect and secret status/set actions target that instance's actual project names (and the resolved names are shown), instead of always acting on the package's shared logical names.
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

- 13474a6: feat: role and scope management functions

  Adds functions over `ScopeService` for listing the declared scope vocabulary,
  composing roles from it, and granting roles to users. Grants take effect on the
  user's next request — no re-login.

  These are self-hosting: the console declares its own `pikku:scopes:read` and
  `pikku:scopes:manage` scopes and requires them, so being able to reach the
  console is not the same as being able to grant yourself anything.

  The addon's `createSingletonServices` now forwards the host's `scopeService`
  through to these functions — without it the addon composed a services object
  that dropped `scopeService`, so every scope RPC silently returned an empty
  result behind a passing scope gate.

- 4a624cc: Installing an addon now returns typed errors instead of a raw 500. Re-installing
  under a name that's already wired raises a `ConflictError` (409) with a clean,
  path-free message ("An addon is already installed under the name ..."), and
  invalid package/namespace/version inputs raise `BadRequestError` (400) — so the
  console surfaces them inline as user-facing errors rather than a server stack
  trace.
- 70fa400: Add outgoing webhooks — `webhookService.send()` enqueues signed deliveries onto a retrying queue, `@pikku/kysely`'s `KyselyWebhookService` persists per-attempt delivery history, and `@pikku/console` gains a read-only `/webhooks` page; also caches resolved secrets in `TypedSecretService` and registers inline-`func` metadata for queue/scheduler/trigger/gateway wirings.
- 3c75366: Key `secretOverrides`/`variableOverrides` on the secretId/variableId (the string the addon actually reads by — its typed map is keyed by id, e.g. `getSecret('MAILGUN_CREDENTIALS')`), not the logical meta name. The runtime aliaser already keys on the id, but the inspector merge + validation keyed on the logical name, so a correctly-keyed override failed validation and never provisioned its target whenever an addon's logical name differed from its id (the common case — `mailgun`/`MAILGUN_CREDENTIALS`). The existing test masked it by using a secret whose name equalled its id. The merge now resolves and provisions by id (with a name-fallback for older meta), validation checks ids, and the console install codegen generates overrides keyed by id.
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

- Updated dependencies [7ab5287]
- Updated dependencies [e86bc17]
- Updated dependencies [a9b96a0]
- Updated dependencies [3f7fc54]
- Updated dependencies [c478794]
- Updated dependencies [3f04ae4]
- Updated dependencies [90d9f04]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [0a7db82]
- Updated dependencies [981c4db]
- Updated dependencies [13474a6]
- Updated dependencies [5a2b0d5]
- Updated dependencies [13474a6]
- Updated dependencies [ee040dc]
- Updated dependencies [cb079cc]
- Updated dependencies [13474a6]
- Updated dependencies [9f0d0eb]
- Updated dependencies [13474a6]
- Updated dependencies [70fa400]
- Updated dependencies [7b2ea23]
- Updated dependencies [1dc77d5]
- Updated dependencies [416606c]
- Updated dependencies [d2a6eea]
- Updated dependencies [30e62ee]
  - @pikku/core@0.12.64

## 0.12.26

### Patch Changes

- cd0cff1: Remove the `pikku tests` harness in favour of scenarios (`pikku scenario run` + `pikku dev --coverage`).
  - `@pikku/cli`: `pikku tests init` / `pikku tests coverage` are gone, along with the workspace-validate hints that suggested scaffolding the ftest harness.
  - `@pikku/cucumber`: refactored to e2e-only — keeps `Actor`, the browser world, `createDbUtils`, `PersonaData`, and the `StubTracker` re-export; the in-process function world (`createFunctionWorld`, `registerHooks`, `registerCommonSteps`, stub wires) is removed.
  - `@pikku/console`: the Tests page is removed; Scenarios moves to `/scenarios`.
  - `@pikku/addon-console`: `runFunctionTests` / `streamFunctionTests` / `getFunctionCoverage` RPCs are removed — live coverage via `takeLiveCoverage` / `resetLiveCoverage` (from `pikku dev --coverage`) replaces the file-based report.

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

- Updated dependencies [ded4f90]
  - @pikku/core@0.12.54

## 0.12.25

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

- Updated dependencies [efb0406]
- Updated dependencies [fe4f5ca]
  - @pikku/core@0.12.53

## 0.12.24

### Patch Changes

- 472a349: Rename the userflow concept to scenario (#862). `pikkuUserFlow` becomes `pikkuScenario`, `pikku userflow run/list` becomes `pikku scenario run/list`, the workflow meta flag `userFlow` becomes `scenario`, actor types are now `ScenarioActor`/`ScenarioActors`/`ScenarioActorConfig` (`createHttpScenarioActors`), pikku.config.json's `userFlows` key becomes `scenarios`, the generated actors file is `pikku-scenario-actors.gen.ts` (`createScenarioActors`), the actor sign-in secret env var is `SCENARIO_ACTOR_SECRET`, and the console's User Flows view is now Scenarios.
- Updated dependencies [61c9ce9]
- Updated dependencies [f1f39f8]
- Updated dependencies [c45e98d]
- Updated dependencies [472a349]
  - @pikku/core@0.12.52

## 0.12.23

### Patch Changes

- b919815: Fix "pikku.config.json not found" on installAddon/installOpenapiAddon (and a matching bug in createSingletonServices' projectRoot for StateDiffService/CodeEditService) in monorepo layouts. These derived the project root as `dirname(metaService.basePath)`, which is only correct when `.pikku` sits directly next to pikku.config.json. In Fabric sandboxes (basePath is `packages/functions/.pikku`), that resolved to `packages/functions` instead of the real root, so pikku.config.json was never found. A new findProjectRoot() walks up from basePath looking for pikku.config.json, matching the CLI's own findConfigFile() behavior.
- e57dd65: console addon: require an authenticated session by default

  All exposed console RPCs are now `pikkuFunc` (require a session) instead of
  `pikkuSessionlessFunc` + `auth: false` — the console is an admin surface, so it
  should never be reachable anonymously. The two SSE streaming routes
  (`/workflow-run/:runId/stream`, `/function-tests/stream`) stay sessionless, since
  their HTTP wiring is intentionally `auth: false`.

  Behaviour change for consumers: a host that mounts `@pikku/addon-console` must
  provide an authenticated session (e.g. via better-auth) to reach console RPCs —
  unauthenticated calls now return `403`. Permission policy on top of "must be
  logged in" (admin-only, org scoping, …) remains host-owned via tag/HTTP
  middleware; the addon only enforces the baseline.

  `@pikku/cli`:
  - `pikku all` now **throws** when `scaffold.console` is enabled but no
    `pikkuBetterAuth(...)` is found in the project — scaffolding the console
    without an auth strategy would produce a console that 403s on every call, so
    `scaffold.console` alone is no longer the minimum.
  - The scaffolded `console.gen.ts` secret/variable RPCs (`setSecret`, `getSecret`,
    `hasSecret`, `getVariable`, `setVariable`) are now generated as `pikkuFunc`
    (require a session) instead of `pikkuSessionlessFunc` + `auth: false` — these
    read/write secrets and must never be anonymous. The two SSE routes stay
    `auth: false`.
  - `scaffold.console` is now always `"auth"` (the `"no-auth"` mode is gone for the
    console): `pikku enable console` writes `"auth"` and ignores `--no-auth`.

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

- Updated dependencies [7ebea62]
- Updated dependencies [e57dd65]
  - @pikku/core@0.12.51

## 0.12.22

### Patch Changes

- 92bd643: User flows in the console: workflow graph extraction now captures
  `workflow.expectEventually` steps and per-step actor names (`{ actor:
actors.x }`), workflow meta carries `actors`/`title` into the serialized
  graph, the CLI emits `user-flow-actors.gen.json` for the new
  `MetaService.getUserFlowActorsMeta()`, and the console Workflows page gains a
  Workflows / User Flows / Personas toggle. Also fixes complex-workflow graphs
  being clobbered by a duplicate basic-extraction pass after successful DSL
  extraction.
- Updated dependencies [35a9bab]
- Updated dependencies [92bd643]
  - @pikku/core@0.12.50

## 0.12.21

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [41ce2cb]
  - @pikku/core@0.12.44

## 0.12.20

### Patch Changes

- a1acc23: fix(console): make the Tests tab show scenarios after a run

  The Tests tab renders scenarios from `meta.functions[].tests.scenarios`, which
  `readAllMeta()` builds by reading the function-tests harness's coverage JSON and
  Cucumber HTML report. Three drifts left every function with `tests: undefined`:
  - **`loadFunctionTests` looked in the wrong place.** It probed
    `function-tests/coverage/function-coverage.json` and
    `function-tests/tests/reports/cucumber-report.html`, but the harness (and
    `pikku tests coverage`) actually write `tests/.coverage/function-coverage.json`
    and `tests/tests/reports/cucumber-report.html`. It now anchors on
    `resolveFunctionsDir(metaService.basePath)` — the same single source of truth
    the run handlers and coverage writer use — and keeps the old relative paths as
    a fallback.
  - **The console "Run tests" stream never wrote the HTML report.** It ran
    Cucumber with `--format message` only (for the live view), so scenarios
    vanished once the run finished. It now also emits
    `html:tests/tests/reports/cucumber-report.html`.
  - **`pikku tests coverage` had the same gap** — no `--format`, so no report.
    It now writes the HTML report alongside the default progress output.

## 0.12.19

### Patch Changes

- fa7a09c: Add gateway metadata generation and display enabled gateways in the console.
- Updated dependencies [ae7fc5d]
- Updated dependencies [fa7a09c]
  - @pikku/core@0.12.37

## 0.12.18

### Patch Changes

- 25a1f6d: Make the function-test harness work for monorepo + engine-aware projects:
  - `@pikku/addon-console`: the Run-tests and coverage handlers now resolve the
    functions dir robustly (`<root>/packages/functions` when present), and
    `getFunctionCoverage` reads the actual coverage output path
    (`tests/.coverage/function-coverage.json`) instead of a stale
    `function-tests/coverage/...` path — so the console's coverage button works in
    monorepo sandboxes.
  - `@pikku/cli`: `pikku tests init` now detects the db engine (`db/sqlite` /
    `db/postgres`) and points the harness at the correct migrations + seed
    (`db/<engine>` + `db/<engine>-seed.sql`) instead of the hardcoded
    `db/migrations`. It also scaffolds a green starter `example.feature` and an
    empty `yarn.lock` (so the standalone tests package installs under Yarn Berry).
    Postgres harness support is tracked in #758.
  - `@pikku/cucumber`: `createDbUtils.buildBaseDb` tolerates a missing/empty
    migrations dir or seed file instead of crashing on `scandir('')`.

- Updated dependencies [f6adc1c]
  - @pikku/core@0.12.36

## 0.12.17

### Patch Changes

- 0a2af8b: Stop addon packages from rebuilding via the workspace pikku CLI at publish time.

  `npx changeset publish` runs up to 10 `npm publish` processes concurrently, and
  `@pikku/cli`'s publish build (`build.sh`) starts with `rm -rf -- .pikku dist`.
  An addon whose `prepublishOnly` ran the workspace CLI (`pikku all`, or a
  `build.sh` invoking `cli/dist/bin/pikku.js`) could read `packages/cli/dist`
  mid-wipe and fail with `Cannot find module '.../cli/dist/src/services.js'`,
  breaking the release. `yarn release` already builds every package before
  publishing, so the `prepublishOnly` rebuild was redundant; it has been removed
  from both addons and a `check:no-publish-rebuild` guard now fails CI if any
  published package reintroduces a publish-time CLI rebuild.

## 0.12.16

### Patch Changes

- 807a8d0: Fix the `build` script masking failures. The trailing `2>/dev/null; true` sat outside the `&&` chain, so `yarn build` could exit `0` even when `pikku all` or `tsc` failed, hiding broken builds. `pikku all` and `tsc` failures now propagate, while each `.d.ts` copy step is independently tolerant (`|| true`) so a missing `rpc`/`agent`/`workflow` directory no longer blocks the others or fails the build.

## 0.12.15

### Patch Changes

- 5283434: Redesign the Addons → Community tab as a card gallery: a hero banner, a category rail derived from addon metadata, a sort bar, and addon cards (category icon, publisher badge, tags, function/agent stats, install action). Selecting a card opens a right-hand detail drawer with an Overview ("What's included" surface tiles + publisher) and Functions tab, replacing the full-page navigation. Installed and APIs tabs are unchanged.

  The community catalog now reads from the Fabric registry API (`FABRIC_API_URL`, default `https://api.pikkufabric.com`) via `/registry/packages` instead of the standalone registry.

- Updated dependencies [6bca38f]
  - @pikku/core@0.12.35

## 0.12.14

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

- Updated dependencies [a027a8e]
- Updated dependencies [a027a8e]
- Updated dependencies [a027a8e]
- Updated dependencies [a027a8e]
  - @pikku/core@0.12.32

## 0.12.13

### Patch Changes

- f95dd07: feat(console): add an HTML tab to the email preview with an inline source editor

  The email preview now has a Desktop | Mobile | HTML toggle. The HTML tab shows the
  raw template source (`templates/<name>.html`) in a CodeMirror editor with a Save
  button that writes the file back via a new `console:updateEmailTemplate` RPC
  (local-dev only, mirrors `updateFunctionBody`), so small edits can be made from the
  console without leaving the preview. Saving invalidates and re-renders the preview.
  - `renderEmailPreview` now returns `source` (the un-rendered template HTML) so the
    editor binds to the source, never the rendered output.

- 409ec80: feat(console): Tests page with live SSE streaming and function test harness
  - `@pikku/addon-console`: add `streamFunctionTests` SSE function that runs the
    cucumber/c8 test harness and streams structured per-scenario events
    (scenario-start, step, scenario-done, done)
  - `@pikku/console`: TestsPage live run view — renders scenario names and step
    status in real time during a test run via SSE; adds `usePikkuSSE` hook and
    `showRunButton` prop
  - `@pikku/fetch`: add `subscribePikkuSSE` helper for typed server-sent event
    streams
  - `@pikku/cli`: wire SSE-returning functions through the console serialiser and
    RPC wrapper so the stream route is included in generated clients

- Updated dependencies [cd101a5]
- Updated dependencies [ac16265]
- Updated dependencies [a05e864]
- Updated dependencies [20750fd]
  - @pikku/core@0.12.30

## 0.12.12

### Patch Changes

- 5093725: runFunctionTests throws a descriptive error when tests dir is missing instead of returning null; db-codegen formatting reflow

## 0.12.11

### Patch Changes

- cd237c3: fix(pikku-console): use correct `tests` dir and `.coverage` output path in runFunctionTests

## 0.12.10

### Patch Changes

- fd61eb0: **Database schema visualizer in the OSS console.**

  A new `/database` route renders an interactive flowchart of your local development database directly in the pikku console.

  Changes:
  - `@pikku/addon-console`: new `console:getDbSchema` RPC backed by `DbSchemaService`. Introspects SQLite (Node 22+ built-in `node:sqlite`) or Postgres (`pg`, resolved via `DATABASE_URL` / `POSTGRES_URL`). Foreign-key edges are inferred from `PRAGMA foreign_key_list` (SQLite) or `information_schema` (Postgres). Classification data is merged from `db/annotations.gen.json` when present.
  - `@pikku/console`: new `DatabasePage` with a ReactFlow/ELK layout canvas. Columns are colour-coded by classification (public = teal, private = orange, secret = red). Includes a hide-internal-tables toggle and a refresh button.

- Updated dependencies [4b5c75b]
- Updated dependencies [4b5c75b]
  - @pikku/core@0.12.27

## 0.12.9

### Patch Changes

- 9060165: Agents now declare their model directly as `<provider>/<model>` (e.g. `openai/gpt-4o`). The `models`, `agentDefaults`, and `agentOverrides` config blocks have been removed.

  **Migration:** replace any bare `model: 'alias'` values with the full provider-qualified form and remove those blocks from `pikku.config.json`.

- 9060165: New `pikku tests init` scaffolds a Cucumber BDD test harness in your functions package. The companion `@pikku/cucumber` package provides the world, hooks, step library, and database utilities — wiring real Pikku RPC dispatch against an in-process SQLite copy seeded from migrations. `pikku tests coverage` generates per-function coverage summaries, surfaced in the console.
- Updated dependencies [9060165]
- Updated dependencies [9060165]
- Updated dependencies [9060165]
  - @pikku/core@0.12.21

## 0.12.0

## 0.12.8

### Patch Changes

- fbcf5b9: Console UX improvements: syntax highlighting for all code blocks, schema-aware client usage snippets for HTTP routes, HTTP tab sidebar layout, CLI/channel breadcrumb cleanup, detail panel max-width constraint
- Updated dependencies [fbcf5b9]
  - @pikku/core@0.12.16

## 0.12.7

### Patch Changes

- 624097e: Add deploy pipeline with provider-agnostic architecture
  - Add MetaService with explicit typed API, absorb WiringService reads
  - Add deployment service, traceId propagation, scoped logger
  - Rewrite analyzer: one function = one worker, gateways dispatch via RPC
  - Add Cloudflare deploy provider with plan/apply commands
  - Add per-unit filtered codegen for deploy pipeline
  - Skip missing metadata in wiring registration for deploy units
  - Fix schema coercion crash when schema has no properties
  - Fix E2E codegen: double-pass resolves cross-package Zod type imports

- Updated dependencies [9e8605f]
- Updated dependencies [624097e]
- Updated dependencies [7ab3243]
  - @pikku/core@0.12.15

## 0.12.6

### Patch Changes

- f85c234: Add unified credential system with per-user OAuth and AI agent pre-flight checks
  - Unified CredentialService with lazy loading per user via pikkuUserId
  - wire.getCredential() for typed single credential lookup
  - MissingCredentialError with structured payload for client-side connect flows
  - Console UI: Global/Users credential tabs, per-user OAuth connect/revoke
  - AI agent pre-flight check: detects missing OAuth credentials from addon metadata, shows "Connect your accounts" prompt before chat
  - CLI codegen: generates credentialsMeta per addon package for runtime lookup
  - Vercel AI runner: catches MissingCredentialError as runtime fallback

- Updated dependencies [f85c234]
- Updated dependencies [88d3100]
  - @pikku/core@0.12.14

## 0.12.5

### Patch Changes

- Fix publish: ensure dist/.pikku/ generated files are included in the published package

## 0.12.4

### Patch Changes

- Fix `#pikku` import alias: use conditional exports so published package resolves to compiled `dist/.pikku/pikku-types.gen.js` at runtime while keeping `.ts` for types during development

## 0.12.3

### Patch Changes

- Fix publish: exports now point to compiled dist/.pikku/ instead of root .pikku/ (TS-only), ensuring consumers can import .pikku/pikku-bootstrap.gen.js
- Remove redundant cp in build script that was overwriting compiled JS with source TS

## 0.12.2

### Patch Changes

- 387b2ee: Add agent thread/run management functions, workflow run streaming, and refactor services to receive DB services from host app
- Updated dependencies [387b2ee]
- Updated dependencies [32ed003]
- Updated dependencies [7d369f3]
- Updated dependencies [508a796]
- Updated dependencies [ffe83af]
- Updated dependencies [c7ff141]
  - @pikku/core@0.12.3

## 0.12.1

### Patch Changes

- 62a8725: Console UI improvements:
  - Add markdown rendering for addon detail pages
  - Add shared `ProjectSecrets` and `ProjectVariables` components to addon detail view
  - Show `Addon Service Not Running` status when an addon RPC endpoint is unreachable
  - Visual polish: unified badges, subtler borders, larger base rem
  - Fix dark mode colours throughout (CLI page, anchor colours, border variables)
  - Hide anonymous middleware/permission instances from the list view; add route table descriptions
  - Update documentation links to point to the correct pikku.dev URLs

- a83efb8: Handle OPTIONS preflight requests automatically in fetchData when no explicit OPTIONS route is matched. Runs global HTTP middleware (e.g. CORS) and returns 204. Remove redundant startWorkflowRun and streamAgentRun pass-through functions from addon-console.
- Updated dependencies [62a8725]
- Updated dependencies [a3bdb0d]
- Updated dependencies [e0349ff]
- Updated dependencies [62a8725]
- Updated dependencies [e04531f]
- Updated dependencies [62a8725]
- Updated dependencies [a83efb8]
- Updated dependencies [e04531f]
- Updated dependencies [8eed717]
- Updated dependencies [62a8725]
- Updated dependencies [62a8725]
- Updated dependencies [62a8725]
  - @pikku/core@0.12.1
  - @pikku/pg@0.12.1

### New Features

- Initial release of `@pikku/external-console` — backend functions for Pikku Console
- `console:getAllMeta` aggregates all project metadata into a single RPC call
- Workflow run management (start, stream, list, delete)
- Agent thread and run management with streaming support
- Schema introspection service
- External package icon and metadata service
- OAuth2 credential connect/disconnect/status/refresh flows
- Secrets and variables read/write functions
