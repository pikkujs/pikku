---
type: decision
title: A span's attributes are an allow-list
description: Core sets a fixed set of framework facts on a span and nothing else, so no input, header, query or stack can reach a telemetry store
tags: core
---

# A span's attributes are an allow-list

The function runner (`function/function-span.ts`) sets span attributes by name
from a fixed table: wire type and id, function id, package, addon namespace,
whether the trace is a root, `pikku.function.duration_ms`, `pikku.user.id`,
`pikku.org.id`, the HTTP method, route and status, queue name and job id,
scheduler task, workflow name, run id and step, channel id, MCP tool. Every value
is an id or a number the framework already holds.

Nothing is derived from function input, query parameters, headers, cookies or the
session beyond the two ids. An error leaves only as `Name: message`, cut to 256
characters, plus `exception.type`/`exception.message`: never `exception.stacktrace`,
because stacks carry file paths and, for some errors, interpolated input.
`redactSpanError` in `tracer.ts` is the only place an error becomes span text,
and `Span.end` applies it, so a caller cannot hand a raw error to a sink.

`SPAN_LIMITS` (64 attributes, 128-char keys, 1024-char strings, 32 events) are
enforced by the `Span` implementation through `setBoundedAttribute`, not by the
exporter, so an oversized value never reaches a queue.

**What this rules out:** an "include the request body" or "include headers" option,
a catch-all `attributes` bag on the runner, and putting the stack on the span for
debugging. A new attribute is added by name in core, with a reviewer reading it.
