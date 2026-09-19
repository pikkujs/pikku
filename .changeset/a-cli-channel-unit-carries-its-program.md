---
'@pikku/cli': patch
---

Bundle a CLI program into the channel unit that serves it

A `wireCLI` channel deployed as its own unit answered a named command but
reported `Program "<name>" not found` for `__help` and `__raw`, which
resolve against the program rather than against a wiring. CLI programs are
filtered by command name, and a channel unit asked only for its channel and
its handler functions — so every command was dropped and the empty program
with it.
