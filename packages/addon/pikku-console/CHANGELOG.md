## 0.12.44

### Patch Changes

- 31ad85f: fix(emails): escape substituted values in the generated email renderer

  `renderEmailTemplate` spliced values into HTML unescaped and looped substitution
  until it reached a fixed point, so a value containing `"` broke out of the
  attribute it landed in, a value containing markup was injected verbatim, and a
  value containing `{{...}}` was re-expanded as a template on the next pass. An
  ordinary CSS font stack from `theme.json` was enough to corrupt the document.

  Rendering is now layered by trust. Partials are inlined first; `theme.*` and
  `t.*` are expanded next as template-author input; caller `data` is substituted in
  a single pass that is never rescanned. Values are HTML-escaped in `.html` output
  and left raw in `.subject.txt` / `.text.txt`. `{{content}}` and partials stay
  raw, and `{{{value}}}` is a new opt-in raw form. The console's email preview uses
  the same renderer, so previews match what is sent.

## 0.12.43

### Patch Changes

- 7722ceb: Split the addon leaf so an application cannot shadow a linked addon's own

  An addon authored its services through `#pikku/addon`, and so did an
  application installing one. Node keeps those apart — `#pikku/*` is a
  package-private subpath import, resolved against the addon's own
  `package.json` — but tsconfig `paths` are global to a tsx process, and every
  runtime template maps `#pikku/*` onto a sibling package. A linked addon's
  `#pikku/addon` was resolved against the _application's_ leaf, which holds the
  install half and none of the authoring exports, and every template failed to
  boot with `does not provide an export named 'pikkuAddonServices'`.

  The authoring half now sits at `#pikku/addon/setup`. An application generates a
  flat `.pikku/<leaf>`, so there is nothing there for that specifier to match and
  the resolver falls back to Node, which reads the addon's own imports. Addons
  declaring themselves import `pikkuAddonConfig`, `pikkuAddonServices` and
  `pikkuAddonWireServices` from `#pikku/addon/setup`; `wireAddon` and
  `wireRemoteAddon` stay at `#pikku/addon`.

  `wireAddon` and `wireRemoteAddon` also move off `@pikku/core/rpc` onto
  `@pikku/core/addon`. Being reached over rpc is how an addon is called rather
  than what it is, and it put the whole addon surface behind the rpc subpath for
  consumers that only wanted to install one.

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
- 892100b: Generate the meta service under `services/` and reach it through `#pikku`

  `pikku-meta-service.gen.ts` was written loose at the root of the output dir
  while every wiring type sat in its own subdir, and both call sites that consume
  it reached past the `#pikku` imports map to a relative path into the generated
  tree — `e2e/src/services.ts` with a static import, the `functions` template with
  a dynamic `await import('../.pikku/pikku-meta-service.gen.js')`. It now lands at
  `services/pikku-meta-service.gen.ts` and is imported as
  `#pikku/services/pikku-meta-service.gen.js`, matching the `<dir>/pikku-<x>.gen.js`
  shape the rest of the generated tree already uses. Bootstrap prunes the old root
  file, since a project generated before the move would otherwise keep compiling
  it. The console addon's "metaService is required" error names the new path.

  The `functions` template had no `imports` map at all, so its generated-code
  imports were all relative; it now declares `"#pikku/*": "./.pikku/*"` and its
  `services.ts` goes through it.

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

