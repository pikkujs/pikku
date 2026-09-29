---
'@pikku/cli': patch
'@pikku/skills': patch
---

`pikku fabric validate` now errors (`migration-modified-after-base-*`) when a migration file that exists on the base ref (default `origin/main`, `--migrations-base` / `PIKKU_MIGRATIONS_BASE`) is modified, deleted or renamed. `pikku fabric deploy apply` runs the migration-history checks first and refuses to create a deployment while they fail, unless `--skip-migration-check` is passed. The pikku-fabric skill documents the forward-only migration rule.
