---
type: decision
title: Workflow graph node notes are non-semantic and excluded from the graph hash
description: Documentation on a node must not count as a topology change, or editing a comment redeploys the workflow
tags: workflow
---

# Workflow graph node notes are non-semantic and excluded from the graph hash

`GraphNodeConfig.notes` (`graph/workflow-graph.types.ts`, mirrored on the typed
builder in `graph/graph-node.ts`) is free-text documentation attached to a node.
It is deliberately excluded from the graph topology hash (`graphHash`), so
editing a note never marks the workflow as changed. The graph-level `notes`
field on `wireWorkflowGraph` (`graph/wire-workflow-graph.ts`) — which carries
things like imported sticky notes — is excluded for the same reason.

The hash exists to answer "is this the same workflow the running instances were
started against?". Prose about a node has no bearing on that. If notes were
hashed, adding a sentence of documentation would register as a topology change
and the only safe habit would be to never document a node.

**What this rules out:** folding `notes` into `graphHash` "for completeness",
or using `notes` to carry anything semantic — a routing hint, a version marker,
a flag some other code reads — since nothing that changes behaviour may live in
a field the change-detection hash ignores.
