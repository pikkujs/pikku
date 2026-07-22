---
'@pikku/inspector': patch
---

Stop deleting code when regenerating a DSL workflow from its graph.

Regenerating a workflow (as the console's graph editor does) silently dropped
steps:

- Only the **first** step of an `if` arm survived. The walk stopped via a
  heuristic that tested whether the next node id contained `_then_`/`_else_`,
  but node ids are step names, so it never matched. Branch and switch bodies now
  walk the `next` chain up to an explicit exit boundary — the enclosing flow
  node's own `next`.
- Switch cases emitted only their entry node, never walking `next` at all.
- Every step was renamed to `Call <rpcName>`, because the graph conversion never
  wrote `stepName` onto the node. Step names are the durable replay cache key,
  so a round-trip silently invalidated in-flight runs.
- `workflow.suspend()` had no graph node, yet the preceding step's `next` still
  pointed at its id — traversal dead-ended there and every following step was
  deleted. `suspend` is now a real flow node, and both `suspend` and `approval`
  have deserializer cases.
- Numeric and boolean `switch` case values were emitted quoted (`case '1':`),
  so the case could never match. Step names and reasons containing a quote are
  now escaped.

Also fixed in the same pass:

- `const [org, user] = await Promise.all([...])` regenerated as a bare
  `await Promise.all([...])`, leaving both names unbound.
- A step result assigned inside a branch was re-declared with `const` inside
  that branch, so any later reference was out of scope. Hoisting analysis was
  keyed off the same dead node-id heuristic and never fired.
- A top-level step whose _name_ contained `_case`, `_item_`, `_then_`,
  `_else_`, `_child_` or `_default_` was silently deleted, because node ids are
  step names and were matched against those structural substrings. Ownership is
  now read from the parent constructs themselves.
