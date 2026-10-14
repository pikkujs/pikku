---
type: decision
title: Webhook gateway wrappers are registered sessionless, and gateway auth is enforced inside the handler call
description: The inspector and the runtime both register a webhook gateway's POST and verify routes as sessionless with auth false, so the route never demands a session and the gateway's own auth flag is applied only when the handler runs
tags: inspector, gateway, webhook, auth, sessionless
---

# Webhook gateway wrappers are registered sessionless, and gateway auth is enforced inside the handler call

**Build time.** For a webhook gateway, `addGateway` writes two function metas, `gateway__<name>__post` and `gateway__<name>__verify`, and their HTTP routes (`packages/inspector/src/add/add-gateway.ts:105-109`). Each function meta is written with `sessionless: true` (`add-gateway.ts:117-122`). The comment on the wrapper says "no middleware here — the gateway POST wrapper runs it itself" (`add-gateway.ts:111`).

The gateway's own `auth` flag is not used there. It is recorded only on the gateway meta, as `auth` on `state.gateways.meta[name]` (`add-gateway.ts:135`).

**Run time.** `wireWebhookGateway` in `packages/core/src/wirings/gateway/gateway-runner.ts` mirrors this. The POST and verify handlers are both registered with `auth: false` (`gateway-runner.ts:117`, `:141`), and so are their routes (`gateway-runner.ts:130`, `:154`).

The POST wrapper, `createWebhookPostHandler` (`gateway-runner.ts:163`), does three things in order:

1. If the adapter has `verifyWebhook` and it verifies the request, it returns the adapter's response immediately (`gateway-runner.ts:175-179`). The handler is not reached.
2. It parses the body; an unparseable body returns `{ ok: true }` (`gateway-runner.ts:182-185`).
3. It invokes the handler through `runPikkuFunc('gateway', name, handlerFuncId, { ..., auth: config.auth, ... })` (`gateway-runner.ts:196-204`), with gateway middleware running first (`gateway-runner.ts:207-211`).

So the session check for a webhook is applied from `CoreGateway.auth`, inside the runner call at `gateway-runner.ts:201`. It is not applied on the HTTP route, which is `auth: false` and sessionless.

The synthetic handler registration that this call goes through, and how it inherits the wired function's metadata, is described in [Gateway handlers run through the function runner gate](../../../core/knowledge/decisions/security/gateway-handlers-run-through-the-function-runner-gate.md).

**What this rules out:** adding `auth: true` to the POST or verify route to "harden" a webhook. That would reject every platform call, which carries no user session. It also rules out assuming that the route-level metadata shows whether a gateway needs a session. Check `CoreGateway.auth` and the handler's own declaration instead.
