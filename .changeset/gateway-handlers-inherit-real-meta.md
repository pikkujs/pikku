---
'@pikku/core': patch
---

Gateway handlers now run under the metadata their author actually wrote, instead
of a fabricated meta object.

`registerGatewayHandler` used to synthesize `{ sessionless: true,
inputSchemaName: null, outputSchemaName: null }` for every gateway handler, so a
function declared with `pikkuFunc` — which records "session required" in meta
rather than through an `auth` property — was silently made sessionless, and its
input schema was never validated. It now inherits `sessionless`, the schema
names, `scopes` and tag middleware from the function the gateway was wired with,
falling back to the old sessionless default only when nothing was declared (a
gateway wired by hand rather than through codegen).

Tag middleware also reaches gateways for the first time. `addTagMiddleware('x',
…)` combined with `wireGateway({ tags: ['x'] })` previously resolved to nothing
at all — the inspector computed the middleware and no runtime path read it — so
a tag that read like a gate applied none.

**Both are tightening changes.** A gateway whose handler declared a session
requirement, or whose tags name registered middleware, now enforces what it
already said it enforced.
