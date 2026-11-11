---
type: decision
title: Scenario agent calls retry sign-in only on 401
description: HttpVirtualUser.sendAgent sends with whatever session the jar holds and signs in only after a 401, so a no-auth agent route never needs a sign-in; converse signs in eagerly instead
tags: services
---

# Scenario agent calls retry sign-in only on 401

`HttpVirtualUser.sendAgent` (`packages/core/src/wirings/virtual-user/http-virtual-users.ts`)
sends its request with whatever cookie the jar holds. Only a 401 triggers
`signOut()`, `login()` and a single retry. The agent calls that go through it
are the stream and approve paths and `postAgent`. Its sibling `invokeRaw` does
the opposite: it signs in eagerly before the first RPC.

`HttpVirtualUser.converse` does not rely on that path. Before its first turn it
calls `login()` when `signedIn` is false. The reason is in the code comment
there: a public agent route never returns 401, so the retry would never sign
the virtual user in, and a virtual user is a real account, so conversing as
nobody is not the intent. See
[a virtual user's converse signs in before its first turn](a-virtual-user-converse-signs-in-before-its-first-turn.md).

The 401 path exists because agent HTTP routes may be public; RPC routes are
assumed not to be. Making every agent call eager would mean a virtual user could
not reach a no-auth agent without a sign-in endpoint and credentials. Deferring
to the 401 keeps the authenticated case working (the retry succeeds with the
session attached) at the cost of one extra round trip the first time.

**What this rules out:** removing the 401 retry from `sendAgent` on the grounds
that a sign-in always happens first, and making `sendAgent` sign in up front
"like `invokeRaw` does" without first checking what the agent route requires.
