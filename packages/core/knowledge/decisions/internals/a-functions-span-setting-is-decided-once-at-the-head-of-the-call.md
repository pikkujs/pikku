---
type: decision
title: A function's span setting is decided once, when the call starts, and travels in the trace's sampled flag
description: telemetry.spans rewrites wire.trace.sampled before the span would open; children follow that flag through traceparent, except that 'off' always stops recording and 'always' always starts it as a new root of the same trace
tags: core
---

# A function's span setting is decided once, when the call starts, and travels in the trace's sampled flag

`pikkuFunc({ telemetry: { spans } })` is read by `runPikkuFunc` right after the
wire has its trace and before `openFunctionSpan`. `decideFunctionTrace` returns
the trace the invocation runs under. An unset or `'on'` setting returns the same
object, so the common case is two property reads and allocates nothing. Any
other result is a copy, put on the wire for the call and restored in the same
`finally` that restores `functionId`.

The decision lives only in `trace.sampled`. `openFunctionSpan` and
`startBoundarySpan` already return before touching the tracer when it is false,
and `formatTraceparent` already writes it as flags `00`/`01`, so a local RPC, a
queue job, a scheduled RPC, a workflow started by the call and a remote addon
call all inherit it without any new carrier.

| setting       | no caller (head of the trace) | sampled caller | unsampled caller               |
| ------------- | ----------------------------- | -------------- | ------------------------------ |
| unset, `'on'` | record                        | record         | nothing                        |
| `{ sample }`  | record with probability       | record         | nothing                        |
| `'off'`       | nothing                       | nothing        | nothing                        |
| `'always'`    | record                        | record         | record, as a root of the trace |

"No caller" means `trace.parentSpanId` is absent: a request with no trusted
inbound `traceparent`, a scheduled task, a queue job or workflow run that
carried no trace.

`'always'` under an unsampled caller keeps the trace id and the span id and
drops `parentSpanId`, and records the caller's span id as the attribute
`pikku.trace.unrecorded_parent_span_id`. A span whose parent was never exported
is not a root to a telemetry store (`isRoot = !parentSpanId`), so it would be
missing from every root-span view. Keeping the trace id keeps the logs the
unrecorded caller wrote, which are still exported with that trace id, in the
same trace.

An explicit `'off'` wins over an `'always'` caller for that child and its own
subtree, so a function marked `'off'` is never recorded unless something below
it is `'always'`.

**What this rules out:** a tracer-side sampler that makes its own decision per
span (children would disagree with their parents), a sampled flag on anything
other than `TraceContext`, and making `'off'` or `{ sample }` change logs,
audit entries, analytics or the error a caller sees.

`'errors'` (keep the span only when the call fails) is not offered. Spans are
exported when they end, so the children of a call that later succeeds are
already gone by the time the parent decides; keeping them would need buffering
the whole subtree until the head span ends.
