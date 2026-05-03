# @pikku/deploy-cloudflare

## 0.12.3

### Patch Changes

- 78488b1: fix(cloudflare,cli): make workflow-starter usable + restore CF Worker compat

  Three fixes that unblock deploying graph-DSL workflows to Cloudflare
  Workers via Workers-for-Platforms:
  1. **`workflowStarter` / `graphStarter` scaffold now declares
     `workflowService`.** Both functions delegate to `rpc.startWorkflow()`,
     which requires `workflowService` on the services container at runtime.
     The previous `(_services, ...)` signature hid that requirement, so the
     analyzer didn't assign `workflow-state` capability to the unit and the
     generated `entry.ts` left out `CloudflareWorkflowService` — calling
     `POST /workflow/<name>/start` returned `WorkflowService service not
available`. Destructuring `{ workflowService }` (and asserting it) lets
     the static analyzer pick up the capability automatically.
  2. **`@pikku/cloudflare` re-exports `getCloudflareEnv()`.** Lets user
     `createSingletonServices` factories read CF bindings (D1, R2, KV, queue
     producers) without threading `env` through every signature. Returns the
     env captured by `setupServices` on the most recent request, or `null`
     pre-request.
  3. **CF deploy provider opts out of the createRequire banner + aliases
     every node builtin to its `node:` prefix.** CF Workers don't define
     `import.meta.url`, so the previous unconditional banner crashed at
     boot (`The argument 'path' must be a file URL ... Received 'undefined'`
     at `node:module:34:15`). New `getNoRequireShim()` provider hook returns
     true for CF; `nodejs_compat_v2` then handles builtins natively as long
     as imports use the `node:` prefix, which `getAliases()` now ensures for
     the full builtin list.

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
