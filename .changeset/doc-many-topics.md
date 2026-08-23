---
'@pikku/core': patch
'@pikku/cli': patch
---

`pikku doc` takes several topics at once, so an agent that needs two exports
spends one round-trip rather than two.

A variadic positional validated at runtime but not in the types: `[files...]`
resolved to a key literally named `files...`, so declaring one was a type error.
