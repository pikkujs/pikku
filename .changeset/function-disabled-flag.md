---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

Functions take `disabled: true | 'reason'`. A disabled function is left out of the build entirely (meta, RPC maps, clients, addon SDKs, MCP, CLI, HTTP and every wiring) and `addFunction` refuses it at run time. Anything that still references one — a wiring, `rpc.invoke('name')`, a workflow step, an agent tool, or an inline definition inside a wiring — fails the build with `PKU562`, naming both sides. `pikku all` lists the disabled functions once, with file and reason.

`pikku verify` now fails on an app function that is not wired, exposed or called by name (`PKU563`, an `error` diagnostic that `pikku all` prints but does not fail on). Addon functions are never checked; workflows are, and count as used when started by a literal name (`rpc.startWorkflow`, `workflowService.startWorkflow` / `runToCompletion`, `rpc.invoke`, a workflow step). Use the function or mark it `disabled`.

An inline `defineChannelRoutes({...})` inside `wireChannel`'s `onMessageWiring` is now read, so its message routes reach the channel meta.
