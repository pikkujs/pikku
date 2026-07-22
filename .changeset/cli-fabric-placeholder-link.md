---
'@pikku/cli': patch
---

Treat a `__PROJECT_ID__` placeholder as unlinked, so `fabric init` works on a fresh scaffold; report a missing `--branch` instead of "local branch undefined does not exist"; keep the git error when a deploy branch cannot be resolved.
