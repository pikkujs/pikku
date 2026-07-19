# Remote RPC — the mesh vs. `wireRemoteAddon`

The word **"remote"** shows up in three subtly different places in pikku. They
are *not* duplicates — they are two transports over a single idea plus one
convenience method — but the shared name causes confusion, so this document
pins down exactly what each one is, when it runs, and how to reason about them.

## The one idea: `remote: true`

A function flagged `remote: true` is **invocable out-of-process** — something
outside this runtime may call it by name.

```ts
export const getOpenApi = pikkuSessionlessFunc({
  remote: true,
  func: async (_services, { name }) => { /* ... */ },
})
```

That single flag drives two very different transports:

| | **Mesh** (deploymentService) | **`wireRemoteAddon`** (HTTP) |
|---|---|---|
| Who calls it | your own gateways, `rpc.remote()`, and the `rpc.invoke()` fallback | a consumer's `rpc('ns:fn')` |
| What it targets | **your own** worker/lambda — *same app*, split across units | a **hosted addon package** — *different app* |
| Transport | service binding (`env.X.fetch()`), Lambda invoke, Azure, or a queue | plain HTTPS `POST` |
| Auth | **trust**: `PIKKU_REMOTE_SECRET`-signed JWT with the session encrypted in the payload (`pikkuRemoteAuthMiddleware`) | **client**: a bearer token the consumer binds from a credential/secret; the addon validates it |
| Endpoint | `POST /remote/rpc/:rpcName` | `POST {serverUrl}/remote/rpc/:rpcName` |
| Wired by | `pikku enable remote-rpc` (mesh mode) | `pikku enable remote-rpc --no-auth` on the host + `wireRemoteAddon` on the consumer |

Both hit the **same** generated handler (`serialize-remote-rpc.ts`). The only
difference on the receiving side is the middleware: the mesh gates with
`pikkuRemoteAuthMiddleware`; the public (`no-auth`) mode drops that and instead
guards with `assertRemoteInvocable(rpcName)` so only `remote: true` functions are
reachable — a public surface must never be an open gateway into every internal
RPC.

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
orchestrator) call `rpc.remote()` — they must dispatch to the *function's* worker,
not a local shadow.

## Why a Cloudflare deploy *is* the mesh

On Cloudflare, `pikku deploy plan` can split an app so each function is its own
Worker. Gateways reach those functions through `CloudflareDeploymentService`:

```ts
// packages/runtimes/cloudflare/src/cloudflare-deployment-service.ts
const request = new Request(
  `http://internal/remote/rpc/${encodeURIComponent(funcName)}`,
  { method: 'POST', headers, body: JSON.stringify({ data }) }
)
const response = await binding.fetch(request)   // env.FUNC_WORKER.fetch() — free, ~0ms, internal
```

`headers.Authorization` is a `PIKKU_REMOTE_SECRET`-signed JWT
(`aud: 'pikku-remote'`, session encrypted) — i.e. exactly the mesh. So a
per-function Cloudflare (or Lambda, or Azure) deploy is the mesh with the
transport swapped from a public URL to a service binding. `deploymentService` is
implemented by the `cloudflare`, `aws-lambda`, and `azure-functions` runtimes and
by the `redis`, `mongodb`, and `kysely-mysql` services (queue-backed variants).

**Consequence:** the mesh is the backbone of serverless split deploys, not dead
code. `wireRemoteAddon` does not replace it — it targets a *published package at a
fixed `serverUrl` with client auth*, whereas the mesh routes to *your own workers*
with trust-based session forwarding. Different problems.

## `wireRemoteAddon` — consuming a hosted addon

Install the addon as a **devDependency** (types only — its handlers run on the
host) and wire it:

```ts
wireRemoteAddon({
  name: 'registry',
  package: '@pikkufabric/addon-registry',            // devDependency
  serverUrl: (services) => services.variables.get('FABRIC_API_URL'),
  auth: { credentialId: 'fabricRegistryToken' },      // see below; omit if public
})

// fully typed against the addon's `.remote.gen` map:
const api = await rpc('registry:getOpenApi', { name: 'stripe' })
```

Auth binds the addon's requirement to a **local** source; the token is sent
`Authorization: Bearer <token>`:

```ts
type RemoteAddonAuth =
  | { credentialId: string }   // per-user  → wire.getCredential(id), scoped to pikkuUserId
  | { secretId: string }       // platform  → secrets.getSecret(id)
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

| Code | Rule |
|---|---|
| `PKU338` | a `wireRemoteAddon` package must be in **`devDependencies`** (types only) — not `dependencies`, not missing. This is the mirror image of `wireAddon`, which *requires* a production dependency. |
| `PKU339` | a bound `auth.credentialId` / `auth.secretId` must reference a credential/secret the consumer actually wires. |

`wireRemoteAddon` is also banned *inside* an addon package (addons declare
contracts and export functions; the consuming app does the wiring).

## Key files

| File | Responsibility |
|---|---|
| `packages/core/src/wirings/rpc/wire-remote-addon.ts` | the `wireRemoteAddon` primitive + `RemoteAddonAuth` |
| `packages/core/src/wirings/rpc/rpc-runner.ts` | `invokeAddonFunction` → `invokeRemoteAddonFunction` (HTTP dispatch); `assertRemoteInvocable`; `rpc.remote()` |
| `packages/core/src/wirings/rpc/remote-addon-auth.ts` | `resolveRemoteAddonToken` (credential/secret/custom; fails closed) |
| `packages/core/src/middleware/remote-auth.ts` | `pikkuRemoteAuthMiddleware` — the **mesh** trust gate |
| `packages/runtimes/*/src/*-deployment-service.ts` | per-runtime `deploymentService.invoke` (service binding / lambda / queue) |
| `packages/cli/src/functions/wirings/rpc/serialize-remote-rpc.ts` | the generated `/remote/rpc/:rpcName` handler (mesh vs. no-auth modes) |
| `packages/cli/src/functions/wirings/rpc/serialize-typed-rpc-map.ts` | picks `.remote.gen` vs `.internal.gen` per addon namespace |
| `packages/inspector/src/utils/post-process.ts` | `validateRemoteAddonDependencies` (PKU338) + `validateRemoteAddonAuth` (PKU339) |
