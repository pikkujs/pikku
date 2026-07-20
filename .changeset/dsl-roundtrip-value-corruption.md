---
'@pikku/core': patch
'@pikku/inspector': patch
---

Stop corrupting values when regenerating a workflow from its graph.

- A numeric `workflow.sleep('Wait', 5000)` came back as `'5000'`, and a numeric
  `retryDelay` likewise. Durations are `string | number`; only strings are
  quoted now.
- An assignment to a context variable was stored as an opaque `value`, so
  `count = count + 1` regenerated as `count = 'count + 1'` — an expression
  turned into a string literal. `SetStepMeta` now carries a separate
  `expression` field (mirroring `SwitchCaseMeta`), so a string literal and a
  code expression are no longer indistinguishable in the meta.
- A `next` that was not a single node id was coerced with a string cast: an
  array became the bogus id `'a,b'` and a branch-key record became
  `'[object Object]'`, severing every downstream node. Arrays, key-based
  routing tables and condition lists now each render in their own shape.
- A `filter`/`some`/`every` node with no `outputVar` emitted
  `const undefined = ...`, which does not parse.
