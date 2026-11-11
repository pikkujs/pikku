---
type: decision
title: the pikku bin re-runs itself on bun below Node 24
description: the CLI keeps its node shebang; on Node older than 24 (no node:sqlite) it re-executes the same entry under bun, and refuses with a clear message when bun is missing
tags: cli, bin, runtime, node, bun, sqlite
---

# The pikku bin re-runs itself on bun below Node 24

`packages/cli/bin/pikku.ts` decides with `decideRuntime`
(`packages/cli/src/utils/runtime-check.ts`) before it imports the CLI:

- on bun, or on Node 24 and later, it runs;
- on an older Node it spawns `bun <this entry> <args>` with inherited stdio,
  exits with the child's code (or re-raises its signal), and forwards SIGTERM
  and SIGHUP — not SIGINT, which the terminal already delivers to the child;
- if bun is not on PATH, or the process is already the re-executed child
  (`PIKKU_RUNTIME_REEXEC=1`) and still old Node, it prints which Node it found
  and the two ways out, and exits 1.

**Why:** the CLI opens SQLite through `node:sqlite`, unflagged only from Node 24.
Projects worked around the shebang with `bunx --bun pikku …` in every script and
a `scripts/dev.mjs`; forgetting `--bun` once gave
`ERR_UNKNOWN_BUILTIN_MODULE: No such built-in module: node:sqlite`, which reads
like a broken install. With the hand-over in the bin, a scaffolded project's
script is plain `pikku dev`.

**Rejected:** a `#!/usr/bin/env bun` shebang (breaks every Node-only user and
`npx`), and failing with a message only (still leaves every project carrying
`--bun`).
