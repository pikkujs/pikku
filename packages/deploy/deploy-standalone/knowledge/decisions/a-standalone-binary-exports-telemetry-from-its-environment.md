---
type: decision
title: A standalone binary exports telemetry only when its environment asks
description: The generated entry builds runtime telemetry from PIKKU_OTLP_* and passes the tracer to the logger, the database and the services
tags: deploy-standalone
---

# A standalone binary exports telemetry only when its environment asks

The generated entry calls `createRuntimeTelemetry` from `PIKKU_OTLP_*` before it
builds the logger, the database and the services, so all three share one tracer.
With no `PIKKU_OTLP_ENDPOINT` the telemetry is inert and the binary opens no
connection. The loopback guard stays: a non-loopback endpoint needs
`PIKKU_OTLP_ALLOW_REMOTE=1` and https, and credentials in the URL are refused. A
refusal is fatal at boot, because silently dropping telemetry the operator asked
for is worse than not starting.

`PIKKU_OTLP_HEADERS` applies to every signal; `PIKKU_OTLP_{TRACES,LOGS,METRICS}_HEADERS`
add to one. GreptimeDB wants `x-greptime-pipeline-name=greptime_trace_v1` on traces
only (logs reject it with a 400), so that header belongs on the traces variable.
Process metrics and an OTLP log sink are wired in the entry; shutdown flushes them
in `afterStop`.
