---
'@pikku/cli': patch
---

Fix: the Pikku CLI no longer force-exits `0`, so a command's `process.exitCode` is honoured (#850)

`bin/pikku.ts` called `process.exit(0)` unconditionally once a command finished,
overriding any exit code the command had set. `pikku userflow run` sets
`process.exitCode = 1` when a flow fails, but the process still exited `0` — so
CI could not gate on a failed user flow. The CLI now exits with
`process.exitCode ?? 0`, making failures observable to CI for every command
(throwing commands already exited non-zero via `CLIError`).
