---
'@pikku/inspector': minor
'@pikku/cli': minor
---

Add a severity model for coded diagnostics so security findings can surface without blocking the dev server.

- `InspectorLogger` gains `diagnostic({ severity, code, message })` (`severity: 'warn' | 'error' | 'critical'`). `critical(code, message)` is now sugar for `diagnostic({ severity: 'critical', ... })`.
- The CLI fails the build only on `critical` diagnostics by default. New global flags `--fail-on-error` and `--fail-on-warn` (implies `--fail-on-error`) opt into stricter gating; `--fail-on-critical` is always on.
- Data-classification leaks (`PKU910`) are now emitted at `error` severity instead of `critical`. They are still printed, but no longer abort `pikku all` / the dev server — pass `--fail-on-error` (e.g. at deploy) to make them blocking and recommend a fix.
- Contract-immutability drift (`PKU861`) during `pikku versions update` (run inside `pikku all`) no longer calls `process.exit(1)`. It is surfaced as an `error` diagnostic and skips saving the manifest, so a stale baseline can't crash-loop the dev server. `pikku versions check` remains the hard gate, and `--fail-on-error` makes `pikku all` block on it at deploy.
