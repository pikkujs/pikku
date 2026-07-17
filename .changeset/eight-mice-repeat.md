---
'@pikku/inspector': patch
'@pikku/cli': patch
---

feat: propagate an addon's declared scopes to the host

An addon can now declare scopes with `wireScope`, and a host that wires it picks
them up: they merge into the host's `ScopeId` union and its declared set, so a
host function can require an addon scope and the `pikku_scopes` foreign key
accepts granting one. This mirrors how addon secrets and variables are loaded.

The generated `pikku-scopes.gen.ts` now imports its metadata sidecar and derives
`SCOPES` from it, rather than inlining the list. TypeScript only emits a `.json`
into the build output when something imports it, and an addon publishes only
that output — without the import, an addon's scopes never reached a host.
