## 0.12.63

### Patch Changes

- 3bef6b7: feat(nav-dock): let the dock's size be a preference

  The dock sized itself entirely from the window. One measured tile drove
  everything — the glyph, its stroke weight, the gap, the capsule's thickness, the
  inset it reserves — and that tile was whatever fitted the shorter window edge,
  capped at 54px. On a large display that cap is the only thing in force, so the
  dock is the same physical size on a 13" laptop and a 32" monitor, which means it
  reads as comfortable on one and tiny on the other. Density is not something the
  window can answer; it depends on how far away the person is sitting.

  `useDockPrefs` now carries a `scale` percent alongside `side` and
  `alwaysVisible`, persisted per browser as `nav-dock-scale` and defaulting to 100. It moves the whole tile band rather than overriding the fit: the loop still
  shrinks the row until it fits the window, so asking for 160% on a narrow laptop
  gets you the largest tile that will actually hold the full row instead of a
  clipped one. The reserved edge inset follows the measured tile as it always has,
  so a larger dock takes the space it needs and the page stops where it starts.

  The control is a slider, because the answer is a comfortable size rather than
  one of four named ones. `FlyoutRow` grows a `slider` variant for it — a row that
  draws a track under its label, reports the live value as its hint, and stays
  open while you drag, since a menu that closed on release would hide the thing
  being sized at the moment you want to look at it. It is a plain element rather
  than a `Menu.Item` so the pointer and the arrow keys reach the slider instead of
  the menu's roving focus.

- Updated dependencies [4058c3a]
- Updated dependencies [4058c3a]
- Updated dependencies [4058c3a]
- Updated dependencies [4058c3a]
- Updated dependencies [4058c3a]
- Updated dependencies [4058c3a]
- Updated dependencies [114c079]
- Updated dependencies [4450b2a]
- Updated dependencies [4058c3a]
- Updated dependencies [4058c3a]
  - @pikku/core@0.12.93

## 0.12.62

### Patch Changes

- 05e47cf: feat(virtual-user): make a run's history readable

  There was no way to ask what the virtual users had been doing. The scaffold
  generated a way to start a run and a way to read one back by id, and
  `VirtualUserRunStore.list()` — which takes a persona filter — had no caller at
  all. The console's Virtual Users screen was built entirely from static meta, so
  it could say who a persona was and what they could reach, and nothing about
  whether anybody had ever turned them loose.

  The scaffold now also generates `listVirtualUserRuns` and
  `getVirtualUserRunSteps`, both behind the existing `virtualUser:read` scope —
  the transcript is strictly more sensitive than the summary it belongs to, since
  it carries the live ids and payloads the run actually sent.

  The console reads the same two things through the console addon
  (`console:getVirtualUserRuns`, `console:getVirtualUserRunSteps`) off the host's
  own `virtualUserRunStore`, under a new `pikku:console:virtualUsers:read` scope.
  Going through the store rather than the scaffolded RPCs means a project's runs
  show up whether or not it turned `scaffold.virtualUser` on — wiring the store is
  all a run has ever needed. A host with no store answers with an empty list
  rather than an error: it has no runs, which is a true answer.

  Each persona now shows its recent runs under the declaration — status, when,
  steps and mutations, findings, disposition and seed — and opening one fetches
  its transcript. The steps are fetched only on open, because the history is read
  far more often than any single run is.

- 05e47cf: feat(virtual-user): put each persona on its own clock

  A budget says where one run stops. Nothing said how often a persona should use
  the application, so in practice each one ran whenever somebody remembered — and
  what actually tells you about a product is the same user coming back over a
  fortnight.

  Each persona now gets a row rather than a bigger budget. `virtualUserSchedule`
  holds `enabled`, the disposition and goals to run with, an interval **range**,
  and `nextRunAt`. `tickVirtualUserSchedules` acts on whichever rows are due:

  ```ts
  wireScheduler({
    name: 'virtualUsers',
    schedule: '0 * * * *',
    func: tickVirtualUserSchedules,
  })
  ```

  The tick is generated and wired by nobody, deliberately. A scaffolded
  `wireScheduler` would start spending an application's model budget the moment
  somebody ran `pikku all`, on a host that may not run schedulers at all. Tick
  resolution bounds how late a due persona is, never how often it runs.

  Three things it does that are easy to leave out:

  - The next due time is written **before** the run is dispatched, so a tick that
    dies halfway cannot hand the same persona to the next one. A dispatch that
    throws waits a full interval instead of retrying every minute for a week.
    That write is a compare-and-set against the `nextRunAt` the tick read, so it
    is also how a tick _wins_ the persona: two processes on the same cron see the
    same due row, and only the one whose claim lands dispatches.
  - A persona whose previous run is still `running` is skipped, not queued. Two
    copies of the same user acting at once is a different test, and its findings
    do not reproduce.
  - A run still `running` after two hours is failed. Without that, one restart
    mid-run blocks that persona's schedule permanently — which is where the
    stranded-record cost of not using a queue finally gets paid.

  Reschedule-on-completion was the other candidate and is worse in exactly one
  way, fatally: a crash between finishing and scheduling ends the persona forever,
  and the evidence is an absence.

  New: `VirtualUserScheduleStore` in core (with the tick, `isDue` and `nextRunAt`
  as pure functions), `KyselyVirtualUserScheduleStore` and its own schema —
  its own rather than a third table in `virtualUserSchema`, and owned by its own
  store, so a project that records runs and never wants them unattended carries no
  cadence table. `scaffold.virtualUser` gains `setVirtualUserSchedule`,
  `listVirtualUserSchedules` and the tick, behind a new `virtualUser:schedule`
  scope: starting a run spends money once with a caller watching, while writing a
  schedule spends it repeatedly with nobody there.

  The console's Virtual Users screen gains a **Run now** button beside a persona's
  run history, gated on `pikku:console:virtualUsers:run`. It dispatches the
  project's own `runVirtualUser` rather than starting a run itself, so a run the
  application would refuse — an acted-upon persona, a non-accountable disposition
  in production — is still refused.

- Updated dependencies [3c0012c]
- Updated dependencies [05e47cf]
- Updated dependencies [cfd364a]
- Updated dependencies [05e47cf]
- Updated dependencies [05e47cf]
- Updated dependencies [05e47cf]
  - @pikku/core@0.12.90

## 0.12.61

### Patch Changes

- 7382819: fix(nav-dock): one thickness at every edge, and up by default

  The dock's tile size was fitted against the window's width when it sat along
  the top or bottom and against its height when pinned to a side. On any normal
  landscape window those are very different budgets: a 1440×900 window let the
  horizontal row keep full-size 54px tiles while the same row down the 900px
  height had to shrink to fit, so moving the dock to a side visibly thinned it —
  the same object, two sizes, depending on which edge it was resting on. The fit
  now uses the shorter window edge whichever way the dock is turned, so the
  capsule is exactly as thick along the bottom as it is down the side, and the
  horizontal dock loses the height it only had because the window happened to be
  wide.

  The dock also now starts held open rather than hidden. Left to itself it
  reserved no layout and appeared on hover over the card gutter, which is the
  right resting state once you know it is there and an empty window if you do
  not — the reveal is only worth learning after you have seen what it reveals.
  `nav-dock-pinned` still persists per browser, so anyone who puts it away keeps
  it away.

- 7382819: fix(nav-dock): the dock sits under the modal layer, not over it

  Held open, the dock is full-width furniture across the foot of the window, and
  it was drawn at z-index 300 — above Mantine's modal layer at 200. The shell
  reserves the edge the dock takes, so the page itself never ran underneath it,
  but a Drawer or Modal is portalled to the document and sized to the whole
  window: its own footer landed in the dock's band and the dock took the click.
  The roles drawer's Save button was dead, and so was anything else a dialog put
  along its bottom edge. The dock now sits on Mantine's app layer, so a dialog
  covers it the way a dialog covers every other piece of app chrome.

- Updated dependencies [9687ad1]
- Updated dependencies [2d21628]
- Updated dependencies [985b87b]
- Updated dependencies [3a83f85]
  - @pikku/core@0.12.87

## 0.12.60

### Patch Changes

- 20d8a39: Split application administration out of the console addon into a new
  `@pikku/addon-admin`.

  `@pikku/addon-console` reads generated metadata, project source and knowledge
  notes from disk, so it only ever runs where there is a project checkout and a
  dev server. That made the console the only way to reach capabilities that have
  nothing to do with a console — listing users, composing roles, granting scopes,
  managing credentials, reading the audit trail — none of which touch a
  filesystem. Those now live in `@pikku/addon-admin`, which depends on nothing but
  `@pikku/core` and `@pikku/better-auth` and can be wired into a deployed
  serverless unit:

  ```ts
  wireAddon({ name: 'admin', package: '@pikku/addon-admin' })
  ```

  It ships the user directory (`admin:listUsers`, `createUser`, `setUserBanned`,
  `removeUser`, `revokeUserSessions`, `setUserPassword`), role and scope
  administration, credential administration and the audit trail.
  `console:getMyAccess` stays where it is: the console reads it to decide what to
  render, and it must not need a second addon wired to boot.
  Each function carries its own `admin:*` scope; the addon deliberately declares
  no `scopes` on `wireAddon`, because addon scopes are required _in addition to_ a
  function's own and an addon-level `admin` would force the umbrella grant on a
  caller granted only `admin:users:list`.

  Breaking for anyone calling these RPCs by name or granting their scopes:

  - `console:getAudits`, `console:getAuditFilters`, `console:scope*` and
    `console:credential*` are now `admin:*`.
  - `pikku:console:audit:read` is now `admin:audit:read`,
    `pikku:console:scopes:{read,manage}` are now `admin:scopes:{read,manage}`, and
    `pikku:console:credentials:{read,manage}` are now
    `admin:credentials:{read,manage}`.
  - The `admin` scope tree gains `credentials:{read,manage}`, `scopes` and
    `audit`. A bare `admin` grant now also covers reading the audit trail and
    administering roles; a role that means to exclude those must spell out the
    leaves it wants.
  - `scaffold.console` gates the console addon on `pikku:console` rather than
    `admin`, since `admin` is now the other addon's tree, and `@pikku/console`'s
    own `AuthGate` requires the same root (`isAdmin` on the auth context is now
    `canUseConsole`). Grant `pikku:console` to whoever should reach the console —
    the two are separate decisions, and a host may hand someone the console
    without handing them the user directory.

  `credentialListUsers` now reports the credentials each user actually holds
  rather than a matrix against the declared set, which is what removed its last
  dependency on the on-disk metadata.

  The `scaffold.userAdmin` generator is superseded by the addon and left in place
  for hosts still on it. Its copy of the `admin` scope tree — and the one exported
  as `ADMIN_SCOPE_TREE` from `@pikku/better-auth` — stay byte-identical to the
  addon's, as pikku still requires of a shared scope root.

