---
"@pikku/cli": patch
"@pikku/inspector": patch
---

Restore the default CLI log level to `info` (it had been raised to `warn`, which silently hid the command completion summary — `pikku all` printed only the logo and warnings). `info` is the minimum useful output: the completion summary plus any warnings. `--silent` still suppresses everything and JSON output is unaffected (logs go to stderr, command data to stdout).

Move the inspector's `[TIMING]` schema-generation logs from `info` to `debug` so they only appear with `--verbose`, keeping default output to the summary + warnings.
