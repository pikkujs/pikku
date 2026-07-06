---
'@pikku/core': patch
---

Fix dev hot-reload dropping runtime-registered function/queue meta. `reloadGeneratedMeta` replaced the whole `function`/`queue` meta maps with the generated JSON, wiping entries the framework registers at service-init (the workflow orchestrator, per-workflow queue workers, and other `addFunction`'d internals that never appear in the generated files). Workflow jobs then failed with `Function meta not found: pikkuWorkflowOrchestrator`. The reload now merges over the existing maps so those internals survive.