- 266e3bc: `#pikku` is a namespace, not a module: one subpath per wiring

  The bare `#pikku` specifier resolved to `.pikku/pikku-types.gen.ts`, a hub that
  re-exported all twelve wiring leaves with `export *` — undoing the split the
  leaves exist for, each of which still says so in its own generated header
  ("HTTP-specific type definitions for tree-shaking optimization"). Reaching that
  hub put 33 distinct `@pikku/core` subpaths into the module graph, and neither
  consumer could drop them again: bundlers keep `export *` chains because the app
  declares no `sideEffects`, and Node and tsx do not tree-shake at all, so an app
  with no queues still executed `@pikku/core/queue` at boot.

  The hub is gone. An app now imports the leaf the name belongs to —
  `#pikku/function`, `#pikku/http`, `#pikku/workflow` — and a project's `imports`
  map declares two patterns, because both resolvers pick the more specific one:

  ```json
  "#pikku/*.js": "./.pikku/*.ts",
  "#pikku/*": "./.pikku/*/index.ts"
  ```

  A source tree names the `.ts` on both. Webpack, esbuild and Bun all rewrite a
  `.js` specifier to the `.ts` beside it for a relative import but not for an
  imports-map target, so a `.js` target there resolves to a file that does not
  exist. The two places that keep `.js` are the ones where it is the real file: a
  published addon, whose map points into `dist`, and a project that imports a
  declaration-only generated file such as `pikku-rpc-wirings-map.gen.d.ts`, where
  naming the `.js` lets the type resolver's own mapping reach the `.d.ts`.

  `pikku` generates the leaf indexes and removes the hub, and `pikku validate`
  reports a barrel import as an error. The split also turns the addon boundary
  from advice into a rule: an addon never generates the wiring leaves, so
  `#pikku/http` fails at the specifier rather than yielding "no exported member"
  from a hub that quietly dropped the re-export.

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

- 727671b: Serve the public surface to the console. `console:getSurface` reads the doc
  shipped inside `@pikku/cli` and the usage the inspector measured into the
  project's outDir, each half optional, and `/surface` renders it from
  `useSurface()`. Both files are read on demand when the page asks, never at boot.
- 727671b: `wireAddon` and `wireRemoteAddon` move from `#pikku/function` to `#pikku/addon`.

  Installing an addon and authoring one are the same concept from opposite ends,
  so they are one import: an application's `#pikku/addon` carries the two install
  functions, an addon package's carries `pikkuAddonConfig`, `pikkuAddonServices`,
  `pikkuAddonWireServices` and `AddonBaseServices`.

  Two generation fixes came with it:

  - `CredentialsMap` is generated as a type alias rather than an interface. An
    interface has no implicit index signature, so it was never assignable to the
    `Record<string, unknown>` that `GetCredential` is constrained by, and every
    generated project reported two errors on its own function types.
  - An unresolved `SingletonServices` type is now `PKU724` instead of a services
    map with no entries in it. Written out, the empty map made every service
    optional and the real failure resurfaced as unrelated "possibly undefined"
    errors in files nobody had touched.

- Updated dependencies [7722ceb]
- Updated dependencies [375c1ff]
- Updated dependencies [20d8a39]
- Updated dependencies [02a70cd]
- Updated dependencies [aeef159]
- Updated dependencies [a281de6]
- Updated dependencies [266e3bc]
- Updated dependencies [02a70cd]
- Updated dependencies [786dae5]
- Updated dependencies [6eef0a0]
- Updated dependencies [20d8a39]
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
  - @pikku/better-auth@0.12.26
  - @pikku/knowledge@0.12.7

## 0.12.42

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

- Updated dependencies [7406bfe]
- Updated dependencies [6794681]
- Updated dependencies [a7fcd2e]
  - @pikku/core@0.12.84
  - @pikku/better-auth@0.12.25

## 0.12.41

### Patch Changes

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

- 3a4d50a: Five `console:scope*` descriptions and two `pikku *-prune` warnings promised a
  grant or revoke "takes effect on their next request — no re-login". That is
  only true when `withResolvedScopes` actually resolves, and it skips resolution
  whenever `mapSession`/`mapKey` has already set `scopes` — which is
  authoritative and deliberately never overridden.

  So an app whose `mapSession` derives scopes from something like
  `result.user.role` — the shape the `wire-scope` scaffold teaches — can grant a
  scope from the console, see it stored, and have it never reach a session. The
  revoke direction is worse: `roles prune` and `scopes prune` reported that users
  lose the scopes on their next request when in fact they keep them.

  Copy only; no behaviour change. The docblock on `withResolvedScopes` now states
  that the propagation guarantee is conditional on resolution running at all, so
  the next person copying that sentence into UI copy carries the caveat with it.

- Updated dependencies [3a4d50a]
  - @pikku/better-auth@0.12.24

## 0.12.40

### Patch Changes

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
- Updated dependencies [8ad051c]
- Updated dependencies [ce66bf8]
- Updated dependencies [d0307a8]
- Updated dependencies [0ab1a88]
- Updated dependencies [5599a27]
- Updated dependencies [ce66bf8]
- Updated dependencies [3ad2131]
- Updated dependencies [b930dca]
- Updated dependencies [b95e77d]
- Updated dependencies [fd9d834]
- Updated dependencies [8978fbd]
  - @pikku/core@0.12.82
  - @pikku/better-auth@0.12.23
  - @pikku/knowledge@0.12.5

