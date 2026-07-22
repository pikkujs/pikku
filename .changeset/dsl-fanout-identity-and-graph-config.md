---
'@pikku/core': patch
'@pikku/inspector': patch
---

Fix a fanout collapsing into a single step, and preserve graph node config.

- A fanout took its `stepName` from the first step of its body. Node ids _are_
  step names, so the loop and that step got the same id and the step overwrote
  the loop: `await Promise.all(users.map(...))` rendered as one plain call, and
  everything after the loop became unreachable. A fanout is not itself a cached
  step, so it no longer borrows a name.
- A `workflow.sleep` or `workflow.suspend` inside a fanout body was dropped at
  extraction — `FanoutStepMeta.body` was typed RPC-only. It now admits sleep and
  suspend, and the regenerated body emits them.
- Regenerating a `pikkuWorkflowGraph` dropped `onError`, `retries` and
  `retryDelay` from every node, and graph-level `notes`. All four are honoured
  at runtime, so the round trip silently changed behaviour.
