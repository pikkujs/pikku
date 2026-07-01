# @pikku/deploy-cloudflare

## 0.12.8

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

## 0.12.7

### Patch Changes

- d720ae8: Expose `serviceNames` (each unit-service's `sourceServiceName`) on `PlatformImports`, so a `PlatformServiceContributor` can gate its imports/emit on a custom platform-specific service being required by the unit — without the OSS adapter needing to know that service by name.

## 0.12.6

### Patch Changes

- e6bb2d6: feat(node-http-server): dispatch cron + queue jobs into the server-target container

  A `deploy: 'server'` unit runs in a long-lived Node container and is never
  uploaded as a CF script, so its scheduled tasks and queue workers previously
  had no way to fire — dispatch only reached CF scripts. `PikkuNodeHTTPServer`
  now mounts two authenticated dispatch routes when `dispatchJobs` is enabled:
  `POST /__pikku/scheduler-job` (`runScheduledTask`) and `POST /__pikku/queue-job`
  (`runQueueJob`), gated by a `dispatchSecret` checked with `timingSafeEqual`
  against an `x-pikku-dispatch` header. The cloudflare adapter's generated server
  entry now passes `{ dispatchJobs: true, dispatchSecret: process.env.PIKKU_DISPATCH_SECRET }`,
  so a fabric proxy can forward `/__pikku/*` dispatch to the container exactly
  like it forwards HTTP — one dispatch primitive for both runtimes.

## 0.12.5

### Patch Changes

- d76d50f: feat(deploy): inject platform services into `target: 'server'` container entries

  The generic server (container) entry booted the user's
  `createSingletonServices(config)` with no platform injection, so a container
  that relies on a platform-provided service (kysely from `DATABASE_URL`, secrets
  from `PIKKU_SECRET_KEK`, …) 500s on first access — the provider's contributors
  only ran in the serverless worker entries.

  The provider adapter gains an optional `generateServerEntrySource(ctx)`; the
  build pipeline now prefers it over the provider-agnostic generator for server
  units. The Cloudflare adapter implements it to emit a `@pikku/node-http-server`
  entry that runs the same contributor-driven `createPlatformServices` as its
  workers — sourcing bindings from `process.env` and merging the result into
  `createSingletonServices` exactly like `setupServices` does on the worker. The
  CF-runtime service blocks (queue/workflow/AI) are omitted since a Node
  container carries no such Worker bindings. Providers that don't implement the
  hook fall back to the unchanged generic generator.

## 0.12.4

### Patch Changes

- 5905864: perf(deploy): stub the Postgres driver out of Cloudflare worker bundles

  Templates construct their Kysely instance from `DATABASE_URL`, branching on the
  URL scheme: a `postgres://` URL pulls in `postgres` + `kysely-postgres-js`, any
  other URL uses the libsql/Turso dialect. On Cloudflare the URL is always libsql,
  so the Postgres branch is never taken — yet esbuild still inlined the Postgres
  driver (~40KB+) into every worker bundle as dead weight.

  Adds a `getStubModules()` provider hook (mirroring `getExternals()`): regex
  sources for modules the provider's runtime never executes, stubbed to `export {}`
  during bundling. The Cloudflare adapter returns `^postgres$` + `^kysely-postgres-js$`.
  Unlike `getExternals`, a stub removes the bytes entirely instead of leaving a
  bare runtime import to resolve. Applied to worker units only (the server
  container keeps Postgres, since it's a real Node process that may use it).
  Verified: cloudflare deploy verifier 21/21; a `postgres` import bundles to 48
  bytes (was 38,032) once stubbed.

## 0.12.3

### Patch Changes

- 9060165: Workflow steps now support per-step `retries` and `retryDelay` configuration. Cloudflare deployments gain Workflow Durable Object bindings for graph-DSL workflows on Workers-for-Platforms, and the deploy bundle now boots cleanly on the Cloudflare Workers runtime.

## 0.12.2

### Patch Changes

- b1b2681: fix(cloudflare): channel unit bundle was missing the `WebSocketHibernationServer` named re-export

  Two issues blocked Workers-for-Platforms channel deploys:
  1. The CF deploy adapter generated `entry.ts` with
     `export { PikkuWebSocketHibernationServer ... } from '@pikku/cloudflare/websocket'`,
     but `PikkuWebSocketHibernationServer` actually lives in
     `@pikku/cloudflare/handler` (`/websocket` exports the abstract base
     `CloudflareWebSocketHibernationServer`). Switched the adapter import to
     `/handler`.
  2. With `bundle: true, format: 'esm'`, esbuild tree-shook the named
     re-export because nothing inside the bundle used it — leaving CF to
     reject the upload with `10070: Cannot apply new-class migration to
class 'WebSocketHibernationServer' that is not exported by script`.
     Added `sideEffects` to `@pikku/cloudflare`'s package.json marking
     `handler-factories.js` and `cloudflare-hibernation-websocket-server.js`
     as side-effectful so esbuild preserves the export.

  Together these let `wireChannel(...)` units deploy to a Workers-for-Platforms
  dispatch namespace with the DO migration accepted.

## 0.12.1

### Patch Changes

- 9e8605f: Add Workers for Platforms dispatch namespace support and AI agent fixes.
  - deploy-cloudflare: Thread dispatchNamespace through deploy pipeline, reads CF_DISPATCH_NAMESPACE env var
  - core: Fix auth-gated tools visible to unauthenticated sessions (null session now hides permission-gated items)
  - core: Recursive null stripping in AI agent tool call resume path
  - ai-vercel: Handle anyOf/oneOf/array types when making optional fields nullable for strict providers

- 7ab3243: Add server-fallback deployment target for functions that can't run serverless.

  Functions can declare `deploy: 'serverless' | 'server' | 'auto'`. With `serverlessIncompatible` config, the analyzer auto-routes functions using incompatible services to a container.

  Server functions are merged into a single tree-shaken unit with a PikkuUWSServer entry, Dockerfile, and CF Container proxy Worker.

  Also adds sub-path exports to @pikku/cloudflare for tree-shaking (greet bundle 1.6MB → 444KB) and deploy verifiers for cloudflare, serverless, and azure providers.
