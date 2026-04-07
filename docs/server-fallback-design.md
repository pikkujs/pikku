# Server-Fallback Deployment — Design Doc

## Context

Currently every function deploys as its own CF Worker. But some functions can't run serverless (long-running, stateful, heavy deps). The CF deploy adapter should handle both targets within a single `pikku deploy apply`:

- **Serverless functions** → CF Workers (one per function, as today)
- **Server functions** → CF Container (one container bundling all server functions)

## Function Deploy Target

Each function gets an optional `deploy` flag:

```ts
export const myFunc = pikkuFunc({
  deploy: 'serverless',  // must be a Worker (fail at plan time if incompatible)
  deploy: 'server',      // must run in container
  deploy: 'auto',        // try serverless, fall back to container (default)
})
```

### Auto-Detection (plan time)

During `pikku deploy plan`, the analyzer checks each `auto` function:

1. **Service compatibility** — config declares serverless-incompatible services:
   ```json
   {
     "deploy": {
       "serverlessIncompatible": ["kysely", "redis", "pgBoss"]
     }
   }
   ```
   If a function uses any listed service → mark as `server`.

2. **Bundle compatibility** — if esbuild fails for a function (native deps, unsupported APIs) → mark as `server`.

3. **Explicit override** — `deploy: 'serverless'` that fails → **plan error** (not silent fallback).

## Analyzer Output

The manifest's `units` array gains a `target` field:

```ts
interface DeploymentUnit {
  // ... existing fields
  target: 'serverless' | 'server'
}
```

All `server` units get merged into a **single container unit** by the adapter.

## CF Adapter Changes

The `CloudflareProviderAdapter` handles both targets:

### Serverless Path (unchanged)
- Per-unit codegen → entry → bundle → upload Worker via CF API

### Server Path (new)
- All `server` functions grouped into one container unit
- Full codegen (no per-unit filtering — all server functions in one `.pikku/`)
- Entry: `PikkuUWSServer` with all routes + queue workers + cron
- Bundle: single esbuild output
- Dockerfile generated
- Deploy: `wrangler deploy` with container config

### Routing

CF Workers act as the edge gateway. For server functions:
- A **proxy Worker** forwards requests to the container via outbound HTTP
- The wrangler.toml for the proxy Worker includes `[[containers]]` binding
- Queue consumers: Worker receives queue message → calls container `/internal/queue/{queueName}` 
- Cron: Worker cron trigger → calls container `/internal/cron/{taskName}`

```
Client → CF Worker (proxy) → CF Container (server functions)
                           ↘ CF Worker (serverless functions)
```

## CF Container Deployment

CF Containers (beta) use Durable Objects under the hood:
- **Config**: `image: "./Dockerfile"` in wrangler.toml
- **Deploy**: `wrangler deploy` builds + deploys the image
- **Routing**: Worker creates container instance, proxies HTTP to it
- **Limitations**: Containers can't directly consume queues or cron — need Worker proxies

### Generated Files

```
.deploy/cloudflare/
├── greet/              # serverless Worker (as today)
│   ├── entry.ts
│   ├── bundle.js
│   └── wrangler.toml
├── server/             # container with all server functions
│   ├── entry.ts        # PikkuFastifyServer
│   ├── bundle.js
│   ├── Dockerfile
│   ├── package.json    # native deps
│   └── wrangler.toml   # [[containers]] config
└── server-proxy/       # Worker that routes to container
    ├── entry.ts        # fetch → container, queue → container, cron → container
    ├── bundle.js
    └── wrangler.toml   # queues consumers + cron triggers for server functions
```

## Config Schema

```json
{
  "deploy": {
    "providers": {
      "cloudflare": "@pikku/deploy-cloudflare"
    },
    "serverlessIncompatible": ["kysely", "redis", "pgBoss"]
  }
}
```

The server container uses `PikkuUWSServer` (same as standalone) — no config needed for runtime choice.

## Implementation Phases

### Phase 1: Analyzer + Manifest
- Add `deploy` field to function config type
- Add `target` field to `DeploymentUnit`
- Analyzer routes functions based on `deploy` + `serverlessIncompatible`
- Plan output shows which functions are serverless vs server

### Phase 2: Container Entry + Bundle
- Generate uWS entry for server unit (same as standalone adapter)
- Bundle all server functions into one `bundle.js`
- Generate Dockerfile
- Generate `package.json` with native deps

### Phase 3: CF Container Integration
- Generate `wrangler.toml` with `[[containers]]` config
- Generate proxy Worker that routes to container
- Wire queue consumers + cron triggers through proxy
- Deploy via `wrangler deploy`

### Phase 4: Mixed Deploy Flow
- `pikku deploy plan` shows both serverless + server units
- `pikku deploy apply` deploys Workers + Container in one command
- Error handling: serverless failures for `deploy: 'auto'` → reclassify and retry as server

## Decisions Made

- **One shared proxy Worker** routes all server traffic to the container
- **uWS** for the container runtime (same as standalone adapter)
- **traceId propagation** via `x-request-id` header across Worker→Container hop

## Verifier: `verifiers/deploy-cloudflare/`

Extend the existing CF deploy verifier with server-fallback tests:

- **Mixed manifest**: functions with `deploy: 'server'` produce server units, others produce serverless units
- **Server unit structure**: single container unit bundles all server functions
- **Proxy Worker**: exists with queue consumers + cron triggers for server functions
- **Dockerfile**: generated in the server unit directory
- **Auto-detection**: function using `serverlessIncompatible` service → routed to server
- **Explicit serverless failure**: function with `deploy: 'serverless'` + incompatible service → plan error

This requires a test project (or extending the functions template) with functions that have different deploy targets.

## Open Questions

1. CF Containers is beta — stable enough for production?
2. Container cold starts — use cron healthcheck to keep warm?
3. Container scaling — CF auto-manages via Durable Objects, latency-aware autoscaling planned
