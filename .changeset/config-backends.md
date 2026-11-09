---
'@pikku/cli': patch
---

`pikku.config.json` declares `backends` (named, filtered builds of the functions package). `pikku all` runs the shared pass, then one filtered pass per backend into `.pikku/backends/<name>/`; `--backend <name>` narrows it. `extends`, `namedFilters`, a config-file `filters`, `addons.addonDir` and the `pikku all` filter flags are removed; the loader names the new home. Breaking changes are in docs/MIGRATION.md.