- 266e3bc: One door per name: `@pikku/core/ecosystem/*` and the package root are gone

  `@pikku/core` published every module twice. `ecosystem/http` re-exported
  `./http`, `ecosystem/services` re-exported `./services`, and a name was
  reachable through either — so every addition had to be made in two places, and a
  consumer's import said nothing about what it actually used. The package root was
  the same problem at a larger scale: a single barrel of 206 names that no bundler
  could take apart, and the one specifier that revealed nothing at all.

  Both are deleted. Every name now lives on the subpath that owns it, and every
  import carries that subpath — `@pikku/core/http`, `@pikku/core/services`,
  `@pikku/core/errors`, `@pikku/core/types`.

  Deleting the facades meant the raw subpaths had to become a superset of them,
  which they were not: the facade tree had accumulated 25 names with no raw home
  and about 26 more filed under a different area than the module they came from.
  Those names moved to the area that owns them, and three areas were published as
  new entry points rather than left on a root that is going away — `./types` (the
  shared type surface, the largest single destination), `./state` and
  `./classification`.

  `./classification` is one door onto one subject: what a value is and how it must
  be handled. Its three halves would each have been an entry point — the brands
  and manifest types, the stored-form helpers (`hashToken`, `unsafeAsSealed` and
  friends), and `SecretValue` — split by whether a name happens to be a type or a
  value, which is the same defect as the facades. The duration and versioned-id
  helpers went to `./utils`, which already published, and `PikkuRequest` went to
  `./function`: it is the transport-agnostic request base, not an HTTP one — HTTP
  has `PikkuHTTPAbstractRequest`, and the only thing outside core that extends
  `PikkuRequest` is Azure's timer request.

  `./types` inherited the root barrel's habit before it inherited its contents, so
  the names with an owner elsewhere were moved off it. The middleware types and the
  five middleware factories — `pikkuMiddleware`, `pikkuMiddlewareFactory`,
  `pikkuChannelMiddleware`, `pikkuChannelMiddlewareFactory` and
  `pikkuAgentMiddleware`, runtime values on a types entry point — are now
  `@pikku/core/middleware`; the function meta types are `@pikku/core/function`;
  `SerializedError` is `@pikku/core/errors`; and the generic TypeScript helpers
  (`MakeRequired`, `PickRequired`, `PickOptional`, `RequireAtLeastOne`,
  `JSONPrimitive`, `JSONValue`) are `@pikku/core/utils`. What is left on `./types`
  is the vocabulary the wirings share, which no single module owns.

  `pikku` was itself a root barrel — `export * from '@pikku/core'` — and
  now exports only the services it bundles.

  One module survives at the old specifier, and only for the bootstrap:
  `packages/cli` is generated by the _published_ CLI pinned in its `build.sh`, and
  that CLI still writes a bare `@pikku/core` into the files it generates for the
  CLI itself. `bootstrap-compat/root.ts` carries the eight types it names, a test
  in core fails if that list grows, and it goes when the pin moves to a CLI
  released from this branch. The adapter names the pinned CLI reaches for —
  `pikkuState` and `CreateWireServices` — are rewritten to `@pikku/core/state` and
  `@pikku/core/types` by the same `build.sh` patch pass, so no second shim is
  needed for them.

  A guard test keeps the root shut: it parses imports and rejects a bare
  `@pikku/core` rather than grepping for it, because several tests hold a user's
  file as a template literal, where `import … from '@pikku/core'` is fixture text
  rather than an import this repo makes.

  An agent scaffold a project generated under an older CLI is refreshed rather
  than left to fail: `pikku all` already deleted one importing an entry point
  `@pikku/core` no longer publishes, and the `#pikku` hub joins that list.
  Without it a project that scaffolds the agent endpoint but
  declares no agents keeps the old file forever — the generator that would rewrite
  it only runs when agents exist, and the file being present is what stops it
  being regenerated as missing.

  `pikku new addon` also wrote a tsconfig `paths` map naming only the deleted hub.
  An addon's `imports` map points into `dist`, so `paths` is what resolves
  `#pikku/<leaf>` for the addon's own source build — it now names the two leaf
  patterns, in both the addon and its test harness.

- 786dae5: Bump every dependency whose latest release is a major across the monorepo, and
  port the code the majors broke: `cookie` 2's `parseCookie`/`stringifySetCookie`
  API in `@pikku/core` and the three runtime HTTP adapters, and assistant-ui 0.15's
  store client in `@pikku/assistant-ui`.
- 6eef0a0: Bump every dependency to its latest compatible minor/patch across the monorepo.
- 20d8a39: Drop better-auth's `admin()` plugin.

  `admin()` bundles three unrelated things: a `role` column, fifteen HTTP
  endpoints authorized against that column, and the enforcement that stops a
  banned user from getting a session. Pikku only ever wanted the third. The
  endpoints were never reachable directly — each sat behind a pikku function with
  its own `admin:users:*` scope — so all the plugin added was a second gate on a
  column that had to be kept in step with the scopes it duplicated. That sync
  (`syncProjectedAdminRole`, run on every authenticated request) is now gone
  along with the column.

  User administration is implemented against better-auth's internal adapter
  instead, exported from `@pikku/better-auth` so `@pikku/addon-admin` and the
  `scaffold.userAdmin` generator share one implementation:

  ```ts
  import {
    createAuthUser,
    deleteAuthUser,
    revokeAuthUserSessions,
    setAuthUserBanned,
    setAuthUserPassword,
  } from '@pikku/better-auth'
  ```

  Ban keeps its schema and its enforcement, in a plugin that does nothing else:

  ```ts
  import { ban } from '@pikku/better-auth'

  betterAuth({ plugins: [ban()] })
  ```

  `ban()` adds `banned`, `banReason` and `banExpires` to `user`, refuses to create
  a session for a banned user, and lapses an expired ban at the sign-in that would
  otherwise be refused. It makes no authorization decision of its own, so it never
  needs to know about scopes.

  Breaking:

  - Remove `admin()` from your better-auth `plugins`, and add `ban()` if you ban
    users. `pikku db generate` writes the migration; `user.role` and
    `session.impersonatedBy` are no longer declared by anything.
  - `callAdminApi`, `AdminApiHttpWire`, `syncProjectedAdminRole`,
    `projectedAdminRole` and `ADMIN_ROLE_SCOPES` are removed. `ADMIN_SCOPES`,
    `ADMIN_SCOPE_ROOT` and `ADMIN_SCOPE_TREE` are unchanged.
  - The `scaffold.userAdmin` codegen no longer fails without `admin()`. It now
    fails only when there is no better-auth at all, and warns when `ban()` is
    missing — banning is one capability of six, so the other five still generate.
  - The scope on each function is now the whole authorization decision. Anywhere
    that relied on `user.role` as a backstop no longer has one.

- 97c8359: feat(console): export the nav dock's preferences so an embedding app can move it

  `<NavDock>` is presentational and already reads `useDockPrefs()` itself — the
  side it sits on and whether it is held open (and so reserves its edge) come from
  localStorage rather than props, precisely so the dock and the menu that moves it
  can never disagree. But the only menu offering those controls lives inside
  `ConsoleNavDock`, which an app embedding the dock replaces wholesale: it builds
  its own zones from its own routes, and hands the dock its own account tile.

  So an embedding app could mount the dock but never offer "put it on the left" or
  "keep it visible", and its only route to the prefs was to restate the two storage
  keys and hope they stay put. Fabric had exactly that copy.

  `useDockPrefs`, `DOCK_SIDES`, `isVerticalDock` and `DockSide` are now part of the
  package's surface. Nothing changes for the console itself.

- f4cd54e: Find the package manager at the workspace root, and stop the impersonation banner covering the page

  Installing an addon from the console detected the package manager by looking
  only in the pikku root — the directory holding `pikku.config.json`. In a
  monorepo that is a package directory carrying neither a `packageManager` field
  nor a lockfile, so detection fell through to its `npm` default and ran
  `npm install` inside a yarn workspace, which dies on
  `Unsupported URL Type "workspace:"`. Detection now walks up to the workspace
  root, where both signals actually live, and a declared manager anywhere up the
  tree outranks a lockfile below it — a stray `package-lock.json` in a
  sub-package no longer overrides the root's declared yarn.

  The impersonation banner is fixed to the top of the window but reserved no
  space, so it painted over the top ~34px of every page and swallowed clicks on
  anything the page put there. It now publishes its measured height as
  `--app-banner-inset-top` and the app layout pads by it, following the same
  idiom the nav dock already uses for the edges it takes.

- 456c88b: Scenario runs are now kept, and the console reads them back.

  Every `pikku scenario run` files a record: the run's outcome and counts, each
  scenario's result with the prose of the steps as they read at the time, and the
  screenshots and video it left behind. The steps are snapshotted rather than
  referenced, so a run still reads correctly after the scenario that produced it
  has been rewritten.

  `ScenarioRunStore` is the interface, `FileScenarioRunStore` the on-disk
  implementation the CLI writes to — one folder per run, `run.json` beside its
  artifacts, under `<outDir>/scenario-runs`. It is a store in its own right rather
  than a corner of the workflow service, so a hosted console can keep the same
  records in a database and its footage in object storage without the functions
  that read them knowing the difference.

  The console's Scenarios page gained a Runs view (`?view=runs`) listing past
  runs, with a run's results, its step ladder, failures, and the screenshots and
  video inline. Reading and deleting runs are gated by the new
  `pikku:console:scenarios:read` and `pikku:console:scenarios:manage` scopes.

- 727671b: Add the public surface workspace: the doors into core read as documentation, with an export list per door and a detail panel per export.
- 727671b: Serve the public surface to the console. `console:getSurface` reads the doc
  shipped inside `@pikku/cli` and the usage the inspector measured into the
  project's outDir, each half optional, and `/surface` renders it from
  `useSurface()`. Both files are read on demand when the page asks, never at boot.
- Updated dependencies [7722ceb]
- Updated dependencies [375c1ff]
- Updated dependencies [02a70cd]
- Updated dependencies [aeef159]
- Updated dependencies [a281de6]
- Updated dependencies [266e3bc]
- Updated dependencies [02a70cd]
- Updated dependencies [786dae5]
- Updated dependencies [6eef0a0]
- Updated dependencies [3b1164a]
- Updated dependencies [3561d67]
- Updated dependencies [a91c433]
- Updated dependencies [02a70cd]
- Updated dependencies [9537f74]
- Updated dependencies [2b57ca8]
- Updated dependencies [266e3bc]
- Updated dependencies [9fce0f1]
- Updated dependencies [83683a0]
- Updated dependencies [456c88b]
- Updated dependencies [456c88b]
- Updated dependencies [c127273]
  - @pikku/core@0.12.85
  - @pikku/assistant-ui@0.12.12
  - @pikku/mantine@0.12.10
  - @pikku/react@0.12.6

## 0.12.59

### Patch Changes

