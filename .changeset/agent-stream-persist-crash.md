---
'@pikku/core': patch
---

Stop a failed message persist during an agent stream from killing the process.

The persisting channel flushes from inside `send`, which is synchronous and so cannot await the flush. Any rejection — a dropped storage connection, or a model reusing a `toolCallId`, which is a primary key in AI storage — escaped as an unhandled rejection and took the whole server down. Persistence from `send` is now best-effort and logged; the awaited `flush()` on the suspend paths still surfaces failures to its caller.
