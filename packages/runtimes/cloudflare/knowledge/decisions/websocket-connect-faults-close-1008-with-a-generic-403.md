---
type: decision
title: A websocket connect that throws closes with 1008 and a generic 403, and the fault is logged
description: The hibernation websocket server treats any throw from channel connect as a denial to the client, logs the detail, and returns no error text
tags: [cloudflare, websocket, channels, errors]
---

# A websocket connect that throws closes with 1008 and a generic 403, and the fault is logged

In `packages/runtimes/cloudflare/src/cloudflare-hibernation-websocket-server.ts`, `fetch` accepts the socket with
`acceptWebSocket` (line 43) and then calls `runChannelConnect` (lines 44-52). Any throw is caught (line 53).

The comment at lines 54-60 says a connect-time throw is either a legitimate denial or a real fault, and that
discarding the error would turn "every fault into an opaque 403 with no trace". So the error is logged (lines 61-68),
with the route and the error stack or message.

The handler then calls `server.close(1008, 'Unauthorized')` (line 69) and returns `new Response('Forbidden', { status: 403 })`
(line 72). The comment at lines 70-71 says the body is generic "— the fault detail is logged above, not leaked to the
(possibly unauthenticated) handshake client."

**What this rules out:** a connect fault's message reaching the handshake client. The client sees 1008 or 403, and only the
server log says which.
