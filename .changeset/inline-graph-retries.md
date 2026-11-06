---
'@pikku/core': patch
---

An inline graph node now honours its `retries` and `retryDelay`, as it does on the queue: `retries: 2` gives three attempts. A node that declares no retries still runs once inline.
