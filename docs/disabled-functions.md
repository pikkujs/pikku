# Disabled and unused functions

## `disabled`

Every function definer (`pikkuFunc`, `pikkuSessionlessFunc`, `pikkuWorkflowFunc`, ...) accepts `disabled`:

```typescript
export const oldReport = pikkuSessionlessFunc({
  disabled: 'replaced by liveReport', // or `true`
  func: async () => 'old',
})
```

A disabled function is left out of the build completely: function meta, RPC maps, clients, addon contracts and SDKs, MCP, CLI, HTTP and every other wiring. `addFunction` throws for it at run time, so it cannot be called.

Anything that still references a disabled function fails the build with `PKU562`, naming the disabled function's file and the reference's location:

- a wiring or any other code that references it
- `rpc.invoke('oldReport')` / `rpc.mesh('oldReport')`
- a workflow step that calls it
- a disabled function defined inline in a wiring

`pikku all` prints one warning listing the disabled functions, each with its file and reason.

`disabled` must be `true`, `false` or a string literal. A computed value is refused (`INVALID_VALUE`) and the function is treated as disabled.

## Unused functions

`pikku verify` fails on an app function that nothing uses: not wired to any transport, not exposed (`expose`, `remote`, `mcp`), and not called by name (`rpc.invoke`, workflow steps, agent tools). `pikku all` reports each one as `PKU563` at `error` severity but still builds.

Scenarios, workflows and inline wiring functions are never reported. Neither are addon functions: an addon project is never checked, and an app is checked only for its own functions.

Fix it by using the function or marking it `disabled`.
