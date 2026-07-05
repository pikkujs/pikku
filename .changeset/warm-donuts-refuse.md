---
'@pikku/core': patch
'@pikku/queue-pg-boss': patch
---

fix workflow step retry backoff firing immediately

- `@pikku/queue-pg-boss`: `backoff: 'exponential'` mapped to `retryBackoff: true` without a base `retryDelay`; pg-boss computes exponential backoff as `retry_delay * 2^n` with a queue default of 0, so every retry fired immediately. Exponential backoff now gets a 1s base delay, and sub-second fixed delays round up to 1s instead of flooring to 0 (= immediate).
- `@pikku/core`: a duration-string `retryDelay` (e.g. `'15s'`) on a workflow step was silently dropped (only numbers were honored) and fell back to exponential. It now resolves to a fixed backoff via `getDurationInMilliseconds`.
