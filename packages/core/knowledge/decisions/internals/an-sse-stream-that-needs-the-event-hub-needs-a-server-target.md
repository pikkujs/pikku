---
type: decision
title: An SSE stream that needs the event hub needs a server target
description: Delivering a published event to an SSE stream needs the process holding the response to be reachable by the publisher, which Lambda, Cloudflare and Azure Functions do not offer at a sane cost, so such a route belongs on a server and elsewhere it runs as a plain stream
tags: [channels, sse, event-hub, lambda, cloudflare, azure, deploy]
---

# An SSE stream that needs the event hub needs a server target

An event hub delivers to an SSE stream by calling `send` on the response the
runner opened for it. That only works if the code publishing and the code
holding the response can reach each other: the same process, or a backplane
between processes. Bun, uWS and the Node servers satisfy it, and
`PgEventHubService` adds the backplane across instances.

Lambda, Cloudflare and Azure Functions do not. The invocation holding the stream
is one short-lived instance among many, and the publisher is a different
invocation with no reference to it. Holding the stream open is possible, but
Lambda bills wall-clock for every second a client stays connected and caps the
duration, and a Durable Object that holds the writer cannot hibernate. Reaching
the stream from outside would still need a backplane the held invocation polls or
subscribes to: a long-running relay built out of a runtime meant to avoid one.

So a route wired with `sse: true` that subscribes through the event hub belongs
on a server target. Nothing forces it there, because most apps deploy to
Cloudflare Workers by default and a route that streams only from its own function
is valid on one. On a serverless target it runs as a plain stream the function
writes to directly, with no hub and no Durable Object. The deployment manifest
marks every SSE route (`HttpRouteInfo.sse`), and the build warns for each one on a
serverless unit that a published event will not reach it and that it costs more
than a WebSocket. The mark is what lets the platform recommend a server target or
polling later, without the CLI deciding for the user. `LambdaEventHubService` and
`CloudflareEventHubService` accept the channel and log that warning rather than
refuse it, because a stream that only the function itself writes to is valid.
Azure Functions has no event hub at all.

Push on those platforms goes over WebSocket: API Gateway WebSocket on AWS and
hibernating Durable Object sockets on Cloudflare, where the platform holds the
connection and costs nothing while it is idle, and a managed service such as Web
PubSub or SignalR on Azure. API Gateway WebSocket speaks WebSocket only, so a
browser `EventSource` cannot connect to it.

The hub does no authorization. `subscribe` takes any topic string, so a route
that reads the topic from the query lets any caller listen to any other tenant's
events. The route derives the topic from the session, as in
`org:${session.orgId}:orders`.

**What this rules out:** serving a hub-subscribed SSE route from a serverless
target and expecting delivery, holding an invocation or Durable Object open to
relay published events into a response, and moving a route to a server target
without the user asking.
