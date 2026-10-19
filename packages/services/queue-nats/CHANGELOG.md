# @pikku/queue-nats

## 0.12.4

### Patch Changes

- c2314ca: Separate the mesh from remote addons, make addon `expose` opt-in, and stop passing remote addon errors through.

  **Breaking — the mesh is renamed.** `PIKKU_REMOTE_SECRET` → `PIKKU_MESH_SECRET`, `POST /remote/rpc/:rpcName` → `POST /mesh/rpc/:rpcName`, `rpc.remote()` → `rpc.mesh()`, `pikkuRemoteAuthMiddleware` → `pikkuMeshAuthMiddleware`, `@pikku/core/remote` (`buildRemoteHeaders`) → `@pikku/core/mesh` (`buildMeshHeaders`), `pikku enable remote-rpc` / `scaffold.remoteRpc` → `pikku enable mesh-rpc` / `scaffold.meshRpc`, and the queue `pikku-remote-internal-rpc` → `pikku-mesh-rpc`. Mesh tokens now use audience `pikku-mesh` and HKDF info `pikku:mesh-session`, so every unit of a split deploy must be released together. `remote: true` on a function is unchanged.

  **Breaking — `wireAddon({ expose })` is opt-in.** Installing an addon no longer puts its `expose: true` functions on `POST /rpc`. `expose: true` on the wiring opens them, a list opens the named ones, and a list can no longer open a function the addon did not declare `expose: true` (PKU343). The "exposed function has no gate" warning moves from the addon's own build to the app that opts in. OpenAPI-generated addons now declare every operation `expose: true`, so their install-time lists keep working.

  **Breaking — `wireRemoteAddon` uses the host's public RPC route.** Calls go to `{serverUrl}/rpc/<fn>` with `{ rpcName, data }` and `x-pikku-remote-contract: 1`; a host answers such a call only for functions that are `expose: true` and `remote: true`. `wireRemoteAddon` gains `expose` (forwarded from `rpc.exposed`, after the caller's `addonMayReach` check), `timeoutMs` (default 30s) and a `headers` hook. `RemoteAddonRequestError` is removed: a registered `PikkuError` named by a 4xx is rebuilt with its status and message, any other 4xx becomes the standard error for its status without the body, and a 5xx, network failure or unreadable body becomes `RemoteAddonFailedError` (502) and is logged on the consumer. A timeout is `RemoteAddonTimeoutError` (504).

- Updated dependencies [c416188]
- Updated dependencies [c2314ca]
- Updated dependencies [bf1b54c]
- Updated dependencies [6fe33e9]
  - @pikku/core@0.12.146

## 0.12.3

### Patch Changes

- 19895c4: Every publishable package now ships only what it needs,, as `@pikku/core` does:

  - A `files` allow-list: `dist` (and `@pikku/aws-services`' `scripts`), plus the `README.md`, `LICENSE` and `package.json` npm always includes. Tarballs no longer carry `knowledge/`, `run-tests.sh`, test fixtures, stray `src/` files, the CHANGELOG or `tsconfig.tsbuildinfo`.
  - `build` deletes `dist/` and `tsconfig.tsbuildinfo` first (`bun run clean`), so a local publish can no longer ship modules whose sources were deleted.
  - `./package.json` is exported, so `import pkg from '@pikku/<name>/package.json'` resolves under an `exports` map.

- Updated dependencies [3a9c9d8]
- Updated dependencies [dc952a8]
- Updated dependencies [7e44a0c]
- Updated dependencies [8ec91f0]
- Updated dependencies [ffbe1a2]
- Updated dependencies [9999ec1]
- Updated dependencies [228faad]
- Updated dependencies [84de1eb]
- Updated dependencies [e659614]
- Updated dependencies [6c79f8d]
- Updated dependencies [fa308d4]
- Updated dependencies [0a4676a]
- Updated dependencies [674af8a]
- Updated dependencies [135811c]
- Updated dependencies [2e05e48]
- Updated dependencies [a88391a]
- Updated dependencies [3df9013]
  - @pikku/core@0.12.144

## 0.12.2

### Patch Changes

- 4c7a1b5: Run the monorepo's own scripts through bun instead of yarn. What moves is the
  package manager each package's `prepublishOnly` and build scripts invoke, plus
  the two manifest fixes bun needs to resolve the tree: `uWebSockets.js` is
  declared with an explicit `github:` specifier, and `@pikku/uws-handler` marks
  its `uWebSockets.js` peer optional so a bun install of a consumer that brings
  its own uWS app does not try to fetch it from the registry.

  Three published behaviours change, all of them cases where an isolated
  `node_modules` or bun as the runtime had been papered over by yarn's hoisting:

  - `@pikku/migrator-sql` turns foreign keys on when it opens a sqlite database
    through bun. `node:sqlite` enforces them by default and `bun:sqlite` does not,
    which silently turned every `ON DELETE CASCADE` into a no-op under
    `bunx --bun pikku`.
  - `@pikku/cli` resolves a deploy provider against the project being deployed
    rather than against wherever the CLI itself is installed, which is what its
    own "is not installed" error asks the user to arrange.
  - `@pikku/cli` treats a specifier a runtime hands straight back — bun does this
    for the modules it implements itself — as not resolved from the project, so
    it falls back rather than loading the runtime's own copy.

- Updated dependencies [4c7a1b5]
  - @pikku/core@0.12.108

## 0.12.1

### Patch Changes

- 427c4fe: **`@pikku/queue-nats`** — NATS JetStream queue, worker and scheduler services, alongside the pg-boss and bullmq adapters. Jobs publish to a work-queue stream, each queue gets its own durable pull consumer, and `max_ack_pending` is real per-message concurrency rather than a batch size, so a slow job occupies one slot instead of holding its batch siblings. The per-job retry policy travels in headers because JetStream's `max_deliver` is per-consumer and cannot express a step marked "never retry", and `ack_wait` is always set to pg-boss's 900s parity rather than left to the server's 30s default — unset, any job running longer than 30s is redelivered while it is still running and executed twice. Cron and one-shot delays use the server's own message scheduler, so a schedule is a retained message on a reserved subject: publishing registers it, republishing replaces it, purging cancels it. That needs a server on 2.14+, and `NatsServiceFactory` refuses to start against anything older rather than silently not scheduling. `supportsResults` is `false`, deliberately — a work-queue stream deletes a message on ack, so there is nowhere for a job result or any job history to live, and per-job outcomes come from telemetry instead.
- Updated dependencies [1ab831e]
  - @pikku/core@0.12.105
