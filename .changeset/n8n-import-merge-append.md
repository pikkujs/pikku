---
'@pikku/addon-graph': patch
'@pikku/n8n-import': patch
---

Map n8n's Merge `append` mode (concatenate input streams) onto a new `graph:concat` addon function instead of leaving it a stub. `graph:concat` flattens all its input streams into one list (wrapping any non-array input as a single item); the importer feeds it every predecessor branch via `fromAllPredecessors`. Because `append` is also the Merge node's zero-config default — the combine/join modes all require field or position configuration — a mode-less Merge resolves here too. Combine-family modes still map to `graph:merge` (object merge); chooseBranch / combineBySql / removeKeyMatches stay stubs. Across the corpus this converts ~103 previously-stubbed Merge nodes into real graph functions.
