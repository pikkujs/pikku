---
'@pikku/core': patch
'@pikku/inspector-go': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

The build harness's gates are declared. A `pikkuHarnessGate` gets `wire.gate` (`worktree`, `base`, `attempt`, `changeId`, the run's `input`, `scratch`, `signal`, `tool(name)` for a binary pinned for the run, and `runCli`) and may list the rules a person can waive (`waivable`). The changes addon declares `check`, `oxfmt`, `oxlint`, `trailers`, `migrations`, `plan`, `pages` and `hand-typed-tables` and the `buildHarness` that lists them; `runHarness` runs a declared harness, putting each gate in its stage by its `writes`. A gate that writes nothing keeps `writes: []` in its meta. PKU644 no longer reports a complex workflow, whose inline steps (a harness run's) are not in its graph. `pikku changes done` runs its check and page compare with the running CLI, asynchronously, and no environment variable turns them off (`PIKKU_CHANGES_CHECK_GATE`, `PIKKU_COMPARE_GATE` are gone). `pikku changes next` takes `--merge-one`, and `--no-merge` replaces `PIKKU_CHANGES_NO_MERGE`. The addon's source may not import `spawnSync`, `execSync` or `execFileSync` (oxlint).
