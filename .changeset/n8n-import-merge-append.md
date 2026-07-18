---
'@pikku/addon-graph': patch
'@pikku/n8n-import': patch
---

Map n8n's Merge `append` mode (and mode-less Merge default) onto a new `graph:concat` addon function that flattens all input streams, converting ~103 previously-stubbed Merge nodes.
