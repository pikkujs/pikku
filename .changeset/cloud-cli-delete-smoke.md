---
'@pikku/addon-cloud-cli': patch
---

Removed `pikku cloud smoke`. It was a local clean-room project check (temp worktree, install, codegen, frontend checks, `pikku dev` startup) with no cloud involvement, and nothing else used it. Breaking for anyone who ran it: the command is gone and there is no replacement inside `pikku cloud`; run `pikku all` and `pikku dev` in your project instead.
