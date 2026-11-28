---
'@pikku/core': patch
---

`@pikku/core/services/wiring-service` no longer exports a second `NotFoundError`. It extended `Error`, was never thrown by `WiringService`, and shared its name with the registered `NotFoundError` in `@pikku/core/errors` (404), so an `instanceof` check against one silently failed for the other.
