---
type: decision
title: A scenario step can name an identity no persona holds, through per-call headers
description: ScenarioInvokeOptions.headers lets a step send an impersonation or shim header on one call, and a virtual user never gets that option
tags: core, personas, scenario
---

# A scenario step can name an identity no persona holds, through per-call headers

`ScenarioInvokeOptions` in `packages/core/src/services/personas-service.ts` says
its headers are how "a step expresses an identity no declared persona can — an
impersonation header, or one of the header-shim principals a credential scenario
invents." `HttpPersona.invokeRaw` passes them to `postRpc`
(`packages/core/src/services/http-personas.ts`), so they go out on that one call
alongside the persona's session.

The option belongs to the scenario author, who writes the steps and is trusted to
say which identity a check needs. A virtual user does not get it. Its target in
`packages/core/src/wirings/virtual-user/virtual-user-target.ts` calls
`persona.invokeRaw(rpcName, args)` with no options, so an adversarial run cannot
add a header to reach an identity its persona does not hold.

**What this rules out:** giving a virtual user a per-call header, and removing the
option from scenario steps on the grounds that a declared persona should be the
only identity a step can use.
