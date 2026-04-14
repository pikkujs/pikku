---
"@pikku/core": patch
"@pikku/express-middleware": patch
"@pikku/fastify-plugin": patch
"@pikku/uws-handler": patch
"@pikku/next": patch
"@pikku/ws": patch
---

Add middleware priority system, telemetry middleware, and statusCode getter. Middleware now supports named priority levels (highest, high, medium, low, lowest) that control execution order regardless of registration order. Includes telemetryOuter and telemetryInner middleware for observability instrumentation via structured console.log output. PikkuHTTPResponse now exposes a readonly `statusCode` getter across all response implementations.
