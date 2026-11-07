---
type: decision
title: The CLI's native binaries are compiled only when asked for
description: A normal build compiles none; PIKKU_CLI_BINARIES=host or all opts in, and release sets all on both builds it runs
tags: cli, build, release, ci
---

# The CLI's native binaries are compiled only when asked for

`packages/cli/build.sh` compiled all four `release/binaries/pikku-*` on every
build, about 400 MB in each worktree. Their only readers are the publish
workflow's GitHub Release upload and Homebrew cask steps, so a normal build now
compiles none.

| `PIKKU_CLI_BINARIES` | Compiles              | Used by                                     |
| -------------------- | --------------------- | ------------------------------------------- |
| `none` (default)     | nothing               | local builds, every worktree                |
| `host`               | this machine's target | the PR Build job                            |
| `all`                | every released target | `bun run release`, the Full Suite Build job |

A default of `host` was rejected: it would still leave about 85 MB in every
worktree for a file nothing local runs. PR CI keeps the proof that the CLI
bundles by asking for `host`, and the Full Suite asks for `all` because Publish
only runs after it passes.

`all` is set twice in the root `release` script, and both are needed. The CLI's
`prepublishOnly` runs `build.sh` again during `changeset publish`, and that
second run writes the files the workflow uploads. Without the second `all`, it
would clear the directory and leave nothing to upload.

`release/binaries` is cleared on every build, so nothing older than the current
build can be uploaded. The upload step fails if any of the four is missing, and
a requested compile fails rather than skips when bun is absent.
