---
'@pikku/core': patch
'@pikku/inspector-go': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

Harness gates are declared. A `pikkuHarnessGate` gets `wire.gate` (`worktree`, `base`, `attempt`, `changeId`, the run's `input`, `scratch`, `signal`, `tool(name)` for a binary pinned for the run, and `runCli`) and may list the rules a person can waive (`waivable`). A gate that writes nothing keeps `writes: []` in its meta. PKU644 no longer reports a complex workflow, whose inline steps (a harness run's) are not in its graph. `pikku changes done` runs its check and page compare with the running CLI, asynchronously, and no environment variable turns them off (`PIKKU_CHANGES_CHECK_GATE`, `PIKKU_COMPARE_GATE` are gone). `pikku changes next` takes `--merge-one`, and `--no-merge` replaces `PIKKU_CHANGES_NO_MERGE`. The changes addon's source may not import `spawnSync`, `execSync` or `execFileSync` (oxlint).
