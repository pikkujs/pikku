---
'@pikku/cli': patch
---

Apply `globalHTTPPrefix` to the RPC and agent routes the deploy analyzer synthesizes.

Every `wireHTTP` route already carries the prefix — the generator bakes it in, so `rpcCaller` is wired at `<prefix>/rpc/:rpcName` and the generated client posts to `` `${globalHTTPPrefix}/rpc/${rpcName}` ``. The per-function routes `analyzeDeployment` builds did not: an exposed function's unit was published at `/rpc/getMe` regardless of the prefix.

On a deployed stage that made the whole exposed RPC surface unreachable. `<prefix>/rpc/getMe` — what every client sends — matched no function unit, so it fell through to the `rpcCaller` catch-all, which carries only its own implementation; and `/rpc/getMe`, where the unit actually sat, is outside the prefix the gateway serves the API under, so it reached the frontend instead. Projects without `globalHTTPPrefix` were unaffected, which is why this survived: the two paths are the same string when the prefix is empty.

Also applies to `/remote/rpc/<name>` and the four `/rpc/agent/<name>` routes.