- 17eea0d: feat(console): an addon install says what it still needs before a restart

  `wireAddon` only reaches the live registry when its module is executed at boot,
  so an addon installed into a running dev server is inert until a restart — while
  `installAddon` returned a bare `success: true` and the Addons tab kept showing
  the old list. The install now returns `restartRequired`, and whether the addon
  could actually start: `ready`, `missingSecrets` and `missingVariables`, read from
  the package's own declared secrets and variables under this instance's override
  names. A variable whose schema carries a default is never missing.

  `addonReadiness` re-runs that check for an already-installed instance, reading
  the override names out of its `<namespace>.addon.ts`, so a caller can gate the
  restart until the user has configured what the addon needs rather than
  restarting into a crash loop.

  The console renders that outcome instead of polling for the addon to become
  queryable. Installing used to navigate to the package page, which polled
  `getAddonInstalledPackage` for ~20s and then gave up with "Package not found" —
  re-inspecting the new wiring routinely takes longer, so a successful install
  looked like a failure. The page now shows what the install reported: the name it
  was wired under, that a restart is required, and either that it is ready or which
  secrets and variables are still unset.

  `readAddonDeclaredNames` also now finds meta in a package that ships `.pikku`
  only under `dist`, where it previously read as "declares nothing" and silently
  skipped the per-instance override derivation.

