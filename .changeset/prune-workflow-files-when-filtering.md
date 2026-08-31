---
'@pikku/inspector': patch
---

Prune a filtered-out workflow's file entry, not just its meta.

`filterInspectorState` deleted a pruned workflow from `workflows.graphMeta` and `workflows.meta` but left it in `workflows.files`, which is what the wiring generator iterates. Per-unit deploy codegen therefore registered every workflow in the project into every unit, and — because a scenario is told apart from an app workflow by `graphMeta[name].source === 'scenario'`, which the same prune had just removed — each scenario was reclassified as an app workflow. That pulled scenario bodies, their steps, and whatever those import into deployed bundles; on Cloudflare a step reading a fixture off disk failed the whole publish with `No such module "node:fs"`.
