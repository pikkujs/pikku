---
"@pikku/core": patch
---

fix(core): compose repeated global middleware registrations instead of overwriting

`addHTTPMiddleware(pattern, …)` and `addTagMiddleware(tag, …)` stored the
middleware group with `groups[key] = middleware`, so a second registration for
the same pattern/tag silently replaced the first. With Better Auth, generated
`auth.gen.ts` registers `addHTTPMiddleware('*', [betterAuthSession()])`, which
clobbered an app's own `addHTTPMiddleware('*', [...])` global middleware (cors,
session, credential loading) and dropped it from every route.

Both now append to the existing group (matching `addGlobalMiddleware`, which
already appends), so generated auth middleware composes with user-registered
global middleware. The route meta lists each pattern once, so the combined
group is still applied a single time per request.
