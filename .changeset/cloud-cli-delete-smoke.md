---
'@pikku/cli': patch
---

Removed `pikku cloud smoke`. It was a local clean-room project check (temp worktree, install, codegen, frontend checks, `pikku dev` startup) with no cloud involvement, and nothing else used it. Breaking for anyone who ran it: the command is gone with no replacement inside `pikku cloud`; run `pikku all` and `pikku dev` in your project instead. The `@pikku/cli/addon-support/validate` entry also stops re-exporting `findProjectRoot` and `readJsonSafe`.
