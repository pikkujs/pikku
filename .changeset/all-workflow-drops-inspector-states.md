---
'@pikku/cli': patch
---

Stop `pikku all` holding on to every inspection.

The workflow steps that re-inspect the project returned their `InspectorState`,
and a step's return value is kept as the step result for the life of the run.
Each state holds a whole `ts.Program`, so a run that inspects four or five times
— what a cold run does, when `.pikku/` and the schema cache are both empty —
pinned that many TypeScript programs in memory at once instead of letting each
one be collected as the next replaced it. Heap use climbed monotonically across
the run rather than plateauing.

Those steps now discard the state; anything needing it calls
`getInspectorState()` directly, which is where the caching already lives, so
behaviour and generated output are unchanged.

On a ~86k-LOC project this takes a cold `pikku all` from 2314MB to 1671MB peak
RSS, which is the difference between dying in a 2GB CI heap and finishing in it.
