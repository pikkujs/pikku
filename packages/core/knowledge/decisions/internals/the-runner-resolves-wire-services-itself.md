---
type: decision
title: The function runner resolves wire services itself
description: A function's wire services come from its own package's factory or the app's registered one, never borrowed from whoever called it
tags: core
---

# The function runner resolves wire services itself

`runPikkuFunc` picks the wire-services factory for the function it is about to
run: the function's addon package factory if it has one, else a factory the
transport passed explicitly, else the app's registered one
(`getCreateWireServices()`). A caller that passes nothing still gets the
function its wire services.

Before this, only the transports passed a factory. `rpc.invoke`, `rpc.exposed`,
gateway handlers and webhook sources passed none, so an app function reached
through them ran on whatever services its caller had already merged. That held
until `singletonServicesOnly` let a caller skip building wire services: the
generated `rpcCaller` behind `/rpc/:rpcName` reads no service, was marked, and
every app function behind it lost `events` and every other wire service. Nested
RPC therefore gets `resolvedSingletonServices`, not the caller's merged set.

Channels are the one caller that legitimately shares wire services: they build
one set per connection. They hand it over as `wireServices`, which the runner
uses as-is and does not close, because the connection owns its lifetime.

**What this rules out:** passing a caller's merged services down as
`singletonServices` to carry wire services into a nested call, and deciding in
one function's meta whether a different function gets wire services.
`singletonServicesOnly` only ever describes the function it is set on.
