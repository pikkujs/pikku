# @pikku/deploy

## 0.12.4

### Patch Changes

- 3d75643: Run the app's server lifecycle in generated entries, and make an out-of-band
  account signable-in.

  `pikkuServerLifecycle` was only ever called by `pikku dev` and `pikku serve`, so
  an app that seeds its first admin account, probes a dependency, or warms a cache
  in `beforeStart` did all of that in development and silently skipped it
  everywhere it was actually deployed. The standalone entry and the shared node
  server entry — the one behind every `target: 'server'` unit — now import the
  app's lifecycle and call it: `beforeStart` after `init` and before the port
  opens, so work that must finish before the first request has, `afterStart` once
  the server is listening, and the stop hooks handed to the signal handler that
  already owns shutdown rather than a second listener racing it. Each shutdown
  step is isolated from the ones after it, so a hook that throws is logged without
  taking the service teardown and the socket close down with it.

  Separately, `createAuthUser` and `setAuthUserPassword` wrote credential accounts
  with no `issuer`. From better-auth 1.7 a credential account is matched by its
  issuer as well as its provider, so those accounts were invisible to sign-in,
  `updatePassword` and `findCredentialAccount` — a user who plainly existed in the
  table was reported as "user not found". The field is written only when the
  resolved schema has it, so older better-auth keeps working, and
  `setAuthUserPassword` repairs an account that predates the fix.

- 3d75643: Give a standalone artifact the database connection every other provider's runtime hands it.

  `createSingletonServices` receives `kysely` from whatever is hosting the app —
  `pikku dev` builds one, a Cloudflare deploy binds one — so app code is written
  expecting it, and the generated templates throw outright when it is absent. The
  standalone provider is its own host and supplied nothing, so a bundle built from
  a project with a database started, called the services factory, and died on the
  first line of it. The artifact was only ever startable by projects that had no
  database at all, which is not the case the provider exists to serve.

  The generated entry now opens the database itself and passes `kysely` in.
  `EntryGenerationContext` carries a `db` descriptor, and the engine is read from
  the migrations directory the project actually wrote — `db/sqlite` or
  `db/postgres`, the same two conventions the migrator emits to. Having both is
  refused rather than resolved: choosing on directory order would choose which
  database the deployed app talks to, and an app running happily against the
  wrong but entirely valid schema is invisible until someone reads the data.

  For SQLite the adapter emits the dialect its runtime can actually use —
  `@pikku/kysely-node-sqlite` for the node bundle, `@pikku/kysely-bun-sqlite` for a
  compiled bun binary, which has no `node:sqlite` to reach for. For Postgres it
  emits `PikkuKysely` from `@pikku/kysely-postgres`, connected from `DATABASE_URL`,
  the same variable every other pikku host reads, so an artifact dropped onto a
  machine already running a pikku app needs no new one. An unset `DATABASE_URL`
  fails by name rather than as a driver error about an undefined connection
  string.

  The connection pool is closed on shutdown, in `afterStop` — after the app's own
  stop hook and the draining server have both finished with it, since a pool
  closed any earlier takes the queries they are still entitled to make down with
  it. SQLite needs no counterpart: the process exiting releases the file.

  The project's generated coercion map is applied to either engine, so a deployed
  app and `pikku dev` agree about which columns are dates and which are booleans.
  It is attached when the project generated one and skipped when it did not — the
  map is built from `db/annotations.ts` rather than from the dialect, so an app
  that annotates no columns is one with nothing to coerce rather than one that
  should be handed no database at all.

  A SQLite file is located by `PIKKU_DATA_DIR` rather than derived from the bundle's
  own path: a deploy that swaps the release directory would otherwise take the
  database with it. `PIKKU_DATABASE_FILE` overrides it outright, for when the path
  has to match one something else already chose — notably `pikku db migrate`,
  which has to open the same file or the app runs against an unmigrated schema.
  Neither being set fails with the variable's name rather than as a SQLite error
  about a path of `undefined`.

## 0.12.3

### Patch Changes

