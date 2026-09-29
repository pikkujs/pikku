---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/addon-admin': patch
'@pikku/better-auth': patch
---

A declared webhook source is a registered one. `reconcileTriggerSources` sets up every declared source with its provider (check, then setup where missing or drifted) and `teardownTriggerSources` removes named ones, recording what was registered in a `TriggerSourceStore` (in-memory, or `KyselyTriggerSourceStore` on `pikku_trigger_source`). The admin addon exposes list, reconcile, teardown and forget under the new `admin:triggers` scopes.
