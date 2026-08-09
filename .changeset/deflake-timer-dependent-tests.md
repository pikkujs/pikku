---
---

Tests only: the channel RPC timeout tests drive the clock with `t.mock.timers`
instead of waiting on an unref'd real timer, and the KEK derivation test
calibrates against measured work instead of a fixed wall-clock budget. Both
were intermittently red under load. No published package changes.
