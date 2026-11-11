---
type: decision
title: A scenario step can name an identity no virtual user holds, through per-call headers
description: ScenarioInvokeOptions.headers lets a step send an impersonation or shim header on one call, and a virtual-user run never gets that option
tags: core, virtual-users, scenario
---

# A scenario step can name an identity no virtual user holds, through per-call headers

`ScenarioInvokeOptions` in `packages/core/src/services/virtual-users-service.ts` says
its headers are how "a step expresses an identity no declared virtual user can — an
impersonation header, or one of the header-shim principals a credential scenario
invents." `HttpVirtualUser.invokeRaw` passes them to `postRpc`
(`packages/core/src/wirings/virtual-user/http-virtual-users.ts`), so they go out on that one call
alongside the virtual user's session.

The option belongs to the scenario author, who writes the steps and is trusted to
say which identity a check needs. A virtual-user run does not get it. Its target in
`packages/core/src/wirings/virtual-user/virtual-user-target.ts` calls
`virtualUser.invokeRaw(rpcName, args)` with no options, so an adversarial run cannot
add a header to reach an identity its virtual user does not hold.

**What this rules out:** giving a virtual-user run a per-call header, and removing the
option from scenario steps on the grounds that a declared virtual user should be the
only identity a step can use.