- 7406bfe: Rename the agent runtime from `AI*` to `Agent*` (#596)

  `AI` described the model provider, not the thing being named. Every symbol that
  belongs to the agent runtime now says `Agent`; the symbols that genuinely wrap a
  model provider — `AIEmbeddingService`, `AIProviderOptions`, `AIEmbedParams`,
  `AITranscriptionParams`, `AIGenerateImageParams` and their siblings, and the
  `@pikku/ai-vercel` / `@pikku/ai-deepinfra` / `@pikku/ai-voice` packages — keep
  their names.

  **Wiring**
  - `pikkuAIAgent` → `pikkuAgent`, `pikkuAIScorer` → `pikkuAgentScorer`,
    `pikkuAIJudge` → `pikkuAgentJudge`
  - `CoreAIAgent` → `CoreAgent`, `AIAgentInput` → `AgentInput`, `AIAgentStep` →
    `AgentStep`, `AIMessage` → `AgentMessage`, and the rest of the agent types
  - `AIAgentRunnerService` → `AgentRunnerService`, `AIStorageService` →
    `AgentStorageService`, `AIRunStateService` → `AgentRunStateService`

  **Entry points**

  `@pikku/core/agent` → `@pikku/core/agent`, `@pikku/core/agent-scorer` →
  `@pikku/core/agent-scorer`.

  **Queues**

  The scorer queues are now `agent-score-fast` and `agent-score-slow`. Drain the
  old `ai-score-fast` / `ai-score-slow` queues before deploying — jobs still
  sitting on them when the new workers start will never be picked up.

  **Scaffolds**

  The agent scaffold pikku wrote for your project — `<scaffold>/agent/agent.gen.ts`
  and its schemas file — imports `@pikku/core/ai-agent`, which no longer exists. A
  scaffold is normally written once and then left alone, so `pikku all` would find
  it present and leave the broken import in place. It now deletes an agent scaffold
  importing either removed entry point and regenerates it in the same run. Anything
  you added to that file goes with it, so move local edits out first.

  **Database**

  The agent tables are renamed: `ai_threads`, `ai_message`, `ai_tool_call`,
  `ai_working_memory`, `ai_run` and `ai_run_score` become `agent_threads`,
  `agent_message`, `agent_tool_call`, `agent_working_memory`, `agent_run` and
  `agent_run_score`, along with their indexes and the `ai_working_memory_pk`
  constraint. The same rename applies to the MongoDB collections.

  `ensurePikkuSchema` creates tables it cannot find, so an existing database will
  get empty `agent_*` tables and leave the old data stranded in `ai_*`. Rename
  them before the first boot on the new version:

  ```sql
  ALTER TABLE ai_threads        RENAME TO agent_threads;
  ALTER TABLE ai_message        RENAME TO agent_message;
  ALTER TABLE ai_tool_call      RENAME TO agent_tool_call;
  ALTER TABLE ai_working_memory RENAME TO agent_working_memory;
  ALTER TABLE ai_run            RENAME TO agent_run;
  ALTER TABLE ai_run_score      RENAME TO agent_run_score;
  ```

- eadea64: Reach the whole console from ⌘K, and report a name collision as a conflict.

  The command palette now lists every page in the navigation and, for anyone who
  can impersonate, the impersonation picker — so both are reachable without the
  chrome, which is a dock that only raises on hover at pointer widths and a closed
  sheet on a phone. Its shortcut no longer goes dead while a text field has focus,
  which is when reaching for the palette is most likely.

  Installing an addon under a name the project already wires now reports a
  conflict rather than a 500: the check asks the registry what is wired, so an
  instance wired from outside the addons directory is found too.

  A gherkin line in the knowledge viewer keeps a space between its keyword and the
  sentence, so the line reads as a sentence to anything reading the DOM rather
  than the layout.

- 6794681: Publish the ecosystem surface as per-area sub-barrels under `@pikku/core/ecosystem/*`, and point generated code, the CLI, the inspector and the runtime adapters at them.

  348 names that only generated code, the toolchain or a runtime adapter ever imports now have a second home on `@pikku/core/ecosystem/<area>` — one sub-barrel per area, matching how core already publishes its entrypoints, so no single barrel grows without bound and a consumer only pulls in the area it uses.

  This step is additive: every name is still exported from the entrypoint it was published from before, so nothing downstream breaks. Removing them from the app-facing barrels is a later change, and needs a release carrying `./ecosystem/*` first.

- a7fcd2e: Declare dependencies that were imported but missing from `package.json`

  `@pikku/openapi-parser` and `@pikku/better-auth` imported `zod`, `@pikku/next`
  imported `path-to-regexp`, `@pikku/cli` imported `kysely`, and
  `@pikku/assistant-ui` imported `rxjs`, none of which were declared. Each
  resolved through Yarn hoisting inside the monorepo and would fail for anyone
  installing the package on its own.

  `rxjs`, `kysely` and `path-to-regexp` reach consumers through public
  signatures — `Observable<BaseEvent>` is the return type of a published method,
  and `createCoercionPlugin` returns a `KyselyPlugin` — so they are runtime
  dependencies rather than build-only ones.

  `@pikku/assistant-ui` pins `rxjs` to the exact `7.8.1` that `@ag-ui/client`
  pins, rather than a caret range. The two packages exchange `Observable`s, so a
  range that floats to a second copy gives them two incompatible `Observable`
  types.

  `@pikku/kysely` also drops `SqliteSerializePlugin`, an alias of
  `SerializePlugin` that has been marked `@deprecated` in favour of it. Use
  `SerializePlugin`.

- Updated dependencies [7406bfe]
- Updated dependencies [6794681]
- Updated dependencies [a7fcd2e]
  - @pikku/core@0.12.84
  - @pikku/assistant-ui@0.12.11

## 0.12.58

### Patch Changes

- b73cc02: The nav dock's zones are now declared rather than inferred from section order.
  A `NavSection` says which zone it belongs to with `zone: 'row' | 'group'`,
  replacing the implicit "first section wins" rule that also left the untitled
  Changes section as a loose tile among the group tiles.

  The default nav is regrouped around what each screen is: eight surfaces you work
  on sit on the row (Overview, Functions, Workflows, Agents, Scenarios, Database,
  Emails, Knowledge) and the rest sit behind four named groups — AI, Wiring,
  Project and Access. Overview had no nav entry at all before this and was
  reachable only by URL or the `/` redirect.

  The dock also gains an account tile, folding appearance, metadata refresh,
  impersonation and **sign out** into one menu — sign out previously had no
  trigger anywhere in the shell except the not-authorized screen, which a
  signed-in user never sees.

- 3a4d50a: feat(console): one scope per console area, under `pikku:console`

  The console gated itself on a single `admin` scope declared on `wireAddon`, so
  one grant covered reading a secret, rewriting a function body and reading the
  audit trail alike — and the secret and variable brokers, which the CLI emits
  into the app's own scaffold rather than the addon, were not covered by the addon
  gate at all and carried no scope of their own.

  Every console function now declares the area it belongs to:

  ```
  pikku:console:secrets      read | write
  pikku:console:variables    read | write
  pikku:console:addons       read | install
  pikku:console:credentials  read | manage
  pikku:console:scopes       read | manage   (was pikku:scopes:*)
  pikku:console:audit        read            (was pikku:audit:*)
  pikku:console:wirings      read
  pikku:console:security     read | run
  pikku:console:workflows    read | manage
  pikku:console:agents       read | manage
  pikku:console:db           read
  pikku:console:knowledge    read
  pikku:console:emails       read | write
  pikku:console:code         write
  ```

  `pikku:console` grants the lot, and `pikku` still grants that — the generated
  `PIKKU_CONSOLE_TOKEN` session carries `['admin', 'pikku']`, so an external
  console keeps working untouched.

  **Migration.** `admin` no longer reaches the console: it is a different tree.
  Grant `pikku:console` alongside `admin` to keep an administrator's access as it
  was, or grant the individual areas to hand out less. The two existing console
  scopes moved: `pikku:scopes:read` / `pikku:scopes:manage` are now
  `pikku:console:scopes:*`, and `pikku:audit:read` is now
  `pikku:console:audit:read`.

- 9445352: The nav dock is now configurable, and its settings live in the account menu.

  **Always visible.** Held open, the dock stops being a thing that appears on
  hover and becomes furniture: it publishes the edge it occupies as
  `--nav-dock-inset-*`, and the layout pads by it, so the page card stops where
  the dock starts instead of running underneath it. Floating, it reserves nothing
  and keeps sitting in the card gutter that is already there.

  **Location.** The dock can sit on any of the four edges. Flyouts, tooltips and
  the arrow key that opens a tile's menu all follow the edge it is on, so nothing
  opens off-screen; the fit measurement is per-axis, and the decision to condense
  the contextual zone is retaken from scratch on a move, because a row that fitted
  along the window's width will not fit along its height.

  **Language, appearance and install app** join refresh, impersonate and sign out
  in the account tile. Each language is named in itself rather than in the
  language you are currently reading — someone who has landed in a locale they
  cannot read is exactly the person reaching for that menu. The chosen locale now
  persists and applies `lang` and `dir` to the document. Install is offered where
  the browser supports it, with the iOS route written out as the two steps Safari
  requires, since the browser gives a page no way to perform them.

  Submenus and settings are Mantine's own `Menu.Sub`, `Menu.RadioItem` and
  `Menu.CheckboxItem`, so a setting carries the `menuitemradio` /
  `menuitemcheckbox` role and the `aria-checked` a screen reader announces, and
  picking one leaves the menu open.

  Two fixes to the page card fall out of the same pass:
  - A page header under `host` chrome had no hairline under it. The band that
    draws it was only applied on the self-drawn card, so the divider every panel
    header has was missing from every page header in the shell. That branch was
    also silently dropping `extraBand`.
  - The theme gives every `Container` `px: 'xl'` as a default prop, which lands as
    an inline padding that beat `--console-body-gutter` — so the inline gutter was
    36px whatever the chrome said, and an end-edge panel spent 72px of its 450 on
    empty margin. `PageContainer` now states the gutter on the same prop the theme
    does, and an edge panel carries a panel gutter rather than a page one.

- 5dff3ef: Give every side surface a phone path, and the sheet a primary action.

  The runs pane, the three workspace navigators (features, virtual users, notes)
  and the email compose form were welded into the page card as a second column,
  which a phone has no room for. They now declare themselves through
  `PageOptionsPortal` and open from the foot bar instead, dismissing the sheet
  from their own select handler.

  `PageOptionsProvider` gained a primary-action slot: `usePageAction` registers a
  page's main verb — "New workflow run" — and the chrome pins it above the sheet
  body. Panels rendered outside the provider are unaffected, so a standalone
  render harness still works.

  New `ConsoleSidePanel` puts static content (a form, an inspector) on the end
  edge as its own floating card, the mirror of `ConsoleListPanel`;
  `ResizablePanelLayout` takes it as `sidePanel`.

- d884610: A metadata refresh no longer blanks the console. `AppLayout` gated its
  full-screen loader on `loading`, which a refresh raises just as the first load
  does, so the dock's Refresh tile threw the user back to a spinner and then to
  the page's initial state. It now gates on `initialLoading` — loading with
  nothing to show yet — and a refresh keeps the page it was on, with only the
  control that asked for it reading as busy.
- 7d67c88: A screen's list is now a card of its own on the content column's start edge,
  the mirror of the detail panel on the other edge, instead of a bordered column
  welded inside the page card — so choosing what the page shows and showing it
  are two surfaces, and the list can collapse to a rail without the page keeping
  its width. `EdgePanel` is the shared portal-and-reserve plumbing both edges are
  built from, `PanelInsetProvider` now tracks which edge each panel reserves, and
  `ConsoleListPanel` is the start-edge card. `PanelHeaderBand` also gained the
  hairline every other header row on screen already had.

## 0.12.57

### Patch Changes

- 255d636: feat(console): the shell — page card, end-edge panels, nav dock, phone layout

  The console shared its PAGES with the fabric console that embeds them, and none
  of the shell around those pages. Both drew a screen, opened a secondary surface
  and navigated, and did each of those three things differently. This brings the
  shell into the package as the one implementation, so an embedding app gets the
  same silhouette instead of forking one.
  - **The page card.** Every screen is one floating card on the canvas — header
    band at `--screen-header-height`, body below — merged with the existing
    `PageContainer`/`PanelCard`/`StatePage`/`PageHeader` so there is one card and
    not two. `ConsoleChromeContext` decides who paints it: `self` for the standalone
    console, `host` when an app draws the card and the screen sits flush inside it.
  - **The end-edge panel.** A secondary surface is a sibling card pinned to the
    content area's end edge, and the page card SHRINKS beside it — no scrim, no
    drawer, and never a bordered column inside the page card, which could not
    collapse and so never gave the main content the full width. `ConsolePanel`,
    `CollapsiblePanel`, `PanelHeaderBand`, `ContentArea`, `PanelInsetProvider`,
    and `ConsoleScreen` for the composition.
  - **The nav dock.** Navigation is a row of tiles floating in the card gutter at
    the foot of the window, replacing the 260px rail — so it reserves no layout
    and the page keeps the width the rail took. `NavDock` is presentational: it
    draws the `identity`/`pinned`/`contextual`/`utility` zones it is handed and
    the `isActive` predicate decides what a `match` token means, so an app models
    its own routes and gets the same row. `ConsoleNavDock` is this console's model,
    built from `useDefaultNavSections()`.
  - **The phone.** Below the phone breakpoint a second column cannot exist, so the
    dock — a pointer surface on the edge a thumb needs — gives way to a bottom tab
    bar, and every tab raises the same `MobileSheet`: nav as the rail in a sheet,
    a page's own options rail via `PageOptionsPortal`, search as the palette.

  `Sidebar` is still exported and is still the phone's nav sheet, which a row of
  hover-raised tiles cannot be. The shell's geometry tokens are a plain stylesheet
  (`@pikku/console/shell.css`, also pulled in by `@pikku/console/styles`) rather
  than a CSS module reached through `composes:` — an undefined custom property
  makes the whole `calc()` around it invalid, so their delivery cannot depend on
  which card happened to be composed first.

- Updated dependencies [255d636]
  - @pikku/mantine@0.12.9

## 0.12.56

### Patch Changes

- 1a92f6e: Export the knowledge surface from the package barrel.

  `KnowledgePage` was exported, but the workspace it renders, its bundle types and
  `resolveNoteLink` were not — so a host embedding the knowledge browser into its
  own shell could not mount the workspace, type the bundle it feeds in, or resolve
  a note link the same way the graph does. Resolving links differently is the
  subtle one: `inbound` and `dangling` are computed against this resolver, so a
  host with its own copy renders cross-links that have no backlink on the other
  side.

  Adds `KnowledgeWorkspace`, `KnowledgeWorkspaceProps`, `resolveNoteLink`, and the
  `KnowledgeBundle`, `KnowledgeFinding`, `KnowledgeNote`, `KnowledgeSection` and
  `KnowledgeSelection` types. No behaviour change.

- 3e139f4: Ship German, Arabic and Chinese alongside English.

  The console has been message-complete since the Paraglide migration but shipped one catalogue, so every consumer that mounts a console surface fell back to English regardless of the locale it had already resolved. `messages/{de,ar,zh}.json` cover all 964 keys, and `project.inlang/settings.json` lists the three codes — nothing else changes, because `supportedLocales`, the `/<lang>` URL prefix and `localeDir()`'s RTL set all derive from that list. Arabic was the one that needed checking rather than adding: `ar` was already in `RTL_LOCALES`, so `<html dir>` and Mantine's mirroring were waiting on a catalogue, not on code.

- 0ab1a88: feat(knowledge): draw a note's scenario and its decision, and say the vocabulary exists

  The console already drew ```mermaid fences as diagrams and `> [!NOTE]` blocks as
  callouts, and nothing told the librarian either existed — the skill that governs
  what goes in a note never mentioned them, so notes were written as prose and
  tables into a renderer that would happily have drawn the graph. The gap was the
  guidance, not the format.

  Two blocks join them. A slice's ```gherkin scenario is drawn rather than
  highlighted: the keywords line up in a column so the shape of the scenario is
  readable before a word of it is, and each quoted persona becomes a chip — which
  also makes a first-person scenario, the form the format rejects, visibly a block
  with no personas in it.

  A new ```decision fence states what a decision note owes: `chosen`, `rules-out`,
  `because`. The middle one is the half that gets dropped, so `pikku knowledge
validate` now warns when a fence says what was chosen and never says what it
  closes off. The fence is optional and a decision argued in prose is still a
  decision — validate checks the fences that exist rather than asking every note
  to be reformatted.

  `Markdown` is exported from `@pikku/console` so the fabric console can render the
  same notes through the same vocabulary instead of a second `<ReactMarkdown>`.

- b930dca: Remove the `secretBroker` escape hatch and scope addon secrets and credentials

  `secretBroker` let three named console functions receive the real `SecretService`,
  against the rule that a function never sees one. It is gone: the inspector allowlist,
  the `FunctionRuntimeMeta` flag, the runner branches, and the `WiredSecretBrokerServices`
  type. Console secret administration moved into the console addon, where a
  `SecretAdminService` holds the `SecretService` and the functions hold none.

  Addons are now scoped rather than trusted. The CLI emits each package's declared secret
  keys, and the host wraps the `SecretService` in a `ScopedSecretService` and the
  `CredentialService` in a new `ScopedCredentialService` before the addon's service factory
  runs — so an addon reads only what it declared, cannot write secrets, and cannot enumerate
  the app's users. `wireAddon({ globalSecrets, globalCredentials })` waives this, taking the
  reason as its value; only the consuming app can grant it, and the deploy manifest reports
  every grant under `unscopedSecretAddons` / `unscopedCredentialAddons`.

- Updated dependencies [063f43a]
- Updated dependencies [ce66bf8]
- Updated dependencies [d0307a8]
- Updated dependencies [ce66bf8]
- Updated dependencies [3ad2131]
- Updated dependencies [b930dca]
- Updated dependencies [b95e77d]
- Updated dependencies [fd9d834]
- Updated dependencies [8978fbd]
  - @pikku/core@0.12.82
  - @pikku/assistant-ui@0.12.10
  - @pikku/fetch@0.12.9

## 0.12.55

### Patch Changes

- e110c55: Emit `pikkuAIScorer` and `pikkuAIJudge` from the generated agent types so a
  project can declare scorers, and read a run's grades from the console.

  A tool that threw now reports its reason only on the step record's `error`; the
  result replayed to the model stays the generic `Error: Tool execution failed` it
  was before scorers needed the reason.

- e110c55: Show what the scorers declared and what they graded: a `/scorers` page listing
  every declared scorer with its lane, sampling rate and the agents that named it,
  and a Runs tab in the agent inspector listing the open conversation's runs with
  the grades each one earned.

  `console:getAgentThreadRuns` now answers under the same ownership as the thread
  itself — a caller without the admin scope sees only its own runs, filtered
  rather than refused, so the answer never confirms someone else's thread exists.

- Updated dependencies [e110c55]
- Updated dependencies [e110c55]
- Updated dependencies [e110c55]
- Updated dependencies [acc8077]
- Updated dependencies [905f737]
- Updated dependencies [3cc6428]
- Updated dependencies [c524adf]
- Updated dependencies [e110c55]
  - @pikku/core@0.12.81

## 0.12.54

### Patch Changes

- 4486b9a: `FunctionsPage` and `VirtualUserDocument` imported `useSearchParams` and `Link`
  straight from `react-router` instead of the console's own router shim. The
  console is router-agnostic — every other page goes through `../router`, which
  the host fills via an adapter — so in a host running anything else (TanStack
  Router, for one) those two components threw `useLocation() may be used only in
the context of a <Router>` and took the whole shell down with them, since the
  host's error boundary catches the render, not just the route.
- 4486b9a: `ShellHeader` dropped the title before the count when the text stack did not
  fit. The count slot carries a description on some pages, so a header with a
  52px page name and a 657px description would shed the name and keep the
  sentence, leaving the page anonymous. The text stack still collapses ahead of
  any control, but within it the title now outlives the count: full stack →
  title only → count only → neither.
- Updated dependencies [f5ce870]
  - @pikku/core@0.12.78

## 0.12.53

### Patch Changes

- 62ea4cc: The audit trail is now readable — in the generated meta, through an RPC, and as
  a page in the console.

  `audit: true` reaches `FunctionRuntimeMeta.audit` as its resolved form
  (`{ durability }`), so which functions record anything is answerable without
  running them. It is informational: the runner still resolves audit from the live
  function config, so meta and runtime cannot disagree.

  `AuditService` grows an optional read side — `query(AuditQuery)` and `facets()`.
  Optional because a sink can legitimately be write-only: a queue producer that
  hands events to another system has nothing to read back, and a reader that finds
  these absent should say the trail is not readable here rather than that it is
  empty. The two are very different answers to give someone auditing a system.

  `KyselyAuditService` implements both, newest first with offset paging, filtered
  by user, action and time window. Two things it now gets right that are easy to
  get wrong: an empty filter array means "match nothing" rather than "no filter",
  and results are read by physical _and_ camelCase key, because `CamelCasePlugin`
  is on most pikku Kysely instances and renames result keys on the way out — the
  mismatch does not throw, it returns a page of `undefined`. `init()` creates the
  `audit` table for projects that do not migrate it themselves, from a new
  exported `auditSchema` that stays out of `pikkuSchemas` because the runtime does
  not need it.

  The console addon exposes `console:getAudits` and `console:getAuditFilters`
  behind a new `pikku:audit:read` scope, and forwards the application's `audit`
  service into the addon's own services — without that last part every install
  reported the trail as unreadable, whatever sink it had configured.

  The console gets an Audit trail page: an infinite list filtered server-side by
  user and action, and a row that opens the whole event, metadata rendered as a
  JSON tree. Refused, unreadable and empty are three different screens, because
  "you may not read this", "nobody can read this" and "nothing happened" are three
  different facts.

  Events name the person who caused them. The trail records a user id — the only
  thing stable enough to record, since a name can change after the event — so
  `getAudits` resolves those ids against better-auth's user directory at read
  time, and the page shows the name while keeping the recorded id on the event.
  The filter follows: pick a colleague by name, filter by the id. A scenario
  actor is labelled as one, so synthetic traffic is not mistaken for real, and a
  caller who was signed out shows the wire identity pikku resolved for them
  rather than being credited to the system.

  **Breaking, for anyone already reading `AuditEvent`:** `actor` is now
  `userIdentity`, and its type `AuditActor` is `AuditUserIdentity`; `AuditQuery`
  takes `userIds`/`orgId` in place of `actorUserIds`/`actorOrgId`, and
  `AuditFacets` returns `userIds`. In pikku an _actor_ is a synthetic person a
  scenario drives, flagged on the user row — so naming the causer of an event
  `actor` made the synthetic case unsayable (`actor.actor === true`) and implied
  every recorded action was a test. The overwhelming majority are ordinary
  customers. The `audit` table follows: `actor_user_id` / `actor_org_id`
  are now `user_id` / `org_id`, and a `pikku_user_id` column joins them so the
  wire identity of a caller who never signed in survives the round trip — the
  sink was dropping it, which left the console's Session field permanently
  blank. A project that already migrated the table needs to rename the two
  columns and add the third; `KyselyAuditService.init()` creates the new shape
  for anyone who did not.

- 1065b80: A knowledge note now renders as a document rather than as a wall of markdown,
  and the things it names are links into the app.

  The console's markdown renderer gains the parts of markdown that carry structure
  rather than prose. ```mermaid fences are drawn as diagrams, lazily — mermaid is
  ~1MB of parser and layout engine, imported on the first fence that needs one, so
  a note without a diagram never pays for it. The diagram is themed from the
  console's own CSS variables read off the live element, which is what makes one
  diagram look native in both colour schemes and inside a host console that
  supplies its own values for the same tokens. Only diagrams of STRUCTURE are
  drawn — flowchart, sequence, state, ER, class, journey, timeline, mindmap,
  gitGraph. Mermaid also renders charts, and those deliberately degrade to their
  own source: a chart spends the reader's screen on a handful of numbers a sentence
  carries better, and puts the loudest typography on the page around the least
  important content. A fence that does not parse degrades the same way, with a line
  saying so — notes are written by agents and by people, and a diagram that fails
  silently is worse than one that shows its working.

  `> [!NOTE]`-style callouts (note, tip, important, warning, caution) render as
  callouts, fenced code is syntax-highlighted and copyable in one action, headings
  carry ids so a note can be linked to below its title, and both wide tables and
  wide diagrams keep their intrinsic size inside a focusable, labelled region that
  fades at whichever edge still has content behind it. Scrolling rather than
  scaling, because a fitted diagram keeps its aspect ratio by shrinking its type
  with it, and a flowchart in a narrow pane arrives as an unreadable strip.

  `resource:` URIs are now links. A note that says `func:createEntry` renders it as
  a chip that opens the function, and the same scheme works inline, so a sentence
  can name `[getReport](func:getReport)` and have the reader arrive at it. Standing
  alone the chip shows the whole URI — the kind is half of what it says; inline it
  shows the author's words and drops the box, because a boxed word every few words
  stops a sentence dead. The screens those links land on (functions, workflows,
  wires, jobs, scopes) now seed their search box from `?search=`, which is what
  turns a link into a landing.

  Two prefixes join the scheme in `@pikku/knowledge`: `scope:`, which resolves
  against the permission a function gates itself with and the roles that confer it,
  and `persona:`, against `definePersonas()`. Both are declarations the generated
  meta can check, which is the whole bar for a prefix — a reference nothing
  validates rots into fiction exactly where it looks most authoritative.

- Updated dependencies [62ea4cc]
- Updated dependencies [9dddff8]
- Updated dependencies [78b29f0]
  - @pikku/core@0.12.76

## 0.12.52

### Patch Changes

- fd72e58: Make personas a first-class surface rather than a detail of the test runner.

  A persona is now read in three places — the knowledge base resolves `persona:`
  URIs against it, scenarios cast it as an actor, and a virtual user runs as it —
  so it gets its own page at `/personas` under a new **People** section in the
  rail, alongside Users. The card is a profile: avatar, name, job title, computed
  address, the system roles they hold, and how many scenarios cast them. Opening
  one expands each role to the scopes it confers, which is the half of the picture
  that explains a 403.

  `definePersonas` takes an optional `avatarUrl` — any URL a browser can load.
  Nothing is derived from the address: a persona's address is synthetic, so a
  derived identicon would be the same shrug for everyone. Omitted, the console
  keeps drawing the deterministic colour-and-icon avatar from the persona's id.

- fd72e58: Read the actors that are not people on the personas page.

  The platform — the app acting on itself, what `pikkuPlatformScenarioStep`
  declares — now has a row of its own, alongside one per addon whose system a
  step makes act. They sit behind a People / System / All filter that opens on
  the people: a subject holds no roles and signs in as nobody, so leading with it
  would put the rows nothing is authorized through above the ones that are.

  The platform row is built in rather than derived. A project that has never
  written a platform step still has a platform, and a card that appeared the
  moment somebody declared their first step would read as a feature they had
  switched on.

  Also: PKU680 now counts `expectService`, `expectError` and `expectEventually`
  as assertions. They are inline steps and carry no phase, so a scenario whose
  only witness was a recorded service call was being told it never asserts.

- Updated dependencies [32277d5]
- Updated dependencies [ea8aabf]
- Updated dependencies [33e96ab]
- Updated dependencies [fd72e58]
- Updated dependencies [fd72e58]
- Updated dependencies [fd72e58]
- Updated dependencies [894b2f8]
- Updated dependencies [dd19aa7]
- Updated dependencies [50ec500]
  - @pikku/assistant-ui@0.12.9
  - @pikku/core@0.12.75

## 0.12.51

### Patch Changes

- 6362391: Let the addons page render the panel an addon now opens in.

  Addon detail used to be `AddonDetailDrawer`, an overlay that rendered itself
  wherever the page happened to put it, so the addons list correctly asked
  `ResizablePanelLayout` to skip its panel pane — the page had no panels.

  Moving addon detail into the panel system left that `hidePanel` behind. The
  pane was never rendered, so clicking a not-yet-installed addon called
  `openPanel` and nothing appeared: no detail, no install form, no way to add an
  addon to a project from the gallery.

  The pane is collapsed to zero width until something opens in it, so the
  gallery still gets the full surface when no addon is selected.

- a7b26c5: rename the inspected declarations to `define*`: `wireScope` → `defineScope`, `wireSecret` → `defineSecret`, `wireVariable` → `defineVariable`, `wireCredential` → `defineCredential`

  `wire*` meant two unrelated things. A transport wiring attaches a function to
  something that can invoke it — `wireHTTP`, `wireChannel`, `wireScheduler`,
  `wireQueueWorker` and the rest — and the thing it wires runs. These four wire
  nothing: they are no-ops that exist only so the call typechecks, they are
  tree-shaken out of the build, and their whole job is to be found by the
  inspector's AST pass and turned into a type union. One word for both left the
  declaration reading like a registration with a runtime.

  So the vocabulary splits: **`wire*` is a transport, `define*` is an inspected
  declaration.**

  ```ts
  import { defineScope } from '@pikku/core/scope'
  import { defineSecret } from '@pikku/core/secret'
  import { defineVariable } from '@pikku/core/variable'
  import { defineCredential } from '@pikku/core/credential'

  defineScope({ admin: { scopes: { invoices: { scopes: { create: {} } } } } })
  ```

  **Breaking:** no alias is kept. Rename the four call sites; the module subpaths
  (`@pikku/core/scope`, `/secret`, `/variable`) are unchanged.

  The inspector matches these by identifier text, so a stale `wire*` call is not a
  type error — it is silently not extracted, and the generated union comes back
  empty. That fails as "this scope isn't declared" on code that was fine a moment
  ago, nowhere near the declaration. Grep for the old names rather than trusting a
  clean build.

  An addon published with `.pikku` output generated before this release re-exports
  `wireSecret` from `@pikku/core/secret` and will not typecheck against this core
  until it is rebuilt and republished.

- 457cb25: Add `definePersonas()`: the people a project's scenarios and virtual users run
  as, declared in code.

  There used to be three names for two-and-a-bit things — an _actor_ in
  `scenarios.actors`, a _persona_ in `scenarios.personas`, and a _virtual user_
  declared separately against an actor. In practice almost every actor was its own
  kind, so the second set carried no information and the third was a third place
  for a name to drift. There is now one declaration:

  ```ts
  definePersonas({
    shopper: {
      name: 'Sam Shopper',
      jobTitle: 'Shopper',
      personality: 'Buys in a hurry and leaves tabs open',
      roles: ['customer'],
      disposition: 'careless',
      goals: ['Buy something without reading anything'],
      account: {},
    },
  })
  ```

  A persona is a person: what they are like, what they want, the roles they hold,
  and **one** account they sign in with — `account: {}` plus `linkedAccounts` for
  the rare case of more, modelled on how better-auth does linking. A persona with a
  `disposition` is a virtual user; `runnable: false` marks someone who only ever
  exists to be acted upon — banned, shared with, reset — and is never handed a
  session.

  **A persona names roles, never scopes.** Scopes come from `defineSystemRole()`
  expansion, so the build fails if a persona names a role nobody declared, and
  fails again if a role confers a scope no `defineScope` declares. Running one only
  ever has to check that its roles are still valid.

  **Addresses are computed, never declared.** `personaEmail(id, domain, runId)`
  derives `<id>[+runId]@<domain>` from `scenarios.emailDomain`, so a seed, a
  scenario run and a virtual-user run cannot disagree about who they are signing in
  as. `scenarios.actors` and `scenarios.personas` are gone from
  `pikku.config.json` — only `emailDomain` remains.

  `actor` survives in exactly one place: the name of a **slot in a scenario step**,
  which is the role a persona is cast in for that step. `pikkuVirtualUser()`,
  `kind`, `grants` and the `actor` field are removed; the `actors` service is now
  `personas`, and the CLI's `virtual-user` commands are now `pikku persona list` /
  `pikku persona run`. `budget` and `allowApprovalRequired` moved to run flags —
  how much you will spend today is not a fact about a person.

  `@pikku/cucumber` drops its `Actor` class and `ActorDispatchContext`: a
  hand-rolled cookie jar that a persona's own typed session replaces outright.

- 457cb25: Let a persona do a real job in production, and say where it may act.

  A persona was only ever a test subject: something you pointed at a stage to find
  out what the product does wrong. But the same declaration — a name, a job, the
  roles it holds and what it is trying to get done — describes a teammate doing
  the work for real, and nothing about the engine cared which one it was.

  Four changes make that difference explicit and enforced.

  **`environments` moves to the top level of `pikku.config.json`**, out from under
  `scenarios`. It was never a scenario's anything: `persona run` targets one, and
  now so does `persona sync`. An environment may be flagged `production: true` —
  a flag rather than a reserved name, because projects call it `prod`, `live` or
  `eu-prod`, and more than one environment can be production.

  **A persona may name its `environments`.** Omitting them means every configured
  environment _except_ the production ones, so nothing reaches production by being
  forgotten. Naming a production environment requires `disposition: 'accountable'`.
  The rule is checked twice, on purpose: the inspector refuses to generate a
  declaration that breaks it, and sign-in re-checks against the environment
  actually resolved — the build check trusts the file, and the run check does not
  trust which artifact got deployed. An unresolved environment fails closed.

  **`disposition: 'accountable'`** is that production disposition. It sits opposite
  `adversarial` on the intent axis rather than the care axis: what it changes stays
  changed, every call is recorded against its name, and it stops to ask rather than
  acting and reporting afterwards. Alongside it, **agents now appear in a persona's
  computed catalogue**, gated by the same scopes as the RPCs — an agent is reached
  rather than declared, so a persona finds the specialists its roles unlock and
  chooses between calling the API itself and handing the work over. That also fixes
  a latent gap: `talkTo` was wired at the target but never advertised in the
  instructions, so it was never used.

  **`pikku persona sync <environment>`** provisions them: it creates each account
  and applies the roles it declares, additively, and never revokes. Seeding is test
  data and `db seed` does not run in production; a teammate doing a real job still
  needs an account and its grants. It needs both halves of an environment — its API
  to sign the person in, its database to write the grants — and `--dry-run` reports
  who would be provisioned, with what, and why anyone was skipped.

  In the console, a virtual user now says where it may act — the environments it
  named, or the rule when it named none — and its dossier carries the `sync`
  command alongside the `run` one, because the account is not a by-product of a
  run. `accountable` reads as a disposition like the rest.

- 0e0f6eb: Add virtual users: LLM-driven synthetic users that work a real stage in
  character.

  A scenario proves a path somebody thought of. A virtual user works the same
  ground without the script — it signs in as a declared persona over the app's own
  auth, is handed the scenarios' BDD prose and the schema of every endpoint it may
  reach, and decides for itself what to do. It asserts nothing; a run produces
  findings, and their absence only ever means "not this time, not with this seed".

  There is nothing extra to declare. A persona with a `disposition` is a virtual
  user, and running it is what makes it one — see the `definePersonas` changeset
  for the declaration itself. Listing, describing or running one never loads the
  app: the inspector reads the literal declaration, the CLI writes
  `scopes/pikku-personas-meta.gen.json`, and `MetaService.getPersonasMeta()`
  serves it.

  **Dispositions are engine dials, not prose.** Each carries its own intent weights
  (continue / suspend / resume / abandon), temperature, re-read and repeat rates,
  and switches: `careless` puts things down and picks them up in the wrong order,
  `newcomer` starts with no memory, `auditor` is never offered a mutation,
  `adversarial` is shown the catalogue its roles do not cover — being offered a
  call it should not be able to make is the test — while those roles stay live as
  the oracle, so a success outside them is authorization drift rather than a pass.

  **Nothing is retrieved against.** The whole reachable catalogue goes into the
  instructions (~8k tokens on a 430-RPC project, cached for the run), because a
  ranking function would make the user only as adventurous as the ranking and lose
  exactly the endpoints worth stumbling into. Schema first: an endpoint must be
  described before it may be called.

  **No money in core.** The engine counts steps, calls, mutations and tokens; what
  they cost is the app's to decide through `stop(tally)`.

  CLI: `pikku persona list` and `pikku persona run <environment> [name]`, with
  flags overriding a declaration for reproduction (`--seed`, `--steps`,
  `--disposition`). Spending is a run flag too — `--steps`, `--mutations` and
  `--duration` bound a run, because how much you will spend today is not a fact
  about a person. Console: a Virtual Users screen beside Scenarios, built out of
  core's own derivation functions so it shows a run's actual inputs rather than a
  second implementation of them.

  `dev-ai-runner` now ships its own `@pikku/ai-vercel` and
  `@ai-sdk/openai-compatible` instead of requiring them from the project. Behind a
  proxy one openai-compatible provider answers for every prefix, so there was never
  a per-vendor package worth making somebody install; the project's copies still
  win when it has them, and both load from the same place or neither does.

- Updated dependencies [c984df6]
- Updated dependencies [63ff32b]
- Updated dependencies [ba6cc08]
- Updated dependencies [d007191]
- Updated dependencies [a7b26c5]
- Updated dependencies [457cb25]
- Updated dependencies [f7567ad]
- Updated dependencies [ba6cc08]
- Updated dependencies [a2e21e5]
- Updated dependencies [457cb25]
- Updated dependencies [86a50b9]
- Updated dependencies [0e0f6eb]
  - @pikku/core@0.12.73

## 0.12.50

### Patch Changes

- aa5f623: Open an addon or API in the panel instead of a drawer.

  Picking a package from the catalogue slid a 620px right-hand `Drawer` over the
  screen — across an embedding host's own end-edge panel, and across the very
  catalogue it was describing.

  It is now a panel type: `openPanel('addon', id, title, { addon, kind, editable,
onInstalled })` from `usePanelContext`, rendered by `PanelContainer` as the new
  exported `AddonDetail`. `AddonDetailDrawer` is gone.

  `AddonDetail` is self-sufficient rather than prop-driven, because a panel's
  content is built from the metadata captured when it opened and that metadata is
  never refreshed. It owns the install mutation (`console:installAddon`, or
  `console:installOpenapiAddon` for `kind: 'api'`) and re-reads the shared
  `['installed-addons']` query, so installing from the panel updates both the
  panel's CTA and the catalogue behind it from one invalidation. The now-dead
  `installingName` / `actionError` / `onInstall` / `installedNamespaces` plumbing
  is dropped from `CommunityGallery`, `AddonsList` and `ApisList`.

  `editable` is passed in rather than read from `useConsoleEditable()`: panel
  content renders outside the page's provider tree, where that context would
  silently fall back to its `true` default and offer Install on a read-only
  deployed stage.

- aa5f623: Let a host render the canvas add-step surface as its own panel.

  `WorkflowCanvasDrawer` is an overlay pinned to the viewport, which is right when
  the console owns the window and wrong when it is one card inside a host's page:
  there it floated over the host's own chrome and ignored the end-edge panel the
  host already has.

  Under `HostConsoleChrome` it now renders nothing itself and mirrors the canvas
  state into the panel context as `openPanel('workflowCanvas', …)`, so the host
  draws it wherever it puts panels; closing that panel clears the canvas state, so
  the affordance that opened it still works on the next click. Standalone is
  unchanged — same overlay, same content.

  The content moves safely because it is a pure catalogue: local view state and
  app-level RPC metadata only, nothing provided inside the page it is leaving.

- 9bcb570: Give the screen body one gutter, set by the chrome rather than by each layout.

  Embedded in a host, `ResizablePanelLayout` zeroed its body padding on the
  assumption that the host's page card supplied the gutter. A host card cannot: it
  is a bare card, and padding it would inset the full-bleed header band at its top.
  So every screen using that layout ran flush to the card's edge — the emails
  screen most visibly.

  The layouts were also disagreeing among themselves, one padding `xl`, another
  `md`, so whether content touched the edge depended on which layout a screen
  happened to use.

  There is now a single `--console-body-gutter`, declared once per chrome mode
  (`:root` for standalone, `.chromeHost` applied by `HostConsoleChrome` for
  embedded) and read by `ResizablePanelLayout`, `ThreePaneLayout` and
  `PageContainer`. Same host/self question `useListSurfaceClass` already answers
  for the border, answered in the same place. Embedded is the tighter value: the
  host's card is already inset from the app edge.

## 0.12.49

### Patch Changes

- b3a6498: Expose which agent the playground is pointed at.

  `AgentPlaygroundPage` resolved the agent from the URL against the project meta
  inline, so a host composing the playground panels itself — putting the
  conversations rail in a panel of its own rather than in `AgentThreePane`'s
  column — had to repeat that resolution to know what to pass
  `AgentPlaygroundSurface`.

  `useAgentPlaygroundState()` is that answer, and the page now uses it too.

- e8841de: Let a host mount the emails compose form and the knowledge note rail as their own panels.

  Both screens welded a secondary surface into the page as a bordered column: the
  emails variables form beside the preview, and the knowledge note list as the
  layout's own drawer. A host embedding either got a card inside its own card, and
  neither column could collapse or become a sheet on a phone.

  `useEmailsCompose()` now owns the selected template and locale, the typed
  variables and the preview they render; hand it to `EmailsComposePanel` to put
  the form anywhere and to `EmailsPage` via the new `compose` prop so the preview
  takes the full width. `useKnowledgeBrowse()` does the same for the note search
  and selection, with `KnowledgeBrowseRail` and `KnowledgePage`'s new `browse`
  prop — and `KnowledgePage` is now exported, which it was not before.

  This is the shape `usePackagesBrowse` and `useScenariosBrowse` already give the
  packages and scenarios screens. Standalone, nothing changes: with no state
  passed in, each page mounts its own and renders the surface exactly where it was.

- 3710502: Open a persona in the panel instead of a drawer.

  Clicking a persona — from a feature's cast or the personas list — slid a
  right-hand `Drawer` over the screen. That ignored wherever the surrounding app
  actually puts detail surfaces, so an embedding host got a drawer across its own
  end-edge panel, and the console got a second overlay competing with the pane it
  already has.

  Personas are now a panel type like every other detail: `openPersona(key, title,
{ persona, onOpenScenario })` from `usePanelContext`, rendered by
  `PanelContainer` as the new exported `PersonaDetail`. `PersonaDrawer` is gone —
  it had no callers outside the two this replaces.

- abb7538: Let a host mount the scenarios feature rail as its own panel.

  The feature list was rendered as the scenarios layout's own drawer, and the
  search, tag filter and picked feature that drive it lived inside
  `ScenariosWorkspace` — so a host embedding `ScenariosPage` could not give the
  rail the side-panel treatment its other screens use.

  `useScenariosBrowse()` now owns that state and the filtered feature list. Hand it
  to `ScenariosBrowseRail` to put the rail anywhere, and to `ScenariosPage` via the
  new `browse` prop so the page drops its own drawer. This is the same shape
  `usePackagesBrowse` / `PackagesBrowseRail` already gives the packages screen.

  Standalone, nothing changes: with no `browse` the page mounts the state itself
  and renders the rail exactly where it was.

- cab5549: Stop the three-pane layout drawing a details pane the host already draws.

  `ThreePaneLayout` renders its own `PanelContainer` in a right-hand column, fed
  by the same panel context a host reads. A host that owns the chrome mounts that
  container itself — as an end-edge panel, or a sheet on a phone — so opening a
  panel showed its body twice at once, once in the column and once in the host's
  panel.

  The column now follows `ConsoleChromeContext` the way `ResizablePanelLayout`
  already does: with `chrome="host"` it and its collapse rail are not rendered,
  and the panel opens only where the host put it. Standalone, nothing changes.

## 0.12.48

### Patch Changes

- 4c702ed: Let an embedding host own the console's card and detail panel.

  `HostConsoleChrome` marks a console screen as living inside a host that already
  puts every page in its own card and has its own end-edge panel (Fabric). Under
  it, a screen's outermost list surface renders flush instead of painting a second
  card inside the host's one, `ResizablePanelLayout` drops the page padding the
  host already supplies, and it stops docking the detail panel as a column — the
  host mounts `PanelProvider` and renders `PanelContainer` beside the page, so the
  panel opens on the end edge like every other panel in the host.

  Nothing changes for the standalone console, which stays on the default `self`
  chrome.

- b89d3b3: Bring the knowledge base into OSS: a package, a CLI gate, a console browser and a skill

  `knowledge/` is where a project records the things `pikku meta` cannot tell you —
  what a slice is for, which rule was chosen and what it rules out, what is still an
  open question. Tables, routes, schemas and permissions are generated, so a note
  that repeats them is a copy that will drift, and the profile refuses the sections
  where that happens.
  - **`@pikku/knowledge`** (new) reads the notes, builds the link graph in both
    directions, and validates the app-project profile: every note typed, every
    section indexed, every slice carrying a third-person gherkin scenario and at
    most three entities, and every `resource:` URI resolving against the generated
    meta. The resource check fails closed on drift and open on ignorance — a prefix
    whose meta is absent is skipped rather than called dangling.
  - **`pikku knowledge validate`** and **`pikku knowledge index`** replace the dead
    three-flat-files check. Both exit non-zero on an inconsistent base, so a
    pipeline can stop on one; `index` refreshes each `index.md` listing while
    leaving the prose around it alone, and now gives a section that holds only
    sub-sections an index of its own instead of leaving it unreachable.
  - **The console** gains a read-only Knowledge page: notes grouped by section,
    a rendered document with its tags, resources, links in both directions and the
    findings against it, and intra-bundle markdown links that open the linked note
    instead of leaving the page. Read-only by design — a note is edited in the repo,
    in the same commit as the code it describes.
  - **The `pikku-knowledge` skill** documents the format for agents, and Fabric
    builds on it rather than restating it.
  - **`@pikku/inspector`**: a zod schema imported from a built workspace package
    resolved to that package's `.d.ts`, which has no runtime exports at all, so
    every schema in it was reported missing. The emitted JS beside it is imported
    instead.

- Updated dependencies [384e484]
- Updated dependencies [b5a73fb]
- Updated dependencies [6be5ab0]
  - @pikku/core@0.12.72

## 0.12.47

### Patch Changes

- 4c59a92: `db/pikku-db-schema.gen.json` now records who declared each table. Every entry carries a `source` — `app`, `better-auth`, `pikku-runtime`, or an addon's package name — and framework-declared tables also carry the `origin` prose from their migration header.

  The console's Database view filters on that instead of guessing from a table-name prefix. The old guess (`workflow_`, `ai_`, `pikku_`) missed Better Auth's `user`, `session`, `account` and `verification`, the secrets, credentials, channel and webhook-delivery tables, and every addon's, all of which rendered as if the project owned them. A schema JSON generated before this change still falls back to the prefix guess, so an un-regenerated project sees no behaviour change.

  Provenance is read back out of the generated migrations at codegen time — each one already names its source in its filename and its origin in its header — so `db migrate` needs no new inputs and does not have to load the project's Better Auth config.

- 637e668: State every package's license in the package itself.

  Eight publishable packages had no `license` field, `@pikku/aws-services` said `UNLICENSED` by accident, and no package carried a LICENSE file at all — the grant lived only in the repo root, which npm tarballs never include. Every publishable package now declares its license and ships the matching LICENSE file, and `yarn check:licenses` fails the release if the two ever disagree.

  `@pikku/console` is now explicitly BUSL-1.1 and named in the root LICENSE's Licensed Work alongside `@pikku/cli` and `@pikku/inspector`; the Additional Use Grant still permits production use for any purpose, including in free and open source software. Everything else — runtimes, services, clients, deploy adapters and the agent skills — is MIT, as the root LICENSE already said.

- 8902b4d: Let a host mount the packages browse rail as its own surface

  The addon/API gallery's category rail was welded into `CommunityGallery`, so a
  host embedding `PackagesPage` had no way to give it the side-panel treatment its
  other screens use. `usePackagesBrowse()` now holds the tab, the picked category
  and the active catalogue's buckets; hand that state to `PackagesBrowseRail` to
  render the rail wherever the host wants it, and to `PackagesPage` /
  `PackagesListPanel` (new `browse` prop) so the gallery drops its inline copy and
  takes the full width. Omit it and every page renders exactly as before.

- a261006: **Breaking:** removed dynamic workflows — runtime-defined workflow graphs stored in the database and resolved by name instead of by codegen.

  The feature was already half-gone. Its authoring surface (`createAgentWorkflow`, `saveAgentWorkflow`, `listAgentWorkflows`, `executeAgentWorkflow`, and the AI-agent instruction builder) was deleted in April 2026 along with its entire e2e suite, and nothing has written a dynamic workflow since. What remained could not execute one either: `executeAgentWorkflow` gated on `pikkuState('workflows', 'meta')`, which only codegen ever populates, so a graph that existed solely in the database was never findable. The two backend families had also drifted onto different `source` sentinels (`'ai-agent'` vs `'dynamic-workflow'`), and the two Redis implementations disagreed on key escaping — so at least one of them matched nothing. Rather than keep shipping plumbing for a path no caller could complete, it is removed until it can be reintroduced deliberately.

  Removed:
  - `getAIGeneratedWorkflows` from `WorkflowService` and `WorkflowRunService`, and from every backend (in-memory, Redis, MongoDB, Kysely, and the Cloudflare Durable Object service and client — the last two were already a `return []` stub and a rejection).
  - The database-lookup fallbacks in `startWorkflow` and `runWorkflowJob` that resolved a workflow name against stored graphs when static meta had no match.
  - `'dynamic-workflow'` from the `WorkflowRuntimeMeta['source']` union.
  - `validateWorkflowWiring` and `computeEntryNodeIds` from `@pikku/core/workflow`. These validated AI-authored graphs and had no callers in core; the inspector keeps its own private entry-node computation for static graph wiring, which is unaffected.
  - The `workflow-created` AI stream event and its AG-UI `pikku:workflow-created` custom event. Its only emitter went with the April deletion, so it could never fire.
  - The console's `console:getAIWorkflows` RPC, the `useAIWorkflows` hook, the "Dynamic" workflow filter and badge, and the trigger-schema scraper that derived an input form from a stored graph's `$ref` bindings.

  Kept, because static graph workflows depend on them and this is not a change to versioning:
  - `upsertWorkflowVersion`, `getWorkflowVersion`, `updateWorkflowVersionStatus`, and the `workflowVersions` storage in every backend. These back version-mismatch replay: when a deployed graph's hash changes, in-flight runs continue against the exact graph they started on. No schema migration is needed — the table, its columns, and its `(workflowName, graphHash)` upsert key are unchanged.
  - `generateMermaidDiagram`, which renders any workflow graph and is not specific to dynamic ones.

  Static `pikkuWorkflowGraph` and DSL workflows are entirely unaffected: they resolve from codegen'd meta, which was always the only path that worked.

  To revive this post-MVP, the deleted authoring code is recoverable in full — its prompt engineering (a compact tool table upfront, full schemas with flattened dotted output paths returned only after a validation failure) is worth reading before rewriting:

  ```
  git show f52f3308b^:packages/core/src/wirings/ai-agent/agent-dynamic-workflow.ts
  git show f52f3308b^:packages/core/src/wirings/workflow/graph/graph-validation.ts
  git show f52f3308b --stat   # the April removal, incl. the three e2e feature files
  ```

  Note that reviving it needs more than restoring those files: the queued-step path (`executeWorkflowStep`), `onError` compensation, and sub-workflow resolution all read static meta only and would need a fallback for a graph that exists solely in the database.

- Updated dependencies [8a2c993]
- Updated dependencies [a261006]
- Updated dependencies [09973b9]
  - @pikku/core@0.12.71

## 0.12.46

### Patch Changes

- 47876f8: Give the addon install drawer test ids: the instance-name field, the add-to-project button and the inline install error. The error alert in particular had no handle, so asserting that a name conflict surfaces cleanly rather than as a raw 500 meant matching on rendered copy.
- 2484739: Refresh an addon requirement's secret status after setting it from the Setup
  tab. The card asked whether the secret existed under its own query key, which
  nothing ever invalidated, so a secret you had just saved went on reading "Not
  set" until the page was reloaded. It now shares the one `secret-value` query
  that `useSetSecret` already invalidates.

  The requirement cards, their connect/set actions and the instance selector also
  carry test ids and their status as data attributes, so a test can assert that a
  requirement is satisfied without reading the console's translated copy back to
  it.

- 97d342e: Make the auth providers page and the console gate addressable from a test without reading translated copy back. Each provider row carries `data-provider`, and its status is a single `auth-provider-status` element carrying `data-configured` — so "not configured" is an asserted state rather than a missing badge, which an unrendered row would also satisfy. The not-authorized screen and the credential connections surface carry test ids, and the page header's view switch tags each option with its value.

  The badge and plugin labels move from `asI18n` string literals onto `messages/en.json` keys, so they translate with the rest of the console.

- 67a6995: Give the addons gallery stable test hooks: `data-testid="addon-card"` with `data-addon-package` and `data-addon-installed` on each card, and `data-testid="packages-search"` on the search field.

  Selecting a card previously meant reaching for an unexported Mantine card class, and selecting the filters meant matching the translated copy those controls render — so a copy change or a Mantine bump silently broke the browser tests. The names carry the addon's package and installed state, which is what the assertions actually want.

- fbee186: Make the sidebar, the run form and the impersonation surface addressable from a test without reading translated copy back.

  Nav sections gain an optional stable `id`, and the accordion now tracks which section is open by that id rather than by the section's rendered title — so the open section survives a locale change. Sections and nav links carry `nav-section`/`nav-link` with the key declared in code (the section id, the link's route), which replaces selecting a section by an `aria-expanded` heuristic and a link by its label.

  The schema form and its submit button, the runs panel's new-run button, the impersonation banner and its stop button, the impersonate drawer's search and rows, and the sidebar's impersonate button all carry test ids. None of them carries a user's email: an email is personal data, and putting it in a `data-` attribute publishes it to anything reading the DOM for the sake of a selector — rows are matched on the email they already render.

  The workflow runs panel's empty and new-run labels move from `asI18n` string literals onto `messages/en.json` keys, so they translate with the rest of the console, and the impersonate drawer's row moves into its own file.

