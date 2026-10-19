# The mesh vs. `wireRemoteAddon`

Two transports call a function out of process. They used to share the word
"remote" — `/remote/rpc`, `PIKKU_REMOTE_SECRET`, `rpc.remote()` — and that made
them look like one feature. They are not. The **mesh** is your own app split
across units, trusting each other. **`wireRemoteAddon`** is a client calling
somebody's hosted addon over its public RPC route. Everything mesh-side is now
named `mesh`; "remote" is left to remote addons.

## The flag: `remote: true`

A function flagged `remote: true` is **invocable out of process**.

```ts
export const getOpenApi = pikkuSessionlessFunc({
  expose: true,
  remote: true,
  func: async (_services, { name }) => {
    /* ... */
  },
})
```

The flag is read in two places, which is why it was not renamed:

- **the remote-addon contract** — `rpc.remoteMeta` and the `.remote.gen` map a
  `wireRemoteAddon` consumer imports, and the host's refusal of anything outside
  that contract (see below);
- **split deploys** — the deploy analyzer and per-unit codegen give a
  `remote: true` function a `/mesh/rpc/<fn>` route in its unit.

|                 | **Mesh** (deploymentService)                                                                                         | **`wireRemoteAddon`** (HTTP)                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Who calls it    | your own gateways, `rpc.mesh()`, and the `rpc.invoke()` fallback                                                     | a consumer's `rpc('ns:fn')`, and `rpc.exposed` when the wiring sets `expose`                  |
| What it targets | **your own** worker/lambda — _same app_, split across units                                                          | a **hosted addon** — _different app_                                                          |
| Transport       | service binding (`env.X.fetch()`), Lambda invoke, Azure, or a queue                                                  | plain HTTPS `POST`                                                                            |
| Auth            | **trust**: `PIKKU_MESH_SECRET`-signed JWT (`aud: 'pikku-mesh'`), session encrypted in it (`pikkuMeshAuthMiddleware`) | **client**: a bearer token the consumer binds from a credential/secret; the host validates it |
| Endpoint        | `POST /mesh/rpc/:rpcName`                                                                                            | `POST {serverUrl}/rpc/:rpcName` with `{ rpcName, data }` — the host's public RPC route        |
| Wired by        | `pikku enable mesh-rpc` (mesh mode)                                                                                  | `wireRemoteAddon` on the consumer; the host needs `scaffold.rpc`                              |

The two never share a handler: the mesh route only accepts mesh JWTs, and a
remote-addon call never carries one.

## The three call forms

```
rpc.invoke('fn', data)   local-first — runs 'fn' locally if it exists here,
                         otherwise falls back to deploymentService.invoke
rpc.mesh('fn', data)     always deploymentService.invoke,
                         throws if no deploymentService is configured
rpc('ns:fn', data)       wireRemoteAddon — dispatches over HTTP to the host
                         at the namespace's serverUrl, as an authenticated client
```

`invoke` vs `mesh` matter when a function is bundled into more than one unit:
`invoke` runs your local copy; `mesh` forces the call out to the authoritative
unit. This is why the framework's own gateways (agent, MCP, channel, workflow
orchestrator) call `rpc.mesh()` — they must dispatch to the _function's_ worker,
not a local shadow.

## Why a Cloudflare deploy _is_ the mesh

On Cloudflare, `pikku deploy plan` can split an app so each function is its own
Worker. Gateways reach those functions through `CloudflareDeploymentService`:

```ts
// packages/runtimes/cloudflare/src/cloudflare-deployment-service.ts
const request = new Request(
  `http://internal/mesh/rpc/${encodeURIComponent(funcName)}`,
  { method: 'POST', headers, body: JSON.stringify({ data }) }
)
const response = await binding.fetch(request) // env.FUNC_WORKER.fetch() — free, ~0ms, internal
```

`headers.Authorization` is a `PIKKU_MESH_SECRET`-signed JWT
(`aud: 'pikku-mesh'`, session encrypted) — i.e. exactly the mesh. So a
per-function Cloudflare (or Lambda, or Azure) deploy is the mesh with the
transport swapped from a public URL to a service binding. `deploymentService` is
implemented by the `cloudflare`, `aws-lambda`, and `azure-functions` runtimes and
by the `redis`, `mongodb`, and `kysely-mysql` services (queue-backed variants).

**Consequence:** the mesh is the backbone of serverless split deploys, not dead
code. `wireRemoteAddon` does not replace it — it targets a _published package at a
fixed `serverUrl` with client auth_, whereas the mesh routes to _your own workers_
with trust-based session forwarding. Different problems.

## `wireRemoteAddon` — consuming a hosted addon

Install the addon as a **devDependency** (types only — its handlers run on the
host) and wire it:

```ts
wireRemoteAddon({
  name: 'registry',
  package: '@acme/addon-registry', // devDependency
  serverUrl: (services) => services.variables.get('REGISTRY_API_URL'),
  auth: { credentialId: 'registryToken' }, // see below; omit if public
  expose: ['getOpenApi'], // optional: forward POST /rpc/registry:getOpenApi
  timeoutMs: 10_000, // optional, defaults to 30s
  headers: (services, wire) => ({ 'x-tenant': 'acme' }), // optional
})

