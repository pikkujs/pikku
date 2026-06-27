---
'@pikku/inspector': patch
---

Populate `plannedSteps` and `deterministic` on serialized DSL workflow graphs. For a DSL workflow with no loops (fanout), the inspector now records every named step in source order, so a UI can render the run's step skeleton up front without executing it or hand-listing steps. `deterministic` is `true` only for a flat, loopless, branch-free workflow (exact sequence known ahead of time); a branchy-but-loopless workflow lists all possible steps with `deterministic: false`; any fanout makes the count runtime-dependent so neither field is emitted (just `deterministic: false`). Only `source: 'dsl'` workflows are planned — `complex` step trees omit inline branches and flatten loops, so their plans would misreport determinism. The runtime already threads these fields from workflow meta onto each run via `getRun`.