## 0.12.39

### Patch Changes

- 2f15aad: Resolve every entry point under `dist`

  `imports["#pikku"]` named `./.pikku/pikku-types.gen.ts` — a TypeScript file, at
  runtime, inside `node_modules` — while `files` publishes only `dist`. The
  generated output under `dist/.pikku` also imports a `types/application-types.d.js`
  that nothing was copying there, since a hand-written `.d.ts` is an input to
  `tsc` rather than something it emits.

  Both now point at the built copy. The addon's own build resolves `#pikku`
  through tsconfig `paths`, so no entry point has to reach into the source tree.

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

## 0.12.38

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

- 78b29f0: `SecretService` now returns a `SecretValue<T>` rather than the bare value, so a
  vault secret cannot reach a sink by accident.

  `SecretValue` is nominally typed, which means it is not assignable to `string`
  (or to any other concretely-typed field). Every sink with a real type — a
  database column, an email body, a session payload — rejects it with no lint
  rule involved. The sinks typed `any`, `unknown`, or a free generic — the logger,
  queue payloads, webhook and email inputs, and a function's own output — are
  guarded with `Safe<T>`, which collapses a `SecretValue` found anywhere inside
  `T`, however deeply nested, to `never`.

  Unwrap deliberately at the point the secret reaches the wire:

  ```ts
  const secret = await secrets.getSecret('BETTER_AUTH_SECRET')
  betterAuth({ secret: secret.reveal() })
  ```

  Two behaviours cover what types cannot see. Structured serialization redacts —
  `JSON.stringify` and node's inspect both yield `[secret]`, so an audit or log
  write stays honest without crashing the request. String coercion throws
  `SecretCoercionError`, because a template literal is always a leak.

  `AuditLog.write` is guarded the same way as the logger, since an audit event
  carries `input` and `metadata` as `unknown` and nominality alone cannot stop a
  secret landing in one.

  `.reveal()` is the deliberate escape hatch, and what it hands back is an
  ordinary string as far as every sink signature is concerned. **PKU953** closes
  that gap: under `pikku all --security` the inspector reports a revealed secret
  that flows into a logger, an audit, a queue, an email or a webhook — `console` included.

  This also fixed a real one: `remote-addon-auth.ts` called `String(token)` on an
  `unknown` and wrote the result straight into an `Authorization` header.

- Updated dependencies [62ea4cc]
- Updated dependencies [9dddff8]
- Updated dependencies [1065b80]
- Updated dependencies [78b29f0]
  - @pikku/core@0.12.76
  - @pikku/knowledge@0.12.4
  - @pikku/better-auth@0.12.21

## 0.12.37

### Patch Changes

- dd19aa7: Drop `scopes` from sessionless functions, rename `selfAuthenticated`, and make both
  escape hatches opt-in.

  **`scopes` are gone from `pikkuSessionlessFunc`.** They are AND-ed and `verifyScopes`
  fails closed on a session that does not exist, so every scope listed on a sessionless
  function rejected the anonymous caller it exists to serve. `CorePikkuSessionlessFunctionConfig`
  now states this once in core, and the generated `pikkuSessionlessFunc` / `pikkuVoidFunc`
  configs derive from it — so the field is absent rather than subtracted.

  `@pikku/addon-console`'s `installAddon` and `installOpenapiAddon` are now `pikkuFunc`.
  Both set `auth: true` and `scopes: ['admin']`, and a test exercises that gate, so the
  scopes were load-bearing — they only compiled as sessionless because the config accepted
  a field it could not honour. No behaviour change: both already required a session.

  **`selfAuthenticated` is now `permissionsInBody`.** It never described authentication:
  what it records is that the permission check lives in the function body rather than in a
  declared `permissions` entry.

  **Both escape hatches must be opted into**, via a new `allow` block in
  `pikku.config.json`:

  ```json
  "allow": { "permissionsInBody": true, "complexWorkflows": true }
  ```

  Unset means unavailable, and using the feature is a build error naming the flag that
  would permit it — PKU576 for `permissionsInBody`, PKU643 for `pikkuWorkflowComplexFunc`.
  Both trade something the tooling can inspect for something only a reader can verify: a
  permission check buried in a body, or workflow steps that cannot be serialized into the
  graph, replayed, or migrated. Both are occasionally right, and both are the path of least
  resistance whenever the declarative form is merely inconvenient. Whoever owns the project
  makes that call once, in writing, instead of every author making it silently at the call
  site.

  **PKU574's message no longer contradicts any of this.** Every function it reports is
  sessionless — that is how the population is selected, not a finding — yet it opened by
  reporting that they "require neither a session", then advised adding scopes. It now names
  them as sessionless and recommends only gates an anonymous caller can meet:
  `permissions`, `auth: true`, `wireAddon({ auth: true })`, or dropping `expose: true`.
  `permissionsInBody` is deliberately absent from that list: a diagnostic should not
  advertise its own escape hatch.

