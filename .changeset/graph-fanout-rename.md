---
'@pikku/addon-graph': patch
'@pikku/n8n-import': patch
---

Rename the `graph:map` addon function to `graph:fanout`. "Map" collided conceptually with `Array.prototype.map`; `fanout` names what it actually does — invoke a child RPC once per element (parallel or sequential) and collect the ordered results. Exports renamed `map`→`fanout`, `MapInput`→`FanoutInput`, `MapOutput`→`FanoutOutput`; the n8n importer emits `graph:fanout` for its per-item lowering.
