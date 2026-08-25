---
'@pikku/skills': patch
---

Document machine authentication as middleware that sets a session. A caller with an identity (a sandbox, a deployed container, a machine host) is resolved once in `addHTTPMiddleware('*')`, which calls `setSession`; the function is then a plain `pikkuFunc` gated with `scopes` and reads `session`, rather than verifying the bearer token in its own body or in a `permissions` check that returns `true`.

The middleware skill also spells out why this cannot be `addTagMiddleware`: tag middleware runs inside `runPikkuFunc`, which the RPC dispatch calls without a `sessionService`, so a session set there never reaches a function invoked over `POST /rpc/:rpcName`.