- Updated dependencies [32277d5]
- Updated dependencies [ea8aabf]
- Updated dependencies [33e96ab]
- Updated dependencies [fd72e58]
- Updated dependencies [fd72e58]
- Updated dependencies [fd72e58]
- Updated dependencies [894b2f8]
- Updated dependencies [dd19aa7]
- Updated dependencies [50ec500]
  - @pikku/core@0.12.75

## 0.12.36

### Patch Changes

- afef587: Close eleven security weaknesses found in a review of `@pikku/core`. Most are
  breaking, and two invalidate data or credentials already in the wild — read the
  migration notes before upgrading.

  **Breaking: AI agent thread ownership now fails closed.** Reading, listing,
  resuming or approving an existing thread or run requires a resolved session
  principal (`userId`, or `orgId` for `sessionScope: 'org'`), regardless of the
  agent's `auth` setting. Previously a request without a session had no ownership
  model at all: the caller-supplied `resourceId` was accepted as the ownership
  key, so any caller could read or resume another party's thread by naming its
  `resourceId`. Worse, `threadOwnerConstraint` returned `undefined` for a
  sessionless caller, and `undefined` means _no filter_ rather than _no rows_ —
  so `getAgentThreads` returned every thread in the deployment. It now returns
  `string[]`, empty for a sessionless caller, which every storage backend already
  treats as matching nothing. Sessionless agents still run one-shot conversations,
  each with a fresh unguessable owner; what they lose is cross-request continuity.
  Wire a session to restore it.

  **Breaking: stored secrets and credentials must be re-entered.** `deriveKey` ran
  a single unsalted round of SHA-256 over the passphrase and used the digest
  directly as the AES-GCM key — roughly one hash per brute-force guess, with one
  rainbow table working against every deployment. It is now PBKDF2-HMAC-SHA256 at
  600,000 iterations over a random salt. There is no compatibility path: every
  value held by the kysely, mongodb and redis secret services and the kysely
  credential service becomes undecryptable. They fail loud, naming the key and
  `key_version`, so the app hard-fails on first secret read until each is re-set.

  The KEK salt is scoped to the key version and stored alongside it, rather than
  per secret, so a bulk read costs one derivation instead of N — `getSecrets` over
  50 secrets went from ~2.3s to ~48ms, and rotation from ~4.6s to ~94ms. This adds
  a salt table (kysely), hash field (redis) or collection (mongodb), created
  automatically on first use.

  **Breaking: `PIKKU_REMOTE_SECRET` must be at least 32 characters.** The
  remote-RPC session envelope moved from PBKDF2 to HKDF, which expands
  high-entropy key material rather than stretching a low-entropy passphrase. That
  took a remote hop from ~269ms to ~0.4ms — PBKDF2 was running twice per request —
  but HKDF supplies no brute-force resistance, so the secret must carry the
  entropy itself. A shorter secret now throws `WeakKeyMaterialError` at both ends.
  Generate one with `openssl rand -base64 32` and roll it out to every service in
  the mesh together: existing bearer tokens are format-incompatible, so a partial
  rollout produces 401s until every instance is updated. The Cloudflare, Lambda
  and Azure deployment services each hand-rolled a copy of `buildRemoteHeaders`
  and now call the shared one, which is what keeps the two sides in step.

  **Breaking: previously signed content URLs stop verifying.** `LocalContent`
  signed only `{signedAt, expiresAt, notBefore}`, so a signature proved when a URL
  was issued but never what it was issued for — any valid token was a skeleton
  key, and swapping the pathname from a public thumbnail to a private document
  still verified. The signature now binds the request path. Separately, the
  verifier returned "valid" when no JWT service was wired, which is how
  `pikku serve` ran: a forged `?signedAt=0&expiresAt=99999999999999` was accepted.
  It now rejects with 403, `LocalContent` requires a `JWTService`, and
  `pikku serve`/`pikku dev` mint an ephemeral per-process signing key so local
  development works without shipping a fail-open path. In-flight signed URLs must
  be re-issued.

  **Request body size limits now apply to every adapter.** The `maxBodySize` cap
  existed only in `PikkuFetchHTTPRequest`. The real hole was uWebSockets, which
  drove `res.onData` itself and concatenated every chunk with no bound and nothing
  downstream able to intervene; it now drops chunks past the limit and replies 413
  before routing. Fastify delegates to its native `bodyLimit` (set only when
  `maxBodySize` is configured, so fastify's stricter 1 MB default is never
  loosened), and `PikkuExpressServer` feeds the limit into its body parsers. Two
  paths can only reject rather than prevent, and are documented as such:
  `express-middleware` mounted on your own app receives an already-parsed body, so
  that deployment must bound its own parser; Next server actions bottom out at
  `experimental.serverActions.bodySizeLimit`.

  **Breaking: the console addon's privileged functions are gated by default.**
  `wireAddon` gains a `scopes` option that applies to every function in the
  addon's namespace, and the console scaffold now generates
  `wireAddon({ name: 'console', package: '@pikku/addon-console', scopes: ['admin'] })`.
  Previously the console's entire privileged surface — around 54 functions
  including `credentialGet`, which returns a resolved OAuth token for an arbitrary
  `userId`, `updateFunctionBody`, and `installAddon`, which shells out to a
  package install — was protected only by an optional host-registered
  `addGlobalPermission`. `resolveGlobalPermissions` returns `[]` when none is
  registered and permission checking then no-ops, so an app that never registered
  one served those functions to anyone, and with the template's default
  `scaffold.rpc: "no-auth"` that meant unauthenticated. All of them now return 403
  `MissingScopeError` without an `admin`, `admin:*` or `*` scope. **Regenerating
  is required** — an app holding an old `console.gen.ts` stays open.
  `installAddon` and `installOpenapiAddon` additionally declare their own
  `auth: true, scopes: ['admin']`, and `getAgentThreads` now scopes its listing to
  the session's own threads unless the caller holds admin.

  Addon scopes are enforced in `runPikkuFunc` rather than at the RPC boundary,
  because a wiring can reference an addon function directly — the inspector
  records the addon's `packageName` on HTTP, channel, schedule, queue, CLI,
  trigger, gateway and MCP wirings — and those paths never call `resolveNamespace`.
  Enforcing at the RPC seam would have covered only the `namespace:function` form
  while reading as complete.

  **Breaking: `wireAddon`'s `auth` and `tags` now apply on direct wirings too.**
  Both were read only by `resolveAddonFunction`, so they had exactly the hole
  scopes had: `wireAddon({ name: 'console', package: '@pikku/addon-console', auth:
true, tags: ['admin'] })` gated `rpc('console:credentialGet')` and gated nothing
  at all on an HTTP route wired straight to `credentialGet`. A consumer who
  reached for the documented way to lock an addon down got a control that was
  silently inert on every wiring except one. Both now resolve in `runPikkuFunc`.
  `auth` merges as an OR — `auth: false` from an addon is ignored on a direct
  wiring, because an addon may require a session the wiring did not but must never
  waive one it did. Addon tags resolve to concrete middleware against the **root**
  tag groups before the call rather than being folded into the function's
  inherited middleware: `addTagMiddleware('admin', …)` is written by the consuming
  app and registers under the root package, whereas `combineMiddleware` would look
  the tag up under the addon's own `packageName`, where it does not exist.

  One consequence worth naming: an addon that wires `auth: true` and also runs its
  own sessionless internal work — a scheduled task or queue worker inside the
  addon calling a sibling function — is now gated where it previously was not,
  because a bare `rpc('fn')` from inside the addon reaches `runPikkuFunc` with the
  addon's `packageName` like any other call. This reverses a decision that
  deliberately scoped the gate to the namespaced boundary; that reasoning held
  only while the boundary was real, and a direct wiring can enter an addon without
  crossing it, so "already inside" is not something the runtime can infer. Such an
  addon should carry authorization on the function via
  `pikkuFunc({ permissions })`, which has always been enforced on every path. A
  follow-up will add execution provenance so an intra-addon call can be
  distinguished from an external one and skip the addon-level check; that needs a
  marker no caller outside the process can set, which is its own design problem
  and does not belong in a security fix.

  **Codegen now warns when an exposed function has no gate (PKU574).** The
  generated `POST /rpc/:rpcName` dispatcher forwards to `rpc.exposed`, which
  refuses anything without `expose: true` — but nothing checked whether the
  target was gated, because a dispatcher cannot know what it dispatches to. The
  console shipped ~54 privileged functions through that gap and the toolchain was
  silent. The inspector now reports every function that is exposed, sessionless,
  and carries no `auth`, `scopes` or `permissions` of its own and none from a
  governing `wireAddon`. It is a `warn`, not a critical: `expose: true` on an
  ungated sessionless function is correct for a genuinely public endpoint, so it
  blocks a build only under `--fail-on-warn`.

  Two pieces of metadata were missing for this to be answerable statically, and
  both are now recorded. A `pikkuSessionlessFunc`'s own `auth: true` was read at
  runtime but never written to function meta, so a self-gated function was
  indistinguishable from an ungated one — `sessionless` carries the baseline, and
  `auth` now carries the tightening. And `wireAddon`'s `scopes`, `auth` and `tags`
  were not parsed at all: the inspector recorded the addon's `rpcEndpoint` and its
  secret, variable and credential overrides, and dropped every one of its gates.
  An addon whose gates are not statically knowable is treated as gated, because a
  false positive on a correctly-secured addon costs more than the one case it
  would catch.

  **Breaking: an application's global permissions now apply inside addons.**
  `resolveGlobalPermissions` read only the bucket matching the function's own
  package, but the generated `addGlobalPermission` wrapper takes no package
  argument and always registers under the root. An app-wide rule like "every
  request needs a signed-in user" therefore stopped at the addon boundary, and the
  bucket an addon's functions did read was one no host could write to — which is
  why the console addon's recommended `addGlobalPermission([isAdmin],
