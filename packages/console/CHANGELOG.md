## 0.12.40

### Patch Changes

- 1a86d3f: Add `onError` compensation to DSL workflows.

  A DSL workflow had no way to express error handling at all — `try/catch` is not
  an allowed statement, and step options carried only `retries`/`retryDelay`. A
  step can now name a compensation RPC:

  ```ts
  await workflow.do(
    'Charge',
    'chargeCard',
    { id },
    {
      retries: 3,
      onError: 'refundOrder',
    }
  )
  ```

  Semantics mirror a graph node's `onError` exactly: once the step's retries are
  exhausted the handler is invoked with `{ error: { message } }` and the original
  error is still thrown. This is compensation, not recovery — the workflow fails
  either way. The handler runs as its own durable step, so a replay cannot
  compensate twice, and it does not inherit `onError` itself.

  The handler is materialised as a real graph node, so it is wired like any other
  RPC and the console draws a dashed red "on error" edge to it rather than the
  route being invisible.

- Updated dependencies [1a86d3f]
- Updated dependencies [1a86d3f]
- Updated dependencies [1a86d3f]
- Updated dependencies [1a86d3f]
- Updated dependencies [1a86d3f]
- Updated dependencies [1a86d3f]
- Updated dependencies [b501612]
- Updated dependencies [3d76f51]
  - @pikku/core@0.12.65

## 0.12.39

### Patch Changes

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

- ea2ffe9: Add a "Setup" tab to the installed-addon detail that surfaces what the addon
  needs before it runs: its OAuth integrations (connect / connected status) and
  its secrets (set / not-set status), each with an inline connect or set action.
  The tab is the default view for an addon that has requirements, so opening a
  freshly added addon shows what still needs configuring. Status comes from
  `console:credentialStatus` (OAuth) and `pikkuConsoleGetSecret` (secrets);
  connecting reuses the admin-gated `/credential-oauth/link` redirect flow.
- a08d05c: Installing an addon from the console now lets you name the instance and drops
  you on its setup. The browse drawer gains an editable "Instance name" field
  (defaulting to the derived slug) that becomes the `wireAddon` name, so the same
  package can be wired under a distinct name. On a successful install the console
  routes straight to the addon's detail page, whose Setup tab surfaces the OAuth
  integrations and secrets the addon needs.
- 78f0b8c: The addon Setup tab is now instance-aware. A new `getAddonInstances` RPC returns every wired instance of a package with its per-instance overrides, and when a package is installed more than once the Setup tab shows an instance selector. The selected instance's `credentialOverrides`/`secretOverrides` are resolved so the OAuth connect and secret status/set actions target that instance's actual project names (and the resolved names are shown), instead of always acting on the package's shared logical names.
- c8ad159: `ShellHeader`'s offscreen width-measurement clone no longer duplicates the
  search input's placeholder and value in the DOM.

  The measurement layer re-renders each control to measure its natural width. For
  the search `TextInput` it rendered a second element carrying the same
  `placeholder`/`value`, so `getByPlaceholder(...)`-style lookups matched two
  elements. The measurement clone now drops the placeholder/value (and is marked
  read-only + `aria-hidden`), leaving a single interactive search field in the
  accessibility tree.

- b1a2be0: Render a suspended workflow run as its own yellow "waiting to be resumed" state instead of a red error, with distinct copy for `WORKFLOW_SUSPENDED` vs `RPC_NOT_FOUND` and a Suspended run-list filter.
- e2baa24: Render the Credentials overview as rows (the shared EntityCardList used by
  Workflows and Agents) instead of a card grid. Each row shows the credential's
  type, the addon that declares it (when it comes from one), its connected status,
  and inline connect/disconnect actions; clicking a row opens the owning addon's
  setup. The owner mapping is built from the installed addons' declared
  credentials so it stays accurate as addons are added or removed.
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

