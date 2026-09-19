---
'@pikku/core': patch
---

Telemetry middleware now records `errorStack` alongside `errorMessage`, so an observability backend has the stack of a failed invocation and not only its message.
