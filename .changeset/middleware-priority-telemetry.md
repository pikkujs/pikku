---
"@pikku/core": patch
---

Add middleware priority system and telemetry middleware. Middleware now supports named priority levels (highest, high, medium, low, lowest) that control execution order regardless of registration order. Includes telemetryOuter and telemetryInner middleware for observability instrumentation via structured console.log output.
