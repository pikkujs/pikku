---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/kysely': patch
'@pikku/redis': patch
'@pikku/mongodb': patch
---

fix(workflow,ai-agent): make a run's owner, entry node and step function authoritative

A graph run may only start at a node the graph declared in `meta.entryNodeIds`, and
the generated `POST /workflow/:workflowName/graph/:nodeId` route that let an HTTP
caller pick the entry node is gone. `startNode` stays for `PikkuTriggerService`,
which names a declared entry node anyway.

`StepState` now records the `rpcName` the workflow dispatched a step with, and the
step claim rejects a queue message naming a different function with
`WorkflowStepFunctionMismatchError` before mutating any status — a step runs under
the run owner's identity and without the `expose` gate, so the message must not
choose what runs.

`approveStep` takes the caller's session, and the generated status routes and
streams assert the same `assertWorkflowRunOwner` check: a run started through a
session may only be read and approved by that session's user. A run with no
recorded owner (trigger, scheduler, unauthenticated route) has nobody to compare
against and is still gated by the entrypoint's own `auth`/`permissions`.

`AIRunStateService.resolveApproval` is now a compare-and-swap returning whether
*this* caller made the claim, and both agent resume paths run a tool only for the
approvals they claimed — concurrent approvals of one tool call no longer all
execute it.