- 5546eb0: Add stable `data-testid` hooks to the agent playground.

  Approval cards, credential cards, tool calls and the composer now expose
  testids plus state attributes (`data-approval-state`, `data-credential-state`,
  `data-tool-status`, `data-tool-name`, `data-credential-name`), so browser tests
  select on structure rather than on rendered English copy — which goes through
  the `m` i18n namespace and is not a stable selector. Purely additive: no copy,
  markup or behaviour changes.

- 2b71273: Give each avatar in a scenario card's cast a `data-testid="flow-cast-member"` and a `data-persona-key`, so a test can assert who a scenario is cast with. The cast renders as avatars with no accessible name, which previously left the casting unassertable without matching on how an avatar happens to look.
- c462f8b: Hovering a scenario step now highlights the thing it will act on — the actor, or the step's sentence — rather than the whole row. The row holds two destinations (the actor opens their persona, everything else opens the step), so a row-wide highlight promised one action for both.
- a436645: Redesign the console's scenarios screen as living documentation of a project's BDD features.

  The inspector now statically extracts `pikkuFeature` declarations — name, description, tags, the scenarios each one groups (including `{ scenario, data }` examples), and whether it declares `before`/`after` — and the CLI writes them to `<outDir>/scenarios/features.gen.json`, which `MetaService.getFeaturesMeta()` reads and the console addon returns from `getAllMeta`.

  The scenarios page reads that back as a document: features on the left, and on the right the selected feature's scenarios, each rendered as the given/when/then ladder of prose its author actually wrote, with repeats shown as `for each x in xs`, `Examples:` tables for parameterised entries, skip reasons stated rather than hidden, and each scenario's cast of personas inline. The Flows/Personas segmented control is gone; tags filter the document the same way `pikku scenario run --tags` filters a run.

