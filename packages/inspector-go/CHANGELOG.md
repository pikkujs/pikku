# @pikku/inspector-go

## 0.12.7

### Patch Changes

- edd7abf: Platform-service contributors are plain objects an addon registers with `defineContributors` (new `@pikku/core/contributors`) and a project opts in to by name with `wireAddon({ contributors })`. `dev.contributors`, `deploy.contributors`, addon `pikku.contributors`, the string-emitting `PlatformServiceContributor` API and its helpers, the adapter `contributors` option and the `devPlatformServicesFile` config output are removed, and a leftover one is a hard error: the CLI refuses the config keys by name and the inspector reports an addon `package.json` with `pikku.contributors` as PKU364 (see `docs/MIGRATION.md`). Contributors can declare `onServerStart` / `onServerStop`, run around the app's server lifecycle in `pikku dev`, `pikku serve`, the generic server entry, standalone and the Cloudflare container entry (which now runs the app's own `serverLifecycle`); on a Worker `onServerStart` is a build error. `ProviderAdapter.contributorSupport` gains a required `runsServerLifecycle`. `@pikku/core` is a new peer dependency of the deploy packages and `@pikku/kysely` of `@pikku/deploy-cloudflare`. The names in `wireAddon({ contributors })` are typed from the addon's published contributors meta, so a name the addon does not register fails `tsc` and completes in the editor. A project gets a generated `#pikku/contributor` (`defineContributors` and `Contributor` typed against its own singleton services, type-only apart from core's helper); addons keep using `@pikku/core/contributors`.
- 8a4233a: Breaking: `pikkuStudio` is now `definePlugin`. An addon declares the screens and nav it brings to Studio with `definePlugin({ title, screens })` from `@pikku/core/addon`. The manifest shape is unchanged; rename the import and the call. `pikku new addon-ui` scaffolds the new name.
- Updated dependencies [3562771]
- Updated dependencies [edd7abf]
- Updated dependencies [8a4233a]
  - @pikku/core@0.12.148
  - @pikku/inspector@0.12.112

## 0.12.6

### Patch Changes

