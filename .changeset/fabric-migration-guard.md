---
'@pikku/cli': patch
'@pikku/skills': patch
---

`pikku fabric validate` now errors (`migration-modified-after-base-*`) when a migration file that exists on the base ref (default `origin/main`, `--migrations-base` / `PIKKU_MIGRATIONS_BASE`) is modified, deleted or renamed. `pikku fabric deploy apply` runs the migration-history checks first and refuses to create a deployment while they fail, checking the stage being deployed, the production stage and the base ref. There is no override, and a check it cannot run (ledger unreadable, base ref unresolved, not a git repository) refuses rather than being skipped. The pikku-fabric skill documents the forward-only migration rule.
