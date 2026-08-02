---
type: decision
title: Gateway wiring is a meta-wiring over HTTP and channels
description: wireGateway writes handler implementations into the HTTP and channel state directly while the inspector compiles the corresponding meta, so runtime registration deliberately writes no meta
tags: gateway
---

# Gateway wiring is a meta-wiring over HTTP and channels

`wireGateway` in `packages/core/src/wirings/gateway/gateway-runner.ts` is not a
transport of its own. It composes the existing primitives: a `webhook` gateway
pushes entries straight into `pikkuState(null, 'http', 'routes')`, a `websocket`
gateway pushes into `pikkuState(null, 'channel', 'meta')` and `'channels'`, and a
`listener` gateway registers no route at all and is driven by a
`GatewayService` calling `createListenerMessageHandler`. Each mutation is
followed by `httpRouter.reset()` because the router caches its match table.

The wrapper functions and routes created here look like they are missing their
metadata. They are not: the inspector projects a `wireGateway` call into the
generated HTTP and function meta at build time, so only the handler
*implementations* register at runtime — the same split every other wire uses.
This is why `wireWebhookGateway` writes route entries but no `CommonWireMeta`,
and why the websocket path sets `channels.set(name, …)` with empty
`onConnect`/`onMessage` stubs while the real handlers live under the
`gateway__<name>__connect` / `__message` function ids named in the channel meta.

**What this rules out:** adding runtime meta generation inside `wireGateway` to
"fix" the apparently missing metadata — it would duplicate or conflict with the
compiled meta. It also rules out replacing the empty channel `onConnect` /
`onMessage` stubs with the real handler functions; the channel runner dispatches
through the meta's `pikkuFuncId`, not through those fields.
