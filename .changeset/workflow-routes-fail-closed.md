---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/addon-console': patch
---

A workflow or agent with `auth` unset now requires a session, like any function, and only an explicit `auth: false` is anonymous. The generated routes take an optional session and leave the decision to the declaration: they reach only `expose: true` names, and a start runs the workflow's auth, scopes, permissions and input validation at the request, for DSL workflows and graphs, so a refused start leaves no run. Status, streams and approve look the workflow up by name, confirm the run belongs to it and apply its declaration. A run with an owner is only for that owner, and a checked start lets a queued signed-in run work with no `sessionStore`. Schedules and triggers with no user need `auth: false`; see `docs/MIGRATION.md`.
