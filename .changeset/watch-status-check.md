---
'@pikku/cli': patch
'@pikku/inspector': patch
---

Add `pikku check`, which answers whether the project builds and type-checks without doing the work again. `pikku watch` and `pikku dev` now type-check the backend and every frontend with the project's own `tsc`, one process per project in parallel, killing any a newer edit supersedes, and publish the result to `.pikku/status.json`. `pikku check` reads that, waits only if the watcher is working on the latest files, never reports a result older than the newest edit, and fails naming the stage if the watcher is stuck (`--timeout`, default 120 seconds). Each frontend's `paraglide` or `i18n:compile` script runs before the type check when its messages change. With no watcher running it does one full `pikku all`, message compile and `tsc`. `--json` is available. `CodedDiagnostic` gains optional `file`, `line` and `column`. When codegen fails, `pikku check` now lists the run's real errors, causes first and without stack frames. `pikku all` recovers on its own from a generated variables or secrets file that imports something the project removed, and a second `pikku all` on the same output directory waits instead of corrupting it. Both also generate a TanStack Router route tree before the type check, so `pikku check` no longer depends on a running Vite.

An idle watcher now catches up on files written behind a run even when no file event arrives, and `pikku check` wakes it instead of timing out.
