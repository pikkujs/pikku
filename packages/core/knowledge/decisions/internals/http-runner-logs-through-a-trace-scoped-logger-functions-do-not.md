---
type: decision
title: The HTTP runner logs through a trace-scoped logger, functions do not
description: Only runner-internal logging is scoped to the request id; functions keep the singleton logger for compatibility
tags: http
---

# The HTTP runner logs through a trace-scoped logger, functions do not

`fetchData` in `packages/core/src/wirings/http/http-runner.ts` derives
`scopedLogger` from `singletonServices.logger.scope?.(requestId)` and uses it for
route-matching and error-handling output only. Functions and middleware continue
to receive `singletonServices.logger` unscoped, via the services object.

The split is deliberate, not an oversight. `scope` is optional on the `Logger`
interface, so a runtime supplying a plain logger still works — the runner falls
back to the singleton. Threading the scoped logger into the services object
instead would change the logger identity that every existing function and
middleware sees, which breaks implementations that compare or wrap
`services.logger`, and would make user code depend on an optional method.

**What this rules out:** "unifying" the two by overwriting `services.logger` with
`scopedLogger` before the handler runs, and equally the reverse cleanup of
dropping `scopedLogger` and logging runner internals through the singleton —
that loses the request-id correlation on 404s and unhandled errors, which is the
only place the trace id is attached automatically.
