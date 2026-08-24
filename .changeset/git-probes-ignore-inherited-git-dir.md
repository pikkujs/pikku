---
'@pikku/cli': patch
---

Stop the fabric git probes answering about the wrong repository. `git push` from a worktree exports `GIT_DIR` to every hook, and a hook's children inherit it — `GIT_DIR` outranks the process's directory, so `isGitRepo`/`isTracked` and the deploy safety checks reported the hook's repository no matter which `cwd` they were given. `fabric validate` run from a pre-push hook then failed `fabric-config-untracked` against files it never looked at. Each probe picks its repository by `cwd`, so the inherited pointer is dropped along with the other repository-location variables.
