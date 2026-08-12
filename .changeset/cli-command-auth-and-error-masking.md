---
'@pikku/core': patch
---

Enforce a CLI command's declared `auth`/`permissions`, and mask CLI channel
errors in production.

A command's declared `auth`/`permissions` were accepted by the types but dropped
in `registerCLICommands`: when the command wrapped a function-config object,
`unwrapFunc` kept only the inner func's fields, so a command-level access-control
declaration was a silent no-op. They are now merged into the config passed to
`addFunction` — command-level winning, falling back to the handler's — so the
function runner enforces them.

The CLI raw channel runner returned the raw exception message to the remote
client. It can carry internals (a stack, a DB error, a path), so it is now logged
server-side and replaced with a generic `Command failed` in production; dev keeps
the message inline.

CWE-862 / CWE-209.
