---
'@pikku/cli': patch
'@pikku/deploy': patch
---

Warn when an SSE route is deployed to a serverless target.

`HttpRouteInfo` in the deployment manifest now carries `sse: true` for a route wired with `sse: true`, so anything reading the manifest can tell which routes hold a connection open. The build logs a warning for each SSE route on a serverless unit: a published event cannot reach it and it costs more than a WebSocket. Nothing is forced to a server target; the route deploys where it was going to.
