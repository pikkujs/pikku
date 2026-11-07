---
'@pikku/cli': patch
'@pikku/skills': patch
---

Add `pikku ci`: bootstrap, local `db migrate`, `db codegen`, `emails generate`, `all`, `validate`, `audit --failOn high`, tests and app builds as one non-interactive workflow that stops at the first failed step. `-p <provider>` runs it in a throwaway git worktree of the commit, removes the console scaffold and produces a deploy plan; `--deploy` applies that plan; on Cloudflare it first needs `--secretsSet` and `--migrationsApplied` to confirm what the adapter cannot do itself. With `--json`, CLI workflows stream `workflow.step.*` events.
