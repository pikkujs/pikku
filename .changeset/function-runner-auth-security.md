---
"@pikku/core": patch
---

Fix security issue in `function-runner`: functions declared with `pikkuFunc` (which always require a session) now always throw `ForbiddenError` when called without a session, even if the wiring has `auth: false`. Previously a misconfigured wiring could bypass authentication entirely — the runner only logged a warning instead of blocking the call.
