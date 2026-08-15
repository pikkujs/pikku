---
'@pikku/core': patch
---

Route app bootstrap through `@pikku/core/ecosystem/*`

A `start.ts` that calls `fetch`, `runQueueJob` or `runScheduledTask` is not
writing application logic — it is standing in for a runtime adapter, wiring a
request source to the dispatcher. That is the ecosystem tier, so it takes the
ecosystem door, and the raw subpaths it used to reach for are scheduled for
deletion.

`runCLICommand` and `pikkuServerLifecycle` join the facades for their wire;
everything else the templates, verifiers and e2e project needed was already
there. A new check in `ecosystem-surface.test.ts` keeps app bootstrap from
drifting back onto the raw subpaths.
