---
'@pikku/core': patch
---

Add `RateLimitService`, a fixed-window hit counter shared by every process on the same store, and `InMemoryRateLimitService`, which counts in one process. `hit(key, limit, windowMs)` counts and compares in one step, and a refused hit is not counted. `rateLimitService` joins the optional singleton services.
