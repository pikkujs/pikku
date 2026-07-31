---
type: decision
title: A workflow step's recorded `rpcName` is provenance only — nothing dispatches off it
description: It exists so a reader can join a runtime step row back to the declaration that produced it, especially when the durable name was built in a loop
tags: workflow
---

# A workflow step's recorded `rpcName` is provenance only — nothing dispatches off it

`insertStepState` and `inlineStep` in `pikku-workflow-service.ts` record the
name a step was dispatched by: an RPC for a `workflow.do` step, a step function
for a scenario step, `null` for a closure. Nothing in the engine dispatches off
that value — it is stored so a reader can join a step back to the function that
ran it.

It earns its keep when the durable step name was built at runtime. A scenario
step called in a loop reaches the run as, say, `sees @pikku/addon-todos` while
it was declared as ``sees ${packageName}``; the recorded step-function name is
then the only way to join that row back to its declaration. `inlineStep` also
records the `data` the step was called with for the same reason: a reporter
renders each step's prose from it, so two calls to one step stay
distinguishable by what they were asked to check.

Step lineage is recorded alongside it. `fromStepName` is the predecessor that
scheduled a step — the walked transition — captured by `rpcStep`/`inlineStep`
*before* `nextStepKey` advances the lineage, and surfaced to a step as
`fromInvocationId`. In a cyclic graph `a → b → a → c`, the second `a` therefore
carries `b`'s id, which is what lets the walked path be reconstructed from the
chain alone.

**What this rules out:** treating the recorded name as the dispatch target,
dropping it for closure steps "since it is always null", capturing
`lastStepName` after `nextStepKey` has run, or omitting `data` on inline steps —
each breaks either the join back to source or the reconstructed path.
