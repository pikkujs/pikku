---
'@pikku/addon-graph': patch
---

Publish the addon's generated rpc map type files. `build.sh` copied them from `.pikku/rpc`, but `pikku all` writes an addon's maps to `.pikku/addon/rpc`, so 0.12.17 shipped without them and every `graph:*` workflow step failed type-checking (TS2322) in the project using the addon.
