---
'@pikku/inspector': patch
---

Let a generated file declare scopes, roles and personas without taking the
single-declaration slot.

`defineScope`, `defineSystemRole` and `definePersonas` are one-per-codebase, and
the CLI generates declarations of its own — `user-admin.gen.ts` ships the whole
`admin` scope tree. Any project that scaffolded one therefore had two
declarations and failed codegen with PKU583, and the losing file's scopes were
dropped from the metadata rather than merged.

The rule exists to name the one place a person reads from and adds to, and
nobody adds to a file the next codegen run overwrites. A generated declaration
is still extracted; it just neither claims the slot nor collides with the app's
own.