- e26796f: An addon can call another addon with full types. It declares the dependency in its package.json as `"pikku": { "uses": { "stripe": "@pikkustudio/addon-stripe@^0.12.0" } }` and calls `rpc.invoke('stripe:charge', ...)`, `rpc.startWorkflow('stripe:...')` or an agent with no cast. `pikku all` in the addon types `stripe:*` from the dependency's SDK: a workspace package's own `.pikku/sdk`, or a registry SDK pinned in `pikku-addons.lock`.

  The app maps the alias with `wireAddon({ ..., uses: { stripe: '<wired name>' } })`, whether the target is wired with `wireAddon` or `wireRemoteAddon`. New codes: PKU354 (the wired instance's version is outside the declared range), PKU355 (`uses` maps a name the addon did not declare), PKU356 (a malformed `pikku.uses` entry). PKU347 and PKU348 now also cover the alias form.

  Breaking (fail-closed): for an addon that declares `pikku.uses`, a `wireAddon` `uses` key it did not declare is now an error (PKU355). Agent `run`/`stream` from an addon now go through `uses` like invoke and workflows, so an unmapped agent call throws `AddonNotUsedError`. See docs/MIGRATION.md.

- 6524233: An addon granted `BETTER_AUTH_SECRET` (or an override onto it) no longer fails the first `pikku all` of a clean better-auth project with PKU124 "targets a secret that does not exist. Available secrets: none". The secret is declared by `auth-secrets.gen.ts`, which that first inspection runs before; the addon-grant check now takes the same fallback the secret-usage check already did. A project without `pikkuBetterAuth` still gets PKU124 for that grant.
- 2fdd2d2: A service factory export wrapped in a cast now fails the build with `PKU564` (`FACTORY_NOT_A_DIRECT_CALL`, critical), in both inspectors. That covers `as`, `<T>`, `satisfies`, a non-null assertion and parentheses around `pikkuServices`, `pikkuAddonServices`, `pikkuWireServices`, `pikkuAddonWireServices`, `pikkuConfig`, `pikkuAddonConfig` or `pikkuServerLifecycle`. Before, the inspector skipped the factory without a word: an addon written as `pikkuAddonServices(...) as unknown as CreateSingletonServices<...>` generated no `pikku-package.gen.ts`, and its workflows failed at runtime with `WorkflowNotFoundError`. The message names the export, its file and line, and asks for the cast to be removed and the type it hid to be fixed.

  Core's package factory slots (`PikkuPackageState['package']['factories']`, which every generated `pikku-package.gen.ts` assigns) are now typed `CreateConfig<any>`, `CreateSingletonServices<any, any>` and `CreateWireServices<any, any, any>`. Typed against `CoreConfig` / `CoreSingletonServices`, they refused an addon whose `Config` has required fields of its own or whose services narrow a core one, which is what pushed addons into the cast. Such an addon's factory now type-checks as written.

- fd0c346: Functions take `disabled: true | 'reason'`. A disabled function is left out of the build entirely (meta, RPC maps, clients, addon SDKs, MCP, CLI, HTTP and every wiring) and `addFunction` refuses it at run time. Anything that still references one — a wiring, `rpc.invoke('name')`, a workflow step, an agent tool, or an inline definition inside a wiring — fails the build with `PKU562`, naming both sides. `pikku all` lists the disabled functions once, with file and reason.

  `pikku verify` now fails on an app function that is not wired, exposed or called by name (`PKU563`, an `error` diagnostic that `pikku all` prints but does not fail on). Addon functions are never checked; workflows are, and count as used when started by a literal name (`rpc.startWorkflow`, `workflowService.startWorkflow` / `runToCompletion`, `rpc.invoke`, a workflow step). Use the function or mark it `disabled`.

  References in generated files (`*.gen.ts` / `*.gen.js`) do not count for `PKU562`, so disabling a function no longer fails the next `pikku all` on the previous run's output. Functions in generated scaffolds are never `PKU563`.

  An inline `defineChannelRoutes({...})` inside `wireChannel`'s `onMessageWiring` is now read, so its message routes reach the channel meta.

- 3abfbf4: An app now requires `incomingWebhookService`, and the `incoming-webhook` schema it owns, only when it wires incoming webhooks (a webhook source or the `pikku-incoming-webhooks` queue worker). An addon that forwards the service, as `@pikku/addon-admin` does to list receipts, used to make every app that wired it require the service too: the generated local services then called `KyselyIncomingWebhookService.init()`, and an app whose migrations had no `webhook_receipt` table failed to boot over a table nothing writes to. Such an app now gets the queue-only service and the addon's receipt functions return an empty list. An app that does wire incoming webhooks still requires the service and still fails at boot when its tables are missing.
- 28a0d77: An addon declares its Pikku Studio screens with `pikkuStudio({ title, screens })` from `@pikku/core/addon`. Each screen has a `path`, a `title` (a message key in the addon's `messages/{locale}.json`, also the nav label), a lazy `component` or an `app`, and a `scope`: `'studio'` (`/<path>`), `'team'` (`/<team>/<path>`) or `'project'` (`/<team>/<project>[/<target>]/<path>`). Optional: `nav: { area: 'rail' | 'team' | 'project' | 'account', icon, order, badge? }` where `badge` names a function of the addon returning a count, `replaces`, `needsApp` (project screens only, default false), `layout: 'bare'` and `scopes` (hide the screen; not access control). Both inspectors emit the screens in the `studio` metadata, and `pikku new addon-ui` scaffolds the new form with a `messages/en.json`.

  New codes: PKU357 (two screens of an addon use the same path), PKU358 (a title key missing from the addon's `messages/en.json`), PKU359 (a `nav.badge` naming no function of the addon). A non-literal field is PKU345, and a key missing from another locale is a warning.

  Breaking: `defineScreens` and its types (`ScreensManifest`, `AddonScreen`, `AddonComponentScreen`, `AddonAppScreen`) are removed with no alias, the manifest's top-level `icon` is gone, and `nav` is an object instead of a boolean. The serialized inspector state's `screensManifest`/`addonScreens` are now `studio`/`addonStudio`. See docs/MIGRATION.md.

- 576f2f2: PKU564 now fails only on a real cast around a service factory: `as`, `<T>` or a non-null assertion (`!`). `satisfies` and parentheses leave the factory's type as written, so the inspector reads through them: `pikkuConfig(...) satisfies CreateConfig<Config>` or `(pikkuWireServices(...))` registers exactly like a direct call, addon contract included. A cast with `satisfies` or parentheses between it and the call is still PKU564, and the message names the outermost cast.
- Updated dependencies [8f850a5]
- Updated dependencies [e26796f]
- Updated dependencies [6524233]
- Updated dependencies [2fdd2d2]
- Updated dependencies [fd0c346]
- Updated dependencies [3abfbf4]
- Updated dependencies [28a0d77]
- Updated dependencies [576f2f2]
  - @pikku/core@0.12.147
  - @pikku/inspector@0.12.111

## 0.12.5

### Patch Changes

- c416188: `wireRemoteAddon({ package: '@scope/name@^1.4.0' })` pins a remote addon by version range instead of a devDependency. The first step of `pikku all` resolves the range against the addon registry (`registry` in `pikku.config.json`, default `https://registry.pikkustudio.app`), verifies the SDK's sha512, extracts it to `.pikku/remote/<name>@<version>` and records it in the committed `pikku-addons.lock`. Codegen imports the remote addon's RPC, workflow and agent maps from the SDK, PKU338 checks the SDK against the lock, and `pikku update` reports versioned addons with the exact hand edit (file:line, old and new literal); it never rewrites source, and `--update` only touches package.json. New codes: PKU350 (package not a literal), PKU351 (SDK built for another @pikku/core), PKU352 (integrity mismatch), PKU353 (invalid package spec).
- fda33d9: For an addon, `pikku all` now packs its remote contract into a types-only `.pikku/sdk/` and `<scope>-<name>-<version>.sdk.tgz` at the package.json version (manifest, remote RPC map, exposed workflow map, agent map, and remote/exposed function meta with contract hashes and schemas). The archive is deterministic, and the SDK refuses any import outside itself and `@pikku/core`. Inside an addon, a `remote: true` function typed with generics or a named source type is now critical PKU922: its input and output must be zod schemas.
- c2314ca: Separate the mesh from remote addons, make addon `expose` opt-in, and stop passing remote addon errors through.

  **Breaking — the mesh is renamed.** `PIKKU_REMOTE_SECRET` → `PIKKU_MESH_SECRET`, `POST /remote/rpc/:rpcName` → `POST /mesh/rpc/:rpcName`, `rpc.remote()` → `rpc.mesh()`, `pikkuRemoteAuthMiddleware` → `pikkuMeshAuthMiddleware`, `@pikku/core/remote` (`buildRemoteHeaders`) → `@pikku/core/mesh` (`buildMeshHeaders`), `pikku enable remote-rpc` / `scaffold.remoteRpc` → `pikku enable mesh-rpc` / `scaffold.meshRpc`, and the queue `pikku-remote-internal-rpc` → `pikku-mesh-rpc`. Mesh tokens now use audience `pikku-mesh` and HKDF info `pikku:mesh-session`, so every unit of a split deploy must be released together. `remote: true` on a function is unchanged.

  **Breaking — `wireAddon({ expose })` is opt-in.** Installing an addon no longer puts its `expose: true` functions on `POST /rpc`. `expose: true` on the wiring opens them, a list opens the named ones, and a list can no longer open a function the addon did not declare `expose: true` (PKU343). The "exposed function has no gate" warning moves from the addon's own build to the app that opts in. OpenAPI-generated addons now declare every operation `expose: true`, so their install-time lists keep working.

  **Breaking — `wireRemoteAddon` uses the host's public RPC route.** Calls go to `{serverUrl}/rpc/<fn>` with `{ rpcName, data }` and `x-pikku-remote-contract: 1`; a host answers such a call only for functions that are `expose: true` and `remote: true`. `wireRemoteAddon` gains `expose` (forwarded from `rpc.exposed`, after the caller's `addonMayReach` check), `timeoutMs` (default 30s) and a `headers` hook. `RemoteAddonRequestError` is removed: a registered `PikkuError` named by a 4xx is rebuilt with its status and message, any other 4xx becomes the standard error for its status without the body, and a 5xx, network failure or unreadable body becomes `RemoteAddonFailedError` (502) and is logged on the consumer. A timeout is `RemoteAddonTimeoutError` (504).

- 6fe33e9: Remote addon calls now carry a function version. `pikku versions check` covers `remote: true` functions. The addon SDK records each contract function's `versions` and `latestVersion` and types `fn` and every `fn@vN` in the remote map. A consumer sends an explicit `ns:fn@vN` as it is and a bare `ns:fn` to the newest version in its SDK. On the host, `rpc.exposed` answers a version it no longer serves with a 404 `RPCNotFoundError` instead of falling back to the latest. `RPCNotFoundError` takes an optional message.
- Updated dependencies [c416188]
- Updated dependencies [fda33d9]
- Updated dependencies [c2314ca]
- Updated dependencies [bf1b54c]
- Updated dependencies [6fe33e9]
  - @pikku/core@0.12.146
  - @pikku/inspector@0.12.110

## 0.12.4

### Patch Changes

- a9318bd: Platform service contributors declare `needs` and `provides` and run in the order those require; an unmet need, a key provided twice or a cycle fails codegen by name. Generated `createPlatformServices(env, runtime)` receives the services the entry already built (`runtime.kysely` on standalone, after the database opens). Addons ship contributors in their package.json under `pikku.contributors`, picked up by `pikku dev` codegen and by `pikku deploy plan` / `apply`, which now also pass `deploy.contributors` from `pikku.config.json` to the adapter.
- Updated dependencies [679068f]
- Updated dependencies [a9318bd]
- Updated dependencies [0b0a75d]
  - @pikku/core@0.12.145
  - @pikku/inspector@0.12.109

## 0.12.3

### Patch Changes

- bca0f10: `pikku validate` no longer fails a fresh starter template. The core-import rule now points `@pikku/core/flag` at `#pikku/scopes` and `@pikku/core/analytics` at `#pikku/analytics` (the scopes leaf also re-exports the `DeclaredFlag` type), and the component literal-string rule ignores strings inside class builders such as `cva`, `cn` and `clsx`, so a variant like `heading: 'font-heading text-xl'` is no longer read as text to translate.
- Updated dependencies [bca0f10]
  - @pikku/inspector@0.12.108

## 0.12.2

### Patch Changes

- c7ce9f9: Stop building and shipping the darwin-x64 pikku-inspect binary. Intel Macs are no longer a supported host, and that target was the slowest cross-compile in the release.

## 0.12.1

### Patch Changes

- 8bd70db: Printed unions now list their members alphabetically, with `null` and `undefined` last, in both inspectors. A union's order used to follow which file the type checker reached first, so it could differ between Node and Bun, and between the TypeScript and native inspectors, and with it the generated schema's `enum` and the function's contract hash. CLI `choices` taken from a union of string literals are sorted the same way; an `enum` keeps its declaration order.

  The first codegen after upgrading reorders those unions once. A function whose input or output is an inline union that was not already in this order gets a new contract hash, so a `versions.pikku.json` that recorded the old one reports it as modified.

- ffb53f2: The CLI can inspect with a native engine: the `pikku-inspect` binary from `@pikku/inspector-go`, built on typescript-go (TypeScript 7). It is the default, and generates output identical to the TypeScript inspector (`@pikku/inspector`, TypeScript 6 compiler API). Choose the TypeScript one with `"inspector": "typescript"` in `pikku.config.json`, `--inspector typescript`, or `PIKKU_INSPECTOR=typescript`. The flag beats the environment variable, which beats the config key. Any other value is rejected, including the old `PIKKU_INSPECTOR=go`; use `native`.

  When no engine is chosen and no `pikku-inspect` binary exists for the platform, the CLI warns and uses the TypeScript engine. An explicit `native` with no binary stops with an error that names the TypeScript engine. The codegen child that `pikku dev` and watch mode start inherits the parent's engine.

- 8325c75: The native inspector identifies pikku helpers by what their callee resolves to, as the TypeScript inspector does, so `import { addTagMiddleware as guard }` and `mw.addTagMiddleware(...)` register their middleware (and aliased `pikkuFunc`, `pikkuPermission`, `pikkuBetterAuth` calls are seen). A channel's unexported `onConnect`/`onDisconnect` handler gets its function metadata, so its contract is recorded.

  A middleware or permission helper passed around as a value is reported as PKU577, as in the TypeScript inspector, rather than generating an app whose gate never runs.

  A CLI option's choices derived from a string-literal union come out in the TypeScript inspector's order (type-id order) instead of typescript-go's value order.

- 10f98d3: The package description no longer calls the native engine opt-in; it is the CLI's default.
- ffc0fa4: Port the shared finalize pass (post-processing, HTTP route auth, and the exposed-gate, tag-middleware and single-step-workflow validators) to Go behind `pikku-inspect inspect --stdin --finalize`; the protocol carries the validation-pass bracket, which the wrapper replays.
- 832eda5: Ship `pikku-inspect` prebuilt inside `@pikku/inspector-go`: the static binaries for darwin-arm64, darwin-x64, linux-x64, linux-arm64 and win32-x64 sit under `prebuilt/<platform>-<arch>/`, and the host's is picked at runtime. There are no per-platform packages or optional dependencies, so a lockfile from any platform installs it everywhere. A missing binary fails with the platform and `PIKKU_INSPECTOR_GO_BIN` named.
- bdb67e5: `pikku-inspect` frees the analysis program before generating schemas, so its peak memory no longer includes the analysis checker, the schema program and the Zod conversion process at once. On a mid-sized app the binary's peak fell from about 460 MB to about 270 MB, and to about 60 MB while Zod schemas convert. Output is unchanged.
- 6bdfd67: The Go inspector prints unions and mapped-type properties in the same order as the TypeScript inspector, so schema `enum` and `required` arrays, and the contract hashes built from them, match.
- ef17c47: Split `inspect()` into `analyzeProgram()` (engine-specific, needs the checker) and `finalizeInspectorState()` (shared, checker-free, served typescript-free from `@pikku/inspector/finalize`). The serialized inspector state now carries every field finalize reads, so a state produced by another engine can be finalized identically.

  Add `@pikku/inspector-go`, which runs analysis in the `pikku-inspect` binary over the `--stdin` JSON protocol and finalizes the result, plus a parity harness that diffs it against the TypeScript inspector. The CLI chooses between the two engines as described in the inspector-engine changeset.

- b9df997: The native inspector converts Zod schemas to JSON Schema without Node: `pikku-inspect` bundles the modules that declare them with the project's own zod and runs the conversion in an embedded QuickJS. A schema built from a value imported from a package, or declared in a module that only loads under Node, is converted by Node when it is on the PATH and is otherwise an error naming the package. `pikku-inspect` is also found beside a compiled `pikku`, and the Homebrew cask installs it there. `PIKKU_INSPECTOR_ZOD=node` sends every schema to Node.
- 94676e4: The native inspector records `addGlobalPermission` registrations in `permissions.global` the way `@pikku/inspector` does (#2148): inline permissions are named after where they sit, a const or imported argument is followed to its literal, an exported zero-argument factory is recorded by name, and a call nothing runs is warned about rather than recorded. What global permissions and global middleware use counts toward `requiredServices`.
- 6a16989: The native inspector mounts the routes of `refHTTP('ns:contract')` (optionally with `{ basePath }`) from the addon's published HTTP contracts, as `@pikku/inspector` does; before, an app wiring an addon's routes this way got no routes from native codegen. Addon MCP tools are written with the TypeScript inspector's key order, so `pikku-mcp-wirings-meta.gen.json` is byte-identical between the engines.
- Updated dependencies [3a9c9d8]
- Updated dependencies [dc952a8]
- Updated dependencies [7e44a0c]
- Updated dependencies [8bd70db]
- Updated dependencies [6a9488c]
- Updated dependencies [46e2c7e]
- Updated dependencies [a0ae9bb]
- Updated dependencies [8ec91f0]
- Updated dependencies [ffbe1a2]
- Updated dependencies [9999ec1]
- Updated dependencies [228faad]
- Updated dependencies [84de1eb]
- Updated dependencies [e659614]
- Updated dependencies [6c79f8d]
- Updated dependencies [fa308d4]
- Updated dependencies [802076e]
- Updated dependencies [1112955]
- Updated dependencies [0a4676a]
- Updated dependencies [674af8a]
- Updated dependencies [135811c]
- Updated dependencies [2e05e48]
- Updated dependencies [a8eb397]
- Updated dependencies [ef17c47]
- Updated dependencies [6d8a949]
- Updated dependencies [927210d]
- Updated dependencies [19895c4]
- Updated dependencies [a88391a]
- Updated dependencies [3df9013]
  - @pikku/core@0.12.144
  - @pikku/inspector@0.12.107
