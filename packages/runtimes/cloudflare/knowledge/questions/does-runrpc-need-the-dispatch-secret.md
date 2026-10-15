---
type: question
title: Does runRpc need the dispatch secret?
description: The Cloudflare runRpc entrypoint invokes functions with no secret check, relying on the caller being a service binding
tags: [cloudflare, rpc, auth]
---

# Does runRpc need the dispatch secret?

`packages/runtimes/cloudflare/src/handler-factories.ts` defines `runRpc` on each of
its four worker classes: `PikkuHandler`, `PikkuWorker`, `PikkuCron` and `PikkuQueue`
(lines 356, 381, 405 and 434). The doc comment on the first
(lines 350-355) says it "bypasses HTTP routing and `expose:true` gating" and exists
for "service-binding / dispatch-namespace callers".

The body (lines 356-363) runs `setupServices` and then `rpc.invoke(name, args)`. It
does not call `isDispatchAuthorized`. In this file that check appears only at lines
193 and 261, on the two job routes.

So any caller that holds the worker's binding can invoke any function by name,
whatever its `expose` setting, and no shared secret is asked for. The code does not
say whether the binding is meant to be the whole guard.

Question: should `runRpc` also require the dispatch secret, or is the service binding
the intended boundary? Nothing in this package records which.