- 8852a75: Register an agent invoked from a function body in the calling deployment unit.

  `runAgent('houseAssistant', ...)` and `rpc.agent.run('houseAssistant', ...)` resolve against the in-process agent registry, but the deploy analyzer only ever put an agent's registration in its own `agent-*` unit. A function calling one landed in a separate unit whose bootstrap never registered it, so the deployed worker threw `AI agent not found: houseAssistant`.

  The inspector now records a string-literal agent name passed to `runAgent` / `streamAgent` / `rpc.agent.run` / `rpc.agent.stream` in a function body under `agents.invokedAgentsByFile`, mirroring what it already does for `rpc.invoke` targets. The analyzer carries those names on the calling unit as `invokedAgents` and adds the `ai-model` / `ai-storage` service requirements, and per-unit codegen puts the agent — and its tools — into that unit's filter names so its wiring is generated there too. A dynamic (template-literal) agent name is warned about, as it is for `rpc.invoke`.

## 0.12.2

### Patch Changes

- 80eb5c0: Generate a desktop shell from `pikku deploy apply --desktop`

  `pikku deploy apply --provider standalone --runtime bun --desktop` now emits a
  `src-tauri/` crate that ships the compiled binary as a sidecar and opens a
  window on the server's own HTTP origin, so cookies, CORS and OAuth behave
  exactly as they do in a browser. Regeneration is idempotent and leaves an
  edited file alone rather than overwriting it.

  `--desktop-url https://app.example.com` builds the other shape: a shell that
  points at an already-deployed server. Nothing is bundled — no sidecar, no
  binary, and so no bun runtime to compile one — and the window is declared in
  `tauri.conf.json` rather than opened from Rust, because the origin is known up
  front. The url can also live in `pikku.config.json` as `deploy.desktop.url`,
  alongside `deploy.desktop.identifier`.

  Supporting changes: `SERVER_READY_MARKER` moved to `@pikku/deploy` (the CLI
  re-exports it from its old path), both HTTP runtimes expose the port they
  actually bound so `--port 0` reports a real port, and the generated server
  entry exits when its parent process goes away.

- 80eb5c0: feat: serve a built frontend from the pikku server's own origin

  A new `frontend` key in `pikku.config.json` names a directory of built
  frontend output. `pikku serve` mounts it, and `pikku deploy` ships it inside
  the distributable — into a directory beside the bundle for the node runtime,
  and embedded in the binary for a `bun build --compile` standalone. `pikku dev`
  deliberately ignores it and says so, because the frontend's own dev server owns
  that job.

  Pikku reads the frontend's output and never builds it, so an unbuilt directory
  fails with a message that says which build to run rather than booting a server
  that answers every page with a 404.

## 0.12.1

### Patch Changes

- 32616af: Give the deploy pipeline one shared contract instead of a copy per adapter

  `DeploymentManifest`, `DeploymentUnit`, `EntryGenerationContext` and
  `ProviderAdapter` were hand-copied into eleven source files across the four
  provider adapters and the CLI — three copies inside `@pikku/deploy-cloudflare`
  alone. Nothing compared the copies, so they had already drifted: several typed
  `role` as a bare `string`, and none carried the manifest's addon-scoping fields.

  They now live in a new zero-dependency `@pikku/deploy` package that every
  adapter and the CLI import, and each adapter declares `implements
ProviderAdapter` so the compiler checks it against the contract it claims to
  satisfy. That check immediately caught a real disagreement: the deploy result's
  `workersDeployed` and `resourcesCreated` were `string[]` from Cloudflare — the
  shape the result file and the generated SDK types already record — but
  `Array<{ name: string }>` from the standalone adapter. Both are now `string[]`.

  The Lambda and Azure adapters also derived their esbuild externals from a
  hand-written list of 25 node builtins, so anything outside it (`async_hooks`,
  `perf_hooks`, `timers`, `http2`, …) was bundled instead of resolved from the
  runtime. They now use `nodeBuiltinExternals()`, which reads `builtinModules`
  from the running Node and cannot fall behind it.
