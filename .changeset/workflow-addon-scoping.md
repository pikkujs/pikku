---
'@pikku/core': patch
---

feat(core): scope bare workflow names to the caller's addon package

Parallel to the RPC scoping fix for addon functions. Addon code calling
`services.workflowService.runToCompletion('myWorkflow', ...)` (bare name,
no colon) previously missed workflows registered under the addon's package
scope and threw `WorkflowNotFoundError`, forcing authors to hard-code
the consumer-facing namespace (`'cli:myWorkflow'`) — which couples the
addon to its caller's `wireAddon({ name })`.

`getOrCreatePackageSingletonServices` in the function-runner now wraps
the package's `workflowService` with a Proxy that auto-prefixes bare
workflow names on `startWorkflow` / `runToCompletion` with the addon's
consumer-defined namespace (looked up from `pikkuState(null, 'addons',
'packages')`). Explicit `'ns:name'` calls and root-namespace workflows
are unchanged.
