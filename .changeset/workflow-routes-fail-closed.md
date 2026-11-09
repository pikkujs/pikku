---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/addon-console': patch
---

A workflow or agent with `auth` unset now requires a session, like any function, and only an explicit `auth: false` is anonymous. The generated routes take an optional session and leave the decision to the declaration: they reach only `expose: true` names, through `rpc.exposedAgent` and `rpc.exposedWorkflow`, which hold the `expose` gate the way `rpc.exposed` does, so generated code holds no access logic, and a start runs the workflow's auth, scopes, permissions and input validation at the request, for DSL workflows and graphs, so a refused start leaves no run. Status, streams and approve look the workflow up by name, confirm the run belongs to it and apply its declaration. A run with an owner is only for that owner. A run stores only its owner's user id and loads the session from `sessionStore` every time it executes, running the full checks each time, so a permission revoked mid-run stops it; a run with an owner and no `sessionStore` stops with an error. Schedules and triggers with no user need `auth: false`; see `docs/MIGRATION.md`.
