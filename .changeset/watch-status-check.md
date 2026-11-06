---
'@pikku/cli': patch
'@pikku/inspector': patch
---

Add `pikku check`, which answers whether the project builds and type-checks without doing the work again. `pikku watch` and `pikku dev` now keep a warm type checker covering the backend and every frontend, and publish the result to `.pikku/status.json`. `pikku check` reads that, waits only if the watcher is working on the latest files, never reports a result older than the newest edit, and fails naming the stage if the watcher is stuck (`--timeout`, default 120 seconds). With no watcher running it does one full `pikku all` and `tsc`. `--json` is available. `CodedDiagnostic` gains optional `file`, `line` and `column`.
