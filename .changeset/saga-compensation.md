---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/console': patch
'@pikku/skills': patch
---

Saga compensation for workflows. A function declares `compensate` inline; when a workflow step fails, completed steps are undone newest-first as durable `<step>:compensate` steps. New run statuses `compensating`, `compensated` and `compensation_failed`, `workflow.milestone(name)` to bound the unwind, `{ compensate: false }` to opt a call out, nested-workflow unwinding, and `PikkuWorkflowService.cancelRun` which unwinds too. Graph nodes replace `onError` with `recover` (`nodeId`, `nodeId[]` or `'ignore'`), exposing the error as `wire.graph.recoveringFrom`. **Breaking:** the DSL `onError` step option and the graph `onError` node field are removed; `getRunSteps` is now abstract on `PikkuWorkflowService`.
