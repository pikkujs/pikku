---
type: decision
title: HTTP SSE streams flush headers only after middleware has run
description: SSE responses defer the header flush and register with the eventHub, at the cost of a stricter ordering the runner must preserve
tags: http
---

# HTTP SSE streams flush headers only after middleware has run

`executeRoute` in `packages/core/src/wirings/http/http-runner.ts` puts the
response into `'stream'` mode and sets the SSE content-type up front, but calls
`http.response.flushHeaders()` only after `runPikkuFunc` returns. Middleware runs
inside `runPikkuFunc`, and middleware is where CORS, auth and cookie headers are
set — flushing earlier would send the response head before those headers exist,
and they can never be added afterwards. `PikkuFetchHTTPResponse.createStream` in
`pikku-fetch-http-response.ts` enqueues a bare `:\n\n` comment frame on start for
the same reason on the client side: proxies and browsers do not surface the
stream until some body bytes arrive.

The SSE channel is also registered with `singletonServices.eventHub` when the
service exposes `onChannelOpened`, wrapped in a minimal object that satisfies
`PikkuChannelHandler`. That is what makes `eventHub.publish()` reach SSE
subscribers and not just WebSocket ones, and `channel.close` is rewrapped so the
eventHub is told about the close. On the delivery side,
`LocalEventHubService.publish` treats a throwing `channel.send` as a disconnect
and calls `onChannelClosed` — an SSE `ReadableStream` controller that the browser
has already abandoned throws rather than reporting closure.

**What this rules out:** hoisting `flushHeaders()` next to the other SSE header
calls; dropping the `:\n\n` priming frame as dead output; treating the eventHub
registration as WebSocket-only bookkeeping; and letting `publish` propagate a
send error instead of unregistering the channel.
