---
'@pikku/core': patch
---

`--json` now serialises the result of any command, not only the eleven that ship a renderer of their own.

The flag swapped in the JSON renderer only when a command-specific renderer existed, so on the other 94 commands it fell through to the program's default renderer — which prints forwarded log lines and drops anything else. `pikku info functions --json` therefore exited 0 and printed no JSON at all, which reads as "this command has no output" rather than as an unsupported flag.