- 47478a4: Let a scenario declare why it is held out of a default run.

  `pikkuScenario({ skip: 'why' })` keeps the scenario in the plan and reports it as `SKIP <name> (<reason>)` on the ladder, instead of the alternatives available until now: deleting it, commenting it out, or leaving it red. Naming it directly with `--flows` clears the quarantine and runs it; selecting the feature it belongs to does not, because a feature is a group and running the group should not silently drag a quarantined member in.

  The run report's `skipped` list now carries a reason per scenario rather than assuming `--no-browser`, so a browser scenario held back on a machine with no browser reads differently from one the project quarantined itself.

  `@pikku/console` gains a test id on the addon detail page's Setup tab, which was previously only reachable through its translated label.

- 2f88989: Make the scopes page addressable from a test without selecting on translated copy: the roles table, the scopes vocabulary table, the role editor drawer, the scope checkboxes, the create-role action, the forbidden and load-error states, the user roles drawer and the header search all carry test ids, with `data-role-name` / `data-scope-id` identifying a row. The role editor and user roles drawers carry their test id on the drawer body rather than the drawer root, so it is present only while the drawer is open.
- b733b59: Make the users directory addressable from a test without putting PII in the DOM: `TableListPage` accepts a `getRowProps` callback, and the users table uses it to tag each row with its user id. The status badge, the per-user actions menu, its items, the confirmation button and the set-password field carry test ids, so a caller reads ban state from `data-banned` rather than from the translated badge copy.
- a022e3e: Report each workflow canvas node's run status as `data-node-status` alongside its step name, and tag run history rows with `data-run-id` / `data-run-status`. The status was previously only expressible as a background colour, so the only way to check that a run painted correctly was to read the computed rgb and classify the channels — which asserts the palette rather than the run. The timeline's step buttons and its follow-live control carry test ids for the same reason.
- Updated dependencies [539ee0b]
- Updated dependencies [a1a6816]
- Updated dependencies [dc3e11e]
- Updated dependencies [24da616]
- Updated dependencies [04bfe3f]
- Updated dependencies [5962e51]
- Updated dependencies [5962e51]
- Updated dependencies [cd6453c]
- Updated dependencies [a436645]
- Updated dependencies [46cf63e]
- Updated dependencies [9e666bc]
- Updated dependencies [1c841d8]
- Updated dependencies [47478a4]
- Updated dependencies [9e666bc]
- Updated dependencies [5962e51]
- Updated dependencies [5962e51]
- Updated dependencies [61b9bf8]
  - @pikku/core@0.12.70

