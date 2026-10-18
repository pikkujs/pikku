---
'@pikku/cli': patch
---

`@pikku/core` is a regular dependency of the CLI again, not a peer. bunx reuses its install directory and lockfile, and bun keeps a locked peer even when a newer CLI's range excludes it, so `bunx --bun @pikku/cli@latest update` loaded a stale core and died on `Cannot find package '@pikku/core'` before reaching any command.
