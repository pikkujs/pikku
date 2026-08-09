---
'@pikku/core': patch
---

Move the adapter surface to `@pikku/core/ecosystem` so the root can promise stability

The types and helpers a runtime adapter, a service package, the code generator and the CLI implement against sat on the package root, mixed in with the API application code uses. That made the root impossible to commit to: `runPikkuFunc` was reshaped repeatedly over the last year while every field on `PikkuWire` survived untouched, and promising stability on both would mean promising the weaker of the two.

They now live on `@pikku/core/ecosystem`. The root is what 0.13's compatibility promise covers.

Not `/internal`: generated bootstrap files import from here, so the specifier lands in the user's own `.pikku` directory — telling someone they are touching internals when the code generator put it there is both wrong and self-defeating. Not `/runtime` either: that reads as runtime-versus-compile-time, `packages/runtimes/*` already claims the word, and the CLI is the largest consumer.

`./internal` remains as an alias to the same module, because the pinned bootstrap CLI still emits it.

Breaking for adapter authors; appropriate pre-0.13.