## 0.12.45

### Patch Changes

- ea74ba4: Export the console as panels, not just screens.

  Every page that mounted its own `PanelProvider` had to keep its table in a private
  inner component so `usePanelContext` had a provider above it. Those tables are now
  standalone panels a host can mount and arrange itself:
  - `ConsoleSurface` mounts the panel context (deferring to a host's own, unless
    `isolate` is passed), and `ConsoleInspectorPanel` renders the detail pane for
    whatever is selected — entity-agnostic, so one inspector pairs with any list.
  - `TabbedSurface` for the pages that are a tab strip over several panels.
  - List panels for HTTP, MCP, queues, schedulers, triggers, middleware, permissions,
    services, webhooks, auth providers, variables, secrets, functions, packages, users,
    agents, email templates, scenario flows and personas, plus the security report and
    audit log.
  - The agent playground as `AgentPlaygroundSurface` with its conversations, chat and
    selector panels.
  - The data hooks behind each panel (`useHttpItems`, `useQueueItems`, `useAgentItems`,
    `useAdminUsers`, …) and their item types.

  Purely additive: every page keeps its existing prop surface and renders identically.

- ea74ba4: Export the workflow surface as composable panels rather than a single screen.

  `WorkflowSurface` mounts every workflow-scoped context (panels, run state, graph,
  canvas drawer) and the panels below read from it, so a host can arrange them in
  any order, anywhere in its own tree:

  ```tsx
  <WorkflowSurface workflowId={id}>
    <WorkflowRunsPanel />
    <WorkflowGraphPanel />
    <WorkflowInspectorPanel />
  </WorkflowSurface>
  ```

  New exports: `WorkflowSurface`, `useWorkflowSurface`, `useWorkflowSurfaceSafe`,
  `WorkflowRunsPanel`, `WorkflowGraphPanel`, `WorkflowInspectorPanel`,
  `WorkflowCanvasDrawer`, `WorkflowListPanel`, `WorkflowThreePane`.

  Also exports the workflow-run query keys and an invalidation hook —
  `workflowQueryKeys`, `useWorkflowRunRefresh`, plus the `isRunActive` /
  `isStepActive` / `hasActiveStep` status predicates — so an embedder that shares
  this package's QueryClient can refresh the panels through a supported API
  instead of hardcoding key tuples.

  Purely additive: `WorkflowsPage` keeps its existing props and renders the same
  UI, now composed from these panels.

