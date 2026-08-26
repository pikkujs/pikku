---
'@pikku/inspector': patch
---

Record `rpc!.invoke(...)` as an invocation

`rpc` is optional on the wire, so a caller that knows it is there writes
`rpc!.invoke('someFunction', …)`. The inspector matched the receiver as a bare
identifier, but a non-null assertion is a node of its own wrapping that
identifier, so those call sites were never recorded.

That is silent rather than loud. An invocation is what puts a function that is
not `expose: true` into the runtime registry, so the target was left
unregistered and the dispatch failed with `Function not found` — at run time,
on a call site that type-checked.

The generated virtual-user scaffold dispatches exactly this way, which meant
`executeVirtualUserRun` was never registered: every virtual-user run sat at
`running` forever with nothing logged, because the scaffold's own
`.catch(() => {})` swallowed the rejection.

The receiver is now unwrapped through non-null assertions and parentheses
before it is matched.
