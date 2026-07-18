---
'@pikku/n8n-import': patch
---

Normalize legacy (v1) n8n Switch nodes onto `graph:branch` instead of leaving them as control-flow stubs. v1 Switch carries a shared left operand (`value1`) plus `dataType` at the node level and one `rules.rules[]` row per output (`{ operation, value2, output }`), which now lowers to one branch case per rule keyed by its output slot — mirroring the existing v1 IF handling. Across the corpus this converts ~50 previously-stubbed Switch nodes into real branch topology (switch→branch 249→299; only genuine expression/JSON-mode switches remain stubs).
