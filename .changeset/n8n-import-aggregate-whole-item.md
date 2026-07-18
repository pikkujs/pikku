---
'@pikku/addon-graph': patch
'@pikku/n8n-import': patch
---

Map n8n's Aggregate `aggregateAllItemData` mode (collect the whole incoming items into one list) onto `graph:aggregate` instead of leaving it a stub. The addon's `aggregate` function gains an additive `includeAllItems` flag that returns every item under the configured output field (n8n `destinationFieldName`, default `data`); the importer routes the whole-item mode to it, feeding the item stream from the node's predecessor. Field include/exclude sub-modes stay stubs. Across the corpus this converts ~164 previously-stubbed Aggregate nodes into real graph functions (aggregate now maps with zero stubs).
