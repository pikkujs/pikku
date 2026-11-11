---
type: decision
title: The function runner owns the span; middleware cannot
description: The runner opens the span after the wire has its trace and ends it in the same finally that restores the wire, so every invocation is recorded once, whatever middleware does
tags: core
---

# The function runner owns the span; middleware cannot

`runPikkuFunc` opens one span per invocation from `singletonServices.tracer`,
using the ids already on `wire.trace`: the tracer never mints ids, so the span
tree is the trace tree every runner and RPC call already builds. The span wraps
the whole middleware chain; the function body alone is the attribute
`pikku.function.duration_ms`, measured around `funcConfig.func`.

It replaced the `telemetryOuter` and `telemetryInner` middleware. Middleware is
the wrong owner for three reasons: it is opt-in per app, so an invocation that
forgot it left a hole; a middleware that throws before `next()` hides the
invocations after it; and a `highest`/`lowest` priority is a convention, not a
bracket. The runner ends the span in the `finally` that calls
`restoreInvocationWire`, so success, a thrown error, `MissingSessionError` and an
abandoned run are all recorded, and the error is rethrown unchanged.

An unsampled trace (`trace.sampled === false`) opens no span at all. With no
tracer the cost is one property read.

**What this rules out:** reintroducing a timing middleware, letting a middleware or
a function body start the invocation's span, and ending the span anywhere other
than the runner's `finally`.