'@pikku/addon-console')` was never a gate anybody could actually install. A
  function now resolves the root bucket and its own package's, root first.
  Unioning is safe in a way nothing else here would be: globals AND, so adding the
  root ones can only tighten. Package buckets stay one-way — a package's globals
  never reach root functions, or an installed addon could gate the whole
  application. Apps with both a root global and addon-provided functions will see
  those functions gated where they previously were not.

  **Codegen now records whether each HTTP route requires a session, and warns
  about inert addon tags (PKU575).** Four separate things can demand a session —
  the function's `sessionless`, its own `auth`, the route's (or its group's)
  `auth`, and the addon it belongs to — and answering "which routes are open?"
  meant joining all four by hand and knowing which wins. Each route's meta now
  carries the resolved `requiresSession` alongside the route's own `auth`. Scopes
  count as requiring one, since they are matched against the session's and fail
  closed. Anything not statically knowable resolves to `true`, matching PKU574:
  a route that looks stricter than it is costs less than one that looks open and
  isn't. Separately, `wireAddon({ tags: ['admin'] })` reads like a gate and is
  applied like one right up until no `addTagMiddleware('admin', …)` exists, at
  which point it resolves to an empty list and gates nothing; that now warns.
  Only addon tags are reported — a tag on a function is as likely to be
  organizational, and warning about those would bury the case that matters.

  **Object-shorthand permissions were missing from meta.** The inspector visited
  `ts.PropertyAssignment` but not `ts.ShorthandPropertyAssignment`, so
  `permissions: { canAdminOrg }` — enforced identically to the longhand form at
  runtime, since `verifyPermissions` has a non-array branch — was recorded as _no
  permissions at all_. That is the most dangerous direction for meta to be wrong
  in: an audit reading it sees an open door where one is shut. It cost this review
  a false IDOR report across ~35 billing and org functions before the source
  contradicted the metadata.

  **Functions that authorize in their own body can say so.** A webhook receiver
  verifying a signature, or a handler redeeming a signed invite, is genuinely
  closed while carrying no session, scope or permission — indistinguishable in
  meta from one nobody remembered to gate, and so warned about forever by PKU574.
  `selfAuthenticated: true` on the function config records the claim and silences
  the warning for that function. It is declarative only: nothing at runtime reads
  it and it grants nothing. Detection was rejected deliberately — inferring it
  from the body means a function that _looks_ like it checks something silences
  the warning while checking nothing, and a warning that is usually wrong stops
  being read.

  **Breaking: `scaffold.<feature>` is now `boolean | { auth?, path? }`, and `true`
  means authenticated.** The old `'auth' | 'no-auth' | false` read like a
  starter-file preference while being a live authorization decision, set three
  directories from the functions it governed — the shape the console incident
  took. A surface now becomes public only by writing `{ auth: false }`, so
  omitting a field can never open anything: the failure mode of a forgotten flag
  is a locked door. `{ path }` additionally overrides where the file is
  generated, which previously could only be set for all features at once via
  `pikkuDir`.

  The legacy strings are **refused, not coerced**. `resolveScaffoldFeature` throws
  naming the key and its replacement (`"rpc": "no-auth"` → `"rpc": { "auth":
false }`), and it does so at config load, not downstream. An earlier design used
  a bare `string` for the output path, under which `"no-auth"` would have parsed
  as a file named `no-auth` and every unmigrated config would have silently
  produced nonsense; the object form makes any string invalid, so the failure is
  loud.

  The collapse is deliberately not uniform in effect. For `rpc` the flag was a
  blanket "no anonymous RPC in this app" set on a dispatcher that cannot know what
  it dispatches to; for `userAdmin` it was redundant, since the generated
  functions are already `pikkuFunc` with `scopes: ['admin:users:list']`. But for
  `agent`, `workflow`, `events` and `scenarios` it is the only gate — those
  generate real endpoints the app never authors — so `true` keeps them
  authenticated rather than opening them as a side effect of a config cleanup.
  `webhook` and `remoteRpc` have no auth dimension at all (`serialize-remote-rpc.ts`
  hardcodes `auth: false`), so an `{ auth }` on them is ignored. The three
  configs in this repo are migrated preserving their current behaviour exactly.

  **Queue job identities are signed.** A job carried the producer's `pikkuUserId`
  as a plain string and the worker resolved a session from it with no
  verification, so write access to the queue backend was act-as-any-user. The
  identity is now `pq1.<claim>.<hmac>`, HMAC-SHA256 over the claim and the
  canonicalized job payload, keyed by HKDF expansion of a new
  `PIKKU_QUEUE_IDENTITY_SECRET`. Producers opt in by wrapping their queue service
  with `SignedQueueService`. This fails safe rather than closed: with no secret
  configured the identity is dropped and jobs still process, warning once per
  process, so no existing deployment breaks on upgrade — it simply loses queue
  identity until the secret is set. The payload rather than the job id is bound
  because SQS, Cloudflare Queues, Azure and the in-memory service all mint ids
  after `add` returns.

  **Workflow inline state is read from the run record.** `isInline` consulted a
  process-local `Map`, while `WorkflowRun.inline` is durable. Any instance that
  did not start a run disagreed with the record, so one instance could dispatch a
  queued job for a workflow another was already executing in-process. It is now
  async and resolves through the durable identity, cached only when a context
  already exists so a passive reader allocates nothing. The same `Map` also leaked:
  `nextStepKey` fabricated replay state on every step, and `releaseContext`
  refused to free anything carrying it, so runs whose steps executed outside a
  `beginReplay` bracket — the step-worker queue path — stranded their context and
  step state for the process lifetime. Contexts are now released by an explicit
  execution counter. Step ordinals reset per execution rather than accumulating
  across step-worker invocations in one process, which makes step naming
  independent of how work was distributed.

  **Secret reads fail loud in every store.** `MongoDBSecretService.getSecrets`
  skipped rows that failed to decrypt, and the redis equivalent dropped every
  rejection via `Promise.allSettled`, including the "No KEK available for
  key_version N" configuration error. Both now throw, naming the key and its key
  version, matching the kysely behaviour. This matters most alongside the KEK
  change above: without it, an upgrade surfaces as a partial secrets map and an
  opaque downstream failure instead of an error naming the secret to re-enter.

  **A second middleware registration for a pattern no longer erases the first.**
  `addHTTPMiddleware`, `addTagMiddleware` and `addChannelMiddleware` groups are
  keyed by pattern or tag and held one source file each, so a second file's call
  overwrote the first's. Codegen emits its imports from what is stored, so the
  losing file was never imported and its middleware never registered — the
  runtime composes repeated registrations for a pattern happily, and only codegen
  dropped one. Adding an unrelated `addHTTPMiddleware('*', …)` to an app was
  enough to silently unregister the generated better-auth session bridge, which
  fails open and gives no sign until a request arrives without a session. A group
  now carries every registration made for it, and all of them are imported.

- Updated dependencies [6a307f0]
- Updated dependencies [afef587]
- Updated dependencies [6a6675c]
- Updated dependencies [8075f6a]
  - @pikku/core@0.12.74
  - @pikku/knowledge@0.12.3

## 0.12.35

### Patch Changes

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
- Updated dependencies [45859cf]
- Updated dependencies [a7b26c5]
- Updated dependencies [457cb25]
- Updated dependencies [f7567ad]
- Updated dependencies [ba6cc08]
- Updated dependencies [a2e21e5]
- Updated dependencies [457cb25]
- Updated dependencies [86a50b9]
- Updated dependencies [0e0f6eb]
  - @pikku/core@0.12.73
  - @pikku/better-auth@0.12.20
  - @pikku/knowledge@0.12.2

## 0.12.34

### Patch Changes

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
- Updated dependencies [b89d3b3]
  - @pikku/core@0.12.72
  - @pikku/knowledge@0.12.1

## 0.12.33

### Patch Changes

- 4c59a92: `db/pikku-db-schema.gen.json` now records who declared each table. Every entry carries a `source` — `app`, `better-auth`, `pikku-runtime`, or an addon's package name — and framework-declared tables also carry the `origin` prose from their migration header.

  The console's Database view filters on that instead of guessing from a table-name prefix. The old guess (`workflow_`, `ai_`, `pikku_`) missed Better Auth's `user`, `session`, `account` and `verification`, the secrets, credentials, channel and webhook-delivery tables, and every addon's, all of which rendered as if the project owned them. A schema JSON generated before this change still falls back to the prefix guess, so an un-regenerated project sees no behaviour change.

  Provenance is read back out of the generated migrations at codegen time — each one already names its source in its filename and its origin in its header — so `db migrate` needs no new inputs and does not have to load the project's Better Auth config.

- 637e668: State every package's license in the package itself.

  Eight publishable packages had no `license` field, `@pikku/aws-services` said `UNLICENSED` by accident, and no package carried a LICENSE file at all — the grant lived only in the repo root, which npm tarballs never include. Every publishable package now declares its license and ships the matching LICENSE file, and `yarn check:licenses` fails the release if the two ever disagree.

  `@pikku/console` is now explicitly BUSL-1.1 and named in the root LICENSE's Licensed Work alongside `@pikku/cli` and `@pikku/inspector`; the Additional Use Grant still permits production use for any purpose, including in free and open source software. Everything else — runtimes, services, clients, deploy adapters and the agent skills — is MIT, as the root LICENSE already said.

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

## 0.12.32

### Patch Changes

- a436645: Redesign the console's scenarios screen as living documentation of a project's BDD features.

  The inspector now statically extracts `pikkuFeature` declarations — name, description, tags, the scenarios each one groups (including `{ scenario, data }` examples), and whether it declares `before`/`after` — and the CLI writes them to `<outDir>/scenarios/features.gen.json`, which `MetaService.getFeaturesMeta()` reads and the console addon returns from `getAllMeta`.

  The scenarios page reads that back as a document: features on the left, and on the right the selected feature's scenarios, each rendered as the given/when/then ladder of prose its author actually wrote, with repeats shown as `for each x in xs`, `Examples:` tables for parameterised entries, skip reasons stated rather than hidden, and each scenario's cast of personas inline. The Flows/Personas segmented control is gone; tags filter the document the same way `pikku scenario run --tags` filters a run.

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

## 0.12.31

### Patch Changes

- 9a9ed6f: Detect the project's package manager instead of defaulting to yarn when installing an addon

## 0.12.30

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