// fully typed against the addon's `.remote.gen` map:
const api = await rpc('registry:getOpenApi', { name: 'stripe' })
```

### Versioned packages: an SDK instead of a devDependency

Put a version range in `package` and nothing needs installing. The literal is
read without running the file, so it has to be written inline:

```ts
wireRemoteAddon({
  name: 'cloudapi',
  package: '@pikkustudio/addon-cloud-api@^1.4.0',
  serverUrl: 'https://api.pikkustudio.app',
})
```

The first step of `pikku all` resolves the range
against the registry (`registry` in `pikku.config.json`, default
`https://registry.pikkustudio.app`), downloads the addon's SDK, checks its
sha512, and extracts it to `.pikku/remote/<name>@<version>/`. The version and
integrity go in `pikku-addons.lock`, which is committed; `.pikku/remote` is not.
With the lock and the files in agreement, a sync makes no network call. Codegen
imports the remote RPC, workflow and agent maps from the SDK, and
`pikku update` reports the SDK beside the npm packages, with the registry's
latest version and, when it is behind, the exact edit to make
(`src/addons/cloud.ts:12  change '@pikkustudio/addon-cloud-api@^1.4.0' to
'@pikkustudio/addon-cloud-api@^1.6.0'`). It never rewrites source: `--update`
updates package.json only, and the range is edited by hand. The next `pikku all`
resolves and locks it.

Auth binds the addon's requirement to a **local** source; the token is sent
`Authorization: Bearer <token>`:

```ts
type RemoteAddonAuth =
  | { credentialId: string } // per-user  → wire.getCredential(id), scoped to pikkuUserId
  | { secretId: string } // platform  → secrets.getSecret(id)
  | { resolve: (services, wire) => string | Promise<string> } // custom
// omit `auth` entirely when the addon's remote surface is public
```

### What goes over the wire

`rpc('registry:getOpenApi', data)` posts to `{serverUrl}/rpc/getOpenApi` with
the body `{ "rpcName": "getOpenApi", "data": … }` — the shape the host's
`/rpc/:rpcName` route and the generated fetch client already use. Every call
carries `x-pikku-remote-contract: 1`, and the host's `rpc.exposed` then answers
only functions that are `expose: true` **and** `remote: true`. A consumer
holding a token can never use it to reach the host's other exposed functions,
and the header can only narrow what the host answers.

So a host serves a function to remote-addon consumers by marking it
`expose: true, remote: true` and serving the public RPC route (`scaffold.rpc`).

### Versions

A host changes a remote contract by adding a version, never by editing one:
`pikku versions check` covers `remote: true` functions like any other, so a
changed contract without a bump fails. The old version keeps being served.

```ts
// host
export const listNotesV1 = pikkuSessionlessFunc({
  version: 1,
  remote: true,
  expose: true,
  output: NoteIds,
  func,
})
export const listNotes = pikkuSessionlessFunc({
  remote: true,
  expose: true,
  output: NoteRows,
  func,
}) // v2
```

`pikku sdk` records each contract function's `versions` and `latestVersion` in
the SDK's function meta, and the remote map types both `listNotes` and every
`listNotes@vN`. On the consumer:

- `rpc('notes:listNotes@v1', …)` posts `/rpc/listNotes@v1`, unchanged;
- `rpc('notes:listNotes', …)` posts the newest version **in the consumer's
  SDK** (`/rpc/listNotes@v2`), never whatever the host has added since. Codegen
  registers that default in the rpc meta file. A function the addon never
  versioned keeps its bare name.

