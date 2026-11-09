---
'@pikku/cli': patch
'@pikku/skills': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
---

Add `pikku graph <functionId>`, which joins the generated meta for one function: the routes, channels, schedulers, queues, triggers, MCP and CLI wirings, workflow steps, agent tools and functions that call it, what it invokes or starts, and the permissions and middleware that gate it. Add `--json` for the full record. The output has no `unresolved` section: the build refuses what would hide an edge, and the command prints nothing but the graph on stdout (no banner). An unknown id lists near matches.

The inspectors (Go and Rust) now fail the build on four code gaps, all critical with no opt-out. `PKU941`: `rpc.invoke`, `rpc.mesh` and `rpc.startWorkflow` with a computed name (it was a warning; a `const` string literal is accepted). `PKU942`: handing the wire itself (`wire`, `rpc`, `http`, `channel`, `queue` and the other capability members, matched by symbol) to a function declared outside the handler, as an argument to a call or `new`. Closures that only call the wire, functions declared inside the handler, data read from a wire, and callees declared in a `@pikku/*` package are allowed. `PKU943`: a computed rpc name in `workflow.do` or `workflow.expectEventually`. `PKU944`: an `invokes` or `startsWorkflows` name that is not a function, workflow or wired addon function. See `docs/MIGRATION.md`.
