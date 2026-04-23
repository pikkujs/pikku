---
'@pikku/cli': patch
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/mongodb': patch
'@pikku/redis': patch
---

Add deterministic workflow planned-step metadata support and SSE init stream payload generation.

- Persist `deterministic` and `plannedSteps` on workflow runs in core and service adapters.
- Expose planned-step metadata on workflow run status responses.
- Emit an initial `type: 'init'` SSE event for deterministic workflow streams before incremental updates.
- Add CLI tests covering serialized stream route output for init/update/done event behavior.