- ad75a76: Make the addons UI surface an installed addon's setup requirements:
  - The "Installed" filter now lists every addon the project has actually wired,
    not just catalogue entries that happen to be installed. It previously
    intersected the remote gallery with the installed set, so a local, private,
    or unpublished addon — returned by `console:getInstalledAddons` but absent
    from the catalogue — never appeared. It is now a left-join on the installed
    set: catalogue metadata is used when available, a minimal card otherwise.
  - Opening an installed addon now routes to its full detail page (which carries
    the Setup tab: OAuth integrations + secrets the addon needs, with connect/set
    actions) instead of the lightweight browse drawer. Not-yet-installed addons
    still open the drawer to preview before installing.

- 70fa400: Add outgoing webhooks — `webhookService.send()` enqueues signed deliveries onto a retrying queue, `@pikku/kysely`'s `KyselyWebhookService` persists per-attempt delivery history, and `@pikku/console` gains a read-only `/webhooks` page; also caches resolved secrets in `TypedSecretService` and registers inline-`func` metadata for queue/scheduler/trigger/gateway wirings.
- 83030f5: Hide the "Publish an integration" CTA on a read-only console (e.g. a deployed
  stage). Publishing is an authoring action, so it now only shows when the console
  is editable.
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

- 13474a6: Add a Scopes admin surface to the console.

  A new **Scopes** page (beside Users) with two tabs:
  - **Roles** — list the admin-composed roles and edit each one in a drawer that
    composes it from the declared scope vocabulary. Create and delete roles.
  - **Scopes** — a read-only view of the vocabulary declared in code via
    `wireScope`, flagging any scope that is stored but no longer declared (inert,
    and what `pikku scopes prune` removes).

  The **Users** page gains a per-row **Roles** action opening a drawer to grant
  and revoke a user's roles, with the resolved scope union shown read-only.

  All backed by the console addon's scope RPCs (`scopeListRoles`,
  `scopeListDeclared`, `scopeListUserRoles`, `scopeCreateRole`,
  `scopeSetRoleScopes`, `scopeDeleteRole`, `scopeAddUserToRole`,
  `scopeRemoveUserFromRole`).

- 6c64ebc: Remove the per-row impersonate action from the admin Users page. Impersonation
  is driven from the header (the impersonate control in the navbar), so the Users
  table no longer renders its own impersonate/stop buttons.
- 2112151: Workflow side panel now renders the flow vertically (top→down graph, or the scenario persona timeline) in place of the flat Nodes table; adds direction-aware ELK layout and exports WorkflowGraphView/PersonaTimeline for embedders.
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
- Updated dependencies [416606c]
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
- Updated dependencies [4b02d73]
- Updated dependencies [1dc77d5]
- Updated dependencies [416606c]
- Updated dependencies [d2a6eea]
- Updated dependencies [30e62ee]
  - @pikku/core@0.12.64
  - @pikku/assistant-ui@0.12.8
  - @pikku/fetch@0.12.8

## 0.12.38

### Patch Changes

