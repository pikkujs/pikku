---
'@pikku/cli': patch
---

`pikku dev` runs each declared backend as its own process on its `dev.port` when there are two or more: one coordinated codegen in the parent, children that serve `.pikku/backends/<name>` and reload when the parent signals. `pikku dev --backend <name>` runs one backend on its filtered tree. See docs/MIGRATION.md.
