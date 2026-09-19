---
'@pikku/cli': patch
---

Make the native CLI binaries report the exit code a command set. The compiled entry ended in a hardcoded `process.exit(0)`, so every non-zero `process.exitCode` — a failed `knowledge validate`, a missing milestone on `knowledge plan show` — left the binary exiting 0 while printing a failure. The node entry already did this correctly, so only the `bun --compile` builds were affected.
