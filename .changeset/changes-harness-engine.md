---
'@pikku/cli': patch
'@pikku/skills': patch
---

The changes commands. `pikku changes next --merge-one` merges one finished changeset per call, so a merge lane can check the main branch after each merge. `pikku changes done` recognises the migrations of every Pikku project in the checkout (each `pikku.config.json` and its `rootDir`), not only a root `db/` folder. `pikku changes done --waive` is removed: whoever runs `done` (a builder too) could waive a phone width, so every width must now pass. `@pikku/cli/addon-support/changes` exposes what a build harness outside the CLI builds on: the local changes queue, the page reference and change plan helpers, the migration files, the tool runner (`runCli`, its process groups and locks, redaction, `HarnessInfraError`) and the runner's worktree, queue and merge pieces. The pikku-site-clone skill no longer offers `--waive`.
