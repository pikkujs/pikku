---
'@pikku/core': patch
'@pikku/react': patch
'@pikku/cli': patch
---

Move first-party product analytics out of application code and into the framework.

`createAnalytics<Event>({ endpoint })` in `@pikku/react` is the buffered beacon client: it is typed against the app's own event union, flushes on an interval, on size and on `pagehide`/`visibilitychange` (via `sendBeacon`, so the abandon-point events survive unload), never surfaces a failure to the user and never retries. It also carries the delegated `data-analytics-click` listener, registered in the capture phase so a component calling `stopPropagation()` cannot silence instrumentation, and merging `data-analytics-meta` from ancestors with nearest-wins.

`analyticsOrigin()` in `@pikku/core/middleware` is the server-side origin lock for an unauthed ingest, and is re-exported from the generated `#pikku/middleware` leaf alongside `cors`. Unlike `cors()` — which only sets response headers a non-browser client ignores — it rejects with a 403 before the function body. Comparison is exact on the parsed origin, so `https://evil-myapp.com` cannot suffix-match `myapp.com`, and a missing `Origin` is rejected because a real browser always sets one on a cross-origin-capable POST. Allowed origins default to the request's own host and can be extended with a list or a resolver over services. `isAllowedOrigin` and `toOrigin` are exported for direct unit testing.

Together these let an app keep only its event registry and its wiring, instead of a few hundred lines of copied transport.
