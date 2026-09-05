# @pikku/deploy-standalone

## 0.12.18

### Patch Changes

- 265df92: Lift `PlatformServiceContributor` into `@pikku/deploy` so any provider adapter
  can accept the same service contributors.

  A contributor now declares the binding sources its emitted code reads from
  (`requires`, defaulting to `env`). An adapter that cannot provide one of them
  refuses the contributor by name at construction instead of silently emitting
  code that reads bindings the runtime never has.

  `@pikku/deploy-cloudflare` keeps its entry output unchanged and re-exports the
  type from the core package. The container entry it generates now runs only the
  contributors that live on `env`. `@pikku/deploy-standalone` gains a
  `contributors` option: both the node and bun entries build the contributed
  services from `process.env` and spread them last into
  `createSingletonServices`, so a contributed service overrides the in-process
  default.

- Updated dependencies [265df92]
  - @pikku/deploy@0.12.6

## 0.12.17

### Patch Changes

- b2e038b: Rename `@pikku/sql-migrator` to `@pikku/migrator-sql`, so a future migrator for
  another store sorts beside it rather than under a second prefix. The package has
  never been published under either name, so nothing depends on the old one.
- Updated dependencies [b2e038b]
  - @pikku/migrator-sql@0.12.3

## 0.12.16

### Patch Changes

- f970f8f: Rename `@pikku/db-migrator` to `@pikku/migrator-sql`.

  It applies `.sql` files and keeps their bookkeeping; it is not a database
  service, and `db-` read as though it were one. Nothing was ever published under
  the old name, so there is no alias to keep.

- Updated dependencies [f970f8f]
  - @pikku/migrator-sql@0.12.2

## 0.12.15

### Patch Changes

- a057bec: Give a standalone bundle a command line.

  An operator holding a standalone artifact on a machine had one thing they could
  do with it: start it. Applying the migrations it needs meant a checkout of the
  project and a second copy of the CLI on a production box, and answering "which
  build is this" meant asking whoever ran the deploy.

  The bundle now takes a command. `serve` remains the default, so an existing
  `node bundle.js` is unchanged. `version` prints the version the project declared
  at build time. `db migrate` and `db status` apply and report the migrations that
  now ship beside the bundle under `db/<engine>/` — the same path Fabric's build
  container stages them to, so the two producers of an artifact cannot disagree
  about where the SQL lives. `backup <path>` writes a consistent copy of a SQLite
  database with `VACUUM INTO`; on postgres it refuses and names `pg_dump`, which
  is the tool for it.

  Both engines are supported: a postgres build migrates over the connection it
  already opens. `PostgresMigrationClient` grew an optional `begin`, because a
  pooled client is free to answer `BEGIN`, the migration and `COMMIT` on three
  different connections — which leaves a failed migration half applied with
  nothing to roll back.

  There is deliberately no way to invoke an RPC. A running server already answers
  them with auth, sessions and middleware applied; an in-process invoke would
  answer them with none of that.

- Updated dependencies [a057bec]
- Updated dependencies [a057bec]
  - @pikku/migrator-sql@0.12.1
  - @pikku/deploy@0.12.5

## 0.12.14

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

- Updated dependencies [3d75643]
- Updated dependencies [3d75643]
  - @pikku/deploy@0.12.4

## 0.12.13

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

- Updated dependencies [80eb5c0]
- Updated dependencies [80eb5c0]
  - @pikku/deploy@0.12.2

## 0.12.12

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

- Updated dependencies [32616af]
  - @pikku/deploy@0.12.1

## 0.12.11

### Patch Changes

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

- 6794681: Publish the ecosystem surface as per-area sub-barrels under `@pikku/core/ecosystem/*`, and point generated code, the CLI, the inspector and the runtime adapters at them.

  348 names that only generated code, the toolchain or a runtime adapter ever imports now have a second home on `@pikku/core/ecosystem/<area>` — one sub-barrel per area, matching how core already publishes its entrypoints, so no single barrel grows without bound and a consumer only pulls in the area it uses.

  This step is additive: every name is still exported from the entrypoint it was published from before, so nothing downstream breaks. Removing them from the app-facing barrels is a later change, and needs a release carrying `./ecosystem/*` first.

- 5e4105e: fix(ws): cap the frame size every Pikku-owned WebSocketServer accepts

  `ws` defaults `maxPayload` to 100MB, and every `WebSocketServer` Pikku
  constructed omitted the option — so each one inherited that ceiling. A single
  unauthenticated upgrade could make the process buffer a 100MB frame, which no
  Pikku message needs: the channel protocol carries JSON control frames, not bulk
  payloads.

  `@pikku/ws` now exports `DEFAULT_WS_MAX_PAYLOAD` (1MB), and the servers Pikku
  owns are constructed with it — the `pikku dev` / `pikku serve` runner, the entry
  `@pikku/deploy-standalone` emits, and the `ws` template. Refusal is already
  defined by the protocol, so an oversized frame is closed with 1009 (message too
  big) rather than buffered.

  A server that genuinely needs to accept a larger frame now has to set
  `maxPayload` explicitly at its construction site. `yarn check:ws-max-payload`
  enforces that, so a new server cannot silently fall back to the 100MB default.

