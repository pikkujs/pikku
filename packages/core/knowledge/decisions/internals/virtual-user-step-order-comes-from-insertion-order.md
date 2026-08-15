---
type: decision
title: A scenario's step order for a virtual user is insertion order, not a graph traversal
description: The CLI writes nodes in declaration order, so following `next` would buy an ordering that is already true and cost a traversal that has to interpret branches
tags: core, virtual-user
---

# Step order comes from insertion order, not a graph traversal

When a scenario becomes catalogue entries, its steps are read in the order the
nodes appear — which is the order the CLI wrote them, which is the order the
scenario declares them.

Following `next` edges instead would produce the same ordering in the ordinary
case, and in the branching case it would force a decision nobody needs: which
arm of a branch to present to a reader who will never take one. The traversal
costs work to reproduce a fact that already holds.

**What this rules out:** "correcting" this to a topological walk because a graph
is present. The graph describes execution; the catalogue describes what the
scenario _says_, and those are read in declaration order.
