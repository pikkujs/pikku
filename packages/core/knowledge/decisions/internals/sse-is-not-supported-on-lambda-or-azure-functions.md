---
type: decision
title: SSE is not supported on Lambda or Azure Functions
description: An SSE stream needs the process that holds the response to be reachable by whoever publishes, which neither serverless runtime provides at a sane cost, so the Lambda hub refuses SSE channels and Azure has no hub
tags: [channels, sse, event-hub, lambda, azure]
---

# SSE is not supported on Lambda or Azure Functions

An event hub delivers to an SSE stream by calling `send` on the response the
runner opened for it. That only works if the code publishing and the code
holding the response can reach each other: the same process, or a backplane
between processes. Bun, uWS and the Node servers satisfy it, and
`PgEventHubService` adds the backplane across instances.

Lambda and Azure Functions do not. The invocation holding the stream is one
short-lived instance among many, and the publisher is a different invocation
that has no reference to it. Holding the stream open is possible, through Lambda
response streaming or a Function URL, but it bills wall-clock for every second a
client stays connected, hits a hard duration cap, and still needs a backplane the
held invocation polls or subscribes to. That is a long-running relay built out of
a runtime meant to avoid one.

So `LambdaEventHubService.onChannelOpened` throws rather than accept a channel it
can never deliver to, and Azure Functions has no event hub at all. A stream that
opens and never receives is indistinguishable, from the browser, from a working
one, which is the failure this refusal exists to prevent.

Push on these platforms goes over WebSocket: API Gateway WebSocket on AWS, where
the platform holds the connection and `postToConnection` delivers to it, and a
managed service such as Web PubSub or SignalR on Azure. API Gateway WebSocket
speaks WebSocket only, so a browser `EventSource` cannot connect to it.

**What this rules out:** serving an SSE route from `LambdaEventHubService`, and
holding a Lambda or Function invocation open to relay published events into a
response.
