---
'@pikku/cli': patch
---

`content` moved from the project level to `backends.<name>.content`, because each backend runs as its own process with its own files. The loader refuses the old key and names the new one. `pikku serve` takes `--backend <name>`. Breaking change: see docs/MIGRATION.md.
