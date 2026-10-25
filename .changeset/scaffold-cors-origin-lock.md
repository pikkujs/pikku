---
'@pikku/cli': patch
---

A `scaffold` flag may now be an object of options instead of `true` (`true` still means every default). New `scaffold.cors` generates the `CORS_ORIGINS` variable, an `allowedOrigins(variables)` helper (the list, else `localhost` and `127.0.0.1` on the primary frontend's dev port, or `scaffold.cors.port`) and a `*` CORS middleware, all read through the `variables` service so they work on Workers. They are written to `<pikkuDir>/cors/cors-origins.gen.ts` and `cors.gen.ts`, split because a schema file may not also wire (PKU490). There is no `FRONTEND_URL` variable.

`scaffold.analytics` gains `originLock` (default `true`): `<pikkuDir>/analytics/analytics-origin.gen.ts` attaches core's `requireOrigin` to `/analytics`, checked against the same `allowedOrigins`, so a missing or foreign `Origin` gets a 403 inside the CORS headers. The lock needs the shared helper, so `cors-origins.gen.ts` is generated for it even without `scaffold.cors`; the CORS middleware itself still needs `scaffold.cors`. Set `{ "analytics": { "originLock": false } }` for an app with native clients, which send no `Origin`.

An existing `scaffold.analytics: true` now gets the lock and the `CORS_ORIGINS` variable. A project that declares `CORS_ORIGINS` itself should delete that declaration or set `originLock: false`.
