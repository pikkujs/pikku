---
'@pikku/addon-graph': patch
'@pikku/n8n-import': patch
---

Map n8n's Aggregate `aggregateAllItemData` mode onto `graph:aggregate` (new additive `includeAllItems` flag), converting ~164 previously-stubbed Aggregate nodes into real graph functions.
