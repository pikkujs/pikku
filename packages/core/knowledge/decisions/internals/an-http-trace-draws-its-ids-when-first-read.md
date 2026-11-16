---
type: decision
title: An HTTP trace draws its ids when first read
description: resolveHTTPTrace returns a trace whose ids are drawn on first read and then stable; the HTTP wire's traceId reads through it
tags: core, http, tracing, performance
---

# An HTTP trace draws its ids when first read

A new HTTP trace used to draw two random ids (16 and 8 bytes) for every request,
about 2 microseconds of an authenticated request, though a request with no tracer
and no error reads neither.

`resolveHTTPTrace` now returns, for a request that carries no usable trace, a
`TraceContext` whose `traceId` and `spanId` are own enumerable accessors: the
first read draws the id and every later read returns the same one. Setters exist
so `adoptTraceparent` can replace the ids in place after mesh auth. The HTTP
wire's `traceId` is an accessor over the same trace. A `traceId` handed in by the
runtime and a trusted inbound `traceparent` are concrete values, as before.

This is not "generate only when a tracer is active". Every consumer reads through
the accessor, so an id is drawn exactly when something uses it: an error response
(`errorId`, and the `Error id:` log line), the scoped logger, a tracer span, a
queued job's `traceparent`, an audit or analytics row, a workflow start. The
consumers were enumerated; none needs the id before it reads it.

Only the HTTP runner is lazy. `createTrace`, `continueTrace` and `traceWire`, used
by queue, scheduler, workflow, RPC, channel and MCP wires, still draw eagerly.

Gotcha: a lazy trace is not a plain data object. Spread and `Object.assign` work
and draw the ids; anything that compares the identity of the id before it is read
sees `undefined` only if it bypasses the accessor, which nothing does.
