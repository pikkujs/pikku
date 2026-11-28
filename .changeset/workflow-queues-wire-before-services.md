---
'@pikku/core': patch
---

A workflow service built before singleton services exist no longer crashes its process. A standalone entry constructs `KyselyWorkflowService` (which wires the workflow queues) before `createSingletonServices`, and the per-workflow queue warning read the service's logger through `getSingletonServices()`, which throws while services are unset: `db migrate` and `serve` both died with `Singleton services not initialized`. The logger is now undefined until services exist, and the warning goes to the console in that window. The warning also counts only the workflows the inspector generates a `wf-orchestrator-*` queue for, so an app whose only workflows are attention-func refreshes (registered at runtime, run on the shared queue by design) or scenarios is no longer told its queue meta is missing.
