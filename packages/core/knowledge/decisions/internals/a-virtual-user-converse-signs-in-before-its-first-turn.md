---
type: decision
title: A virtual user's converse signs in before its first turn
description: HttpVirtualUser.converse calls login() before a run when it holds no session, because a public agent route never triggers the 401 retry that would sign the virtual user in
tags: services, virtual-users, agents
---

# A virtual user's converse signs in before its first turn

`HttpVirtualUser.converse` (`packages/core/src/wirings/virtual-user/http-virtual-users.ts`)
calls `this.login()` when `signedIn` is false, before it starts the run. Only
then does it send the agent request.

The code comment gives the reason. A public agent route never returns 401, so
the 401 retry in `sendAgent` never runs and would never sign the virtual user
in. An agent thread is also minted under a fresh anonymous id per request when
no one owns it, so turn one could succeed and turn two be refused as somebody
else's. A virtual user is a real account with real credentials, so conversing as
nobody is not the intent.

**What this rules out:** relying on the 401 retry for `converse`, and running a
virtual user's conversation unauthenticated when it was meant to sign in.
Compare [the 401-only retry](scenario-agent-calls-sign-in-on-401-only.md), which is
how the other agent calls behave.
