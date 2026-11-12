---
type: decision
title: A log line carries the attributes of the span it is written in
description: OtlpLogger copies a fixed list of the current span's attributes onto each record, under the span's own names, so logs group and filter like spans without PIKKU_OTLP_LOG_FIELDS
tags: core
---

# A log line carries the attributes of the span it is written in

A record that left only a body and a trace id could not be grouped by function or
wire, or filtered by organisation: those facts were on the span, and a log read
back by the same screens had none. `PIKKU_OTLP_LOG_FIELDS` is no answer: it
exports whatever an object holds, which is why it is off by default.

`OtlpTracer` remembers each span's attributes by its `TraceContext` (a
`WeakMap`, so it lives as long as the context does). `OtlpLogger` is given
`contextAttributes(context)` and, when a record is written inside a span of its
own trace, copies `CONTEXT_ATTRIBUTES` from it: `pikku.function.id`,
`pikku.function.version`, `pikku.wire.type`, `pikku.wire.id`, `pikku.user.id`,
`pikku.org.id`, `pikku.impersonated`, `pikku.impersonated.by`. They are the span's own names so one column serves both. The
list is fixed: a span's other attributes (a route, a duration, a queue) are not
part of a log line.

Limits. `pikku.user.id` and `pikku.org.id` are written to the span when it ends,
so a line logged while the function runs does not have them yet. A logger
`scope`d to another trace carries nothing of the current span. `pikku.function.version`
is the `vN` of a versioned function id and is absent for an unversioned one.

A log written inside a child span that is not a function span (for example a `db.select` span a service opens) carries the attributes of that span, which has no `pikku.function.id`, so such a line has no function or wire attributes. Only a line written in the function's own span, or with no inner span open, carries them.
