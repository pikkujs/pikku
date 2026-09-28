---
'@pikku/cli': patch
---

Plan a route whose `func` is an inline expression. `wireHTTP({ func: agent('x') })`
has nothing the inspector can name, so it ids the wiring after its own route —
`http:post:/agents/shop`. The deploy analyzer read that prefix as "a scaffold
catch-all somebody else serves" and skipped every one of them, so the route
reached no unit, no diagnostic fired, and the stage 404'd it while every worker
reported healthy. Only a bridge onto a route a named function already owns (the
OPTIONS preflight beside `rpcCaller`'s `/rpc/:rpcName`) is skipped now.
