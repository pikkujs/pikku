---
type: decision
title: Telemetry never breaks a request
description: Every tracer call the runner makes is wrapped; a tracer that throws is logged once and disabled for the process, and the function's result and error are untouched
tags: core
---

# Telemetry never breaks a request

`openFunctionSpan` and `endFunctionSpan` in `function/function-span.ts` wrap every
call into the injected `Tracer` in try/catch. The first throw is logged once with
`logger.warn` (message redacted) and the tracer goes into a `WeakSet` of disabled
tracers; later invocations skip it without calling it. The function's return value
and the error it throws are never altered by tracing: `failure` is captured by a
catch that rethrows the same object.

The reason is that a tracer is infrastructure injected by the runtime, not app
code. A full disk, a closed socket or a bug in a sink must cost spans, never
requests. Disabling per process (not per call) also stops a broken sink from
logging on every invocation.

**What this rules out:** letting a tracer error propagate "so it is noticed", and
retrying a throwing tracer per call. Loss is made visible by the exporter's own
drop counter, not by failing requests.
