---
'@pikku/cli': patch
---

`pikku new addon <name>` now scaffolds into `addon-<name>/` (e.g. `packages/addon-stripe`), mirroring the `@pikku/addon-<name>` package name so addon workspaces are visually distinct from app packages.
