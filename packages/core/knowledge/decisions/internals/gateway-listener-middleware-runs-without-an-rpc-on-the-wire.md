---
type: decision
title: Gateway middleware sees wire.rpc on webhook and websocket, but not on listener
description: The listener transport invokes its handler directly, so middleware runs outside any runPikkuFunc call and the lazily-attached rpc is absent
tags: core, gateway
---

# Gateway middleware sees `wire.rpc` on webhook and websocket, but not on listener

`runPikkuFunc` in `packages/core/src/function/function-runner.ts` attaches `rpc`
to the invocation wire with `Object.defineProperty`, as a lazy getter that
replaces itself on first read — and restores the previous descriptor in its
`finally`. `rpc` therefore exists on a wire *only for the duration of a function
invocation*. That is why `PikkuRawWire` is `Omit<PikkuWire, 'rpc'>`: it is the
wire as a runner constructs it, before the function runner adds `rpc`.

The three gateway transports reach middleware differently:

- **webhook** and **websocket** register their handlers with `addFunction`, so
  the handler body already runs inside a `runPikkuFunc` invocation. The `wire`
  it receives is a full `PikkuWire`, and `config.middleware` runs inside that
  same invocation — `wire.rpc` is live.
- **listener** has no such wrapper. `createListenerMessageHandler` is handed
  straight to `adapter.init()` by the `GatewayService`, builds
  `const wire: PikkuRawWire = {}` itself, and runs `config.middleware` *before*
  `invoke()` reaches `runPikkuFunc`. There is no invocation in progress, so
  `wire.rpc` is `undefined`.

A gateway middleware that calls `wire.rpc.invoke(...)` therefore works on two
transports and throws on the third, with nothing in the types to say so — the
call into `runMiddleware` needs an assertion, because `runMiddleware` is typed
off `CorePikkuMiddleware`, whose wire parameter is `PikkuWire`.

**What this rules out:** treating the assertion at that call as noise to be
deleted. It is naming a real gap. It also rules out "just widen
`CorePikkuMiddleware` to accept `PikkuRawWire`" as a free fix — that would make
`rpc` optional for *every* middleware in the framework, pushing the problem onto
every consumer to satisfy one transport.

**Still open:** whether the listener path should wrap its handler in a
`runPikkuFunc` invocation the way the other two do, which would make the three
transports behave identically and remove the assertion. Nobody has argued
against it; it simply has not been done.
