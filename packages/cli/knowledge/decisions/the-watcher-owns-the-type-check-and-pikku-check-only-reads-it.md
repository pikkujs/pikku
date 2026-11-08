---
type: decision
title: The watcher owns the type check, and pikku check only reads the result
description: The watcher runs the project's own tsc after each change; pikku check reads .pikku/status.json and never reports a result older than the newest edit.
tags: cli, watch, dev, typecheck
---

# The watcher owns the type check, and pikku check only reads the result

Build agents re-ran `pikku all` and `tsc` after each edit, 126 calls across one
test round. The watcher already knows when files change, so it does that work
once and `pikku check` asks for the answer.

Each run starts the project's own `tsc --noEmit` once per project, side by side,
and the processes exit with the run, so an idle watcher holds no checker memory.
A newer edit aborts the runs in flight, each
in its own process group so a native child dies with it, and the run starts
again. A result is never trusted to file events alone: `pikku check` compares
file times itself, so a result cannot depend on an event having arrived, which
`tsc --watch` would need the caller to wait for after codegen writes.

`pikku watch` codegen moved to the same child process as `pikku dev`, so that both
share one loop and report diagnostics the same way. In-process, the logger's
diagnostics also never cleared between passes.

What counts as a frontend source is what `tsc` reads, not what people edit:
compiled `.js` under allowJs and `*.gen.ts`. Leaving those out made the status
disagree with a cold `tsc` after `paraglide` recompiled, because neither the
watcher nor `pikku check` noticed the file. `*.gen.*` stays skipped in the codegen
directories only, where counting it would make each pass start the next.

Whether a file counts is judged below the watched root only. A project under
`~/.pikkustudio/local` has a dot directory above it, and a rule applied to the
whole path ignores every file in it.
