---
'@pikku/core': patch
'@pikku/inspector-go': patch
---

`pikkuFunc({ telemetry: { spans } })` sets whether a function's invocations record a span: `'on'` (the default: record unless the caller is unsampled), `'off'` (never, nor the calls it makes), `'always'` (record even under an unsampled caller, as a root of the same trace, and record the calls it makes) or `{ sample: p }` (record a call that starts a trace with probability `p`, from 0 to 1; under a caller, follow it). The decision is made once when the call starts and carried in the trace's sampled flag (`traceparent` flags `00`/`01`), so RPC calls, queue jobs, scheduled RPCs and workflows started by the call follow it. Logs, audit entries, analytics and errors are unaffected. `addFunction` refuses an invalid value. Both inspectors write the setting to the function's metadata as `telemetry`.
