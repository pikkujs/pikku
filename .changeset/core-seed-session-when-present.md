---
'@pikku/core': patch
---

fix(workflow): seed sessionService when session already present on wire

When a parent workflow propagates its session to a child workflow via
`wire.session`, `resolveSession` skipped `setInitial` because `!wire.session`
was false, so `sessionService.freezeInitial()` returned `undefined` and
immediately overwrote the propagated session. We now seed the sessionService
with the existing `wire.session` so `freezeInitial()` returns the correct
session for `pikkuFunc` steps inside child workflows.