## 0.12.10

### Patch Changes

- fd9d834: Stop publishing internals that only their own package or file used. The declarations stay; only the entrypoint re-export is removed, so nothing that imported a name from where it is declared is affected.

## 0.12.9

### Patch Changes

- e110c55: Add runtime scoring for AI agents: `pikkuAIScorer` for heuristic grades and
  `pikkuAIJudge` for LLM-judged ones, graded off the request path on two queue
  lanes so a slow judge cannot starve the cheap checks. Grades are sampled
  deterministically per `(run, scorer)` and persisted to `ai_run_score`.

## 0.12.8

### Patch Changes

- 637e668: State every package's license in the package itself.

  Eight publishable packages had no `license` field, `@pikku/aws-services` said `UNLICENSED` by accident, and no package carried a LICENSE file at all — the grant lived only in the repo root, which npm tarballs never include. Every publishable package now declares its license and ships the matching LICENSE file, and `yarn check:licenses` fails the release if the two ever disagree.

  `@pikku/console` is now explicitly BUSL-1.1 and named in the root LICENSE's Licensed Work alongside `@pikku/cli` and `@pikku/inspector`; the Additional Use Grant still permits production use for any purpose, including in free and open source software. Everything else — runtimes, services, clients, deploy adapters and the agent skills — is MIT, as the root LICENSE already said.

## 0.12.7

### Patch Changes

- 6f6abfe: Mount MCP on the bun runtime. `@pikku/bun-server` now accepts `mcpJson`/`mcpPath`
  options and serves the MCP endpoint (default `/mcp`) via a new fetch-native
  handler on `PikkuMCPServer.createFetchHandler()`, which uses the MCP SDK's
  Web-Standard (`Request`→`Response`) streamable-HTTP transport — no `node:http`
  req/res. The standalone `--runtime bun` entry now wires the same `mcpImport` +
  `mcpJson` option the node entry already used, so a bun standalone build serves
  `/mcp` with the project's tools/resources/prompts instead of silently dropping
  them. `@pikku/modelcontextprotocol` is an optional peer dep of `@pikku/bun-server`
  (only imported when `mcpJson` is non-empty).

## 0.12.6

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

## 0.12.5

### Patch Changes

- 04604fa: Mount /mcp in generated server/standalone entries when the unit has a non-empty mcp.gen.json. Previously only the dev server (`tsx src/server.ts`) mounted MCP; the deployed bundle (`pikku deploy plan`) never imported mcp.gen.json or passed `mcpJson` to `PikkuNodeHTTPServer`, so MCP tools/resources/prompts silently never served in production or standalone runtimes.

## 0.12.4

### Patch Changes

- e443e94: feat(deploy): standalone provider can target the bun runtime

  `pikku deploy plan|apply --provider standalone --runtime bun` now generates a
  `@pikku/bun-server` entry (native `Bun.serve` WebSockets, no `ws` package) and
  compiles the bundle into a single self-contained executable via
  `bun build --compile` — no runtime needed on the target host. The default
  remains `--runtime node`, which is unchanged (ships `bundle.js`, run with
  `node bundle.js`).

  `PikkuBunServer` now accepts an injectable `eventHub` in its options. Inject the
  same `BunEventHubService` you pass to `createSingletonServices` so functions and
  the WebSocket transport share one hub — otherwise a function's
  `eventHub.publish(...)` targets a different hub than the one holding the live
  sockets and broadcasts never reach connected clients. The standalone bun entry
  and the `bun` template now wire this shared hub, fixing cross-connection /
  cross-transport channel pub-sub on bun.

  Also removes the unused `@yao-pkg/pkg` dependency and its stale type shim from
  `@pikku/deploy-standalone` (the pkg-based binary path was dropped in #489).

## 0.12.3

### Patch Changes

- 9060165: Fix `@pikku/addon-graph` package exports so generated bootstrap files can be imported correctly. The Node.js HTTP server adapter is unified across dev, standalone, and container deployments. Next.js gains a worker-RPC transport. Date values in fetch responses now deserialise correctly.

## 0.12.2

### Patch Changes

- 5c98fd1: Switch standalone deploy from uWebSockets.js to Express + ws
  - Replace PikkuUWSServer with PikkuExpressServer in generated entry
  - Add WebSocket support via ws + pikkuWebsocketHandler
  - Remove pkg binary compilation — ship bundle.js directly
  - Remove native module (uws .node) handling
  - Add loadSchemas: false to avoid global state resolution issues
  - Add getHttpServer() to PikkuExpressServer for ws attachment

## 0.12.1

### Patch Changes

- 9104b68: Switch standalone deploy from uWebSockets.js to Express + ws
  - Replace PikkuUWSServer with PikkuExpressServer in generated entry
  - Add WebSocket support via ws + pikkuWebsocketHandler
  - Remove pkg binary compilation — ship bundle.js directly
  - Remove native module (uws .node) handling
  - Add loadSchemas: false to avoid global state resolution issues
  - Add getHttpServer() to PikkuExpressServer for ws attachment
