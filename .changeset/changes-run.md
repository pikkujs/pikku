---
'@pikku/addon-changes-cli': patch
---

`pikku changes run --agent "<command>"` builds the local changes queue with up to three agents at once, each in its own changeset worktree: it claims and prepares each worktree (install, relink to a local CLI, `pikku check`), starts the agent with the prompt on stdin and the change in `PIKKU_CHANGE_ID`, gives the lease back when the agent exits and picks an open change up again up to `--tries`, merges finished changesets, repairs a red main checkout and works merge conflicts with an agent turn, stops an agent quiet for `--stall-minutes`, and lists every startup problem at once. The loop is `ChangesRunner` in `@pikku/addon-changes-cli/runner`, with an `AgentLauncher` interface so any harness can run the agents.
