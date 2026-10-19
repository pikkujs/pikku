---
"@pikku/core": patch
"@pikku/cli": patch
"@pikku/inspector": patch
"@pikku/inspector-go": patch
"create-pikku": patch
"@pikku/openapi-parser": patch
"@pikku/skills": patch
"@pikku/lambda": patch
"@pikku/azure-functions": patch
"@pikku/cloudflare": patch
"@pikku/aws-services": patch
"@pikku/kysely": patch
"@pikku/mongodb": patch
"@pikku/queue-bullmq": patch
"@pikku/queue-nats": patch
"@pikku/queue-pg-boss": patch
"@pikku/redis": patch
"@pikku/addon-admin": patch
---

Separate the mesh from remote addons, make addon `expose` opt-in, and stop passing remote addon errors through.

**Breaking — the mesh is renamed.** `PIKKU_REMOTE_SECRET` → `PIKKU_MESH_SECRET`, `POST /remote/rpc/:rpcName` → `POST /mesh/rpc/:rpcName`, `rpc.remote()` → `rpc.mesh()`, `pikkuRemoteAuthMiddleware` → `pikkuMeshAuthMiddleware`, `@pikku/core/remote` (`buildRemoteHeaders`) → `@pikku/core/mesh` (`buildMeshHeaders`), `pikku enable remote-rpc` / `scaffold.remoteRpc` → `pikku enable mesh-rpc` / `scaffold.meshRpc`, and the queue `pikku-remote-internal-rpc` → `pikku-mesh-rpc`. Mesh tokens now use audience `pikku-mesh` and HKDF info `pikku:mesh-session`, so every unit of a split deploy must be released together. `remote: true` on a function is unchanged.

**Breaking — `wireAddon({ expose })` is opt-in.** Installing an addon no longer puts its `expose: true` functions on `POST /rpc`. `expose: true` on the wiring opens them, a list opens the named ones, and a list can no longer open a function the addon did not declare `expose: true` (PKU343). The "exposed function has no gate" warning moves from the addon's own build to the app that opts in. OpenAPI-generated addons now declare every operation `expose: true`, so their install-time lists keep working.

**Breaking — `wireRemoteAddon` uses the host's public RPC route.** Calls go to `{serverUrl}/rpc/<fn>` with `{ rpcName, data }` and `x-pikku-remote-contract: 1`; a host answers such a call only for functions that are `expose: true` and `remote: true`. `wireRemoteAddon` gains `expose` (forwarded from `rpc.exposed`, after the caller's `addonMayReach` check), `timeoutMs` (default 30s) and a `headers` hook. `RemoteAddonRequestError` is removed: a registered `PikkuError` named by a 4xx is rebuilt with its status and message, any other 4xx becomes the standard error for its status without the body, and a 5xx, network failure or unreadable body becomes `RemoteAddonFailedError` (502) and is logged on the consumer. A timeout is `RemoteAddonTimeoutError` (504).
