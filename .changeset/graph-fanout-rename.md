---
'@pikku/addon-graph': patch
'@pikku/n8n-import': patch
---

Rename the `graph:map` addon function (and its `Map*` types) to `graph:fanout`, which better names invoking a child RPC once per element and collecting ordered results.
