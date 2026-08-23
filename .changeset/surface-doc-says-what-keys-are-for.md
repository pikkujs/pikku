---
'@pikku/core': patch
'@pikku/cli': patch
---

Say what each wiring key is for, and gate it so it stays said

The public surface doc listed keys as a name and a type. `schedule: string`
is a shape; what a caller needs is that it wants a cron expression. Written
as JSDoc where the type is declared, it reaches `pikku doc`, the IDE and the
console at once — 31% of keys carried one, now 64%.

`CoreHTTPFunctionWiring` was six near-identical union branches, so its keys
could not be documented once. It is now a shared object intersected with the
two unions that are genuinely correlated: `auth` with the kind of function it
admits, and the method with `sse` and `query`.

A test reads the shipped surface and holds three numbers: keys that say what
they are for can only go up, and references to a `Core*` internal or to a type
the doc never describes can only go down.

Drops `eventChannel` from HTTP wirings and `graph` from triggers; nothing read
either.
