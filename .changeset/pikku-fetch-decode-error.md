---
'@pikku/fetch': patch
'@pikku/cucumber': patch
---

Decode error responses into a typed `PikkuFetchError` instead of throwing the raw `Response`. `CorePikkuFetch.api`/`uploadFile` now throw a real `Error` carrying the server's `message` and `name` plus `status`/`response`, so `mutation.error.message` shows the actual failure rather than `[object Response]`. `PikkuFetchError` is exported for `instanceof`/status checks.
