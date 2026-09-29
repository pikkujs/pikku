---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/deploy': patch
---

Deployed units that call `rpc.startWorkflow('x')` now get x's meta, so the call no longer fails with `WorkflowNotFoundError`. The inspector records `startsWorkflows` for literal `rpc.startWorkflow(...)` calls. It warns when a handler computes the workflow name or passes `rpc` to a helper, because the planner cannot see those calls.

With workflow queues, the deploy planner gives a starter unit the workflow meta and orchestrator queue meta only (new `--workflowMeta` filter), plus `workflow-state` and `queue` services. Without queues the start runs inline, so the whole workflow is bundled. Core's `startWorkflow` now requires the workflow registration only for inline runs; queued runs need only the meta.
