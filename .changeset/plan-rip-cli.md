---
'@pikku/cli': patch
'@pikku/addon-console': patch
'@pikku/console': patch
---

refactor: rip plan layer, replace with branch-based diff view + new CLI commands

- Removes the `AiPlanV1` JSON plan-layer scaffolding (`pikku plan
  ingest/update/validate`, `LocalPlanStoreService`, `/plans` console
  pages).
- Replaces with a `StateDiffService` that diffs two `.pikku/`
  directories' meta JSONs (typically a worktree at `main` vs. the
  current branch), exposed via `console:getStateDiff` and a new
  `/changes` console page with per-category tabs and field-level diff.
- New `pikku meta` and `pikku skills` CLI commands.
- `cli-logger` json output goes to stderr so command data piping
  (e.g. `pikku meta --json | jq`) stays clean.
- `templates/functions/pikku.config.json` declares `metaService`,
  `stateDiffService`, and `codeEditService` as
  `serverlessIncompatible` so they're filtered from serverless bundles.
