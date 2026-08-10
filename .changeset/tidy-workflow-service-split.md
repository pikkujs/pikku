---
'@pikku/core': patch
---

Split `pikku-workflow-service.ts` into composable modules and report missing workflow metadata as such

`PikkuWorkflowService`'s module carried its error catalog, run-engine interfaces, queue routing and queue wiring alongside the class. Those now live in `workflow-errors.ts`, `workflow-run-engine.types.ts`, `workflow-constants.ts`, `workflow-meta-resolver.ts`, `workflow-queue-routing.ts` and `workflow-queue-wiring.ts`, with the approval and recovery paths in `workflow-approval.ts` and `workflow-recovery.ts`. The `@pikku/core/workflow` entry point exports the same names as before.

Typing the workflow meta resolver surfaced a crash: a run whose workflow had no generated metadata threw `TypeError: Cannot read properties of undefined` from deep inside the runner, or `WorkflowNotFoundError` — neither of which points at the actual cause. It now throws `PikkuMissingMetaError`, matching how the queue and trigger runners already report the same condition.