A version the host no longer serves is a 404 `RPCNotFoundError` saying so, and
that the SDK needs updating; the host never answers it with its latest. With
`--bump-from`, `pikku sdk` reads the previous SDK's schemas: a contract loosened
in place is minor, tightened is major, a new version beside the old one is
minor, and a dropped version is major.

### Exposing it from the consumer

`expose` works as it does on `wireAddon`: off by default, `true` forwards every
contract function, a list only those named. The forward runs inside
`rpc.exposed`, after the caller's `addonMayReach` check, so an addon calling
`/rpc` can reach a remote addon only through its `uses`. Server-side
`rpc('ns:fn')` is never affected by `expose`.

### Errors

The host's body is never passed through as text:

| Host answers                                   | Consumer throws                                           |
| ---------------------------------------------- | --------------------------------------------------------- |
| 4xx naming a `PikkuError` registered here      | that error class, with the host's status and message      |
| any other 4xx, or an unreadable body           | the standard error for that status, with no upstream text |
| 5xx, a network failure or an unreadable result | `RemoteAddonFailedError` (502), the detail logged locally |
| no answer within `timeoutMs`                   | `RemoteAddonTimeoutError` (504)                           |

### Codegen

`remote: true` functions feed a **third** RPC map alongside `internal`/`exposed`:

```
inspector: rpc.remoteMeta ← functions flagged remote: true
   │  pikkuRPCRemoteMap
   ▼
<pkg>/.pikku/rpc/pikku-rpc-wirings-map.remote.gen.d.ts   ← only the remote surface
   │  a wireRemoteAddon consumer imports THIS (not .internal.gen)
   ▼
rpc('registry:getOpenApi') is typed
```

### Validation (`pikku` / verify)

| Code     | Rule                                                                                                                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PKU338` | a `wireRemoteAddon` package must be in **`devDependencies`** (types only) — not `dependencies`, not missing. This is the mirror image of `wireAddon`, which _requires_ a production dependency. |
| `PKU338` | (versioned `package`) the SDK under `.pikku/remote` must match `pikku-addons.lock` for that range — run `pikku all`. No devDependency is needed.                                                |
| `PKU350` | `package` must be a string literal, so the range can be read without running the file.                                                                                                          |
| `PKU351` | (warning, `pikku all`; `pikku update` lists it as a peer finding) the SDK's `manifest.pikkuCore` does not cover the installed `@pikku/core`.                                                    |
| `PKU352` | (`pikku all`) the downloaded tarball's sha512 does not match the registry's or the lock's; nothing is installed.                                                                                |
| `PKU353` | `package` is not a valid spec: a trailing `@` with no range, a range semver cannot read, or one package wired at two ranges.                                                                    |
| `PKU339` | a bound `auth.credentialId` / `auth.secretId` must reference a credential/secret the consumer actually wires.                                                                                   |

`wireRemoteAddon` is also banned _inside_ an addon package (addons declare
contracts and export functions; the consuming app does the wiring).

## Key files

| File                                                                | Responsibility                                                                     |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `packages/core/src/wirings/addon/wire-remote-addon.ts`              | the `wireRemoteAddon` primitive, `RemoteAddonAuth`, `REMOTE_CONTRACT_HEADER`       |
| `packages/core/src/wirings/rpc/rpc-runner.ts`                       | `executeAddonFunction` → `invokeRemoteAddonFunction` (HTTP dispatch); `rpc.mesh()` |
| `packages/core/src/wirings/addon/remote-addon-auth.ts`              | `resolveRemoteAddonToken` (credential/secret/custom; fails closed)                 |
| `packages/core/src/middleware/mesh-auth.ts`                         | `pikkuMeshAuthMiddleware` — the **mesh** trust gate                                |
| `packages/runtimes/*/src/*-deployment-service.ts`                   | per-runtime `deploymentService.invoke` (service binding / lambda / queue)          |
| `packages/cli/src/functions/wirings/rpc/serialize-mesh-rpc.ts`      | the generated **mesh** `/mesh/rpc/:rpcName` handler (`pikkuMeshAuthMiddleware`)    |
| `packages/cli/src/functions/wirings/rpc/serialize-typed-rpc-map.ts` | picks `.remote.gen` vs `.internal.gen` per addon namespace                         |
| `packages/inspector/src/utils/post-process.ts`                      | `validateRemoteAddonDependencies` (PKU338) + `validateRemoteAddonAuth` (PKU339)    |
