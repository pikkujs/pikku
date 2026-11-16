# Per-function spans: `telemetry.spans`

## The option

```typescript
export const healthCheck = pikkuSessionlessFunc({
  telemetry: { spans: 'off' },
  func: async () => ({ ok: true }),
})

export const search = pikkuFunc({
  telemetry: { spans: { sample: 0.1 } },
  func: async (services, data) => { ... },
})
```

| value          | meaning                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| unset / `'on'` | Record, unless the caller's trace is unsampled. Unset is exactly today's behaviour.                    |
| `'off'`        | Never record this function, nor the calls it makes (unless one of them is `'always'`).                 |
| `'always'`     | Record even under an unsampled caller, and record the calls it makes.                                  |
| `{ sample }`   | When the call starts a trace, record it with probability `sample` (0 to 1). Under a caller, follow it. |

`addFunction` refuses anything else at registration, naming the function: an
unknown string (`'errors'`, `'ON'`), a `sample` that is not a number from 0 to 1
(`NaN`, `-0.1`, `1.5`, `'0.5'`), or an unknown key.

## How the decision is made

The decision is made once, when the call starts, by `decideFunctionTrace` in
`runPikkuFunc`, before the span would open. It reads `funcConfig.telemetry`
(then the generated meta's `telemetry`), and the result is only
`wire.trace.sampled`:

- Unset and `'on'` return the trace untouched: two property reads, no
  allocation.
- When the result is unsampled, `openFunctionSpan` and `startBoundarySpan`
  return before calling the tracer, so no span object is built for the
  function, its queue publishes, scheduled RPCs or webhook sends.
- The wire's original trace is restored when the call ends.

| setting       | head of a trace         | sampled caller | unsampled caller               |
| ------------- | ----------------------- | -------------- | ------------------------------ |
| unset, `'on'` | record                  | record         | nothing                        |
| `{ sample }`  | record with probability | record         | nothing                        |
| `'off'`       | nothing                 | nothing        | nothing                        |
| `'always'`    | record                  | record         | record, as a root of the trace |

"Head of a trace" means the trace has no `parentSpanId`: an HTTP request
without a trusted inbound `traceparent`, a scheduled task, or a queue job or
workflow run that carried no trace.

## Children follow the parent

The sampled flag already travels everywhere a trace does: `formatTraceparent`
writes it as `traceparent` flags `00`/`01` and `parseTraceparent` reads it back.
So a local `rpc.invoke`, a queue job, a scheduled RPC, a workflow started by
the call (every step continues the run's stored `traceparent`), and a remote
addon call all inherit the decision. No new carrier was added. `OtlpTracer`
already exports nothing for an unsampled context.

A child does not make its own decision with `'on'` or `{ sample }`. Only two
settings override the parent:

- **`'off'` wins over an `'always'` parent** for that child and its subtree.
- **`'always'` wins over an unsampled parent.** The forced span keeps the
  caller's trace id and its own span id, drops `parentSpanId`, and stores the
  caller's span id in the attribute `pikku.trace.unrecorded_parent_span_id`.
  Telemetry stores treat a span with no `parentSpanId` as a root
  (`isRoot = !parentSpanId`), so it appears in the trace list and the trace
  view. A dangling parent id would hide it from every root-span view. Keeping
  the trace id keeps the unrecorded caller's logs, which are still exported
  with that trace id, in the same trace. Its children are ordinary children of
  the forced span.

## What it does not change

Only spans. Logs (still exported, still scoped to the trace id), audit entries,
analytics records, the number of times the function runs, and the error the
caller sees are the same for every setting. `function-telemetry.test.ts`
asserts this for every value, on success and on failure.

**Known gap: Studio's counts come from root spans.** The telemetry store's
`metricsSummary` (requests, errors and average duration per function) and
`failures` (the failures list) are computed from root spans. Core emits no
per-call metric today. So `'off'` or `{ sample }` on a function that starts
traces lowers its request and error counts in Studio and hides its failures
from the failures list. `'on'` and `'always'` are safe. The follow-up below
fixes it.

## `'errors'` is not in this PR

`'errors'` would keep a call's span only if the call fails. Spans are exported
when they end, so by the time the call decides, its children are already
exported (or, if they were held back as unsampled, already gone). Doing it
properly means buffering the whole subtree in memory until the head span ends,
and dropping it on success. That is a tail sampler, not a flag check, and the
error loop does not need it: errors are already logged with the trace id. It
can be added later as a `Tracer` that buffers per trace, without changing this
option's shape.

## Follow-up: per-call metric

Not built here. The runner emits a `pikku.function.calls` sum for every call,
whatever the span setting, with the attributes `pikku.function.id`,
`pikku.wire.type` and `pikku.outcome` (`ok` / `error`). `metricsSummary` and
`failures` read that metric instead of root spans. Then a function's counts no
longer depend on whether it was traced.

## Follow-up: live override from Studio

Not built here. Studio holds a rules table that wins over the code value:

| function id | spans      | expires at |
| ----------- | ---------- | ---------- |
| `search`    | `'always'` | +30 min    |
| `health`    | `'off'`    | +1 day     |

- Every rule has a TTL, so a debug `'always'` cannot be forgotten in
  production.
- Only Studio, authenticated as Studio, can write rules. The runtime pulls
  them; there is no inbound write endpoint on the app.
- The rules are read into a map keyed by function id. The runner looks the
  function up before `decideFunctionTrace`: one map lookup on the hot path.
- Fail closed to the code default: rules that cannot be fetched, are
  expired, or fail validation are ignored, and the code value (or today's
  default) applies.
- The generated meta's `telemetry` lets Studio show the code value next to
  the override.

## Metadata

Both inspectors (Go and Rust) write the setting to the function's metadata
when it is a literal, in the same shape as the option:

```json
{ "pikkuFuncId": "search", "telemetry": { "spans": { "sample": 0.1 } } }
```

A value they cannot read statically, or an invalid literal, is left out of
the metadata. `addFunction` still validates it at runtime.
