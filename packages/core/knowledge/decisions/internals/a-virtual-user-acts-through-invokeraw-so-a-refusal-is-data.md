---
type: decision
title: A virtual user acts through invokeRaw, so a refusal is data it can act on
description: virtualUserTarget calls virtualUser.invokeRaw, which signs the virtual user in when needed, retries once after a 401, and returns the status instead of throwing
tags: core, virtual-users
---

# A virtual user acts through invokeRaw, so a refusal is data it can act on

`virtualUserTarget` in `packages/core/src/wirings/virtual-user/virtual-user-target.ts`
is "the only place the engine meets the network" (`virtual-user-target.ts:14`). It
drives a signed-in virtual user. The doc comment says the virtual user keeps its
cookies, re-logs in when a session expires mid-run, and reports status as data
rather than throwing (`virtual-user-target.ts:14-17`).

The call goes through `virtualUser.invokeRaw(rpcName, args)` (`virtual-user-target.ts:27`).
The comment gives the reason: "to a virtual user a 403 is not an error, it is the
system saying no, which is information it should be allowed to act on"
(`virtual-user-target.ts:19-22`).

In `HttpVirtualUser.invokeRaw`, the virtual user signs in first if it is not signed
in (`packages/core/src/wirings/virtual-user/http-virtual-users.ts:117-119`). On a 401 it signs
in again and retries once (`http-virtual-users.ts:121-126`). The method returns the
response for every status.

The virtual user's target passes no per-call options, so it cannot add a header
(`virtual-user-target.ts:27`). That is covered in
[a scenario step can name an identity no virtual user holds, through per-call headers](../security/a-step-can-name-an-identity-no-virtual-user-holds-through-per-call-headers.md).

**What this rules out:** a virtual user calling `invoke`, which throws on error, and
a virtual user being given per-call headers. For why `invokeRaw` returns status rather
than throwing, see [in a scenario a 4xx is data, not an exception](in-a-scenario-a-4xx-is-data-not-an-exception.md).
