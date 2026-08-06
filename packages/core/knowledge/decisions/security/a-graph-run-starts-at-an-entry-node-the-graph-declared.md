---
type: decision
title: A graph run starts at an entry node the graph declared
description: startNode may only name a node in meta.entryNodeIds, and no generated route offers it, because otherwise a caller picks which half of the graph to skip
tags: workflow
---

# A graph run starts at an entry node the graph declared

`runWorkflowGraph` in
`packages/core/src/wirings/workflow/graph/graph-runner.ts` takes an optional
`startNode`. It used to accept any node id the graph contained, validated only
by `validateGraphReferences` (does the node exist) and `areDependenciesSatisfied`
(does its input reference another node). A node whose input is a literal or comes
from the trigger passes both — including a node that is only ever reached after a
validation, payment or approval node. Choosing it as the start does not skip the
gate so much as never reach it.

`startNode` is now checked against `meta.entryNodeIds`, the set the graph itself
declared, and the generated `POST /workflow/:workflowName/graph/:nodeId` route
that offered it to HTTP callers is gone.

The parameter stays, because it has a real internal user: `PikkuTriggerService`
(`packages/core/src/wirings/trigger/pikku-trigger-service.ts`) passes a target's
`startNode` when a trigger fires. That caller names a node the graph declared, so
the restriction costs it nothing.

**What this rules out:** re-exposing entry-node choice on a generated route, and
"validating" a `startNode` by existence or by dependency satisfaction — neither
says the graph meant that node to be an entry point. It does not rule out a graph
declaring several entry nodes; that is exactly how a graph says which starts are
legitimate. If a graph needs a start that is not an entry node, the answer is to
declare it as one, not to widen the check.