## 0.12.44

### Patch Changes

- d80a864: Let a read-only console browse the addon catalogue

  A read-only console (`editable={false}`, e.g. a deployed stage) locked the addons
  view to the `installed` filter and hid the filter control entirely, so the tab
  rendered an empty gallery with no way to reach the catalogue. Read-only means you
  cannot _install_ — the catalogue is still worth browsing. The filter now applies
  as chosen and its control always renders; install actions stay gated on
  `editable` in the detail drawer, as before.

## 0.12.43

### Patch Changes

- 118646d: Page the addon and API catalogues instead of loading them whole.

  The APIs tab fetched a fixed first 100 entries out of ~2,500 and never fetched
  more, so most of the catalogue was unreachable and its search box only ever
  searched those 100. Both galleries now use infinite queries, pulling the next
  page as the grid scrolls.

  Because a paged list can only be filtered honestly by the server, search,
  category, sort and the All/Official/Installed filter all moved to the registry,
  and the category rail's counts now come from a catalogue-wide facet call rather
  than being derived from the loaded rows.

  **Breaking (`@pikku/addon-console`):** `getAddonMeta` took no input and returned
  `AddonMeta[]`. It now takes `{ cursor?, limit?, search?, category?, sort?,
official?, names? }` and returns `{ packages, total, nextCursor }`. Callers that
  want the whole catalogue should walk `nextCursor` — the `useAddonMeta` hook in
  `@pikku/console` does this and still returns a flat array.

  Adds `getAddonCategories` and `getOpenapiCategories`, and `category` to
  `getOpenapis`.

- Updated dependencies [f11675f]
  - @pikku/core@0.12.68

## 0.12.42

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
  - @pikku/core@0.12.67

## 0.12.41

### Patch Changes

- 16db9cc: Soften and tighten the dev console chrome.
  - Borders give way to flat fills: every `*-border` theme token (dark + light) and
    the Badge border go transparent, so the pervasive hairline rules disappear
    without restructuring any layout. The hardcoded borders the token sweep
    couldn't reach are neutralised too — the coloured tag borders in
    Schedulers/Triggers/Channel tabs, the run-selector outline, and the database
    result-table rules. Functional/diagram borders stay (flow-node rings, the
    active tab underline, the overlapping-avatar separators).
  - `ShellHeader` grows from 45px to 50px and loses its bottom rule.
  - The agents and workflow playgrounds can collapse their list and detail panes.
    Each pane's collapse control lives on the pane's own outer edge, inside a row
    it already has, so nothing gains a header row just to hold an icon; a collapsed
    pane leaves a labelled rail rather than an unexplained void.
  - The sidebar shows one section at a time, anchored to the current route: the
    section owning the page is the expanded one and carries the accent, so the rail
    answers "where am I" without the user keeping it tidy.
  - 80+ `en.json` entries shipped with their key path as the value ("Empty title",
    "State how it works", "Header separator" between breadcrumbs). They now have
    real copy.

- 0273e51: Require Mantine 9; drop the Mantine 8 peer range.

  `@pikku/mantine` re-exports `@mantine/core` wholesale (`export * from
'@mantine/core'`), so its `^8 || ^9` peer range was never really satisfiable in
  both directions: the set of exported names differs between the majors, and any
  consumer symbol that exists in only one of them resolves for one peer and fails
  for the other. `@pikku/console` sat on the v8 side of that split — it imported
  `TypographyStylesProvider`, which v9 renamed to `Typography` — so installing it
  alongside Mantine 9 failed at bundle time with two missing exports:

                                          "TypographyStylesProvider" is not exported by @pikku/mantine/core
                                          "createOptionalContext" is not exported by @mantine/core   (via @mantine/code-highlight@8)

  The second came from `@mantine/code-highlight`, which `@pikku/console` pinned
  to `^8.3.18` while the host resolved core to 9 — a v8 satellite calling a core
  helper that v9 removed. Pinning every `@mantine/*` dependency to the same major
  is what makes that class of error impossible, so all eight move together.

  Consumers on Mantine 8 must upgrade to 9 alongside this release. The migration
  in this repo was small: `TypographyStylesProvider` → `Typography` (2 files) and
  `<Collapse in>` → `<Collapse expanded>` (3 files). No other v9 breaking change
  was reachable — no `createPolymorphicComponent`, `positionDependencies`, `Grid
gutter`, `Text`/`Anchor` `color`, or affected hooks (`useFullscreen`,
  `useResizeObserver`, `useMouse`, `useMutationObserver`, `useTree`).

- Updated dependencies [5f19016]
- Updated dependencies [78e4778]
- Updated dependencies [4324652]
- Updated dependencies [de044f8]
- Updated dependencies [cd1a811]
- Updated dependencies [19fa6f0]
- Updated dependencies [b501612]
- Updated dependencies [eb37b1e]
  - @pikku/core@0.12.66

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
