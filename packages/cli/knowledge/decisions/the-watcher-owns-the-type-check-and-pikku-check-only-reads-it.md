---
type: decision
title: The watcher owns the type check, and pikku check only reads the result
description: A warm checker in a worker process answers after each change; pikku check reads .pikku/status.json and never reports a result older than the newest edit.
tags: cli, watch, dev, typecheck
---

# The watcher owns the type check, and pikku check only reads the result

Build agents re-ran `pikku all` and `tsc` after each edit, 126 calls across one
test round. The watcher already knows when files change, so it does that work
once and `pikku check` asks for the answer.

The checker is a builder program kept in a worker process, not `tsc --watch`.
Each check compares file times itself, so a result cannot depend on a file event
having arrived, which `tsc --watch` would need the caller to wait for after
codegen writes. The worker is a hidden argument to `bin/pikku.ts` because the
`bun --compile` binaries carry only that entry point.

The builder cannot see a failing import become resolvable: nothing it tracks
changed. After a run with an unresolved import the next check drops the builder
and keeps the parsed files. Installing a package does the same through the
lockfile's time.

`pikku watch` codegen moved to the same child process as `pikku dev`, so that both
share one loop and report diagnostics the same way. In-process, the logger's
diagnostics also never cleared between passes.

Whether a file counts is judged below the watched root only. A project under
`~/.pikkustudio/local` has a dot directory above it, and a rule applied to the
whole path ignores every file in it.
