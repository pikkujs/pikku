---
'@pikku/cli': patch
'@pikku/cloudflare': patch
'@pikku/deploy-cloudflare': patch
'@pikku/inspector': patch
---

fix(cloudflare,cli): make workflow-starter usable + restore CF Worker compat

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
