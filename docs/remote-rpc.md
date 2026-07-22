# Remote RPC — the mesh vs. `wireRemoteAddon`

The word **"remote"** shows up in three subtly different places in pikku. They
are _not_ duplicates — they are two transports over a single idea plus one
convenience method — but the shared name causes confusion, so this document
pins down exactly what each one is, when it runs, and how to reason about them.

## The one idea: `remote: true`

A function flagged `remote: true` is **invocable out-of-process** — something
outside this runtime may call it by name.

```ts
export const getOpenApi = pikkuSessionlessFunc({
  remote: true,
  func: async (_services, { name }) => {
    /* ... */
  },
})
```

That single flag drives two very different transports:

|                 | **Mesh** (deploymentService)                                                                                        | **`wireRemoteAddon`** (HTTP)                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Who calls it    | your own gateways, `rpc.remote()`, and the `rpc.invoke()` fallback                                                  | a consumer's `rpc('ns:fn')`                                                                    |
| What it targets | **your own** worker/lambda — _same app_, split across units                                                         | a **hosted addon package** — _different app_                                                   |
| Transport       | service binding (`env.X.fetch()`), Lambda invoke, Azure, or a queue                                                 | plain HTTPS `POST`                                                                             |
| Auth            | **trust**: `PIKKU_REMOTE_SECRET`-signed JWT with the session encrypted in the payload (`pikkuRemoteAuthMiddleware`) | **client**: a bearer token the consumer binds from a credential/secret; the addon validates it |
| Endpoint        | `POST /remote/rpc/:rpcName`                                                                                         | `POST {serverUrl}/remote/rpc/:rpcName`                                                         |
| Wired by        | `pikku enable remote-rpc` (mesh mode)                                                                               | `wireRemoteAddon` on the consumer (host-serving is a follow-up — see below)                    |

Both target the same `POST /remote/rpc/:rpcName` shape. Today the only generated
handler (`serialize-remote-rpc.ts`) is the **mesh** one, gated by
`pikkuRemoteAuthMiddleware` (a `PIKKU_REMOTE_SECRET`-signed JWT). This PR ships the
**consumer** side of `wireRemoteAddon` — the typed dispatch, the `.remote.gen` map,
and the dev-dependency/auth validation. Serving a public, client-authenticated
remote surface on the host (a distinct route/auth that never hijacks the trusted
mesh handler) is a separate follow-up landed alongside the fabric registry
integration — it is intentionally _not_ folded into the mesh handler here.

## The three call forms

```
rpc.invoke('fn', data)   local-first — runs 'fn' locally if it exists here,
                         otherwise falls back to deploymentService.invoke
rpc.remote('fn', data)   force-remote — always deploymentService.invoke,
                         throws if no deploymentService is configured
rpc('ns:fn', data)       wireRemoteAddon — dispatches over HTTP to the host
                         at the namespace's serverUrl, as an authenticated client
```

`invoke` vs `remote` matter when a function is bundled into more than one unit:
`invoke` runs your local copy; `remote` forces the call out to the authoritative
unit. This is why the framework's own gateways (agent, MCP, channel, workflow
orchestrator) call `rpc.remote()` — they must dispatch to the _function's_ worker,
not a local shadow.

## Why a Cloudflare deploy _is_ the mesh

On Cloudflare, `pikku deploy plan` can split an app so each function is its own
Worker. Gateways reach those functions through `CloudflareDeploymentService`:

```ts
// packages/runtimes/cloudflare/src/cloudflare-deployment-service.ts
const request = new Request(
  `http://internal/remote/rpc/${encodeURIComponent(funcName)}`,
  { method: 'POST', headers, body: JSON.stringify({ data }) }
)
const response = await binding.fetch(request) // env.FUNC_WORKER.fetch() — free, ~0ms, internal
```

`headers.Authorization` is a `PIKKU_REMOTE_SECRET`-signed JWT
(`aud: 'pikku-remote'`, session encrypted) — i.e. exactly the mesh. So a
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
  package: '@pikkufabric/addon-registry', // devDependency
  serverUrl: (services) => services.variables.get('FABRIC_API_URL'),
  auth: { credentialId: 'fabricRegistryToken' }, // see below; omit if public
})

// fully typed against the addon's `.remote.gen` map:
const api = await rpc('registry:getOpenApi', { name: 'stripe' })
```

Auth binds the addon's requirement to a **local** source; the token is sent
`Authorization: Bearer <token>`:

```ts
type RemoteAddonAuth =
  | { credentialId: string } // per-user  → wire.getCredential(id), scoped to pikkuUserId
  | { secretId: string } // platform  → secrets.getSecret(id)
  | { resolve: (services, wire) => string | Promise<string> } // custom
// omit `auth` entirely when the addon's remote surface is public
```

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
| `PKU339` | a bound `auth.credentialId` / `auth.secretId` must reference a credential/secret the consumer actually wires.                                                                                   |

`wireRemoteAddon` is also banned _inside_ an addon package (addons declare
contracts and export functions; the consuming app does the wiring).

## Key files

| File                                                                | Responsibility                                                                      |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `packages/core/src/wirings/rpc/wire-remote-addon.ts`                | the `wireRemoteAddon` primitive + `RemoteAddonAuth`                                 |
| `packages/core/src/wirings/rpc/rpc-runner.ts`                       | `invokeAddonFunction` → `invokeRemoteAddonFunction` (HTTP dispatch); `rpc.remote()` |
| `packages/core/src/wirings/rpc/remote-addon-auth.ts`                | `resolveRemoteAddonToken` (credential/secret/custom; fails closed)                  |
| `packages/core/src/middleware/remote-auth.ts`                       | `pikkuRemoteAuthMiddleware` — the **mesh** trust gate                               |
| `packages/runtimes/*/src/*-deployment-service.ts`                   | per-runtime `deploymentService.invoke` (service binding / lambda / queue)           |
| `packages/cli/src/functions/wirings/rpc/serialize-remote-rpc.ts`    | the generated **mesh** `/remote/rpc/:rpcName` handler (`pikkuRemoteAuthMiddleware`) |
| `packages/cli/src/functions/wirings/rpc/serialize-typed-rpc-map.ts` | picks `.remote.gen` vs `.internal.gen` per addon namespace                          |
| `packages/inspector/src/utils/post-process.ts`                      | `validateRemoteAddonDependencies` (PKU338) + `validateRemoteAddonAuth` (PKU339)     |
