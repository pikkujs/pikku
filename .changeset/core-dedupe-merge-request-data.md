---
'@pikku/core': patch
'@pikku/express-middleware': patch
'@pikku/fastify-plugin': patch
'@pikku/uws-handler': patch
---

`@pikku/core/http` exports `mergeRequestData(...parts)`, the params/query/body merge and conflict check every `PikkuHTTPRequest.data()` performs. The fetch request and the Express, Fastify and uWS adapters now all call it instead of carrying their own copy.

Behaviour change for the Express, Fastify and uWS adapters: a request whose params, query or body carries a `__proto__`, `constructor` or `prototype` key now has that key dropped, as the fetch adapter already did, instead of being rejected with a 422 "Conflicting values" error.

These adapters need an `@pikku/core` that exports `mergeRequestData`.
