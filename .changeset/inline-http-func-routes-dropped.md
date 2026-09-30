---
'@pikku/cli': patch
---

Fail the deploy build when a declared HTTP route reached no unit, and stop
dropping the three kinds that did.

Units are built by walking functions and asking which routes point at each one,
so a route nothing claims produces no handler and no error. It is simply not
deployed: the stage 404s it while every worker reports active. `unroutedHttpWirings`
now checks the finished manifest against the HTTP meta and fails the build with
the offending routes, however one comes to be dropped.

Three were being dropped. A wiring with an inline `func` (`wireHTTP({ func:
agent('x') })`) has nothing the inspector can name, so it is id'd after its own
route — `http:post:/agents/shop` — and the analyzer read that prefix as "a
scaffold catch-all somebody else serves"; the five `*Caller` name checks beside
it already cover the real ones. A route onto an addon function via `ref('ns:fn')`
carries the addon's id, which is absent from the app's function meta, so the
addon unit now picks up app-declared routes onto its functions — including
functions it does not expose over RPC, since the wired route is the exposure. And
a synthetic bridge onto a route a named function owns (the OPTIONS preflight
beside `rpcCaller`'s `/rpc/:rpcName`) now rides that function's unit instead of
being skipped into nothing.
