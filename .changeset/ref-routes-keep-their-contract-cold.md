---
'@pikku/inspector': patch
---

Keep an addon function's contract on a route that reaches it through `ref()`, whether or not `.pikku` already exists.

The input and output types were read off the type checker, which can only see them once the consumer's own RPC map already lists the addon's functions — that is, on the second run. A first, cold generation widened the route's input to the whole `FlattenedRPCMap`, so the same sources produced a different http-map on CI than on a developer's machine, and a client compiled against the good one failed to build against the other. The addon's own metadata says what the contract is either way, and its published declaration file is where those names live.
