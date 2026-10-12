---
'@pikku/cli': patch
---

The `pikku` binary mounts CLI extensions at start-up: any dependency of the CLI whose package.json declares `pikku.cli.name` and exports `./cli` contributes a command group. Only the extension named by the first argument is imported, built-in commands load nothing, and a copy of `@pikku/core` that differs from the CLI's is refused with the versions and paths.
