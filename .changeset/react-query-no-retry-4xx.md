---
'@pikku/cli': patch
---

The generated `usePikkuQuery` no longer retries a 4xx. A missing record or a refused permission shows at once instead of after three retries. Pass `retry` in the options to override it.
