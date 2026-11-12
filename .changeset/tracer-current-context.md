---
'@pikku/core': patch
---

`Tracer` gains an optional `currentContext()`: the context of the span whose work is running, so a service built at startup (no wire in hand) can parent a client span on it. `OtlpTracer` already had it; `RecordingTracer` now takes an optional `contextStorage` and implements `runInSpan` and `currentContext` the same way. A tracer that wraps another one must forward it. The OTLP attribute allow-list adds `server.address` (string, hostname only), `server.port` (int), `pikku.network.rule` (string) and `pikku.network.blocked` (bool); `url.full`, `url.path` and `url.query` stay dropped.