- 090b18e: Extract a presentation-only `UsersTable` component from `AdminUsersPage` and export it. It takes `users`, translated `labels`, and an optional `renderActions` slot — no data fetching, router, or auth client — so external hosts (e.g. Fabric's server-brokered stage Users tab) can render the same table fed from their own source instead of duplicating the UI.

## 0.12.37

### Patch Changes

- 54efdd8: Expose the detail-panel system (`PanelProvider`, `usePanelContext`, `PanelContainer`, `PanelType`, `PanelData`) so an embedder can open the same right-hand configuration panels the console pages use, keyed by wire type + id. Adds a read-only `email` panel (rendered template preview) and an `openEmail` opener.

## 0.12.36

### Patch Changes

- 96fa59f: Scenarios no longer route into the workflow-run UI. The Scenarios list now
  navigates to its own `scenarios` section (a new `scenarioId` on the console
  navigator) and renders a read-only detail — scenarios can only be run via
  `pikku scenario run` (actor sign-in cookies can't be minted in the browser),
  so the workflow "run" button (which calls `startWorkflow` with no actors and
  throws "needs run actors") is never mounted for a scenario.

## 0.12.35

### Patch Changes

- 66f3dae: Move `@pikku/core` from `dependencies` to `peerDependencies` in the last packages that still declared it as a regular dependency.

  `@pikku/core` holds a single `pikkuState` registry and must resolve to exactly one copy at runtime — every wiring (workflows, RPCs, queue workers, middleware) registers into the copy it imports, and the runner reads the copy it imports. 35 packages already declare core as a peer for this reason; these six were the stragglers. Because they carried a regular `@pikku/core` dependency, bumping any one of them could leave a second, older core locked in a consumer's tree, splitting the registry so wirings silently fail to resolve (surfaced as `[PKU717] Multiple @pikku/core versions installed`).

  Making core a peer everywhere means the consuming app provides the one copy (the react/react-dom singleton pattern), so duplication is structurally impossible. `@pikku/core` is also kept as a devDependency in each package so it still builds/typechecks standalone.

  Backward-compatible for consumers that already list `@pikku/core` directly (every template does). A consumer that only pulled core transitively now gets a loud install-time peer warning instead of a silent runtime split — strictly better.

- 11582f3: Export `ScenariosPage` from the package index so host apps can embed it (it replaced the removed `TestsPage`), and make it reuse a host-provided `ConsoleNavigatorCtx` instead of always wrapping itself in the OSS query-param navigator.
- cd0cff1: Remove the `pikku tests` harness in favour of scenarios (`pikku scenario run` + `pikku dev --coverage`).
  - `@pikku/cli`: `pikku tests init` / `pikku tests coverage` are gone, along with the workspace-validate hints that suggested scaffolding the ftest harness.
  - `@pikku/cucumber`: refactored to e2e-only — keeps `Actor`, the browser world, `createDbUtils`, `PersonaData`, and the `StubTracker` re-export; the in-process function world (`createFunctionWorld`, `registerHooks`, `registerCommonSteps`, stub wires) is removed.
  - `@pikku/console`: the Tests page is removed; Scenarios moves to `/scenarios`.
  - `@pikku/addon-console`: `runFunctionTests` / `streamFunctionTests` / `getFunctionCoverage` RPCs are removed — live coverage via `takeLiveCoverage` / `resetLiveCoverage` (from `pikku dev --coverage`) replaces the file-based report.

- Updated dependencies [ded4f90]
  - @pikku/core@0.12.54

## 0.12.34

### Patch Changes

- aa5af7e: Fix cross-origin cookie auth in the console: `pikku()` now forwards the `credentials` option to `PikkuFetch`, so RPCs (e.g. `console:getAllMeta`) send the session cookie when the console is served on a different origin than the API (`pikku serve --console <port>`). Previously the option was accepted but dropped, causing a 403 and "Failed to load metadata" after sign-in.
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

- d4a2503: Serve the console same-origin at /console (#861). Both dev servers gain
  `staticMounts` (prefix → directory static serving with SPA fallback and path
  traversal protection); `pikku serve` / `pikku dev` mount the bundled console
  app at `/console` on the API port whenever it is bundled, so auth cookies are
  first-party and no `?server=` param is needed. The console is built with
  `base: '/console/'` (its router already derives the basename from BASE_URL).
  The separate `--console <port>` static server is removed; `pikku console`
  serves the bundle under /console and redirects the root there.
- c2917eb: Add a dedicated **User Flows** page to the console (#850)

  User flows and their personas now live under Tests → User Flows
  (`/tests/userflows`) instead of the Workflows page. The page has a
  `Flows | Personas` view: flow cards show their cast (overlapping persona
  avatars) and last-run status, personas render as cards with a read-only
  detail drawer, and opening a flow shows a persona-driven timeline of its
  steps (actor, status, and per-step RPC args). The Workflows page is now
  workflows-only. Built with Mantine primitives and theme-aware colours.

- bbbb196: Dev quick login for the console when running locally (#857). The better-auth
  catch-all handler now serves `<basePath>/dev/quick-login` when
  `PIKKU_DEV_QUICK_LOGIN` is set AND the request host is a loopback address:
  GET reports availability, POST idempotently seeds an `admin@pikku.dev` admin
  user and returns a signed-in session. `pikku serve` / `pikku dev` enable the
  flag by default (set `PIKKU_DEV_QUICK_LOGIN=false` to opt out), and the
  console login screen shows a one-click "Quick login as admin@pikku.dev"
  button whenever a local server advertises the endpoint.
- 472a349: Rename the userflow concept to scenario (#862). `pikkuUserFlow` becomes `pikkuScenario`, `pikku userflow run/list` becomes `pikku scenario run/list`, the workflow meta flag `userFlow` becomes `scenario`, actor types are now `ScenarioActor`/`ScenarioActors`/`ScenarioActorConfig` (`createHttpScenarioActors`), pikku.config.json's `userFlows` key becomes `scenarios`, the generated actors file is `pikku-scenario-actors.gen.ts` (`createScenarioActors`), the actor sign-in secret env var is `SCENARIO_ACTOR_SECRET`, and the console's User Flows view is now Scenarios.
- Updated dependencies [61c9ce9]
- Updated dependencies [f1f39f8]
- Updated dependencies [c45e98d]
- Updated dependencies [472a349]
  - @pikku/core@0.12.52

## 0.12.33

### Patch Changes

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

- 9f57d78: Addons page: add an Official filter alongside All | Installed, remove the Community Library hero (headline/stats) in favor of the filter bar, and lock the Addons tab to Installed with the Add button hidden when the console is read-only (deployed stage).
- 18399a2: The APIs tab now renders through the same gallery/card/drawer as Addons (kind="api" on CommunityGallery/AddonCard/AddonDetailDrawer) instead of a separate table page. The only functional difference is the action: an API is Imported (via installOpenapiAddon, generating a local addon from its OpenAPI spec) rather than Added from an npm package. The drawer shows an operation count instead of the functions/http/channels/secrets/variables tabs, since that data isn't available for an API entry today.
- e863ee2: Addon/API cards in the gallery no longer carry their own Add/Import button — the action lives only in the detail drawer now (the card just shows an "Added"/"Imported" badge once installed, and click-to-open otherwise). Install and OpenAPI-import mutations now surface a notification on both success and failure instead of failing silently.
- 6e46f66: Show install/import failures inline in the addon detail drawer (a red Alert above the CTA) instead of a toast notification. Success is already conveyed inline by the card/drawer flipping to the Added/Imported badge, so no separate success message is needed.
- Updated dependencies [7ebea62]
- Updated dependencies [e57dd65]
  - @pikku/core@0.12.51

## 0.12.32

### Patch Changes

- a9f3e1a: Restructure the addons/packages page: top-level tabs are now Addons | APIs, with an Installed | All filter on the Addons tab. The standalone installed-addons table is removed — the installed view reuses the community gallery filtered to what the project has wired
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

## 0.12.31

### Patch Changes

- 576f47b: AddonDetailDrawer functions tab renders per-function title, description and category from the registry entry (falls back to the bare function id when absent)
- bf3f376: AddonDetailDrawer gains HTTP routes / channels / secrets / variables tabs, shown only when the package surface has entries
- Updated dependencies [4c17f7e]
  - @pikku/core@0.12.49

## 0.12.30

### Patch Changes

- 8dfddc3: pikkuUserFlow: user flows as workflows. A complex workflow whose steps can run
  as actors over the real transport — `workflow.do(step, rpc, data, { actor:
actors.yasser })` — plus `workflow.expectEventually(...)` for polling async
  effects. Actor steps never queue and never dispatch internally, so auth
  middleware/permissions are exercised end-to-end; flows double as e2e tests and
  staged/production health checks. Ships UserFlowActor types +
  createHttpUserFlowActors (lazy sign-in via `/auth/sign-in/actor` with a
  server-held secret), inspector source `'user-flow'`, and a console badge.
- Updated dependencies [5f2c566]
- Updated dependencies [8dfddc3]
  - @pikku/core@0.12.48

## 0.12.29

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

- Updated dependencies [d0d97cb]
  - @pikku/core@0.12.46

## 0.12.28

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [41ce2cb]
  - @pikku/assistant-ui@0.12.7
  - @pikku/core@0.12.44
  - @pikku/fetch@0.12.6

## 0.12.27

### Patch Changes

- c6095df: feat(console): admin login gate + user impersonation

  Adds an admin-gated login flow and user impersonation to the console:
  - `AuthGate` / `LoginScreen` / `NotAuthorized` — gate the console behind a
    signed-in session and surface a clear "not authorized" state for non-admins.
  - `AdminUsersPage` driven by the Better Auth `adminClient` (`listUsers` /
    `setRole`).
  - `ImpersonationContext` + `ImpersonationBanner` / `ImpersonateDrawer` — an
    admin can act as another user. The selected target's id is sent as the
    `x-pikku-impersonate-user-id` header via `@pikku/fetch`'s `setHeader`, and is
    threaded through the agent-chat and workflow-run RPC calls so impersonated
    requests are scoped end to end. Pairs with the backend `betterAuthSession({ impersonation })` support.

## 0.12.26

### Patch Changes

- 49b1eeb: feat(console): cleaner email preview & editor design

  Redesign the EmailsPage preview/editor:
  - Replace the Popover/SegmentedControl template + mode selectors with `Select`
    dropdowns and a `PikkuSwitch` for preview mode (desktop/mobile/html/text),
    with matching i18n strings.
  - Add a syntax-highlighted, theme-aware HTML source view using
    `@codemirror/lang-html` + `@codemirror/theme-one-dark`, following the app
    colour-scheme tokens.
  - Add a vite resolver so generated `pikku-fetch`/`pikku-rpc` client imports
    resolve to their `.ts` sources in the console dev build.

## 0.12.25

### Patch Changes

- fa7a09c: Add gateway metadata generation and display enabled gateways in the console.
- Updated dependencies [ae7fc5d]
- Updated dependencies [fa7a09c]
  - @pikku/core@0.12.37

## 0.12.24

### Patch Changes

- 5783ff5: Extract `getServerUrl`/`setServerUrl` into a standalone, unit-tested `serverUrl` module (now defaults to the current origin instead of hardcoded localhost) and move test-stream error handling into a tested `testsStreamError` helper. Adds a clearer empty state + `pikku tests init` hint when no function-test harness is found, and proxies `/function-tests` and `/workflow-run` in the console dev server.
- Updated dependencies [f6adc1c]
- Updated dependencies [ade6f0b]
  - @pikku/core@0.12.36
  - @pikku/fetch@0.12.4

## 0.12.23

### Patch Changes

- e11a963: PikkuHTTPProvider: add a `credentials` prop (default `'include'`) that flows
  through to the underlying pikku instance, including the `usePikkuSSE` fetch.
  Cross-origin bearer-token setups (e.g. Fabric's sandbox runtime, served behind
  wildcard CORS without `Access-Control-Allow-Credentials`) can now pass
  `credentials="omit"` so the SSE/HTTP fetch isn't rejected at the CORS preflight.
  Same-origin cookie-auth consumers are unaffected by the default.
- 7be656f: Fix the email HTML tab overflowing its parent: CodeMirror had no width constraint, so long lines sized the editor to content and grew the preview panel past its container. Set CodeMirror `width="100%"` and add `minWidth: 0` down the flex chain so the editor scrolls internally instead of widening the layout.

## 0.12.22

### Patch Changes

- 5283434: Redesign the Addons → Community tab as a card gallery: a hero banner, a category rail derived from addon metadata, a sort bar, and addon cards (category icon, publisher badge, tags, function/agent stats, install action). Selecting a card opens a right-hand detail drawer with an Overview ("What's included" surface tiles + publisher) and Functions tab, replacing the full-page navigation. Installed and APIs tabs are unchanged.

  The community catalog now reads from the Fabric registry API (`FABRIC_API_URL`, default `https://api.pikkufabric.com`) via `/registry/packages` instead of the standalone registry.

- 5283434: Add `ShellHeader`: a responsive single-bar page header that replaces the tall title + action-bar block. Title (first to collapse) and count on the left; filters, search, selection switch and actions on the right. Filters that don't fit collapse into a funnel → drawer (search is the last to fold), action labels degrade to icons, and the selection switch becomes a cycling button when narrow — all measured, not breakpointed. Also exports `PikkuSwitch`/`PikkuSwitchOption`.
- Updated dependencies [6bca38f]
  - @pikku/core@0.12.35

## 0.12.21

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

- Updated dependencies [a027a8e]
- Updated dependencies [a027a8e]
- Updated dependencies [a027a8e]
- Updated dependencies [a027a8e]
  - @pikku/core@0.12.32

## 0.12.20

### Patch Changes

- 4a7fc67: fix(console): use the shared ResizablePanelLayout + ListPageHeader for the selected-template email view instead of a bespoke flexColumn/100vh shell, so it gets the standard page header (and headerRight action) and fills its container when embedded
- d984ce3: fix(console): fill parent container instead of forcing 100vh in ResizablePanelLayout and ThreePaneLayout so the layouts work when embedded
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
- Updated dependencies [409ec80]
- Updated dependencies [a05e864]
- Updated dependencies [20750fd]
  - @pikku/core@0.12.30
  - @pikku/fetch@0.12.3

## 0.12.19

### Patch Changes

- 6180ddb: Add `headerRight` prop to `EmailsPage` so callers can inject a refresh button or other controls into the page header.
- Updated dependencies [f4f7046]
  - @pikku/assistant-ui@0.12.6

## 0.12.18

### Patch Changes

- fd61eb0: **Database schema visualizer in the OSS console.**

  A new `/database` route renders an interactive flowchart of your local development database directly in the pikku console.

  Changes:
  - `@pikku/addon-console`: new `console:getDbSchema` RPC backed by `DbSchemaService`. Introspects SQLite (Node 22+ built-in `node:sqlite`) or Postgres (`pg`, resolved via `DATABASE_URL` / `POSTGRES_URL`). Foreign-key edges are inferred from `PRAGMA foreign_key_list` (SQLite) or `information_schema` (Postgres). Classification data is merged from `db/annotations.gen.json` when present.
  - `@pikku/console`: new `DatabasePage` with a ReactFlow/ELK layout canvas. Columns are colour-coded by classification (public = teal, private = orange, secret = red). Includes a hide-internal-tables toggle and a refresh button.

- Updated dependencies [4b5c75b]
- Updated dependencies [4b5c75b]
  - @pikku/core@0.12.27

## 0.12.17

### Patch Changes

- 6da42b8: Add consistent empty state system, responsive list page header, and WebSocket routing for console RPCs
- Updated dependencies [909eb25]
  - @pikku/core@0.12.26

## 0.12.16

### Patch Changes

- 9060165: The console now shows function version history, live queue depths with a Failed column, and scheduler last-run status with run history. Workflow canvas and run selector have been polished. The console build is ~6.5× faster thanks to a switch to rolldown-vite (Vite 7 + Oxc React transform).
- Updated dependencies [9060165]
- Updated dependencies [9060165]
- Updated dependencies [9060165]
- Updated dependencies [9060165]
- Updated dependencies [9060165]
- Updated dependencies [9060165]
  - @pikku/core@0.12.21
  - @pikku/assistant-ui@0.12.5
  - @pikku/fetch@0.12.2

## 0.12.0

## 0.12.15

### Patch Changes

- 5c98fd1: Show the empty-state placeholder on `AgentsPage` and `WorkflowPage` when the project has no agents or workflows, instead of rendering the panel layout with a blank detail pane. Placeholder also gets a `minHeight` so it renders consistently.
- Updated dependencies [424c777]
- Updated dependencies [311c0c4]
  - @pikku/assistant-ui@0.12.4
  - @pikku/core@0.12.18

## 0.12.14

### Patch Changes

- c5c8975: Highlight MCP tools, resources, and prompts missing descriptions

## 0.12.13

### Patch Changes

- fbcf5b9: Extract shared UI components (MetaRow, SectionLabel, ListDetailLayout, GridHeader, ListItem, DetailHeader, EmptyState, SearchInput, TagBadge, ValText) with CSS module for composability. Rename PageClient components to TabContent and move to tabs/. All shared components exported from package index.
- fbcf5b9: Major console redesign: icon rail sidebar, split-panel layouts for all tabs (Functions, MCP, Schedulers, Triggers, Queues, HTTP, Channels, CLI), theme overhaul with consistent badges/schema tables, tabbed API explorer with code snippets, and streamlined page headers.
- Updated dependencies [fbcf5b9]
  - @pikku/core@0.12.16

## 0.12.12

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
  - @pikku/assistant-ui@0.12.3

## 0.12.11

### Patch Changes

- f94afcc: Fix console hook RPC names to match scaffolded function names. Update pikku.config.json to use scaffold entries for console and workflow instead of addons config.
- 57a27ec: Fix secrets and variables RPC calls to use console: prefix
- 9da8d0f: Publish @pikku/console as a source-only package for consumers to build with their own Vite config. Adds customizable branding via VITE_CONSOLE_TITLE and VITE_CONSOLE_LOGO env vars.
- Updated dependencies [cc4a8e0]
- Updated dependencies [0f59432]
- Updated dependencies [52b64d1]
  - @pikku/assistant-ui@0.12.2
  - @pikku/core@0.12.10

## 0.12.10

### Patch Changes

- 87433f0: Add schema name validation in SchemaService to prevent path traversal attacks.
- Updated dependencies [e412b4d]
- Updated dependencies [53dc8c8]
- Updated dependencies [3fbd05c]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [8b9b2e9]
- Updated dependencies [8b9b2e9]
- Updated dependencies [b973d44]
- Updated dependencies [8b9b2e9]
- Updated dependencies [8b9b2e9]
  - @pikku/core@0.12.9
  - @pikku/fetch@0.12.1

## 0.12.9

### Patch Changes

- Updated dependencies [09491c6]
  - @pikku/core@0.12.8

## 0.12.8

### Patch Changes

- Updated dependencies [66519c9]
  - @pikku/core@0.12.7

## 0.12.7

### Patch Changes

- Updated dependencies [bb27710]
- Updated dependencies [a31bc63]
- Updated dependencies [3e79248]
- Updated dependencies [b0a81cc]
- Updated dependencies [6413df7]
  - @pikku/core@0.12.6

## 0.12.6

### Patch Changes

- Updated dependencies [198e68f]
  - @pikku/core@0.12.5

## 0.12.5

### Patch Changes

- Updated dependencies [688b5e8]
  - @pikku/core@0.12.4

## 0.12.4

### Patch Changes

- Make console components reusable across different frameworks (Next.js, Vite, etc.)
- Add router abstraction layer (`ConsoleRouter` context) replacing direct `react-router-dom` imports across all 26 component files
- Export all components, providers, hooks, and pages from package entry point
- Add `reactRouterAdapter` for Vite/React Router consumers
- Make `Sidebar` configurable with `sections`, `branding`, and `footer` props (defaults to existing nav)
- Make `AppLayout` accept `sidebar` prop for customization
- Add `PikkuHTTPProvider` `serverUrl` prop to allow host apps to provide the backend URL
- Move `react-router-dom` to optional peer dependency
- Add `./styles` and `./adapters/react-router` package exports

## 0.12.3

### Patch Changes

- e9672a0: Add `@pikku/addon-workflow-screenshot` addon — renders workflow diagrams as images using Playwright and the Pikku Console's React Flow renderer. Add `/render/workflow` route to the console for headless screenshot capture. Increase node label spacing in FlowNode.
- 387b2ee: Add agent playground with model/temperature overrides, installed/community addon tabs, and workflow canvas improvements
- Updated dependencies [387b2ee]
- Updated dependencies [387b2ee]
- Updated dependencies [32ed003]
- Updated dependencies [7d369f3]
- Updated dependencies [508a796]
- Updated dependencies [ffe83af]
- Updated dependencies [c7ff141]
  - @pikku/assistant-ui@0.12.1
  - @pikku/core@0.12.3

## 0.12.2

### Patch Changes

- Updated dependencies [cc4c9e9]
- Updated dependencies [3e04565]
  - @pikku/core@0.12.2

## 0.12.1

### Patch Changes

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
  - @pikku/websocket@0.12.1

### New Features

- Initial release of `@pikku/console` — visual explorer for Pikku project metadata
- Browse functions, workflows, agents, APIs, jobs, runtime services, and configuration
- Dark/light theme support
- Spotlight search across all resources
- Workflow and channel canvas visualizations
- Agent playground with streaming chat
- OAuth2 credential management UI
- Secrets and variables management
