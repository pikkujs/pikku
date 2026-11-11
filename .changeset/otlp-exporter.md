---
'@pikku/core': patch
---

Add the `@pikku/core/otlp` subpath: a dependency-free OTLP/HTTP protobuf exporter (`OtlpHttpExporter`), an `OtlpTracer`, an `OtlpLogger`, process metrics, and `createRuntimeTelemetry(env, options)`, which reads `PIKKU_OTLP_*` and refuses a non-loopback endpoint unless `PIKKU_OTLP_ALLOW_REMOTE=1`. Add protobuf decoders (`decodeTraces`, `decodeLogs`, `decodeMetrics`) to `@pikku/core/testing`.
